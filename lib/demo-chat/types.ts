/**
 * The website chat (/demo/chat) — shapes shared by the route (app/api/demo/chat) and the page. No server imports:
 * the client component reads these types and the limits.
 */

export interface ChatButton {
  id: string;
  title: string;
}

export interface ChatListRow {
  id: string;
  title: string;
  description?: string;
}

export interface ChatListSection {
  title?: string;
  rows: ChatListRow[];
}

/** One bubble. "user" = what the person wrote, recorded or chose; "bot" = what עלזה answered. */
export interface ChatItem {
  id: string;
  side: "user" | "bot";
  /** user: text | voice | choice (a button / list reply); bot: text | buttons | list | document | image */
  kind: "text" | "voice" | "choice" | "buttons" | "list" | "document" | "image";
  text: string;
  /** ISO time */
  at: string;
  buttons?: ChatButton[];
  list?: { button: string; sections: ChatListSection[] };
  /** documents / images: where to open it (http(s) only) */
  link?: string | null;
  filename?: string | null;
  /** voice: what was heard */
  transcript?: string | null;
  /** voice: the recording's length, when known (the page knows it for its own recordings) */
  durationMs?: number | null;
}

export interface ChatHistoryResponse {
  ok: true;
  /** the account already has its chat number (otherwise the page starts it: POST { start: true }) */
  linked: boolean;
  /** the real model and STT answer (DEMO_MODE=1 + LIVE_AI=1); otherwise the sample answers of the demo */
  liveAi: boolean;
  items: ChatItem[];
}

export interface ChatPostResponse {
  ok: true;
  /** the person's own message as stored (a recording comes back with its transcript); null for { start: true } */
  user: ChatItem | null;
  replies: ChatItem[];
}

export interface ChatErrorResponse {
  ok: false;
  code: "not_found" | "unauthorized" | "rate_limited" | "bad_request" | "too_large" | "too_long" | "forbidden" | "blocked" | "server_error";
  message: string;
}

/** The limits the page enforces before uploading (the route checks them again). */
export const DEMO_CHAT_LIMITS = {
  /** characters in a typed message */
  textChars: 2000,
  /** a recording: at most a minute… */
  audioSeconds: 60,
  /** …and 2 MB (Opus at 32 kbps is about 240 KB a minute) */
  audioBytes: 2 * 1024 * 1024,
  /** the recorder's bitrate */
  audioBitsPerSecond: 32_000,
} as const;

/** Requests per person and per address, per minute: enough to talk, not enough to run up the model bill. */
export const DEMO_CHAT_RATE = { perUser: 20, perIp: 60, windowMs: 60_000 } as const;

/** Containers the browser recorder produces (Chrome / Firefox: webm or ogg; Safari: mp4) — all decodable by the STT. */
export const DEMO_CHAT_AUDIO_TYPES = ["audio/webm", "audio/ogg", "audio/mp4", "audio/mpeg", "audio/wav", "audio/x-m4a", "audio/aac"] as const;
