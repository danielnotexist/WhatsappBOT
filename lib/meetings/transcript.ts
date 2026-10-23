/**
 * Meeting transcripts as the platforms save them, turned into one compact text for the model (lib/meetings/summarize.ts):
 *   - Teams: WebVTT (GET /me/onlineMeetings/{id}/transcripts/{id}/content?$format=text/vtt) — cues with a speaker tag
 *     (`<v Dana Levi>…</v>`), one sentence or two each;
 *   - Google Meet: the Google Doc Meet saves to the organiser's Drive, exported as plain text — "Name: words" lines,
 *     with a timestamp line every few minutes.
 * The result is "Speaker: words" per turn (consecutive cues of one speaker merged), no timestamps — about half the size
 * of the raw VTT. Nothing here is stored: the transcript lives only for the one summary call.
 */

export interface Cue {
  /** seconds from the start */
  start: number;
  end: number;
  speaker: string | null;
  text: string;
}

const TIMESTAMP = /^(?:(\d+):)?(\d{1,2}):(\d{2})[.,](\d{1,3})$/;

/** "00:01:02.500" / "01:02.500" → seconds (NaN when it is not a WebVTT timestamp). */
export function parseTimestamp(s: string): number {
  const m = s.trim().match(TIMESTAMP);
  if (!m) return NaN;
  return Number(m[1] ?? 0) * 3600 + Number(m[2]) * 60 + Number(m[3]) + Number(m[4]!.padEnd(3, "0")) / 1000;
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", lrm: "", rlm: "" };

function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (all, e: string) => {
    if (e[0] === "#") {
      const code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : "";
    }
    return ENTITIES[e.toLowerCase()] ?? all;
  });
}

/** Invisible direction marks and other control characters a transcript may carry. */
const INVISIBLE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F​-‏‪-‮⁦-⁩﻿]/g;

const clean = (s: string) => decodeEntities(s).replace(INVISIBLE, "").replace(/\s+/g, " ").trim();

/** A WebVTT file → cues. Header, NOTE / STYLE / REGION blocks and cue ids are skipped; tags are dropped. */
export function parseVtt(raw: string): Cue[] {
  const text = raw.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  const cues: Cue[] = [];
  for (const block of text.split(/\n{2,}/)) {
    const lines = block.split("\n");
    const timing = lines.findIndex((l) => l.includes("-->"));
    if (timing < 0) continue; // WEBVTT header, NOTE, STYLE, REGION
    const [from, rest] = lines[timing]!.split("-->");
    const start = parseTimestamp(from ?? "");
    const end = parseTimestamp((rest ?? "").trim().split(/\s+/)[0] ?? "");
    if (!Number.isFinite(start)) continue;
    const payload = lines.slice(timing + 1).join("\n");
    // the speaker: <v Name>, <v.class Name> (the closing </v> is optional)
    const voice = payload.match(/<v(?:\.[\w.-]+)?\s+([^>]+)>/);
    const speaker = voice ? clean(voice[1]!) || null : null;
    const words = clean(payload.replace(/<[^>]*>/g, " "));
    if (!words) continue;
    cues.push({ start, end: Number.isFinite(end) ? end : start, speaker, text: words });
  }
  return cues;
}

/** Cues → "Speaker: words" lines, one per turn (consecutive cues of the same speaker merged). */
export function cuesToText(cues: readonly Cue[]): string {
  const turns: { speaker: string | null; text: string }[] = [];
  for (const c of cues) {
    const last = turns.at(-1);
    if (last && last.speaker === c.speaker) last.text = `${last.text} ${c.text}`;
    else turns.push({ speaker: c.speaker, text: c.text });
  }
  return turns.map((t) => (t.speaker ? `${t.speaker}: ${t.text}` : t.text)).join("\n");
}

/** A Teams VTT straight to the compact text. */
export function vttToText(raw: string): string {
  return cuesToText(parseVtt(raw));
}

/** "00:05:12" / "5:12" alone on a line (Meet's transcript Doc marks the time every few minutes). */
const TIME_LINE = /^\d{1,2}:\d{2}(?::\d{2})?$/;

/**
 * The text of a Meet transcript Doc → the compact text: timestamp lines and blank lines dropped, consecutive lines of
 * one speaker merged ("Name: words" — a line without "Name:" continues the previous speaker).
 */
export function docTranscriptToText(raw: string): string {
  const out: { speaker: string | null; text: string }[] = [];
  for (const rawLine of raw.replace(/^﻿/, "").replace(/\r\n?/g, "\n").split("\n")) {
    const line = clean(rawLine);
    if (!line || TIME_LINE.test(line)) continue;
    const m = line.match(/^([^:]{1,60}):\s+(.+)$/);
    const speaker = m ? m[1]!.trim() : null;
    const words = m ? m[2]!.trim() : line;
    const last = out.at(-1);
    if (last && (speaker === null || speaker === last.speaker)) last.text = `${last.text} ${words}`;
    else out.push({ speaker, text: words });
  }
  return out.map((t) => (t.speaker ? `${t.speaker}: ${t.text}` : t.text)).join("\n");
}

/**
 * Splits a long text into parts of at most `maxChars`, at line boundaries (a single longer line is cut at a space, or
 * hard). Every part is non-empty; the order is kept.
 */
export function chunkText(text: string, maxChars: number): string[] {
  const parts: string[] = [];
  let current = "";
  const push = () => {
    if (current.trim()) parts.push(current.trim());
    current = "";
  };
  for (let line of text.split("\n")) {
    while (line.length > maxChars) {
      const cut = line.lastIndexOf(" ", maxChars);
      const at = cut > maxChars / 2 ? cut : maxChars;
      push();
      parts.push(line.slice(0, at).trim());
      line = line.slice(at).trim();
    }
    if (current.length + line.length + 1 > maxChars) push();
    current = current ? `${current}\n${line}` : line;
  }
  push();
  return parts.filter(Boolean);
}
