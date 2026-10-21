import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { newContext, readCode, uniqueEmail } from "./helpers";

/**
 * Round plan §6 step 4 — the checkpoint: every signup screen at 375×812 and 1280×800 (dark), no horizontal
 * overflow, and axe-core with 0 serious/critical findings. With CAPTURE_SCREENS=1 the screenshots are written to
 * design/signup-screens/<screen>-<width>.png (plus <screen>-375-full.png when the phone page scrolls).
 */
const AXE_PATH = join(process.cwd(), "node_modules", "axe-core", "axe.min.js");
const OUT_DIR = join(process.cwd(), "design", "signup-screens");
const CAPTURE = process.env.CAPTURE_SCREENS === "1";

const VIEWPORTS = [
  { width: 375, height: 812 },
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
];

async function signedInContext(browser: Parameters<typeof newContext>[0], width: number, height: number): Promise<{ ctx: BrowserContext; email: string }> {
  const ctx = await newContext(browser, { width, height });
  const email = uniqueEmail(`screens${width}`);
  expect((await ctx.request.post("/api/auth/otp/send", { data: { email } })).ok()).toBe(true);
  const code = await readCode(ctx.request, email);
  expect((await ctx.request.post("/api/auth/otp/verify", { data: { email, code } })).ok()).toBe(true);
  // keep the hand-off screen on screen: a 204 answer cancels the browser's navigation to our OAuth start route
  await ctx.route("**/api/auth/microsoft/start**", (route) => route.fulfill({ status: 204 }));
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

for (const vp of VIEWPORTS) {
  test.describe(`signup screens at ${vp.width}×${vp.height}`, () => {
    test(`no overflow, axe clean${CAPTURE ? ", screenshots" : ""}`, async ({ browser }) => {
      test.setTimeout(240_000);
      if (CAPTURE) mkdirSync(OUT_DIR, { recursive: true });
      const { ctx, email } = await signedInContext(browser, vp.width, vp.height);
      const page = await ctx.newPage();
      const problems: string[] = [];

      for (const screen of SCREENS) {
        await page.goto(screen.path(email));
        await screen.ready(page);
        await page.evaluate(() => document.fonts.ready);
        await page.waitForTimeout(screen.name === "ready" ? 2600 : 1300); // card morph, phone ring; on "ready" the reply lands while confetti still falls

        const overflow = await page.evaluate(() => ({
          doc: document.documentElement.scrollWidth - window.innerWidth,
          body: document.body.scrollWidth - window.innerWidth,
        }));
        if (overflow.doc > 0 || overflow.body > 0) problems.push(`${screen.name}@${vp.width}: horizontal overflow ${JSON.stringify(overflow)}`);

        if (CAPTURE) {
          await page.screenshot({ path: join(OUT_DIR, `${screen.name}-${vp.width}.png`) });
          const tall = await page.evaluate(() => document.documentElement.scrollHeight > window.innerHeight + 4);
          if (tall && vp.width < 768) await page.screenshot({ path: join(OUT_DIR, `${screen.name}-${vp.width}-full.png`), fullPage: true });
        }

        for (const v of await axeSeriousOrCritical(page)) problems.push(`${screen.name}@${vp.width}: ${v}`);
      }
      await ctx.close();
      expect(problems, problems.join("\n")).toEqual([]);
    });
  });
}
