import { makeHarness } from "@/lib/bot/test-harness";
import type { MorningDeps } from "@/lib/jobs/morning-summary";
import { createGoogleFixture } from "@/lib/google/__fixtures__/google-fixtures";
import { GoogleClient } from "@/lib/google/client";
import { createGraphFixture, fixtureGraphMessage, type FixtureGraphEvent } from "@/lib/ms/__fixtures__/graph-fixtures";
import { GraphClient } from "@/lib/ms/graph";
import { MS_SCOPES_V1 } from "@/lib/ms/oauth";
import { zonedToUtc } from "@/lib/time/zoned";

/** Israel wall clock → instant (October 2026 unless the month is given). */
export const il = (day: number, hour: number, minute = 0, month = 10) => zonedToUtc({ year: 2026, month, day, hour, minute }, "Asia/Jerusalem");

const person = (name: string, address: string) => ({ emailAddress: { name, address } });

/**
 * Dana's Microsoft 365 mailbox for the proactive tests, on top of the Graph fixture (its two messages and two meetings
 * on Wednesday 21.10.2026 stay):
 *   AAMkW1   רונית לוי, Sunday 18.10 — asks a question, unanswered (2 business days by Wednesday)
 *   AAMkDL   רו״ח ברק, Tuesday 20.10 — "עד יום ה׳" (a deadline on Thursday 22.10)
 *   AAMkPH   "עו״ד שפירא" from shapira-1aw.co.il, Tuesday 20.10 — new bank details, Reply-To elsewhere (BEC)
 *   AAMkNL   a newsletter with List-Unsubscribe that "asks" something — never a person
 * Sent Items: to Barak and to Shapira's office (the known contacts).
 */
export function proactiveMailbox() {
  const fx = createGraphFixture();
  fx.state.messages.push(
    fixtureGraphMessage({ id: "AAMkW1", from: { name: "רונית לוי", address: "ronit@levi-projects.co.il" }, subject: "הצעת מחיר לפרויקט", receivedDateTime: il(18, 10).toISOString(), bodyPreview: "שלום דנה, מתי נוכל להתקדם עם ההצעה?" }),
    fixtureGraphMessage({ id: "AAMkDL", from: { name: "רו״ח ברק", address: "barak@cpa-barak.co.il" }, subject: "דוח מע״מ", receivedDateTime: il(20, 11).toISOString(), isRead: true, bodyPreview: "נא לשלוח את המסמכים עד יום ה׳ כדי שנספיק להגיש." }),
    fixtureGraphMessage({
      id: "AAMkPH",
      from: { name: "עו״ד שפירא", address: "office@shapira-1aw.co.il" },
      replyTo: [person("", "pay@fastmail.example")],
      subject: "עדכון פרטי בנק לתשלום",
      receivedDateTime: il(20, 15).toISOString(),
      bodyPreview: "שלום דנה, פרטי חשבון הבנק שלנו השתנו. נא להעביר את התשלום לחשבון החדש היום.",
    }),
    fixtureGraphMessage({ id: "AAMkNL", from: { name: "חדשות המשרד", address: "news@legal-news.example" }, subject: "מה חדש?", receivedDateTime: il(16, 9).toISOString(), bodyPreview: "רוצים לשמוע עוד?", internetMessageHeaders: [{ name: "List-Unsubscribe", value: "<mailto:u@legal-news.example>" }] }),
  );
  fx.state.sentItems.push(
    { conversationId: "conv-old-1", sentDateTime: il(10, 9).toISOString(), toRecipients: [person("רו״ח ברק", "barak@cpa-barak.co.il")] },
    { conversationId: "conv-old-2", sentDateTime: il(12, 9).toISOString(), toRecipients: [person("עו״ד שפירא", "office@shapira-law.co.il")] },
  );
  const graph = new GraphClient({ getAccessToken: async () => "t", fetchImpl: fx.fetchImpl });
  return { fx, graph };
}

export function graphEvent(id: string, subject: string, start: string, end: string, more: Partial<FixtureGraphEvent> = {}): FixtureGraphEvent {
  return {
    id,
    subject,
    start: { dateTime: `${start}:00.0000000`, timeZone: "Asia/Jerusalem" },
    end: { dateTime: `${end}:00.0000000`, timeZone: "Asia/Jerusalem" },
    isAllDay: false,
    location: { displayName: "" },
    attendees: [],
    organizer: { emailAddress: { name: "דנה לוי", address: "dana@levi-law.co.il" } },
    webLink: null,
    bodyPreview: "",
    isOrganizer: true,
    ...more,
  };
}

/** A user with WhatsApp, the morning summary on 07:30, the given plan; the deps of the jobs with the mailbox above. */
export async function proactiveSetup(opts: { at: Date; plan?: "pro" | "basic" | "trial"; google?: boolean; profile?: Record<string, unknown>; scopes?: string[] }) {
  const h = makeHarness(opts.at);
  const created = await h.db.createUser("dana@levi-law.co.il");
  await h.db.mergeUserProfile(created.id, { onboarding: { step: "done", startedAt: "x" }, morning_summary_enabled: true, ...(opts.profile ?? {}) });
  h.db.seedWaIdentity(created.id, "+972501234567");
  const plan = opts.plan ?? "pro";
  if (plan !== "trial") await h.db.upsertSubscription(created.id, { plan, status: "active", next_charge_at: new Date(opts.at.getTime() + 20 * 86_400_000).toISOString() });
  const mailbox = proactiveMailbox();
  const google = opts.google ? new GoogleClient({ getAccessToken: async () => "ya29", fetchImpl: createGoogleFixture().fetchImpl }) : null;
  const deps: MorningDeps = {
    db: h.db,
    wa: h.wa,
    now: h.ctx.now,
    graphFor: async () => ({ graph: mailbox.graph, accountEmail: "dana@levi-law.co.il", scopes: opts.scopes ?? [...MS_SCOPES_V1] }),
    ...(google ? { googleFor: async () => ({ google, accountEmail: "dana.levi@gmail.com" }) } : {}),
  };
  h.ctx.mailMarker = async () => ({ markSuspicious: (id: string) => mailbox.graph.markSuspicious(id) });
  const user = (await h.db.getUser(created.id))!;
  return { h, user, deps, mailbox };
}

/** The morning_summary job payload of a local day at 07:30. */
export const morningJob = (userId: string, localDate: string) => ({ id: "job-m", user_id: userId, payload: { local_date: localDate, time: "07:30" } });
