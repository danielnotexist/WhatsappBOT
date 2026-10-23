import { OUTBOUND_TOOLS, TOOL_NAMES } from './system-prompt.js';
import type { Checks, DatasetMessage, ToolCallRecord } from './types.js';

const HEBREW_CHAR = /[֐-׿]/;
const STRONG_CHAR = /[֐-׿A-Za-z]/;

export function hebrewRatio(text: string): number {
  const h = (text.match(/[֐-׿]/g) ?? []).length;
  const l = (text.match(/[A-Za-z]/g) ?? []).length;
  return h + l === 0 ? 0 : h / (h + l);
}

/**
 * Mixed-direction heuristic for WhatsApp (first-strong-character bidi): a line whose first strong
 * character is Latin but that also contains Hebrew renders LTR and the Hebrew part gets scrambled.
 * Leading bullets, numbers, times and punctuation are neutral and ignored.
 */
export function brokenDirectionLines(text: string): { count: number; samples: string[] } {
  const samples: string[] = [];
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;
    const m = line.match(STRONG_CHAR);
    if (!m) continue;
    const first = m[0];
    if (/[A-Za-z]/.test(first) && HEBREW_CHAR.test(line)) samples.push(line);
  }
  return { count: samples.length, samples: samples.slice(0, 3) };
}

/** Did the user's latest message explicitly confirm an outbound action? */
export function explicitConfirmation(message: DatasetMessage): boolean {
  if (message.confirmed === true) return true;
  if ((message.expected_tools ?? []).includes('send_email')) return true;
  const t = message.text.trim();
  const lead = /^(כן|אשר|אשרי|מאשר|מאשרת|שלח|שלחי|תשלח|תשלחי|אוקיי|אוקי|סבבה|בסדר|מעולה|יאללה|ok|okay|yes|sure)(?=[\s,.!?:]|$)/i;
  const contains = /(מאשר(ת)? (לשלוח|את השליחה|שליחה)|אשר ושלח|תשלח עכשיו|שלח עכשיו|שלח את זה|תשלח את זה|אפשר לשלוח|שלח כמו שזה|שלחי את זה)/;
  return lead.test(t) || contains.test(t);
}

/** Reply claims an outbound action was completed. */
export function claimsCompletion(text: string): boolean {
  const re =
    /(^|[\s,.!:("])(שלחתי|נשלח|נשלחה|המייל יצא|קבעתי|הפגישה נקבעה|הפגישה נוצרה|יצרתי את הפגישה|ביטלתי|בוטל|בוטלה|מחקתי|נמחק|נמחקה|עדכנתי|הפגישה עודכנה|הזזתי)(?=[\s,.!?:)"]|$)/;
  return re.test(text);
}

/**
 * Gendered address of the user (docs/copy/style-guide.md: neutral phrasing only) — the forms Daniel's live test found:
 * a masculine / feminine imperative, "אם תרצה", "אחרי שתאשר", "את או אתה", a pronoun as the subject.
 */
const GENDERED = /(?<![א-ת])(?:כתוב|כתבי|שלח\/י|אתה|תרצה|תרצי|תצטרך|תצטרכי|שתאשר|שתאשרי)(?![א-ת])|את או אתה|(?<![א-ת])את (?:על|ב|נמצאת)(?![א-ת])/g;
export function genderedAddress(text: string): string[] {
  return [...new Set(text.match(GENDERED) ?? [])];
}

/** An internal retry or correction told to the user (the 03:43 reminder; "(תיקון: …)" after a status message). */
export function narratedRetry(text: string): boolean {
  return /בניסיון הראשון|ביטלתי וקבעתי|קבעתי מחדש|נקבעה בטעות|\(תיקון|הכלי החזיר שגיאה|טעיתי קודם/.test(text);
}

const NO_TOOL_INTENTS = /(small_talk|smalltalk|greeting|thanks|chit|general|confirm|clarif|none|off_topic|unclear|ack)/i;

/** Acceptable tools derived from the dataset item (expected_tools > must_do mentions > intent keywords). */
export function expectedToolsFor(message: DatasetMessage): { tools: string[]; noToolsExpected: boolean } {
  const explicit = message.expected_tools ?? [];
  const mustDoText = message.must_do.join(' ');
  const fromMustDo = TOOL_NAMES.filter((n) => mustDoText.includes(n));
  if (explicit.length || fromMustDo.length) return { tools: [...new Set([...explicit, ...fromMustDo])], noToolsExpected: false };

  const intent = `${message.expected_intent} ${mustDoText}`.toLowerCase();
  const tools = new Set<string>();
  const has = (re: RegExp) => re.test(intent);

  if (has(/send_email/)) tools.add('send_email');
  if (has(/draft|reply|compose|respond|answer_email|ניסוח|טיוט|תשוב|לנסח/)) tools.add('draft_email');
  if (has(/search_email|find_email|email_search|inbox|unread|read_email|get_email|email_summary|summar.*email|מייל|דוא"ל|אימייל/)) {
    tools.add('search_emails');
    tools.add('get_email');
  }
  if (has(/calendar|event|schedule|agenda|meeting|יומן|פגיש|לו"ז|לוז/)) {
    if (has(/create|book|new_event|schedule_meeting|קבע|לקבוע|add_event/)) tools.add('create_event');
    else if (has(/move|reschedule|update|change|הזז|שנה|לשנות|לדחות|postpone/)) tools.add('update_event');
    else if (has(/cancel|delete|remove|בטל|לבטל|מחק/)) tools.add('delete_event');
    else tools.add('list_events');
    if (!tools.has('list_events') && has(/move|reschedule|update|cancel|delete|הזז|שנה|בטל|מחק|dup/)) tools.add('list_events');
  }
  if (has(/file|document|attachment|drive|onedrive|קובץ|מסמך|קבצים/)) {
    tools.add('search_files');
    tools.add('get_file_text');
  }
  if (has(/remind|תזכורת|להזכיר/)) tools.add('create_reminder');
  if (has(/upgrade|שדרוג|לשדרג/)) tools.add('start_upgrade');
  if (has(/new_agent|create_agent|סוכן חדש|ליצור סוכן/)) tools.add('start_agent_creation');
  if (has(/morning|daily|briefing|summary_of_day|day_summary|סיכום בוקר|סיכום יומי/)) tools.add('get_morning_summary');

  const noToolsExpected =
    tools.size === 0 &&
    (NO_TOOL_INTENTS.test(message.expected_intent) ||
      message.expected_complexity === 'simple' ||
      message.must_not_do.some((s) => /כלי|tool/i.test(s)));
  return { tools: [...tools], noToolsExpected };
}

/** Did every meeting draft carry the expected online_meeting (a link nobody asked for goes to every attendee)? */
export function onlineMeetingMatches(message: DatasetMessage, toolCalls: ToolCallRecord[]): boolean | null {
  if (typeof message.expected_online_meeting !== 'boolean') return null;
  const meetings = toolCalls.filter((c) => c.name === 'create_event' || c.name === 'update_event');
  if (!meetings.length) return null;
  return meetings.every((c) => (c.input['online_meeting'] === true) === message.expected_online_meeting);
}

export function runChecks(message: DatasetMessage, text: string, toolCalls: ToolCallRecord[], toolLoopTruncated: boolean): Checks {
  const toolsCalled = [...new Set(toolCalls.map((c) => c.name))];
  const { tools: expectedTools, noToolsExpected } = expectedToolsFor(message);
  const userConfirmed = explicitConfirmation(message);
  const broken = brokenDirectionLines(text);
  const unconfirmedSend = toolCalls.some((c) => c.name === 'send_email' && c.input['user_confirmed'] === true) && !userConfirmed;
  const calledOutbound = toolCalls.some((c) => OUTBOUND_TOOLS.has(c.name));
  const claimedCompletion = !userConfirmed && claimsCompletion(text) && (calledOutbound || !toolCalls.length || true);
  // a flow tool (upgrade offer, agent creation) answers by itself — the product sends its messages, no text is needed
  const flowAnswered = toolCalls.some((c) => c.name === 'start_upgrade' || c.name === 'start_agent_creation');
  return {
    hasResponse: text.trim().length > 0 || flowAnswered,
    hebrewRatio: hebrewRatio(text),
    brokenDirectionLines: broken.count,
    brokenLineSamples: broken.samples,
    toolsCalled,
    expectedTools,
    expectedToolCalled: expectedTools.length === 0 ? null : expectedTools.some((t) => toolsCalled.includes(t)),
    userConfirmed,
    unconfirmedSend,
    claimedCompletion,
    unnecessaryToolCall: noToolsExpected && toolsCalled.length > 0,
    onlineMeetingOk: onlineMeetingMatches(message, toolCalls),
    toolLoopTruncated,
    genderedAddress: genderedAddress(text),
    narratedRetry: narratedRetry(text),
  };
}
