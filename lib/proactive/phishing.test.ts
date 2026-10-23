import { describe, expect, it } from "vitest";
import { createGoogleFixture } from "@/lib/google/__fixtures__/google-fixtures";
import { GoogleClient } from "@/lib/google/client";
import { GmailReader } from "@/lib/google/gmail";
import { FIXTURE_MESSAGES, createGraphFixture, fixtureGraphMessage } from "@/lib/ms/__fixtures__/graph-fixtures";
import { GraphClient } from "@/lib/ms/graph";
import { fromGmailMessage, fromGraphMessage, type ProactiveMail } from "./mail";
import { checkPhishing, editDistance, linksIn, looksLike, registrableDomain, type Contact } from "./phishing";

/** The people Dana writes to (her Sent Items in Microsoft 365). */
const KNOWN: Contact[] = [
  { name: "עו״ד שפירא", address: "office@shapira-law.co.il" },
  { name: "מאי כהן", address: "mai@client.co.il" },
  { name: "רו״ח ברק", address: "barak@cpa-barak.co.il" },
];
const ctx = { known: KNOWN, selfAddresses: ["dana@levi-law.co.il"] };
/** The Gmail fixture's world: her sent mail there (gm3 → may@cohen-acc.co.il). */
const gctx = { known: [{ name: "מאי כהן", address: "may@cohen-acc.co.il" }], selfAddresses: ["dana.levi@gmail.com"] };

const mail = (p: Partial<ProactiveMail> & { from: { name: string; address: string } }): ProactiveMail => ({
  provider: "microsoft",
  id: "x",
  conversationId: "c",
  subject: "",
  replyTo: [],
  receivedDateTime: "2026-10-20T08:00:00Z",
  isRead: false,
  text: "",
  importance: null,
  bulkHeaders: false,
  ...p,
});

async function graphMail(id: string, extra: Parameters<typeof fixtureGraphMessage>[0] | null = null) {
  const fx = createGraphFixture();
  if (extra) fx.state.messages.push(fixtureGraphMessage(extra));
  const graph = new GraphClient({ getAccessToken: async () => "t", fetchImpl: fx.fetchImpl });
  return fromGraphMessage(await graph.getMessage(id));
}

async function gmailMail(id: string) {
  const fx = createGoogleFixture();
  const reader = new GmailReader(new GoogleClient({ getAccessToken: async () => "ya29", fetchImpl: fx.fetchImpl }));
  return fromGmailMessage(await reader.getMessage(id));
}

describe("phishing / BEC — the building blocks", () => {
  it("registrable domains, edit distance, lookalikes", () => {
    expect(registrableDomain("mail.shapira-law.co.il")).toBe("shapira-law.co.il");
    expect(registrableDomain("accounts.google.com")).toBe("google.com");
    expect(registrableDomain("btl.gov.il")).toBe("btl.gov.il");
    expect(editDistance("shapira", "shpaira")).toBe(1);
    expect(looksLike("shapira-1aw.co.il", "shapira-law.co.il")).toBe(true); // 1 for l
    expect(looksLike("shapira-law.com", "shapira-law.co.il")).toBe(true); // another TLD
    expect(looksLike("shapiro-law.co.il", "shapira-law.co.il")).toBe(true); // one letter
    expect(looksLike("rnicrosoft.com", "microsoft.com", { brand: true })).toBe(true);
    expect(looksLike("xn--shapira-lw-2xb.co.il", "shapira-law.co.il")).toBe(true); // punycode
    expect(looksLike("shapira-law.co.il", "shapira-law.co.il")).toBe(false);
    expect(looksLike("cohen-acc.co.il", "client.co.il")).toBe(false);
    expect(looksLike("olive.com", "live.com", { brand: true })).toBe(false); // short brand names are words
    expect(looksLike("google.co.il", "google.com", { brand: true })).toBe(false); // brands own many TLDs
  });

  it("links: IP hosts, shorteners, punycode and '@' in the authority are risky", () => {
    expect(linksIn("כניסה: http://192.168.4.4/login").map((l) => l.risky)).toEqual([true]);
    expect(linksIn("https://bit.ly/abc https://example.co.il/x").map((l) => [l.host, l.risky])).toEqual([
      ["bit.ly", true],
      ["example.co.il", false],
    ]);
    expect(linksIn("https://login.microsoft.com@evil.example/x")[0]).toEqual({ host: "evil.example", risky: true });
  });
});

describe("phishing / BEC — true positives", () => {
  it("the Gmail fixture gm5: a new supplier asking to pay into a new bank account (BEC)", async () => {
    const check = checkPhishing(await gmailMail("gm5"), gctx);
    expect(check.level).toBe("suspicious");
    expect(check.signals).toContain("bank_change");
  });

  it("a lookalike of a known contact's domain, with Reply-To elsewhere and an urgent payment", async () => {
    const m = await graphMail("AAMkPH1", {
      id: "AAMkPH1",
      from: { name: "עו״ד שפירא", address: "office@shapira-1aw.co.il" },
      replyTo: [{ emailAddress: { name: "", address: "payments@fastmail.example" } }],
      subject: "דחוף: העברת התשלום היום",
      receivedDateTime: "2026-10-20T07:00:00Z",
      bodyPreview: "שלום דנה, יש להעביר את התשלום היום לחשבון המצורף.",
    });
    const check = checkPhishing(m, ctx);
    expect(check.level).toBe("suspicious");
    expect(check.signals).toEqual(expect.arrayContaining(["lookalike_domain", "reply_to_mismatch", "payment_urgency", "display_name_spoof"]));
    expect(check.imitates).toBe("shapira-law.co.il");
  });

  it("display-name spoofing of a known contact from a free-mail address: borderline alone, suspicious with a payment request", () => {
    const alone = checkPhishing(mail({ from: { name: "מאי כהן", address: "mai.cohen.office@gmail.com" }, subject: "שאלה קטנה", text: "יש לך דקה?" }), ctx);
    expect(alone).toMatchObject({ level: "borderline", signals: ["display_name_spoof"], imitates: "mai@client.co.il" });
    const pay = checkPhishing(mail({ from: { name: "מאי כהן", address: "mai.cohen.office@gmail.com" }, subject: "דחוף", text: "צריך להעביר תשלום לספק עוד היום, אפשר?" }), ctx);
    expect(pay.level).toBe("suspicious");
    expect(pay.signals).toEqual(["display_name_spoof", "payment_urgency"]);
  });

  it("a display name that carries another address", () => {
    expect(checkPhishing(mail({ from: { name: "barak@cpa-barak.co.il", address: "x@mailer.example" }, subject: "חשבונית" }), ctx).signals).toContain("display_name_spoof");
  });

  it("credential harvesting: 'אימות חשבון' with a shortened link, and a brand lookalike sender", () => {
    const check = checkPhishing(mail({ from: { name: "Microsoft 365", address: "no-reply@micros0ft-support.com" }, subject: "התיבה שלך תיחסם", text: "יש לאמת את החשבון כאן: https://bit.ly/3xYz" }), ctx);
    expect(check.level).toBe("suspicious");
    expect(check.signals).toEqual(expect.arrayContaining(["credential_link", "display_name_spoof"]));
  });

  it("a bank-details change in English", () => {
    expect(checkPhishing(mail({ from: { name: "Accounts", address: "ar@supplier.example" }, subject: "Updated bank details", text: "Please note our new bank account details (IBAN attached) for all future payments." }), ctx).level).toBe("suspicious");
  });
});

describe("phishing / BEC — no false alarms", () => {
  it("the ordinary fixtures: Graph AAMkGm1 / AAMkGm2, Gmail gm1, gm2, gm7, gm8", async () => {
    for (const m of FIXTURE_MESSAGES) expect(checkPhishing(await graphMail(m.id), ctx).level, m.id).toBe("none");
    for (const id of ["gm1", "gm2", "gm7", "gm8"]) expect(checkPhishing(await gmailMail(id), gctx).level, id).toBe("none");
  });

  it("Google's own security alert (gm4, accounts.google.com) is not imitating Google", async () => {
    const m = await gmailMail("gm4");
    const check = checkPhishing(m, ctx);
    expect(check.signals).not.toContain("lookalike_domain");
    expect(check.signals).not.toContain("display_name_spoof");
  });

  it("a newsletter's Reply-To on another domain is not a mismatch (bulk headers)", async () => {
    const m = await gmailMail("gm6");
    expect(checkPhishing({ ...m, replyTo: [{ name: "", address: "replies@esp.example" }] }, ctx).signals).not.toContain("reply_to_mismatch");
  });

  it("a known contact's own address, a subdomain of a known domain, and an unrelated firm", () => {
    expect(checkPhishing(mail({ from: { name: "עו״ד שפירא", address: "office@shapira-law.co.il" }, subject: "טיוטת הסכם", text: "מצורפת טיוטה." }), ctx).level).toBe("none");
    expect(checkPhishing(mail({ from: { name: "מערכת", address: "noreply@portal.shapira-law.co.il" }, subject: "מסמך חדש" }), ctx).level).toBe("none");
    expect(checkPhishing(mail({ from: { name: "רונית בר", address: "ronit@bar-consult.co.il" }, subject: "פרוטוקול" }), ctx).level).toBe("none");
  });

  it("'ביטוח לאומי' from btl.gov.il is not 'בנק לאומי'", () => {
    expect(checkPhishing(mail({ from: { name: "ביטוח לאומי", address: "info@btl.gov.il" }, subject: "אישור" }), ctx).signals).not.toContain("display_name_spoof");
  });

  it("a reply-to on the same domain, or to a known contact, is fine", () => {
    expect(checkPhishing(mail({ from: { name: "מאי כהן", address: "mai@client.co.il" }, replyTo: [{ name: "", address: "office@client.co.il" }] }), ctx).signals).toEqual([]);
    expect(checkPhishing(mail({ from: { name: "מזכירות", address: "office@client.co.il" }, replyTo: [{ name: "", address: "barak@cpa-barak.co.il" }] }), ctx).signals).toEqual([]);
  });

  it("only a weak signal → borderline (the cheap model may decide in the morning summary)", () => {
    expect(checkPhishing(mail({ from: { name: "ספק", address: "billing@vendor.example" }, subject: "תזכורת", text: "נשמח אם תוכלו להעביר את התשלום בהקדם" }), ctx).level).toBe("borderline");
    expect(checkPhishing(mail({ from: { name: "Zoom", address: "no-reply@zoom.us" }, subject: "Sign in", text: "Sign in to join: https://us02web.zoom.example/j/1" }), ctx).level).toBe("borderline");
  });
});
