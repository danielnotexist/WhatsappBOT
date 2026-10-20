import { requireEnv } from "@/lib/env";
import {
  HYP_PAY_ENDPOINT,
  HypError,
  buildSignUrl,
  buildVerifyUrl,
  encodeQuery,
  hypResponseCode,
  isHypSuccess,
  parseHypResponse,
  paymentPageUrl,
  redactHypQuery,
  type HypCredentials,
  type HypQueryInput,
  type HypSignParams,
} from "./sign";

/** Server-to-server HYP calls (PLAN §4). All methods are HTTPS GETs that return url-encoded strings. */
export interface HypGateway {
  /** APISign What=SIGN → the hosted payment page URL */
  createPaymentPage(params: HypSignParams): Promise<string>;
  /** APISign What=VERIFY on the redirect query — true only for CCode=0 */
  verifyRedirect(redirect: HypQueryInput, omit?: readonly string[]): Promise<{ ok: boolean; response: Record<string, string> }>;
  /** getToken for a completed transaction */
  getToken(transId: string): Promise<{ token: string; tokef: string }>;
  /** action=soft with a saved token (monthly charge); SendHesh=True issues the invoice by mail */
  chargeToken(input: { amount: number; token: string; tokef: string; email: string; clientName?: string; userId?: string; info?: string; order?: string }): Promise<{ ok: boolean; transId: string | null; ccode: string; acode: string | null; response: Record<string, string> }>;
  /** signed PrintHesh URL for the invoice PDF of a transaction */
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

  async getToken(transId: string): Promise<{ token: string; tokef: string }> {
    const query = encodeQuery([
      ["action", "getToken"],
      ["Masof", this.creds.masof],
      ["PassP", this.creds.passp],
      ["TransId", transId],
    ]);
    const response = parseHypResponse(await this.get(`${HYP_PAY_ENDPOINT}?${query}`));
    const code = hypResponseCode(response);
    if (code !== 0 || !response.Token || !/^\d{4}$/.test(response.Tokef ?? "")) {
      throw new HypError(`getToken נכשל (CCode=${code ?? "?"}): ${code === 901 ? "טוקנים לא מופעלים במסוף — להפעיל בפורטל HYP" : code === 902 ? "PassP שגוי" : code === 910 ? "העסקה לא הצליחה" : "ראו Status Codes"}`);
    }
    return { token: response.Token, tokef: response.Tokef! };
  }

  async chargeToken(input: { amount: number; token: string; tokef: string; email: string; clientName?: string; userId?: string; info?: string; order?: string }) {
    const query = encodeQuery([
      ["action", "soft"],
      ["Masof", this.creds.masof],
      ["PassP", this.creds.passp],
      ["Amount", input.amount.toFixed(2)],
      ["Coin", "1"],
      ["CC", input.token],
      ["Tmonth", input.tokef.slice(2, 4)],
      ["Tyear", input.tokef.slice(0, 2)],
      ["Token", "True"],
      ["UserId", input.userId ?? "000000000"],
      ["ClientName", input.clientName ?? ""],
      ["email", input.email],
      ["SendHesh", "True"],
      ["Info", input.info ?? ""],
      ...(input.order ? [["Order", input.order] as [string, string]] : []),
      ["UTF8", "True"],
      ["UTF8out", "True"],
    ]);
    const response = parseHypResponse(await this.get(`${HYP_PAY_ENDPOINT}?${query}`));
    return { ok: isHypSuccess(response), transId: response.Id || null, ccode: response.CCode ?? "", acode: response.ACode || null, response };
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
 * Dev / test gateway: no network. The "payment page" is our own /api/pay/mock route, which redirects back
 * to /api/pay/return with a CCode=0 query, exactly like HYP would (minus the signature check).
 */
export class MockHypGateway implements HypGateway {
  calls: { method: string; args: unknown }[] = [];
  /** set to false to simulate a declined charge */
  chargeOk = true;
  private n = 500_000_000;

  constructor(private readonly appUrl: string) {}

  async createPaymentPage(params: HypSignParams): Promise<string> {
    this.calls.push({ method: "createPaymentPage", args: params });
    const url = new URL("/api/pay/mock", this.appUrl);
    url.searchParams.set("Amount", String(params.Amount));
    url.searchParams.set("Order", String(params.Order ?? ""));
    return url.toString();
  }
  async verifyRedirect(redirect: HypQueryInput): Promise<{ ok: boolean; response: Record<string, string> }> {
    this.calls.push({ method: "verifyRedirect", args: redirect });
    const r = typeof redirect === "string" ? Object.fromEntries(new URLSearchParams(redirect.includes("?") ? redirect.split("?")[1] : redirect)) : Object.fromEntries(redirect instanceof URLSearchParams ? redirect : (redirect as Iterable<[string, string]>));
    return { ok: r.CCode === "0", response: r as Record<string, string> };
  }
  async getToken(transId: string): Promise<{ token: string; tokef: string }> {
    this.calls.push({ method: "getToken", args: transId });
    return { token: "0000000000000000000", tokef: "3012" };
  }
  async chargeToken(input: { amount: number; token: string; tokef: string; email: string; clientName?: string; userId?: string; info?: string; order?: string }): Promise<{ ok: boolean; transId: string | null; ccode: string; acode: string | null; response: Record<string, string> }> {
    this.calls.push({ method: "chargeToken", args: input });
    const transId = String(++this.n);
    return this.chargeOk
      ? { ok: true, transId, ccode: "0", acode: "0001234", response: { Id: transId, CCode: "0", Amount: String(input.amount), ACode: "0001234", Hesh: "EZ" } }
      : { ok: false, transId, ccode: "6", acode: null, response: { Id: transId, CCode: "6" } };
  }
  async invoiceUrl(transId: string): Promise<string | null> {
    return `${this.appUrl}/api/pay/mock?invoice=${transId}`;
  }
}
