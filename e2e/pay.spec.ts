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

/** How many token charges the mock HYP gateway of the dev server has seen (memory mode only). */
async function chargeCount(ctx: BrowserContext): Promise<number> {
  const res = await ctx.request.get("/api/dev/hyp");
  expect(res.ok()).toBe(true);
  return ((await res.json()) as { charges: number }).charges;
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

    // the owner's browser: the basic plan is active, the same link now offers the upgrade, and its card link
    // updates the card (J2, no charge)
    const p2 = await owner.newPage();
    await p2.goto("/account");
    await expect(p2.getByRole("meter", { name: "הודעות החודש" })).toHaveAttribute("aria-valuemax", "750");
    await p2.goto(href);
    await expect(p2.getByRole("heading", { level: 1 })).toHaveText("שדרוג לפרו");
    await p2.getByRole("link", { name: "עדכון כרטיס", exact: true }).click();
    await expect(p2.getByRole("heading", { level: 1 })).toHaveText("עדכון כרטיס");
    await expect(p2.getByRole("form", { name: "בסיסי", exact: true })).toHaveCount(0);
    await expect(p2.getByRole("banner").getByRole("link", { name: "לאזור האישי" })).toBeVisible();
    await p2.getByRole("link", { name: "לעדכון הכרטיס" }).click();
    await expect(p2).toHaveURL(/\/account\?notice=/);
    await expect(p2.getByText("הכרטיס עודכן. אפשר לחזור לוואטסאפ.")).toBeVisible();
    await owner.close();
  });

  test("basic → pro on the site: the prorated price on the saved card, a decline changes nothing, the retry upgrades once", async ({ browser }) => {
    const ctx = await newContext(browser);
    await signup(ctx);
    const page = await ctx.newPage();
    await page.goto((await payLinkOf(ctx)));
    await payWithMock(page, "basic");

    // the personal area: the plan card and the agents section both lead straight to the upgrade face
    const slip = page.getByRole("region", { name: "המנוי" });
    await expect(slip.getByRole("link", { name: "עדכון אמצעי תשלום" })).toHaveAttribute("href", /\/pay\/[^?]+\?view=card$/);
    const agentsCta = page.getByRole("region", { name: "הסוכנים שלי" }).getByRole("link", { name: "לשדרוג לפרו" });
    await expect(agentsCta).toHaveAttribute("href", (await slip.getByRole("link", { name: "לשדרוג לפרו" }).getAttribute("href"))!);
    await slip.getByRole("link", { name: "לשדרוג לפרו" }).click();

    // a fresh basic cycle: the whole difference (299 − 99), VAT included, the mock card's last digits
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("שדרוג לפרו");
    await expect(page.getByText("200", { exact: true })).toBeVisible();
    await expect(page.getByText("כולל מע״מ 30.51 ₪")).toBeVisible();
    await expect(page.getByText("מסתיים ב-4580")).toBeVisible();
    await expect(page.getByText(/^299 ₪ לחודש, מ-\d{1,2}\.\d{1,2}\.\d{4}$/)).toBeVisible();
    const before = await chargeCount(ctx);

    // the card company declines once (the mock HYP gateway, scripted): nothing changes, a retry is offered
    expect((await ctx.request.post("/api/dev/hyp", { data: { charge: ["4"] } })).ok()).toBe(true);
    await page.getByRole("button", { name: "לשדרג עכשיו" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("השדרוג לא הושלם");
    await expect(page.getByRole("main").getByRole("alert")).toContainText("חברת האשראי לא אישרה את החיוב (קוד 4)");
    await page.getByRole("button", { name: "לנסות שוב, 200 ₪" }).click();

    await expect(page.getByRole("heading", { level: 1 })).toHaveText("המסלול שודרג לפרו");
    await expect(page.getByRole("main").getByRole("status")).toHaveText("מסלול פרו פעיל");
    await expect(page.getByText("הקבלה נשלחה למייל")).toBeVisible();
    expect(await chargeCount(ctx)).toBe(before + 2); // the decline + the upgrade
    // a refresh of the result never charges again
    await page.reload();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("המסלול שודרג לפרו");
    expect(await chargeCount(ctx)).toBe(before + 2);

    await page.goto("/account");
    await expect(page.getByRole("meter", { name: "הודעות החודש" })).toHaveAttribute("aria-valuemax", "3000");
    await expect(page.getByRole("link", { name: "לשדרוג לפרו" })).toHaveCount(0);
    // the pay link of a pro plan: the card update, with the way to basic in the chat
    await page.goto((await slip.getByRole("link", { name: "עדכון אמצעי תשלום" }).getAttribute("href"))!.replace("?view=card", ""));
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("עדכון כרטיס");
    await expect(page.getByText("מעבר למסלול הבסיסי: בשיחה עם עלזה, לכתוב ״מעבר לבסיסי״.")).toBeVisible();
    await ctx.close();
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
