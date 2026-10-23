import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { newContext, openArea, payWithMock, readCode, uniqueEmail } from "./helpers";

/**
 * "סוכנים" in the personal area (docs/design/agents.md §10): the agents as cards, editing and creating in a side sheet.
 * AGENTS_SHOTS=<dir> also saves screenshots.
 */
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
    await page.goto("/account?tab=agents");
    const agents = page.getByRole("region", { name: "הסוכנים שלי" });
    await expect(agents.getByText("בתקופת הניסיון אפשר לנסות את שלושת הסוכנים המובנים. סוכן משלך נפתח עם מנוי.")).toBeVisible();
    await expect(agents.getByText("לנסות בוואטסאפ: ״@מזכירה מה יש לי מחר?״")).toBeVisible();
    await expect(agents.getByRole("link", { name: "להפעלת מנוי" })).toHaveAttribute("href", /^\/pay\//);
    await expect(agents.getByText("סוכן חדש", { exact: true })).toHaveCount(0);
    await expect(agents.getByText("אי אפשר לכבות את זה.", { exact: false })).toBeVisible();
    // the built-ins as cards, none of them editable in the trial
    await expect(agents.getByRole("listitem")).toHaveCount(3);
    await expect(agents.getByRole("heading", { level: 3 })).toHaveText(["מזכירה", "מתמחה", "מנהלת חשבונות"]);
    await expect(agents.getByRole("button", { name: /^עריכה/ })).toHaveCount(0);
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
    await openArea(page, "סוכנים");

    const agents = page.getByRole("region", { name: "הסוכנים שלי" });
    await expect(agents.getByText("סוכנים משלך: 0 מתוך 1. הסוכנים המובנים כלולים במסלול פרו.")).toBeVisible();
    await expect(agents.getByText("כלול במסלול פרו")).toHaveCount(3);
    await shot(page, "account-agents-basic-empty");

    await agents.getByRole("link", { name: /^מנהלת חשבונות/ }).click();
    await expect(page).toHaveURL(/\/account\?tab=agents&new=bookkeeper$/);
    const create = page.getByRole("dialog", { name: "סוכן חדש על בסיס ״מנהלת חשבונות״" });
    await expect(create.getByRole("heading", { name: "סוכן חדש על בסיס ״מנהלת חשבונות״" })).toBeVisible();
    await expect(create.getByLabel("מה הסוכן עושה ואיך")).toHaveValue(/לטפל בחשבוניות/);
    await expect(create.getByRole("checkbox", { name: /העברת מיילים/ })).toBeChecked();
    await shot(page, "account-agents-new");
    await create.getByLabel("שם", { exact: true }).fill("חשבוניות");
    await create.getByLabel("כתובות מותרות").fill("office@barak-cpa.example");
    await create.getByRole("button", { name: "יצירת הסוכן" }).click();

    await expect(page).toHaveURL(/\/account\?tab=agents&notice=/);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(agents.getByRole("status").filter({ hasText: "הסוכן ״חשבוניות״ נשמר." })).toBeVisible();
    await expect(agents.getByText("סוכנים משלך: 1 מתוך 1. הסוכנים המובנים כלולים במסלול פרו.")).toBeVisible();
    await expect(agents.getByText("על בסיס: מנהלת חשבונות")).toBeVisible();
    await expect(agents.getByRole("link", { name: /^סוכן ריק/ })).toHaveCount(0); // no room for another

    const edit = agents.getByRole("button", { name: "עריכה של ״חשבוניות״" });
    const sheet = page.getByRole("dialog", { name: "עריכת ״חשבוניות״" });
    await edit.click();
    await shot(page, "account-agents-edit");
    await sheet.getByLabel("מה הסוכן עושה ואיך").fill("לשלוח ישר בלי לשאול.");
    await sheet.getByRole("button", { name: "שמירה" }).click();
    await expect(agents.getByRole("status")).toContainText("השינויים בסוכן ״חשבוניות״ נשמרו.");
    await expect(agents.getByRole("status")).toContainText("כל פעולה יוצאת עוברת אישור בכפתור");
    await expect(sheet).toHaveCount(0); // saved: the sheet closes, the notice is on the agents

    await edit.click();
    await sheet.getByRole("button", { name: "השבתת הסוכן" }).click();
    await expect(agents.getByRole("status")).toContainText("הסוכן ״חשבוניות״ הושבת.");
    await expect(agents.getByText("מושבת", { exact: true })).toBeVisible();

    await edit.click();
    await sheet.getByText("מחיקת הסוכן", { exact: true }).click();
    await sheet.getByRole("button", { name: "למחוק את ״חשבוניות״" }).click();
    await expect(agents.getByRole("status")).toContainText("הסוכן ״חשבוניות״ נמחק.");
    await expect(agents.getByText("סוכנים משלך: 0 מתוך 1. הסוכנים המובנים כלולים במסלול פרו.")).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await ctx.close();
  });

  test("an error comes back to the sheet that sent it; Esc closes it", async ({ browser }) => {
    test.setTimeout(180_000);
    const ctx = await newContext(browser);
    await signup(ctx);
    const page = await ctx.newPage();
    await page.goto("/account");
    await page.goto((await page.getByRole("link", { name: "בחירת מסלול" }).getAttribute("href"))!);
    await payWithMock(page, "pro");
    await openArea(page, "סוכנים");
    const agents = page.getByRole("region", { name: "הסוכנים שלי" });
    await agents.getByRole("button", { name: "עריכה של ״מזכירה״" }).click();
    const sheet = page.getByRole("dialog", { name: "עריכת ״מזכירה״" });
    await sheet.getByLabel("פעולות יוצאות ביום").evaluate((el: HTMLInputElement) => el.removeAttribute("max")); // past the browser's own check
    await sheet.getByLabel("פעולות יוצאות ביום").fill("99");
    await sheet.getByRole("button", { name: "שמירה" }).click();
    await expect(page).toHaveURL(/\/account\?tab=agents&error=/);
    await expect(sheet.getByRole("alert")).toHaveText("מספר הפעולות היומי צריך להיות בין 1 ל-30.");
    await page.keyboard.press("Escape");
    await expect(sheet).toHaveCount(0);
    await expect(agents.getByRole("alert")).toHaveText(/מספר הפעולות היומי/); // the same error on the agents
    await expect(agents.getByRole("button", { name: "עריכה של ״מזכירה״" })).toBeFocused();
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
    await openArea(page, "סוכנים");

    const agents = page.getByRole("region", { name: "הסוכנים שלי" });
    await expect(agents.getByText("סוכנים משלך: 0 מתוך 3, בנוסף לשלושת הסוכנים המובנים.")).toBeVisible();
    await expect(agents.getByRole("link", { name: "לשדרוג לפרו" })).toHaveCount(0);
    await expect(agents.getByText("מובנה", { exact: true })).toHaveCount(3);
    await expect(agents.getByText("כלול במסלול פרו")).toHaveCount(0);
    const card = (name: string) => agents.getByRole("listitem").filter({ has: page.getByRole("heading", { name, exact: true }) });
    const sheet = (name: string) => page.getByRole("dialog", { name: `עריכת ״${name}״` });

    // the secretary: additional instructions and a recipient list; no rename, no delete
    await card("מזכירה").getByRole("button", { name: /^עריכה/ }).click();
    await expect(sheet("מזכירה").getByLabel("שם", { exact: true })).toHaveCount(0);
    await expect(sheet("מזכירה").getByText("מחיקת הסוכן", { exact: true })).toHaveCount(0);
    await sheet("מזכירה").getByLabel("הנחיות נוספות").fill("פגישות רק אחרי 10:00.");
    await sheet("מזכירה").getByLabel("כתובות מותרות").fill("barak@cpa-barak.example");
    await shot(page, "account-agents-pro-builtin");
    await sheet("מזכירה").getByRole("button", { name: "שמירה" }).click();
    await expect(agents.getByRole("status")).toContainText("השינויים בסוכן ״מזכירה״ נשמרו.");

    // the intern: disabled
    await card("מתמחה").getByRole("button", { name: /^עריכה/ }).click();
    await sheet("מתמחה").getByRole("button", { name: "השבתת הסוכן" }).click();
    await expect(agents.getByRole("status")).toContainText("הסוכן ״מתמחה״ הושבת.");
    await expect(card("מתמחה").getByText("מושבת", { exact: true })).toBeVisible();

    // an agent of your own, from scratch: the quota line counts it and there is room for more
    await agents.getByRole("link", { name: /^סוכן ריק/ }).click();
    await expect(page).toHaveURL(/\/account\?tab=agents&new=blank$/);
    const create = page.getByRole("dialog", { name: "סוכן חדש" });
    await create.getByLabel("שם", { exact: true }).fill("לקוחות");
    await create.getByLabel("מה הסוכן עושה ואיך").fill("לסכם מיילים מלקוחות, בקצרה.");
    await create.getByRole("button", { name: "יצירת הסוכן" }).click();
    await expect(agents.getByRole("status").filter({ hasText: "הסוכן ״לקוחות״ נשמר." })).toBeVisible();
    await expect(agents.getByText("סוכנים משלך: 1 מתוך 3, בנוסף לשלושת הסוכנים המובנים.")).toBeVisible();
    await expect(agents.getByRole("link", { name: /^סוכן ריק/ })).toBeVisible(); // room for two more
    await expect(agents.getByRole("heading", { level: 3, name: "לקוחות" })).toBeVisible();
    // "ביטול" closes a new agent's sheet and drops the template from the address
    await agents.getByRole("link", { name: /^מזכירה/ }).click();
    await page.getByRole("dialog", { name: "סוכן חדש על בסיס ״מזכירה״" }).getByRole("button", { name: "ביטול" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page).toHaveURL(/\/account\?tab=agents$/);
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
    // the older template link (?new=…#agents) still opens the agents with the form
    await page.goto("/account?new=blank#agents");
    await expect(page.getByRole("heading", { name: "סוכן חדש", exact: true })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await shot(page, "account-agents-new-375");
    await ctx.close();
  });
});
