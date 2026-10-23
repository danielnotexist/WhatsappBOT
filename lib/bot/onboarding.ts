import { BUILTIN_AGENTS, BUILTIN_ORDER } from "@/lib/agents/templates";
import { PRODUCT_NAME } from "@/lib/brand";
import { copy, buttons, lists } from "@/lib/copy/bot";
import type { Db, UserRow } from "@/lib/db/types";
import { connectHeadsUpSuffix } from "@/lib/google/user-cap";
import { rescheduleMorningSummary } from "@/lib/jobs/morning-summary";
import { parseHebrewWhen } from "@/lib/reminders/parse";
import type { InboundMessage } from "@/lib/wa/types";
import { WORK_TOPICS_SOURCE, connectRequestProvider } from "./connect-intent";
import { connectLinkFor, type BotContext } from "./context";

/**
 * First-contact state machine (PLAN §1), persisted in users.profile.onboarding:
 *   welcome → (סיור) ways_card → first_task → ask_name → ask_business → ask_pain → ask_morning_time → connect → done
 *   welcome → (נתחיל לעבוד) first_task → … (same tail)
 * Every step is one message; free text while a question is open is taken as the answer — unless it looks like a
 * request (`requestSignal`): then the assistant answers it and the question is asked again. A connect request gets
 * its link and the question again; "חיברתי" afterwards is never an answer.
 */
export type OnboardingStep = "welcome" | "first_task" | "ask_name" | "ask_business" | "ask_pain" | "ask_morning_time" | "connect" | "done";

export interface OnboardingState {
  step: OnboardingStep;
  startedAt: string;
  /** the first task message was answered by the assistant already */
  firstTaskDone?: boolean;
  /** the last answer taken as a request on a weak signal — sent again as is, it is stored (requestSignal) */
  repeat?: string;
}

export function onboardingOf(user: UserRow): OnboardingState | null {
  const o = user.profile.onboarding as OnboardingState | undefined;
  return o && o.step && o.step !== "done" ? o : null;
}

async function setStep(db: Db, userId: string, patch: Partial<OnboardingState> & { step: OnboardingStep }): Promise<void> {
  const user = await db.getUser(userId);
  const prev = (user?.profile.onboarding as OnboardingState | undefined) ?? { step: "welcome", startedAt: new Date().toISOString() };
  await db.mergeUserProfile(userId, { onboarding: { ...prev, ...patch } });
}

export async function startOnboarding(ctx: BotContext, userId: string): Promise<void> {
  await setStep(ctx.db, userId, { step: "welcome", startedAt: ctx.now().toISOString() });
}

const MORNING: Record<string, string | null> = { mt_0700: "07:00", mt_0730: "07:30", mt_0800: "08:00", mt_0830: "08:30", mt_none: null };

/** The steps that wait for the person's answer (a typed name, a business name, a list choice). */
/** The list row that ends the "מה מעמיס" question. */
export const PAIN_DONE = "pain_done";

/** What was picked so far in the "מה מעמיס" list (profile.pain_points). */
function painPointsOf(user: UserRow): string[] {
  const v = user.profile.pain_points;
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

/**
 * The "מה מעמיס" list: the first time with all four rows; afterwards "עוד משהו?" with the rows not picked yet plus
 * "זהו, מספיק" — WhatsApp lists allow one choice per message, this is how several are collected.
 */
async function sendPainList(ctx: BotContext, to: string, picked: string[]): Promise<void> {
  const left = lists.pain.rows.filter((r) => !picked.includes(r.id));
  if (!picked.length) {
    await ctx.wa.sendList(to, copy["onb.ask_pain"](), lists.pain.button, [{ title: lists.pain.title, rows: left }]);
    return;
  }
  await ctx.wa.sendList(to, copy["onb.ask_pain_more"](), lists.pain.button, [{ title: lists.pain.title, rows: [...left, lists.pain.done] }]);
}

const ASKING: readonly OnboardingStep[] = ["ask_name", "ask_business", "ask_pain", "ask_morning_time"];

/** Is onboarding waiting for an answer right now? (the website chat hides its suggested requests meanwhile) */
export function awaitingAnswer(user: UserRow): boolean {
  const state = onboardingOf(user);
  return state !== null && ASKING.includes(state.step);
}

/**
 * Stems of requests in the second person ("תזכירי", "תנסח", "תביא"…) — never the start of a name or a business name.
 * Matched with startsWith, so one stem covers the masculine, feminine and plural forms. Stems that also open common
 * nouns are left out ("תעשיות", "תמצית", "תצורה", "תכתובת", "תרשומת"): their verbs are exact words, or caught by "לי" /
 * "את" after them.
 */
const REQUEST_STEMS = [
  "תזכיר", "תנסח", "תכתב", "תשלח", "תבדוק", "תבדק", "תקבע", "תמצא", "תגיד", "תראה", "תראי", "תסכם", "תעדכן", "תבטל",
  "תוסיף", "תזיז", "תחפש", "תכין", "תכינ", "תעזור", "תעזר", "תפתח", "תקרא", "תקרי", "תענה", "תעני", "תזמן", "תביא", "תסדר", "תתאם", "תחבר",
  "תשדרג", "תיצור", "תיצר", "תסביר", "תספר", "תעביר", "תמחק", "תשמור", "תרשמ", "תדחה", "תדחי", "תחזיר", "תוריד", "תציג", "תוציא",
  "תשלוף", "תשלפ", "תמליץ",
];
/** Infinitives that open a request ("לחבר את המייל", "לשדרג למנוי פרו") — whole words, so "לוי" or "לאה" pass. */
const REQUEST_INFINITIVES = new Set([
  "לחבר", "לשדרג", "ליצור", "לבטל", "לקבוע", "לשלוח", "לבדוק", "לנסח", "לכתוב", "להזכיר", "לסכם", "להביא", "להראות", "לחפש", "למצוא", "לעדכן",
  "להוסיף", "להזיז", "לתאם", "לפתוח", "לקרוא", "לענות", "לתזמן", "להעביר", "למחוק", "להציג", "לסדר", "להקריא", "לשלוף",
]);
/** Words of a question or a request (imperatives included: "שלח", "בדקי", "קראי", "הצג", "תן"; English too). */
const REQUEST_WORDS = new Set([
  "מה", "מתי", "איפה", "איך", "למה", "כמה", "האם", "איזה", "איזו", "אילו", "מאיפה", "לאן", "יש", "אפשר", "צריך", "צריכה", "רוצה", "בבקשה",
  "אשמח", "תוכל", "תוכלי", "נא", "בוא", "בואי", "עזרה", "תזכורת", "תזכורות", "תעשה", "תעשי", "תצור", "תצרי", "תכתוב", "תרשום",
  "תן", "תני", "שלח", "שלחי", "כתוב", "כתבי", "נסח", "נסחי", "קבע", "קבעי", "הזכר", "הזכירי", "סכם", "סכמי", "בדוק", "בדקי", "חפש", "חפשי",
  "מצא", "מצאי", "הבא", "הביאי", "הראה", "הראי", "קרא", "קראי", "הקריאי", "הצג", "הציגי", "פתח", "פתחי", "עדכן", "עדכני", "בטל", "בטלי",
  "תאם", "תאמי", "העבר", "העבירי", "מחק", "מחקי", "הוסף", "הוסיפי", "הזז", "הזיזי", "הכן", "הכיני",
  "check", "show", "send", "find", "read", "open", "get", "what", "when", "where", "how", "remind", "help", "please", "can", "could",
]);
/** "אני צריכה…", "אתה יכול…": a pronoun followed by a wish or an ability is a request (unlike "אני דנה"). */
const PRONOUNS = new Set(["אני", "אתה", "את", "אנחנו", "אתם"]);
const WISH_WORDS = new Set(["צריך", "צריכה", "צריכים", "רוצה", "רוצים", "מבקש", "מבקשת", "מחפש", "מחפשת", "יכול", "יכולה", "יכולים", "תוכל", "תוכלי", "חייב", "חייבת"]);
/** What follows a second-person verb in a request: "תעבירי לי…", "תסדר את…", "תעשי לי…". */
const REQUEST_OBJECTS = new Set(["לי", "לנו", "את", "אותי", "אותו", "אותה"]);
/** Greetings, fillers and the assistant's name before the request ("היי, תביאי לי…", "אוקיי רגע, מה…") are skipped. */
const LEADING = new RegExp(
  `^(?:(?:היי|הי|שלום|אהלן|בוקר טוב|ערב טוב|צהריים טובים|${PRODUCT_NAME}|אוקי+|אוקיי+|ok|okay|סבבה|יופי|מעולה|רגע|רק|קודם|עכשיו|דחוף|טוב|אז|כן|זהו)(?=[\\s,.!:;-]|$)[\\s,.!:;-]*)+`,
  "i",
);
/** "מזכירה, …" / "מנהלת חשבונות: …" — a built-in agent addressed by name opens a request for that agent. */
const AGENT_VOCATIVE = new RegExp(`^(?:סוכן\\s+)?(?:${BUILTIN_ORDER.flatMap((r) => [BUILTIN_AGENTS[r].name, ...BUILTIN_AGENTS[r].aliases]).join("|")})\\s*[,:]`);
/** A mail / calendar / files / reminder topic: a request, never a name or a business name. */
const REQUEST_TOPICS = new RegExp(`${WORK_TOPICS_SOURCE}|קבצ|תזכור|email|mail|calendar|meeting|remind`, "i");

const stripLeading = (text: string) => text.trim().replace(LEADING, "").trim();
const cleanWord = (w: string) => w.replace(/^[״"'׳(]+|[,.!:;״"'׳)?]+$/g, "");

/** A request word, infinitive or stem — also with the conjunction "ו" in front ("ותביאי לי…"). */
function isRequestWord(w: string): boolean {
  const one = (x: string) => REQUEST_WORDS.has(x.toLowerCase()) || REQUEST_INFINITIVES.has(x) || REQUEST_STEMS.some((stem) => x.startsWith(stem));
  return one(w) || (w.length > 2 && w.startsWith("ו") && one(w.slice(1)));
}

/**
 * How sure we are that an answer to an onboarding question is really a request for the assistant (the first thing
 * many people do is ask for something):
 *  - "strong": "?", an "@agent" / "מזכירה," opener, or within the first three words (after greetings and fillers) a
 *    question word, an imperative, an infinitive, a second-person verb followed by "לי" / "את", a pronoun with
 *    "צריך" / "יכול".
 *  - "weak" (name and business only): a mail / calendar / files / reminder word, a time ("מחר ב-9", "24/7"), "מי" first,
 *    digits in a name, or too many words. A business name can look like that ("מי עדן"), so the same text sent twice in a
 *    row is stored after all.
 * `list`: free text while a WhatsApp list is open — topic words and times are the answers there (mapped to the rows),
 * so only strong signals count.
 */
export function requestSignal(text: string, field: "name" | "business" | "list"): "strong" | "weak" | null {
  const t = stripLeading(text);
  if (!t) return null;
  if (/[?？]/.test(t) || t.startsWith("@") || AGENT_VOCATIVE.test(t)) return "strong";
  const words = t.split(/\s+/).map(cleanWord).filter(Boolean);
  const head = words.slice(0, 3);
  for (let i = 0; i < head.length; i++) {
    const w = head[i]!;
    const next = words[i + 1] ?? "";
    if (i > 0 && head[i - 1] === "לא") continue; // "לא צריך", "לא רוצה" — a no, not a request
    if (isRequestWord(w)) return "strong";
    if (PRONOUNS.has(w) && WISH_WORDS.has(next)) return "strong";
    if (w.length >= 3 && /^ו?ת/.test(w) && REQUEST_OBJECTS.has(next)) return "strong";
  }
  if (field === "list") return null;
  if (words[0] === "מי" || REQUEST_TOPICS.test(t) || parseHebrewWhen(t, { now: new Date() }) !== null) return "weak";
  if (field === "name") return /\d/.test(t) || words.length > 4 || t.length > 40 ? "weak" : null;
  return words.length > 8 || t.length > 80 ? "weak" : null;
}

/** An answer to an onboarding question that is really a request (any signal) — see `requestSignal`. */
export function looksLikeRequest(text: string, field: "name" | "business" | "list"): boolean {
  return requestSignal(text, field) !== null;
}

/** Replies that are not a name (a thank-you, an OK): the name question is simply asked again. */
const NOT_A_NAME = /^(?:תודה(?: רבה)?|לא תודה|אוקי+|אוקיי+|סבבה|בסדר|היי|הי|שלום|כן|לא|יופי|מעולה|ok|okay|thanks)[.!]*$/i;

/**
 * "חיברתי" / "עשיתי" after a connect link: an acknowledgement, never a name or a business name — the open question
 * is asked again.
 */
const CONNECT_ACK = /^(?:חיברתי|התחברתי|מחובר|מחוברת|מחוברים|עשיתי|בוצע|סיימתי|done)(?: (?:את זה|אותו|אותה|הכל|הכול|את החשבון|את המייל|את היומן|את גוגל))?[.!]*$/i;
export function isConnectAck(text: string): boolean {
  return CONNECT_ACK.test(stripLeading(text));
}

/** Skipping a question: "לדלג", "לא משנה", "אחר כך", "עוד אין". */
const SKIP = /^(?:דלג|דלגי|לדלג|תדלג|תדלגי|נדלג|אפשר לדלג|לא משנה|אחר כך|אח״כ|אחכ|לא רוצה לענות|מעדיף שלא|מעדיפה שלא)(?: (?:בינתיים|כרגע|בבקשה|תודה))?[.!]*$/;
/** "אין לי עסק" / "לא רלוונטי" / a skip: the business question is passed without storing anything. */
const NO_BUSINESS = /^(?:לא|אין|אין לי(?: עסק| משרד)?|אין עסק|עוד אין|עדיין אין|עוד לא|עדיין לא|אין לי עדיין|לא רלוונטי)(?: (?:בינתיים|כרגע|תודה))?[.!]*$/;
const skipsBusiness = (text: string) => NO_BUSINESS.test(text) || SKIP.test(text) || SKIP.test(stripLeading(text));
const skipsName = (text: string) => SKIP.test(text) || SKIP.test(stripLeading(text));

/** A button / list reply of onboarding's own questions; any other reply (an agent list, …) is not an answer here. */
const ONBOARDING_REPLY = /^(?:onb:|pain_|mt_)/;

/** "קוראים לי דנה" / "שמי דנה" / "אני דנה" → "דנה". */
function nameFrom(text: string): string {
  return text.replace(/^(?:קוראים לי|שמי|השם שלי(?: הוא| זה)?|אני)\s+/, "").trim();
}

/** Typed answers to the "מה מעמיס" list: the rows they name ("המייל והיומן", "בעיקר מיילים"), or "done" ("זהו"). */
const PAIN_TOPICS: [string, RegExp][] = [
  ["pain_email", /מייל|דואר|תיבה|email|mail/i],
  ["pain_calendar", /יומן|פגיש|לו["״]?ז|תיאומ|calendar|meeting/i],
  ["pain_followup", /מעקב|תזכור|follow|remind/i],
  ["pain_files", /קבצ|קובץ|מסמכ|מסמך|דרייב|drive|files?/i],
];
const PAIN_ALL = /^(?:הכל|הכול|כולם|גם וגם|את כולם|הכל ביחד|הכול ביחד)[.!]*$/;
const PAIN_NONE = /^(?:זהו|זה הכל|זה הכול|מספיק|זהו מספיק|כלום|אין|שום דבר|סיימתי|לא|לא עוד|נמשיך|הלאה|דלג|לדלג)[.!]*$/;
export function painFromText(text: string): string[] | "done" | null {
  const t = text.trim().replace(/[,]/g, " ").replace(/\s+/g, " ");
  if (PAIN_NONE.test(t)) return "done";
  if (PAIN_ALL.test(stripLeading(t))) return lists.pain.rows.map((r) => r.id);
  const picks = PAIN_TOPICS.filter(([, re]) => re.test(t)).map(([id]) => id);
  return picks.length ? picks : null;
}

/** Typed answers to the morning-time list: "7:30", "שבע וחצי בבוקר", "בשמונה" → "HH:MM"; "לא צריך" → null; else undefined. */
const HOUR_WORDS: Record<string, number> = { חמש: 5, שש: 6, שבע: 7, שמונה: 8, תשע: 9, עשר: 10, "אחת עשרה": 11 };
const MORNING_NONE = /^(?:לא|לא עכשיו|לא צריך|אין צורך|בלי|בלי סיכום|לא תודה|לא רוצה|לא מעוניין|לא מעוניינת|אחר כך|לא משנה|דלג|לדלג|תדלג|תדלגי)(?: (?:תודה|כרגע|בינתיים))?[.!]*$/;
export function morningTimeFromText(text: string): string | null | undefined {
  const t = stripLeading(text).replace(/[.!]+$/, "").trim();
  if (MORNING_NONE.test(t)) return null;
  const m = t.match(/^(?:ב-?|בשעה |ל-?|סביב |בסביבות |בערך )?(?:(\d{1,2})(?:[:.](\d{2}))?|(רבע ל|עשרים ל)?(חמש|שש|שבע|שמונה|תשע|עשר|אחת עשרה)( וחצי| ורבע| ועשרים| ועשר)?)(?: בבוקר| בערך)?$/);
  if (!m) return undefined;
  let hour: number;
  let minute = 0;
  if (m[1]) {
    hour = Number(m[1]);
    minute = m[2] ? Number(m[2]) : 0;
  } else {
    hour = HOUR_WORDS[m[4]!]!;
    if (m[3]) {
      hour -= 1;
      minute = m[3] === "רבע ל" ? 45 : 40;
    }
    minute += ({ " וחצי": 30, " ורבע": 15, " ועשרים": 20, " ועשר": 10 } as Record<string, number>)[m[5] ?? ""] ?? 0;
  }
  if (hour < 5 || hour > 11 || minute > 59) return undefined;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

/**
 * Handles one message while onboarding is active. Returns `false` when the message should go to the
 * assistant instead (e.g. the first task), after advancing the state as needed.
 */
export async function handleOnboarding(ctx: BotContext, user: UserRow, msg: InboundMessage): Promise<boolean> {
  const state = onboardingOf(user);
  if (!state) return false;
  const to = msg.fromE164;
  const reply = msg.reply?.id ?? null;
  const text = (msg.text ?? "").trim();
  // a reply to someone else's buttons or list (an agent's template list, …) is not an answer to the open question
  if (reply && ASKING.includes(state.step) && !ONBOARDING_REPLY.test(reply)) return false;
  // "הג׳ימייל" / "לחבר את גוגל" while a question is open: a connect request (connect-intent), never a name
  if (!reply && text && ASKING.includes(state.step) && connectRequestProvider(text, await ctx.db.listConnections(user.id))) return false;

  switch (state.step) {
    case "welcome": {
      if (reply === "onb:tour") {
        await ctx.wa.sendText(to, copy["onb.ways_card"]());
        await ctx.wa.sendText(to, copy["onb.first_task"]());
        await setStep(ctx.db, user.id, { step: "first_task" });
        return true;
      }
      if (reply === "onb:start") {
        await ctx.wa.sendText(to, copy["onb.first_task"]());
        await setStep(ctx.db, user.id, { step: "first_task" });
        return true;
      }
      // any other message: treat it as the first task
      await setStep(ctx.db, user.id, { step: "first_task" });
      return false;
    }
    case "first_task": {
      // the assistant answers this one; afterwards we continue with the questions (see afterFirstTask)
      return false;
    }
    case "ask_name": {
      if (!text || msg.type !== "text" || NOT_A_NAME.test(text)) {
        await ctx.wa.sendText(to, copy["onb.ask_name"]());
        return true;
      }
      // "חיברתי" after a connect link: the question again, nothing stored
      if (isConnectAck(text)) {
        await ctx.wa.sendText(to, copy["onb.ask_name_again"]());
        return true;
      }
      if (skipsName(text)) {
        await ctx.wa.sendText(to, copy["onb.ask_business_again"]());
        await setStep(ctx.db, user.id, { step: "ask_business", repeat: undefined });
        return true;
      }
      // a request instead of a name: the assistant answers it, then the question comes again (afterFirstTask)
      if (await isRequestNow(ctx, user.id, state, text, "name")) return false;
      const name = (nameFrom(text) || text).slice(0, 60);
      await ctx.db.updateUserProfile(user.id, { name });
      await ctx.wa.sendText(to, copy["onb.ask_business"](name));
      await setStep(ctx.db, user.id, { step: "ask_business", repeat: undefined });
      return true;
    }
    case "ask_business": {
      const typed = msg.type === "text" ? text : "";
      if (typed && (NOT_A_NAME.test(typed) || isConnectAck(typed)) && !NO_BUSINESS.test(typed)) {
        await ctx.wa.sendText(to, copy["onb.ask_business_again"]());
        return true;
      }
      const skipped = skipsBusiness(typed);
      // a request instead of the business name ("תביא לי את המייל האחרון"): answered first, then the question again
      if (typed && !skipped && (await isRequestNow(ctx, user.id, state, typed, "business"))) return false;
      if (typed && !skipped) await ctx.db.updateUserProfile(user.id, { business_name: typed.slice(0, 120) });
      await sendPainList(ctx, to, []);
      await setStep(ctx.db, user.id, { step: "ask_pain", repeat: undefined });
      return true;
    }
    case "ask_pain": {
      // WhatsApp lists are single-choice, so the question repeats with what is left until "זהו" (or nothing is left).
      // A typed answer ("המייל והיומן שלי", "זהו") counts like the rows it names; a request is answered, then the list again.
      const chosen = painPointsOf(user);
      let picks: string[] = reply && reply.startsWith("pain_") && reply !== PAIN_DONE ? [reply] : [];
      let done = reply === PAIN_DONE;
      if (!reply && text) {
        const typed = painFromText(text);
        if (typed !== "done" && requestSignal(text, "list")) return false;
        if (typed === "done") done = true;
        else if (typed) picks = typed;
      }
      if (!picks.length && !done) {
        await sendPainList(ctx, to, chosen);
        return true;
      }
      const fresh = picks.filter((p) => !chosen.includes(p));
      const picked = [...chosen, ...fresh];
      if (picks.length) {
        if (fresh.length) await ctx.db.mergeUserProfile(user.id, { pain_point: picked[0], pain_points: picked });
        await ctx.wa.sendText(to, copy["onb.pain_ack"](fresh[0] ?? picks[0]!));
      }
      const left = lists.pain.rows.filter((r) => !picked.includes(r.id));
      if (!done && left.length) {
        await sendPainList(ctx, to, picked);
        return true;
      }
      await sendMorningList(ctx, to);
      await setStep(ctx.db, user.id, { step: "ask_morning_time" });
      return true;
    }
    case "ask_morning_time": {
      // a row, or a typed time ("שבע וחצי", "8:00") / "לא צריך"; a request is answered, then the list again
      let time: string | null | undefined = reply && reply in MORNING ? MORNING[reply] : undefined;
      if (!reply && text) {
        time = morningTimeFromText(text);
        if (time === undefined && requestSignal(text, "list")) return false;
      }
      if (time === undefined) {
        await sendMorningList(ctx, to);
        return true;
      }
      if (time) {
        await ctx.db.updateUserProfile(user.id, { morning_time: time });
        await ctx.db.mergeUserProfile(user.id, { morning_summary_enabled: true });
        await rescheduleMorningSummary(ctx.db, user.id, ctx.now());
        await ctx.wa.sendText(to, copy["onb.morning_time_ack"](time));
      } else {
        await ctx.db.mergeUserProfile(user.id, { morning_summary_enabled: false });
        await ctx.wa.sendText(to, copy["onb.morning_time_skip"]());
      }
      await afterMorningTime(ctx, user.id, to);
      return true;
    }
    case "connect": {
      if (reply === "onb:connect:microsoft" || reply === "onb:connect:google") {
        const provider = reply.endsWith("microsoft") ? "Microsoft 365" : "Google";
        const id = reply.endsWith("microsoft") ? "microsoft" : "google";
        // Google: one line before the "unverified app" screen (gmail.readonly rides along while under the user cap)
        const headsUp = await connectHeadsUpSuffix(ctx.db, await ctx.db.listConnections(user.id), id);
        await ctx.wa.sendText(to, copy["onb.connect_link"](provider, connectLinkFor(ctx, user.id, id)) + headsUp);
        await finish(ctx, user.id, to);
        return true;
      }
      if (reply === "onb:connect:later") {
        await ctx.wa.sendText(to, copy["onb.connect_skip"]());
        await finish(ctx, user.id, to);
        return true;
      }
      // free text during the nudge → finish onboarding and let the assistant answer
      await finish(ctx, user.id, to, false);
      return false;
    }
    default:
      return false;
  }
}

/**
 * Called after the assistant answered: after the first task, continue with the questions (skip name if known); after a
 * request that came instead of an answer (`requestSignal`) or a connect link, ask the open question again. When the
 * assistant itself answered the morning-time question (set_morning_time in that turn), onboarding moves on instead.
 */
export async function afterFirstTask(ctx: BotContext, user: UserRow, to: string, opts: { morningTimeSet?: boolean } = {}): Promise<void> {
  const state = onboardingOf(user);
  if (!state) return;
  if (state.step === "ask_name") return void (await ctx.wa.sendText(to, copy["onb.ask_name_again"]()));
  if (state.step === "ask_business") return void (await ctx.wa.sendText(to, copy["onb.ask_business_again"]()));
  if (state.step === "ask_pain") return void (await sendPainList(ctx, to, painPointsOf(user)));
  if (state.step === "ask_morning_time") return void (await (opts.morningTimeSet ? afterMorningTime(ctx, user.id, to) : sendMorningList(ctx, to)));
  if (state.step !== "first_task") return;
  if (user.name) {
    await ctx.wa.sendText(to, copy["onb.ask_business"](user.name));
    await setStep(ctx.db, user.id, { step: "ask_business", firstTaskDone: true });
  } else {
    await ctx.wa.sendText(to, copy["onb.ask_name"]());
    await setStep(ctx.db, user.id, { step: "ask_name", firstTaskDone: true });
  }
}

/**
 * Is this answer a request right now? A strong signal always; a weak one ("מי עדן", "24/7 שירותים") unless the same
 * text was already taken as a request at this question — sent twice in a row, it is the answer.
 */
async function isRequestNow(ctx: BotContext, userId: string, state: OnboardingState, text: string, field: "name" | "business"): Promise<boolean> {
  const signal = requestSignal(text, field);
  if (signal === "strong") return true;
  if (signal === null || state.repeat === text) return false;
  await setStep(ctx.db, userId, { step: state.step, repeat: text });
  return true;
}

async function sendMorningList(ctx: BotContext, to: string): Promise<void> {
  await ctx.wa.sendList(to, copy["onb.ask_morning_time"](), lists.morningTime.button, [{ title: lists.morningTime.title, rows: lists.morningTime.rows }]);
}

/** After the morning time: the connect nudge, or done when an account is connected already. */
async function afterMorningTime(ctx: BotContext, userId: string, to: string): Promise<void> {
  const connected = (await ctx.db.listConnections(userId)).some((c) => c.status === "active");
  if (connected) {
    await finish(ctx, userId, to);
  } else {
    await ctx.wa.sendButtons(to, copy["onb.connect_nudge"](), buttons.connect);
    await setStep(ctx.db, userId, { step: "connect" });
  }
}

async function finish(ctx: BotContext, userId: string, to: string, sayDone = true): Promise<void> {
  await setStep(ctx.db, userId, { step: "done" });
  if (sayDone) await ctx.wa.sendText(to, copy["onb.done"]());
}
