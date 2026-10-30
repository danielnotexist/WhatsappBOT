import { expect, test, type BrowserContext } from "@playwright/test";
import { derivedKey } from "../lib/auth/keys";
import { flashQuery } from "../lib/flash";
import { newContext, openArea, payWithMock, readCode, sendWhatsapp, uniqueEmail, uniquePhone, waitForWaText } from "./helpers";

/** Signs a new user up through the API; the context keeps the session cookie. */
async function signup(ctx: BrowserContext): Promise<string> {
  const email = uniqueEmail("account");
  expect((await ctx.request.post("/api/auth/otp/send", { data: { email } })).ok()).toBe(true);
  const code = await readCode(ctx.request, email);
  expect(await (await ctx.request.post("/api/auth/otp/verify", { data: { email, code } })).json()).toMatchObject({ ok: true });
  return email;
}

/** Stand in for Microsoft (or Google) one hop early (Playwright does not route the target of a server redirect). */
async function approveMicrosoft(ctx: BrowserContext, provider: "microsoft" | "google" = "microsoft") {
  await ctx.route(`**/api/auth/${provider}/start**`, async (route) => {
    const res = await route.fetch({ maxRedirects: 0 });
    const authorize = new URL(res.headers()["location"]!);
    const back = new URL(authorize.searchParams.get("redirect_uri")!);
    back.searchParams.set("code", "e2e-code");
    back.searchParams.set("state", authorize.searchParams.get("state")!);
    await route.fulfill({ status: 302, headers: { location: back.toString() } });
  });
}

test.describe("personal area — same server actions, new design", () => {
  test("a fresh account: greeting, nothing connected, the trial meter, link a number", async ({ browser }) => {
    const ctx = await newContext(browser);
    const email = await signup(ctx);
    const page = await ctx.newPage();
    await page.goto("/account");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("האזור האישי");
    await expect(page.getByText(/^(בוקר טוב|צהריים טובים|ערב טוב|לילה טוב)\.$/)).toBeVisible();
    await expect(page.getByRole("main").getByText(email)).toBeVisible();
    await expect(page.getByText("עוד לא קושר מספר וואטסאפ. זה הצעד שחסר כדי להתחיל לעבוד יחד.")).toBeVisible();
    // the compact overview: one chip per area, each a link to it
    const chips = page.getByRole("list", { name: "מצב החשבון" });
    await expect(chips.getByRole("link")).toHaveText(["עוד אין חיבורים", "וואטסאפ לא מקושר", "3 סוכנים פעילים", "ניסיון: 0 מתוך 10 הודעות"]);
    const nav = page.getByRole("navigation", { name: "ניווט באזור האישי" });
    await expect(nav.getByRole("link", { name: "סקירה", exact: true })).toHaveAttribute("aria-current", "page");

    await openArea(page, "חיבורים");
    await expect(page).toHaveURL(/\/account\?tab=connections$/);
    const connections = page.getByRole("region", { name: "חיבורים" });
    await expect(connections.getByText("לא מחובר")).toHaveCount(2);
    await expect(page.getByRole("link", { name: "חיבור Microsoft 365" })).toHaveAttribute("href", "/api/auth/microsoft/start");
    await expect(page.getByRole("link", { name: "חיבור Google" })).toHaveAttribute("href", "/api/auth/google/start");
    // the browser's back button walks the areas
    await page.goBack();
    await expect(page).toHaveURL(/\/account$/);
    await expect(connections).toHaveCount(0);

    const meter = page.getByRole("meter", { name: "הודעות בתקופת הניסיון" });
    await expect(meter).toHaveAttribute("aria-valuetext", "0 מתוך 10");
    await expect(page.getByRole("link", { name: "בחירת מסלול" })).toHaveAttribute("href", /^\/pay\//);

    await page.getByRole("link", { name: "קישור מספר" }).click();
    await expect(page).toHaveURL(/\/start\/ready$/);
    // signed in: the shell offers the way back instead of "כבר יש לך חשבון? כניסה"
    await expect(page.getByRole("banner").getByRole("link", { name: "לאזור האישי" })).toHaveAttribute("href", "/account");
    await expect(page.getByText("כבר יש לך חשבון? כניסה")).toHaveCount(0);
    // and the landing: the honey pill at the header's inline end, no "כניסה" beside the hero's call to action
    await page.goto("/");
    await expect(page.getByRole("banner").getByRole("link", { name: "לאזור האישי" })).toHaveAttribute("href", "/account");
    await expect(page.getByRole("main").getByRole("link", { name: "כניסה", exact: true })).toHaveCount(0);
    await ctx.close();
    // a visitor without a session sees the prerendered header: no pill, "כניסה" in the hero
    const anon = await newContext(browser);
    const landing = await anon.newPage();
    await landing.goto("/");
    await expect(landing.getByRole("main").getByRole("link", { name: "כניסה", exact: true })).toBeVisible();
    await expect(landing.getByRole("banner").getByRole("link", { name: "לאזור האישי" })).toHaveCount(0);
    await landing.goto("/start/email");
    await expect(landing.getByRole("link", { name: "כבר יש לך חשבון? כניסה" })).toBeVisible();
    await anon.close();
  });

  test("connect and disconnect Microsoft, unlink the number, cancel a paid plan", async ({ browser }) => {
    test.setTimeout(180_000);
    const ctx = await newContext(browser);
    await signup(ctx);
    const page = await ctx.newPage();

    // a number, linked the way the site does it
    await page.goto("/start/ready");
    const message = new URL((await page.getByRole("link", { name: "חיבור לוואטסאפ" }).getAttribute("href"))!).searchParams.get("text")!;
    const phone = uniquePhone();
    await sendWhatsapp(ctx.request, phone, message);
    await waitForWaText(ctx.request, phone, /החשבון מקושר/);

    // Microsoft from the personal area → back here with a notice
    await approveMicrosoft(ctx);
    await page.goto("/account?tab=connections");
    await page.getByRole("link", { name: "חיבור Microsoft 365" }).click();
    // the OAuth return lands on "חיבורים", with its notice there
    await expect(page).toHaveURL(/\/account\?tab=connections&notice=/);
    await expect(page.getByRole("region", { name: "חיבורים" }).getByRole("status").filter({ hasText: "Microsoft 365" })).toBeVisible();
    await expect(page.getByText("אני זמינה בוואטסאפ ומחוברת ל-Outlook.")).toBeVisible();
    // the services behind the account: one named icon each, a tooltip on hover; Esc closes it. The trial is basic in
    // what it connects (lib/billing/plans.ts): To Do is pro, a link to the upgrade
    const services = page.getByRole("list", { name: "שירותים ב-Microsoft 365" });
    await expect(services.getByRole("listitem")).toHaveCount(6);
    await expect(services.getByRole("button", { name: "Outlook - מחובר", exact: true })).toBeVisible();
    const todo = services.getByRole("link", { name: "Microsoft To Do - במסלול פרו" });
    await expect(todo).toHaveAttribute("href", /^\/pay\//);
    // one account in the trial: Google joins on pro (the start route refuses it as well)
    await expect(page.getByRole("link", { name: "Google בנוסף: במסלול פרו" })).toHaveAttribute("href", /^\/pay\//);
    await expect(page.getByRole("link", { name: "חיבור Google" })).toHaveCount(0);
    // right after the OAuth landing the row may not be hydrated yet: move away and hover again until it answers
    await expect(async () => {
      await page.mouse.move(1, 1);
      await todo.hover();
      await expect(page.getByRole("tooltip").filter({ hasText: "הצגה והוספה של משימות" })).toBeVisible({ timeout: 1_000 });
    }).toPass();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("tooltip")).toHaveCount(0);
    await page.getByRole("button", { name: "ניתוק Microsoft 365" }).click();
    await expect(page.getByRole("status").filter({ hasText: "החיבור ל-Microsoft 365 נותק." })).toBeVisible();
    await expect(page.getByRole("link", { name: "חיבור Microsoft 365" })).toBeVisible();
    await expect(page.getByRole("link", { name: "חיבור Google" })).toBeVisible();

    // pay (mock) → basic, 0 of 750; cancel from the fold in "מנוי"
    await openArea(page, "מנוי");
    await page.goto((await page.getByRole("region", { name: "המנוי" }).getByRole("link", { name: "בחירת מסלול" }).getAttribute("href"))!);
    await payWithMock(page);
    await expect(page.getByRole("meter", { name: "הודעות החודש" })).toHaveAttribute("aria-valuemax", "750");
    await expect(page.getByRole("region", { name: "המנוי" }).getByText("פעיל", { exact: true })).toBeVisible();
    await openArea(page, "מנוי");
    await page.getByText("ביטול המנוי", { exact: true }).click();
    await page.getByRole("button", { name: "לבטל את המנוי" }).click();
    await expect(page).toHaveURL(/\/account\?tab=plan&notice=/);
    await expect(page.getByRole("status").filter({ hasText: "המנוי בוטל" })).toBeVisible();
    await expect(page.getByRole("link", { name: "חידוש המנוי" })).toBeVisible();

    // unlink the number
    await openArea(page, "וואטסאפ");
    await page.getByRole("button", { name: /^ניתוק המספר/ }).click();
    await expect(page).toHaveURL(/\/account\?tab=whatsapp&notice=/);
    await expect(page.getByRole("status").filter({ hasText: "המספר נותק" })).toBeVisible();
    await expect(page.getByText("עוד לא קושר מספר", { exact: true })).toBeVisible();
    await ctx.close();
  });

  test("Google: the services row under the account, a tooltip on keyboard focus, no horizontal scroll at 390px", async ({ browser }) => {
    const ctx = await newContext(browser, { width: 390, height: 844 });
    await signup(ctx);
    const page = await ctx.newPage();
    await approveMicrosoft(ctx, "google");
    await page.goto("/account");
    // phones: the areas are one row of six under the overview, all in view
    const nav = page.getByRole("navigation", { name: "ניווט באזור האישי" });
    for (const label of ["סקירה", "חיבורים", "וואטסאפ", "סוכנים", "מנוי", "הגדרות"]) await expect(nav.getByRole("link", { name: label, exact: true })).toBeInViewport();
    await openArea(page, "חיבורים");
    await page.getByRole("link", { name: "חיבור Google" }).click();
    await expect(page).toHaveURL(/\/account\?tab=connections&notice=/);
    const services = page.getByRole("list", { name: "שירותים ב-Google" });
    await expect(services.getByRole("listitem")).toHaveCount(7);
    // the trial is basic in what it connects (lib/billing/plans.ts): Tasks and the Docs family are pro, links to the upgrade
    await expect(services.getByRole("link", { name: "Google Tasks - במסלול פרו" })).toHaveAttribute("href", /^\/pay\//);
    await expect(services.getByRole("link", { name: "Google Docs - במסלול פרו" })).toHaveAttribute("data-status", "pro_only");
    const gmail = services.getByRole("button", { name: "Gmail - מחובר" });
    const tip = page.getByRole("tooltip");
    await expect(async () => {
      await gmail.blur();
      await gmail.focus();
      await expect(tip).toBeVisible({ timeout: 1_000 });
    }).toPass();
    await expect(tip).toContainText("שליחת מיילים אחרי אישור");
    const box = (await tip.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(390);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    await ctx.close();
  });

  test("areas are addresses: deep links, older links, a notice in its area, the keyboard", async ({ browser }) => {
    const ctx = await newContext(browser);
    await signup(ctx);
    const page = await ctx.newPage();
    const nav = page.getByRole("navigation", { name: "ניווט באזור האישי" });

    await page.goto("/account?tab=agents");
    await expect(nav.getByRole("link", { name: "סוכנים", exact: true })).toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("region", { name: "הסוכנים שלי" })).toBeVisible();
    await expect(page.getByRole("region", { name: "סקירה" })).toHaveCount(0);

    // a line the site signed (lib/flash.ts; the dev server's key is playwright.config.ts's all-ones TOKEN_ENC_KEY)
    const signed = (text: string) => flashQuery("notice", text, derivedKey("internal", Buffer.alloc(32, 1)));
    // a crafted, unsigned line is never shown
    await page.goto(`/account?notice=${encodeURIComponent("להעביר 99 ₪ בביט")}`);
    await expect(page.getByRole("region", { name: "סקירה" })).toBeVisible();
    await expect(page.getByText("להעביר 99 ₪ בביט")).toHaveCount(0);
    // an older link (a bare notice, as chat links and returns used to land): shown on the overview
    await page.goto(`/account?${signed("הודעה לבדיקה")}`);
    await expect(page.getByRole("region", { name: "סקירה" }).getByRole("status")).toHaveText(/הודעה לבדיקה/);
    // the agents' older landing (?at=agents#agents): the agents, with the notice there
    await page.goto(`/account?${signed("הסוכן נשמר")}&at=agents#agents`);
    const agentsNotice = page.getByRole("region", { name: "הסוכנים שלי" }).getByRole("status");
    await expect(agentsNotice).toHaveText(/הסוכן נשמר/);
    // "סגירה" closes it in place and drops the notice from the address
    await agentsNotice.getByRole("link", { name: "סגירה" }).click();
    await expect(agentsNotice).toHaveCount(0);
    await expect(page).toHaveURL(/\/account\?tab=agents$/);

    // the keyboard: Enter on an area link switches and moves focus to the area's heading
    await nav.getByRole("link", { name: "מנוי", exact: true }).focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/account\?tab=plan$/);
    await expect(page.getByRole("heading", { name: "המנוי", level: 2 })).toBeFocused();
    // a status chip leads to its area too
    await page.getByRole("list", { name: "מצב החשבון" }).getByRole("link", { name: "וואטסאפ לא מקושר" }).click();
    await expect(page).toHaveURL(/\/account\?tab=whatsapp$/);
    await expect(page.getByRole("region", { name: "וואטסאפ" })).toBeVisible();
    await ctx.close();
  });

  test("delete needs the typed word; sign-out leaves the area", async ({ browser }) => {
    const ctx = await newContext(browser);
    await signup(ctx);
    const page = await ctx.newPage();
    await page.goto("/account");
    await openArea(page, "הגדרות");
    // in its own area the delete form is out in the open, still asleep until the word is typed
    await expect(page.getByRole("heading", { name: "מחיקת החשבון", exact: true })).toBeVisible();
    const del = page.getByRole("button", { name: "מחיקת החשבון לצמיתות" });
    await expect(del).toBeDisabled();
    await page.getByLabel(/כדי למחוק/).fill("מחיקה");
    await expect(del).toBeEnabled();
    await del.click();
    await expect(page).toHaveURL(/\/\?deleted=1$/);
    await page.goto("/account");
    await expect(page).toHaveURL(/\/login$/);

    const other = await newContext(browser);
    await signup(other);
    const p2 = await other.newPage();
    await p2.goto("/account");
    await p2.getByRole("button", { name: "יציאה" }).click();
    await expect(p2).toHaveURL(/localhost:\d+\/$/);
    await p2.goto("/account");
    await expect(p2).toHaveURL(/\/login$/);
    await other.close();
    await ctx.close();
  });
});
