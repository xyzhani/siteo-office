// Playwright smoke test + screenshots (both themes, desktop + phone):
//   NODE_PATH=$(npm root -g) node test/screens.cjs [baseUrl] [outDir]
// Headless Chromium renders WebGL in software (a few fps), so we advance the office clock with the debug hook.
const { chromium } = require("playwright");
const base = process.argv[2] || "http://localhost:3000", out = process.argv[3] || "test-results";
require("fs").mkdirSync(out, { recursive: true });
const sim = (page, sec) => page.evaluate((s) => { const d = window.__soDebug; if (!d?.step) return; d.pause(); d.step(s); d.draw(); d.resume(); }, sec);
(async () => {
  const errors = [];
  let started = false;
  for (const theme of ["dark", "light"]) {
    for (const [w, h, name] of [[1440, 900, "desktop"], [390, 844, "mobile"]]) {
      const browser = await chromium.launch(); // a fresh browser per page: software WebGL doesn't free contexts reliably
      const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
      page.on("pageerror", (e) => errors.push(`${theme}/${name}: ${e.message}`));
      page.on("console", (m) => { if (m.type() === "error") errors.push(`${theme}/${name} console: ${m.text()}`); });
      await page.addInitScript((t) => { window.__soDebug = {}; try { localStorage.setItem("so.theme", t); } catch {} }, theme);
      await page.goto(base + "/#office", { waitUntil: "load" });
      await page.waitForSelector(".so-root canvas", { timeout: 90000, state: "attached" });
      if (!started) { await page.click("#run-btn"); started = true; }
      for (let i = 0; i < (name === "desktop" && theme === "dark" ? 20 : 5); i++) { await page.waitForTimeout(1000); await sim(page, 1); }
      await page.screenshot({ path: `${out}/${theme}-office-${name}.png` });
      for (const v of name === "desktop" ? ["overview", "projects", "salary"] : ["projects"]) {
        await page.evaluate((x) => (location.hash = x), v); await page.waitForTimeout(900);
        await page.screenshot({ path: `${out}/${theme}-${v}-${name}.png` });
      }
      if (name === "mobile") { await page.click("#menu-btn"); await page.waitForTimeout(300); await page.screenshot({ path: `${out}/${theme}-menu-mobile.png` }); }
      await browser.close();
    }
  }
  console.log(errors.length ? "ERRORS:\n" + errors.join("\n") : "no page errors");
  process.exit(errors.length ? 1 : 0);
})();
