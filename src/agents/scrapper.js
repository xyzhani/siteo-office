// Scrapper (inbox): reads a reply and decides what it means: interested, question, not interested, unsubscribe.
import { loadAgentInstructions } from "../config.js";
import * as llm from "../providers/llm/index.js";

export function ruleIntent(text) {
  const t = String(text || "").toLowerCase();
  if (/\bunsubscribe\b|stop emailing|remove me|do not contact|don't contact/.test(t)) return "unsubscribe";
  if (/\b(no thanks|not interested|no thank you|we're fine|we are fine|not now|no$)\b/.test(t)) return "not_interested";
  if (/\b(yes|i want it|interested|let's do it|lets do it|sounds good|go ahead|i'd like|we'd like|sign me up|love it|deal)\b/.test(t)) return "interested";
  if (/\?|how much|price|cost|when|what|can you|could you/.test(t)) return "question";
  return "question";
}

export async function read(run, lead, text) {
  let intent = ruleIntent(text), summary = "";
  if (llm.available()) {
    try {
      const r = await llm.json(run, { system: loadAgentInstructions("inbox"), prompt: `We emailed ${lead.name} a free concept website and offered to build it. Their reply:\n"""\n${String(text).slice(0, 4000)}\n"""\nReturn {"intent": "interested" | "question" | "not_interested" | "unsubscribe", "summary": one short sentence}.`, maxTokens: 300 });
      if (["interested", "question", "not_interested", "unsubscribe"].includes(r.intent)) intent = r.intent;
      summary = String(r.summary || "");
    } catch (e) { if (e instanceof llm.CostCapError) throw e; }
  }
  return { intent, summary: summary || { interested: "They want the website.", question: "They asked a question.", not_interested: "Not interested.", unsubscribe: "Asked not to be contacted." }[intent] };
}
