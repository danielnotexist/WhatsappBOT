import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { newContext, payWithMock, readCode, sendWhatsapp, uniqueEmail, uniquePhone, waitForWaText } from "./helpers";

/**
 * Round plan §6 step 4 (and the polish round) — every signup / sign-in screen and the personal area at 375×812,
 * 768×1024 and 1280×800 (dark): no horizontal overflow, and axe-core with 0 serious/critical findings.
 * With CAPTURE_SCREENS=1 the screenshots are written to design/signup-screens/<screen>-<width>.png (plus
 * <screen>-375-full.png when the phone page scrolls) and design/account/<state>-<width>.png.
 */
const AXE_PATH = join(process.cwd(), "node_modules", "axe-core", "axe.min.js");
const OUT_DIR = join(process.cwd(), "design", "signup-screens");
const ACCOUNT_DIR = join(process.cwd(), "design", "account");
const CAPTURE = process.env.CAPTURE_SCREENS === "1";

const VIEWPORTS = [
  { width: 375, height: 812 },
  { width: 768, height: 1024 },
  { width: 1280, height: 800 },
] as const;

type Screen = { name: string; path: (email: string) => string; ready: (page: Page) => Promise<void> };

const SCREENS: Screen[] = [
  { name: "start", path: () => "/start", ready: (p) => expect(p.getByRole("link", { name: "בואו נתחיל" })).toBeVisible() },
  { name: "email", path: () => "/start/email", ready: (p) => expect(p.getByRole("heading", { name: "מה המייל שלך?" })).toBeVisible() },
  { name: "code", path: (e) => `/start/code?email=${encodeURIComponent(e)}`, ready: (p) => expect(p.getByRole("heading", { name: "הזינו את הקוד" })).toBeVisible() },
  { name: "connect", path: () => "/start/connect", ready: (p) => expect(p.getByRole("link", { name: "חיבור Gmail" })).toBeVisible() },
  { name: "connect-microsoft", path: () => "/connect/microsoft", ready: (p) => expect(p.getByText("מעבירים אותך ל-Microsoft…")).toBeVisible() },
  { name: "ready", path: () => "/start/ready", ready: (p) => expect(p.getByRole("link", { name: "חיבור לוואטסאפ" })).toBeVisible() },
  { name: "login", path: () => "/login", ready: (p) => expect(p.getByRole("link", { name: "המשך עם מייל" })).toBeVisible() },
  { name: "login-email", path: () => "/login/email", ready: (p) => expect(p.getByRole("heading", { name: "מה המייל שלך?" })).toBeVisible() },
  { name: "login-whatsapp", path: () => "/login/whatsapp", ready: (p) => expect(p.getByRole("link", { name: "פתיחת וואטסאפ" })).toBeVisible() },
  { name: "login-link-expired", path: () => "/login/w/not-a-token", ready: (p) => expect(p.getByRole("heading", { name: "הקישור לא בתוקף" })).toBeVisible() },
  { name: "privacy", path: () => "/privacy", ready: (p) => expect(p.getByRole("note")).toBeVisible() },
];

async function signedInContext(browser: Parameters<typeof newContext>[0], width: number, height: number): Promise<{ ctx: BrowserContext; email: string }> {
  const ctx = await newContext(browser, { width, height });
  const email = uniqueEmail(`screens${width}`);
  expect((await ctx.request.post("/api/auth/otp/send", { data: { email } })).ok()).toBe(true);
  const code = await readCode(ctx.request, email);
  expect((await ctx.request.post("/api/auth/otp/verify", { data: { email, code } })).ok()).toBe(true);
  return { ctx, email };
}

interface AxeResult {
  violations: { id: string; impact: string | null; help: string; nodes: { target: string[]; failureSummary?: string }[] }[];
}

async function axeSeriousOrCritical(page: Page): Promise<string[]> {
  await page.addScriptTag({ path: AXE_PATH });
  const result = (await page.evaluate(() =>
    (window as unknown as { axe: { run: (ctx: Document, opts: unknown) => Promise<unknown> } }).axe.run(document, {
      runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"] },
    }),
  )) as AxeResult;
  return result.violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => `${v.impact} ${v.id}: ${v.help}\n    ${v.nodes.map((n) => `${n.target.join(" ")} — ${n.failureSummary ?? ""}`).join("\n    ")}`);
}

/** Overflow + axe for the current page; optionally a screenshot. */
async function check(page: Page, name: string, width: number, problems: string[], shot?: { dir: string; full?: boolean }) {
  await page.evaluate(() => document.fonts.ready);
  const overflow = await page.evaluate(() => ({
    doc: document.documentElement.scrollWidth - window.innerWidth,
    body: document.body.scrollWidth - window.innerWidth,
  }));
  if (overflow.doc > 0 || overflow.body > 0) problems.push(`${name}@${width}: horizontal overflow ${JSON.stringify(overflow)}`);
  if (CAPTURE && shot) {
    await page.screenshot({ path: join(shot.dir, `${name}-${width}.png`), fullPage: shot.full ?? false });
    const tall = await page.evaluate(() => document.documentElement.scrollHeight > window.innerHeight + 4);
    if (!shot.full && tall && width < 768) await page.screenshot({ path: join(shot.dir, `${name}-${width}-full.png`), fullPage: true });
  }
  for (const v of await axeSeriousOrCritical(page)) problems.push(`${name}@${width}: ${v}`);
}

for (const vp of VIEWPORTS) {
  test.describe(`screens at ${vp.width}×${vp.height}`, () => {
    test(`signup and sign-in: no overflow, axe clean${CAPTURE ? ", screenshots" : ""}`, async ({ browser }) => {
      test.setTimeout(300_000);
      if (CAPTURE) mkdirSync(OUT_DIR, { recursive: true });
      const { ctx, email } = await signedInContext(browser, vp.width, vp.height);
      // keep the hand-off screen on screen: a 204 answer cancels the browser's navigation to our OAuth start route
      await ctx.route("**/api/auth/microsoft/start**", (route) => route.fulfill({ status: 204 }));
      const page = await ctx.newPage();
      const problems: string[] = [];

      for (const screen of SCREENS) {
        await page.goto(screen.path(email));
        await screen.ready(page);
        await page.waitForTimeout(screen.name === "ready" ? 2600 : 1300); // paper morph, phone ring; on "ready" the reply lands while confetti still falls
        await check(page, screen.name, vp.width, problems, { dir: OUT_DIR });
      }
      await ctx.close();
      expect(problems, problems.join("\n")).toEqual([]);
    });

    test(`personal area (new, trial in use, paid): no overflow, axe clean${CAPTURE ? ", screenshots" : ""}`, async ({ browser }) => {
      test.setTimeout(300_000);
      if (CAPTURE) mkdirSync(ACCOUNT_DIR, { recursive: true });
      const { ctx } = await signedInContext(browser, vp.width, vp.height);
      const page = await ctx.newPage();
      const problems: string[] = [];

      // 1. a fresh account: nothing connected, no number, the trial untouched
      await page.goto("/account");
      await expect(page.getByRole("heading", { name: "האזור האישי" })).toBeVisible();
      await page.waitForTimeout(600);
      await check(page, "new", vp.width, problems, { dir: ACCOUNT_DIR, full: true });

      // 2. link a number with the token from /start/ready, answer the bot's first questions, connect Microsoft (fixture)
      await page.goto("/start/ready");
      const message = new URL((await page.getByRole("link", { name: "חיבור לוואטסאפ" }).getAttribute("href"))!).searchParams.get("text")!;
      const phone = uniquePhone();
      await sendWhatsapp(ctx.request, phone, message);
      await waitForWaText(ctx.request, phone, /החשבון מקושר/);
      for (const text of ["מה יש לי מחר?", "דנה לוי", "משרד עורכי דין"]) await sendWhatsapp(ctx.request, phone, text);
      await ctx.route("**/api/auth/microsoft/start**", async (route) => {
        // Playwright does not route the target of a server redirect: answer our start route and approve at once
        const res = await route.fetch({ maxRedirects: 0 });
        const authorize = new URL(res.headers()["location"]!);
        const back = new URL(authorize.searchParams.get("redirect_uri")!);
        back.searchParams.set("code", "e2e-code");
        back.searchParams.set("state", authorize.searchParams.get("state")!);
        await route.fulfill({ status: 302, headers: { location: back.toString() } });
      });
      await page.goto("/account");
      await page.getByRole("link", { name: "חיבור Microsoft 365" }).click();
      await expect(page.getByRole("status").filter({ hasText: "Microsoft 365" })).toBeVisible();
      await page.waitForTimeout(600);
      await check(page, "trial", vp.width, problems, { dir: ACCOUNT_DIR, full: true });

      // 3. pay (memory-mode mock) → an active basic plan; the cancel fold open
      const pay = (await page.getByRole("link", { name: "בחירת מסלול" }).getAttribute("href"))!;
      await page.goto(pay);
      await payWithMock(page);
      await page.locator("details").filter({ hasText: "ביטול המנוי" }).locator("summary").click();
      await page.waitForTimeout(600);
      await check(page, "paid", vp.width, problems, { dir: ACCOUNT_DIR, full: true });

      await ctx.close();
      expect(problems, problems.join("\n")).toEqual([]);
    });
  });
}
