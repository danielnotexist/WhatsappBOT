import { MAX_TEXT_CHARS, OFFICE_EXT, TEXT_EXT, extensionOf, pdfToText } from "@/lib/ms/files-text";
import { GOOGLE_DOC_MIME, GOOGLE_SHEET_MIME, GOOGLE_SLIDES_MIME, type DriveFile, type GoogleClient } from "./client";

/** Office uploads are converted through a temporary Google Doc/Sheet/Slides copy (multipart upload limit). */
export const MAX_CONVERT_BYTES = 5 * 1024 * 1024;

const OFFICE_TARGET: Record<string, string> = {
  doc: GOOGLE_DOC_MIME,
  docx: GOOGLE_DOC_MIME,
  odt: GOOGLE_DOC_MIME,
  rtf: GOOGLE_DOC_MIME,
  xls: GOOGLE_SHEET_MIME,
  xlsx: GOOGLE_SHEET_MIME,
  ods: GOOGLE_SHEET_MIME,
  ppt: GOOGLE_SLIDES_MIME,
  pptx: GOOGLE_SLIDES_MIME,
  odp: GOOGLE_SLIDES_MIME,
};

/** Export format per Google type: Docs/Slides → text/plain, Sheets → text/csv (first sheet only). */
const EXPORT_AS: Record<string, string> = { [GOOGLE_DOC_MIME]: "text/plain", [GOOGLE_SLIDES_MIME]: "text/plain", [GOOGLE_SHEET_MIME]: "text/csv" };

const decode = (bytes: Uint8Array) => new TextDecoder("utf-8").decode(bytes).replace(/^﻿/, "");

/**
 * Text of a Drive file the app may read (drive.file): Google Docs/Sheets/Slides via files.export; PDF via unpdf;
 * Word/Excel/PowerPoint by importing a temporary Google copy, exporting it and deleting the copy; plain-text
 * formats as-is. Returns `null` for binaries we do not read, and `too_large` above the conversion limit.
 */
export async function driveFileText(g: GoogleClient, file: DriveFile): Promise<{ text: string; pages: number | null; truncated: boolean } | { error: "too_large" } | null> {
  let text: string;
  let pages: number | null = null;
  const ext = extensionOf(file.name);
  const exportAs = EXPORT_AS[file.mimeType];
  if (exportAs) {
    text = decode((await g.exportFile(file.id, exportAs)).bytes);
  } else if (file.mimeType === "application/pdf" || ext === "pdf") {
    ({ text, pages } = await pdfToText((await g.downloadFile(file.id)).bytes));
  } else if (OFFICE_EXT.has(ext) && OFFICE_TARGET[ext]) {
    if (file.size !== null && file.size > MAX_CONVERT_BYTES) return { error: "too_large" };
    const { bytes } = await g.downloadFile(file.id);
    if (bytes.byteLength > MAX_CONVERT_BYTES) return { error: "too_large" };
    const target = OFFICE_TARGET[ext];
    const temp = await g.createFile({ name: `[temp] ${file.name}`, mimeType: file.mimeType, content: bytes, convertTo: target });
    try {
      text = decode((await g.exportFile(temp.id, EXPORT_AS[target]!)).bytes);
    } finally {
      await g.deleteFile(temp.id).catch(() => undefined);
    }
  } else if (TEXT_EXT.has(ext) || file.mimeType.startsWith("text/")) {
    text = decode((await g.downloadFile(file.id)).bytes);
  } else {
    return null;
  }
  text = text.replace(/\r\n/g, "\n").trim();
  const truncated = text.length > MAX_TEXT_CHARS;
  return { text: truncated ? text.slice(0, MAX_TEXT_CHARS) : text, pages, truncated };
}
