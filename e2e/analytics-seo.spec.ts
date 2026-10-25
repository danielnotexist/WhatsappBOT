import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomInt } from "node:crypto";
import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { BRAND } from "../lib/brand";
import { enterCode, readCode, sendWhatsapp, submitEmail, uniqueEmail, uniquePhone, waitForWaText } from "./helpers";

/**
 * Round 2 of the plan ("אנליטיקה ו-SEO"), memory mode:
 *   - a visit from a campaign (?utm_source=e2e) and the signup through the real screens → the owner sees the source
 *     "e2e" and the funnel steps in the panel's "תנועה" tab (the cookie-less beacon, /api/a, the server-side steps);
 *   - /robots.txt and /sitemap.xml are valid and /admin is closed; /opengraph-image is a PNG; the pages carry their
 *     canonical and the private ones noindex.
 * CAPTURE_TRAFFIC=<dir> also fills the store with the demo month (POST /api/dev/admin-seed) and saves the tab at 1440
 * and 390, and the share images of / and /pricing.
 */
const OWNER = "danielnotexist@gmail.com";
const SHOTS = process.env.CAPTURE_TRAFFIC;
/** a desktop browser's User-Agent: the headless one says "HeadlessChrome", which the beacon route drops as a robot */
const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";

async function visitorContext(browser: Browser, width = 1280, height = 800): Promise<BrowserContext> {
  return browser.newContext({
    viewport: { width, height },
    userAgent: UA,
    colorScheme: "dark",
    locale: "he-IL",
    extraHTTPHeaders: { "x-forwarded-for": `10.${randomInt(0, 255)}.${randomInt(0, 255)}.${randomInt(1, 254)}` },
  });
}

async function signIn(ctx: BrowserContext, email: string): Promise<void> {
  expect((await ctx.request.post("/api/auth/otp/send", { data: { email } })).ok()).toBe(true);
  const code = await readCode(ctx.request, email);
  expect(await (await ctx.request.post("/api/auth/otp/verify", { data: { email, code } })).json()).toMatchObject({ ok: true });
}

async function openPanel(ctx: BrowserContext): Promise<Page> {
  await signIn(ctx, OWNER);
  const page = await ctx.newPage();
  await page.goto("/admin/enter");
  await page.getByRole("button", { name: "שליחת קוד" }).click();
  await expect(page.getByText("הקוד נשלח למייל.", { exact: false })).toBeVisible();
  await page.getByLabel("הקוד מהמייל").fill(await readCode(ctx.request, OWNER));
  await page.getByRole("button", { name: "כניסה", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: "ניהול", exact: true })).toBeVisible();
  return page;
}

/** The count shown on a funnel row (its name, then the figure). */
async function funnelCount(page: Page, label: string): Promise<number> {
  const row = page.getByRole("region", { name: "משפך ההרשמה" }).getByRole("listitem").filter({ hasText: label }).first();
  const text = (await row.innerText()).replace(/\s+/g, " ");
  const m = new RegExp(`${label}\\s*([\\d,]+)`).exec(text);
  return m ? Number(m[1]!.replace(/,/g, "")) : 0;
}

test("a campaign visit and a signup show up in the owner's traffic tab: the source and every funnel step", async ({ browser }) => {
  test.setTimeout(300_000);
  const owner = await visitorContext(browser, 1440, 1000);
  const panel = await openPanel(owner);
  await panel.goto("/admin?tab=traffic&range=7");
  await expect(panel.getByRole("heading", { level: 2, name: "תנועה באתר" })).toBeVisible();
  const before = { start: await funnelCount(panel, "התחלת הרשמה"), ok: await funnelCount(panel, "קוד אומת"), linked: await funnelCount(panel, "וואטסאפ מחובר") };

  // the visitor: a campaign link, then the signup screens
  const ctx = await visitorContext(browser);
  const page = await ctx.newPage();
  const beacons: string[] = [];
  page.on("request", (r) => {
    if (r.url().endsWith("/api/a") && r.method() === "POST") beacons.push(r.postData() ?? "");
  });
  await page.goto("/?utm_source=e2e&utm_medium=test&utm_campaign=round2");
  await expect.poll(() => beacons.length, { message: "the page view beacon" }).toBeGreaterThan(0);
  const first = JSON.parse(beacons[0]!) as Record<string, unknown>;
  expect(first).toMatchObject({ path: "/", utm_source: "e2e", utm_medium: "test", utm_campaign: "round2", device: "desktop", event: null });
  expect(JSON.stringify(first)).not.toContain("?"); // the query never travels in the path

  await page.goto("/start");
  await page.getByRole("link", { name: "בואו נתחיל" }).click();
  await expect(page).toHaveURL(/\/start\/email$/);
  await expect.poll(() => beacons.some((b) => b.includes('"signup_start"')), { message: "signup_start" }).toBe(true);
  const email = uniqueEmail("traffic");
  await submitEmail(page, email);
  await expect.poll(() => beacons.some((b) => b.includes('"code_sent"')), { message: "code_sent" }).toBe(true);
  // the code card's address is in its URL: it must never reach the beacon
  expect(beacons.join("\n")).not.toContain(email);
  await enterCode(page, await readCode(ctx.request, email));
  await expect(page).toHaveURL(/\/start\/connect$/);
  expect(beacons.some((b) => b.includes('"code_ok"'))).toBe(true);
  await page.getByRole("link", { name: "דילוג בינתיים" }).click();
  await expect(page).toHaveURL(/\/start\/ready$/);
  const href = (await page.getByRole("link", { name: "חיבור לוואטסאפ" }).getAttribute("href"))!;
  const phone = uniquePhone();
  await sendWhatsapp(ctx.request, phone, new URL(href).searchParams.get("text")!);
  await waitForWaText(ctx.request, phone, /החשבון מקושר/);
  // a payment link (an excluded path: a token in the address) sends nothing
  const silent = beacons.length;
  await page.goto("/pay/not-a-token");
  await page.waitForTimeout(800);
  expect(beacons.length).toBe(silent);
  await ctx.close();

  // the owner's tab: the campaign as a source, one more at every step up to the WhatsApp link
  await expect
    .poll(
      async () => {
        await panel.goto("/admin?tab=traffic&range=7");
        return panel.getByRole("region", { name: "מאיפה הגיעו" }).getByText("e2e", { exact: true }).count();
      },
      { message: "the source e2e in the tab" },
    )
    .toBeGreaterThan(0);
  expect(await funnelCount(panel, "התחלת הרשמה")).toBeGreaterThanOrEqual(before.start + 1);
  expect(await funnelCount(panel, "קוד אומת")).toBeGreaterThanOrEqual(before.ok + 1);
  expect(await funnelCount(panel, "וואטסאפ מחובר")).toBeGreaterThanOrEqual(before.linked + 1);
  expect(await funnelCount(panel, "ביקור באתר")).toBeGreaterThan(0);
  await expect(panel.getByRole("region", { name: "הדפים המובילים", exact: true }).getByText("/start/email")).toBeVisible();
  // the range switch
  await panel.getByRole("navigation", { name: "טווח הימים" }).getByRole("link", { name: "90 ימים" }).click();
  await expect(panel.getByRole("navigation", { name: "טווח הימים" }).getByRole("link", { name: "90 ימים" })).toHaveAttribute("aria-current", "page");

  if (SHOTS) {
    mkdirSync(SHOTS, { recursive: true });
    expect((await owner.request.post("/api/dev/admin-seed")).ok()).toBe(true);
    await panel.goto("/admin?tab=traffic&range=30");
    await panel.waitForLoadState("networkidle");
    await panel.screenshot({ path: join(SHOTS, "traffic-tab-1440.png"), fullPage: true, caret: "initial" });
    const narrow = await visitorContext(browser, 390, 844);
    await narrow.addCookies(await owner.cookies());
    const phonePage = await narrow.newPage();
    await phonePage.goto("/admin?tab=traffic&range=30");
    await expect(phonePage.getByRole("heading", { level: 2, name: "תנועה באתר" })).toBeVisible();
    expect(await phonePage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    await phonePage.waitForLoadState("networkidle");
    await phonePage.screenshot({ path: join(SHOTS, "traffic-tab-390.png"), fullPage: true, caret: "initial" });
    await narrow.close();
    for (const [name, path] of [["og-home.png", "/opengraph-image"], ["og-pricing.png", "/pricing/opengraph-image"], ["og-lawyers.png", "/for/lawyers/opengraph-image"]] as const) {
      writeFileSync(join(SHOTS, name), await (await owner.request.get(path)).body());
    }
  }
  await owner.close();
});

test("robots.txt, sitemap.xml and the share image; canonical on public pages, noindex on private ones", async ({ request }) => {
  const robots = await request.get("/robots.txt");
  expect(robots.ok()).toBe(true);
  expect(robots.headers()["content-type"]).toContain("text/plain");
  const lines = (await robots.text()).split("\n").map((l) => l.trim());
  expect(lines).toContain("User-Agent: *");
  const disallowed = lines.filter((l) => l.startsWith("Disallow:")).map((l) => l.slice("Disallow:".length).trim());
  // the panel is closed whichever deployment this is (a local run closes everything: not production)
  expect(disallowed.some((d) => d && "/admin".startsWith(d))).toBe(true);

  const sitemap = await request.get("/sitemap.xml");
  expect(sitemap.ok()).toBe(true);
  const xml = await sitemap.text();
  expect(xml).toMatch(/^<\?xml version="1.0" encoding="UTF-8"\?>\s*<urlset xmlns="http:\/\/www.sitemaps.org\/schemas\/sitemap\/0.9">/);
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]!).pathname);
  expect(locs).toEqual(expect.arrayContaining(["/", "/pricing", "/for/lawyers", "/for/accountants", "/for/consultants", "/for/clinics", "/start"]));
  expect(locs.some((p) => /^\/(admin|account|pay|api|login|invoice|demo)/.test(p))).toBe(false);
  expect([...xml.matchAll(/<lastmod>([^<]+)<\/lastmod>/g)]).toHaveLength(locs.length);

  for (const path of ["/opengraph-image", "/pricing/opengraph-image", "/for/clinics/opengraph-image"]) {
    const og = await request.get(path);
    expect(og.ok(), path).toBe(true);
    expect(og.headers()["content-type"]).toBe("image/png");
    const png = await og.body();
    expect(png.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
    expect(png.readUInt32BE(16)).toBe(1200);
    expect(png.readUInt32BE(20)).toBe(630);
  }

  const home = await (await request.get("/")).text();
  expect(home).toMatch(/<link rel="canonical" href="http:\/\/localhost:\d+"\/>/);
  expect(home).toContain('<meta property="og:locale" content="he_IL"/>');
  expect(home).toContain('<meta name="twitter:card" content="summary_large_image"/>');
  expect(home).toContain('"@type":"SoftwareApplication"');
  const lawyers = await (await request.get("/for/lawyers")).text();
  expect(lawyers).toMatch(/<link rel="canonical" href="http:\/\/localhost:\d+\/for\/lawyers"\/>/);
  expect(lawyers).toContain("/for/lawyers/opengraph-image");
  const login = await request.get("/login");
  expect(await login.text()).toContain('<meta name="robots" content="noindex, nofollow"/>');
  expect(login.headers()["x-robots-tag"]).toBe("noindex, nofollow");
  expect((await request.get("/for/no-such-office")).status()).toBe(404);
});

const AXE_PATH = join(process.cwd(), "node_modules", "axe-core", "axe.min.js");

async function axeSeriousOrCritical(page: Page): Promise<string[]> {
  await page.addScriptTag({ path: AXE_PATH });
  const result = (await page.evaluate(() =>
    (window as unknown as { axe: { run: (ctx: Document, opts: unknown) => Promise<unknown> } }).axe.run(document, {
      runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"] },
    }),
  )) as { violations: { id: string; impact: string | null; help: string; nodes: { target: string[] }[] }[] };
  return result.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.impact} ${v.id}: ${v.help} ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
}

for (const width of [1440, 390]) {
  test(`a profession page at ${width}: its headline, the way to sign up, no horizontal overflow, axe clean`, async ({ browser }) => {
    const ctx = await visitorContext(browser, width, 900);
    const page = await ctx.newPage();
    await page.goto("/for/accountants");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("עוזרת אישית בוואטסאפ, למשרד רואי חשבון.");
    await expect(page.getByRole("link", { name: "בואו נתחיל - לוקח דקה" }).first()).toHaveAttribute("href", "/start");
    await expect(page.getByRole("navigation", { name: "גם למשרדים אחרים" }).getByRole("link")).toHaveCount(3);
    expect(await page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - window.innerWidth)).toBeLessThanOrEqual(1);
    expect(await axeSeriousOrCritical(page)).toEqual([]);
    // the landing's section links here
    await page.goto("/");
    await expect(page.locator("#professions").getByRole("link", { name: `עוד על ${BRAND.name} לרואי חשבון` })).toHaveAttribute("href", "/for/accountants");
    await ctx.close();
  });
}
