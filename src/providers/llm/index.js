// LLM adapter + the per-run AI cost cap (MAX_AI_USD_PER_RUN).
// To add a provider: create providers/llm/<name>.js exporting { name, ready(), complete() } and register it below.
import { settings, demoMode } from "../../config.js";
import { save } from "../../store.js";
import * as claude from "./claude.js";

const PROVIDERS = { claude };
const provider = PROVIDERS[settings.llm.provider] || claude;

export class CostCapError extends Error {}
export const available = () => !demoMode && provider.ready();

function charge(run, usage) {
  const usd = (usage.input * settings.llm.usdPerMTokIn + usage.output * settings.llm.usdPerMTokOut) / 1e6;
  if (run) {
    run.cost_usd = +((run.cost_usd || 0) + usd).toFixed(5);
    run.tokens = { in: (run.tokens?.in || 0) + usage.input, out: (run.tokens?.out || 0) + usage.output };
    save();
  }
  return usd;
}
function guard(run) {
  if (run && (run.cost_usd || 0) >= settings.llm.maxUsdPerRun) throw new CostCapError(`AI cost cap reached ($${settings.llm.maxUsdPerRun} per run). Raise MAX_AI_USD_PER_RUN to continue.`);
}

// Plain completion → text
export async function text(run, { system, prompt, maxTokens }) {
  guard(run);
  const r = await provider.complete({ system, messages: [{ role: "user", content: prompt }], maxTokens });
  charge(run, r.usage);
  return r.text;
}

// Completion that must return a JSON object
export async function json(run, { system, prompt, maxTokens = 1800 }) {
  const t = await text(run, { system: system + "\n\nReply with ONE valid JSON object only. No prose, no code fences.", prompt, maxTokens });
  const s = t.indexOf("{"), e = t.lastIndexOf("}");
  if (s < 0 || e < s) throw new Error("AI did not return JSON");
  return JSON.parse(t.slice(s, e + 1));
}

// A small tool-use loop: the model calls tools, we run them, until it stops (max 6 turns).
export async function agent(run, { system, prompt, tools, handlers, maxTurns = 6 }) {
  const messages = [{ role: "user", content: prompt }];
  const calls = [];
  for (let turn = 0; turn < maxTurns; turn++) {
    guard(run);
    const r = await provider.complete({ system, messages, tools, maxTokens: 1200 });
    charge(run, r.usage);
    messages.push({ role: "assistant", content: r.content });
    const uses = r.content.filter((c) => c.type === "tool_use");
    if (!uses.length || r.stopReason !== "tool_use") return { text: r.text, calls };
    const results = [];
    for (const u of uses) {
      let out, isError = false;
      try {
        if (!handlers[u.name]) throw new Error("Unknown tool " + u.name);
        out = await handlers[u.name](u.input || {});
      } catch (e) { out = { error: e.message }; isError = true; }
      calls.push({ tool: u.name, input: u.input, output: out });
      results.push({ type: "tool_result", tool_use_id: u.id, content: JSON.stringify(out).slice(0, 4000), is_error: isError });
    }
    messages.push({ role: "user", content: results });
  }
  return { text: "", calls };
}
