import { expect, test, type Page } from "@playwright/test";
import { demoUserId } from "../lib/auth/demo-user";
import { derivedKey } from "../lib/auth/keys";
import { createPayLinkToken } from "../lib/billing/pay-link";
import { keyFromBase64 } from "../lib/crypto";
import { DEMO_PORT_B, E2E_DEMO_KEY } from "../playwright.demo.config";
import { enterCode, newContext, submitEmail, uniqueEmail } from "./helpers";

/**
 * DEMO_MODE=1 on a production build (playwright.demo.config.ts): the whole site with zero keys and nothing sent —
 * the fixed code 123456, the Microsoft fixture, the strip and noindex on every page, and a second instance (B) that
 * never saw the user but serves its /account and /pay from the signed session.
 */
const B = `http://localhost:${DEMO_PORT_B}`;
const master = keyFromBase64(E2E_DEMO_KEY);
const STRIP = "גרסת הדגמה — שום דבר לא נשלח באמת";

/** DEMO_SCREENS_DIR=<dir> pnpm e2e:demo → screenshots of the demo-only UI for review (nothing written otherwise). */
async function snap(page: Page, name: string) {
  if (process.env.DEMO_SCREENS_DIR) await page.screenshot({ path: `${process.env.DEMO_SCREENS_DIR}/${name}.png` });
}

async function expectDemoChrome(page: Page) {
  await expect(page.getByRole("note").filter({ hasText: STRIP })).toBeVisible();
}

test.describe("DEMO_MODE=1 — production build, zero keys", () => {
  test("every page: the strip, X-Robots-Tag and robots meta; health says demo-memory", async ({ browser }) => {
    const ctx = await newContext(browser);
    const page = await ctx.newPage();
    for (const path of ["/", "/start", "/login", "/privacy"]) {
      const res = await page.goto(path);
      expect(res!.headers()["x-robots-tag"], path).toBe("noindex, nofollow");
      await expectDemoChrome(page);
      await expect(page.locator('meta[name="robots"]').first()).toHaveAttribute("content", /noindex/);
      await snap(page, `page${path.replace(/\//g, "-")}`);
    }
    const health = await ctx.request.get("/api/health");
    expect(await health.json()).toMatchObject({ mode: "demo-memory" });
    expect(health.headers()["x-robots-tag"]).toBe("noindex, nofollow");
    // the dev outbox stays closed in production, demo included
    expect((await ctx.request.get("/api/dev/outbox")).status()).toBe(404);
    await ctx.close();
  });

  test("/ → /start → email → 123456 → connect (Microsoft fixture) → ready → /account, then instance B and /pay", async ({ browser }) => {
    test.setTimeout(180_000);
    const ctx = await newContext(browser);
    const page = await ctx.newPage();
    const email = uniqueEmail("demo");

    // landing → the signup intro
    await page.goto("/");
    await page.locator('a[href="/start"]').first().click();
    await expect(page).toHaveURL(/\/start$/);
    await page.getByRole("link", { name: /בואו נתחיל/ }).first().click();

    // email card → code card: nothing is mailed, the card names the code
    await expect(page).toHaveURL(/\/start\/email$/);
    await submitEmail(page, email);
    await expect(page).toHaveURL(/\/start\/code\?/);
    await expect(page.getByRole("note").filter({ hasText: "בגרסת ההדגמה הקוד הוא 123456" })).toBeVisible();
    await snap(page, "code");
    await enterCode(page, "654321");
    await expect(page.getByRole("alert").filter({ hasText: "הקוד לא נכון" })).toBeVisible();
    await enterCode(page, "123456");

    // connect → the hand-off screen → the fixture connection → ready, without leaving the site
    await expect(page).toHaveURL(/\/start\/connect$/);
    const offSite: string[] = [];
    page.on("request", (r) => {
      const host = new URL(r.url()).hostname;
      if (host !== "localhost") offSite.push(r.url());
    });
    await page.getByRole("link", { name: /Microsoft 365/ }).click();
    await expect(page).toHaveURL(/\/connect\/microsoft$/);
    await expect(page).toHaveURL(/\/start\/ready\?connected=microsoft(&|$)/, { timeout: 30_000 });
    expect(offSite, "the demo never calls Microsoft").toEqual([]);
    await expect(page.getByText("Outlook מחובר")).toBeVisible();
    const wa = page.getByRole("link", { name: "חיבור לוואטסאפ" });
    await expect(wa).toHaveAttribute("href", /^https:\/\/wa\.me\/\d+\?text=/);
    // the demo dialog, once the ready step wraps its button with <DemoWaGate> (docs/deploy.md)
    if (await page.locator("[data-demo-wa]").count()) {
      await wa.click();
      const dialog = page.getByRole("dialog");
      await expect(dialog).toContainText("בגרסה האמיתית ייפתח וואטסאפ עם ההודעה:");
      await expect(dialog).toContainText(/היי עלזה! אפשר לקשר את החשבון שלי \([A-Z0-9]{4}-[A-Z0-9]{4}\)/);
      await snap(page, "ready-dialog");
      await dialog.getByRole("button", { name: "הבנתי" }).click();
      await expect(dialog).toBeHidden();
      expect(ctx.pages()).toHaveLength(1); // no WhatsApp tab
    }

    // the personal area on instance A: the account and its Microsoft connection
    await page.goto("/account");
    await expect(page).toHaveURL(/\/account$/);
    await expect(page.getByRole("main").getByText(email).first()).toBeVisible();
    await expect(page.getByRole("main").getByText(/Microsoft 365|Outlook/).first()).toBeVisible();

    // instance B never saw this user: same cookie (cookies are per host, not per port) → recreated from the session
    await page.goto(`${B}/account`);
    await expect(page).toHaveURL(`${B}/account`);
    await expect(page.getByRole("main").getByText(email).first()).toBeVisible();
    await expectDemoChrome(page);

    // /pay on B: the personal payment link → the HYP stand-in → back on /account with the plan active
    const payToken = createPayLinkToken(demoUserId(email, derivedKey("demo", master)), { key: derivedKey("session", master) });
    await page.goto(`${B}/pay/${payToken}`);
    await expect(page.getByText(email)).toBeVisible();
    await page.getByRole("button", { name: "לתשלום" }).first().click();
    await expect(page).toHaveURL(new RegExp(`^${B}/account\\?notice=`), { timeout: 30_000 });
    await expect(page.getByText("התשלום התקבל והחשבון פעיל")).toBeVisible();
    await ctx.close();
  });

  test("/login → email → 123456 → /account", async ({ browser }) => {
    const setup = await newContext(browser);
    const email = uniqueEmail("demo-login");
    expect((await setup.request.post("/api/auth/otp/send", { data: { email } })).ok()).toBe(true);
    expect(await (await setup.request.post("/api/auth/otp/verify", { data: { email, code: "123456" } })).json()).toMatchObject({ ok: true, isNewUser: true });
    await setup.close();

    const ctx = await newContext(browser);
    const page = await ctx.newPage();
    await page.goto("/login");
    await expectDemoChrome(page);
    await page.locator('a[href="/login/email"]').first().click();
    await expect(page).toHaveURL(/\/login\/email$/);
    await submitEmail(page, email);
    await expect(page).toHaveURL(/\/login\/code\?/);
    await enterCode(page, "123456");
    await expect(page).toHaveURL(/\/account$/);
    await expect(page.getByRole("main").getByText(email).first()).toBeVisible();
    await ctx.close();
  });
});
