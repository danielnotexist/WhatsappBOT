import { expect, test, type BrowserContext } from "@playwright/test";
import { newContext, payWithMock, readCode, sendWhatsapp, uniqueEmail, uniquePhone, waitForWaText } from "./helpers";

/** Signs a new user up through the API; the context keeps the session cookie. */
async function signup(ctx: BrowserContext): Promise<string> {
  const email = uniqueEmail("account");
  expect((await ctx.request.post("/api/auth/otp/send", { data: { email } })).ok()).toBe(true);
  const code = await readCode(ctx.request, email);
  expect(await (await ctx.request.post("/api/auth/otp/verify", { data: { email, code } })).json()).toMatchObject({ ok: true });
  return email;
}

/** Stand in for Microsoft one hop early (Playwright does not route the target of a server redirect). */
async function approveMicrosoft(ctx: BrowserContext) {
  await ctx.route("**/api/auth/microsoft/start**", async (route) => {
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

    const connections = page.getByRole("region", { name: "חיבורים" });
    await expect(connections.getByText("לא מחובר")).toHaveCount(2);
    await expect(page.getByRole("link", { name: "חיבור Microsoft 365" })).toHaveAttribute("href", "/api/auth/microsoft/start");
    await expect(page.getByRole("link", { name: "חיבור Google" })).toHaveAttribute("href", "/api/auth/google/start");

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
    await page.goto("/account");
    await page.getByRole("link", { name: "חיבור Microsoft 365" }).click();
    await expect(page).toHaveURL(/\/account\?notice=/);
    await expect(page.getByRole("status").filter({ hasText: "Microsoft 365" })).toBeVisible();
    await expect(page.getByText("אני זמינה בוואטסאפ ומחוברת ל-Outlook.")).toBeVisible();
    await page.getByRole("button", { name: "ניתוק Microsoft 365" }).click();
    await expect(page.getByRole("status").filter({ hasText: "החיבור ל-Microsoft 365 נותק." })).toBeVisible();
    await expect(page.getByRole("link", { name: "חיבור Microsoft 365" })).toBeVisible();

    // pay (mock) → basic, 0 of 750; cancel from the fold
    await page.goto((await page.getByRole("link", { name: "בחירת מסלול" }).getAttribute("href"))!);
    await payWithMock(page);
    await expect(page.getByRole("meter", { name: "הודעות החודש" })).toHaveAttribute("aria-valuemax", "750");
    await expect(page.getByText("פעיל", { exact: true })).toBeVisible();
    await page.getByText("ביטול המנוי", { exact: true }).click();
    await page.getByRole("button", { name: "לבטל את המנוי" }).click();
    await expect(page.getByRole("status").filter({ hasText: "המנוי בוטל" })).toBeVisible();
    await expect(page.getByRole("link", { name: "חידוש המנוי" })).toBeVisible();

    // unlink the number
    await page.getByRole("button", { name: /^ניתוק המספר/ }).click();
    await expect(page.getByRole("status").filter({ hasText: "המספר נותק" })).toBeVisible();
    await expect(page.getByText("עוד לא קושר מספר", { exact: true })).toBeVisible();
    await ctx.close();
  });

  test("delete needs the typed word; sign-out leaves the area", async ({ browser }) => {
    const ctx = await newContext(browser);
    await signup(ctx);
    const page = await ctx.newPage();
    await page.goto("/account");
    await page.getByText("מחיקת החשבון", { exact: true }).click();
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
