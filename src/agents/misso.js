// Misso (finder): finds businesses of the niche in the town that have a website.
import { findBusinesses, providerName } from "../providers/search/index.js";

export async function find({ niche, town, limit }) {
  const list = await findBusinesses(niche, town, limit);
  // one per website domain; skip social pages and directories (they're not the business's own site)
  const seen = new Set(), out = [];
  for (const b of list) {
    let host; try { host = new URL(b.website).hostname.replace(/^www\./, ""); } catch { continue; }
    if (/(facebook|instagram|linktr\.ee|yelp|tripadvisor|google)\./i.test(host)) continue;
    const key = b.fictional ? b.sourceId : host;
    if (seen.has(key)) continue; seen.add(key); out.push(b);
  }
  return { businesses: out, provider: providerName() };
}
