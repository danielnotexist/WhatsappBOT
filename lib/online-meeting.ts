/**
 * Online meetings on calendar events: a Teams meeting on Microsoft 365 (Graph `isOnlineMeeting` +
 * `onlineMeetingProvider: "teamsForBusiness"`) and a Google Meet on Google Calendar (`conferenceData.createRequest`
 * with `conferenceDataVersion=1`). Both ride on the calendar scopes the app already has (Calendars.ReadWrite,
 * calendar.events), so no new consent is needed.
 *
 * A join link comes from the provider's event, which an outside organizer can influence (a Google entry point can
 * carry any URI). Before a link reaches the model or a message from the assistant it must be one https URL on a known
 * meeting service, without whitespace or invisible characters, and capped.
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
