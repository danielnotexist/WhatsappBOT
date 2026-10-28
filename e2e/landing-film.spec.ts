import { expect, test, type Page } from "@playwright/test";
import { newContext } from "./helpers";

/**
 * Round 4 (Daniel, 24.10.2026): the brand film stands in "יום עבודה אחד, בוואטסאפ." instead of the pinned scenes (a test),
 * and the pro price card is honey. The film plays muted in view (the VP9 copy in Playwright's Chromium), pauses when
 * it leaves, has one sound button, and is only the poster under reduced motion.
 */
const overflow = (page: Page) => page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - window.innerWidth);

test.describe("the brand film on the landing", () => {
  test("1440: in view it plays muted and loops; the sound button toggles; off-screen it pauses", async ({ browser }) => {
    const ctx = await newContext(browser, { width: 1440, height: 900 });
    const page = await ctx.newPage();
    await page.goto("/");
    const section = page.getByRole("region", { name: "יום עבודה אחד, בוואטסאפ." });
    await section.evaluate((el) => el.scrollIntoView({ block: "start" }));
    // the heading alone over the film (Daniel, 28.10.2026: no explanation line)
    await expect(section.getByRole("heading", { level: 2, name: "יום עבודה אחד, בוואטסאפ." })).toBeVisible();
    await expect(section.getByText("בלי אפליקציה חדשה ובלי ללמוד מערכת.", { exact: false })).toHaveCount(0);
    const video = section.locator("video");
    await expect(video).toHaveCount(1);
    await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.currentTime), { message: "the film plays" }).toBeGreaterThan(0.3);
    expect(await video.evaluate((v: HTMLVideoElement) => ({ muted: v.muted, loop: v.loop, preload: v.preload }))).toEqual({ muted: true, loop: true, preload: "metadata" });
    // the frame: a 16:9 card inside the container
    const box = (await section.locator("[data-state]").boundingBox())!;
    expect(Math.abs(box.width / box.height - 16 / 9)).toBeLessThan(0.01);

    await section.getByRole("button", { name: "הפעלת צליל" }).click();
    expect(await video.evaluate((v: HTMLVideoElement) => v.muted)).toBe(false);
    await section.getByRole("button", { name: "השתקה" }).click();
    expect(await video.evaluate((v: HTMLVideoElement) => v.muted)).toBe(true);

    await page.locator("#pricing").evaluate((el) => el.scrollIntoView({ block: "start" }));
    await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.paused), { message: "paused off-screen" }).toBe(true);
    await ctx.close();
  });

  test("reduced motion: the poster only, no video and no sound button; 390 has no horizontal overflow", async ({ browser }) => {
    const ctx = await newContext(browser, { width: 390, height: 844, reducedMotion: "reduce" });
    const page = await ctx.newPage();
    await page.goto("/");
    const section = page.getByRole("region", { name: "יום עבודה אחד, בוואטסאפ." });
    await section.evaluate((el) => el.scrollIntoView({ block: "start" }));
    await expect(section.locator("[data-state='poster'] img")).toBeVisible();
    await expect(section.locator("video")).toHaveCount(0);
    await expect(section.getByRole("button")).toHaveCount(0);
    expect(await overflow(page)).toBeLessThanOrEqual(0);
    await ctx.close();
  });
});

test("the pro card is honey with ink type, basic stays on the cream paper; every line opens with its lead (the check)", async ({ browser }) => {
  const ctx = await newContext(browser, { width: 1440, height: 900, reducedMotion: "reduce" });
  const page = await ctx.newPage();
  await page.goto("/#pricing");
  const pro = page.getByRole("article", { name: "פרו" });
  const basic = page.getByRole("article", { name: "בסיסי" });
  const colours = (el: typeof pro) => el.evaluate((n) => ({ bg: getComputedStyle(n).backgroundColor, fg: getComputedStyle(n).color }));
  expect(await colours(pro)).toEqual({ bg: "rgb(231, 182, 92)", fg: "rgb(19, 36, 28)" });
  expect((await colours(basic)).bg).toBe("rgb(242, 234, 218)");
  for (const card of [pro, basic]) {
    const rows = card.locator("[data-plan-features] > li");
    const n = await rows.count();
    expect(n).toBeGreaterThan(0);
    await expect(card.locator("[data-feature-lead]")).toHaveCount(n);
  }
  await ctx.close();
});
