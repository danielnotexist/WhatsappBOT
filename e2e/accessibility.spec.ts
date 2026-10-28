import { expect, test } from "@playwright/test";

/** The accessibility menu (components/brand/accessibility-widget.tsx) in a real browser. */
test.describe("accessibility menu", () => {
  test("sits bottom-left, opens by keyboard, applies settings that survive a reload, and resets", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/login");

    const button = page.getByRole("button", { name: "תפריט נגישות" });
    await expect(button).toBeVisible();
    const box = (await button.boundingBox())!;
    expect(box.x).toBeLessThan(80); // the left side of the screen (inline end in RTL)
    expect(box.y + box.height).toBeGreaterThan(800 - 80); // at the bottom
    expect(box.width).toBeLessThanOrEqual(44);

    await button.focus();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog", { name: "נגישות" });
    await expect(dialog).toBeVisible();
    await page.getByRole("switch", { name: "ניגודיות גבוהה" }).click();
    await page.getByRole("button", { name: "הגדלת טקסט" }).click();
    const html = page.locator("html");
    await expect(html).toHaveAttribute("data-a11y-contrast", "");
    await expect(html).toHaveAttribute("data-a11y-text", "1");
    expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe("rgb(0, 0, 0)");
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).fontSize)).toBe("18px");

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(button).toBeFocused();

    // the inline script restores them before React runs: present in the very first DOM
    await page.reload();
    await expect(html).toHaveAttribute("data-a11y-contrast", "");
    await expect(html).toHaveAttribute("data-a11y-text", "1");

    await button.click();
    await page.getByRole("button", { name: "איפוס הגדרות" }).click();
    await expect(html).not.toHaveAttribute("data-a11y-contrast");
    await expect(html).not.toHaveAttribute("data-a11y-text");
    expect(errors.filter((e) => /hydrat/i.test(e))).toEqual([]);
  });

  test("on /start (phones) it is lifted above the pinned call to action", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/start");
    const fab = (await page.getByRole("button", { name: "תפריט נגישות" }).boundingBox())!;
    const cta = (await page.getByRole("link", { name: "המשך עם Microsoft" }).boundingBox())!;
    expect(fab.y + fab.height).toBeLessThanOrEqual(cta.y);
  });

  test("the statement page is linked from the menu", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("button", { name: "תפריט נגישות" }).click();
    await page.getByRole("link", { name: "הצהרת נגישות" }).click();
    await expect(page).toHaveURL(/\/accessibility$/);
    await expect(page.getByRole("heading", { level: 2, name: /תפריט הנגישות באתר/ })).toBeVisible();
  });
});
