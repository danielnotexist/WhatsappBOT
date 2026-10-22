import Link from "next/link";
import type { Route } from "next";
import type { ReactNode } from "react";
import { siteDashes } from "@/lib/design/typography";

/**
 * A deliberately small Markdown → React renderer for the legal drafts in docs/legal (headings, paragraphs, lists,
 * tables, blockquotes, rules, **bold**, *italic*, `code`, [links](url)). It builds elements — never raw HTML —
 * so nothing in a document can inject markup. Not a general Markdown implementation.
 */

type Block =
  | { kind: "h"; level: number; text: string }
  | { kind: "p"; text: string }
  | { kind: "ul" | "ol"; items: string[] }
  | { kind: "quote"; text: string }
  | { kind: "table"; head: string[]; rows: string[][] }
  | { kind: "hr" }
  | { kind: "code"; text: string };

const cells = (line: string) =>
  line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());

export function parseMarkdown(md: string): Block[] {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    if (!line.trim()) {
      i++;
      continue;
    }
    if (line.startsWith("```")) {
      const body: string[] = [];
      i++;
      while (i < lines.length && !lines[i]!.startsWith("```")) body.push(lines[i++]!);
      i++;
      blocks.push({ kind: "code", text: body.join("\n") });
      continue;
    }
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) {
      blocks.push({ kind: "h", level: h[1]!.length, text: h[2]! });
      i++;
      continue;
    }
    if (/^(-{3,}|\*{3,})\s*$/.test(line)) {
      blocks.push({ kind: "hr" });
      i++;
      continue;
    }
    if (line.trim().startsWith("|") && i + 1 < lines.length && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1]!)) {
      const head = cells(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i]!.trim().startsWith("|")) rows.push(cells(lines[i++]!));
      blocks.push({ kind: "table", head, rows });
      continue;
    }
    if (line.startsWith(">")) {
      const body: string[] = [];
      while (i < lines.length && lines[i]!.startsWith(">")) body.push(lines[i++]!.replace(/^>\s?/, ""));
      blocks.push({ kind: "quote", text: body.join(" ") });
      continue;
    }
    const ul = /^\s*[-*]\s+/;
    const ol = /^\s*\d+[.)]\s+/;
    if (ul.test(line) || ol.test(line)) {
      const kind = ul.test(line) ? "ul" : "ol";
      const re = kind === "ul" ? ul : ol;
      const items: string[] = [];
      while (i < lines.length && lines[i]!.trim()) {
        const l = lines[i]!;
        if (re.test(l)) items.push(l.replace(re, ""));
        else if (/^\s+/.test(l) && items.length) items[items.length - 1] += ` ${l.trim()}`;
        else break;
        i++;
      }
      blocks.push({ kind, items });
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i]!.trim() && !/^(#{1,6}\s|>|```|\s*[-*]\s|\s*\d+[.)]\s|\|)/.test(lines[i]!)) para.push(lines[i++]!.trim());
    if (para.length === 0) para.push(lines[i++]!.trim());
    blocks.push({ kind: "p", text: para.join(" ") });
  }
  return blocks;
}

/** **bold**, *italic*, `code`, [text](url) */
export function renderInline(text: string, keyPrefix = "i"): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*([^*]+)\*\*|\*([^*\s][^*]*)\*|`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let n = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const key = `${keyPrefix}-${n++}`;
    if (m[2] !== undefined) out.push(<strong key={key}>{renderInline(m[2], key)}</strong>);
    else if (m[3] !== undefined) out.push(<em key={key}>{renderInline(m[3], key)}</em>);
    else if (m[4] !== undefined)
      out.push(
        <code key={key} dir="ltr" className="rounded bg-cream/10 px-1 text-[0.9em]">
          {m[4]}
        </code>,
      );
    else if (m[5] !== undefined) {
      const href = m[6]!;
      if (href.startsWith("/")) {
        out.push(
          <Link key={key} href={href as Route} className="underline underline-offset-3">
            {m[5]}
          </Link>,
        );
      } else if (/^https?:\/\//.test(href)) {
        out.push(
          <a key={key} href={href} className="underline underline-offset-3" rel="noopener noreferrer">
            {m[5]}
          </a>,
        );
      } else out.push(m[5]); // relative doc links (e.g. other drafts) render as plain text
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** Renders a legal draft. Its long dashes become the site's short hyphen (lib/design/typography.ts); the wording stays. */
export function Markdown({ source }: { source: string }) {
  const blocks = parseMarkdown(siteDashes(source));
  return (
    <>
      {blocks.map((b, i) => {
        const k = `b${i}`;
        switch (b.kind) {
          case "h": {
            const Tag = `h${Math.min(6, b.level)}` as "h1" | "h2" | "h3" | "h4" | "h5" | "h6";
            const size = b.level <= 1 ? "text-title mt-2" : b.level === 2 ? "text-[1.75rem] mt-12" : "text-[1.3125rem] mt-8";
            return (
              <Tag key={k} className={`font-heading font-bold ${size}`}>
                {renderInline(b.text, k)}
              </Tag>
            );
          }
          case "p":
            return (
              <p key={k} className="mt-4">
                {renderInline(b.text, k)}
              </p>
            );
          case "ul":
          case "ol": {
            const Tag = b.kind;
            return (
              <Tag key={k} className={`mt-4 flex flex-col gap-2 ps-6 ${b.kind === "ul" ? "list-disc" : "list-decimal"}`}>
                {b.items.map((it, j) => (
                  <li key={j}>{renderInline(it, `${k}-${j}`)}</li>
                ))}
              </Tag>
            );
          }
          case "quote":
            return (
              <blockquote key={k} className="mt-6 rounded-2xl border-s-4 border-honey bg-night-2 px-5 py-4 text-cream">
                {renderInline(b.text, k)}
              </blockquote>
            );
          case "table":
            return (
              <div key={k} className="mt-6 overflow-x-auto rounded-2xl border border-line" tabIndex={0} role="region" aria-label="טבלה">
                <table className="w-full border-collapse text-start text-[0.9375rem]">
                  <thead className="bg-night-2">
                    <tr>
                      {b.head.map((c, j) => (
                        <th key={j} scope="col" className="border-b border-line px-3 py-2 text-start font-semibold">
                          {renderInline(c, `${k}-h${j}`)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {b.rows.map((r, j) => (
                      <tr key={j} className="align-top">
                        {r.map((c, x) => (
                          <td key={x} className="border-b border-line px-3 py-2">
                            {renderInline(c, `${k}-${j}-${x}`)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          case "hr":
            return <hr key={k} className="mt-10 border-line" />;
          case "code":
            return (
              <pre key={k} dir="ltr" className="mt-4 overflow-x-auto rounded-xl bg-night-2 p-4 text-[0.875rem]">
                {b.text}
              </pre>
            );
        }
      })}
    </>
  );
}
