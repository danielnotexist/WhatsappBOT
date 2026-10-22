import { siteDashes } from "@/lib/design/typography";

/**
 * The little of WhatsApp's formatting the bot uses (docs/copy/style-guide.md "מה וואטסאפ מציג"): `*bold*` for a
 * bubble's title, `> ` lines for a quoted draft, and bare links. Site text uses the short hyphen only, so dashes are
 * normalised here (lib/design/typography.ts) — the chat shows the bot's WhatsApp copy on the site.
 */
export type Inline = { t: "text"; v: string } | { t: "bold"; v: string } | { t: "link"; v: string };
export type Block = { kind: "line"; parts: Inline[] } | { kind: "quote"; lines: Inline[][] };

const TOKEN = /(https?:\/\/[^\s<>"]+)|\*([^*\n]+)\*/g;

export function waInline(line: string): Inline[] {
  const out: Inline[] = [];
  let last = 0;
  for (const m of line.matchAll(TOKEN)) {
    const at = m.index ?? 0;
    if (at > last) out.push({ t: "text", v: line.slice(last, at) });
    if (m[1]) {
      // trailing punctuation belongs to the sentence, not the link
      const url = m[1].replace(/[.,;:!?)\]׳״"']+$/u, "");
      out.push({ t: "link", v: url });
      if (url.length < m[1].length) out.push({ t: "text", v: m[1].slice(url.length) });
    } else {
      out.push({ t: "bold", v: m[2]! });
    }
    last = at + m[0].length;
  }
  if (last < line.length) out.push({ t: "text", v: line.slice(last) });
  return out;
}

export function waBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  for (const raw of siteDashes(text).split("\n")) {
    const quote = raw.match(/^>\s?(.*)$/);
    if (quote) {
      const prev = blocks.at(-1);
      const line = waInline(quote[1]!);
      if (prev?.kind === "quote") prev.lines.push(line);
      else blocks.push({ kind: "quote", lines: [line] });
    } else {
      blocks.push({ kind: "line", parts: waInline(raw) });
    }
  }
  return blocks;
}

/** "13:42" in Israel time. */
export function chatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("he-IL", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "Asia/Jerusalem" }).format(d);
}

/** "0:07" */
export function clockDuration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
