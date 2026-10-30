import { getDocumentProxy } from "unpdf";
import { DownloadTooLargeError, MAX_DOWNLOAD_BYTES } from "@/lib/http/capped-body";
import type { DriveItem, GraphClient } from "./graph";

/** Office / PDF / text documents the assistant can read (PLAN §11 milestone 4: Word/Excel/PPT → PDF → text). */
export const OFFICE_EXT = new Set(["doc", "docx", "xls", "xlsx", "ppt", "pptx", "odt", "ods", "odp", "rtf"]);
export const TEXT_EXT = new Set(["txt", "md", "csv", "json", "html", "htm"]);
export const MAX_TEXT_CHARS = 40_000;

export function extensionOf(name: string): string {
  return (name.split(".").pop() ?? "").toLowerCase();
}

/** A PDF is read page by page and stops here (a "page bomb" in a shared library cannot keep the worker busy). */
export const MAX_PDF_PAGES = 200;

/**
 * The text of a PDF, page by page, until MAX_TEXT_CHARS or MAX_PDF_PAGES (`partial`: pages were left unread). The same
 * text unpdf's extractText({ mergePages: true }) gives for the pages read.
 */
export async function pdfToText(bytes: Uint8Array): Promise<{ text: string; pages: number; partial: boolean }> {
  const pdf = await getDocumentProxy(bytes);
  const total = pdf.numPages;
  const texts: string[] = [];
  let chars = 0;
  for (let i = 1; i <= Math.min(total, MAX_PDF_PAGES); i++) {
    const content = await (await pdf.getPage(i)).getTextContent();
    const page = (content.items as { str?: string; hasEOL?: boolean }[])
      .filter((item) => item.str != null)
      .map((item) => item.str + (item.hasEOL ? "\n" : ""))
      .join("");
    texts.push(page);
    chars += page.length;
    if (chars > MAX_TEXT_CHARS) break;
  }
  const merged = texts.join("\n").replace(/[^\S\n]+/g, " ").replace(/ ?\n ?/g, "\n").replace(/\n{3,}/g, "\n\n");
  return { text: merged.replace(/[ \t]+\n/g, "\n").trim(), pages: total, partial: texts.length < total };
}

/**
 * Text of a OneDrive item: PDF directly, Office formats through Graph's PDF rendition (`/content?format=pdf`),
 * plain-text formats as-is. Returns `null` for binaries we do not read (images, zips). `driveId`: an item of another
 * drive (a SharePoint document library) — read the same way through /drives/{id}/items/{id}.
 */
export async function driveItemText(graph: GraphClient, item: DriveItem, opts: { driveId?: string } = {}): Promise<{ text: string; pages: number | null; truncated: boolean } | null> {
  const ext = extensionOf(item.name);
  const download = (format?: "pdf") => (opts.driveId ? graph.downloadDriveItem(opts.driveId, item.id, format) : graph.downloadItem(item.id, format));
  let text: string;
  let pages: number | null = null;
  let partial = false;
  // the item's own size is known before any download (the PDF rendition of an Office file is capped as it is read)
  if ((ext === "pdf" || OFFICE_EXT.has(ext) || TEXT_EXT.has(ext)) && item.size > MAX_DOWNLOAD_BYTES) throw new DownloadTooLargeError(MAX_DOWNLOAD_BYTES);
  if (ext === "pdf") {
    const { bytes } = await download();
    ({ text, pages, partial } = await pdfToText(bytes));
  } else if (OFFICE_EXT.has(ext)) {
    const { bytes } = await download("pdf");
    ({ text, pages, partial } = await pdfToText(bytes));
  } else if (TEXT_EXT.has(ext)) {
    const { bytes } = await download();
    text = new TextDecoder("utf-8").decode(bytes);
  } else {
    return null;
  }
  const truncated = partial || text.length > MAX_TEXT_CHARS;
  return { text: text.slice(0, MAX_TEXT_CHARS), pages, truncated };
}
