// Sherlock (SEO): a short note on what the old site misses, from Tom's measured signals only.
import { loadAgentInstructions } from "../config.js";
import * as llm from "../providers/llm/index.js";

const SEO_KEYS = { noMetaDescription: "No meta description, so Google shows a random snippet", noTitle: "The page title doesn't say who you are or where", noViewport: "Google ranks mobile-unfriendly pages lower on phones", slowMobile: "Slow on mobile, which hurts rankings and bookings", noHttps: "No HTTPS: browsers mark it 'Not secure'", noTelLink: "Phone number isn't tappable on mobile", noBooking: "No clear booking or reservation link", oldCopyright: "Looks unmaintained (old copyright year)" };

export function ruleNote(audit) {
  const points = audit.issues.filter((i) => SEO_KEYS[i.key]).map((i) => SEO_KEYS[i.key]).slice(0, 4);
  return { points: points.length ? points : ["The basics are fine; the concept mainly improves design and clarity"] };
}

export async function note(run, lead) {
  const base = ruleNote(lead.audit);
  const key = `${lead.niche}/sherlock/${lead.slug || lead.id}`;
  if (!llm.available(key)) return base;
  try {
    const r = await llm.json(run, { key, system: loadAgentInstructions("seo"), prompt: `Measured issues on ${lead.name}'s current website:\n${lead.audit.issues.map((i) => "- " + i.label).join("\n")}\nPageSpeed mobile: ${lead.audit.pagespeed?.score ?? "not measured"}\n\nReturn {"points": [up to 4 short plain-English points a business owner understands]}. Only use the measured issues above.`, maxTokens: 500 });
    return { points: (r.points || []).slice(0, 4).map(String).filter(Boolean).length ? r.points.slice(0, 4).map(String) : base.points };
  } catch (e) { if (e instanceof llm.CostCapError) throw e; return base; }
}
