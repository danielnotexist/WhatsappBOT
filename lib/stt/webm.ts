/**
 * Duration of a WebM recording (what Chrome's and Firefox's MediaRecorder produce) without decoding. A live recording
 * has no Duration in its Info and unknown-size Segment / Cluster elements, so the length is read from the blocks: the
 * latest Cluster Timecode + SimpleBlock relative timecode, × TimecodeScale (Matroska spec). A Duration element, when
 * present, wins. null when it is not WebM or cannot be read. Used by the website chat to enforce its one-minute limit.
 */

const EBML = 0x1a45dfa3;
const SEGMENT = 0x18538067;
const INFO = 0x1549a966;
const TIMECODE_SCALE = 0x2ad7b1;
const DURATION = 0x4489;
const CLUSTER = 0x1f43b675;
const TIMECODE = 0xe7;
const SIMPLE_BLOCK = 0xa3;
const BLOCK_GROUP = 0xa0;
const BLOCK = 0xa1;
/** Level-1 elements: one of these ends an unknown-size Cluster. */
const LEVEL1 = new Set([SEGMENT, INFO, CLUSTER, 0x1654ae6b /* Tracks */, 0x1c53bb6b /* Cues */, 0x1254c367 /* Tags */, 0x114d9b74 /* SeekHead */, 0x1043a770 /* Chapters */, 0x1941a469 /* Attachments */]);

interface Vint {
  value: number;
  length: number;
  /** all value bits set: "unknown size" */
  unknown: boolean;
}

function vint(b: Uint8Array, at: number, keepMarker: boolean): Vint | null {
  const first = b[at];
  if (first === undefined || first === 0) return null;
  const length = Math.clz32(first) - 23; // 1..8
  if (length > 8 || at + length > b.length) return null;
  let value = keepMarker ? first : first & (0xff >> length);
  let allOnes = value === (0xff >> length);
  for (let i = 1; i < length; i++) {
    value = value * 256 + b[at + i]!;
    if (b[at + i] !== 0xff) allOnes = false;
  }
  return { value, length, unknown: !keepMarker && allOnes };
}

function uint(b: Uint8Array, at: number, size: number): number {
  let v = 0;
  for (let i = 0; i < size; i++) v = v * 256 + b[at + i]!;
  return v;
}

export function webmDurationMs(bytes: Uint8Array): number | null {
  const head = vint(bytes, 0, true);
  if (!head || head.value !== EBML) return null;
  const headSize = vint(bytes, head.length, false);
  if (!headSize || headSize.unknown) return null;
  let at = head.length + headSize.length + headSize.value;
  const seg = vint(bytes, at, true);
  if (!seg || seg.value !== SEGMENT) return null;
  const segSize = vint(bytes, at + seg.length, false);
  if (!segSize) return null;
  at += seg.length + segSize.length;
  const end = segSize.unknown ? bytes.length : Math.min(bytes.length, at + segSize.value);

  let scaleNs = 1_000_000;
  let declared: number | null = null;
  let cluster: number | null = null; // the current cluster's timecode
  let clusterEnd = -1; // -1: not in a cluster; Infinity: an unknown-size cluster
  let latest: number | null = null; // in TimecodeScale units

  while (at < end) {
    const id = vint(bytes, at, true);
    if (!id) break;
    const size = vint(bytes, at + id.length, false);
    if (!size) break;
    const body = at + id.length + size.length;
    if (clusterEnd !== -1 && (at >= clusterEnd || LEVEL1.has(id.value))) {
      clusterEnd = -1;
      cluster = null;
    }
    if (id.value === CLUSTER) {
      clusterEnd = size.unknown ? Infinity : body + size.value;
      cluster = null;
      at = body; // descend
      continue;
    }
    if (size.unknown) break; // only Segment and Cluster may have an unknown size
    if (body + size.value > bytes.length) break; // a truncated element
    if (id.value === INFO) {
      at = body; // descend: TimecodeScale and Duration are its children
      continue;
    }
    if (id.value === TIMECODE_SCALE && size.value >= 1 && size.value <= 8) scaleNs = uint(bytes, body, size.value);
    else if (id.value === DURATION && (size.value === 4 || size.value === 8)) {
      const view = new DataView(bytes.buffer, bytes.byteOffset + body, size.value);
      declared = size.value === 4 ? view.getFloat32(0) : view.getFloat64(0);
    } else if (clusterEnd !== -1 && id.value === TIMECODE && size.value >= 1 && size.value <= 8) cluster = uint(bytes, body, size.value);
    else if (clusterEnd !== -1 && id.value === BLOCK_GROUP) {
      at = body; // descend to its Block
      continue;
    } else if (clusterEnd !== -1 && cluster !== null && (id.value === SIMPLE_BLOCK || id.value === BLOCK)) {
      const track = vint(bytes, body, false);
      if (track && body + track.length + 2 <= bytes.length) {
        const view = new DataView(bytes.buffer, bytes.byteOffset + body + track.length, 2);
        const t = cluster + view.getInt16(0);
        latest = latest === null ? t : Math.max(latest, t);
      }
    }
    at = body + size.value;
  }

  if (declared !== null && Number.isFinite(declared) && declared > 0) return Math.round((declared * scaleNs) / 1_000_000);
  if (latest === null) return null;
  return Math.max(Math.round((latest * scaleNs) / 1_000_000), 0);
}
