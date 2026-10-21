/** Test-only: a minimal Ogg/Opus stream (headers + audio pages, no real audio) of a given length. */
export function fakeOggOpus(durationMs: number, { preSkip = 312, trailingGranules = [] as bigint[] } = {}): Uint8Array {
  const head = new Uint8Array(19);
  head.set(ascii("OpusHead"));
  head[8] = 1; // version
  head[9] = 1; // channels
  new DataView(head.buffer).setUint16(10, preSkip, true);
  new DataView(head.buffer).setUint32(12, 16_000, true); // original sample rate (informational)
  const tags = new Uint8Array(16);
  tags.set(ascii("OpusTags"));
  const audio = new Uint8Array(40).fill(0xfc);
  const pages = [
    page(0n, head, 0x02),
    page(0n, tags, 0),
    page(BigInt(preSkip + Math.round(durationMs * 48)), audio, trailingGranules.length ? 0 : 0x04),
    ...trailingGranules.map((g, i) => page(g, audio, i === trailingGranules.length - 1 ? 0x04 : 0)),
  ];
  const out = new Uint8Array(pages.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of pages) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

function page(granule: bigint, payload: Uint8Array, headerType: number): Uint8Array {
  const b = new Uint8Array(27 + 1 + payload.length);
  const v = new DataView(b.buffer);
  b.set(ascii("OggS"));
  b[4] = 0;
  b[5] = headerType;
  v.setBigInt64(6, granule, true);
  v.setUint32(14, 0x1234, true); // serial
  b[26] = 1; // one segment
  b[27] = payload.length; // < 255
  b.set(payload, 28);
  return b;
}

function ascii(s: string): Uint8Array {
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}
