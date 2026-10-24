import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type APIRequestContext, type BrowserContext, type Page } from "@playwright/test";
import { newContext, readCode, uniqueEmail } from "./helpers";

/**
 * The owner's alerts (lib/admin/alerts.ts, the "התראות" tab): a new sign-up and a ticket each put one alert mail in the
 * owner's inbox (the dev outbox), and turning the sign-up switch off in /admin stops the next one. Memory mode only,
 * nothing is mailed. The quiet hours and Shabbat are turned off first (the run may be at night or on a Saturday) and
 * the defaults are put back at the end.
 * CAPTURE_ALERTS=<dir> also saves the tab at 1440 and 390 and a sample alert mail.
 */
const OWNER = "danielnotexist@gmail.com";
const SHOTS = process.env.CAPTURE_ALERTS;

interface OwnerAlertMail {
  to: string[];
  subject: string;
  text: string;
  html: string;
  replyTo: string | null;
}

async function ownerAlerts(request: APIRequestContext): Promise<OwnerAlertMail[]> {
  const res = await request.get(`/api/dev/outbox?to=${encodeURIComponent(OWNER)}`);
  expect(res.ok()).toBe(true);
  return ((await res.json()) as { ownerAlerts: OwnerAlertMail[] }).ownerAlerts;
}

async function signIn(ctx: BrowserContext, email: string): Promise<void> {
  const sent = await ctx.request.post("/api/auth/otp/send", { data: { email } });
  expect(sent.ok(), await sent.text()).toBe(true);
  const code = await readCode(ctx.request, email);
  expect(await (await ctx.request.post("/api/auth/otp/verify", { data: { email, code } })).json()).toMatchObject({ ok: true });
}

async function openPanel(ctx: BrowserContext): Promise<Page> {
  await signIn(ctx, OWNER);
  const page = await ctx.newPage();
  await page.goto("/admin/enter");
  await page.getByRole("button", { name: "שליחת קוד" }).click();
  await expect(page.getByText("הקוד נשלח למייל.", { exact: false })).toBeVisible();
  await page.getByLabel("הקוד מהמייל").fill(await readCode(ctx.request, OWNER));
  await page.getByRole("button", { name: "כניסה", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: "ניהול", exact: true })).toBeVisible();
  return page;
}

/** Sets the switches of the tab and saves. */
async function save(page: Page, set: { signup?: boolean; quiet?: boolean; shabbat?: boolean }): Promise<void> {
  await page.goto("/admin?tab=alerts");
  const form = page.locator("form").filter({ has: page.getByRole("button", { name: "שמירת ההגדרות" }) });
  if (set.signup !== undefined) await form.getByRole("switch", { name: "נרשם חדש" }).setChecked(set.signup);
  if (set.quiet !== undefined) await form.getByRole("switch", { name: "שעות שקט", exact: true }).setChecked(set.quiet);
  if (set.shabbat !== undefined) await form.getByRole("switch", { name: "שבת וחג" }).setChecked(set.shabbat);
  await form.getByRole("button", { name: "שמירת ההגדרות" }).click();
  await expect(page.getByRole("status").filter({ hasText: "הגדרות ההתראות נשמרו." })).toBeVisible();
}

test("a sign-up and a ticket each mail the owner once; the sign-up switch in /admin turns that alert off", async ({ browser }) => {
  test.setTimeout(240_000);
  const owner = await newContext(browser, { width: 1440, height: 1000 });
  const page = await openPanel(owner);
  const nav = page.getByRole("navigation", { name: "ניווט בפאנל הניהול" });
  await nav.getByRole("link", { name: /^התראות/ }).click();
  await expect(page.getByRole("heading", { level: 2, name: "התראות", exact: true })).toBeVisible();
  await save(page, { signup: true, quiet: false, shabbat: false });

  // 1. a new sign-up from a campaign → one alert mail in the owner's inbox, with the source and the user's page
  const visitor = await newContext(browser);
  const landing = await visitor.newPage();
  await landing.goto("/?utm_source=e2e-alerts&utm_campaign=owner");
  const email = uniqueEmail("alert-signup");
  await signIn(visitor, email);
  await expect.poll(async () => (await ownerAlerts(owner.request)).filter((m) => m.subject.includes(email)).length, { message: "the sign-up alert" }).toBe(1);
  const signupMail = (await ownerAlerts(owner.request)).find((m) => m.subject.includes(email))!;
  expect(signupMail.subject).toBe(`נרשם חדש: ${email} (מקור: e2e-alerts)`);
  expect(signupMail.to).toEqual([OWNER]);
  expect(signupMail.text).toMatch(/\/admin\/users\/[0-9a-f-]{36}/);

  // 2. a ticket from that user → one alert (the support inbox gets its own ticket mail; the owner one alert, once)
  const subject = `שאלה על החיוב ${Date.now().toString(36)}`;
  const ticket = await visitor.request.post("/api/support/ticket", { data: { name: "דנה", email, subject, body: "חויבתי פעמיים החודש, אפשר לבדוק?", website: "" } });
  expect(ticket.ok(), await ticket.text()).toBe(true);
  await expect.poll(async () => (await ownerAlerts(owner.request)).filter((m) => m.subject === `פנייה חדשה: ${subject}`).length, { message: "the ticket alert" }).toBe(1);
  await page.waitForTimeout(1500);
  const ticketMails = (await ownerAlerts(owner.request)).filter((m) => m.subject === `פנייה חדשה: ${subject}`);
  expect(ticketMails).toHaveLength(1);
  expect(ticketMails[0]!.replyTo).toBe(email);
  expect(ticketMails[0]!.text).toContain("/admin?tab=tickets#t-");
  await visitor.close();

  // the tab lists both, sent by mail
  await page.goto("/admin?tab=alerts");
  const log = page.getByRole("region", { name: "ההתראות האחרונות" });
  await expect(log.getByRole("row").filter({ hasText: email }).filter({ hasText: "נשלחה" })).toHaveCount(1);
  await expect(log.getByRole("row").filter({ hasText: subject }).filter({ hasText: "מייל" })).toHaveCount(1);

  if (SHOTS) {
    mkdirSync(SHOTS, { recursive: true });
    await page.waitForLoadState("networkidle");
    await page.screenshot({ path: join(SHOTS, "alerts-tab-1440.png"), fullPage: true, caret: "initial" });
    const narrow = await newContext(browser, { width: 390, height: 844 });
    await narrow.addCookies(await owner.cookies());
    const phone = await narrow.newPage();
    await phone.goto("/admin?tab=alerts");
    await expect(phone.getByRole("heading", { level: 2, name: "התראות", exact: true })).toBeVisible();
    expect(await phone.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    await phone.waitForLoadState("networkidle");
    await phone.screenshot({ path: join(SHOTS, "alerts-tab-390.png"), fullPage: true, caret: "initial" });
    await narrow.close();
    writeFileSync(join(SHOTS, "alert-signup.html"), signupMail.html);
    writeFileSync(join(SHOTS, "alert-ticket.html"), ticketMails[0]!.html);
    const mailPage = await owner.newPage();
    await mailPage.setViewportSize({ width: 640, height: 900 });
    await mailPage.setContent(signupMail.html);
    await mailPage.screenshot({ path: join(SHOTS, "alert-mail-signup.png"), fullPage: true });
    await mailPage.setContent(ticketMails[0]!.html);
    await mailPage.screenshot({ path: join(SHOTS, "alert-mail-ticket.png"), fullPage: true });
    await mailPage.close();
  }

  // 3. the sign-up switch off → the next sign-up sends nothing
  await save(page, { signup: false });
  await expect(page.getByRole("switch", { name: "נרשם חדש" })).not.toBeChecked();
  const quiet = await newContext(browser);
  const second = uniqueEmail("alert-off");
  await signIn(quiet, second);
  await page.waitForTimeout(3000);
  expect((await ownerAlerts(owner.request)).filter((m) => m.subject.includes(second))).toHaveLength(0);
  await quiet.close();
  // and the tab never listed it
  await page.goto("/admin?tab=alerts");
  await expect(page.getByRole("region", { name: "ההתראות האחרונות" }).getByRole("row").filter({ hasText: second })).toHaveCount(0);

  // back to the defaults for the other specs on this dev server
  await save(page, { signup: true, quiet: true, shabbat: true });
  await owner.close();
});
