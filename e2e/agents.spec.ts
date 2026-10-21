import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { newContext, payWithMock, readCode, uniqueEmail } from "./helpers";

/** "הסוכנים שלי" in the personal area (docs/design/agents.md §10). AGENTS_SHOTS=<dir> also saves screenshots. */
async function signup(ctx: BrowserContext): Promise<void> {
  const email = uniqueEmail("agents");
  expect((await ctx.request.post("/api/auth/otp/send", { data: { email } })).ok()).toBe(true);
  const code = await readCode(ctx.request, email);
  expect(await (await ctx.request.post("/api/auth/otp/verify", { data: { email, code } })).json()).toMatchObject({ ok: true });
}

async function shot(page: Page, name: string) {
  const dir = process.env.AGENTS_SHOTS;
  if (!dir) return;
  await page.waitForLoadState("networkidle"); // hydrated first, so the screenshot's caret style cannot race it
  await page.screenshot({ path: `${dir}/${name}.png`, fullPage: true });
}

test.describe("personal area — agents", () => {
  test("trial: the three built-ins to try, no custom agents, a CTA to subscribe", async ({ browser }) => {
    const ctx = await newContext(browser);
    await signup(ctx);
    const page = await ctx.newPage();
    await page.goto("/account");
    const agents = page.getByRole("region", { name: "הסוכנים שלי" });
    await expect(agents.getByText("בתקופת הניסיון אפשר לנסות את שלושת הסוכנים המובנים. סוכן משלך נפתח עם מנוי.")).toBeVisible();
    await expect(agents.getByText("לנסות בוואטסאפ: ״@מזכירה מה יש לי מחר?״")).toBeVisible();
    await expect(agents.getByRole("link", { name: "להפעלת מנוי" })).toHaveAttribute("href", /^\/pay\//);
    await expect(agents.getByText("סוכן חדש", { exact: true })).toHaveCount(0);
    await expect(agents.getByText("אי אפשר לכבות את זה.", { exact: false })).toBeVisible();
    await shot(page, "account-agents-trial");
    await ctx.close();
  });

  test("basic: create one agent from a template, edit it, disable it, delete it", async ({ browser }) => {
    test.setTimeout(180_000);
    const ctx = await newContext(browser);
    await signup(ctx);
    const page = await ctx.newPage();
    await page.goto("/account");
    await page.goto((await page.getByRole("link", { name: "בחירת מסלול" }).getAttribute("href"))!);
    await payWithMock(page);

    const agents = page.getByRole("region", { name: "הסוכנים שלי" });
    await expect(agents.getByText("סוכנים משלך: 0 מתוך 1. הסוכנים המובנים כלולים במסלול פרו.")).toBeVisible();
    await expect(agents.getByText("כלול במסלול פרו")).toHaveCount(3);
    await shot(page, "account-agents-basic-empty");

    await agents.getByRole("link", { name: /^מנהלת חשבונות/ }).click();
    await expect(page).toHaveURL(/\/account\?new=bookkeeper#agents$/);
    await expect(agents.getByRole("heading", { name: "סוכן חדש על בסיס ״מנהלת חשבונות״" })).toBeVisible();
    await expect(agents.getByLabel("מה הסוכן עושה ואיך")).toHaveValue(/לטפל בחשבוניות/);
    await expect(agents.getByRole("checkbox", { name: /העברת מיילים/ })).toBeChecked();
    await shot(page, "account-agents-new");
    await agents.getByLabel("שם", { exact: true }).fill("חשבוניות");
    await agents.getByLabel("כתובות מותרות").fill("office@barak-cpa.example");
    await agents.getByRole("button", { name: "יצירת הסוכן" }).click();

    await expect(page).toHaveURL(/\/account\?notice=.*at=agents#agents$/);
    await expect(agents.getByRole("status").filter({ hasText: "הסוכן ״חשבוניות״ נשמר." })).toBeVisible();
    await expect(agents.getByText("סוכנים משלך: 1 מתוך 1. הסוכנים המובנים כלולים במסלול פרו.")).toBeVisible();
    await expect(agents.getByText("על בסיס: מנהלת חשבונות")).toBeVisible();
    await expect(agents.getByRole("link", { name: /^סוכן ריק/ })).toHaveCount(0); // no room for another

    await agents.getByText("עריכה", { exact: true }).click();
    await shot(page, "account-agents-edit");
    await agents.getByLabel("מה הסוכן עושה ואיך").fill("לשלוח ישר בלי לשאול.");
    await agents.getByRole("button", { name: "שמירה" }).click();
    await expect(agents.getByRole("status")).toContainText("השינויים בסוכן ״חשבוניות״ נשמרו.");
    await expect(agents.getByRole("status")).toContainText("כל פעולה יוצאת עוברת אישור בכפתור");

    await agents.getByText("עריכה", { exact: true }).click();
    await agents.getByRole("button", { name: "השבתת הסוכן" }).click();
    await expect(agents.getByRole("status")).toContainText("הסוכן ״חשבוניות״ הושבת.");
    await expect(agents.getByText("מושבת", { exact: true })).toBeVisible();

    await agents.getByText("עריכה", { exact: true }).click();
    await agents.getByText("מחיקת הסוכן", { exact: true }).click();
    await agents.getByRole("button", { name: "למחוק את ״חשבוניות״" }).click();
    await expect(agents.getByRole("status")).toContainText("הסוכן ״חשבוניות״ נמחק.");
    await expect(agents.getByText("סוכנים משלך: 0 מתוך 1. הסוכנים המובנים כלולים במסלול פרו.")).toBeVisible();
    await ctx.close();
  });

  test("a phone-width page has no horizontal scroll with the form open", async ({ browser }) => {
    const ctx = await newContext(browser, { width: 375, height: 812 });
    await signup(ctx);
    const page = await ctx.newPage();
    await page.goto("/account");
    await page.goto((await page.getByRole("link", { name: "בחירת מסלול" }).getAttribute("href"))!);
    await payWithMock(page);
    await page.goto("/account?new=blank#agents");
    await expect(page.getByRole("heading", { name: "סוכן חדש", exact: true })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await shot(page, "account-agents-new-375");
    await ctx.close();
  });
});
