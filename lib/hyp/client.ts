import { requireEnv } from "@/lib/env";
import { HYP_SUCCESS_CODES } from "./codes";
import {
  HYP_PAY_ENDPOINT,
  HypError,
  HypPreflightError,
  buildSignUrl,
  buildVerifyUrl,
  encodeQuery,
  formatAmount,
  formatHeshDesc,
  hypResponseCode,
  isHypSuccess,
  itemsTotal,
  parseHypResponse,
  paymentPageUrl,
  redactHypQuery,
  type HypCredentials,
  type HypInvoiceItem,
  type HypQueryInput,
  type HypSignParams,
} from "./sign";

/** `action=soft` with a saved token (developers.hyp.co.il → Actions → Charge a saved token). */
export interface HypChargeInput {
  /** VAT included, up to two fractional digits */
  amount: number;
  token: string;
  /** YYMM from getToken */
  tokef: string;
  email: string;
  clientName?: string;
  clientLName?: string;
  userId?: string;
  /** saved by HYP with the transaction — we put the approval / due date here for reconciliation */
  info?: string;
  order?: string;
  /** invoice lines → `Pritim=True` + `heshDesc`; their total must equal `amount` (else HYP answers CCode 400) */
  items?: HypInvoiceItem[];
}

export interface HypChargeResult {
  ok: boolean;
  /** HYP transaction id (`Id`); null when HYP did not create one (`Id=0` / missing) */
  transId: string | null;
  ccode: string;
  acode: string | null;
  response: Record<string, string>;
}

/** Server-to-server HYP calls (PLAN §4). All methods are HTTPS GETs that return url-encoded strings. */
export interface HypGateway {
  /** APISign What=SIGN → the hosted payment page URL */
  createPaymentPage(params: HypSignParams): Promise<string>;
  /** APISign What=VERIFY on the redirect query — true only when HYP confirms the signature (CCode=0) */
  verifyRedirect(redirect: HypQueryInput, omit?: readonly string[]): Promise<{ ok: boolean; response: Record<string, string> }>;
  /** getToken for a completed transaction; `allowFalse` also for a J2 card check (CCode 600) */
  getToken(transId: string, opts?: { allowFalse?: boolean }): Promise<{ token: string; tokef: string }>;
  /** action=soft with a saved token; SendHesh=True issues the invoice (HYP Invoice) and emails it */
  chargeToken(input: HypChargeInput): Promise<HypChargeResult>;
  /** signed PrintHesh URL (temporary) for the invoice PDF of a transaction */
  invoiceUrl(transId: string): Promise<string | null>;
}

export class HypClient implements HypGateway {
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly creds: HypCredentials, fetchImpl?: typeof fetch) {
    this.fetchImpl = fetchImpl ?? fetch;
  }

  /** Hebrew EnvError when HYP_MASOF / HYP_KEY / HYP_PASSP are missing. */
  static fromEnv(fetchImpl?: typeof fetch): HypClient {
    const env = requireEnv(["HYP_MASOF", "HYP_KEY", "HYP_PASSP"]);
    return new HypClient({ masof: env.HYP_MASOF, key: env.HYP_KEY, passp: env.HYP_PASSP }, fetchImpl);
  }

  private async get(url: string): Promise<string> {
    const res = await this.fetchImpl(url, { method: "GET" });
    const text = await res.text();
    if (!res.ok) throw new HypError(`HYP HTTP ${res.status}: ${redactHypQuery(text.slice(0, 200))}`);
    return text.trim();
  }

  async createPaymentPage(params: HypSignParams): Promise<string> {
    const response = await this.get(buildSignUrl(params, this.creds));
    return paymentPageUrl(response);
  }

  async verifyRedirect(redirect: HypQueryInput, omit: readonly string[] = []): Promise<{ ok: boolean; response: Record<string, string> }> {
    const response = parseHypResponse(await this.get(buildVerifyUrl(redirect, this.creds, { omit })));
    return { ok: isHypSuccess(response), response };
  }

  async getToken(transId: string, opts: { allowFalse?: boolean } = {}): Promise<{ token: string; tokef: string }> {
    const query = encodeQuery([
      ["action", "getToken"],
      ["Masof", this.creds.masof],
      ["PassP", this.creds.passp],
      ["TransId", transId],
      ...(opts.allowFalse ? [["allowFalse", "True"] as [string, string]] : []),
    ]);
    const response = parseHypResponse(await this.get(`${HYP_PAY_ENDPOINT}?${query}`));
    const code = hypResponseCode(response);
    if (code !== 0 || !response.Token || !/^\d{4}$/.test(response.Tokef ?? "")) {
      throw new HypError(`getToken נכשל (CCode=${code ?? "?"}): ${code === 901 ? "טוקנים לא מופעלים במסוף — להפעיל בפורטל HYP" : code === 902 ? "PassP שגוי" : code === 910 ? "העסקה לא הצליחה (או חסר allowFalse=True לבדיקת כרטיס J2)" : "ראו Status Codes"}`);
    }
    return { token: response.Token, tokef: response.Tokef! };
  }

  async chargeToken(input: HypChargeInput): Promise<HypChargeResult> {
    if (input.items?.length && itemsTotal(input.items) !== Math.round(input.amount * 100) / 100) {
      throw new HypPreflightError(`סכום שורות החשבונית (${itemsTotal(input.items)}) שונה מסכום החיוב (${input.amount}) — HYP היה דוחה (CCode 400).`);
    }
    const query = encodeQuery([
      ["action", "soft"],
      ["Masof", this.creds.masof],
      ["PassP", this.creds.passp],
      ["Amount", formatAmount(input.amount)],
      ["Coin", "1"],
      ["CC", input.token],
      ["Tmonth", input.tokef.slice(2, 4)],
      ["Tyear", input.tokef.slice(0, 2)],
      ["Token", "True"],
      ["UserId", input.userId ?? "000000000"],
      // ClientName is required by action=soft (CCode 401 without it)
      ["ClientName", input.clientName?.trim() || "לקוח"],
      ...(input.clientLName ? [["ClientLName", input.clientLName] as [string, string]] : []),
      ["email", input.email],
      ["SendHesh", "True"],
      ...(input.items?.length ? ([["Pritim", "True"], ["heshDesc", formatHeshDesc(input.items)]] as [string, string][]) : []),
      ["Info", input.info ?? ""],
      ...(input.order ? [["Order", input.order] as [string, string]] : []),
      ["UTF8", "True"],
      ["UTF8out", "True"],
    ]);
    const response = parseHypResponse(await this.get(`${HYP_PAY_ENDPOINT}?${query}`));
    const transId = response.Id && response.Id !== "0" ? response.Id : null;
    return { ok: isHypSuccess(response), transId, ccode: response.CCode ?? "", acode: response.ACode || null, response };
  }

  async invoiceUrl(transId: string): Promise<string | null> {
    const query = encodeQuery([
      ["Masof", this.creds.masof],
      ["action", "APISign"],
      ["KEY", this.creds.key],
      ["What", "SIGN"],
      ["PassP", this.creds.passp],
      ["TransId", transId],
      ["type", "EZCOUNT"],
      ["ACTION", "PrintHesh"],
    ]);
    const response = await this.get(`${HYP_PAY_ENDPOINT}?${query}`);
    const parsed = parseHypResponse(response);
    if (!parsed.signature) return null;
    return `${HYP_PAY_ENDPOINT}?${response}`;
  }
}

/**
 * Defers building the real gateway to the first call (so a missing HYP_* only fails the calls that need HYP), and
 * reports a construction failure as HypPreflightError — nothing was sent, so nothing can have been charged.
 */
export class LazyHypGateway implements HypGateway {
  constructor(private readonly factory: () => HypGateway) {}
  private gateway(): HypGateway {
    try {
      return this.factory();
    } catch (e) {
      throw new HypPreflightError((e as Error).message);
    }
  }
  async createPaymentPage(params: HypSignParams) {
    return this.gateway().createPaymentPage(params);
  }
  async verifyRedirect(redirect: HypQueryInput, omit?: readonly string[]) {
    return this.gateway().verifyRedirect(redirect, omit);
  }
  async getToken(transId: string, opts?: { allowFalse?: boolean }) {
    return this.gateway().getToken(transId, opts);
  }
  async chargeToken(input: HypChargeInput) {
    return this.gateway().chargeToken(input);
  }
  async invoiceUrl(transId: string) {
    return this.gateway().invoiceUrl(transId);
  }
}

/**
 * Dev / test gateway: no network. The "payment page" is our own /api/pay/mock route, which redirects back
 * to /api/pay/return with a CCode=0 query (600 for a J2 card check), exactly like HYP would (minus the signature check).
 */
export class MockHypGateway implements HypGateway {
  calls: { method: string; args: unknown }[] = [];
  /** set to false to simulate a declined charge (CCode `declineCode`) */
  chargeOk = true;
  /** CCode for a declined charge when nothing is scripted ("4" = not approved → a retryable decline) */
  declineCode = "4";
  /** scripted outcomes for the next chargeToken calls, in order: a CCode ("0" = approved), an Error (no answer from HYP) or a whole result */
  chargeScript: (string | Error | HypChargeResult)[] = [];
  private n = 500_000_000;

  constructor(private readonly appUrl: string) {}

  async createPaymentPage(params: HypSignParams): Promise<string> {
    this.calls.push({ method: "createPaymentPage", args: params });
    const url = new URL("/api/pay/mock", this.appUrl);
    url.searchParams.set("Amount", String(params.Amount));
    url.searchParams.set("Order", String(params.Order ?? ""));
    if (params.J5) url.searchParams.set("J5", String(params.J5 === true ? "True" : params.J5));
    return url.toString();
  }
  async verifyRedirect(redirect: HypQueryInput): Promise<{ ok: boolean; response: Record<string, string> }> {
    this.calls.push({ method: "verifyRedirect", args: redirect });
    const r = typeof redirect === "string" ? Object.fromEntries(new URLSearchParams(redirect.includes("?") ? redirect.split("?")[1] : redirect)) : Object.fromEntries(redirect instanceof URLSearchParams ? redirect : (redirect as Iterable<[string, string]>));
    return { ok: (HYP_SUCCESS_CODES as readonly string[]).includes(r.CCode ?? ""), response: r as Record<string, string> };
  }
  async getToken(transId: string, opts: { allowFalse?: boolean } = {}): Promise<{ token: string; tokef: string }> {
    this.calls.push({ method: "getToken", args: { transId, ...opts } });
    // 19 digits, the last four are the "card's" (like a real HYP token)
    return { token: `${transId.replace(/\D/g, "").padStart(15, "0").slice(-15)}4580`, tokef: "3012" };
  }
  async chargeToken(input: HypChargeInput): Promise<HypChargeResult> {
    this.calls.push({ method: "chargeToken", args: input });
    const scripted = this.chargeScript.shift();
    if (scripted instanceof Error) throw scripted;
    if (typeof scripted === "object") return scripted;
    const code = scripted ?? (this.chargeOk ? "0" : this.declineCode);
    const transId = String(++this.n);
    return code === "0"
      ? { ok: true, transId, ccode: "0", acode: "0001234", response: { Id: transId, CCode: "0", Amount: formatAmount(input.amount), ACode: "0001234", Hesh: "EZ" } }
      : { ok: false, transId, ccode: code, acode: null, response: { Id: transId, CCode: code } };
  }
  async invoiceUrl(transId: string): Promise<string | null> {
    this.calls.push({ method: "invoiceUrl", args: transId });
    return `${this.appUrl}/api/pay/mock?invoice=${transId}`;
  }
}
