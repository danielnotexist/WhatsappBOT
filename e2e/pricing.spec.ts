import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { newContext } from "./helpers";

/**
 * Round 2 of Daniel's preview feedback (23.10.2026): the compact price list on the landing (both plans within one
 * 1440×900 screen), the full comparison on /pricing (behind "להשוואה המלאה" since 28.10.2026), and "בקשת מערכת" from
 * the systems list - no horizontal overflow at 390, axe-core with 0 serious/critical findings, and a request that
 * really reaches the route.
 */
const AXE_PATH = join(process.cwd(), "node_modules", "axe-core", "axe.min.js");

async function axeSeriousOrCritical(page: Page): Promise<string[]> {
  await page.addScriptTag({ path: AXE_PATH });
  const result = (await page.evaluate(() =>
    (window as unknown as { axe: { run: (ctx: Document, opts: unknown) => Promise<unknown> } }).axe.run(document, {
      runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"] },
    }),
  )) as { violations: { id: string; impact: string | null; help: string; nodes: { target: string[] }[] }[] };
  return result.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.impact} ${v.id}: ${v.help} ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
}

const overflow = (page: Page) => page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - window.innerWidth);

test.describe("prices and the systems request", () => {
  test("landing at 1440×900: the heading and both plans fit one screen; '+K' opens the rest; 'להשוואה המלאה' opens the comparison on /pricing", async ({ browser }) => {
    const ctx = await newContext(browser, { width: 1440, height: 900, reducedMotion: "reduce" });
    const page = await ctx.newPage();
    await page.goto("/#pricing");
    const section = page.locator("#pricing");
    await section.evaluate((el) => el.scrollIntoView({ block: "start" }));
    const title = await page.getByRole("heading", { name: "שני מסלולים. מתחילים בחינם." }).boundingBox();
    expect(title!.y).toBeGreaterThanOrEqual(0);
    for (const plan of ["בסיסי", "פרו"]) {
      const box = await page.getByRole("article", { name: plan }).boundingBox();
      expect(box!.y + box!.height, plan).toBeLessThanOrEqual(900);
    }
    const pro = page.getByRole("article", { name: "פרו" });
    const bar = pro.getByRole("toolbar", { name: "כולל 16 חיבורים, ועוד 4 בקרוב" });
    await expect(bar.getByRole("button")).toHaveCount(8);
    await pro.getByRole("button", { name: "עוד 12 חיבורים" }).click();
    await expect(bar.getByRole("button")).toHaveCount(20);
    // one short line under the cards: VAT and cancelling
    await expect(section.getByText("המחירים כוללים מע״מ. ביטול בכל רגע.")).toBeVisible();
    await page.getByRole("link", { name: "להשוואה המלאה" }).click();
    await expect(page).toHaveURL(/\/pricing#compare$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("מחירים ומסלולים.");
    // the link opens the disclosure and brings the table into view
    await expect(page.locator("details#compare")).toHaveJSProperty("open", true);
    await expect(page.getByRole("table", { name: "בסיסי מול פרו, יכולת אחרי יכולת" })).toBeInViewport();
    await ctx.close();
  });

  for (const width of [390, 1440]) {
    test(`/pricing at ${width}: the comparison closed until asked for, no horizontal overflow, axe clean`, async ({ browser }) => {
      const ctx = await newContext(browser, { width, height: 900, reducedMotion: "reduce" });
      const page = await ctx.newPage();
      await page.goto("/pricing");
      await expect(page.getByText("המחירים כוללים מע״מ. ביטול בכל רגע.")).toBeVisible();
      await expect(page.getByRole("region", { name: "החיבורים בכל מסלול." })).toHaveCount(0);
      const table = page.getByRole("table", { name: "בסיסי מול פרו, יכולת אחרי יכולת" });
      await expect(table).toBeHidden();
      const disclosure = page.locator("details#compare");
      await disclosure.locator("summary").click();
      await expect(disclosure).toHaveJSProperty("open", true);
      await expect(table).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      expect(await overflow(page)).toBeLessThanOrEqual(0);
      expect(await axeSeriousOrCritical(page)).toEqual([]);
      await ctx.close();
    });
  }

  test("'בקשת מערכת' at 390: a bottom sheet that fits, Esc returns focus, and a request reaches the support route", async ({ browser }) => {
    const ctx = await newContext(browser, { width: 390, height: 844, reducedMotion: "reduce" });
    const page = await ctx.newPage();
    await page.goto("/#connectors");
    const trigger = page.getByRole("button", { name: "בקשת מערכת" });
    await trigger.scrollIntoViewIfNeeded();
    await trigger.click();
    const dialog = page.getByRole("dialog", { name: "בקשת מערכת" });
    await expect(dialog.getByLabel("שם המערכת")).toBeFocused();
    const box = await dialog.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(390);
    expect(await overflow(page)).toBeLessThanOrEqual(0);
    expect(await axeSeriousOrCritical(page)).toEqual([]);
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();

    await trigger.click();
    await dialog.getByLabel("שם המערכת").fill("חשבשבת");
    await dialog.getByLabel(/תעשה איתה/).fill("להוציא דוח הכנסות חודשי");
    await dialog.getByLabel("אימייל").fill("e2e.request@e2e.example.co.il");
    const posted = page.waitForResponse((r) => r.url().endsWith("/api/support/ticket") && r.request().method() === "POST");
    await dialog.getByRole("button", { name: "שליחת הבקשה" }).click();
    const res = await posted;
    expect(res.status()).toBe(200);
    expect(res.request().postDataJSON()).toMatchObject({ kind: "system", system: "חשבשבת" });
    await expect(dialog.getByRole("heading", { name: "הבקשה התקבלה. תודה." })).toBeFocused();
    await ctx.close();
  });
});
