import { BRAND } from "@/lib/brand";

/**
 * The website support chat ("שאלות ותמיכה") — what the widget (components/brand/support-chat.tsx) and the two routes
 * (app/api/support/chat, app/api/support/ticket) share. Client-safe: constants and types only.
 * Copy: docs/copy/support-chat.md. Voice: docs/copy/style-guide.md (עלזה in the feminine, the reader addressed
 * neutrally, the short hyphen only on the site).
 */

export const SUPPORT_LIMITS = {
  /** one question */
  messageChars: 500,
  /** the earlier messages the page sends with a question (user and assistant together) */
  historyTurns: 6,
  /** one earlier message (an answer can be longer than a question) */
  historyChars: 1200,
  ticket: {
    name: 80,
    email: 254,
    subject: 120,
    body: 4000,
    /** the chat attached to a ticket: the last messages only */
    transcriptTurns: 20,
  },
} as const;

/** Per IP (lib/rate-limit, best effort per instance). */
export const SUPPORT_RATE = {
  chatPerMinute: 10,
  chatPerDay: 60,
  ticketPerHour: 5,
  ticketPerDay: 20,
} as const;

export type SupportRole = "user" | "assistant";
export interface SupportTurn {
  role: SupportRole;
  text: string;
}

export interface SupportChatResponse {
  ok: true;
  answer: string;
  /** offer "פתיחת פנייה" under the answer (no answer in the knowledge base, or a question about the person's account) */
  ticket: boolean;
  /** chips to show under the answer (the topics, when the question was not understood) */
  suggestions: string[];
  /** "ai": the model answered from the knowledge base; "kb": the deterministic matcher */
  source: "ai" | "kb";
  /** the knowledge-base entry the matcher chose (kb only) */
  topic: string | null;
}

export interface SupportTicketResponse {
  ok: true;
}

/** GET /api/support/ticket: the signed-in person's email for the form, or null. */
export interface SupportTicketPrefill {
  ok: true;
  email: string | null;
}

export type SupportTicketField = "name" | "email" | "subject" | "body";

export interface SupportErrorResponse {
  ok: false;
  code: "bad_request" | "too_long" | "invalid" | "forbidden" | "rate_limited" | "server_error";
  message: string;
  /** the ticket form: a Hebrew line per field that did not pass */
  fields?: Partial<Record<SupportTicketField, string>>;
}

/** The topic chips under the greeting — each one is a knowledge-base question (lib/support/knowledge.ts). */
export const SUPPORT_SUGGESTIONS = [`מה ${BRAND.name} עושה?`, "כמה זה עולה?", "איך מתחברים?", "האם המידע שלי מאובטח?"] as const;

export const SUPPORT_COPY = {
  launcher: "שאלות ותמיכה",
  title: "שאלות ותמיכה",
  subtitle: `${BRAND.name} עונה כאן על שאלות על השירות`,
  greeting: `שלום, אני ${BRAND.name}. אפשר לשאול אותי כאן על השירות: מה אני עושה, כמה זה עולה ואיך מתחילים. לשאלה על חשבון קיים אפשר לפתוח פנייה.`,
  fallback: "לא בטוחה שהבנתי - אפשר לבחור נושא או לפתוח פנייה.",
  inputLabel: "שאלה",
  inputPlaceholder: "שאלה על השירות",
  send: "שליחה",
  close: "סגירה",
  openTicket: "פתיחת פנייה",
  ticketTitle: "פתיחת פנייה",
  ticketLead: "מתארים מה קרה או מה חסר, ונחזור במייל.",
  ticketDone: "הפנייה התקבלה. נחזור אליך במייל תוך יום עסקים.",
  backToChat: "חזרה לשיחה",
  submitTicket: "שליחת הפנייה",
  attachChat: "לצרף לפנייה את השיחה מכאן",
  typing: `${BRAND.name} מקלידה`,
  network: "אין חיבור כרגע. אפשר לנסות שוב.",
  tooLong: `השאלה ארוכה מדי. אפשר עד ${SUPPORT_LIMITS.messageChars} תווים.`,
} as const;
