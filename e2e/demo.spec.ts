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
const STRIP = "גרסת הדגמה - שום דבר לא נשלח באמת";

/** DEMO_SCREENS_DIR=<dir> pnpm e2e:demo → screenshots of the demo-only UI for review (nothing written otherwise). */
async function snap(page: Page, name: string) {
  if (process.env.DEMO_SCREENS_DIR) await page.screenshot({ path: `${process.env.DEMO_SCREENS_DIR}/${name}.png` });
}

async function expectDemoChrome(page: Page) {
  await expect(page.getByRole("note").filter({ hasText: STRIP })).toBeVisible();
}

test.describe("DEMO_MODE=1 — production build, zero keys", () => {
  test("every page: the strip, X-Robots-Tag and robots meta; health answers (details only with CRON_SECRET)", async ({ browser }) => {
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
    expect(await health.json()).toEqual({ ok: true });
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
    await page.getByRole("link", { name: "המשך עם מייל" }).first().click();

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
    await expect(page).toHaveURL(new RegExp(`^${B}/account\\?tab=plan&notice=`), { timeout: 30_000 });
    await expect(page.getByText("התשלום התקבל והחשבון פעיל")).toBeVisible();
    await ctx.close();
  });

  test("/demo/chat: 404 signed out; from /account → welcome → a button → a typed draft → 'בטל'; the history after a reload", async ({ browser }) => {
    test.setTimeout(150_000);
    const ctx = await newContext(browser);
    // signed out: the page is a real 404 and the API answers 401
    expect((await ctx.request.get("/demo/chat")).status()).toBe(404);
    expect((await ctx.request.get("/api/demo/chat")).status()).toBe(401);

    const email = uniqueEmail("demo-chat");
    expect((await ctx.request.post("/api/auth/otp/send", { data: { email } })).ok()).toBe(true);
    expect((await ctx.request.post("/api/auth/otp/verify", { data: { email, code: "123456" } })).ok()).toBe(true);
    const doc = await ctx.request.get("/demo/chat");
    expect(doc.status()).toBe(200);
    expect(doc.headers()["permissions-policy"]).toContain("microphone=(self)");

    const page = await ctx.newPage();
    await page.goto("/account");
    await page.getByRole("link", { name: "לבדוק את עלזה בצ'אט" }).click();
    await expect(page).toHaveURL(/\/demo\/chat$/);
    await expectDemoChrome(page);
    const log = page.getByRole("log", { name: "השיחה" });

    // first visit: the chat's number is linked and the WhatsApp welcome arrives, with its buttons
    await expect(log.getByText("החשבון מקושר. מעכשיו אפשר לכתוב לי כאן.")).toBeVisible();
    await log.getByRole("button", { name: "נתחיל לעבוד" }).click();
    await expect(log.getByText(/ננסה משהו אמיתי/)).toBeVisible();
    const starters = page.getByRole("group", { name: "רעיונות להתחלה" });
    await expect(starters).toBeVisible(); // the first task: the suggestions fit

    // a typed message → the draft with שלח / ערוך / בטל (mock AI) → בטל
    await page.getByRole("textbox", { name: "הודעה" }).fill("תנסחי מייל לדנה שהפגישה זזה ליום ה׳");
    await page.keyboard.press("Enter");
    await expect(log.getByText("טיוטה למייל")).toBeVisible();
    await expect(log.getByText("כדי שנדבר בנוח - איך לקרוא לך?")).toBeVisible(); // the site's short hyphen
    await expect(starters).toHaveCount(0); // a suggestion tapped now would be taken as the name
    await snap(page, "chat-draft");
    await log.getByRole("button", { name: "בטל", exact: true }).click();
    await expect(log.getByText("בוטל. הטיוטה נמחקה ולא נשלחה.")).toBeVisible();
    await expect(log.getByRole("button", { name: "בטל", exact: true })).toBeDisabled();

    // a reload: the same conversation from the history
    await page.reload();
    await expect(log.getByText("בוטל. הטיוטה נמחקה ולא נשלחה.")).toBeVisible();
    await expect(log.getByText("תנסחי מייל לדנה שהפגישה זזה ליום ה׳").first()).toBeVisible(); // the bubble (the draft quotes it too)
    await expect(log.getByText("טיוטה למייל")).toBeVisible();

    // a phone: the chat is the whole screen, the composer at the bottom of the viewport
    await page.setViewportSize({ width: 390, height: 780 });
    const input = page.getByRole("textbox", { name: "הודעה" });
    await expect(input).toBeInViewport();
    const box = (await input.boundingBox())!;
    expect(box.y + box.height).toBeGreaterThan(700);
    await snap(page, "chat-phone");
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
