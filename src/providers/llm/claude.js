// Claude via the Anthropic Messages API (plain fetch, no SDK). The model name comes from CLAUDE_MODEL.
import { settings } from "../../config.js";

export const name = "claude";
export function ready() { return !!(settings.llm.anthropicKey && settings.llm.model); }

export async function complete({ system, messages, maxTokens = 1500, tools, temperature = 0.3 }) {
  if (!settings.llm.model) throw new Error("Set CLAUDE_MODEL in .env (see .env.example)");
  const body = { model: settings.llm.model, max_tokens: maxTokens, system, messages, temperature };
  if (tools?.length) body.tools = tools;
  let res, lastErr;
  for (let attempt = 0; attempt < 3; attempt++) {
    res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": settings.llm.anthropicKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120000),
    });
    if (res.ok) break;
    lastErr = `${res.status} ${(await res.text()).slice(0, 300)}`;
    if (![429, 500, 502, 503, 529].includes(res.status)) break;
    await new Promise((r) => setTimeout(r, 1500 * (attempt + 1) ** 2));
  }
  if (!res.ok) throw new Error("Claude API error: " + lastErr);
  const data = await res.json();
  return {
    content: data.content || [],
    text: (data.content || []).filter((c) => c.type === "text").map((c) => c.text).join("\n"),
    stopReason: data.stop_reason,
    usage: { input: data.usage?.input_tokens ?? 0, output: data.usage?.output_tokens ?? 0 },
  };
}
