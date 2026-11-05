// Record a real AI run for the demo: `npm run record-demo` (needs ANTHROPIC_API_KEY + CLAUDE_MODEL in .env).
// Runs the real Claude agents on the FICTIONAL demo businesses of each niche pack, walks the whole flow
// (approve → question → yes → deposit → Fluffy's invoice tool calls → follow-up) and saves every AI output to
// demo/recorded/<niche>.json. Keyless and hosted demos then replay it for $0.
// Payments are simulated while recording (no PayPal calls); emails go to the test inbox. Cost: well under $1.
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const niches = (process.argv[2] || "dental,restaurants").split(",").filter((n) => /^[a-z0-9-]+$/.test(n));
const PORT = 3950 + Math.floor(Math.random() * 40), B = `http://localhost:${PORT}`;
const env = { ...process.env, PORT: String(PORT), DATA_DIR: fs.mkdtempSync(path.join(os.tmpdir(), "so-rec-")), DEMO_MODE: "true", PUBLIC_DEMO: "", RECORD_DEMO: "true", PACE_MS: "0", FOLLOWUP_AFTER_MINUTES: "0", PAYPAL_CLIENT_ID: "", PAYPAL_CLIENT_SECRET: "", EMAIL_PROVIDER: "test", ADMIN_TOKEN: "", PUBLIC_URL: B };
// must match the quick-reply buttons in public/app.js so the demo replays them
const QUESTION = "Looks nice. How much would it cost and how long does it take?";
const YES = "Yes, I want it! Let's go ahead.";

const api = async (p, body) => { const r = await fetch(B + p, body ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : {}); const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(`${p}: ${d.error || r.status}`); return d; };
const until = async (fn, ms = 600000) => { const t = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t > ms) throw new Error("timed out"); await new Promise((r) => setTimeout(r, 500)); } };
const state = () => api("/api/state");
const pending = async (lead, kind) => (await state()).emails.find((e) => e.lead === lead && e.kind === kind && e.status === "awaiting_approval");

// start each niche's recording fresh
const REC = process.env.DEMO_RECORDING_DIR ? path.resolve(process.env.DEMO_RECORDING_DIR) : path.join(ROOT, "demo", "recorded");
for (const n of niches) { const f = path.join(REC, n + ".json"); if (fs.existsSync(f)) fs.unlinkSync(f); }
const srv = spawn(process.execPath, ["server.js"], { cwd: ROOT, env, stdio: ["ignore", "inherit", "inherit"] });
try {
  await until(() => fetch(B + "/healthz").then((r) => r.ok).catch(() => false), 20000);
  const st = await api("/api/status");
  if (st.aiMode !== "record") throw new Error("AI isn't available. Set ANTHROPIC_API_KEY and CLAUDE_MODEL in .env first.");
  let total = 0;
  for (const niche of niches) {
    console.log(`\n▶ ${niche}: running the real agents on the fictional demo businesses…`);
    const run = await api("/api/runs", { query: `${niche} demo`, niche });
    await until(async () => ["done", "error", "stopped"].includes((await state()).runs.find((r) => r.id === run.id)?.status));
    const r = (await state()).runs.find((x) => x.id === run.id);
    if (r.status !== "done") throw new Error(`Run ${r.status}: ${r.note}`);
    const leads = (await state()).leads.filter((l) => l.run === run.id && l.status === "awaiting_approval");
    console.log(`  ${leads.length} concepts`);
    for (const l of leads) {
      await api(`/api/emails/${(await pending(l.id, "first")).id}/approve`, {});
      await api(`/api/leads/${l.id}/reply`, { text: QUESTION });
      const ans = await pending(l.id, "answer"); if (ans) await api(`/api/emails/${ans.id}/approve`, {});
      await api(`/api/leads/${l.id}/reply`, { text: YES });
      const dep = await pending(l.id, "deposit");
      if (!dep) { console.log(`  ${l.name}: reply wasn't read as a yes, skipping payment`); continue; }
      await api(`/api/emails/${dep.id}/approve`, {});
      const order = (await state()).payments.find((p) => p.lead === l.id && p.type === "deposit");
      await fetch(`${B}/sim/checkout/${order.orderId}/pay`, { method: "POST", redirect: "manual" });
      await fetch(`${B}/paypal/return?token=${order.orderId}`, { redirect: "manual" });
      await until(async () => (await state()).payments.some((p) => p.lead === l.id && p.type === "invoice"), 180000);
      await api("/api/payments/check", {});
      console.log(`  ✓ ${l.name}`);
    }
    const cost = (await state()).runs.find((x) => x.id === run.id).cost_usd;
    total += cost; console.log(`  AI cost for ${niche}: $${cost.toFixed(3)}`);
  }
  console.log(`\n✅ Recorded to demo/recorded/ (AI total $${total.toFixed(3)}). Commit those files: demo mode now replays the real AI run.`);
} catch (e) { console.error("\n✗ " + e.message); process.exitCode = 1; }
finally { srv.kill(); }
