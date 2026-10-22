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

  test("pro: the built-ins can be tuned and disabled, up to three agents of your own", async ({ browser }) => {
    test.setTimeout(180_000);
    const ctx = await newContext(browser);
    await signup(ctx);
    const page = await ctx.newPage();
    await page.goto("/account");
    await page.goto((await page.getByRole("link", { name: "בחירת מסלול" }).getAttribute("href"))!);
    await payWithMock(page, "pro");

    const agents = page.getByRole("region", { name: "הסוכנים שלי" });
    await expect(agents.getByText("סוכנים משלך: 0 מתוך 3, בנוסף לשלושת הסוכנים המובנים.")).toBeVisible();
    await expect(agents.getByRole("link", { name: "לשדרוג לפרו" })).toHaveCount(0);
    await expect(agents.getByText("מובנה", { exact: true })).toHaveCount(3);
    await expect(agents.getByText("כלול במסלול פרו")).toHaveCount(0);
    const row = (name: string) => agents.locator("li").filter({ has: page.locator("summary") }).filter({ hasText: name });

    // the secretary: additional instructions and a recipient list; no rename, no delete
    await row("מזכירה").getByText("עריכה", { exact: true }).click();
    await expect(row("מזכירה").getByLabel("שם", { exact: true })).toHaveCount(0);
    await expect(row("מזכירה").getByText("מחיקת הסוכן", { exact: true })).toHaveCount(0);
    await row("מזכירה").getByLabel("הנחיות נוספות").fill("פגישות רק אחרי 10:00.");
    await row("מזכירה").getByLabel("כתובות מותרות").fill("barak@cpa-barak.example");
    await shot(page, "account-agents-pro-builtin");
    await row("מזכירה").getByRole("button", { name: "שמירה" }).click();
    await expect(agents.getByRole("status")).toContainText("השינויים בסוכן ״מזכירה״ נשמרו.");

    // the intern: disabled
    await row("מתמחה").getByText("עריכה", { exact: true }).click();
    await row("מתמחה").getByRole("button", { name: "השבתת הסוכן" }).click();
    await expect(agents.getByRole("status")).toContainText("הסוכן ״מתמחה״ הושבת.");
    await expect(row("מתמחה").getByText("מושבת", { exact: true })).toBeVisible();

    // an agent of your own, from scratch: the quota line counts it and there is room for more
    await agents.getByRole("link", { name: /^סוכן ריק/ }).click();
    await expect(page).toHaveURL(/\/account\?new=blank#agents$/);
    await agents.getByLabel("שם", { exact: true }).fill("לקוחות");
    await agents.getByLabel("מה הסוכן עושה ואיך").fill("לסכם מיילים מלקוחות, בקצרה.");
    await agents.getByRole("button", { name: "יצירת הסוכן" }).click();
    await expect(agents.getByRole("status").filter({ hasText: "הסוכן ״לקוחות״ נשמר." })).toBeVisible();
    await expect(agents.getByText("סוכנים משלך: 1 מתוך 3, בנוסף לשלושת הסוכנים המובנים.")).toBeVisible();
    await expect(agents.getByRole("link", { name: /^סוכן ריק/ })).toBeVisible(); // room for two more
    await shot(page, "account-agents-pro");
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
