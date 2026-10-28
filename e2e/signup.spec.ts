import { expect, test, type BrowserContext } from "@playwright/test";
import { enterCode, newContext, readCode, sendWhatsapp, submitEmail, uniqueEmail, uniquePhone, waitForWaText } from "./helpers";

/** Signs a new user up through the API (same endpoints the cards call); the context keeps the session cookie. */
async function apiSignup(ctx: BrowserContext): Promise<string> {
  const email = uniqueEmail("api");
  expect((await ctx.request.post("/api/auth/otp/send", { data: { email } })).ok()).toBe(true);
  const code = await readCode(ctx.request, email);
  const res = await ctx.request.post("/api/auth/otp/verify", { data: { email, code } });
  expect(await res.json()).toMatchObject({ ok: true });
  return email;
}

/** The wa.me link on /start/ready → its prefilled message and the XXXX-XXXX token inside it. */
async function readyLink(ctx: BrowserContext): Promise<{ href: string; message: string; token: string }> {
  const page = await ctx.newPage();
  await page.goto("/start/ready");
  const href = (await page.getByRole("link", { name: "חיבור לוואטסאפ" }).getAttribute("href"))!;
  await page.close();
  const url = new URL(href);
  const message = url.searchParams.get("text")!;
  const token = /\(([A-Z0-9]{4}-[A-Z0-9]{4})\)/.exec(message)?.[1] ?? "";
  return { href, message, token };
}

test.describe("signup — the screen sequence of round plan §3", () => {
  test("intro → email → code → connect → skip → ready, and the wa.me link carries a working one-time token", async ({ browser }) => {
    const ctx = await newContext(browser);
    const page = await ctx.newPage();
    const email = uniqueEmail("flow");

    // 1. intro: עלזה is calling
    await page.goto("/start");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("העוזרת האישית שלך, בוואטסאפ.");
    await expect(page.getByRole("img", { name: "עלזה מתקשרת אליך בוואטסאפ" })).toBeVisible();
    // no subtitle under the headline (Daniel, 28.10.2026); the line on what Microsoft / Google also connect stays
    await expect(page.getByText("לוקח בערך דקה.")).toHaveCount(0);
    await expect(page.getByText(/מחברת לעלזה גם את המייל, היומן והקבצים/).filter({ visible: true })).toHaveCount(1);
    await page.getByRole("link", { name: "המשך עם מייל" }).click();

    // 2. email card (cream paper): the button wakes up only for a valid address; updates toggle is on by default
    await expect(page).toHaveURL(/\/start\/email$/);
    await expect(page.getByRole("link", { name: "כבר יש לך חשבון? כניסה" })).toBeVisible();
    await expect(page.getByText("קודם כל")).toBeVisible();
    await expect(page.getByRole("switch", { name: "עדכונים וטיפים" })).toHaveAttribute("aria-checked", "true");
    await page.getByLabel("כתובת מייל").fill("not-an-email");
    await expect(page.getByRole("button", { name: "שליחת קוד" })).toBeDisabled();
    await page.getByLabel("כתובת מייל").fill("");
    await submitEmail(page, email, { updates: true });

    // 3. code card (dusty pink): six cells, countdown, change email; a wrong code is refused in Hebrew
    await expect(page).toHaveURL(/\/start\/code\?/);
    await expect(page.getByText(`שלחנו 6 ספרות ל-${email}`)).toBeVisible();
    await expect(page.getByText(/שליחה חוזרת בעוד 0:[0-5]\d/)).toBeVisible();
    await expect(page.getByRole("link", { name: "שינוי מייל" })).toHaveAttribute("href", `/start/email?email=${encodeURIComponent(email)}&updates=1`);

    // "שינוי מייל" → a fresh email card with the address and the opt-in kept, its button awake; then on again
    // (a code was sent less than a minute ago, so the card goes straight back with the cooldown)
    await page.getByRole("link", { name: "שינוי מייל" }).click();
    await expect(page).toHaveURL(/\/start\/email\?email=/);
    await expect(page.getByLabel("כתובת מייל")).toHaveValue(email);
    await expect(page.getByRole("switch", { name: "עדכונים וטיפים" })).toHaveAttribute("aria-checked", "true");
    await expect(page.getByRole("button", { name: "שליחת קוד" })).toBeEnabled();
    await page.getByRole("button", { name: "שליחת קוד" }).click();
    await expect(page).toHaveURL(/\/start\/code\?.*updates=1/);
    await expect(page.getByText(`שלחנו 6 ספרות ל-${email}`)).toBeVisible();
    const code = await readCode(ctx.request, email);
    await enterCode(page, code === "000000" ? "111111" : "000000");
    await expect(page.getByRole("alert").filter({ hasText: "הקוד לא נכון" })).toBeVisible();
    await enterCode(page, code); // auto-submits on the sixth digit

    // 4. connect card (sage); signed in now, so the header offers the personal area instead of sign-in
    await expect(page).toHaveURL(/\/start\/connect$/);
    await expect(page.getByRole("banner").getByRole("link", { name: "לאזור האישי" })).toHaveAttribute("href", "/account");
    await expect(page.getByText("כבר יש לך חשבון? כניסה")).toHaveCount(0);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("תנו לעלזה את כוח-העל הראשון שלה");
    await expect(page.getByRole("link", { name: "חיבור Microsoft 365 / Outlook" })).toBeVisible();
    await expect(page.getByRole("link", { name: "חיבור Gmail" })).toBeVisible();
    await page.getByRole("link", { name: "דילוג בינתיים" }).click();

    // 6. ready: confetti, wa.me with the one-time token, QR on desktop
    await expect(page).toHaveURL(/\/start\/ready$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("העוזרת שלך מוכנה.");
    await expect(page.getByText(/עובד פעם אחת, ל-15 דקות/)).toBeVisible();
    await expect(page.getByTestId("confetti")).toBeAttached();
    await expect(page.getByRole("img", { name: /קוד QR/ })).toBeVisible();
    const href = (await page.getByRole("link", { name: "חיבור לוואטסאפ" }).getAttribute("href"))!;
    const url = new URL(href);
    expect(url.hostname).toBe("wa.me");
    expect(url.pathname).toMatch(/^\/9725\d{8}$/);
    const message = url.searchParams.get("text")!;
    const token = /^היי עלזה! אפשר לקשר את החשבון שלי \(([A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4})\)$/.exec(message)?.[1];
    expect(token, message).toBeTruthy();

    // the old link step now lands here too
    await page.goto("/start/link");
    await expect(page).toHaveURL(/\/start\/ready$/);

    // the token really links a WhatsApp number to this account
    const phone = uniquePhone();
    await sendWhatsapp(ctx.request, phone, message);
    await waitForWaText(ctx.request, phone, /החשבון מקושר/);
    await ctx.close();
  });

  test("Microsoft path: connect → hand-off screen → Microsoft (fixture) → back on /start/ready with Outlook connected", async ({ browser }) => {
    const ctx = await newContext(browser);
    await apiSignup(ctx);
    // Stand in for login.microsoftonline.com one hop earlier, like the Google path: let our start route answer, read the
    // authorize URL it redirects to, and approve at once (302 straight to our callback). The browser never leaves
    // localhost. Intercepting the cross-origin redirect itself was flaky: now and then Chromium followed the 303 without
    // handing the redirected request to the route, the real Microsoft page loaded through the network, and its own
    // requests (no redirect_uri) reached the handler as "TypeError: Invalid URL".
    let authorizeUrl: URL | null = null;
    // hold the hand-off until the transition screen has been checked (it only shows for ~0.9s); never for good: should
    // a check below fail or lag, the hold gives way after 20s and the test fails on that check, not on a deadlock
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    await ctx.route("**/api/auth/microsoft/start**", async (route) => {
      expect(new URL(route.request().url()).searchParams.get("returnTo")).toBe("onboarding");
      await Promise.race([gate, new Promise((r) => setTimeout(r, 20_000))]);
      const res = await route.fetch({ maxRedirects: 0 });
      authorizeUrl = new URL(res.headers()["location"]!);
      expect(authorizeUrl.hostname).toBe("login.microsoftonline.com");
      const back = new URL(authorizeUrl.searchParams.get("redirect_uri")!);
      back.searchParams.set("code", "e2e-code");
      back.searchParams.set("state", authorizeUrl.searchParams.get("state")!);
      await route.fulfill({ status: 302, headers: { location: back.toString() } });
    });
    // and should anything still head for Microsoft, fail here instead of loading the real sign-in page
    await ctx.route("https://login.microsoftonline.com/**", (route) => route.abort("blockedbyclient"));
    // a cold dev server would compile the hand-off route during the timed step below: warm it first
    await ctx.request.get("/connect/microsoft");
    const page = await ctx.newPage();
    await page.goto("/start/connect");
    // the URL is checked when it commits, not after the click: by then the hand-off may already be on its way out
    const handoff = page.waitForURL(/\/connect\/microsoft$/, { waitUntil: "commit", timeout: 30_000 });
    await page.getByRole("link", { name: "חיבור Microsoft 365 / Outlook" }).click();
    await handoff;
    // what the hand-off screen shows, held there by the gate above
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("עלזה רוצה להתחבר ל-Outlook שלך");
    await expect(page.getByText("מעבירים אותך ל-Microsoft…")).toBeVisible();
    release();

    await expect(page).toHaveURL(/\/start\/ready\?connected=microsoft(&|$)/, { timeout: 30_000 });
    expect(authorizeUrl!.searchParams.get("code_challenge_method")).toBe("S256");
    await expect(page.getByRole("status").filter({ hasText: "Outlook מחובר" })).toBeVisible();
    await expect(page.getByRole("link", { name: "חיבור לוואטסאפ" })).toHaveAttribute("href", /^https:\/\/wa\.me\//);
    await ctx.close();
  });

  test("Google path: connect → hand-off screen → Google (fixture) → back on /start/ready with Gmail connected", async ({ browser }) => {
    const ctx = await newContext(browser);
    await apiSignup(ctx);
    // Chromium treats accounts.google.com specially (request interception does not reach it), so stand in one hop
    // earlier: let our start route answer, read the authorize URL it redirects to, and approve at once.
    await ctx.route("**/api/auth/google/start**", async (route) => {
      expect(new URL(route.request().url()).searchParams.get("returnTo")).toBe("onboarding");
      const res = await route.fetch({ maxRedirects: 0 });
      const authorize = new URL(res.headers()["location"]!);
      expect(authorize.hostname).toBe("accounts.google.com");
      const back = new URL(authorize.searchParams.get("redirect_uri")!);
      back.searchParams.set("code", "e2e-code");
      back.searchParams.set("state", authorize.searchParams.get("state")!);
      back.searchParams.set("scope", authorize.searchParams.get("scope") ?? "");
      await route.fulfill({ status: 302, headers: { location: back.toString() } });
    });
    const page = await ctx.newPage();
    await page.goto("/start/connect");
    await page.getByRole("link", { name: "חיבור Gmail" }).click();
    await expect(page).toHaveURL(/\/start\/ready\?connected=google(&|$)/, { timeout: 30_000 });
    await expect(page.getByRole("status").filter({ hasText: "Gmail מחובר" })).toBeVisible();
    await ctx.close();
  });

  test("login with email → code → /account", async ({ browser }) => {
    test.setTimeout(180_000);
    const setup = await newContext(browser);
    const email = await apiSignup(setup);
    await setup.close();
    // one code per address per minute (OTP_POLICY.resendCooldownMs): wait it out instead of loosening the policy
    await new Promise((r) => setTimeout(r, 61_000));

    const ctx = await newContext(browser);
    const page = await ctx.newPage();
    await page.goto("/login");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("טוב לראות אותך שוב");
    await expect(page.getByRole("link", { name: "הצטרפת דרך וואטסאפ? כניסה כאן" })).toHaveAttribute("href", "/login/whatsapp");
    await page.getByRole("link", { name: "המשך עם מייל" }).click();
    await expect(page).toHaveURL(/\/login\/email$/);
    await submitEmail(page, email);
    await expect(page).toHaveURL(/\/login\/code\?/);
    await enterCode(page, await readCode(ctx.request, email));
    await expect(page).toHaveURL(/\/account$/);
    await expect(page.getByRole("heading", { name: "האזור האישי" })).toBeVisible();
    await expect(page.getByRole("main").getByText(email)).toBeVisible();
    await ctx.close();
  });

  test("WhatsApp login: \"כניסה\" in the chat → one-time /login/w/<token> → /account (and the link works once)", async ({ browser }) => {
    const owner = await newContext(browser);
    const email = await apiSignup(owner);
    const { message } = await readyLink(owner);
    const phone = uniquePhone();
    await sendWhatsapp(owner.request, phone, message);
    await waitForWaText(owner.request, phone, /החשבון מקושר/);
    await sendWhatsapp(owner.request, phone, "כניסה");
    const reply = await waitForWaText(owner.request, phone, /קישור כניסה לאזור האישי/);
    const loginUrl = /(https?:\/\/\S+\/login\/w\/\S+)/.exec(reply)![1]!;
    await owner.close();

    // the /login/whatsapp page explains the keyword and opens WhatsApp with it
    const ctx = await newContext(browser);
    const page = await ctx.newPage();
    await page.goto("/login/whatsapp");
    await expect(page.getByRole("link", { name: "פתיחת וואטסאפ" })).toHaveAttribute("href", /^https:\/\/wa\.me\/\d+\?text=%D7%9B%D7%A0%D7%99%D7%A1%D7%94$/);

    // opening the link (GET) does not burn it — WhatsApp previews would — the button does
    await page.goto(loginUrl);
    await page.goto(loginUrl);
    await page.getByRole("button", { name: "כניסה" }).click();
    await expect(page).toHaveURL(/\/account$/);
    await expect(page.getByRole("main").getByText(email)).toBeVisible();

    const other = await newContext(browser);
    const again = await other.newPage();
    await again.goto(loginUrl);
    await again.getByRole("button", { name: "כניסה" }).click();
    await expect(again.getByRole("heading", { level: 1 })).toHaveText("הקישור לא בתוקף");
    await other.close();
    await ctx.close();
  });

  test("legal drafts: /terms /privacy /accessibility are noindex with a draft banner", async ({ page }) => {
    for (const [path, title] of [
      ["/terms", "תנאי שימוש - עלזה"],
      ["/privacy", "מדיניות פרטיות - עלזה"],
      ["/accessibility", "הצהרת נגישות - עלזה"],
    ] as const) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(title);
      await expect(page.getByRole("note")).toContainText("טיוטה");
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
    }
  });
});
