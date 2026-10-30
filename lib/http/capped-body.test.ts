import { describe, expect, it } from "vitest";
import type { DriveItem, GraphClient } from "@/lib/ms/graph";
import { driveItemText } from "@/lib/ms/files-text";
import { DownloadTooLargeError, MAX_DOWNLOAD_BYTES, readCapped } from "./capped-body";

/** Security round F: a file read from Graph or Drive is never held in memory past the cap. */
describe("readCapped", () => {
  it("returns a body within the cap", async () => {
    expect(await readCapped(new Response(new Uint8Array([1, 2, 3])), 10)).toEqual(new Uint8Array([1, 2, 3]));
  });

  it("refuses a declared Content-Length above the cap before reading anything", async () => {
    let pulled = 0;
    const body = new ReadableStream<Uint8Array>({ pull: (c) => (pulled++, c.enqueue(new Uint8Array(4))) });
    const res = new Response(body, { headers: { "content-length": "100" } });
    await expect(readCapped(res, 10)).rejects.toBeInstanceOf(DownloadTooLargeError);
    expect(pulled).toBeLessThanOrEqual(1);
  });

  it("stops a body without a length once it passes the cap", async () => {
    let chunks = 0;
    const body = new ReadableStream<Uint8Array>({ pull: (c) => (chunks++, c.enqueue(new Uint8Array(4))) });
    await expect(readCapped(new Response(body), 10)).rejects.toBeInstanceOf(DownloadTooLargeError);
    expect(chunks).toBeLessThan(10);
  });

  it("a OneDrive item larger than the cap is refused before any download", async () => {
    let downloads = 0;
    const graph = { downloadItem: async () => (downloads++, { bytes: new Uint8Array(), contentType: null }) } as unknown as GraphClient;
    const item = { id: "1", name: "huge.pdf", size: MAX_DOWNLOAD_BYTES + 1 } as DriveItem;
    await expect(driveItemText(graph, item)).rejects.toBeInstanceOf(DownloadTooLargeError);
    expect(downloads).toBe(0);
  });
});
