// README extras: the concept site (still + scroll GIF frames), the customer's emails as mail cards, and the
// payment pages. Run against a demo server that has finished a dental + logistics run and taken one business
// through "yes" + the deposit email (see docs/contributing.md):
//   NODE_PATH=$(npm root -g) node test/docs-extra.cjs http://localhost:3000 <outDir> <framesDir>
const { chromium } = require("playwright");
const fs = require("fs");
const [base = "http://localhost:3000", out = "docs/img", framesDir = "concept-frames"] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true }); fs.mkdirSync(framesDir, { recursive: true });
const j = (p, body) => fetch(base + p, body ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : {}).then((r) => r.json());
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// a clean mail-client style card for one email
const mailCard = (m, label) => `<!doctype html><html><head><meta charset="utf-8"><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>body{margin:0;background:#eef0f4;font:15px/1.6 Inter,system-ui,sans-serif;color:#1b1d2b;padding:32px}
.card{max-width:760px;margin:0 auto;background:#fff;border-radius:18px;box-shadow:0 20px 50px -25px rgba(20,22,40,.35);overflow:hidden}
.bar{display:flex;gap:7px;padding:14px 18px;background:#f6f7f9;border-bottom:1px solid #e6e8ee}.bar i{width:11px;height:11px;border-radius:50%;background:#e2e4ea}
.tag{margin-left:auto;font-size:12px;font-weight:600;color:#5a4300;background:#ffe9a8;border-radius:8px;padding:2px 8px}
.head{padding:20px 26px 6px}.subj{font-size:21px;font-weight:700;letter-spacing:-.01em;margin:0 0 10px}
.meta{font-size:13.5px;color:#646a7d}.meta b{color:#1b1d2b;font-weight:600}
.body{padding:12px 26px 26px;white-space:pre-wrap;overflow-wrap:anywhere}.body a{color:#4b3cc9}</style></head>
<body><div class="card"><div class="bar"><i></i><i></i><i></i><span class="tag">${esc(label)}</span></div>
<div class="head"><p class="subj">${esc(m.subject)}</p><div class="meta">From <b>${esc(m.from)}</b><br>To <b>${esc(m.to)}</b></div></div>
<div class="body">${esc(m.body).replace(/https?:\/\/[^\s<]+/g, (u) => `<a href="#">${u}</a>`)}</div></div></body></html>`;

(async () => {
  // CONCEPT_ONLY="<dentalLeadId>,<logisticsLeadId>" re-takes just the concept shots
  const only = process.env.CONCEPT_ONLY?.split(",");
  const flow = only ? null : JSON.parse(fs.readFileSync(process.env.FLOW_JSON, "utf8"));
  const s = await j("/api/state");
  const dental = s.leads.find((l) => l.id === (only ? only[0] : flow.lead)), resto = s.leads.find((l) => (only ? l.id === only[1] : l.niche === "logistics" && l.hasConcept));
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = []; page.on("pageerror", (e) => errors.push(e.message));

  // concepts: a hero still and smooth scroll frames for each (dental → <framesDir>/dental, logistics → <framesDir>/logistics)
  for (const [lead, name] of [[dental, "dental"], [resto, "logistics"]]) {
    if (!lead) continue;
    fs.mkdirSync(`${framesDir}/${name}`, { recursive: true });
    await page.goto(`${base}/c/${lead.id}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(2500); // let the 3D hero (logistics) start
    await page.screenshot({ path: `${out}/concept-${name}.png` });
    const total = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight);
    const frames = 120; // 10 s at 12 fps, with a short pause at the top and bottom
    for (let i = 0; i < frames; i++) {
      const k = Math.min(1, Math.max(0, (i - 12) / (frames - 30)));
      const eased = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
      await page.evaluate((y) => window.scrollTo(0, y), Math.round(eased * total));
      await page.screenshot({ path: `${framesDir}/${name}/c${String(i).padStart(4, "0")}.png` });
    }
  }

  if (only) { await browser.close(); console.log(errors.length ? "ERRORS " + errors.join("; ") : "no page errors"); return; }
  // the emails the business owner receives (fictional business, placeholder studio address)
  await page.setViewportSize({ width: 860, height: 820 });
  const first = s.emails.find((e) => e.id === flow.first.id), dep = s.emails.find((e) => e.id === flow.deposit.id);
  for (const [m, file, label] of [[first, "email-pitch.png", `Written by ${"Nemo"} · approved by a human`], [dep, "email-deposit.png", "Written by Scrapper · approved by a human"]]) {
    await page.setContent(mailCard(m, label), { waitUntil: "networkidle" });
    const h = await page.evaluate(() => document.body.scrollHeight);
    await page.setViewportSize({ width: 860, height: Math.min(1400, h) });
    await page.screenshot({ path: `${out}/${file}` });
  }

  // the deposit page, then pay → Fluffy's invoice page
  await page.setViewportSize({ width: 900, height: 700 });
  await page.goto(`${base}/sim/checkout/${flow.orderId}`, { waitUntil: "networkidle" });
  await page.screenshot({ path: `${out}/paypal-checkout.png` });
  await fetch(`${base}/sim/checkout/${flow.orderId}/pay`, { method: "POST", redirect: "manual" });
  await fetch(`${base}/paypal/return?token=${flow.orderId}`, { redirect: "manual" });
  let inv; for (let i = 0; i < 60 && !inv; i++) { inv = (await j("/api/state")).payments.find((p) => p.lead === flow.lead && p.type === "invoice"); if (!inv) await new Promise((r) => setTimeout(r, 500)); }
  await page.goto(`${base}/sim/invoice/${inv.invoiceId}`, { waitUntil: "networkidle" });
  await page.screenshot({ path: `${out}/paypal-invoice.png` });

  await browser.close();
  console.log(errors.length ? "ERRORS " + errors.join("; ") : "no page errors");
})().catch((e) => { console.error(e); process.exit(1); });
