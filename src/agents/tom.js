// Tom (auditor): reads each site, runs Google PageSpeed (mobile), scores how weak the site is (higher = weaker)
// with the niche's audit.json weights, and extracts the real facts that Knight may use.
import { settings, loadAgentInstructions } from "../config.js";
import { fetchPage, siteSignals, visibleText } from "../util.js";
import * as llm from "../providers/llm/index.js";

async function pagespeed(url) {
  if (!settings.audit.usePagespeed || /localhost|127\.0\.0\.1|\.example\b/.test(url)) return null;
  const q = new URLSearchParams({ url, strategy: "mobile", category: "performance" });
  if (settings.audit.pagespeedKey) q.set("key", settings.audit.pagespeedKey);
  try {
    const r = await fetch("https://www.googleapis.com/pagespeedonline/v5/runPagespeed?" + q, { signal: AbortSignal.timeout(60000) });
    if (!r.ok) return null;
    const d = await r.json();
    const a = d.lighthouseResult?.audits || {};
    return { score: Math.round((d.lighthouseResult?.categories?.performance?.score ?? 0) * 100), lcpMs: a["largest-contentful-paint"]?.numericValue ?? null };
  } catch { return null; }
}

export function score(signals, psi, weights) {
  const w = { noViewport: 22, noHttps: 10, slowMobile: 18, noMetaDescription: 6, noTitle: 4, tableLayout: 12, oldTags: 6, oldCopyright: 10, noTelLink: 6, noBooking: 8, heavyPage: 6, ...weights };
  const year = new Date().getFullYear();
  const issues = [];
  const add = (key, label) => { if (w[key]) issues.push({ key, label, points: w[key] }); };
  if (!signals.hasViewport) add("noViewport", "Not mobile-friendly (no viewport tag)");
  if (!signals.https) add("noHttps", "No HTTPS");
  if (psi && psi.score < 50) add("slowMobile", `Slow on mobile (PageSpeed ${psi.score}/100)`);
  else if (!psi && signals.htmlKb > 400) add("slowMobile", `Heavy page (${signals.htmlKb} KB of HTML)`);
  if (!signals.hasMetaDescription) add("noMetaDescription", "No meta description for Google");
  if (!signals.hasTitle) add("noTitle", "Generic or missing page title");
  if (signals.tableLayout) add("tableLayout", "Old table-based layout");
  if (signals.oldTags) add("oldTags", "Outdated HTML (font/center/bgcolor tags)");
  if (signals.copyrightYear && signals.copyrightYear < year - 3) add("oldCopyright", `Not updated since ${signals.copyrightYear}`);
  if (!signals.hasTelLink) add("noTelLink", "Phone number isn't tappable");
  if (!signals.hasBooking) add("noBooking", "No online booking or reservation link");
  const total = issues.reduce((a, i) => a + i.points, 0);
  return { score: Math.min(100, total), issues };
}

// Rule-based facts (demo mode and fallback): phone, email, hours, list items, address-looking lines.
export function heuristicFacts(text, b, niche) {
  const lines = text.split("\n");
  const phone = b.phone || (text.match(/(\+?\d[\d\s().-]{7,}\d)/) || [])[1] || null;
  const email = (text.match(/[\w.+-]+@[\w-]+\.[\w.-]+/) || [])[0] || b.email || null;
  const dayRe = /\b(mon|tue|wed|thu|fri|sat|sun)[a-z]*\b.*\d/i;
  const hours = lines.filter((l) => dayRe.test(l) && l.length < 60);
  const servicesHeading = lines.findIndex((l) => /services|treatments|menu|what we do/i.test(l) && l.length < 40);
  const services = servicesHeading >= 0 ? lines.slice(servicesHeading + 1, servicesHeading + 8).filter((l) => l.length < 60 && !dayRe.test(l) && !/opening|hours|call|email/i.test(l)).slice(0, 6) : [];
  const owner = (text.match(/\b(Dr\.?\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/) || [])[1] || null;
  const since = (text.match(/\b(?:est\.?|established|since)\s*((?:19|20)\d{2})/i) || [])[1] || null;
  const extras = lines.filter((l) => /(parking|wheelchair|access|terrace|dog|family run|gluten|vegan)/i.test(l) && l.length < 90).slice(0, 3);
  return { name: b.name, phone, email, address: b.address || null, town: b.town || null, owner, since, hours, services, extras };
}

async function aiFacts(run, text, b, niche, key) {
  const fields = niche.facts.fields.map((f) => `- ${f.key}${f.type === "list" ? " (list of strings)" : ""}: ${f.label}`).join("\n");
  const sys = loadAgentInstructions("auditor") + "\n\nNiche fact fields:\n" + fields;
  const out = await llm.json(run, {
    key,
    system: sys,
    prompt: `Business: ${b.name}\nWebsite: ${b.website}\nKnown from the listing: phone=${b.phone || "?"} address=${b.address || "?"}\n\nVisible text of the website:\n"""\n${text.slice(0, 12000)}\n"""\n\nReturn {"facts": {<field>: value or null}}. Copy facts exactly as written on the site. If a fact is not on the page, use null. Never invent.`,
    maxTokens: 1200,
  });
  return out.facts || {};
}

export async function audit(run, niche, lead) {
  const page = await fetchPage(lead.website);
  if (!page.ok) return { ok: false, reason: `Website didn't load (${page.status})` };
  const signals = siteSignals(page, niche);
  const psi = await pagespeed(page.finalUrl || lead.website);
  const s = score(signals, psi, niche.audit.weights);
  const text = visibleText(page.html);
  let facts = heuristicFacts(text, { ...lead, town: lead.town }, niche);
  const key = `${lead.niche}/tom/${lead.slug || lead.id}`;
  if (llm.available(key)) {
    try { const f = await aiFacts(run, text, lead, niche, key); facts = { ...facts, ...Object.fromEntries(Object.entries(f).filter(([, v]) => v != null && !(Array.isArray(v) && !v.length))) }; }
    catch (e) { if (e instanceof llm.CostCapError) throw e; }
  }
  facts.email = facts.email || signals.emails[0] || lead.email || null;
  facts.name = lead.name;
  return { ok: true, signals, pagespeed: psi, score: s.score, issues: s.issues, facts, sourceText: text.slice(0, 8000) };
}
