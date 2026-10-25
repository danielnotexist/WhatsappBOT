// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PLANS, planFeatures } from "@/lib/billing/plans";
import { CardUpdateFace, PLAN_GATE_NOTICES, UPGRADE_NOTICES, UpgradeDoneFace, UpgradeFailedFace, UpgradeOfferFace, UpgradeUnknownFace, proAdds, type OfferFaceData } from "./upgrade-faces";

afterEach(cleanup);

const OFFER: OfferFaceData = { amountIls: 135.48, vatIls: 20.67, daysLeft: 21, periodEndDay: "10.11.2026", nextAmountIls: 299, last4: "4580", offerToken: "signed.offer" };
const noop = async () => undefined;
const text = () => document.body.textContent ?? "";

/** Site text: the short hyphen only. */
function expectShortHyphens() {
  expect(text()).not.toMatch(/[–—]/);
}

describe("the upgrade face", () => {
  it("the pro paper: the prorated amount with VAT, the days and the cycle end, 299 from the next charge, the card, one button and the card link", () => {
    render(<UpgradeOfferFace name="דנה" token="pay-token" offer={OFFER} cardHref="/pay/pay-token?view=card" action={noop} />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("שדרוג לפרו");
    expect(screen.getByText("דנה, עוברים לפרו.")).toBeInTheDocument();
    expect(screen.getByText("135.48")).toBeInTheDocument();
    expect(screen.getByText("כולל מע״מ 20.67 ₪")).toBeInTheDocument();
    expect(text()).toContain("ההפרש בין המסלולים ל-21 ימים, עד 10.11.2026.");
    expect(text()).toContain("299 ₪ לחודש, מ-10.11.2026");
    expect(text()).toContain("מסתיים ב-4580");
    for (const line of proAdds()) expect(screen.getByText(line.text)).toBeInTheDocument();
    // what is coming carries "בקרוב" on its row
    for (const line of proAdds().filter((l) => l.soon)) expect(screen.getByText(line.text).closest("li")).toHaveTextContent("בקרוב");
    expect(screen.getByText("חיבור של Google ו-Microsoft יחד").closest("li")).not.toHaveTextContent("בקרוב");
    const button = screen.getByRole("button", { name: "לשדרג עכשיו" });
    expect(button).toHaveAttribute("type", "submit");
    const form = button.closest("form")!;
    expect(form.querySelector('input[name="token"]')).toHaveValue("pay-token");
    expect(form.querySelector('input[name="offer"]')).toHaveValue("signed.offer");
    expect(screen.getByRole("link", { name: "עדכון כרטיס" })).toHaveAttribute("href", "/pay/pay-token?view=card");
    expect(screen.queryByRole("alert")).toBeNull();
    expectShortHyphens();
  });

  it("what pro adds comes from the plan table only (the messages, then pro's lines of the price list)", () => {
    expect(proAdds().map((l) => l.text)).toEqual([
      `עד ${PLANS.pro.messages.toLocaleString("he-IL")} הודעות בחודש, במקום ${PLANS.basic.messages}`,
      "חיבור של Google ו-Microsoft יחד",
      "משימות ב-Google Tasks וב-Microsoft To Do",
      "חיפוש וקריאה בכל ה-Drive: Docs, Sheets ו-Slides",
      "חיפוש ב-SharePoint, בספריות המסמכים של הארגון",
      "שמירת מסמכים חדשים ב-Drive",
      `שלושת הסוכנים המובנים, ועד ${PLANS.pro.customAgents} סוכנים משלך`,
      "סיכומי פגישות Teams ו-Google Meet",
      "התראות יזומות ואזהרות פישינג",
      "חיבור למערכות העסק, כמו monday.com",
    ]);
    expect(proAdds().slice(1)).toEqual(planFeatures("pro").lines);
    expect(proAdds().filter((l) => l.soon).map((l) => l.id)).toEqual(["business"]);
  });

  it("a connect the plan refused (?why=): its fixed notice above the offer", () => {
    render(<UpgradeOfferFace name="" token="t" offer={OFFER} cardHref="/c" action={noop} gate="second_account" />);
    expect(screen.getByRole("status")).toHaveTextContent(PLAN_GATE_NOTICES.second_account);
    expect(PLAN_GATE_NOTICES.second_account).toContain("עובדים עם חשבון אחד: Google או Microsoft");
    expectShortHyphens();
  });

  it("singular days and the notices of the action (fixed text)", () => {
    const { unmount } = render(<UpgradeOfferFace name="" token="t" offer={{ ...OFFER, daysLeft: 1, amountIls: 6.45 }} cardHref="/c" action={noop} notice="expired" />);
    expect(text()).toContain("ההפרש בין המסלולים ליום אחד");
    expect(screen.getByRole("status")).toHaveTextContent(UPGRADE_NOTICES.expired);
    expect(screen.getByText("עוברים לפרו.")).toBeInTheDocument();
    unmount();
    render(<UpgradeOfferFace name="" token="t" offer={OFFER} cardHref="/c" action={noop} notice="busy" />);
    expect(screen.getByRole("alert")).toHaveTextContent(UPGRADE_NOTICES.busy);
  });
});

describe("the result faces", () => {
  it("upgraded: the amount charged, the receipt by mail, the next charge and its amount", () => {
    render(<UpgradeDoneFace email="dana@example.com" amountIls={135.48} vatIls={20.67} nextAmountIls={299} nextDay="10.11.2026" waHref={null} />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("המסלול שודרג לפרו");
    expect(screen.getByRole("status")).toHaveTextContent("מסלול פרו פעיל");
    expect(text()).toContain("135.48 ₪");
    expect(text()).toContain("כולל מע״מ 20.67 ₪");
    expect(text()).toContain("299 ₪ לחודש, ב-10.11.2026");
    expect(text()).toContain("הקבלה נשלחה למייל");
    expect(screen.getByText("dana@example.com")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "לאזור האישי" })).toHaveAttribute("href", "/account?tab=plan");
    expect(screen.queryByRole("button")).toBeNull();
    expectShortHyphens();
  });

  it("declined: why, nothing changed, a retry with a fresh offer and the card link", () => {
    render(<UpgradeFailedFace token="t" failure="declined" ccode="4" last4="4580" retry={{ ...OFFER, offerToken: "fresh" }} action={noop} cardHref="/pay/t?view=card" cardUpdateHref="https://app/pay/card/x" />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("השדרוג לא הושלם");
    expect(screen.getByText("לא בוצע חיוב.")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("חברת האשראי לא אישרה את החיוב (קוד 4). אפשר לנסות שוב, או לעדכן כרטיס.");
    expect(text()).toContain("המסלול נשאר בסיסי");
    const retry = screen.getByRole("button", { name: "לנסות שוב, 135.48 ₪" });
    expect(retry.closest("form")!.querySelector('input[name="offer"]')).toHaveValue("fresh");
    expect(screen.getByRole("link", { name: "עדכון כרטיס" })).toHaveAttribute("href", "/pay/t?view=card");
    expectShortHyphens();
  });

  it("a card failure leads to the card update, never to another try", () => {
    render(<UpgradeFailedFace token="t" failure="card" ccode="6" last4="4580" retry={OFFER} action={noop} cardHref="/c" cardUpdateHref="https://app/pay/card/x" />);
    expect(screen.getByRole("alert")).toHaveTextContent("הכרטיס השמור לא אושר לחיוב (קוד 6)");
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByRole("link", { name: "לעדכון הכרטיס" })).toHaveAttribute("href", "https://app/pay/card/x");
  });

  it("the state changed: the updated price and a retry; without an offer, the way to the plan details", () => {
    const { unmount } = render(<UpgradeFailedFace token="t" failure="changed" ccode={null} last4={null} retry={{ ...OFFER, amountIls: 128.95, daysLeft: 20 }} action={noop} cardHref="/c" cardUpdateHref="/x" />);
    expect(text()).toContain("המחיר המעודכן: 128.95 ₪, ל-20 ימים עד 10.11.2026.");
    expect(screen.getByRole("button", { name: "לנסות שוב, 128.95 ₪" })).toBeInTheDocument();
    unmount();
    render(<UpgradeFailedFace token="t" failure="config" ccode={null} last4={null} retry={null} action={noop} cardHref="/c" cardUpdateHref="/x" />);
    expect(screen.getByRole("alert")).toHaveTextContent("תקלה זמנית במערכת התשלומים");
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByRole("link", { name: "לפרטי המנוי" })).toHaveAttribute("href", "/c");
  });

  it("no clear answer: no way to try again", () => {
    render(<UpgradeUnknownFace />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("החיוב בבדיקה");
    expect(screen.getByRole("status")).toHaveTextContent("כדי לא לחייב פעמיים");
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByRole("form")).toBeNull();
  });
});

describe("the card update face", () => {
  it("basic: a way to the upgrade instead of the old footnote", () => {
    render(<CardUpdateFace plan="basic" nextDay="10.11.2026" cardUpdateHref="https://app/pay/card/x" upgradeHref="/pay/t" block={null} />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("עדכון כרטיס");
    expect(screen.getByRole("link", { name: "לעדכון הכרטיס" })).toHaveAttribute("href", "https://app/pay/card/x");
    expect(screen.getByRole("link", { name: "לשדרוג לפרו" })).toHaveAttribute("href", "/pay/t");
    expect(text()).not.toContain("מעבר בין מסלולים");
    expect(text()).not.toContain("״שדרוג״");
    expectShortHyphens();
  });

  it("basic without a one-tap upgrade: why, and no upgrade link", () => {
    const { unmount } = render(<CardUpdateFace plan="basic" nextDay="10.11.2026" cardUpdateHref="/x" upgradeHref={null} block={{ reason: "card_expired", last4: "4580" }} />);
    expect(screen.getByRole("status")).toHaveTextContent("תוקף הכרטיס השמור (מסתיים ב-4580) עבר. אחרי עדכון הכרטיס אפשר לשדרג מכאן.");
    expect(screen.queryByRole("link", { name: "לשדרוג לפרו" })).toBeNull();
    unmount();
    render(<CardUpdateFace plan="basic" nextDay={null} cardUpdateHref="/x" upgradeHref={null} block={{ reason: "settle" }} />);
    expect(screen.getByRole("status")).toHaveTextContent("לפני שדרוג צריך להסדיר את החיוב החודשי שלא עבר");
  });

  it("basic, a refused connect (?why=pro_feature): the notice stands above the card face", () => {
    render(<CardUpdateFace plan="basic" nextDay="10.11.2026" cardUpdateHref="/x" upgradeHref={null} block={{ reason: "no_card" }} gate="pro_feature" />);
    expect(screen.getAllByRole("status").map((s) => s.textContent)).toContain(PLAN_GATE_NOTICES.pro_feature);
  });

  it("pro: a neutral line about moving to basic in WhatsApp", () => {
    render(<CardUpdateFace plan="pro" nextDay="10.11.2026" cardUpdateHref="/x" upgradeHref={null} block={null} />);
    const main = within(document.body);
    expect(main.getByText(/מעבר למסלול הבסיסי: בשיחה עם .+, לכתוב ״מעבר לבסיסי״\./)).toBeInTheDocument();
    expect(text()).toContain("299 ₪ לחודש, כולל מע״מ");
    expect(screen.queryByRole("link", { name: "לשדרוג לפרו" })).toBeNull();
  });
});
