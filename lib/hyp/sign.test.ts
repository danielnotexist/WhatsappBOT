import { describe, expect, it } from "vitest";
import {
  HYP_PAY_ENDPOINT,
  HypError,
  buildSignQuery,
  buildSignUrl,
  buildVerifyQuery,
  buildVerifyUrl,
  encodeQuery,
  formatHypValue,
  hypResponseCode,
  isHypSuccess,
  parseHypResponse,
  paymentPageUrl,
  redactHypQuery,
  toPairs,
} from "./sign";

// הדוגמאות מתוך developers.hyp.co.il/pay (creating-a-payment-page, transaction-validation)
const creds = { masof: "0010345518", key: "your-api-key", passp: "your-api-password" };

const docsSignRequest =
  "action=APISign&What=SIGN&Sign=True&KEY=your-api-key&PassP=your-api-password&Masof=0010345518&Amount=10&Order=12345678910&tmp=2&PageLang=ENG&UserId=203269535&ClientName=Jenny&ClientLName=Parkington&street=HaDekel%2014&city=Rishon%20LeZion&email=jennyp%40example.co.il&cell=0504999999";

const docsSignResponse =
  "Amount=10&ClientLName=Parkington&ClientName=Jenny&Masof=0010345518&Order=12345678910&PageLang=ENG&Sign=True&UserId=203269535&action=pay&cell=0504999999&city=Rishon%20LeZion&email=jennyp%40example.co.il&street=HaDekel%2014&tmp=2&signature=0806fe45b00f11d4b3f3392d894fbfe8be372bb3822ae83fef87831c7c35426a";

const docsSuccessUrl =
  "https://your-merchant-website.com/success.html?Id=408941655&CCode=0&Amount=10&ACode=0505293&Order=12345678910&Fild1=Jenny%20Parkington&Fild2=jennyp%40example.co.il&Fild3=&Sign=a84b11187377554427f267a9139ad4fd7daf7fb661dd668a9b954cf41cd25904";

const docsVerifyRequest =
  "action=APISign&What=VERIFY&Masof=0010345518&KEY=your-api-key&PassP=your-api-password&Id=408941655&CCode=0&Amount=10&ACode=0505293&Order=12345678910&Fild1=Jenny%20Parkington&Fild2=jennyp%40example.co.il&Fild3=&Sign=a84b11187377554427f267a9139ad4fd7daf7fb661dd668a9b954cf41cd25904";

describe("lib/hyp/sign — SIGN", () => {
  it("builds the exact request from the HYP docs example", () => {
    const query = buildSignQuery(
      {
        Amount: 10,
        Order: "12345678910",
        tmp: 2,
        PageLang: "ENG",
        UserId: "203269535",
        ClientName: "Jenny",
        ClientLName: "Parkington",
        street: "HaDekel 14",
        city: "Rishon LeZion",
        email: "jennyp@example.co.il",
        cell: "0504999999",
      },
      creds,
    );
    expect(query).toBe(docsSignRequest);
    expect(buildSignUrl({ Amount: 10 }, creds)).toBe(
      `${HYP_PAY_ENDPOINT}?action=APISign&What=SIGN&Sign=True&KEY=your-api-key&PassP=your-api-password&Masof=0010345518&Amount=10`,
    );
  });

  it("formats the subscription request from the plan (booleans → True, Hebrew encoded, undefined dropped)", () => {
    const query = buildSignQuery(
      {
        Amount: 99,
        Coin: 1,
        Order: "user_123",
        MoreData: true,
        SendHesh: true,
        Pritim: false,
        email: "daniel@example.co.il",
        PageLang: "HEB",
        UTF8: true,
        UTF8out: true,
        Info: "מנוי בסיסי",
        heshDesc: undefined,
        cell: undefined,
        extra: null,
      },
      creds,
    );
    const parsed = new URLSearchParams(query);
    expect(parsed.get("Coin")).toBe("1");
    expect(parsed.get("MoreData")).toBe("True");
    expect(parsed.get("SendHesh")).toBe("True");
    expect(parsed.get("Pritim")).toBe("False");
    expect(parsed.get("UTF8")).toBe("True");
    expect(parsed.get("Info")).toBe("מנוי בסיסי");
    expect(query).toContain("Info=%D7%9E%D7%A0%D7%95%D7%99%20%D7%91%D7%A1%D7%99%D7%A1%D7%99");
    expect(parsed.has("heshDesc")).toBe(false);
    expect(parsed.has("cell")).toBe(false);
    expect(parsed.has("extra")).toBe(false);
    expect(query.startsWith("action=APISign&What=SIGN&Sign=True&KEY=")).toBe(true);
  });

  it("never duplicates reserved keys even if the caller passes them", () => {
    const query = buildSignQuery(
      { Amount: 1, Sign: false, Masof: "evil", KEY: "evil", What: "VERIFY", action: "x" } as never,
      creds,
    );
    expect(query.match(/(^|&)Sign=/g)).toHaveLength(1);
    expect(query).not.toContain("evil");
    expect(query).toContain("What=SIGN");
  });

  it("requires credentials", () => {
    expect(() => buildSignQuery({ Amount: 1 }, { ...creds, passp: "" })).toThrow(HypError);
  });
});

describe("lib/hyp/sign — payment page", () => {
  it("appends the SIGN response verbatim to the endpoint", () => {
    expect(paymentPageUrl(docsSignResponse)).toBe(`${HYP_PAY_ENDPOINT}?${docsSignResponse}`);
    expect(paymentPageUrl(`\n${docsSignResponse}\n`)).toBe(
      `${HYP_PAY_ENDPOINT}?${docsSignResponse}`,
    );
  });

  it("never leaks credentials into the customer-facing URL", () => {
    const url = paymentPageUrl(docsSignResponse);
    expect(url).not.toContain("KEY=");
    expect(url).not.toContain("PassP=");
  });

  it("throws on an error response instead of a signature", () => {
    expect(() => paymentPageUrl("CCode=902")).toThrow(HypError);
    expect(() => paymentPageUrl("")).toThrow(HypError);
    expect(() => paymentPageUrl("action=pay&Amount=10")).toThrow(/SIGN/);
  });
});

describe("lib/hyp/sign — VERIFY", () => {
  it("rebuilds the exact VERIFY request from the HYP docs (full URL input, order preserved)", () => {
    expect(buildVerifyQuery(docsSuccessUrl, creds)).toBe(docsVerifyRequest);
    expect(buildVerifyUrl(docsSuccessUrl, creds)).toBe(`${HYP_PAY_ENDPOINT}?${docsVerifyRequest}`);
  });

  it("accepts a bare query, URLSearchParams and pairs", () => {
    const query = docsSuccessUrl.slice(docsSuccessUrl.indexOf("?") + 1);
    expect(buildVerifyQuery(query, creds)).toBe(docsVerifyRequest);
    expect(buildVerifyQuery(`?${query}`, creds)).toBe(docsVerifyRequest);
    expect(buildVerifyQuery(new URLSearchParams(query), creds)).toBe(docsVerifyRequest);
    expect(buildVerifyQuery([...new URLSearchParams(query)], creds)).toBe(docsVerifyRequest);
  });

  it("keeps the redirect order even when it is unusual, keeps empty values, and omits our own params", () => {
    const redirect = "u=42&Sign=abc&CCode=0&Id=1&Fild3=&Amount=99";
    expect(buildVerifyQuery(redirect, creds, { omit: ["u"] })).toBe(
      "action=APISign&What=VERIFY&Masof=0010345518&KEY=your-api-key&PassP=your-api-password&Sign=abc&CCode=0&Id=1&Fild3=&Amount=99",
    );
  });

  it("strips a spoofed action/What/KEY from the redirect and requires Sign", () => {
    const spoofed = "action=soft&What=SIGN&KEY=evil&PassP=evil&Masof=evil&Id=1&CCode=0&Sign=abc";
    const query = buildVerifyQuery(spoofed, creds);
    expect(query).toBe(
      "action=APISign&What=VERIFY&Masof=0010345518&KEY=your-api-key&PassP=your-api-password&Id=1&CCode=0&Sign=abc",
    );
    expect(() => buildVerifyQuery("Id=1&CCode=0", creds)).toThrow(/Sign/);
  });
});

describe("lib/hyp/sign — responses & helpers", () => {
  it("parses responses and recognises CCode=0 only as success", () => {
    expect(parseHypResponse("CCode=0")).toEqual({ CCode: "0" });
    expect(isHypSuccess("CCode=0")).toBe(true);
    expect(isHypSuccess("CCode=902")).toBe(false);
    expect(isHypSuccess("")).toBe(false);
    expect(isHypSuccess({ CCode: "0" })).toBe(true);
    expect(hypResponseCode("CCode=901")).toBe(901);
    expect(hypResponseCode("Id=1")).toBeNull();
    expect(hypResponseCode("CCode=abc")).toBeNull();
  });

  it("parses a getToken response", () => {
    const token = parseHypResponse(
      "Id=401594866&CCode=0&Token=0505743578473060772&Tokef=3105&Fild1=&Fild2=&Fild3=",
    );
    expect(isHypSuccess(token)).toBe(true);
    expect(token.Token).toBe("0505743578473060772");
    expect(token.Tokef).toBe("3105");
  });

  it("redacts secrets for logs", () => {
    const redacted = redactHypQuery(buildVerifyUrl(docsSuccessUrl, creds));
    expect(redacted).not.toContain("your-api-key");
    expect(redacted).not.toContain("your-api-password");
    expect(redacted).toContain("KEY=***");
    expect(redacted).toContain("PassP=***");
    expect(redacted).toContain("Sign=***");
    expect(redacted).toContain("Id=408941655");
    expect(redactHypQuery("CC=6920843946458103712&Token=True&Amount=10")).toBe(
      "CC=***&Token=***&Amount=10",
    );
  });

  it("low-level helpers", () => {
    expect(formatHypValue(true)).toBe("True");
    expect(formatHypValue(false)).toBe("False");
    expect(formatHypValue(0)).toBe("0");
    expect(formatHypValue(undefined)).toBeUndefined();
    expect(formatHypValue(null)).toBeUndefined();
    expect(toPairs({ a: 1, b: undefined, c: "x y" })).toEqual([
      ["a", "1"],
      ["c", "x y"],
    ]);
    expect(
      encodeQuery([
        ["email", "a@b.co.il"],
        ["name", "שם פרטי"],
      ]),
    ).toBe("email=a%40b.co.il&name=%D7%A9%D7%9D%20%D7%A4%D7%A8%D7%98%D7%99");
  });
});
