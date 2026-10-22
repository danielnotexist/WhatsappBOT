import { expect, test, type BrowserContext } from "@playwright/test";
import { newContext, payWithMock, readCode, uniqueEmail } from "./helpers";

/** Signs a new user up through the API; the context keeps the session cookie. */
async function signup(ctx: BrowserContext): Promise<string> {
  const email = uniqueEmail("pay");
  expect((await ctx.request.post("/api/auth/otp/send", { data: { email } })).ok()).toBe(true);
  const code = await readCode(ctx.request, email);
  expect(await (await ctx.request.post("/api/auth/otp/verify", { data: { email, code } })).json()).toMatchObject({ ok: true });
  return email;
}

/** The personal payment link, as the personal area hands it out. */
async function payLinkOf(ctx: BrowserContext): Promise<string> {
  const page = await ctx.newPage();
  await page.goto("/account");
  const href = (await page.getByRole("link", { name: "בחירת מסלול" }).getAttribute("href"))!;
  await page.close();
  return href;
}

test.describe("payment pages — /pay/<token>, /pay/done, the card update", () => {
  test("a payment link opened without a session: the two plan papers → HYP stand-in → /pay/done", async ({ browser }) => {
    const owner = await newContext(browser);
    const email = await signup(owner);
    const href = await payLinkOf(owner);

    const phone = await newContext(browser, { width: 375, height: 812 }); // the WhatsApp link, on the phone
    const page = await phone.newPage();
    await page.goto(href);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("בחירת מסלול");
    await expect(page.getByRole("main").getByText(email)).toBeVisible();
    const basic = page.getByRole("form", { name: "בסיסי", exact: true });
    const pro = page.getByRole("form", { name: "פרו", exact: true });
    await expect(basic.getByText("99", { exact: true })).toBeVisible();
    await expect(basic.getByText("כולל מע״מ 15.10 ₪")).toBeVisible();
    await expect(pro.getByText("299", { exact: true })).toBeVisible();
    await expect(pro.getByText("כולל מע״מ 45.61 ₪")).toBeVisible();
    // pro is the honey paper
    expect(await pro.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe("rgb(231, 182, 92)");
    await expect(page.getByText("המחירים לחודש וכוללים מע״מ (18%).")).toBeVisible();
    await expect(page.getByRole("link", { name: "לאזור האישי" })).toHaveCount(0); // not signed in here

    await payWithMock(page, "basic", /\/pay\/done\?r=paid$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("התשלום התקבל");
    await expect(page.getByRole("status")).toContainText("החשבון פעיל");
    await expect(page.getByRole("link", { name: "חזרה לוואטסאפ" })).toHaveAttribute("href", /^https:\/\/wa\.me\/\d+$/);
    await phone.close();

    // the owner's browser: the plan is active, and the same link now updates the card (J2, no charge)
    const p2 = await owner.newPage();
    await p2.goto("/account");
    await expect(p2.getByRole("meter", { name: "הודעות החודש" })).toHaveAttribute("aria-valuemax", "750");
    await p2.goto(href);
    await expect(p2.getByRole("heading", { level: 1 })).toHaveText("עדכון כרטיס");
    await expect(p2.getByRole("form", { name: "בסיסי", exact: true })).toHaveCount(0);
    await expect(p2.getByRole("banner").getByRole("link", { name: "לאזור האישי" })).toBeVisible();
    await p2.getByRole("link", { name: "לעדכון הכרטיס" }).click();
    await expect(p2).toHaveURL(/\/account\?notice=/);
    await expect(p2.getByText("הכרטיס עודכן. אפשר לחזור לוואטסאפ.")).toBeVisible();
    await owner.close();
  });

  test("an invalid link and an unknown result say what to do, in Hebrew, without echoing the URL", async ({ browser }) => {
    const ctx = await newContext(browser);
    const page = await ctx.newPage();
    await page.goto("/pay/not-a-token");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("הקישור לא בתוקף");
    await expect(page.getByText("בשיחה עם עלזה בוואטסאפ, לכתוב ״תשלום״.", { exact: false })).toBeVisible();
    await page.goto("/pay/done?r=declined&error=%D7%96%D7%99%D7%95%D7%A3");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("התשלום לא עבר");
    await expect(page.getByText("זיוף")).toHaveCount(0);
    await page.goto("/pay/done?r=__proto__");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("חזרה לוואטסאפ");
    await ctx.close();
  });
});
