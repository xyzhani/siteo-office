// Snow Bell (fact checker): checks every line of Knight's copy against Tom's facts and the niche rules.
// Returns issues; the pipeline sends the draft back to Knight (max 3 rounds, then it's set aside).
import { loadAgentInstructions } from "../config.js";
import { parseRules } from "../util.js";
import * as llm from "../providers/llm/index.js";

export function copyLines(copy) {
  return [
    ["headline", copy.headline], ["subheadline", copy.subheadline],
    ...String(copy.about || "").split(/(?<=[.!?])\s+/).map((s) => ["about", s]),
    ...(copy.services || []).flatMap((s) => [["service", s.name], ["service", s.description]]),
    ["cta", copy.cta],
  ].filter(([, t]) => t && String(t).trim());
}

const norm = (s) => String(s).toLowerCase().replace(/[^\p{L}\p{N}@+.]+/gu, " ").trim();

// Deterministic checks: forbidden phrases, and any number / email / URL that isn't in the facts.
export function ruleCheck(copy, facts, rules) {
  const { forbidden } = parseRules(rules);
  const factText = norm(JSON.stringify(facts));
  const factDigits = JSON.stringify(facts).replace(/\D/g, " ") + " " + Object.values(facts || {}).flat().map((v) => String(v).replace(/\D/g, "")).join(" ");
  const issues = [];
  for (const [field, line] of copyLines(copy)) {
    const l = String(line).toLowerCase();
    const hit = forbidden.find((p) => new RegExp(`(?<![\\p{L}\\p{N}])${p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}\\p{N}])`, "iu").test(l));
    if (hit) { issues.push({ field, line, problem: `Uses "${hit}", which the niche rules forbid (unprovable claim)` }); continue; }
    for (const n of String(line).match(/\d[\d.,:]*/g) || []) {
      const digits = n.replace(/\D/g, "");
      if (digits && !factDigits.includes(digits)) { issues.push({ field, line, problem: `The number "${n}" is not in the facts` }); break; }
    }
    for (const e of String(line).match(/[\w.+-]+@[\w-]+\.[\w.-]+|https?:\/\/\S+/g) || []) if (!factText.includes(norm(e))) issues.push({ field, line, problem: `"${e}" is not in the facts` });
  }
  return issues;
}

async function aiCheck(run, copy, facts, rules, key) {
  const sys = `${loadAgentInstructions("checker")}\n\nNiche rules:\n${rules}`;
  const lines = copyLines(copy).map(([f, t], i) => `${i + 1}. [${f}] ${t}`).join("\n");
  const r = await llm.json(run, { key, system: sys, prompt: `FACTS:\n${JSON.stringify(facts, null, 2)}\n\nCOPY LINES:\n${lines}\n\nReturn {"issues": [{"line": "<exact line text>", "problem": "<why it is not supported by the facts or breaks a rule>"}]}. Return an empty list if every line is supported.`, maxTokens: 1000 });
  return (r.issues || []).filter((i) => i && i.line).map((i) => ({ field: "ai", line: String(i.line).replace(/^\d+\.\s*\[\w+\]\s*/, ""), problem: String(i.problem || "Not supported by the facts") }));
}

export async function check(run, niche, lead, copy, round = 1) {
  const issues = ruleCheck(copy, lead.facts, niche.rules);
  const key = `${lead.niche}/snowbell/${lead.slug || lead.id}/${round}`;
  if (llm.available(key)) {
    try { for (const i of await aiCheck(run, copy, lead.facts, niche.rules, key)) if (!issues.some((x) => x.line === i.line)) issues.push(i); }
    catch (e) { if (e instanceof llm.CostCapError) throw e; }
  }
  return { pass: issues.length === 0, issues };
}
