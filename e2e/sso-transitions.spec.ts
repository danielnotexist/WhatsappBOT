import { expect, test, type BrowserContext, type Page, type Route } from "@playwright/test";
import { newContext } from "./helpers";

/**
 * "המשך עם Microsoft / Google" (lib/auth/sso.ts) and the page transition with the still wordmark
 * (components/brand/page-transition.tsx), in DATA_MODE=memory: the providers' token endpoints answer from the
 * fixtures (Google: dana.levi@gmail.com, verified; Microsoft: dana@levi-law.co.il, a work account with xms_edov).
 * The consent screens are stood in for one hop earlier, like e2e/signup.spec.ts: our start route answers (it sets the
 * sealed sign-in cookie in this browser), we read the authorize URL it redirects to and approve at once.
 */

/** Approve the provider's consent at once: back to our callback with a code and the state of this sign-in. */
async function approveConsent(ctx: BrowserContext, provider: "google" | "microsoft"): Promise<void> {
  await ctx.route(`**/api/auth/${provider}/start**`, async (route: Route) => {
    expect(new URL(route.request().url()).searchParams.get("intent")).toBe("signin");
    const res = await route.fetch({ maxRedirects: 0 });
    const authorize = new URL(res.headers()["location"]!);
    expect(authorize.hostname).toBe(provider === "google" ? "accounts.google.com" : "login.microsoftonline.com");
    expect(authorize.searchParams.get("code_challenge_method")).toBe("S256");
    // the sign-in's state and PKCE verifier ride in a sealed cookie of this browser, not in the URL
    expect(res.headersArray().some((h) => h.name.toLowerCase() === "set-cookie" && h.value.startsWith("wb_sso="))).toBe(true);
    const back = new URL(authorize.searchParams.get("redirect_uri")!);
    back.searchParams.set("code", "e2e-code");
    back.searchParams.set("state", authorize.searchParams.get("state")!);
    if (provider === "google") back.searchParams.set("scope", authorize.searchParams.get("scope") ?? "");
    await route.fulfill({ status: 302, headers: { location: back.toString() } });
  });
  // should anything still head for the real sign-in pages, fail here instead
  await ctx.route("https://login.microsoftonline.com/**", (route) => route.abort("blockedbyclient"));
}

/** Deletes the signed-in account (a re-run on a dev server that remembers the fixture account from the last run). */
async function deleteAccount(page: Page): Promise<void> {
  await page.goto("/account?tab=settings");
  await page.getByLabel(/כדי למחוק/).fill("מחיקה");
  await page.getByRole("button", { name: "מחיקת החשבון לצמיתות" }).click();
  await expect(page).toHaveURL(/\/\?deleted=1$/);
}

test.describe("Sign in with Microsoft / Google", () => {
  test("/start: the provider buttons first, email second, one line on what the provider sign-in connects", async ({ browser }) => {
    const ctx = await newContext(browser);
    const page = await ctx.newPage();
    await page.goto("/start");
    const ways = page.getByRole("group", { name: "דרכים להמשיך" });
    await expect(ways.getByRole("link")).toHaveText(["המשך עם Microsoft", "המשך עם Google"]);
    await expect(ways.getByRole("link", { name: "המשך עם Microsoft" })).toHaveAttribute("href", "/api/auth/microsoft/start?intent=signin&from=start&returnTo=onboarding");
    // one line under the buttons (wide screens; on phones it sits in the flow above the pinned buttons)
    await expect(page.getByText("כניסה עם Microsoft או Google מחברת לעלזה גם את המייל, היומן והקבצים, בצעד אחד.").filter({ visible: true })).toHaveCount(1);
    await expect(page.getByRole("link", { name: "המשך עם מייל" })).toHaveAttribute("href", "/start/email");
    // a refused sign-in comes back with a fixed code, shown as its fixed line
    await page.goto("/start?sso_error=denied");
    await expect(page.getByRole("alert").filter({ hasText: "הכניסה בוטלה" })).toBeVisible();
    await ctx.close();
  });

  test("from /start, \"המשך עם Google\" signs up and lands on the WhatsApp step with Gmail connected", async ({ browser }) => {
    const ctx = await newContext(browser);
    await approveConsent(ctx, "google");
    const page = await ctx.newPage();
    const signUp = async () => {
      await page.goto("/start");
      await page.getByRole("link", { name: "המשך עם Google" }).click();
      await page.waitForURL(/\/(start\/ready|account)(\?|$)/, { timeout: 30_000 });
    };
    await signUp();
    if (new URL(page.url()).pathname === "/account") {
      // the dev server kept the fixture account from an earlier run: start over as a new person
      await deleteAccount(page);
      await signUp();
    }
    await expect(page).toHaveURL(/\/start\/ready\?connected=google(&|$)/);
    await expect(page.getByRole("status").filter({ hasText: "Gmail מחובר" })).toBeVisible();
    await expect(page.getByRole("link", { name: "חיבור לוואטסאפ" })).toHaveAttribute("href", /^https:\/\/wa\.me\//);
    // signed in: the personal area opens, with the Google account connected
    await page.goto("/account?tab=connections");
    await expect(page.getByRole("heading", { name: "האזור האישי" })).toBeVisible();
    await expect(page.getByRole("main").getByText("dana.levi@gmail.com").first()).toBeVisible();
    await ctx.close();
  });

  test("from /login, \"המשך עם Microsoft\" signs in to the existing account and lands on /account", async ({ browser }) => {
    // the account exists first (made by a provider sign-up, or by an earlier run)
    const setup = await newContext(browser);
    await approveConsent(setup, "microsoft");
    const first = await setup.newPage();
    await first.goto("/start");
    await first.getByRole("link", { name: "המשך עם Microsoft" }).click();
    await first.waitForURL(/\/(start\/ready|account)(\?|$)/, { timeout: 30_000 });
    await setup.close();

    const ctx = await newContext(browser);
    await approveConsent(ctx, "microsoft");
    const page = await ctx.newPage();
    await page.goto("/login");
    await expect(page.getByRole("group", { name: "דרכים להמשיך" }).getByRole("link")).toHaveText(["המשך עם Microsoft", "המשך עם Google"]);
    await page.getByRole("link", { name: "המשך עם Microsoft" }).click();
    await expect(page).toHaveURL(/\/account$/, { timeout: 30_000 });
    await expect(page.getByRole("heading", { name: "האזור האישי" })).toBeVisible();
    await expect(page.getByRole("main").getByText("dana@levi-law.co.il").first()).toBeVisible();
    await ctx.close();
  });
});

/** Every ::view-transition animation of the next view transition (and its wordmark box before and after). */
async function recordTransitions(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as { __vt: { anims: { pe: string; name: string; duration: number; delay: number }[]; ready: boolean }[] };
    w.__vt = [];
    const orig = Document.prototype.startViewTransition;
    Document.prototype.startViewTransition = function (this: Document, arg: Parameters<Document["startViewTransition"]>[0]) {
      const t = orig.call(this, arg);
      const rec = { anims: [] as { pe: string; name: string; duration: number; delay: number }[], ready: false };
      w.__vt.push(rec);
      void t.ready.then(() => {
        for (const a of document.documentElement.getAnimations({ subtree: true })) {
          const effect = a.effect as KeyframeEffect | null;
          const pe = effect?.pseudoElement ?? "";
          if (!pe.startsWith("::view-transition")) continue;
          const timing = effect!.getComputedTiming();
          rec.anims.push({ pe, name: (a as CSSAnimation).animationName ?? "", duration: Number(timing.duration), delay: Number(timing.delay) });
        }
        rec.ready = true;
      }, () => undefined);
      return t;
    };
  });
}

async function transitions(page: Page) {
  await expect.poll(() => page.evaluate(() => (window as unknown as { __vt: { ready: boolean }[] }).__vt.some((r) => r.ready))).toBe(true);
  return page.evaluate(() => (window as unknown as { __vt: { anims: { pe: string; name: string; duration: number; delay: number }[] }[] }).__vt);
}

const wordmarkBox = (page: Page) => page.locator("[data-wordmark]:visible").boundingBox();

test.describe("the page transition: the wordmark stays, the page moves", () => {
  test("the wordmark carries view-transition-name alze-wordmark on the landing, /start, /login, /account and /pricing — on the same pixel", async ({ browser }) => {
    const ctx = await newContext(browser, { width: 1440, height: 900 });
    await approveConsent(ctx, "google");
    const page = await ctx.newPage();
    const boxes: Record<string, unknown> = {};
    for (const path of ["/", "/start", "/login", "/pricing"]) {
      await page.goto(path);
      const mark = page.locator("[data-wordmark]:visible");
      await expect(mark).toHaveCount(1);
      expect(await mark.evaluate((el) => getComputedStyle(el).viewTransitionName)).toBe("alze-wordmark");
      boxes[path] = await mark.boundingBox();
    }
    // /account: signed in through the provider button
    await page.goto("/login");
    await page.getByRole("link", { name: "המשך עם Google" }).click();
    await page.waitForURL(/\/(account|start\/ready)(\?|$)/, { timeout: 30_000 });
    await page.goto("/account");
    const mark = page.locator("[data-wordmark]:visible");
    await expect(mark).toHaveCount(1);
    expect(await mark.evaluate((el) => getComputedStyle(el).viewTransitionName)).toBe("alze-wordmark");
    boxes["/account"] = await mark.boundingBox();
    for (const [path, box] of Object.entries(boxes)) expect(box, path).toEqual(boxes["/"]);
    await ctx.close();
  });

  test("landing → /start: the old page fades and drifts, the new one fades in and rises, the wordmark does not move", async ({ browser }) => {
    const ctx = await newContext(browser, { width: 1440, height: 900 });
    const page = await ctx.newPage();
    await page.goto("/");
    await recordTransitions(page);
    const before = await wordmarkBox(page);
    await page.getByRole("link", { name: "בואו נתחיל - לוקח דקה" }).first().click();
    await expect(page).toHaveURL(/\/start$/);
    const [vt] = await transitions(page);
    const names = vt!.anims.map((a) => a.name);
    expect(names).toEqual(expect.arrayContaining(["alze-page-fade-out", "alze-page-drift-out", "alze-page-fade-in", "alze-page-rise-in"]));
    // about a third of a second, never more than 380ms
    for (const a of vt!.anims.filter((x) => x.name.startsWith("alze-page-"))) expect(a.duration + a.delay).toBeLessThanOrEqual(380);
    // nothing animates the wordmark's group or its new snapshot
    expect(vt!.anims.filter((a) => a.pe.includes("alze-wordmark"))).toEqual([]);
    expect(await wordmarkBox(page)).toEqual(before);
    await ctx.close();
  });

  for (const how of ["reduce", "a11y"] as const) {
    test(`no transition CSS runs with ${how === "reduce" ? "prefers-reduced-motion" : "the site's \"עצירת אנימציות\""}`, async ({ browser }) => {
      const ctx = await newContext(browser, { width: 1440, height: 900, reducedMotion: how === "reduce" ? "reduce" : "no-preference" });
      // "עצירת אנימציות" as the accessibility menu saves it (lib/a11y/settings.ts), applied before the first paint
      if (how === "a11y") await ctx.addInitScript(() => window.localStorage.setItem("alze:a11y", JSON.stringify({ text: 0, contrast: false, links: false, font: false, motion: true, spacing: false })));
      const page = await ctx.newPage();
      await page.goto("/");
      if (how === "a11y") await expect(page.locator("html")).toHaveAttribute("data-a11y-motion", "");
      await recordTransitions(page);
      await page.getByRole("link", { name: "בואו נתחיל - לוקח דקה" }).first().click();
      await expect(page).toHaveURL(/\/start$/);
      const all = await page.evaluate(() => (window as unknown as { __vt: { anims: { name: string; duration: number }[] }[] }).__vt);
      // the browser may still swap the page through a view transition, but nothing in it moves or fades
      for (const vt of all) expect(vt.anims.filter((a) => a.duration > 0)).toEqual([]);
      await ctx.close();
    });
  }
});
