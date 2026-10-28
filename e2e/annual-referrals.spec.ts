import { join } from "node:path";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { newContext, openArea, payWithMock, readCode, uniqueEmail } from "./helpers";

/**
 * Round 3 ("מסלול שנתי וחבר מביא חבר"), against the memory-mode dev server and the HYP stand-in (no real charge):
 *   - annual on /pricing → sign-up → the pay page opens on annual → a 990 ₪ charge → /account: annual, next charge a year out
 *   - mid-year basic → pro on the annual cycle: the prorated difference of the year, charged once, the period end kept
 *   - "חבר מביא חבר": A copies the link, B signs up through it and pays → both next charges move 30 days, A's counters
 * CAPTURE_DIR=<dir> also writes the screenshots of the round (1440 and 390).
 */
const CAPTURE = process.env.CAPTURE_DIR ?? "";
const OWNER = "danielnotexist@gmail.com";
const DAY = 86_400_000;

async function capture(page: Page, name: string, opts: { fullPage?: boolean } = {}): Promise<void> {
  if (!CAPTURE) return;
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: join(CAPTURE, `${name}.png`), fullPage: opts.fullPage ?? false });
}

async function signUp(ctx: BrowserContext, tag: string, email = uniqueEmail(tag)): Promise<string> {
  expect((await ctx.request.post("/api/auth/otp/send", { data: { email } })).ok()).toBe(true);
  const code = await readCode(ctx.request, email);
  expect(await (await ctx.request.post("/api/auth/otp/verify", { data: { email, code } })).json()).toMatchObject({ ok: true });
  return email;
}

async function hyp(ctx: BrowserContext): Promise<{ charges: number; lastCharge: { amount: number } | null; lastPage: { amount: number; order: string } | null }> {
  const res = await ctx.request.get("/api/dev/hyp");
  expect(res.ok()).toBe(true);
  return res.json();
}

async function billing(ctx: BrowserContext): Promise<{ plan: string; status: string; cycle: string; nextChargeAt: string }> {
  const res = await ctx.request.get("/api/dev/billing");
  expect(res.ok()).toBe(true);
  return res.json();
}

/** "25.10.2027" in Israel time — the way /account writes dates. */
const dayIl = (iso: string) => {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Jerusalem", year: "numeric", month: "numeric", day: "numeric" }).formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  return `${Number(p.day)}.${Number(p.month)}.${p.year}`;
};

test.describe("annual billing and referrals", () => {
  test("annual on /pricing → sign-up → 990 ₪ → /account annual with the next charge a year out; mid-year upgrade to pro is prorated", async ({ browser }) => {
    test.setTimeout(240_000);
    const ctx = await newContext(browser, { width: 1440, height: 900, reducedMotion: "reduce" });
    const page = await ctx.newPage();

    // the price list: monthly by default, the annual face on the switch
    await page.goto("/pricing");
    const basic = page.getByRole("article", { name: "בסיסי" });
    const pro = page.getByRole("article", { name: "פרו" });
    await expect(page.getByRole("radio", { name: "חודשי", exact: true })).toBeChecked();
    await expect(basic.getByText("99", { exact: true })).toBeVisible();
    await expect(basic.getByText("או 990 ₪ לשנה")).toBeVisible();
    await capture(page, "pricing-monthly-1440");
    await page.getByText("שנתי", { exact: true }).first().click();
    await expect(page.getByRole("radio", { name: /שנתי/ })).toBeChecked();
    // the month's share big (agorot raised), the monthly price struck through, the yearly charge under it
    await expect(basic.locator("[data-price-month]")).toHaveText("82.50");
    await expect(basic.locator("s")).toHaveText("99 ₪");
    await expect(basic.getByText("990 ₪ לשנה, בחיוב אחד")).toBeVisible();
    await expect(pro.locator("[data-price-month]")).toHaveText("249.17");
    await expect(pro.getByText("2,990 ₪ לשנה, בחיוב אחד")).toBeVisible();
    // both cards still fit one 1440×900 screen on the annual face too
    await page.goto("/#pricing");
    await page.locator("#pricing").evaluate((el) => el.scrollIntoView({ block: "start" }));
    await page.getByText("שנתי", { exact: true }).first().click();
    for (const plan of ["בסיסי", "פרו"]) {
      const box = await page.getByRole("article", { name: plan }).boundingBox();
      expect(box!.y + box!.height, plan).toBeLessThanOrEqual(900);
    }
    await capture(page, "pricing-annual-1440");
    expect((await ctx.cookies()).find((c) => c.name === "alze_cycle")?.value).toBe("annual");

    // sign up; the personal link opens on the annual cycle (the choice of the price list)
    await signUp(ctx, "annual");
    await page.goto("/account");
    await page.getByRole("link", { name: "בחירת מסלול" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("בחירת מסלול");
    await expect(page.getByRole("navigation", { name: "מחזור החיוב" }).getByRole("link", { name: /שנתי/ })).toHaveAttribute("aria-current", "page");
    const form = page.getByRole("form", { name: "בסיסי", exact: true });
    await expect(form.getByText("990", { exact: true })).toBeVisible();
    await expect(form.getByRole("button", { name: "לתשלום שנתי, 990 ₪" })).toBeVisible();
    const before = await hyp(ctx);
    await payWithMock(page, "basic");

    // one HYP page of 990 ₪ for the annual basic plan
    const after = await hyp(ctx);
    expect(after.lastPage).toMatchObject({ amount: 990 });
    expect(after.lastPage!.order).toMatch(/:basic:annual$/);
    expect(after.charges).toBe(before.charges); // the first payment is HYP's page, never a token charge
    const sub = await billing(ctx);
    expect(sub).toMatchObject({ plan: "basic", status: "active", cycle: "annual" });
    const yearOut = Date.parse(sub.nextChargeAt) - Date.now();
    expect(yearOut).toBeGreaterThan(364 * DAY);
    expect(yearOut).toBeLessThan(367 * DAY);

    await openArea(page, "מנוי");
    const slip = page.getByRole("region", { name: "המנוי" });
    await expect(slip.getByText("מסלול בסיסי שנתי, 990 ₪ לשנה")).toBeVisible();
    await expect(slip.getByText(`${dayIl(sub.nextChargeAt)}, 990 ₪`)).toBeVisible();
    await expect(page.getByRole("region", { name: "מעבר לחיוב שנתי" })).toHaveCount(0); // already annual
    await capture(page, "account-annual-1440");
    const phone = await ctx.newPage();
    await phone.setViewportSize({ width: 390, height: 844 });
    await phone.goto("/account?tab=plan");
    await capture(phone, "account-annual-390", { fullPage: true });
    await phone.close();

    // mid-year: 183 days left of the year → the prorated difference of the annual prices (2,990 − 990)
    expect((await ctx.request.post("/api/dev/billing", { data: { daysLeft: 183 } })).ok()).toBe(true);
    const mid = await billing(ctx);
    await page.goto("/account?tab=plan");
    await slip.getByRole("link", { name: "לשדרוג לפרו" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("שדרוג לפרו");
    const end = new Date(mid.nextChargeAt);
    const start = new Date(end);
    start.setUTCFullYear(start.getUTCFullYear() - 1);
    const cycleDays = Math.round((end.getTime() - start.getTime()) / DAY);
    const expected = Math.round(((2990 - 990) * 183) / cycleDays * 100) / 100;
    const shown = expected.toFixed(2).replace(/\.00$/, "");
    await expect(page.getByText(shown, { exact: true })).toBeVisible();
    await expect(page.getByText(`2,990 ₪ לשנה, מ-${dayIl(mid.nextChargeAt)}`)).toBeVisible();
    const charges = (await hyp(ctx)).charges;
    await page.getByRole("button", { name: "לשדרג עכשיו" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("המסלול שודרג לפרו");
    const done = await hyp(ctx);
    expect(done.charges).toBe(charges + 1);
    expect(done.lastCharge!.amount).toBe(expected);
    // pro at once; the period end (and the annual cycle) stays
    expect(await billing(ctx)).toMatchObject({ plan: "pro", cycle: "annual", nextChargeAt: mid.nextChargeAt });
    await page.reload();
    expect((await hyp(ctx)).charges).toBe(charges + 1);
    await ctx.close();
  });

  test("monthly → annual from /account: the unused month credited, a year from now", async ({ browser }) => {
    const ctx = await newContext(browser);
    await signUp(ctx, "to-annual");
    const page = await ctx.newPage();
    await page.goto("/account");
    await page.getByRole("link", { name: "בחירת מסלול" }).click();
    await page.getByRole("navigation", { name: "מחזור החיוב" }).getByRole("link", { name: "חודשי", exact: true }).click();
    await payWithMock(page, "basic");
    await openArea(page, "מנוי");
    const offer = page.getByRole("region", { name: "מעבר לחיוב שנתי" });
    await expect(offer).toBeVisible();
    // a fresh month: (almost) all of it is credited — 990 − 99 × days left / days of the month
    const credit = Number((await offer.locator("dd").first().innerText()).replace(/[^\d.]/g, ""));
    expect(credit).toBeGreaterThan(90);
    expect(credit).toBeLessThanOrEqual(99);
    const charges = (await hyp(ctx)).charges;
    await offer.getByRole("button", { name: "מעבר לשנתי עכשיו" }).click();
    await expect(page.getByRole("status").filter({ hasText: "עברת לחיוב שנתי" })).toBeVisible();
    const done = await hyp(ctx);
    expect(done.charges).toBe(charges + 1);
    expect(done.lastCharge!.amount).toBe(Math.round((990 - credit) * 100) / 100);
    const sub = await billing(ctx);
    expect(sub).toMatchObject({ cycle: "annual" });
    expect(Date.parse(sub.nextChargeAt) - Date.now()).toBeGreaterThan(364 * DAY);
    await ctx.close();
  });

  test("חבר מביא חבר: A copies the link, B signs up through it and pays → both next charges move 30 days", async ({ browser }) => {
    test.setTimeout(240_000);
    // A pays monthly basic
    const a = await newContext(browser, { width: 1440, height: 900 });
    await a.grantPermissions(["clipboard-read", "clipboard-write"]);
    const aEmail = await signUp(a, "ref-a");
    const ap = await a.newPage();
    await ap.goto("/account");
    await ap.getByRole("link", { name: "בחירת מסלול" }).click();
    await ap.getByRole("navigation", { name: "מחזור החיוב" }).getByRole("link", { name: "חודשי", exact: true }).click();
    await payWithMock(ap, "basic");
    const aBefore = await billing(a);
    await openArea(ap, "מנוי");
    const area = ap.getByRole("region", { name: "חבר מביא חבר" });
    await area.getByRole("button", { name: "העתקת הקישור" }).click();
    await expect(area.getByRole("button", { name: "הקישור הועתק" })).toBeVisible();
    const link = await ap.evaluate(() => navigator.clipboard.readText());
    expect(link).toMatch(/\/r\/[A-Z2-9]{7}$/);
    await expect(area.getByRole("link", { name: "שליחה בוואטסאפ" })).toHaveAttribute("href", new RegExp(`^https://wa\\.me/\\?text=.*${encodeURIComponent(link).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));

    // B opens the link (the cookie, then the home page with the utm), signs up and pays
    const b = await newContext(browser);
    const bp = await b.newPage();
    await bp.goto(`${new URL(link).pathname}?utm_source=friend`);
    await expect(bp).toHaveURL(/\/\?utm_source=friend$/);
    expect((await b.cookies()).find((c) => c.name === "alze_ref")?.value).toBe(link.split("/").pop());
    const bEmail = await signUp(b, "ref-b");
    await bp.goto("/account");
    await bp.getByRole("link", { name: "בחירת מסלול" }).click();
    await bp.getByRole("navigation", { name: "מחזור החיוב" }).getByRole("link", { name: "חודשי", exact: true }).click();
    await payWithMock(bp, "basic");

    // both: the next charge 30 days later — A's exactly, B's a month and 30 days from the payment
    const aAfter = await billing(a);
    expect(Date.parse(aAfter.nextChargeAt) - Date.parse(aBefore.nextChargeAt)).toBe(30 * DAY);
    const bSub = await billing(b);
    const bAhead = Date.parse(bSub.nextChargeAt) - Date.now();
    expect(bAhead).toBeGreaterThan(57 * DAY);
    expect(bAhead).toBeLessThan(62 * DAY);

    // A's counters
    await ap.reload();
    await expect(area.getByText("הצטרפו דרך הקישור").locator("..")).toContainText("1");
    await expect(area.getByText("שילמו", { exact: true }).locator("..")).toContainText("1");
    await expect(area.getByText("חודשים חינם", { exact: true }).locator("..")).toContainText("1");
    await expect(ap.getByRole("region", { name: "המנוי" }).getByText(`${dayIl(aAfter.nextChargeAt)}, 99 ₪`)).toBeVisible();
    await area.scrollIntoViewIfNeeded();
    await capture(ap, "referrals-1440");
    const phone = await a.newPage();
    await phone.setViewportSize({ width: 390, height: 844 });
    await phone.goto("/account?tab=plan#referrals");
    await phone.getByRole("region", { name: "חבר מביא חבר" }).scrollIntoViewIfNeeded();
    await capture(phone, "referrals-390");
    await phone.close();
    await b.close();
    await a.close();

    // the owner: B's page says who brought them; A's page lists B; the overview counts "הפניה" as a source
    const owner = await newContext(browser, { width: 1440, height: 900 });
    const email = OWNER;
    expect((await owner.request.post("/api/auth/otp/send", { data: { email } })).ok()).toBe(true);
    expect(await (await owner.request.post("/api/auth/otp/verify", { data: { email, code: await readCode(owner.request, email) } })).json()).toMatchObject({ ok: true });
    const op = await owner.newPage();
    await op.goto("/account");
    await op.getByRole("banner").getByRole("link", { name: "ניהול" }).click();
    await expect(op.getByRole("heading", { name: "כניסה לפאנל הניהול" })).toBeVisible();
    await op.getByRole("button", { name: "שליחת קוד" }).click();
    await expect(op.getByText("הקוד נשלח למייל.", { exact: false })).toBeVisible();
    await op.getByLabel("הקוד מהמייל").fill(await readCode(owner.request, OWNER));
    await op.getByRole("button", { name: "כניסה", exact: true }).click();
    await expect(op.getByRole("heading", { level: 1, name: "ניהול" })).toBeVisible();
    await expect(op.getByRole("region", { name: "מאיפה הגיעו" }).getByText("הפניה", { exact: true })).toBeVisible();
    const refs = op.getByRole("region", { name: "חבר מביא חבר" });
    await expect(refs.getByRole("row").filter({ hasText: bEmail })).toContainText(aEmail);
    await refs.getByRole("row").filter({ hasText: bEmail }).getByRole("link", { name: bEmail }).click();
    await expect(op).toHaveURL(/\/admin\/users\/[0-9a-f-]{36}$/);
    await expect(op.getByRole("heading", { level: 1 })).toContainText(bEmail);
    const panel = op.getByRole("region", { name: "חבר מביא חבר" });
    await expect(panel.getByRole("link", { name: aEmail })).toBeVisible();
    await expect(panel.getByText("שילם, חודש חינם ניתן")).toBeVisible();
    await panel.scrollIntoViewIfNeeded();
    await capture(op, "admin-user-referral-1440");
    await panel.getByRole("link", { name: aEmail }).click();
    await expect(op.getByRole("heading", { level: 1 })).toContainText(aEmail);
    await expect(op.getByRole("region", { name: "חבר מביא חבר" }).getByRole("link", { name: bEmail })).toBeVisible();
    await op.setViewportSize({ width: 390, height: 844 });
    await op.getByRole("region", { name: "חבר מביא חבר" }).scrollIntoViewIfNeeded();
    await capture(op, "admin-user-referral-390");
    await owner.close();
  });

  test("the price switch at 390: no horizontal overflow, both faces", async ({ browser }) => {
    const ctx = await newContext(browser, { width: 390, height: 844, reducedMotion: "reduce" });
    const page = await ctx.newPage();
    await page.goto("/pricing");
    await page.evaluate(() => document.fonts.ready);
    const overflow = () => page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - window.innerWidth);
    expect(await overflow()).toBeLessThanOrEqual(0);
    await page.getByRole("article", { name: "בסיסי" }).scrollIntoViewIfNeeded();
    await page.evaluate(() => window.scrollBy(0, -140));
    await capture(page, "pricing-monthly-390");
    await page.getByText("שנתי", { exact: true }).first().click();
    await expect(page.getByRole("article", { name: "בסיסי" }).getByText("990 ₪ לשנה, בחיוב אחד")).toBeVisible();
    expect(await overflow()).toBeLessThanOrEqual(0);
    await capture(page, "pricing-annual-390");
    await ctx.close();
  });
});
