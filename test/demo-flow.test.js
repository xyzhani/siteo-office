// End-to-end demo flow over HTTP: run → approve → reply "yes" → approve deposit email → pay (simulated)
// → Fluffy's invoice → pay invoice. Runs with no keys. `npm test`
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const PORT = 3900 + Math.floor(Math.random() * 90);
const B = `http://localhost:${PORT}`;
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "siteo-office-"));
const env = { ...process.env, LLM_PROVIDER: process.env.TEST_LLM_PROVIDER || "", DEMO_RECORDING_DIR: process.env.DEMO_RECORDING_DIR || dataDir, PORT: String(PORT), DATA_DIR: dataDir, PACE_MS: "0", DEMO_MODE: "true", PAYPAL_CLIENT_ID: "", PAYPAL_CLIENT_SECRET: "", ANTHROPIC_API_KEY: "", ADMIN_TOKEN: "", EMAIL_PROVIDER: "test", PUBLIC_URL: B };
const api = async (p, body) => { const r = await fetch(B + p, body ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : {}); return r.json(); };
const until = async (fn, ms = 15000) => { const t = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t > ms) throw new Error("timeout"); await new Promise((r) => setTimeout(r, 150)); } };

test("demo pipeline end to end", async (t) => {
  const srv = spawn(process.execPath, ["server.js"], { cwd: path.resolve(import.meta.dirname, ".."), env, stdio: "ignore" });
  t.after(() => srv.kill());
  await until(() => fetch(B + "/healthz").then((r) => r.ok).catch(() => false));

  const st = await api("/api/status");
  const replay = st.aiMode === "replay";
  await api("/api/runs", { query: "dentists in Galway" });
  let s = await until(async () => { const x = await api("/api/state"); return x.runs[0]?.status === "done" && x; });
  assert.equal(s.counts.concept, 3, "three concepts");
  const slip = s.leads.find((l) => (l.checks || []).length === 2);
  assert.ok(slip, "Snow Bell sent one draft back to Knight");
  assert.ok(s.leads.every((l) => l.fictional), "demo data is fictional");

  const first = s.emails.find((e) => e.status === "awaiting_approval");
  assert.match(first.body, /unsubscribe/i, "unsubscribe line");
  await api(`/api/emails/${first.id}/approve`, {});
  if (replay) assert.ok(first.body.includes(`${B}/c/${first.lead}`), "replayed email carries today's concept link");
  const r = await api(`/api/leads/${first.lead}/reply`, { text: replay ? "Yes, I want it! Let's go ahead." : "Yes, I want it!" });
  assert.equal(r.intent, "interested");
  s = await api("/api/state");
  const dep = s.emails.find((e) => e.kind === "deposit" && e.status === "awaiting_approval");
  await api(`/api/emails/${dep.id}/approve`, {});
  const order = s.payments.find((p) => p.type === "deposit");
  await fetch(`${B}/sim/checkout/${order.orderId}/pay`, { method: "POST", redirect: "manual" });
  await fetch(`${B}/paypal/return?token=${order.orderId}`, { redirect: "manual" });
  s = await until(async () => { const x = await api("/api/state"); return x.payments.some((p) => p.type === "invoice") && x; });
  const inv = s.payments.find((p) => p.type === "invoice");
  assert.equal(inv.amount, 400, "balance = 80% of 500");
  assert.deepEqual(s.leads.find((l) => l.id === first.lead).invoice.calls.map((c) => c.tool), ["create_invoice", "send_invoice"]);
  await fetch(`${B}/sim/invoice/${inv.invoiceId}/pay`, { method: "POST", redirect: "manual" });
  s = await api("/api/state");
  assert.equal(s.counts.paid, 1);
  assert.equal(s.money.paid, 400);
  const office = await api("/api/office");
  assert.ok(office.events.some((e) => e.type === "money"), "💰 moment in the office");
  assert.ok(office.handoffs.some((h) => h.from === "checker" && h.to === "developer"), "visible send-back");
});
