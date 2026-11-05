// LLM adapter, the per-run AI cost cap (MAX_AI_USD_PER_RUN), and demo record/replay.
//
// Modes:
//   live    an AI key + model are set and we're not in demo mode: real calls
//   record  RECORD_DEMO=true (npm run record-demo): real calls on the fictional demo businesses, outputs saved
//           to demo/recorded/<niche>.json
//   replay  demo mode with a recording: the recorded real AI outputs are replayed ($0, no key needed)
//   rules   demo mode without a recording: every agent uses its rule-based path
//
// Each call site passes a stable `key` (agent + business + round), so a replay returns exactly what the real
// agent said for that step. A key that isn't in the recording falls back to the agent's rule-based path.
// To add a provider: create providers/llm/<name>.js exporting { name, ready(), complete() } and register it below.
import fs from "node:fs";
import path from "node:path";
import { settings, demoMode, ROOT } from "../../config.js";
import { save, db } from "../../store.js";
import { sleep } from "../../util.js";
import * as claude from "./claude.js";
import * as fake from "./fake.js";

const PROVIDERS = { claude, fake };
const provider = PROVIDERS[settings.llm.provider] || claude;
const REC_DIR = process.env.DEMO_RECORDING_DIR ? path.resolve(process.env.DEMO_RECORDING_DIR) : path.join(ROOT, "demo", "recorded");

export const mode = /^(1|true|yes)$/i.test(process.env.RECORD_DEMO || "") && provider.ready() ? "record"
  : !demoMode && provider.ready() ? "live"
  : demoMode && hasRecordings() ? "replay" : "rules";

function hasRecordings() { try { return fs.readdirSync(REC_DIR).some((f) => f.endsWith(".json")); } catch { return false; } }
const recordings = {};
function rec(niche) {
  if (!recordings[niche]) { try { recordings[niche] = JSON.parse(fs.readFileSync(path.join(REC_DIR, niche + ".json"), "utf8")); } catch { recordings[niche] = { recordedAt: null, calls: {} }; } }
  return recordings[niche];
}
function store(key, value, usage) {
  const niche = key.split("/")[0], r = rec(niche);
  r.calls[key] = value; r.recordedAt = new Date().toISOString();
  if (usage) (r.usage ||= {})[key] = usage;
  fs.mkdirSync(REC_DIR, { recursive: true });
  fs.writeFileSync(path.join(REC_DIR, niche + ".json"), JSON.stringify(r, null, 1));
}
const recorded = (key) => (key ? rec(key.split("/")[0]).calls[key] : undefined);
export function recordingInfo() {
  if (mode !== "replay") return null;
  try { const files = fs.readdirSync(REC_DIR).filter((f) => f.endsWith(".json")); const r = rec(files[0].replace(/\.json$/, "")); return { niches: files.map((f) => f.replace(/\.json$/, "")), recordedAt: r.recordedAt, calls: Object.keys(r.calls).length }; } catch { return null; }
}

export class CostCapError extends Error {}
// Is AI available for this step? (in replay: only if the recording has this exact step)
export const available = (key) => mode === "live" || mode === "record" || (mode === "replay" && recorded(key) !== undefined);

// key "<niche>/<agent>/…" → the cat's role id, for the Salary page
const ROLE_OF = { tom: "auditor", knight: "developer", snowbell: "checker", sherlock: "seo", sender: "sender", inbox: "inbox", scrapper: "inbox", followup: "followup", fluffy: "followup" };
function paySalary(key, usage, replayed) {
  const role = ROLE_OF[String(key || "").split("/")[1]] || "other";
  const usd = (usage.input * settings.llm.usdPerMTokIn + usage.output * settings.llm.usdPerMTokOut) / 1e6;
  const s = ((db.salary ||= {})[role] ||= { calls: 0, in: 0, out: 0, usd: 0, replayedCalls: 0, replayedUsd: 0 });
  if (replayed) { s.replayedCalls++; s.replayedUsd = +(s.replayedUsd + usd).toFixed(5); s.replayedIn = (s.replayedIn || 0) + usage.input; s.replayedOut = (s.replayedOut || 0) + usage.output; }
  else { s.calls++; s.in += usage.input; s.out += usage.output; s.usd = +(s.usd + usd).toFixed(5); }
  save();
}
function charge(run, usage, key) {
  paySalary(key, usage, false);
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
async function replayed(key) {
  await sleep(Math.min(1500, settings.pacing.stepMs * 0.5));
  const u = rec(key.split("/")[0]).usage?.[key]; if (u) paySalary(key, u, true); // what the real call cost when recorded (not spent now)
  return structuredClone(recorded(key));
}

// Plain completion → text
export async function text(run, { key, system, prompt, maxTokens }) {
  if (mode === "replay") return replayed(key);
  guard(run);
  const r = await provider.complete({ system, messages: [{ role: "user", content: prompt }], maxTokens });
  charge(run, r.usage, key);
  if (mode === "record" && key) store(key, r.text, r.usage);
  return r.text;
}

// Completion that must return a JSON object. `scrub` lets the caller replace run-specific values (links) with
// placeholders before recording; `unscrub` puts the current values back on replay.
export async function json(run, { key, system, prompt, maxTokens = 1800, scrub, unscrub }) {
  if (mode === "replay") { const v = await replayed(key); return unscrub ? unscrub(v) : v; }
  guard(run);
  const r = await provider.complete({ system: system + "\n\nReply with ONE valid JSON object only. No prose, no code fences.", messages: [{ role: "user", content: prompt }], maxTokens });
  charge(run, r.usage, key);
  const t = r.text, s = t.indexOf("{"), e = t.lastIndexOf("}");
  if (s < 0 || e < s) throw new Error("AI did not return JSON");
  const out = JSON.parse(t.slice(s, e + 1));
  if (mode === "record" && key) store(key, scrub ? scrub(structuredClone(out)) : out, r.usage);
  return out;
}

const ID_RE = /\b(INV2-[A-Z0-9-]+|SIM-INV-[A-Z0-9]+)\b/g;
// A small tool-use loop: the model calls tools, we run them, until it stops (max 6 turns).
// Replay re-runs the recorded tool calls (same tools, same inputs) against today's handlers.
export async function agent(run, { key, system, prompt, tools, handlers, maxTurns = 6 }) {
  const calls = [];
  if (mode === "replay") {
    const rc = await replayed(key), ids = {};
    for (const c of rc.calls) {
      const input = JSON.parse(JSON.stringify(c.input).replace(/\{\{id(\d+)\}\}/g, (_, n) => ids[n] ?? ""));
      let out; try { out = await handlers[c.tool](input); } catch (e) { out = { error: e.message }; }
      for (const m of JSON.stringify(out).matchAll(ID_RE)) if (!Object.values(ids).includes(m[1])) ids[Object.keys(ids).length] = m[1];
      calls.push({ tool: c.tool, input, output: out });
      await sleep(400);
    }
    return { text: rc.text, calls, replayed: true };
  }
  const messages = [{ role: "user", content: prompt }];
  let finalText = "";
  const total = { input: 0, output: 0 };
  for (let turn = 0; turn < maxTurns; turn++) {
    guard(run);
    const r = await provider.complete({ system, messages, tools, maxTokens: 1200 });
    charge(run, r.usage, key);
    total.input += r.usage.input; total.output += r.usage.output;
    messages.push({ role: "assistant", content: r.content });
    const uses = r.content.filter((c) => c.type === "tool_use");
    finalText = r.text;
    if (!uses.length || r.stopReason !== "tool_use") break;
    const results = [];
    for (const u of uses) {
      let out, isError = false;
      try {
        if (!handlers[u.name]) throw new Error("Unknown tool " + u.name);
        out = await handlers[u.name](u.input || {});
      } catch (e) { out = { error: e.message }; isError = true; }
      calls.push({ tool: u.name, input: u.input, output: out });
      results.push({ type: "tool_result", tool_use_id: u.id, content: (typeof out === "string" ? out : JSON.stringify(out)).slice(0, 4000), is_error: isError });
    }
    messages.push({ role: "user", content: results });
  }
  if (mode === "record" && key) {
    // store tool calls with run-specific invoice ids replaced by {{idN}} placeholders
    const ids = [];
    const rcalls = calls.map((c) => {
      const input = JSON.parse(JSON.stringify(c.input || {}).replace(ID_RE, (m) => { const i = ids.indexOf(m); return `{{id${i < 0 ? ids.push(m) - 1 : i}}}`; }));
      for (const m of JSON.stringify(c.output ?? "").matchAll(ID_RE)) if (!ids.includes(m[1])) ids.push(m[1]);
      return { tool: c.tool, input };
    });
    store(key, { text: finalText, calls: rcalls }, total);
  }
  return { text: finalText, calls };
}
