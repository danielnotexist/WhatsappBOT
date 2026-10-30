import { expect, test, type BrowserContext } from "@playwright/test";
import { newContext, readCode, uniqueEmail } from "./helpers";

/**
 * The admin user card on the demo month (POST /api/dev/admin-seed). The file is named to run LAST (workers: 1, files in
 * name order): the seed fills the shared memory store with a month of fictional sign-ups and their sources, and a spec
 * that runs after it would find its own source folded into "אחר" on the overview (lib/admin/view.ts sourceSplit).
 */
const OWNER = "danielnotexist@gmail.com";

async function signIn(ctx: BrowserContext, email: string): Promise<void> {
  const sent = await ctx.request.post("/api/auth/otp/send", { data: { email } });
  expect(sent.ok(), await sent.text()).toBe(true);
  const code = await readCode(ctx.request, email);
  expect(await (await ctx.request.post("/api/auth/otp/verify", { data: { email, code } })).json()).toMatchObject({ ok: true });
}

/** The owner, signed in with the panel open (the mailed one-time code from the dev outbox). */
async function openPanel(ctx: BrowserContext): Promise<void> {
  await signIn(ctx, OWNER);
  const page = await ctx.newPage();
  await page.goto("/admin/enter");
  await page.getByRole("button", { name: "שליחת קוד" }).click();
  await expect(page.getByText("הקוד נשלח למייל.", { exact: false })).toBeVisible();
  await page.getByLabel("הקוד מהמייל").fill(await readCode(ctx.request, OWNER));
  await page.getByRole("button", { name: "כניסה", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: "ניהול", exact: true })).toBeVisible();
  await page.close();
}

test("the user card opens the full conversation and the full timeline in new tabs; both pages read well, a long link wraps", async ({ browser }) => {
  test.setTimeout(180_000);
  const owner = await newContext(browser);
  expect((await owner.request.post("/api/dev/admin-seed")).ok()).toBe(true);
  await openPanel(owner);
  const page = await owner.newPage();
  await page.goto("/admin?tab=users&q=dana%40example.co.il");
  await page.getByRole("row").filter({ hasText: "dana@example.co.il" }).getByRole("link").first().click();
  await expect(page).toHaveURL(/\/admin\/users\/[0-9a-f-]{36}$/);
  const userPath = new URL(page.url()).pathname;

  // one compact card instead of the two endless sections
  const card = page.getByRole("region", { name: "פעילות" });
  await expect(card.getByRole("list", { name: "ההודעות האחרונות" }).getByRole("listitem")).toHaveCount(4);
  await expect(card.getByRole("list", { name: "הפעולות האחרונות" }).getByRole("listitem")).toHaveCount(5);
  const chatLink = card.getByRole("link", { name: /פתיחת השיחה המלאה/ });
  const timelineLink = card.getByRole("link", { name: /ציר הפעולות המלא/ });
  for (const link of [chatLink, timelineLink]) {
    await expect(link).toHaveAttribute("target", "_blank");
    await expect(link).toHaveAttribute("rel", /noopener/);
  }
  await expect(chatLink).toHaveAttribute("href", `${userPath}/conversation`);
  await expect(timelineLink).toHaveAttribute("href", `${userPath}/activity`);

  // the conversation opens in its own tab, at the newest message (the long sign-in link), wrapped inside its bubble
  const [chat] = await Promise.all([owner.waitForEvent("page"), chatLink.click()]);
  await expect(chat).toHaveURL(/\/conversation$/);
  const log = chat.getByRole("log", { name: "ההודעות" });
  const longLink = log.getByText("api/auth/google/start", { exact: false }).last();
  await expect(longLink).toBeInViewport();
  const paneBox = (await log.boundingBox())!;
  const linkBox = (await longLink.boundingBox())!;
  expect(linkBox.x).toBeGreaterThanOrEqual(paneBox.x);
  expect(linkBox.x + linkBox.width).toBeLessThanOrEqual(paneBox.x + paneBox.width);
  await expect(log.getByRole("heading", { name: "היום" })).toBeVisible();
  // filters and search work on what is loaded
  await chat.getByRole("button", { name: "קוליות" }).click();
  await expect(chat.getByRole("button", { name: "קוליות" })).toHaveAttribute("aria-pressed", "true");
  await expect(log.getByText("הודעה קולית").first()).toBeVisible();
  await expect(log.getByText("api/auth/google/start", { exact: false })).toHaveCount(0);
  await chat.getByRole("button", { name: "הכול" }).click();
  await chat.getByRole("searchbox", { name: "חיפוש בשיחה" }).fill("חוזה");
  await expect(log.locator("mark").first()).toHaveText("חוזה");
  // older messages load above, from the server
  await chat.getByRole("searchbox", { name: "חיפוש בשיחה" }).fill("");
  const loaded = await log.getByRole("listitem").count();
  await log.getByRole("button", { name: "טעינת הודעות קודמות" }).click();
  await expect.poll(() => log.getByRole("listitem").count()).toBeGreaterThan(loaded);
  expect(await chat.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);

  // the timeline: Hebrew words, by day, filtered by category in the URL
  const [activity] = await Promise.all([owner.waitForEvent("page"), timelineLink.click()]);
  await expect(activity).toHaveURL(/\/activity$/);
  await expect(activity.getByRole("heading", { name: "היום" })).toBeVisible();
  await expect(activity.getByText("נכנס לאתר").first()).toBeVisible();
  await activity.getByRole("navigation", { name: "סינון לפי סוג" }).getByRole("link", { name: /תקלות/ }).click();
  await expect(activity).toHaveURL(/cat=errors/);
  await expect(activity.getByText(/^תקלה(,|$)/).first()).toBeVisible();
  await expect(activity.getByText("נכנס לאתר")).toHaveCount(0);
  await owner.close();

  // a regular user: a real 404 on both pages
  const visitor = await newContext(browser);
  await signIn(visitor, uniqueEmail("admin-sub"));
  expect((await visitor.request.get(`${userPath}/conversation`)).status()).toBe(404);
  expect((await visitor.request.get(`${userPath}/activity`)).status()).toBe(404);
  await visitor.close();
});
