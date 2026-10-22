/**
 * Duration of an Ogg/Opus file (a WhatsApp voice note) without decoding: the last page's granule position counts
 * 48 kHz samples, minus the pre-skip from the OpusHead packet (RFC 7845 §4). Used when the STT provider does not
 * report the duration, so long recordings are still echoed back (lib/bot/voice.ts). null when it is not Ogg/Opus.
 */
export function oggOpusDurationMs(bytes: Uint8Array): number | null {
  if (bytes.length < 47 || !isPageStart(bytes, 0)) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const head = 27 + bytes[26]!; // first packet, after the segment table
  if (head + 12 > bytes.length || String.fromCharCode(...bytes.subarray(head, head + 8)) !== "OpusHead") return null;
  const preSkip = view.getUint16(head + 10, true);
  for (let i = bytes.length - 27; i > 0; i--) {
    if (!isPageStart(bytes, i)) continue;
    const granule = view.getBigInt64(i + 6, true);
    if (granule <= 0n) continue; // -1: no packet ends on this page; 0: header pages
    const samples = Number(granule) - preSkip;
    return samples > 0 ? Math.round(samples / 48) : null;
  }
  return null;
}

/** "OggS" + stream structure version 0 */
function isPageStart(b: Uint8Array, i: number): boolean {
  return b[i] === 0x4f && b[i + 1] === 0x67 && b[i + 2] === 0x67 && b[i + 3] === 0x53 && b[i + 4] === 0;
}
