// Small helpers: page fetching + signals, visible text, a tiny template renderer, rules parsing.
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const slug = (s) => String(s || "").toLowerCase().normalize("NFKD").replace(/[^\w\s-]/g, "").trim().replace(/[\s_]+/g, "-").slice(0, 60);

// Fetch a page politely: 15 s timeout, 2 MB cap, our own user agent.
export async function fetchPage(url) {
  const t0 = Date.now();
  const r = await fetch(url, { redirect: "follow", headers: { "user-agent": "SiteoOffice/1.0 (+website audit; open-source)", accept: "text/html,*/*" }, signal: AbortSignal.timeout(15000) });
  const reader = r.body?.getReader(); let size = 0; const chunks = [];
  if (reader) for (;;) { const { done, value } = await reader.read(); if (done) break; size += value.length; chunks.push(value); if (size > 2e6) { reader.cancel(); break; } }
  const html = Buffer.concat(chunks.map((c) => Buffer.from(c))).toString("utf8");
  return { ok: r.ok, status: r.status, finalUrl: r.url, html, ms: Date.now() - t0, kb: Math.round(size / 1024) };
}

export function visibleText(html) {
  return html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<(br|p|div|li|h[1-6]|tr|td|section|header|footer)[^>]*>/gi, "\n").replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#39;|&rsquo;/g, "'").replace(/&quot;/g, '"').replace(/&ndash;/g, "–")
    .split("\n").map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean).join("\n").slice(0, 20000);
}

// Objective signals Tom scores. All from the HTML itself, nothing guessed.
export function siteSignals(page, niche) {
  const h = page.html || "", low = h.toLowerCase();
  const years = [...h.matchAll(/(?:©|&copy;|copyright)\s*(?:\d{4}\s*[-–]\s*)?((?:19|20)\d{2})/gi)].map((m) => +m[1]);
  const words = niche?.audit?.bookingWords || ["book", "appointment", "reserve"];
  return {
    reachable: page.ok,
    https: /^https:/i.test(page.finalUrl || "") || /^http:\/\/(localhost|127\.0\.0\.1)[:/]/i.test(page.finalUrl || ""), // local demo sites can't be HTTPS
    hasViewport: /<meta[^>]+name=["']?viewport/i.test(h),
    hasMetaDescription: /<meta[^>]+name=["']?description/i.test(h),
    hasTitle: /<title>\s*[^<\s][^<]*<\/title>/i.test(h) && !/<title>\s*(welcome|home|untitled)\s*<\/title>/i.test(h),
    tableLayout: (low.match(/<table/g) || []).length >= 1 && !/<(main|section|article|nav)\b/.test(low),
    oldTags: /<(font|center|marquee|frameset)\b|bgcolor=/i.test(h),
    copyrightYear: years.length ? Math.max(...years) : null,
    hasTelLink: /href=["']tel:/i.test(h),
    hasBooking: words.some((w) => new RegExp(`<a[^>]*>[^<]*${w}[^<]*</a>|href=["'][^"']*${w}`, "i").test(h)),
    htmlKb: page.kb,
    loadMs: page.ms,
    emails: [...new Set([...h.matchAll(/mailto:([^"'?\s>]+@[^"'?\s>]+)/gi)].map((m) => decodeURIComponent(m[1]).toLowerCase()))].slice(0, 3),
  };
}

// Tiny mustache-style renderer: {{a.b}} escaped, {{{a}}} raw, {{#list}}..{{/list}} loops/conditionals, {{^x}}..{{/x}} inverse, {{.}} current item.
export function render(tpl, data) {
  const get = (ctx, p) => {
    if (p === ".") return ctx.at(-1);
    const [head, ...rest] = p.split(".");
    const scope = [...ctx].reverse().find((c) => c && typeof c === "object" && head in c);
    return scope ? rest.reduce((o, k) => (o == null ? o : o[k]), scope[head]) : undefined;
  };
  const run = (t, ctx) => t
    .replace(/\{\{([#^])\s*([\w.]+)\s*\}\}([\s\S]*?)\{\{\/\s*\2\s*\}\}/g, (_, kind, key, inner) => {
      const v = get(ctx, key), empty = v == null || v === false || (Array.isArray(v) && !v.length) || v === "";
      if (kind === "^") return empty ? run(inner, ctx) : "";
      if (empty) return "";
      if (Array.isArray(v)) return v.map((item) => run(inner, [...ctx, item])).join("");
      return run(inner, typeof v === "object" ? [...ctx, v] : ctx);
    })
    .replace(/\{\{\{\s*([\w.]+)\s*\}\}\}/g, (_, k) => String(get(ctx, k) ?? ""))
    .replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, k) => esc(get(ctx, k) ?? ""));
  return run(tpl, [data]);
}

// rules.md → forbidden phrases (bullets under a heading containing "forbidden") + all text for the AI checker
export function parseRules(md) {
  const forbidden = []; let inF = false;
  for (const line of String(md).split("\n")) {
    if (/^#+\s/.test(line)) { inF = /forbidden/i.test(line); continue; }
    const m = inF && line.match(/^\s*[-*]\s+["“]?(.+?)["”]?\s*$/);
    if (m) forbidden.push(m[1].replace(/\s+#.*$/, "").trim().toLowerCase());
  }
  return { forbidden, text: md };
}

// emails.md → sections by "## Heading" (used as tone guides and fallback templates)
export function parseSections(md) {
  const out = {}; let cur = "_";
  for (const line of String(md).split("\n")) { const m = line.match(/^##\s+(.+)/); if (m) { cur = m[1].trim().toLowerCase(); out[cur] = ""; continue; } out[cur] = (out[cur] || "") + line + "\n"; }
  for (const k of Object.keys(out)) out[k] = out[k].trim();
  return out;
}
export const fill = (s, vars) => String(s || "").replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? String(vars[k]) : m));
