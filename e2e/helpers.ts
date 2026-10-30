import { createHmac, randomInt } from "node:crypto";
import { expect, type APIRequestContext, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { E2E_META_SECRET } from "../playwright.config";

/** A fresh browser context with its own fake client IP (the OTP limiter counts per IP; the dev server is shared). */
export async function newContext(browser: Browser, opts: { width?: number; height?: number; reducedMotion?: "reduce" | "no-preference" } = {}): Promise<BrowserContext> {
  return browser.newContext({
    viewport: { width: opts.width ?? 1280, height: opts.height ?? 800 },
    reducedMotion: opts.reducedMotion ?? "no-preference",
    colorScheme: "dark",
    locale: "he-IL",
    extraHTTPHeaders: { "x-forwarded-for": `10.${randomInt(0, 255)}.${randomInt(0, 255)}.${randomInt(1, 254)}` },
  });
}

export const uniqueEmail = (tag: string) => `${tag}.${Date.now().toString(36)}${randomInt(0, 1e6).toString(36)}@e2e.example.co.il`;
export const uniquePhone = () => `9725${String(randomInt(0, 1e8)).padStart(8, "0")}`;

interface Outbox {
  mails: { to: string; code: string }[];
  messages: { kind: string; to: string; body?: string }[];
}

async function outbox(request: APIRequestContext, to: string): Promise<Outbox> {
  const res = await request.get(`/api/dev/outbox?to=${encodeURIComponent(to)}`);
  expect(res.ok(), "the dev outbox answers in DATA_MODE=memory").toBe(true);
  return (await res.json()) as Outbox;
}

/** The latest sign-in code the in-memory mailer "sent" to this address. */
export async function readCode(request: APIRequestContext, email: string): Promise<string> {
  let code = "";
  await expect
    .poll(async () => {
      code = (await outbox(request, email)).mails.at(-1)?.code ?? "";
      return code;
    }, { message: `a code mailed to ${email}` })
    .toMatch(/^\d{6}$/);
  return code;
}

/** Waits for a WhatsApp text from the bot to `phone` that matches. */
export async function waitForWaText(request: APIRequestContext, phone: string, match: RegExp): Promise<string> {
  let found = "";
  await expect
    .poll(async () => {
      const texts = (await outbox(request, phone)).messages.filter((m) => m.body).map((m) => m.body!);
      found = texts.findLast((t) => match.test(t)) ?? "";
      return found;
    }, { message: `a WhatsApp message to ${phone} matching ${match}`, timeout: 30_000 })
    .not.toBe("");
  return found;
}

let msgSeq = 0;
/** Sends a signed WhatsApp Cloud API webhook (a text from `phone`) to our own endpoint, the way Meta would. */
export async function sendWhatsapp(request: APIRequestContext, phone: string, text: string): Promise<void> {
  await postWhatsapp(request, phone, { type: "text", text: { body: text } });
}

/** A reply button pressed on a message from the bot (`interactive.button_reply`). */
export async function pressWhatsappButton(request: APIRequestContext, phone: string, id: string, title: string): Promise<void> {
  await postWhatsapp(request, phone, { type: "interactive", interactive: { type: "button_reply", button_reply: { id, title } } });
}

/**
 * Links `phone` with the site's wa.me message: the code goes in, the bot names the account and asks, "כן, לקשר" is
 * pressed (its id carries the code — lib/bot/linking.ts), and the number is linked.
 */
export async function linkWhatsapp(request: APIRequestContext, phone: string, message: string): Promise<void> {
  const token = /\(([A-Z0-9]{4}-[A-Z0-9]{4})\)/.exec(message)?.[1];
  expect(token, message).toBeTruthy();
  await sendWhatsapp(request, phone, message);
  await waitForWaText(request, phone, /הקוד הזה שייך לחשבון/);
  await pressWhatsappButton(request, phone, `lk:yes:${token}`, "כן, לקשר");
  await waitForWaText(request, phone, /החשבון מקושר/);
}

async function postWhatsapp(request: APIRequestContext, phone: string, message: Record<string, unknown>): Promise<void> {
  const body = JSON.stringify({
    object: "whatsapp_business_account",
    entry: [
      {
        id: "WABA",
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              metadata: { phone_number_id: "PNID", display_phone_number: "972500000000" },
              contacts: [{ profile: { name: "דנה" }, wa_id: phone }],
              messages: [{ from: phone, id: `wamid.e2e.${Date.now()}.${++msgSeq}`, timestamp: String(Math.floor(Date.now() / 1000)), ...message }],
            },
          },
        ],
      },
    ],
  });
  const sig = "sha256=" + createHmac("sha256", E2E_META_SECRET).update(body).digest("hex");
  const res = await request.post("/api/wa/webhook", { data: body, headers: { "content-type": "application/json", "x-hub-signature-256": sig } });
  expect(res.status()).toBe(200);
}

/** Types an email on the current email card and sends the code; returns once the code card is shown. */
export async function submitEmail(page: Page, email: string, opts: { updates?: boolean } = {}): Promise<void> {
  const send = page.getByRole("button", { name: "שליחת קוד" });
  await expect(send).toBeDisabled();
  await page.getByLabel("כתובת מייל").fill(email);
  if (opts.updates !== undefined) {
    // the toggle is ON by default — click only when the wanted state differs
    const toggle = page.getByRole("switch", { name: "עדכונים וטיפים" });
    if (((await toggle.getAttribute("aria-checked")) === "true") !== opts.updates) await toggle.click();
  }
  await expect(send).toBeEnabled();
  await send.click();
  await expect(page.getByRole("heading", { name: "הזינו את הקוד" })).toBeVisible();
}

/** The personal area: opens an area from its navigation ("חיבורים", "מנוי", …) and waits until it is the current one. */
export async function openArea(page: Page, label: "סקירה" | "חיבורים" | "וואטסאפ" | "סוכנים" | "מנוי" | "הגדרות"): Promise<void> {
  const link = page.getByRole("navigation", { name: "ניווט באזור האישי" }).getByRole("link", { name: label, exact: true });
  await link.click();
  await expect(link).toHaveAttribute("aria-current", "page");
}

/** Types the six digits; the code card submits by itself on the sixth digit. */
export async function enterCode(page: Page, code: string): Promise<void> {
  const input = page.getByRole("textbox", { name: "קוד בן 6 ספרות" });
  await input.click();
  await page.keyboard.type(code, { delay: 40 });
}

/**
 * On /pay/<token>: choose a plan (basic by default) and let the memory-mode HYP stand-in approve it. The stand-in is
 * same-origin, so the server action's redirect is soft-navigated by the router and stops on /api/pay/mock; load it for
 * real (real HYP is another origin, so the browser navigates there normally). Ends on /account with the paid plan
 * (a signed-in browser), or on `landing` (e.g. /pay/done for a link opened without a session).
 */
export async function payWithMock(page: Page, plan: "basic" | "pro" = "basic", landing: RegExp = /\/account(\?|$)/): Promise<void> {
  await page
    .getByRole("form", { name: plan === "basic" ? "בסיסי" : "פרו", exact: true })
    .getByRole("button", { name: "לתשלום" })
    .click();
  await page.waitForURL(/\/api\/pay\/mock\?|\/account\?|\/pay\/done\?/);
  if (/\/api\/pay\/mock\?/.test(page.url())) await page.goto(page.url());
  await expect(page).toHaveURL(landing);
  if (!landing.test("/account")) return;
  await page.goto("/account");
  await expect(page.getByRole("meter", { name: "הודעות החודש" })).toBeVisible();
}
