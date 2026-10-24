import { randomUUID } from "node:crypto";
import { expect, test, type BrowserContext } from "@playwright/test";
import { newContext, readCode, uniqueEmail } from "./helpers";

/**
 * The owner's admin panel (/admin, lib/admin): a regular user who came from a campaign opens a ticket and asks the
 * website's support chat; the owner signs in, passes the panel's own one-time code from the mailbox (the dev outbox),
 * sees the user with the source, the ticket and the chat, and moves the ticket on. A regular user gets a 404.
 * The owner is ADMIN_EMAILS' default (danielnotexist@gmail.com) — memory mode only, nothing is mailed.
 */
const OWNER = "danielnotexist@gmail.com";

async function signIn(ctx: BrowserContext, email: string): Promise<void> {
  const sent = await ctx.request.post("/api/auth/otp/send", { data: { email } });
  expect(sent.ok(), await sent.text()).toBe(true);
  const code = await readCode(ctx.request, email);
  expect(await (await ctx.request.post("/api/auth/otp/verify", { data: { email, code } })).json()).toMatchObject({ ok: true });
}

test("the owner sees a user's source, ticket and chat, and changes the ticket's status; others get a 404", async ({ browser }) => {
  test.setTimeout(180_000);
  const tag = Date.now().toString(36);
  const subject = `החיבור נפל ${tag}`;
  const question = `כמה זה עולה? ${tag}`;

  // 1. a visitor from a campaign signs up, opens a ticket and talks to the support chat
  const visitor = await newContext(browser);
  const landing = await visitor.newPage();
  await landing.goto("/?utm_source=test&utm_campaign=e2e-admin");
  expect((await visitor.cookies()).find((c) => c.name === "alze_src")).toBeTruthy();
  const email = uniqueEmail("admin-src");
  await signIn(visitor, email);
  const ticket = await visitor.request.post("/api/support/ticket", { data: { name: "דנה", email, subject, body: "מהבוקר עלזה לא רואה את היומן שלי.", website: "" } });
  expect(ticket.ok(), await ticket.text()).toBe(true);
  const chat = await visitor.request.post("/api/support/chat", { data: { message: question, chatId: randomUUID(), page: "/account" } });
  expect(chat.ok(), await chat.text()).toBe(true);

  // 4. (early, while signed in) a regular user: no panel, no enter route — a real 404
  expect((await visitor.request.get("/admin")).status()).toBe(404);
  expect((await visitor.request.get("/admin/enter", { maxRedirects: 0 })).status()).toBe(404);
  expect((await visitor.request.get("/admin?tab=users")).status()).toBe(404);
  await landing.goto("/account");
  await expect(landing.getByRole("banner").getByRole("link", { name: "ניהול" })).toHaveCount(0);
  await visitor.close();

  // 2. the owner signs in, opens "ניהול" and passes the one-time code from the mailbox
  const owner = await newContext(browser);
  await signIn(owner, OWNER);
  const page = await owner.newPage();
  await page.goto("/account");
  await page.getByRole("banner").getByRole("link", { name: "ניהול" }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole("heading", { name: "כניסה לפאנל הניהול" })).toBeVisible();
  // the email alone opens nothing
  expect((await owner.request.get("/admin?tab=users")).status()).toBe(200);
  await expect(page.getByRole("navigation", { name: "ניווט בפאנל הניהול" })).toHaveCount(0);
  await page.getByRole("button", { name: "שליחת קוד" }).click();
  await expect(page.getByText("הקוד נשלח למייל.", { exact: false })).toBeVisible();
  const adminCode = await readCode(owner.request, OWNER);
  // a wrong code (the demo's sign-in code never works here) is refused, and the panel stays closed
  await page.getByLabel("הקוד מהמייל").fill(adminCode === "123456" ? "654321" : "123456");
  await page.getByRole("button", { name: "כניסה", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "הקוד לא נכון." })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "ניווט בפאנל הניהול" })).toHaveCount(0);
  await page.getByLabel("הקוד מהמייל").fill(adminCode);
  await page.getByRole("button", { name: "כניסה", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: "ניהול" })).toBeVisible();
  const nav = page.getByRole("navigation", { name: "ניווט בפאנל הניהול" });
  await expect(nav.getByRole("link", { name: /^סקירה/ })).toHaveAttribute("aria-current", "page");
  await expect(page.getByText("הכנסה חודשית קבועה")).toBeVisible();

  // 3. the user with the source
  await nav.getByRole("link", { name: /^משתמשים/ }).click();
  await page.getByRole("searchbox", { name: "חיפוש" }).fill(email);
  await page.getByRole("button", { name: "הצגה" }).click();
  const row = page.getByRole("row").filter({ hasText: email });
  await expect(row).toHaveCount(1);
  await expect(row.getByRole("cell").nth(8)).toHaveText("test");
  await row.getByRole("link").first().click();
  await expect(page).toHaveURL(/\/admin\/users\/[0-9a-f-]{36}$/);
  const source = page.getByRole("region", { name: "מקור ההרשמה" });
  await expect(source.getByText("test", { exact: true })).toBeVisible();
  await expect(source.getByText("e2e-admin")).toBeVisible();
  await expect(page.getByRole("region", { name: "פניות" }).getByRole("heading", { name: subject })).toBeVisible();
  const chats = page.getByRole("region", { name: "שיחות בצ'אט באתר" });
  await expect(chats.getByText(question).first()).toBeVisible();

  // the tickets tab: the ticket moves to "בטיפול" with a note
  await page.goto("/admin?tab=tickets");
  const card = page.getByRole("article", { name: subject });
  await expect(card.locator("header").getByText("פתוחה")).toBeVisible();
  await card.getByLabel("סטטוס").selectOption("in_progress");
  await card.getByLabel("הערה (לא נשלחת לפונה)").fill("חזרתי אליה במייל");
  await card.getByRole("button", { name: "שמירה" }).click();
  await expect(page.getByRole("status").filter({ hasText: "הפנייה עודכנה." })).toBeVisible();
  await expect(page.getByRole("article", { name: subject }).locator("header").getByText("בטיפול")).toBeVisible();

  // the website chat tab lists the conversation
  await page.goto("/admin?tab=chats");
  await expect(page.getByRole("region", { name: "צ'אט באתר" }).getByText(question).first()).toBeVisible();

  // closing the panel: back to the personal area, and /admin needs the code again
  await page.goto("/admin");
  await page.getByRole("button", { name: "סגירת הפאנל" }).click();
  await expect(page).toHaveURL(/\/account$/);
  expect((await owner.request.get("/admin")).status()).toBe(404);
  await owner.close();
});
