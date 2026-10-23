import type { DatasetMessage, EvalContext } from './types.js';
import type { ToolDef } from './providers/types.js';

import { PRODUCT_SYSTEM_PROMPT_DAY, PRODUCT_SYSTEM_PROMPT_SMALL_HOURS, PRODUCT_TOOLS } from './product-prompt.generated.js';

/**
 * The assistant's system prompt is the PRODUCT's (lib/ai/system-prompt.ts), rendered for the dataset's user and clock
 * into product-prompt.generated.ts by the root test lib/ai/eval-prompt-sync.test.ts — so a run measures what users get
 * (neutral addressing, the plans and the account tools, "מחר" after midnight). The M0 run (20.10.2026) used an older,
 * masculine prompt of its own; its report stays in docs/hebrew-eval-report.md.
 */
export const BASE_SYSTEM_PROMPT = PRODUCT_SYSTEM_PROMPT_DAY;

const SKIP_PROFILE_KEYS = new Set(['persona', 'gender', 'name', 'business', 'type', 'email', 'morning_time', 'plan', 'free_messages_remaining', 'connected', 'title']);

function profileLines(profile: Record<string, unknown>): string {
  const labels: Record<string, string> = {
    name: 'שם',
    business_name: 'שם העסק',
    business_type: 'תחום',
    timezone: 'אזור זמן',
    morning_time: 'שעת סיכום בוקר',
    important_contacts: 'אנשי קשר חשובים',
    preferences: 'העדפות',
    locale: 'שפה',
    email: 'כתובת מייל',
  };
  const lines: string[] = [];
  for (const [k, v] of Object.entries(profile)) {
    if (v === undefined || v === null || v === '') continue;
    // in the product sections already — or never known to the product (gender: the product addresses everyone neutrally)
    if (SKIP_PROFILE_KEYS.has(k) || k.startsWith('_')) continue;
    const label = labels[k] ?? k;
    const val = Array.isArray(v) ? v.map(String).join('; ') : typeof v === 'object' ? JSON.stringify(v) : String(v);
    lines.push(`- ${label}: ${val}`);
  }
  return lines.length ? lines.join('\n') : '- (אין פרופיל)';
}

export function todayOf(context: EvalContext): string {
  const t = context.today ?? (context.profile['today'] as string | undefined);
  return typeof t === 'string' && t ? t : new Date().toISOString().slice(0, 10);
}

/**
 * The system prompt for one message: the product prompt at the dataset's "now" (or 03:43 the same night for
 * `small_hours` messages), plus the dataset profile's details the mocked mailbox and calendar refer to.
 */
export function buildSystemPrompt(context: EvalContext, message?: Pick<DatasetMessage, 'small_hours'>): string {
  return `${message?.small_hours ? PRODUCT_SYSTEM_PROMPT_SMALL_HOURS : PRODUCT_SYSTEM_PROMPT_DAY}

## פרטים נוספים מהפרופיל (נתוני הבדיקה)
${profileLines(context.profile)}`;
}

/** Outbound tools — in production each one creates a pending_action that needs a button press. */
export const OUTBOUND_TOOLS = new Set(['send_email', 'create_event', 'update_event', 'delete_event']);

/** Tools that read data only. */
export const READ_TOOLS = new Set([
  'search_emails',
  'get_email',
  'list_events',
  'search_files',
  'get_file_text',
  'get_morning_summary',
]);

const str = (description: string) => ({ type: 'string', description }) as const;
const int = (description: string) => ({ type: 'integer', description }) as const;

/**
 * Tool definitions (JSON Schema). Every property is required and additionalProperties=false so the same
 * schema works with Anthropic strict mode, OpenAI function calling and Gemini function declarations.
 * "" / 0 mean "not specified".
 */
export const TOOL_DEFS: ToolDef[] = [
  {
    name: 'search_emails',
    description:
      'Search the user\'s mailbox (subject, sender, body) by keywords. Returns up to `limit` matches with id, from, subject, date and a short snippet. Use before answering any question about emails.',
    input_schema: {
      type: 'object',
      properties: {
        query: str('Keywords to search for (Hebrew or English). Use the most specific words from the user\'s request, e.g. a person name or a subject.'),
        limit: int('Maximum number of results (1-10). Use 5 unless the user asks for more.'),
      },
      required: ['query', 'limit'],
      additionalProperties: false,
    },
  },
  {
    name: 'get_email',
    description: 'Fetch one email in full (from, to, subject, date, body) by its id from search_emails.',
    input_schema: {
      type: 'object',
      properties: { id: str('Email id as returned by search_emails.') },
      required: ['id'],
      additionalProperties: false,
    },
  },
  {
    name: 'draft_email',
    description:
      'Create an email draft. Does NOT send anything. After calling it, show the draft (to, subject, body) to the user and ask for confirmation; the system shows send / edit / cancel buttons.',
    input_schema: {
      type: 'object',
      properties: {
        to: str('Recipient email address or name.'),
        subject: str('Email subject in the user\'s language.'),
        body: str('Full email body, professional tone, in the user\'s language.'),
        reply_to_id: str('Id of the email being replied to, or "" for a new email.'),
      },
      required: ['to', 'subject', 'body', 'reply_to_id'],
      additionalProperties: false,
    },
  },
  {
    name: 'send_email',
    description:
      'Send a previously created draft. REQUIRES explicit confirmation from the user in their latest message (e.g. "שלח", "כן, שלח", "מאשרת"). Never call it with user_confirmed=true unless the user explicitly confirmed sending THIS draft. A request like "write and send" is not a confirmation.',
    input_schema: {
      type: 'object',
      properties: {
        draft_id: str('Draft id returned by draft_email.'),
        user_confirmed: { type: 'boolean', description: 'true only if the user explicitly confirmed sending in their latest message.' },
      },
      required: ['draft_id', 'user_confirmed'],
      additionalProperties: false,
    },
  },
  {
    name: 'list_events',
    description: 'List calendar events between two dates (inclusive). Returns id, title, start, end, location, attendees.',
    input_schema: {
      type: 'object',
      properties: {
        from: str('Start date, ISO format YYYY-MM-DD. "" = today.'),
        to: str('End date, ISO format YYYY-MM-DD. "" = same as from.'),
      },
      required: ['from', 'to'],
      additionalProperties: false,
    },
  },
  {
    name: 'create_event',
    description:
      'Create a calendar event as a PENDING action — the user must confirm it with a button. After calling, present the details and ask for confirmation. Do not say the meeting was scheduled.',
    input_schema: {
      type: 'object',
      properties: {
        title: str('Event title.'),
        start: str('Start, ISO 8601 date-time with timezone (e.g. 2026-10-21T10:00:00+03:00).'),
        end: str('End, ISO 8601 date-time. "" = start + 1 hour.'),
        location: str('Location or "" if unknown.'),
        attendees: str('Comma-separated attendee names/emails, or "".'),
        online_meeting: {
          type: 'boolean',
          description:
            'true when the user asks for an online meeting (Teams/טימס, Meet/מיט, Zoom/זום, video/וידאו, "אונליין", "קישור לפגישה") or says plainly that it is remote ("נדבר מרחוק"); the Teams link is created and sent with the invitation. false for an in-person meeting, for "שיחה" alone (usually a phone call) and when unclear. An attendee in another city or abroad is not a request: ask one short question first.',
        },
      },
      required: ['title', 'start', 'end', 'location', 'attendees', 'online_meeting'],
      additionalProperties: false,
    },
  },
  {
    name: 'update_event',
    description: 'Move or edit an existing event as a PENDING action (needs user confirmation). Fields left as "" are unchanged.',
    input_schema: {
      type: 'object',
      properties: {
        event_id: str('Event id from list_events.'),
        title: str('New title or "".'),
        start: str('New start (ISO 8601) or "".'),
        end: str('New end (ISO 8601) or "".'),
        online_meeting: {
          type: 'boolean',
          description: 'true only when the user asks to add a Teams link to a meeting that has none. Moving or editing an existing online meeting: false.',
        },
      },
      required: ['event_id', 'title', 'start', 'end', 'online_meeting'],
      additionalProperties: false,
    },
  },
  {
    name: 'delete_event',
    description: 'Cancel an event as a PENDING action (needs user confirmation).',
    input_schema: {
      type: 'object',
      properties: { event_id: str('Event id from list_events.') },
      required: ['event_id'],
      additionalProperties: false,
    },
  },
  {
    name: 'search_files',
    description: 'Search the user\'s files (OneDrive/Drive) by keywords in the file name or content. Returns id, name, modified date and a snippet.',
    input_schema: {
      type: 'object',
      properties: {
        query: str('Keywords to search for.'),
        limit: int('Maximum number of results (1-10).'),
      },
      required: ['query', 'limit'],
      additionalProperties: false,
    },
  },
  {
    name: 'get_file_text',
    description: 'Get the extracted text of a file (Word/Excel/PowerPoint/PDF) by id from search_files.',
    input_schema: {
      type: 'object',
      properties: { id: str('File id from search_files.') },
      required: ['id'],
      additionalProperties: false,
    },
  },
  {
    name: 'get_morning_summary',
    description: 'Compile the morning summary for a date: today\'s events, unread emails and open reminders. Use when the user asks for a daily summary / "what is on my plate".',
    input_schema: {
      type: 'object',
      properties: { date: str('Date, ISO YYYY-MM-DD. "" = today.') },
      required: ['date'],
      additionalProperties: false,
    },
  },
  // the product's own definitions: start_upgrade, start_agent_creation, create_reminder (the phrase as said)
  ...(PRODUCT_TOOLS as ToolDef[]),
];

export const TOOL_NAMES = TOOL_DEFS.map((t) => t.name);
