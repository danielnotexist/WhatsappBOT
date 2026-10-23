/**
 * Online meetings on calendar events: a Teams meeting on Microsoft 365 (Graph `isOnlineMeeting` +
 * `onlineMeetingProvider: "teamsForBusiness"`) and a Google Meet on Google Calendar (`conferenceData.createRequest`
 * with `conferenceDataVersion=1`). Both ride on the calendar scopes the app already has (Calendars.ReadWrite,
 * calendar.events), so no new consent is needed.
 *
 * A join link comes from the provider's event, which an outside organizer can influence (a Google entry point can
 * carry any URI). Before a link reaches the model or a message from the assistant it must be one https URL on a known
 * meeting service, without whitespace or invisible characters, and capped.
 *
 * Whether an account can create the meeting: Microsoft lists it on the calendar (allowedOnlineMeetingProviders, read
 * under Calendars.ReadWrite) and is checked before the draft and again before the write. Google cannot be checked
 * under calendar.events: calendars.get / calendarList.get (conferenceProperties.allowedConferenceSolutionTypes) need
 * calendar.readonly or calendar.calendarlist, which the app does not request. Reacting to the 400 Google answers
 * ("Invalid conference type value.") or to a create request that ends in "failure" is the only path there.
 *
 * Some links live outside the provider's meeting fields: the Outlook Zoom add-in writes its link to the location or
 * the body and leaves isOnlineMeeting false; a Google event can carry a Zoom or Teams link only in its location or
 * description. `joinUrlInText` finds such a link (same safe-list rules), so a meeting that has one is not given a
 * second, different link.
 */
export type OnlineMeetingProvider = "microsoft" | "google";

/** Graph's provider value for Teams (calendar.allowedOnlineMeetingProviders lists what a calendar supports). */
export const TEAMS_PROVIDER = "teamsForBusiness";

const MEETING_HOSTS = ["teams.microsoft.com", "teams.live.com", "teams.microsoft.us", "meet.google.com", "zoom.us", "zoom.com", "webex.com"] as const;
const MAX_URL_LENGTH = 1024;
const UNSAFE = /[\s<>"'`\\\u0000-\u001F\u007F-\u009F]|\p{Default_Ignorable_Code_Point}/u;

/** The join link if it is safe to show, otherwise null. Returned as given (no re-encoding: Teams links are long). */
export function safeJoinUrl(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const s = raw.trim();
  if (!s || s.length > MAX_URL_LENGTH || UNSAFE.test(s)) return null;
  let url: URL;
  try {
    url = new URL(s);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username || url.password || url.port) return null;
  const host = url.hostname.toLowerCase();
  return MEETING_HOSTS.some((h) => host === h || host.endsWith(`.${h}`)) ? s : null;
}

const URL_IN_TEXT = /https:\/\/[A-Za-z0-9\-._~:/?#@!$&*+,;=%]+/g;

/** The first safe meeting link written in free text (an event's location or body), or null. */
export function joinUrlInText(...texts: (string | null | undefined)[]): string | null {
  for (const text of texts) {
    if (typeof text !== "string" || !text.includes("https://")) continue;
    for (const m of text.slice(0, 20_000).matchAll(URL_IN_TEXT)) {
      const url = safeJoinUrl(m[0].replace(/[.,;:!?]+$/, ""));
      if (url) return url;
    }
  }
  return null;
}

/** The tenant id of personal Microsoft accounts (outlook.com, hotmail.com, live.com) in id tokens. */
export const MSA_CONSUMER_TENANT = "9188040d-6c67-4c5b-b112-36a304b66dad";
const CONSUMER_DOMAIN = /@(outlook|hotmail|live|msn)\.[a-z.]+$/i;

/**
 * A personal Microsoft account: Graph lists no "teamsForBusiness" for it, and Teams meetings need a work or school
 * account. Anything else that lacks Teams (a work account without a Teams license, a tenant policy) is not explained
 * as "personal".
 */
export function isPersonalMicrosoftAccount(c: { tenant_id?: string | null; account_email?: string | null } | null | undefined): boolean {
  if (!c) return false;
  return c.tenant_id === MSA_CONSUMER_TENANT || CONSUMER_DOMAIN.test(c.account_email?.trim() ?? "");
}
