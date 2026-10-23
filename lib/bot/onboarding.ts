import { PRODUCT_NAME } from "@/lib/brand";
import { copy, buttons, lists } from "@/lib/copy/bot";
import type { Db, UserRow } from "@/lib/db/types";
import { connectHeadsUpSuffix } from "@/lib/google/user-cap";
import { rescheduleMorningSummary } from "@/lib/jobs/morning-summary";
import type { InboundMessage } from "@/lib/wa/types";
import { connectRequestProvider } from "./connect-intent";
import { connectLinkFor, type BotContext } from "./context";

/**
 * First-contact state machine (PLAN §1), persisted in users.profile.onboarding:
 *   welcome → (סיור) ways_card → first_task → ask_name → ask_business → ask_pain → ask_morning_time → connect → done
 *   welcome → (נתחיל לעבוד) first_task → … (same tail)
 * Every step is one message; free text while a question is open is taken as the answer — unless it looks like a
 * request (`looksLikeRequest`): then the assistant answers it and the question is asked again.
 */
export type OnboardingStep = "welcome" | "first_task" | "ask_name" | "ask_business" | "ask_pain" | "ask_morning_time" | "connect" | "done";

export interface OnboardingState {
  step: OnboardingStep;
  startedAt: string;
  /** the first task message was answered by the assistant already */
  firstTaskDone?: boolean;
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
 * Matched with startsWith, so one stem covers the masculine, feminine and plural forms.
 */
const REQUEST_STEMS = [
  "תזכיר", "תנסח", "תכתוב", "תכתב", "תשלח", "תבדוק", "תבדק", "תקבע", "תמצא", "תמצי", "תעש", "תגיד", "תראה", "תראי", "תסכם", "תעדכן", "תבטל",
  "תוסיף", "תזיז", "תחפש", "תכין", "תכינ", "תעזור", "תעזר", "תפתח", "תקרא", "תקרי", "תענה", "תעני", "תזמן", "תביא", "תסדר", "תתאם", "תחבר",
  "תשדרג", "תיצור", "תיצר", "תצור", "תצרי", "תסביר", "תספר", "תעביר", "תמחק", "תשמור", "תרשום", "תרשמ", "תדחה", "תדחי", "תחזיר", "תוריד", "תציג",
];
/** Infinitives that open a request ("לחבר את המייל", "לשדרג למנוי פרו") — whole first words, so "לוי" or "לאה" pass. */
const REQUEST_INFINITIVES = new Set([
  "לחבר", "לשדרג", "ליצור", "לבטל", "לקבוע", "לשלוח", "לבדוק", "לנסח", "לכתוב", "להזכיר", "לסכם", "להביא", "להראות", "לחפש", "למצוא", "לעדכן",
  "להוסיף", "להזיז", "לתאם", "לפתוח", "לקרוא", "לענות", "לתזמן", "להעביר", "למחוק", "להציג", "לסדר",
]);
/** First words of a question or a request (imperatives included: "שלח", "בדקי", "תן"). */
const REQUEST_WORDS = new Set([
  "מה", "מתי", "איפה", "איך", "למה", "כמה", "האם", "מי", "איזה", "איזו", "אילו", "יש", "אין", "אפשר", "צריך", "צריכה", "רוצה", "בבקשה", "אשמח",
  "תוכל", "תוכלי", "נא", "בוא", "בואי", "תן", "תני", "שלחי", "כתבי", "נסחי", "קבעי", "הזכירי", "סכמי", "בדקי", "חפשי", "מצאי", "הביאי", "הראי",
  "שלח", "כתוב", "נסח", "קבע", "הזכר", "סכם", "בדוק", "חפש", "מצא", "הבא", "הראה", "מחר", "היום",
]);
/** "אני צריכה…", "אתה יכול…": a pronoun followed by a wish or an ability is a request (unlike "אני דנה"). */
const PRONOUNS = new Set(["אני", "אתה", "את", "אנחנו", "אתם"]);
const WISH_WORDS = new Set(["צריך", "צריכה", "צריכים", "רוצה", "רוצים", "מבקש", "מבקשת", "מחפש", "מחפשת", "יכול", "יכולה", "יכולים", "תוכל", "תוכלי", "חייב", "חייבת"]);
/** What follows a second-person verb in a request: "תעבירי לי…", "תסדר את…". */
const REQUEST_OBJECTS = new Set(["לי", "לנו", "את", "אותי", "אותו", "אותה"]);
/** Greetings and the assistant's name before the request ("היי, תביאי לי…") are skipped. */
const LEADING_GREETING = new RegExp(`^(?:(?:היי|הי|שלום|אהלן|בוקר טוב|ערב טוב|צהריים טובים|${PRODUCT_NAME})[\\s,.!:-]+)+`);

/**
 * An answer to an onboarding question that is really a request for the assistant (the first thing many people do is
 * ask for something): a question, a request word or an imperative first, a second-person verb followed by "לי"/"את",
 * a pronoun with "צריך"/"יכול", digits in a name, or too many words. Such an answer is never stored; the assistant
 * answers it and the question is asked again (afterFirstTask). `list`: free text while a WhatsApp list is open (the
 * answer is a tap), where three words or more are a request as well.
 */
export function looksLikeRequest(text: string, field: "name" | "business" | "list"): boolean {
  const t = text.trim().replace(LEADING_GREETING, "").trim();
  if (!t) return false;
  if (/[?？]/.test(t)) return true;
  const words = t.split(/\s+/).map((w) => w.replace(/^[״"'׳(]+|[,.!:;״"'׳)]+$/g, ""));
  const [first = "", second = ""] = words;
  if (REQUEST_WORDS.has(first) || REQUEST_INFINITIVES.has(first) || REQUEST_STEMS.some((stem) => first.startsWith(stem))) return true;
  if (PRONOUNS.has(first) && WISH_WORDS.has(second)) return true;
  if (first.length >= 3 && first.startsWith("ת") && REQUEST_OBJECTS.has(second)) return true;
  if (field === "name") return /\d/.test(t) || words.length > 4 || t.length > 40;
  if (field === "list") return words.length >= 3 || t.length > 40;
  return words.length > 8 || t.length > 80;
}

/** Replies that are not a name (a thank-you, an OK): the name question is simply asked again. */
const NOT_A_NAME = /^(?:תודה(?: רבה)?|אוקי+|אוקיי+|סבבה|בסדר|היי|הי|שלום|כן|לא|יופי|מעולה|ok|okay|thanks)[.!]*$/i;

/** "אין לי עסק" / "לא רלוונטי": the business question is passed without storing anything. */
const NO_BUSINESS = /^(?:לא|אין|אין לי(?: עסק| משרד)?|אין עסק|לא רלוונטי|דלג|לדלג)[.!]*$/;

/** A button / list reply of onboarding's own questions; any other reply (an agent list, …) is not an answer here. */
const ONBOARDING_REPLY = /^(?:onb:|pain_|mt_)/;

/** "קוראים לי דנה" / "שמי דנה" / "אני דנה" → "דנה". */
function nameFrom(text: string): string {
  return text.replace(/^(?:קוראים לי|שמי|השם שלי(?: הוא| זה)?|אני)\s+/, "").trim();
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
      // a request instead of a name: the assistant answers it, then the question comes again (afterFirstTask)
      if (looksLikeRequest(text, "name")) return false;
      const name = (nameFrom(text) || text).slice(0, 60);
      await ctx.db.updateUserProfile(user.id, { name });
      await ctx.wa.sendText(to, copy["onb.ask_business"](name));
      await setStep(ctx.db, user.id, { step: "ask_business" });
      return true;
    }
    case "ask_business": {
      const typed = msg.type === "text" ? text : "";
      const skipped = NO_BUSINESS.test(typed);
      // a request instead of the business name ("תביא לי את המייל האחרון"): answered first, then the question again
      if (typed && !skipped && looksLikeRequest(typed, "business")) return false;
      if (typed && !skipped && NOT_A_NAME.test(typed)) {
        await ctx.wa.sendText(to, copy["onb.ask_business_again"]());
        return true;
      }
      if (typed && !skipped) await ctx.db.updateUserProfile(user.id, { business_name: typed.slice(0, 120) });
      await sendPainList(ctx, to, []);
      await setStep(ctx.db, user.id, { step: "ask_pain" });
      return true;
    }
    case "ask_pain": {
      // WhatsApp lists are single-choice, so the question repeats with what is left until "זהו" (or nothing is left)
      const chosen = painPointsOf(user);
      const pain = reply && reply.startsWith("pain_") && reply !== PAIN_DONE ? reply : null;
      if (!reply && looksLikeRequest(text, "list")) return false; // a request: answered, then the list again
      if (!pain && reply !== PAIN_DONE) {
        await sendPainList(ctx, to, chosen);
        return true;
      }
      const picked = pain && !chosen.includes(pain) ? [...chosen, pain] : chosen;
      if (pain) {
        await ctx.db.mergeUserProfile(user.id, { pain_point: picked[0], pain_points: picked });
        await ctx.wa.sendText(to, copy["onb.pain_ack"](pain));
      }
      const left = lists.pain.rows.filter((r) => !picked.includes(r.id));
      if (reply !== PAIN_DONE && left.length) {
        await sendPainList(ctx, to, picked);
        return true;
      }
      await ctx.wa.sendList(to, copy["onb.ask_morning_time"](), lists.morningTime.button, [{ title: lists.morningTime.title, rows: lists.morningTime.rows }]);
      await setStep(ctx.db, user.id, { step: "ask_morning_time" });
      return true;
    }
    case "ask_morning_time": {
      if (!reply && looksLikeRequest(text, "list")) return false; // a request: answered, then the list again
      if (!reply || !(reply in MORNING)) {
        await ctx.wa.sendList(to, copy["onb.ask_morning_time"](), lists.morningTime.button, [{ title: lists.morningTime.title, rows: lists.morningTime.rows }]);
        return true;
      }
      const time = MORNING[reply];
      if (time) {
        await ctx.db.updateUserProfile(user.id, { morning_time: time });
        await ctx.db.mergeUserProfile(user.id, { morning_summary_enabled: true });
        await rescheduleMorningSummary(ctx.db, user.id, ctx.now());
        await ctx.wa.sendText(to, copy["onb.morning_time_ack"](time));
      } else {
        await ctx.db.mergeUserProfile(user.id, { morning_summary_enabled: false });
        await ctx.wa.sendText(to, copy["onb.morning_time_skip"]());
      }
      const connected = (await ctx.db.listConnections(user.id)).some((c) => c.status === "active");
      if (connected) {
        await finish(ctx, user.id, to);
      } else {
        await ctx.wa.sendButtons(to, copy["onb.connect_nudge"](), buttons.connect);
        await setStep(ctx.db, user.id, { step: "connect" });
      }
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
 * request that came instead of an answer (`looksLikeRequest`), ask the open question again.
 */
export async function afterFirstTask(ctx: BotContext, user: UserRow, to: string): Promise<void> {
  const state = onboardingOf(user);
  if (!state) return;
  if (state.step === "ask_name") return void (await ctx.wa.sendText(to, copy["onb.ask_name_again"]()));
  if (state.step === "ask_business") return void (await ctx.wa.sendText(to, copy["onb.ask_business_again"]()));
  if (state.step === "ask_pain") return void (await sendPainList(ctx, to, painPointsOf(user)));
  if (state.step === "ask_morning_time") return void (await ctx.wa.sendList(to, copy["onb.ask_morning_time"](), lists.morningTime.button, [{ title: lists.morningTime.title, rows: lists.morningTime.rows }]));
  if (state.step !== "first_task") return;
  if (user.name) {
    await ctx.wa.sendText(to, copy["onb.ask_business"](user.name));
    await setStep(ctx.db, user.id, { step: "ask_business", firstTaskDone: true });
  } else {
    await ctx.wa.sendText(to, copy["onb.ask_name"]());
    await setStep(ctx.db, user.id, { step: "ask_name", firstTaskDone: true });
  }
}

async function finish(ctx: BotContext, userId: string, to: string, sayDone = true): Promise<void> {
  await setStep(ctx.db, userId, { step: "done" });
  if (sayDone) await ctx.wa.sendText(to, copy["onb.done"]());
}
