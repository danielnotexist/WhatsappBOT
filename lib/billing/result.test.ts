import { describe, expect, it } from "vitest";
import { PAY_RESULTS, isPayResult, payResultOf, payResultUrl } from "./result";

describe("payment results (where HYP's redirect lands)", () => {
  it("maps completePayment outcomes to a fixed result code", () => {
    expect(payResultOf({ ok: true, userId: "u", plan: "basic", transId: "1", firstTime: true, mode: "payment" })).toBe("paid");
    expect(payResultOf({ ok: true, userId: "u", plan: "pro", transId: "1", firstTime: false, mode: "card" })).toBe("card");
    expect(payResultOf({ ok: false, reason: "declined", message: "x" })).toBe("declined");
    expect(payResultOf({ ok: false, reason: "declined", message: "x", mode: "card" })).toBe("card_declined");
    expect(payResultOf({ ok: false, reason: "invalid_signature", message: "x" })).toBe("failed");
    expect(payResultOf({ ok: false, reason: "charged_not_checked", message: "x", mode: "card" })).toBe("card_failed");
  });

  it("signed in: the personal area with the message; otherwise /pay/done with the code only", () => {
    const acc = payResultUrl("https://alze.example", { signedIn: true, result: "paid", message: "התשלום התקבל" });
    expect(acc.pathname).toBe("/account");
    expect(acc.searchParams.get("tab")).toBe("plan"); // the personal area opens on "מנוי", where the message is shown
    expect(acc.searchParams.get("notice")).toBe("התשלום התקבל");
    expect(payResultUrl("https://alze.example", { signedIn: true, result: "declined", message: "לא עבר" }).searchParams.get("error")).toBe("לא עבר");
    const done = payResultUrl("https://alze.example", { signedIn: false, result: "card_link", message: "ignored <script>" });
    expect(done.toString()).toBe("https://alze.example/pay/done?r=card_link");
  });

  it("knows only its own codes, and every text is neutral Hebrew with short hyphens", () => {
    expect(isPayResult("paid")).toBe(true);
    expect(isPayResult("toString")).toBe(false);
    expect(isPayResult(["paid"])).toBe(false);
    for (const r of Object.values(PAY_RESULTS)) {
      expect(`${r.tag} ${r.title} ${r.text}`).not.toMatch(/[–—]|\/י|\/ה\b/);
    }
  });
});
