// Render a smooth clip of the office frame by frame (headless WebGL is too slow for real-time capture):
//   1. start the server with a slowed pace so the pipeline keeps up with the frame-stepped office, e.g.
//      PACE_MS=<printed by --measure> DATA_DIR=/tmp/so-clip npm start
//   2. NODE_PATH=$(npm root -g) node test/record-clip.cjs http://localhost:3000 <framesDir> [seconds=60] [fps=15]
// Every frame advances the office clock by exactly 1/fps second, then takes a screenshot. Use ffmpeg to encode.
const { chromium } = require("playwright");
const fs = require("fs");
const [base = "http://localhost:3000", dir = "frames", secArg = "60", fpsArg = "15"] = process.argv.slice(2);
const measure = process.argv.includes("--measure");
const seconds = Number(secArg), fps = Number(fpsArg);
fs.mkdirSync(dir, { recursive: true });
const j = (p, body) => fetch(base + p, body ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : {}).then((r) => r.json());
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const errors = []; page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() => { window.__soDebug = {}; try { localStorage.setItem("so.theme", "dark"); } catch {} });
  if (!measure) await j("/api/demo/reset", {});
  await page.goto(base + "/#office", { waitUntil: "load" });
  await page.waitForSelector(".so-root canvas", { timeout: 90000, state: "attached" });
  await page.waitForTimeout(2500);
  await page.evaluate(() => window.__soDebug.pause());
  const frames = measure ? 20 : Math.round(seconds * fps);
  const switchAt = Math.round((seconds - 3) * fps);
  const t0 = Date.now(); let sendBack = null;
  for (let i = 0; i < frames; i++) {
    if (i === Math.round(fps * 1.5) && !measure) await page.click("#run-btn");
    if (i === switchAt && !measure) await page.click("#theme-btn");
    await page.evaluate((dt) => { const d = window.__soDebug; d.step(dt); d.draw(); }, 1 / fps);
    await page.screenshot({ path: `${dir}/f${String(i).padStart(5, "0")}.jpg`, type: "jpeg", quality: 88 });
    if (!sendBack && i % fps === 0 && !measure) { const s = await j("/api/office"); if (s.events.some((e) => e.agent === "checker" && /^Sending back/.test(e.text))) sendBack = i; }
  }
  const perFrame = (Date.now() - t0) / frames / 1000;
  const slow = perFrame * fps;
  console.log(JSON.stringify({ frames, perFrameSec: +perFrame.toFixed(3), slowdown: +slow.toFixed(2), suggestedPaceMs: Math.round(1500 * slow), sendBackFrame: sendBack, errors }));
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
