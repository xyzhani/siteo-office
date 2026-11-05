// Shared email writing for Nemo, Scrapper and Fluffy: emails.md gives the tone and a fallback template
// per email type; with an AI key the agent writes a fresh version in that tone, using only the given facts.
import { loadAgentInstructions, loadStudio } from "../config.js";
import { parseSections, fill } from "../util.js";
import * as llm from "../providers/llm/index.js";

export function studioVars(lead, extra = {}) {
  const s = loadStudio();
  const sym = { USD: "$", EUR: "€", GBP: "£" }[s.currency] || s.currency + " ";
  const fmt = (n) => sym + Number(n).toFixed(Number(n) % 1 ? 2 : 0);
  return {
    business: lead.name, owner_or_team: lead.facts?.owner || `the ${lead.name} team`, studio: s.name, sender: s.sender?.name || s.name, signature: s.sender?.signature || s.name,
    website: s.website || "", price: fmt(s.conceptPrice), deposit: fmt((s.conceptPrice * s.depositPercent) / 100), balance: fmt(s.conceptPrice - (s.conceptPrice * s.depositPercent) / 100),
    deposit_percent: s.depositPercent + "%", currency: s.currency, ...extra,
  };
}

export function unsubscribeLine(lead) {
  const s = loadStudio();
  return s.safety.unsubscribeLine ? `\n\n—\n${s.sender?.address ? s.sender.address + "\n" : ""}Not interested? Reply "unsubscribe" and we won't email you again.` : "";
}

export async function write(run, { role, kind, niche, lead, vars, context = "" }) {
  const sections = parseSections(niche.emails);
  const tone = sections["tone"] || "";
  const tpl = sections[kind] || "";
  const [subjLine, ...bodyLines] = fill(tpl, vars).split("\n");
  let subject = subjLine.replace(/^subject:\s*/i, "").trim(), body = bodyLines.join("\n").trim();
  if (llm.available()) {
    try {
      const r = await llm.json(run, {
        system: `${loadAgentInstructions(role)}\n\nTone guide:\n${tone}`,
        prompt: `Write the "${kind}" email.\nExample to follow closely (same facts, links and length):\nSubject: ${subject}\n${body}\n\nFacts you may use:\n${JSON.stringify(vars, null, 2)}\n${context}\n\nKeep every link exactly as given. No claims beyond the facts. Return {"subject": string, "body": string (plain text, no signature line beyond the given signature)}.`,
        maxTokens: 900,
      });
      if (r.subject && r.body) { subject = String(r.subject); body = String(r.body); for (const k of ["concept_url", "checkout_url", "invoice_url"]) if (vars[k] && !body.includes(vars[k])) body += `\n\n${vars[k]}`; }
    } catch (e) { if (e instanceof llm.CostCapError) throw e; }
  }
  return { subject, body: body + unsubscribeLine(lead) };
}
