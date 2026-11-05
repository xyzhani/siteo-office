// Knight (developer): writes the concept's copy ONLY from Tom's facts, then fills the niche template.
import { loadAgentInstructions, loadStudio } from "../config.js";
import { render } from "../util.js";
import * as llm from "../providers/llm/index.js";

const list = (v) => (Array.isArray(v) ? v.filter(Boolean).map(String) : v ? [String(v)] : []);

// Rule-based copy (demo + fallback): every sentence is built from facts, nothing added.
export function ruleCopy(facts, niche, { slip = false } = {}) {
  const services = list(facts.services);
  const town = facts.town || (facts.address || "").split(",").pop()?.trim() || "";
  const about = [
    `${facts.owner ? facts.owner + " and the team" : "The team"} at ${facts.name}${facts.since ? `, open since ${facts.since}` : ""}.`,
    facts.address ? `Find us at ${facts.address}.` : "",
    ...list(facts.extras),
  ].filter(Boolean);
  // demo only: a typical AI slip (an unprovable claim) so you can watch Snow Bell send the draft back
  if (slip) about.push(niche.search.demoSlip || `Rated the best in ${town || "town"}, with 5-star reviews from every customer.`);
  return {
    headline: facts.name,
    subheadline: services.length ? `${services.slice(0, 2).join(" · ")}${town ? " in " + town : ""}` : town ? `In ${town}` : "",
    about: about.join(" "),
    services: services.map((s) => ({ name: s, description: "" })),
    cta: niche.search.cta || "Get in touch",
  };
}

async function aiCopy(run, facts, niche, previous, issues, key) {
  const sys = `${loadAgentInstructions("developer")}\n\nNiche rules (never break these):\n${niche.rules}`;
  const prompt = `FACTS (the only source of truth):\n${JSON.stringify(facts, null, 2)}\n\n` +
    (previous ? `YOUR PREVIOUS DRAFT:\n${JSON.stringify(previous, null, 2)}\n\nSNOW BELL SENT IT BACK FOR THESE ISSUES (fix every one, change nothing else):\n${issues.map((i) => `- "${i.line}": ${i.problem}`).join("\n")}\n\n` : "") +
    `Return {"headline": string, "subheadline": string, "about": string (2-4 short sentences), "services": [{"name": string, "description": string}], "cta": string}.\n` +
    `Use only the facts above. If a fact is missing, leave it out; do not fill gaps. No prices, numbers, awards, reviews or promises unless they are in the facts. Call to action suggestion: "${niche.search.cta || "Get in touch"}".`;
  const c = await llm.json(run, { key, system: sys, prompt, maxTokens: 1400 });
  return { headline: String(c.headline || facts.name), subheadline: String(c.subheadline || ""), about: String(c.about || ""), services: (c.services || []).slice(0, 8).map((s) => ({ name: String(s.name || s), description: String(s.description || "") })), cta: String(c.cta || niche.search.cta || "Get in touch") };
}

// Revise rule-based copy: drop every sentence Snow Bell flagged.
function ruleRevise(copy, issues) {
  const bad = issues.map((i) => i.line.toLowerCase());
  const keep = (s) => !bad.some((b) => b && (s.toLowerCase().includes(b) || b.includes(s.toLowerCase())));
  const sentences = (t) => t.split(/(?<=[.!?])\s+/).filter(Boolean);
  return { ...copy, about: sentences(copy.about).filter(keep).join(" "), subheadline: keep(copy.subheadline) ? copy.subheadline : "", services: copy.services.map((s) => ({ ...s, description: keep(s.description) ? s.description : "" })) };
}

export async function build(run, niche, lead, { round, previous, issues }) {
  let copy;
  const key = `${lead.niche}/knight/${lead.slug || lead.id}/${round}`;
  if (llm.available(key)) {
    copy = await aiCopy(run, lead.facts, niche, previous, issues, key);
    // demo only: inject the niche's deliberate slip into the first draft so the (real) fact-check has something to catch
    if (lead.demoSlip && round === 1) copy.about = `${copy.about} ${niche.search.demoSlip || "Rated the best in town, with 5-star reviews from every customer."}`.trim();
  } else copy = previous ? ruleRevise(previous, issues) : ruleCopy(lead.facts, niche, { slip: !!lead.demoSlip });
  return { copy, round };
}

export function renderConcept(niche, lead, copy) {
  const studio = loadStudio();
  const f = lead.facts || {};
  return render(niche.template, {
    business: { ...f, hours: list(f.hours), extras: list(f.extras), phoneHref: (f.phone || "").replace(/[^\d+]/g, "") },
    copy,
    show: { services: (copy.services || []).length > 0, hours: list(f.hours).length > 0 },
    studio: { name: studio.name, website: studio.website, colors: studio.colors || {} },
    credit: studio.credit !== false,
    fictional: !!lead.fictional,
    year: new Date().getFullYear(),
  });
}
