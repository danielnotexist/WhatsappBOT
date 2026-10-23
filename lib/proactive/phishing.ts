import { domainOf, type ProactiveMail } from "./mail";

/**
 * Phishing / business-email-compromise (BEC) checks — read-only (docs/research/instinct.md §8 #3): the assistant warns
 * ("⚠️ שימו לב: …") and never acts on such a mail. Deterministic signals first; a mail with only a weak signal is
 * "borderline", which a cheap model call may settle where no model reads the mail anyway (the morning summary,
 * lib/proactive/classify.ts) — when the user asks about the mail, the strong model reads the signals with it.
 *
 * Signals and weights:
 *   lookalike_domain    3  the sender's domain is one edit (or a swapped TLD / a lookalike letter) away from a known
 *                          contact's or a commonly impersonated brand's domain
 *   display_name_spoof  3  the display name is a brand's off its domains, or carries a different address;
 *                       2  the display name is a known contact's but the address is not theirs (people do write from a
 *                          private address too — alone it is borderline; with any other signal it is suspicious)
 *   credential_link     3  "verify your account / password" with a link to an IP, a link shortener, punycode, a
 *                          lookalike host, or a URL with "@" in it
 *   bank_change         3  new bank details / IBAN / "the payment goes to our new account"
 *   reply_to_mismatch   2  Reply-To on another domain than From (and not a known contact) — not on bulk mail
 *   payment_urgency     2  an urgent payment / transfer request, gift cards
 *   login_link          1  sign-in words and a link to another domain than the sender's
 * ≥ 3 → suspicious, 1–2 → borderline, 0 → none.
 */

export type PhishingSignal = "lookalike_domain" | "display_name_spoof" | "credential_link" | "bank_change" | "reply_to_mismatch" | "payment_urgency" | "login_link";

const WEIGHT: Record<PhishingSignal, number> = { lookalike_domain: 3, display_name_spoof: 3, credential_link: 3, bank_change: 3, reply_to_mismatch: 2, payment_urgency: 2, login_link: 1 };

export interface PhishingCheck {
  level: "none" | "borderline" | "suspicious";
  signals: PhishingSignal[];
  score: number;
  /** the known contact or brand the mail seems to imitate (address or brand name), for the warning text */
  imitates: string | null;
}

export interface Contact {
  name: string;
  address: string;
}

export interface PhishingContext {
  /** people the user corresponds with (Sent Items recipients, calendar attendees) */
  known: readonly Contact[];
  /** the user's own addresses (never "imitated") */
  selfAddresses?: readonly string[];
}

/** Domains often imitated in Israel and abroad (banks, card companies, government, the big mail providers). */
export const BRANDS: readonly { name: string; names: RegExp; domains: readonly string[] }[] = [
  { name: "Microsoft", names: /microsoft|outlook|office ?365|מיקרוסופט/i, domains: ["microsoft.com", "office.com", "outlook.com", "live.com", "microsoftonline.com", "office365.com", "sharepoint.com", "onmicrosoft.com"] },
  { name: "Google", names: /\bgoogle\b|gmail|גוגל/i, domains: ["google.com", "gmail.com", "accounts.google.com"] },
  { name: "PayPal", names: /paypal|פייפאל/i, domains: ["paypal.com"] },
  { name: "Apple", names: /\bapple\b|icloud/i, domains: ["apple.com", "icloud.com"] },
  { name: "בנק לאומי", names: /לאומי|leumi/i, domains: ["leumi.co.il", "bankleumi.co.il"] },
  { name: "בנק הפועלים", names: /הפועלים|hapoalim/i, domains: ["bankhapoalim.co.il", "poalim.co.il"] },
  { name: "בנק דיסקונט", names: /דיסקונט|discount ?bank/i, domains: ["discountbank.co.il"] },
  { name: "מזרחי טפחות", names: /מזרחי|טפחות|mizrahi/i, domains: ["mizrahi-tefahot.co.il"] },
  { name: "ישראכרט", names: /ישראכרט|isracard/i, domains: ["isracard.co.il"] },
  { name: "כאל", names: /(^|\s)כאל(\s|$)|cal-online/i, domains: ["cal-online.co.il"] },
  { name: "מקס", names: /\bmax\b.*(כרטיס|card)|max\.co\.il/i, domains: ["max.co.il"] },
  { name: "רשות המסים", names: /רשות המסים/i, domains: ["gov.il", "taxes.gov.il"] },
  { name: "ביטוח לאומי", names: /ביטוח לאומי|btl/i, domains: ["btl.gov.il"] },
  { name: "דואר ישראל", names: /דואר ישראל|israel post/i, domains: ["israelpost.co.il"] },
];

const SECOND_LEVEL = new Set(["co", "org", "ac", "gov", "net", "muni", "k12", "idf", "com", "ltd", "plc"]);

/** "mail.shapira-law.co.il" → "shapira-law.co.il" (two labels, three under co.il / org.uk and the like). */
export function registrableDomain(domain: string): string {
  const labels = domain.toLowerCase().replace(/\.$/, "").split(".").filter(Boolean);
  if (labels.length <= 2) return labels.join(".");
  const tld = labels.at(-1)!;
  const second = labels.at(-2)!;
  return (tld.length === 2 && SECOND_LEVEL.has(second) ? labels.slice(-3) : labels.slice(-2)).join(".");
}

/** The name part of a registrable domain ("shapira-law.co.il" → "shapira-law"). */
const nameOf = (reg: string) => reg.split(".")[0] ?? reg;
const tldOf = (reg: string) => reg.split(".").slice(1).join(".");

/** Letters that look alike, folded: 0→o, 1/l/i→l, rn→m, vv→w, and the hyphen dropped. */
function fold(s: string): string {
  return s.replace(/rn/g, "m").replace(/vv/g, "w").replace(/0/g, "o").replace(/[1i|]/g, "l").replace(/-/g, "");
}

/** Damerau–Levenshtein (optimal string alignment) distance, capped at `max + 1`. */
export function editDistance(a: string, b: string, max = 3): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array<number>(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0]![j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, d[i - 2]![j - 2]! + 1);
      d[i]![j] = v;
    }
  }
  return d[a.length]![b.length]!;
}

/**
 * Does `candidate` imitate `genuine` (both registrable domains)? Never when they are equal. Yes when the names fold to
 * the same string (paypa1 / rnicrosoft), are one edit apart (two for long names), or are the same name under another
 * TLD (shapira-law.co.il / shapira-law.com) — or the genuine name with a word glued on (shapira-law-billing.com).
 * `brand`: the stricter test for the brand list (brands own many TLDs, and short brand names are ordinary words).
 */
export function looksLike(candidate: string, genuine: string, opts: { brand?: boolean } = {}): boolean {
  if (!candidate || !genuine || candidate === genuine) return false;
  if (candidate.startsWith("xn--") || candidate.includes(".xn--")) return true; // punycode imitating an ASCII domain
  const c = nameOf(candidate);
  const g = nameOf(genuine);
  if (g.length < 4) return false; // too short to judge (ibm.com / ibn.com)
  if (c === g) return !opts.brand && tldOf(candidate) !== tldOf(genuine);
  if (fold(c) === fold(g)) return true;
  if (opts.brand && g.length < 6) return false;
  const max = g.length >= 9 ? 2 : 1;
  if (editDistance(c, g, max) <= max) return true;
  return g.length >= 7 && (c.startsWith(`${g}-`) || c.endsWith(`-${g}`));
}

const normName = (s: string) =>
  s
    .normalize("NFKC")
    .replace(/[֑-ׇ"'׳״`“”]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

const BANK_CHANGE =
  /(פרטי|מספר)\s+(ה)?חשבון\s+(ה)?(בנק|החדש|חדש)|חשבון\s+(ה)?בנק\s+(ה)?חדש|(שינוי|עדכון|החלפת)\s+(ב)?פרטי\s+(ה)?(בנק|חשבון)|פרטי\s+(ה)?בנק\s+(ה)?(חדשים|עודכנו|השתנו)|\biban\b|new\s+bank\s+(account|details)|(updated|changed|new)\s+(our\s+)?(bank|banking|remittance|payment)\s+(account|details|information)|change\s+of\s+bank/i;
const PAYMENT_URGENCY =
  /(תשלום|העברה|להעביר|לשלם|ההעברה|התשלום)[^.\n]{0,40}(דחוף|דחופה|בדחיפות|מיד|מיידית|היום|בהקדם|עוד היום)|(דחוף|דחופה|בדחיפות|urgent)[^.\n]{0,40}(תשלום|העברה|להעביר|לשלם|payment|transfer|wire)|wire\s+transfer|gift\s*cards?|כרטיס(י)?\s+מתנה|(pay|payment)\s+(today|immediately|now)|urgent\s+payment|overdue\s+invoice.{0,30}(today|immediately)/i;
const LOGIN_WORDS =
  /סיסמ|אימות\s+(ה)?חשבון|לאמת\s+את\s+(ה)?חשבון|התחבר|כניסה\s+לחשבון|החשבון\s+(שלך\s+)?(יושעה|יחסם|ננעל|הושעה)|password|verify\s+(your\s+)?(account|identity|email)|sign[\s-]?in|log[\s-]?in|account\s+(suspended|locked|disabled)|confirm\s+your\s+(account|details|identity)|mailbox\s+(is\s+)?full|unusual\s+(sign|activity)/i;
const SHORTENERS = new Set(["bit.ly", "tinyurl.com", "t.co", "goo.gl", "ow.ly", "is.gd", "rebrand.ly", "cutt.ly", "shorturl.at", "tiny.cc", "rb.gy", "s.id", "lnkd.in"]);
const URL_RE = /\bhttps?:\/\/[^\s<>"')\]]+/gi;

interface LinkInfo {
  host: string;
  /** an IP host, a shortener, punycode, or "@" in the authority */
  risky: boolean;
}

export function linksIn(text: string): LinkInfo[] {
  const out: LinkInfo[] = [];
  for (const raw of text.match(URL_RE) ?? []) {
    const authority = raw.replace(/^https?:\/\//i, "").split(/[/?#]/)[0] ?? "";
    const host = (authority.split("@").at(-1) ?? "").split(":")[0]!.toLowerCase();
    if (!host) continue;
    const risky = authority.includes("@") || /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.startsWith("[") || SHORTENERS.has(host) || host.split(".").some((l) => l.startsWith("xn--"));
    out.push({ host, risky });
  }
  return out.slice(0, 30);
}

/** The deterministic check of one mail. */
export function checkPhishing(mail: Pick<ProactiveMail, "from" | "replyTo" | "subject" | "text" | "bulkHeaders">, ctx: PhishingContext): PhishingCheck {
  const signals = new Set<PhishingSignal>();
  let imitates: string | null = null;
  /** the display-name signal came from a known contact's name only (weight 2, see above) */
  let twinOnly = false;
  const from = mail.from?.address.trim().toLowerCase() ?? "";
  const fromReg = registrableDomain(domainOf(from));
  const self = new Set((ctx.selfAddresses ?? []).map((a) => a.toLowerCase()));
  const known = ctx.known.filter((c) => c.address && !self.has(c.address.toLowerCase()));
  const knownAddresses = new Set(known.map((c) => c.address.toLowerCase()));
  const knownDomains = new Set(known.map((c) => registrableDomain(domainOf(c.address))).filter(Boolean));
  const text = `${mail.subject}\n${mail.text}`;

  // the sender is a known contact (exact address) — still checked for bank changes and links, never for imitation
  const fromKnown = knownAddresses.has(from);

  if (fromReg && !knownDomains.has(fromReg) && !fromKnown) {
    const genuine = [...knownDomains].find((d) => looksLike(fromReg, d));
    if (genuine) {
      signals.add("lookalike_domain");
      imitates = genuine;
    } else {
      const brand = BRANDS.find((b) => b.domains.some((d) => looksLike(fromReg, registrableDomain(d), { brand: true })));
      if (brand) {
        signals.add("lookalike_domain");
        imitates = brand.name;
      }
    }
  }

  // display name: a known contact's name on another address / domain, a brand's name off its domains, or an address
  const display = normName(mail.from?.name ?? "");
  if (display && from && !fromKnown) {
    const twin = display.length >= 3 ? known.find((c) => normName(c.name) === display && c.address.toLowerCase() !== from && registrableDomain(domainOf(c.address)) !== fromReg) : undefined;
    // a brand's name is fine from any domain of any brand that name fits ("ביטוח לאומי" is not "בנק לאומי")
    const named = BRANDS.filter((x) => x.names.test(display));
    const brand = named.length && !named.some((x) => x.domains.some((d) => registrableDomain(d) === fromReg)) ? named[0] : undefined;
    const embedded = display.match(/[^\s<>@]+@[^\s<>@]+\.[a-z]{2,}/i)?.[0]?.toLowerCase();
    if (twin) {
      signals.add("display_name_spoof");
      imitates ??= twin.address;
      twinOnly = true;
    } else if (embedded && embedded !== from) {
      signals.add("display_name_spoof");
      imitates ??= embedded;
    } else if (brand && fromReg) {
      signals.add("display_name_spoof");
      imitates ??= brand.name;
    }
  }

  if (!mail.bulkHeaders) {
    const other = mail.replyTo.find((r) => r.address && registrableDomain(domainOf(r.address)) !== fromReg && !knownAddresses.has(r.address.toLowerCase()));
    if (other && fromReg) signals.add("reply_to_mismatch");
  }

  if (BANK_CHANGE.test(text)) signals.add("bank_change");
  if (PAYMENT_URGENCY.test(text)) signals.add("payment_urgency");

  if (LOGIN_WORDS.test(text)) {
    const links = linksIn(mail.text);
    const lookalikeHost = links.find((l) => {
      const reg = registrableDomain(l.host);
      return [...knownDomains].some((d) => looksLike(reg, d)) || BRANDS.some((b) => b.domains.some((d) => looksLike(reg, registrableDomain(d), { brand: true })));
    });
    if (links.some((l) => l.risky) || lookalikeHost) signals.add("credential_link");
    else if (links.some((l) => registrableDomain(l.host) !== fromReg)) signals.add("login_link");
  }

  const list = [...signals];
  const score = list.reduce((s, x) => s + (x === "display_name_spoof" && twinOnly ? 2 : WEIGHT[x]), 0);
  return { level: score >= 3 ? "suspicious" : score > 0 ? "borderline" : "none", signals: list, score, imitates };
}
