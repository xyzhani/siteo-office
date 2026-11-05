// Business search adapters. Each returns [{ name, website, phone?, address?, email?, source, sourceId }].
// Only official APIs: OpenStreetMap (Nominatim + Overpass), Google Places API (New), Apify actors.
// To add a provider: write async function(niche, town, limit) and register it in PROVIDERS.
import { settings, demoMode } from "../../config.js";
import { demoBusinesses } from "../../demo/businesses.js";

const UA = `SiteoOffice/1.0 (open-source; ${settings.search.contact || "https://github.com/siteo-office"})`;
const cleanUrl = (u) => { if (!u) return null; try { const x = new URL(/^https?:\/\//i.test(u) ? u : "https://" + u); return /^https?:$/.test(x.protocol) ? x.href : null; } catch { return null; } };

async function demo(niche, _town, limit) {
  const base = settings.publicUrl || `http://localhost:${settings.port}`;
  return demoBusinesses(niche.id).slice(0, limit).map((b) => ({
    name: b.name, website: `${base}/demo-sites/${b.slug}/`, phone: b.phone, address: b.address, source: "demo", sourceId: b.slug, fictional: true,
  }));
}

// OpenStreetMap: geocode the town with Nominatim, then ask Overpass for places with the niche's OSM tags and a website.
async function osm(niche, town, limit) {
  const g = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(town)}`, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(20000) });
  if (!g.ok) throw new Error(`Nominatim ${g.status}`);
  const [place] = await g.json();
  if (!place) throw new Error(`Couldn't find the town "${town}" on OpenStreetMap`);
  const [s, n, w, e] = place.boundingbox.map(Number);
  const pad = 0.02, bbox = `${s - pad},${w - pad},${n + pad},${e + pad}`;
  const tags = niche.search.osmTags || [];
  const q = `[out:json][timeout:25];(${tags.map((t) => { const [k, v] = t.split("="); return `nwr["${k}"="${v}"]["website"](${bbox});nwr["${k}"="${v}"]["contact:website"](${bbox});`; }).join("")});out center ${limit * 3};`;
  // public Overpass servers get busy: try OVERPASS_URL first, then a couple of mirrors
  const mirrors = [process.env.OVERPASS_URL, "https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter", "https://overpass.private.coffee/api/interpreter"].filter(Boolean);
  let data = null, lastErr = "";
  for (const url of mirrors) {
    try {
      const r = await fetch(url, { method: "POST", headers: { "user-agent": UA, "content-type": "application/x-www-form-urlencoded" }, body: "data=" + encodeURIComponent(q), signal: AbortSignal.timeout(40000) });
      if (r.ok) { data = await r.json(); break; }
      lastErr = `Overpass ${r.status}`;
    } catch (e) { lastErr = `Overpass: ${e.cause?.message || e.message}`; }
  }
  if (!data) throw new Error(lastErr || "Overpass unavailable");
  const out = [], seen = new Set();
  for (const el of data.elements || []) {
    const t = el.tags || {}, website = cleanUrl(t.website || t["contact:website"]);
    if (!t.name || !website || seen.has(website)) continue; seen.add(website);
    out.push({ name: t.name, website, phone: t.phone || t["contact:phone"] || null, email: t.email || t["contact:email"] || null,
      address: [t["addr:housenumber"], t["addr:street"], t["addr:city"]].filter(Boolean).join(" ") || null, source: "osm", sourceId: `${el.type}/${el.id}` });
    if (out.length >= limit) break;
  }
  return out;
}

// Google Places API (New) Text Search. Needs GOOGLE_PLACES_API_KEY.
async function google(niche, town, limit) {
  if (!settings.search.googleKey) throw new Error("Set GOOGLE_PLACES_API_KEY to use SEARCH_PROVIDER=google");
  const r = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: { "content-type": "application/json", "X-Goog-Api-Key": settings.search.googleKey, "X-Goog-FieldMask": "places.id,places.displayName,places.websiteUri,places.formattedAddress,places.nationalPhoneNumber" },
    body: JSON.stringify({ textQuery: `${niche.search.query} in ${town}`, pageSize: Math.min(20, limit * 2) }),
    signal: AbortSignal.timeout(25000),
  });
  if (!r.ok) throw new Error(`Google Places ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const data = await r.json();
  return (data.places || []).filter((p) => p.websiteUri).slice(0, limit).map((p) => ({
    name: p.displayName?.text, website: cleanUrl(p.websiteUri), phone: p.nationalPhoneNumber || null, address: p.formattedAddress || null, source: "google", sourceId: p.id,
  }));
}

// Apify Google Maps scraper actor (compass/crawler-google-places). Needs APIFY_TOKEN.
async function apify(niche, town, limit) {
  if (!settings.search.apifyToken) throw new Error("Set APIFY_TOKEN to use SEARCH_PROVIDER=apify");
  const actor = process.env.APIFY_ACTOR || "compass~crawler-google-places";
  const r = await fetch(`https://api.apify.com/v2/acts/${actor}/run-sync-get-dataset-items?token=${encodeURIComponent(settings.search.apifyToken)}`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ searchStringsArray: [`${niche.search.query} in ${town}`], maxCrawledPlacesPerSearch: limit * 2, language: "en" }),
    signal: AbortSignal.timeout(180000),
  });
  if (!r.ok) throw new Error(`Apify ${r.status}`);
  const items = await r.json();
  return items.filter((p) => p.website).slice(0, limit).map((p) => ({
    name: p.title, website: cleanUrl(p.website), phone: p.phone || null, address: p.address || null, source: "apify", sourceId: p.placeId || p.url,
  }));
}

const PROVIDERS = { osm, google, apify };
export async function findBusinesses(niche, town, limit = settings.search.maxResults) {
  if (demoMode) return demo(niche, town, limit);
  const fn = PROVIDERS[settings.search.provider] || osm;
  return (await fn(niche, town, limit)).filter((b) => b.name && b.website);
}
export const providerName = () => (demoMode ? "demo" : settings.search.provider);
