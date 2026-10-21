// Screenshots + checks for the landing page (/) — round plan §2/§6.
//   pnpm build && DATA_MODE=memory pnpm start --port 3237 &
//   node design/landing/shoot.mjs [baseUrl] [--no-shots]
// Writes design/landing/*.png and prints: horizontal overflow per viewport, axe-core serious/critical findings
// (WCAG 2.0/2.1/2.2 A+AA + best-practice), with motion on and with prefers-reduced-motion.
// Needs Playwright + Chromium already installed (never runs `playwright install`).
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const require = createRequire(import.meta.url);
process.env.PLAYWRIGHT_BROWSERS_PATH ??= "/opt/pw-browsers";

function loadPlaywright() {
  for (const c of [process.env.PLAYWRIGHT_PKG, "playwright", "/opt/node-tools/node_modules/playwright"].filter(Boolean)) {
    try {
      return require(c);
    } catch {
      /* next */
    }
  }
  throw new Error("Playwright not found. Set PLAYWRIGHT_PKG to a node_modules/playwright directory.");
}

const { chromium } = loadPlaywright();
const args = process.argv.slice(2);
const base = args.find((a) => a.startsWith("http")) ?? "http://localhost:3237";
const shots = !args.includes("--no-shots");
const AXE = path.join(root, "node_modules/axe-core/axe.min.js");
const out = (name) => path.join(here, name);

const browser = await chromium.launch();
const problems = [];

async function open({ width, height, reduce }) {
  const ctx = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 1,
    colorScheme: "dark",
    reducedMotion: reduce ? "reduce" : "no-preference",
    locale: "he-IL",
    hasTouch: width < 600,
    isMobile: width < 600,
  });
  const page = await ctx.newPage();
  await page.goto(base + "/", { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  return { ctx, page };
}

async function checks(page, tag) {
  const o = await page.evaluate(() => ({
    doc: document.documentElement.scrollWidth - window.innerWidth,
    body: document.body.scrollWidth - window.innerWidth,
  }));
  if (o.doc > 0 || o.body > 0) problems.push(`${tag}: horizontal overflow ${JSON.stringify(o)}`);
  // axe hit-tests targets; sections skipped by content-visibility:auto are not laid out until they near the viewport,
  // which a reader always triggers by scrolling — render them for the audit so it measures what a reader gets
  await page.addStyleTag({ content: ".alze-defer{content-visibility:visible!important}" });
  await page.addScriptTag({ path: AXE });
  const res = await page.evaluate(() =>
    window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"] } }),
  );
  let bad = res.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  // target-size is a hit test: axe can mis-measure targets far outside the viewport. Re-check each such node on
  // screen (as a reader meets it) and keep only what still fails there.
  for (const v of bad.filter((x) => x.id === "target-size")) {
    const still = [];
    for (const n of v.nodes) {
      const sel = n.target.join(" ");
      await page.evaluate((s) => document.querySelector(s)?.scrollIntoView({ block: "center" }), sel);
      await page.waitForTimeout(150);
      const again = await page.evaluate((s) => window.axe.run(s, { runOnly: { type: "rule", values: ["target-size"] } }), sel);
      if (again.violations.length) still.push(n);
    }
    v.nodes = still;
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  bad = bad.filter((v) => v.nodes.length);
  for (const v of bad) problems.push(`${tag}: ${v.impact} ${v.id} — ${v.help}\n    ${v.nodes.map((n) => n.target.join(" ")).join("\n    ")}`);
  const minor = res.violations.filter((v) => !(v.impact === "serious" || v.impact === "critical")).map((v) => `${v.impact} ${v.id}`);
  console.log(`${tag}: overflow ${o.doc}/${o.body}, axe serious/critical ${bad.length}${minor.length ? `, other: ${minor.join(", ")}` : ""}`);
}

/**
 * Full-page shots: render the content-visibility:auto sections too (the browser skips them while off screen), and
 * scroll through once so the lazy images (the hoopoe below the fold) load, as they do for a reader.
 */
async function fullPage(page, name) {
  await page.addStyleTag({ content: ".alze-defer{content-visibility:visible!important}" });
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y < height; y += 600) {
    await page.evaluate((y) => window.scrollTo(0, y), y);
    await page.waitForTimeout(120);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(600);
  await page.screenshot({ path: out(name), fullPage: true });
}

/** Scroll the pinned day track to the middle of scene i (0..3) and let the chat play. */
async function toScene(page, i) {
  await page.evaluate((i) => {
    const t = document.querySelector("[data-day-track]");
    const top = t.getBoundingClientRect().top + window.scrollY;
    const run = t.offsetHeight - window.innerHeight;
    window.scrollTo(0, Math.round(top + ((i + 0.55) / 4) * run));
  }, i);
  await page.waitForTimeout(3600);
}

// phones: motion on (the day scene is a vertical sequence here anyway)
{
  const { ctx, page } = await open({ width: 375, height: 812 });
  await page.waitForTimeout(7000); // the hero chat plays up to the approval buttons
  if (shots) await page.screenshot({ path: out("landing-375-hero.png") });
  await checks(page, "375 motion");
  if (shots) await fullPage(page, "landing-375-full.png");
  await ctx.close();
}

// desktop, motion on: hero, the four pinned scenes, the rest
{
  const { ctx, page } = await open({ width: 1280, height: 800 });
  await page.waitForTimeout(7000);
  if (shots) await page.screenshot({ path: out("landing-1280-hero.png") });
  await page.waitForSelector("[data-day-track]", { timeout: 10000 });
  for (let i = 0; i < 4; i++) {
    await toScene(page, i);
    if (shots) await page.screenshot({ path: out(`landing-1280-day-${i + 1}.png`) });
  }
  await checks(page, "1280 motion (pinned)");
  for (const id of ["professions", "trust", "pricing", "faq"]) {
    await page.evaluate((id) => window.scrollTo(0, document.getElementById(id).getBoundingClientRect().top + window.scrollY), id);
    await page.waitForTimeout(900);
    if (shots) await page.screenshot({ path: out(`landing-1280-${id}.png`) });
  }
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForTimeout(1500);
  if (shots) await page.screenshot({ path: out("landing-1280-end.png") });
  await ctx.close();
}

// desktop, reduced motion: no pinning, static scenes — also the readable full-page shot
{
  const { ctx, page } = await open({ width: 1280, height: 800, reduce: true });
  await page.waitForTimeout(600);
  const pinned = await page.$("[data-day-track]");
  if (pinned) problems.push("1280 reduced motion: the pinned scene rendered");
  await checks(page, "1280 reduced motion");
  if (shots) await fullPage(page, "landing-1280-full.png");
  await ctx.close();
}

// phones, reduced motion
{
  const { ctx, page } = await open({ width: 375, height: 812, reduce: true });
  await checks(page, "375 reduced motion");
  await ctx.close();
}

await browser.close();
if (problems.length) {
  console.log("\nPROBLEMS:\n" + problems.join("\n"));
  process.exit(1);
}
console.log("\nok: no overflow, axe clean");
