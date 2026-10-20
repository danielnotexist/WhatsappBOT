import { extractText, getDocumentProxy } from "unpdf";
import type { DriveItem, GraphClient } from "./graph";

/** Office / PDF / text documents the assistant can read (PLAN §11 milestone 4: Word/Excel/PPT → PDF → text). */
export const OFFICE_EXT = new Set(["doc", "docx", "xls", "xlsx", "ppt", "pptx", "odt", "ods", "odp", "rtf"]);
export const TEXT_EXT = new Set(["txt", "md", "csv", "json", "html", "htm"]);
export const MAX_TEXT_CHARS = 40_000;

export function extensionOf(name: string): string {
  return (name.split(".").pop() ?? "").toLowerCase();
}

export async function pdfToText(bytes: Uint8Array): Promise<{ text: string; pages: number }> {
  const pdf = await getDocumentProxy(bytes);
  const { text, totalPages } = await extractText(pdf, { mergePages: true });
  return { text: (text as string).replace(/[ \t]+\n/g, "\n").trim(), pages: totalPages };
}

/**
 * Text of a OneDrive item: PDF directly, Office formats through Graph's PDF rendition (`/content?format=pdf`),
 * plain-text formats as-is. Returns `null` for binaries we do not read (images, zips).
 */
export async function driveItemText(graph: GraphClient, item: DriveItem): Promise<{ text: string; pages: number | null; truncated: boolean } | null> {
  const ext = extensionOf(item.name);
  let text: string;
  let pages: number | null = null;
  if (ext === "pdf") {
    const { bytes } = await graph.downloadItem(item.id);
    ({ text, pages } = await pdfToText(bytes));
  } else if (OFFICE_EXT.has(ext)) {
    const { bytes } = await graph.downloadItem(item.id, "pdf");
    ({ text, pages } = await pdfToText(bytes));
  } else if (TEXT_EXT.has(ext)) {
    const { bytes } = await graph.downloadItem(item.id);
    text = new TextDecoder("utf-8").decode(bytes);
  } else {
    return null;
  }
  const truncated = text.length > MAX_TEXT_CHARS;
  return { text: truncated ? text.slice(0, MAX_TEXT_CHARS) : text, pages, truncated };
}
