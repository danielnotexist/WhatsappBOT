import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createCardLinkToken, createInvoiceToken } from "@/lib/billing/links";
import { activateSubscription, loadCardToken } from "@/lib/billing/subscription";
import { setDbForTests } from "@/lib/db";
import { MemoryDb } from "@/lib/db/memory";
import { setHypForTests } from "@/lib/hyp";
import { MockHypGateway } from "@/lib/hyp/client";
import { setWaSenderForTests } from "@/lib/wa";
import { RecordingWaSender } from "@/lib/wa/sender";
import { GET as invoiceGet } from "../../invoice/[token]/route";
import { GET as cardGet } from "../../pay/card/[token]/route";
import { GET as mockGet } from "./mock/route";
import { GET as returnGet } from "./return/route";

// route handlers mark themselves request-time with connection(), which needs a request scope outside Next
vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), connection: async () => {} }));
// whether this browser is signed in: the result lands on /account (signed in) or on /pay/done (a link opened on the phone)
const session = vi.hoisted(() => ({ signedIn: true }));
vi.mock("@/lib/auth/current-user", async (orig) => ({ ...(await orig<typeof import("@/lib/auth/current-user")>()), hasSession: async () => session.signedIn }));

const params = <T extends Record<string, string>>(p: T) => ({ params: Promise.resolve(p) }) as never;

describe("/pay/card/<token> (J2 card update) and /invoice/<token>", () => {
  let db: MemoryDb;
  let hyp: MockHypGateway;
  let wa: RecordingWaSender;
  beforeEach(() => {
    session.signedIn = true;
    vi.stubEnv("DATA_MODE", "memory");
    vi.stubEnv("APP_URL", "https://app.example.co.il");
    vi.stubEnv("TOKEN_ENC_KEY", randomBytes(32).toString("base64"));
    db = new MemoryDb();
    hyp = new MockHypGateway("https://app.example.co.il");
    wa = new RecordingWaSender();
    setDbForTests(db);
    setHypForTests(hyp);
    setWaSenderForTests(wa);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    setDbForTests(undefined);
    setHypForTests(undefined);
    setWaSenderForTests(undefined);
  });

  async function paidUser() {
    const user = await db.createUser("dana@example.com");
    db.seedWaIdentity(user.id, "+972501234567");
    await activateSubscription(db, user, { plan: "basic", transId: "T0", amountIls: 99, acode: null, token: "1111111111111111111", tokef: "2701", invoiceUrl: null, raw: {} }, new Date(Date.now() - 40 * 86_400_000));
    return user;
  }

  it("the card link opens a fresh J2 page (no charge); the verified 600 return replaces the token and offers the overdue charge in WhatsApp", async () => {
    const user = await paidUser();
    await db.upsertSubscription(user.id, { charge_failures: 1 }); // the renewal failed
    await db.insertMessage({ user_id: user.id, wa_message_id: "w1", direction: "in", text: "עדכון כרטיס" }); // window open
    const page = await cardGet(new Request("https://app.example.co.il/pay/card/x"), params({ token: createCardLinkToken(user.id) }));
    expect(page.status).toBe(303);
    const sign = hyp.calls.find((c) => c.method === "createPaymentPage")!.args as Record<string, unknown>;
    expect(sign).toMatchObject({ J5: "J2", Order: `${user.id}:card`, SendHesh: false, Sign: true, MoreData: true, Amount: 1 });
    const hypPage = await mockGet(new Request(page.headers.get("location")!));
    const ret = new URL(hypPage.headers.get("location")!);
    expect(ret.searchParams.get("CCode")).toBe("600");
    const done = await returnGet(new Request(ret.toString()));
    expect(new URL(done.headers.get("location")!).searchParams.get("notice")).toBe("הכרטיס עודכן. אפשר לחזור לוואטסאפ.");
    expect(hyp.calls.find((c) => c.method === "getToken")!.args).toMatchObject({ allowFalse: true });
    expect((await loadCardToken(db, user.id))!.token).toMatch(/4580$/);
    expect(hyp.calls.filter((c) => c.method === "chargeToken")).toHaveLength(0); // never charged without the press
    const msg = wa.sent.at(-1)!;
    expect(msg.kind).toBe("buttons");
    expect(msg.body).toContain("הכרטיס עודכן (מסתיים ב-4580)");
    expect(msg.body).toContain("החיוב החודשי שלא עבר: 99 ₪");
    expect(msg.buttons![0]!.title).toBe("חיוב עכשיו");
    expect(db.audit.some((a) => a.action === "billing.card_update" && a.result === "ok")).toBe(true);
  });

  it("an invalid / expired card link never reaches HYP", async () => {
    const res = await cardGet(new Request("https://app.example.co.il/pay/card/x"), params({ token: "nope.nope" }));
    expect(new URL(res.headers.get("location")!).searchParams.get("error")).toContain("לא בתוקף");
    session.signedIn = false; // the link opened on the phone: the fixed page, not the personal area
    const phone = new URL((await cardGet(new Request("https://app.example.co.il/pay/card/x"), params({ token: "nope.nope" }))).headers.get("location")!);
    expect(phone.pathname + phone.search).toBe("/pay/done?r=card_link");
    expect(hyp.calls).toHaveLength(0);
  });

  it("the invoice link serves the PDF of the user's own successful transaction only", async () => {
    const user = await paidUser();
    const ok = await invoiceGet(new Request("https://app.example.co.il/invoice/x"), params({ token: createInvoiceToken(user.id, "T0") }));
    expect(ok.status).toBe(302); // memory mode → the mock PrintHesh link
    const pdf = await mockGet(new Request(ok.headers.get("location")!));
    expect(pdf.headers.get("content-type")).toBe("application/pdf");
    expect(new TextDecoder().decode(await pdf.arrayBuffer())).toMatch(/^%PDF-1\.4/);
    expect(hyp.calls.find((c) => c.method === "invoiceUrl")!.args).toBe("T0");
    // another user's transaction, or a forged token → 404
    const other = await db.createUser("yossi@example.com");
    expect((await invoiceGet(new Request("https://app.example.co.il/invoice/x"), params({ token: createInvoiceToken(other.id, "T0") }))).status).toBe(404);
    expect((await invoiceGet(new Request("https://app.example.co.il/invoice/x"), params({ token: "a.b" }))).status).toBe(404);
  });
});
