// Re-take the README screenshots (docs/img/*.png) from a running demo with the recorded AI run:
//   PACE_MS=2500 npm start   (fresh DATA_DIR, demo mode)
//   NODE_PATH=$(npm root -g) node test/docs-shots.cjs http://localhost:3000 docs/img
// Headless Chromium renders WebGL slowly, so the office clock is advanced with the debug hook.
const { chromium } = require("playwright");
const base = process.argv[2] || "http://localhost:3000", out = process.argv[3] || "docs/img";
require("fs").mkdirSync(out, { recursive: true });
const errors = [];
const j = (p, body) => fetch(base + p, body ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : {}).then((r) => r.json());
const sim = (page, sec) => page.evaluate((s) => { const d = window.__soDebug; if (!d?.step) return; d.pause(); d.step(s); d.draw(); d.resume(); }, sec);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function open(theme, w, h, dsf, hash = "office") {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: dsf });
  page.on("pageerror", (e) => errors.push(`${theme}: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error") errors.push(`${theme} console: ${m.text()}`); });
  await page.addInitScript((t) => { window.__soDebug = {}; try { localStorage.setItem("so.theme", t); } catch {} }, theme);
  await page.goto(`${base}/#${hash}`, { waitUntil: "load" });
  await page.waitForSelector(".so-root canvas", { timeout: 90000, state: "attached" });
  await page.waitForTimeout(1500);
  return { browser, page };
}

// run the team and stop the camera on Snow Bell's send-back bubble
async function officeShot(theme, file) {
  await j("/api/demo/reset", {});
  const { browser, page } = await open(theme, 1440, 900, 1);
  await sim(page, 2);
  const run = await j("/api/runs", { query: "dentists in Galway" });
  const t0 = Date.now();
  for (;;) {
    await page.waitForTimeout(800); await sim(page, 1.2);
    const s = await j("/api/office");
    const back = s.events.find((e) => e.agent === "checker" && /^Sending back/.test(e.text));
    if (back) { await page.waitForTimeout(1800); await sim(page, 0.6); break; }
    if (Date.now() - t0 > 240000) throw new Error("no send-back seen");
  }
  await page.screenshot({ path: `${out}/${file}` });
  return { browser, page, run };
}

const runsIdle = async () => { for (;;) { const s = await j("/api/state"); if (!s.runs.some((x) => ["queued", "running"].includes(x.status))) return; await wait(2000); } };
(async () => {
  let r;
  if (process.argv.includes("--after-clip")) {
    // continue from the run that test/record-clip.cjs started (its frames give the office stills)
    await runsIdle();
    r = await open("dark", 1440, 900, 1);
    await r.page.evaluate(() => window.__soDebug.pause()); // stop rendering the hidden office: screenshots stay fast
  } else {
    // light office first, then a fresh dark run that the other shots continue from
    r = await officeShot("light", "office-light.png"); await r.browser.close();
    await runsIdle();
    r = await officeShot("dark", "office-dark.png");
    await runsIdle();
    await r.page.evaluate(() => window.__soDebug.pause());
  }
  const { page } = r;
  page.setDefaultTimeout(120000);
  await page.evaluate(() => (location.hash = "approvals")); await page.waitForTimeout(2600);
  await page.screenshot({ path: `${out}/approvals.png` });

  // one customer says yes, pays the deposit (simulated checkout) → Fluffy invoices; another pays the invoice too
  let s = await j("/api/state");
  const leads = s.emails.filter((e) => e.status === "awaiting_approval" && e.kind === "first");
  for (const [i, first] of leads.slice(0, 2).entries()) {
    await j(`/api/emails/${first.id}/approve`, {});
    await j(`/api/leads/${first.lead}/reply`, { text: "Yes, I want it! Let's go ahead." });
    s = await j("/api/state");
    const dep = s.emails.find((e) => e.lead === first.lead && e.kind === "deposit" && e.status === "awaiting_approval");
    await j(`/api/emails/${dep.id}/approve`, {});
    const order = (await j("/api/state")).payments.find((p) => p.lead === first.lead && p.type === "deposit");
    await fetch(`${base}/sim/checkout/${order.orderId}/pay`, { method: "POST", redirect: "manual" });
    await fetch(`${base}/paypal/return?token=${order.orderId}`, { redirect: "manual" });
    for (;;) { s = await j("/api/state"); const inv = s.payments.find((p) => p.lead === first.lead && p.type === "invoice"); if (inv) { if (i === 0) await fetch(`${base}/sim/invoice/${inv.invoiceId}/pay`, { method: "POST", redirect: "manual" }); break; } await wait(500); }
  }
  await page.evaluate(() => (location.hash = "money")); await page.waitForTimeout(3200);
  await page.screenshot({ path: `${out}/money.png` });

  // projects with the drawer open on the business whose draft was sent back
  await page.evaluate(() => (location.hash = "projects")); await page.waitForTimeout(3000);
  const slip = (await j("/api/state")).leads.find((l) => (l.checks || []).length > 1);
  await page.evaluate((id) => {
    document.querySelector(`#projects-grid .ag-center-cols-container [row-id="${id}"] .ag-cell`)?.click();
    if (document.querySelector("#drawer").classList.contains("hidden")) { const a = document.createElement("a"); a.dataset.open = id; document.body.appendChild(a); a.click(); a.remove(); }
  }, slip.id);
  await page.waitForTimeout(1500);
  await page.evaluate(() => { const d = document.querySelector(".drawer-panel"); const h = [...d.querySelectorAll("h3")].find((x) => /fact-check/i.test(x.textContent)); if (h) d.scrollTop = h.offsetTop - 220; });
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${out}/projects.png` });
  await r.browser.close();

  // phone: the office with the top-bar menu open
  const m = await open("dark", 390, 844, 2);
  m.page.setDefaultTimeout(120000);
  for (let i = 0; i < 6; i++) { await m.page.waitForTimeout(800); await sim(m.page, 2); }
  await m.page.screenshot({ path: `${out}/mobile.png` });
  await m.browser.close();

  console.log(errors.length ? "ERRORS:\n" + errors.join("\n") : "no page errors");
  process.exit(errors.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
