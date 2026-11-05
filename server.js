// Siteo Office server: one plain Node app (no framework). Serves the dashboard + 3D office, the JSON API,
// concept previews, PayPal return/webhook endpoints, and (demo) fictional websites + simulated checkout.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { ROOT, settings, demoMode, publicStatus, loadStudio, loadTeam, listNiches, loadNiche, ROLES, ROLE_FILES, paypalReady } from "./src/config.js";
import { db, lead as getLead, log } from "./src/store.js";
import { officeState } from "./src/office-state.js";
import * as pipeline from "./src/pipeline.js";
import { payments, isSimulated, simulated } from "./src/providers/payments/index.js";
import { demoBySlug, demoSiteHtml } from "./src/demo/businesses.js";
import { esc } from "./src/util.js";

const PUBLIC = path.join(ROOT, "public");
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".json": "application/json", ".ico": "image/x-icon", ".webp": "image/webp", ".gif": "image/gif" };

const send = (res, code, body, type = "application/json") => {
  res.writeHead(code, { "content-type": type, "cache-control": "no-store", "x-content-type-options": "nosniff" });
  res.end(typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body));
};
const redirect = (res, to) => { res.writeHead(302, { location: to }); res.end(); };
const readBody = (req, limit = 200e3) => new Promise((ok, fail) => {
  let size = 0; const chunks = [];
  req.on("data", (c) => { size += c.length; if (size > limit) { fail(new Error("Body too large")); req.destroy(); } else chunks.push(c); });
  req.on("end", () => ok(Buffer.concat(chunks).toString("utf8"))); req.on("error", fail);
});
const json = async (req) => { const t = await readBody(req); try { return t ? JSON.parse(t) : {}; } catch { throw Object.assign(new Error("Bad JSON"), { code: 400 }); } };
function admin(req) {
  if (!settings.adminToken) return true;
  const t = req.headers["x-admin-token"] || "";
  return t.length === settings.adminToken.length && crypto.timingSafeEqual(Buffer.from(t), Buffer.from(settings.adminToken));
}

function serveFile(res, file) {
  const p = path.resolve(file);
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) return send(res, 404, { error: "Not found" });
  res.writeHead(200, { "content-type": TYPES[path.extname(p)] || "application/octet-stream", "cache-control": "public, max-age=300" });
  fs.createReadStream(p).pipe(res);
}

// Light shape of a lead for the dashboard (no big HTML blobs)
const leadView = (l) => ({ id: l.id, run: l.run, name: l.name, website: l.website, town: l.town, niche: l.niche, fictional: l.fictional, status: l.status, stage: pipeline.stage(l), reason: l.reason,
  score: l.audit?.score ?? null, issues: l.audit?.issues?.map((i) => i.label) ?? [], pagespeed: l.audit?.pagespeed?.score ?? null, email: l.facts?.email || l.email, facts: l.facts, copy: l.copy, checks: l.checks, rounds: l.rounds,
  seo: l.seo?.points, deposit: l.deposit, invoice: l.invoice, intent: l.intent, hasConcept: !!l.conceptHtml, updated: l.updated });

function page(title, body) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>
<style>body{font-family:Inter,system-ui,sans-serif;background:#f5f3ee;color:#1b1d2b;display:grid;place-items:center;min-height:100vh;margin:0;padding:16px;box-sizing:border-box}.card{background:#fff;border-radius:20px;padding:28px;max-width:440px;width:100%;box-shadow:0 20px 60px -30px rgba(0,0,0,.35)}.tag{display:inline-block;background:#ffe9a8;color:#5a4300;border-radius:8px;padding:4px 8px;font-size:12px;font-weight:600}button,.btn{display:block;width:100%;margin-top:18px;padding:14px;border:0;border-radius:999px;background:#ffc439;color:#111;font-weight:700;font-size:16px;cursor:pointer;text-align:center;text-decoration:none}.muted{color:#6b6f7e;font-size:14px}h1{font-size:22px}</style></head><body><div class="card">${body}</div></body></html>`;
}

const routes = [];
const on = (method, pattern, fn, opts = {}) => routes.push({ method, re: new RegExp("^" + pattern.replace(/:(\w+)/g, "(?<$1>[^/]+)") + "/?$"), fn, ...opts });

// ── API
on("GET", "/api/status", (req, res) => {
  const studio = loadStudio();
  send(res, 200, { ...publicStatus(), studio: { name: studio.name, logo: studio.logo, website: studio.website, colors: studio.colors, currency: studio.currency, depositPercent: studio.depositPercent, conceptPrice: studio.conceptPrice, credit: studio.credit !== false, people: studio.people, officeSign: studio.officeSign },
    team: loadTeam().agents, niches: listNiches().map((n) => ({ id: n, label: loadNiche(n).search.label, example: loadNiche(n).search.example })) });
});
on("GET", "/api/office", (req, res) => send(res, 200, officeState()));
on("GET", "/api/state", (req, res) => {
  const leads = db.leads.slice(-200).map(leadView).reverse();
  const counts = { concept: 0, approved: 0, deposit: 0, invoice: 0, paid: 0 };
  // cumulative funnel: a paid lead also counts as a concept, approved, deposit and invoice
  const order = ["concept", "approved", "deposit", "invoice", "paid"];
  for (const l of db.leads) { const s = pipeline.stage(l); if (!s) continue; for (const k of order.slice(0, order.indexOf(s) + 1)) counts[k]++; }
  const money = { deposits: db.payments.filter((p) => p.type === "deposit" && p.status === "captured").reduce((a, p) => a + p.amount, 0), invoiced: db.payments.filter((p) => p.type === "invoice").reduce((a, p) => a + p.amount, 0), paid: db.payments.filter((p) => p.type === "invoice" && p.status === "paid").reduce((a, p) => a + p.amount, 0) };
  send(res, 200, { runs: db.runs.slice(0, 10), leads, emails: db.emails.slice(-150).reverse(), payments: db.payments.slice(-100).reverse(), log: db.log.slice(-120).reverse(), counts, money, pending: db.emails.filter((e) => e.status === "awaiting_approval").length });
});
on("POST", "/api/runs", async (req, res) => {
  const b = await json(req);
  if (db.runs.filter((r) => ["queued", "running"].includes(r.status)).length >= 2) return send(res, 429, { error: "Two runs are already going. Wait for them to finish." });
  send(res, 200, pipeline.startRun(String(b.query || "").slice(0, 120), b.niche));
}, { admin: true });
on("POST", "/api/emails/:id/approve", async (req, res, p) => send(res, 200, await pipeline.approveEmail(p.id, await json(req))), { admin: true });
on("POST", "/api/emails/:id/reject", async (req, res, p) => send(res, 200, pipeline.rejectEmail(p.id)), { admin: true });
on("POST", "/api/leads/:id/reply", async (req, res, p) => { const b = await json(req); if (!String(b.text || "").trim()) throw Object.assign(new Error("Write a reply first"), { code: 400 }); send(res, 200, await pipeline.receiveReply(p.id, b.text)); }, { admin: true });
on("POST", "/api/payments/check", async (req, res) => { await pipeline.sweepInvoices(); send(res, 200, { ok: true }); }, { admin: true });
on("POST", "/api/demo/reset", (req, res) => { pipeline.resetDemo(); send(res, 200, { ok: true }); }, { admin: true });
on("GET", "/api/agents", (req, res) => {
  const team = loadTeam();
  send(res, 200, ROLES.map((r) => ({ role: r, name: team.agents[r].name, file: team.agents[r].instructions || ROLE_FILES[r] + ".md", text: fs.readFileSync(path.join(ROOT, "agents", path.basename(team.agents[r].instructions || ROLE_FILES[r] + ".md")), "utf8") })));
});
on("PUT", "/api/agents/:role", async (req, res, p) => {
  if (demoMode && !settings.adminToken && process.env.RENDER) return send(res, 403, { error: "Editing is off on the public demo. Run it locally to teach your agents." });
  if (!ROLES.includes(p.role)) return send(res, 404, { error: "Unknown agent" });
  const b = await json(req); const team = loadTeam();
  fs.writeFileSync(path.join(ROOT, "agents", path.basename(team.agents[p.role].instructions || ROLE_FILES[p.role] + ".md")), String(b.text || "").slice(0, 20000));
  send(res, 200, { ok: true });
}, { admin: true });

// ── concept previews
on("GET", "/c/:id", (req, res, p) => {
  const l = getLead(p.id); if (!l?.conceptHtml) return send(res, 404, page("Not found", "<h1>Concept not found</h1>"), TYPES[".html"]);
  send(res, 200, l.conceptHtml, TYPES[".html"]);
});

// ── PayPal
on("GET", "/paypal/return", async (req, res, p, url) => {
  const token = url.searchParams.get("token");
  try { const pay = await pipeline.captureDeposit(token); redirect(res, `/?paid=${encodeURIComponent(pay.lead)}#pipeline`); }
  catch (e) { send(res, 400, page("Payment", `<h1>We couldn't confirm that payment</h1><p class="muted">${esc(e.message)}</p><a class="btn" href="/">Back to the office</a>`), TYPES[".html"]); }
});
on("GET", "/paypal/cancel", (req, res) => send(res, 200, page("Payment cancelled", `<h1>Payment cancelled</h1><p class="muted">No money moved. You can use the link in the email again any time.</p><a class="btn" href="/">Back</a>`), TYPES[".html"]));
// Webhooks: we never trust the payload alone. If PAYPAL_WEBHOOK_ID is set we verify the signature with PayPal,
// and in every case we re-read the order/invoice from PayPal's API before changing anything.
on("POST", "/webhooks/paypal", async (req, res) => {
  const raw = await readBody(req, 1e6); let event; try { event = JSON.parse(raw); } catch { return send(res, 400, { error: "bad json" }); }
  if (isSimulated()) return send(res, 200, { ignored: "payments are simulated" });
  if (settings.paypal.webhookId) { const ok = await payments.verifyWebhook(req.headers, event).catch(() => false); if (!ok) return send(res, 400, { error: "signature check failed" }); }
  send(res, 200, { received: true });
  try {
    const t = event.event_type, r = event.resource || {};
    log("system", `PayPal webhook: ${t}`);
    if (t === "CHECKOUT.ORDER.APPROVED" && r.id) await pipeline.captureDeposit(r.id).catch(() => {});
    if (t === "PAYMENT.CAPTURE.COMPLETED") {
      const orderId = r.supplementary_data?.related_ids?.order_id;
      const pay = db.payments.find((x) => x.orderId === orderId);
      if (pay) { const o = await payments.getOrder(orderId); if (o.status === "COMPLETED") await pipeline.depositConfirmed(pay, o.capture?.id || r.id); }
    }
    if (t === "INVOICING.INVOICE.PAID") {
      const invId = r.invoice?.id || r.id; const inv = await payments.getInvoice(invId);
      if (["PAID", "MARKED_AS_PAID"].includes(inv.status)) await pipeline.invoicePaid(invId);
    }
  } catch (e) { log("system", `Webhook handling error: ${e.message}`); }
});

// ── simulated PayPal (only when no PayPal keys are set)
on("GET", "/sim/checkout/:id", (req, res, p) => {
  const o = simulated.simOrder(p.id); if (!o || !isSimulated()) return send(res, 404, page("Not found", "<h1>Not found</h1>"), TYPES[".html"]);
  send(res, 200, page("Simulated checkout", `<span class="tag">SIMULATED · no real money · add PayPal Sandbox keys for real Checkout</span><h1>${esc(o.description)}</h1><p style="font-size:30px;font-weight:800;margin:6px 0">${esc(o.currency)} ${Number(o.amount).toFixed(2)}</p><p class="muted">This page stands in for PayPal Checkout in keyless demo mode.</p><form method="post" action="/sim/checkout/${esc(o.id)}/pay"><button>${o.status === "COMPLETED" ? "Already paid ✓" : "Pay deposit (simulated)"}</button></form>`), TYPES[".html"]);
});
on("POST", "/sim/checkout/:id/pay", async (req, res, p) => { if (!isSimulated()) return send(res, 404, {}); await simulated.approveOrder(p.id); redirect(res, `/paypal/return?token=${encodeURIComponent(p.id)}`); });
on("GET", "/sim/invoice/:id", (req, res, p) => {
  const i = simulated.simInvoice(p.id); if (!i || !isSimulated()) return send(res, 404, page("Not found", "<h1>Not found</h1>"), TYPES[".html"]);
  const total = i.items.reduce((a, x) => a + Number(x.amount), 0);
  send(res, 200, page("Simulated invoice", `<span class="tag">SIMULATED INVOICE · add PayPal Sandbox keys for real PayPal Invoicing</span><h1>Invoice ${esc(i.number)}</h1><p class="muted">${esc(i.items[0]?.name)}<br>${esc(i.items[0]?.description)}</p><p style="font-size:30px;font-weight:800;margin:6px 0">${esc(i.currency)} ${total.toFixed(2)}</p><form method="post" action="/sim/invoice/${esc(i.id)}/pay"><button>${i.status === "PAID" ? "Paid ✓" : "Pay invoice (simulated)"}</button></form>`), TYPES[".html"]);
});
on("POST", "/sim/invoice/:id/pay", async (req, res, p) => { if (!isSimulated()) return send(res, 404, {}); await simulated.payInvoice(p.id); await pipeline.invoicePaid(p.id); redirect(res, "/?invoicePaid=1#pipeline"); });

// ── demo: fictional businesses' "old websites"
on("GET", "/demo-sites/photo.svg", (req, res) => send(res, 200, `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="600"><rect width="900" height="600" fill="#9fb3c8"/><text x="450" y="310" font-size="40" text-anchor="middle" fill="#fff" font-family="sans-serif">photo.jpg (2.4 MB)</text></svg>`, TYPES[".svg"]));
on("GET", "/demo-sites/:slug", (req, res, p) => { const b = demoBySlug(p.slug); if (!b) return send(res, 404, "Not found", "text/plain"); send(res, 200, demoSiteHtml(b), TYPES[".html"]); });

on("GET", "/healthz", (req, res) => send(res, 200, { ok: true }));

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  try {
    for (const r of routes) {
      if (r.method !== req.method) continue;
      const m = url.pathname.match(r.re); if (!m) continue;
      if (r.admin && !admin(req)) return send(res, 401, { error: "Admin token required" });
      return await r.fn(req, res, m.groups || {}, url);
    }
    if (req.method !== "GET" && req.method !== "HEAD") return send(res, 404, { error: "Not found" });
    if (url.pathname === "/" || url.pathname === "/index.html") return serveFile(res, path.join(PUBLIC, "index.html"));
    if (url.pathname.startsWith("/brand/")) return serveFile(res, path.join(ROOT, "brand", path.basename(url.pathname)));
    return serveFile(res, path.join(PUBLIC, path.normalize(url.pathname).replace(/^([/\\])+/, "")));
  } catch (e) {
    if (!res.headersSent) send(res, e.code === 400 ? 400 : 500, { error: e.message });
  }
});

server.listen(settings.port, () => {
  console.log(`\n🐾 Siteo Office is open: http://localhost:${settings.port}`);
  console.log(`   mode: ${demoMode ? "DEMO (fictional businesses, no AI key needed)" : "LIVE"} · payments: ${paypalReady ? "PayPal " + settings.paypal.env : "simulated"} · email: ${publicStatus().email}\n`);
});
if (!demoMode && !settings.adminToken && (process.env.RENDER || settings.publicUrl)) console.warn("⚠️  Live mode on a public URL without ADMIN_TOKEN: anyone could start runs. Set ADMIN_TOKEN.");
// background: watch unpaid invoices and draft follow-ups (every minute)
setInterval(() => pipeline.sweepInvoices().catch(() => {}), 60000).unref();
