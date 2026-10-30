/**
 * A file read from Graph or Drive (the assistant reading a document, a meeting transcript) is held in memory whole, so
 * it is capped: a declared Content-Length above the cap is refused before anything is read, and a body without one is
 * read in chunks and stopped once it passes the cap. A shared library can hold a file of any size.
 */
export const MAX_DOWNLOAD_BYTES = 25 * 1024 * 1024;

export class DownloadTooLargeError extends Error {
  constructor(readonly maxBytes: number) {
    super(`download larger than ${maxBytes} bytes`);
    this.name = "DownloadTooLargeError";
  }
}

export async function readCapped(res: Response, maxBytes: number = MAX_DOWNLOAD_BYTES): Promise<Uint8Array> {
  const declared = Number(res.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) {
    await res.body?.cancel().catch(() => undefined);
    throw new DownloadTooLargeError(maxBytes);
  }
  if (!res.body) {
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.byteLength > maxBytes) throw new DownloadTooLargeError(maxBytes);
    return bytes;
  }
  const reader = res.body.getReader();
  const parts: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw new DownloadTooLargeError(maxBytes);
    }
    parts.push(value);
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.byteLength;
  }
  return out;
}
