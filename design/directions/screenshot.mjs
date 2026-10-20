// Screenshots every design direction at 375 and 1280 (light + dark) and checks for horizontal overflow.
// Usage:  node design/directions/screenshot.mjs [01 02 03]
// Needs Playwright with Chromium already installed (never runs `playwright install`):
//   - `playwright` resolvable from the repo, or a global install (PLAYWRIGHT_PKG=/path/to/node_modules/playwright)
//   - browsers under PLAYWRIGHT_BROWSERS_PATH (default /opt/pw-browsers)
import { createRequire } from "node:module";
import { readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
process.env.PLAYWRIGHT_BROWSERS_PATH ??= "/opt/pw-browsers";

function loadPlaywright() {
  const candidates = [process.env.PLAYWRIGHT_PKG, "playwright", "/opt/node-tools/node_modules/playwright"].filter(Boolean);
  for (const c of candidates) {
    try { return require(c); } catch { /* try next */ }
  }
  throw new Error("Playwright not found. Set PLAYWRIGHT_PKG to a node_modules/playwright directory.");
}

const { chromium } = loadPlaywright();
const only = process.argv.slice(2);
const files = readdirSync(here).filter((f) => /^\d{2}-.*\.html$/.test(f)).filter((f) => !only.length || only.some((o) => f.startsWith(o)));
const outDir = path.join(here, "screenshots");
const viewports = [
  { w: 375, h: 812 },
  { w: 1280, h: 800 },
];

const browser = await chromium.launch();
let failures = 0;
for (const file of files) {
  const slug = file.replace(/\.html$/, "");
  for (const { w, h } of viewports) {
    for (const scheme of ["light", "dark"]) {
      const context = await browser.newContext({
        viewport: { width: w, height: h },
        deviceScaleFactor: 1,
        colorScheme: scheme,
        reducedMotion: "reduce", // chat demo renders fully, reveals are not hidden
        locale: "he-IL",
      });
      const page = await context.newPage();
      await page.goto(pathToFileURL(path.join(here, file)).href, { waitUntil: "load" });
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(400);
      const overflow = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
        bodyScroll: document.body.scrollWidth,
      }));
      const ok = overflow.scrollWidth <= overflow.innerWidth && overflow.bodyScroll <= overflow.innerWidth;
      if (!ok) failures++;
      const name = `${slug}-${w}${scheme === "dark" ? "-dark" : ""}.png`;
      await page.screenshot({ path: path.join(outDir, name), fullPage: true });
      console.log(`${ok ? "ok " : "OVERFLOW"} ${name}  (scrollWidth ${overflow.scrollWidth} / viewport ${overflow.innerWidth})`);
      await context.close();
    }
  }
}
await browser.close();
if (failures) { console.error(`${failures} screenshot(s) have horizontal overflow`); process.exit(1); }
