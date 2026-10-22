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

/**
 * Test-only: a minimal WebM stream like Chrome's MediaRecorder writes (unknown-size Segment and Clusters, no Duration),
 * one Cluster a second with a 20 ms SimpleBlock every `blockMs`. `declaredMs`: also write Info/Duration.
 */
export function fakeWebm(durationMs: number, { blockMs = 200, declaredMs = null as number | null, knownSizes = false } = {}): Uint8Array {
  const el = (id: number[], body: Uint8Array | number[], unknown = false) => {
    const b = Uint8Array.from(body);
    const size = unknown ? [0x01, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff] : [0x10, (b.length >> 16) & 0xff, (b.length >> 8) & 0xff, b.length & 0xff]; // 4-byte vint
    return concat([Uint8Array.from(id), Uint8Array.from(size), b]);
  };
  const header = el([0x1a, 0x45, 0xdf, 0xa3], el([0x42, 0x82], ascii("webm")));
  const infoChildren = [el([0x2a, 0xd7, 0xb1], [0x0f, 0x42, 0x40])]; // TimecodeScale 1,000,000 ns
  if (declaredMs !== null) {
    const d = new Uint8Array(8);
    new DataView(d.buffer).setFloat64(0, declaredMs);
    infoChildren.push(el([0x44, 0x89], d));
  }
  const info = el([0x15, 0x49, 0xa9, 0x66], concat(infoChildren));
  const tracks = el([0x16, 0x54, 0xae, 0x6b], el([0xae], el([0xd7], [1])));
  const clusters: Uint8Array[] = [];
  for (let start = 0; start < durationMs; start += 1000) {
    const blocks: Uint8Array[] = [el([0xe7], [(start >> 16) & 0xff, (start >> 8) & 0xff, start & 0xff])];
    for (let rel = 0; rel < 1000 && start + rel < durationMs; rel += blockMs) blocks.push(el([0xa3], [0x81, (rel >> 8) & 0xff, rel & 0xff, 0x80, 0xfc, 0xff, 0xfe]));
    clusters.push(el([0x1f, 0x43, 0xb6, 0x75], concat(blocks), !knownSizes));
  }
  const segment = el([0x18, 0x53, 0x80, 0x67], concat([info, tracks, ...clusters]), !knownSizes);
  return concat([header, segment]);
}

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}
