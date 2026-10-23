import type { GoogleClient, GoogleEvent } from "@/lib/google/client";
import type { GmailReader } from "@/lib/google/gmail";
import type { SentRef } from "@/lib/jobs/awaiting-reply";
import type { GraphClient, GraphEvent } from "@/lib/ms/graph";
import { fromGoogleEvent, fromGraphEvent, type CalEvent } from "./calendar";
import { fromGmailMessage, fromGraphMessage, type ProactiveMail } from "./mail";
import type { Contact } from "./phishing";

/**
 * What the proactive checks read from the user's accounts, gathered once per run from Microsoft 365 and / or Gmail +
 * Google Calendar: recent inbox mail (with Reply-To, importance and the bulk headers), the user's sent mail (for "did
 * the user answer?" and the known contacts), and the meetings in a time range. Each source fails on its own: a mailbox
 * that answers with an error is logged and left out, the rest still runs.
 */
export interface GatheredSources {
  mails: ProactiveMail[];
  sent: SentRef[];
  known: Contact[];
  events: CalEvent[];
  selfAddresses: string[];
  /** a calendar or a mailbox answered (the results are real, not just missing) */
  connected: boolean;
}

export interface GraphSource {
  graph: Pick<GraphClient, "listInbox" | "request" | "calendarView">;
  accountEmail: string | null;
}

export interface GoogleSource {
  google: Pick<GoogleClient, "listEvents">;
  gmail?: Pick<GmailReader, "awaitingReplyInputs"> | null;
  accountEmail?: string | null;
}

export function emptySources(): GatheredSources {
  return { mails: [], sent: [], known: [], events: [], selfAddresses: [], connected: false };
}

/** Sent Items since `since`: conversation + time, and the recipients as known contacts. */
async function graphSent(graph: GraphSource["graph"], since: Date): Promise<{ sent: SentRef[]; known: Contact[] }> {
  const q = new URLSearchParams({ $top: "50", $select: "conversationId,sentDateTime,toRecipients,ccRecipients", $filter: `sentDateTime ge ${since.toISOString()}`, $orderby: "sentDateTime desc" });
  type Addr = { emailAddress?: { name?: string; address?: string } };
  const r = await graph.request<{ value?: { conversationId?: string; sentDateTime?: string; toRecipients?: Addr[]; ccRecipients?: Addr[] }[] }>("GET", `/me/mailFolders/sentitems/messages?${q}`);
  const known = new Map<string, Contact>();
  const sent: SentRef[] = [];
  for (const v of r?.value ?? []) {
    sent.push({ conversationId: v.conversationId ?? null, sentDateTime: v.sentDateTime ?? "" });
    for (const a of [...(v.toRecipients ?? []), ...(v.ccRecipients ?? [])]) {
      const address = (a.emailAddress?.address ?? "").trim().toLowerCase();
      if (address && !known.has(address)) known.set(address, { name: a.emailAddress?.name ?? "", address });
    }
  }
  return { sent, known: [...known.values()] };
}

export interface GatherOptions {
  now: Date;
  /** mail received since */
  mailSince: Date;
  /** sent mail since (known contacts reach further back than the mail checked) */
  sentSince: Date;
  /** the meetings' range */
  eventsFrom: Date;
  eventsTo: Date;
  tz: string;
  /** inbox page size (Graph) / threads (Gmail) */
  top?: number;
  /** read the calendars only (no mail) */
  calendarOnly?: boolean;
}

export async function gatherSources(ms: GraphSource | null, google: GoogleSource | null, opts: GatherOptions, label: string): Promise<GatheredSources> {
  const out = emptySources();
  const known = new Map<string, Contact>();
  const addKnown = (list: Contact[]) => {
    for (const c of list) if (c.address && !known.has(c.address)) known.set(c.address.toLowerCase(), { name: c.name, address: c.address.toLowerCase() });
  };
  if (ms) {
    if (ms.accountEmail) out.selfAddresses.push(ms.accountEmail.toLowerCase());
    try {
      out.events.push(...(await ms.graph.calendarView(opts.eventsFrom, opts.eventsTo, opts.tz)).map((e: GraphEvent) => fromGraphEvent(e, opts.tz)));
      out.connected = true;
    } catch (e) {
      console.warn(`[proactive] calendar failed for ${label}:`, (e as Error).message);
    }
    if (!opts.calendarOnly) {
      try {
        out.mails.push(...(await ms.graph.listInbox({ top: opts.top ?? 50, since: opts.mailSince, withHeaders: true })).map(fromGraphMessage));
        out.connected = true;
        const s = await graphSent(ms.graph, opts.sentSince).catch(() => ({ sent: [], known: [] }));
        out.sent.push(...s.sent);
        addKnown(s.known);
      } catch (e) {
        console.warn(`[proactive] mail failed for ${label}:`, (e as Error).message);
      }
    }
  }
  if (google) {
    if (google.accountEmail) out.selfAddresses.push(google.accountEmail.toLowerCase());
    try {
      const events = await google.google.listEvents({ timeMin: opts.eventsFrom, timeMax: opts.eventsTo, timeZone: opts.tz, maxResults: 50 });
      out.events.push(...events.filter((e: GoogleEvent) => e.status !== "cancelled" && !e.attendees.some((a) => a.self && a.response === "declined")).map(fromGoogleEvent));
      out.connected = true;
    } catch (e) {
      console.warn(`[proactive] google calendar failed for ${label}:`, (e as Error).message);
    }
    if (google.gmail && !opts.calendarOnly) {
      try {
        const days = Math.max(1, Math.ceil((opts.now.getTime() - opts.mailSince.getTime()) / 86_400_000));
        const { inbox, sent, contacts } = await google.gmail.awaitingReplyInputs({ newerThanDays: Math.min(days, 30), maxThreads: Math.min(opts.top ?? 25, 50) });
        out.mails.push(...inbox.map((i) => fromGmailMessage(i.message)).filter((m) => Date.parse(m.receivedDateTime) >= opts.mailSince.getTime()));
        out.sent.push(...sent);
        addKnown(contacts ?? []);
        out.connected = true;
      } catch (e) {
        console.warn(`[proactive] gmail failed for ${label}:`, (e as Error).message);
      }
    }
  }
  out.known = [...known.values()];
  return out;
}
