import { describe, expect, it, vi } from "vitest";
import { HypClient, LazyHypGateway, MockHypGateway } from "./client";
import { HypPreflightError } from "./sign";

function fakeFetch(responder: (url: URL) => string, status = 200) {
  const urls: URL[] = [];
  const fn = vi.fn(async (input: string | URL | Request) => {
    const url = new URL(String(input));
    urls.push(url);
    return new Response(responder(url), { status });
  });
  return { fn: fn as unknown as typeof fetch, urls };
}

const creds = { masof: "0010345518", key: "KEY1", passp: "PASS1" };

describe("HypClient", () => {
  it("creates the payment page from a SIGN response", async () => {
    const f = fakeFetch(() => "action=pay&Masof=0010345518&Amount=99&Order=u1%3Abasic&signature=abc123");
    const hyp = new HypClient(creds, f.fn);
    const page = await hyp.createPaymentPage({ Amount: 99, Coin: 1, Order: "u1:basic", Sign: true, MoreData: true, SendHesh: true, email: "d@x.co", PageLang: "HEB" });
    expect(page).toBe("https://pay.hyp.co.il/p/?action=pay&Masof=0010345518&Amount=99&Order=u1%3Abasic&signature=abc123");
    const q = f.urls[0]!.searchParams;
    expect(q.get("action")).toBe("APISign");
    expect(q.get("What")).toBe("SIGN");
    expect(q.get("KEY")).toBe("KEY1");
    expect(q.get("SendHesh")).toBe("True");
  });

  it("verifies a redirect, fetches a token and charges it with SendHesh", async () => {
    const f = fakeFetch((url) => {
      const action = url.searchParams.get("action");
      const what = url.searchParams.get("What");
      if (action === "APISign" && what === "VERIFY") return "CCode=0";
      if (action === "getToken") return "Id=401594866&CCode=0&Token=0505743578473060772&Tokef=3105&Fild1=&Fild2=&Fild3=";
      if (action === "soft") return "Id=408671193&CCode=0&Amount=99.00&ACode=0502150&Fild1=&Fild2=&Fild3=&Hesh=EZ";
      if (action === "APISign" && url.searchParams.get("ACTION") === "PrintHesh") return "Masof=0010345518&TransId=408671193&action=PrintHesh&type=EZCOUNT&signature=sig";
      return "CCode=999";
    });
    const hyp = new HypClient(creds, f.fn);
    const v = await hyp.verifyRedirect("https://app/api/pay/return?Id=401594866&CCode=0&Amount=99&ACode=0502150&Order=u1%3Abasic&Sign=xyz&u=abc", ["u"]);
    expect(v.ok).toBe(true);
    expect(f.urls[0]!.searchParams.get("What")).toBe("VERIFY");
    expect(f.urls[0]!.searchParams.has("u")).toBe(false);
    expect(f.urls[0]!.searchParams.get("Sign")).toBe("xyz");

    expect(await hyp.getToken("401594866")).toEqual({ token: "0505743578473060772", tokef: "3105" });
    expect(f.urls[1]!.searchParams.get("TransId")).toBe("401594866");

    const c = await hyp.chargeToken({ amount: 99, token: "0505743578473060772", tokef: "3105", email: "d@x.co", clientName: "דנה", info: "בסיסי" });
    expect(c).toMatchObject({ ok: true, transId: "408671193", acode: "0502150" });
    const q = f.urls[2]!.searchParams;
    expect(q.get("action")).toBe("soft");
    expect(q.get("CC")).toBe("0505743578473060772");
    expect(q.get("Tmonth")).toBe("05");
    expect(q.get("Tyear")).toBe("31");
    expect(q.get("Token")).toBe("True");
    expect(q.get("SendHesh")).toBe("True");
    expect(q.get("Amount")).toBe("99");
    expect(q.get("ClientName")).toBe("דנה");
    expect(q.has("Pritim")).toBe(false);
    expect(await hyp.invoiceUrl("408671193")).toContain("action=PrintHesh");
  });

  it("charges a token with invoice lines (Pritim + heshDesc), allowFalse for J2, and Id=0 as no transaction", async () => {
    const f = fakeFetch((url) => {
      if (url.searchParams.get("action") === "getToken") return "Id=7&CCode=0&Token=1234567890123454580&Tokef=3012";
      return url.searchParams.get("Amount") === "129.03" ? "Id=408671194&CCode=0&Amount=129.03&ACode=1&Hesh=EZ" : "Id=0&CCode=997&Amount=99&ACode=";
    });
    const hyp = new HypClient(creds, f.fn);
    const ok = await hyp.chargeToken({ amount: 129.03, token: "1234567890123454580", tokef: "3012", email: "d@x.co", items: [{ description: "שדרוג [פרו]~ יתרה", quantity: 1, price: 129.03 }], order: "a1", info: "upgrade:a1" });
    expect(ok).toMatchObject({ ok: true, transId: "408671194" });
    const q = f.urls[0]!.searchParams;
    expect(q.get("Pritim")).toBe("True");
    expect(q.get("heshDesc")).toBe("[0~שדרוג פרו יתרה~1~129.03]");
    expect(q.get("ClientName")).toBe("לקוח"); // required by action=soft
    expect(q.get("Order")).toBe("a1");
    const bad = await hyp.chargeToken({ amount: 99, token: "1234567890123454580", tokef: "3012", email: "d@x.co" });
    expect(bad).toMatchObject({ ok: false, transId: null, ccode: "997" });
    // a list that does not add up is refused before anything is sent (HYP would answer CCode 400)
    await expect(hyp.chargeToken({ amount: 99, token: "t", tokef: "3012", email: "d@x.co", items: [{ description: "x", quantity: 1, price: 98 }] })).rejects.toBeInstanceOf(HypPreflightError);
    expect(f.urls).toHaveLength(2);
    await hyp.getToken("7", { allowFalse: true });
    expect(f.urls[2]!.searchParams.get("allowFalse")).toBe("True");
  });

  it("explains getToken failures in Hebrew (901 = tokens not enabled)", async () => {
    const f = fakeFetch(() => "CCode=901");
    await expect(new HypClient(creds, f.fn).getToken("1")).rejects.toThrow(/טוקנים לא מופעלים/);
  });

  it("mock gateway round-trips without network", async () => {
    const m = new MockHypGateway("https://app.example.co.il");
    const page = await m.createPaymentPage({ Amount: 99, Order: "u1:basic" });
    expect(page).toContain("/api/pay/mock?Amount=99&Order=u1%3Abasic");
    expect((await m.verifyRedirect("Id=1&CCode=0&Sign=x")).ok).toBe(true);
    expect((await m.verifyRedirect("Id=1&CCode=6&Sign=x")).ok).toBe(false);
    expect((await m.verifyRedirect("Id=1&CCode=600&Sign=x")).ok).toBe(true); // J2 card check
    m.chargeOk = false;
    expect((await m.chargeToken({ amount: 99, token: "t", tokef: "3012", email: "a@b.co" })).ccode).toBe("4");
    m.chargeScript = ["0", "997", new Error("socket hang up")];
    expect((await m.chargeToken({ amount: 99, token: "t", tokef: "3012", email: "a@b.co" })).ok).toBe(true);
    expect((await m.chargeToken({ amount: 99, token: "t", tokef: "3012", email: "a@b.co" })).ccode).toBe("997");
    await expect(m.chargeToken({ amount: 99, token: "t", tokef: "3012", email: "a@b.co" })).rejects.toThrow("socket hang up");
    expect((await m.getToken("401594866")).token).toMatch(/^\d{15}4580$/);
  });

  it("the lazy gateway reports a missing configuration as a preflight error (nothing was sent)", async () => {
    const lazy = new LazyHypGateway(() => {
      throw new Error("משתני סביבה חסרים: HYP_MASOF");
    });
    await expect(lazy.chargeToken({ amount: 1, token: "t", tokef: "3012", email: "a@b.co" })).rejects.toBeInstanceOf(HypPreflightError);
  });
});
