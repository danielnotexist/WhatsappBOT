/**
 * Hebrew for the share images (next/og → satori): satori lays every text run out left to right in logical order and
 * has no bidi algorithm, so Hebrew would come out mirrored ("הזלע" for "עלזה"). This turns a line into its visual
 * order ourselves, one unit per word, so the layout can still wrap:
 *   - the units are placed right to left (the caller's flex row is `row-reverse` + `wrap`, so a wrapped line starts at
 *     the right, as Hebrew does);
 *   - inside a unit, Hebrew (and the punctuation around it) is reversed, while Latin words and numbers keep their own
 *     order ("ב-Outlook" → "Outlook-ב", "09:30" stays "09:30");
 *   - consecutive words without Hebrew ("Microsoft 365") stay one unit, in their own order;
 *   - brackets are mirrored when reversed.
 * Hebrew letters have no joining forms (final letters are their own characters), so reversing the code points is
 * exactly the visual order. Niqqud is not supported (the copy has none).
 */

const HEBREW = /[֐-׿יִ-ﭏ]/;
/** a run that reads left to right: Latin letters and digits, with the punctuation that sits between them (09:30, 2.1.2027, 1,200) */
const LTR_RUN = /[A-Za-z0-9À-ɏ](?:[A-Za-z0-9À-ɏ.:,/%+&'_-]*[A-Za-z0-9À-ɏ%])?/g;
const MIRROR: Record<string, string> = { "(": ")", ")": "(", "[": "]", "]": "[", "{": "}", "}": "{", "<": ">", ">": "<", "«": "»", "»": "«" };

const reverseRtl = (s: string) =>
  [...s]
    .reverse()
    .map((c) => MIRROR[c] ?? c)
    .join("");

/** One word in visual order (as it is drawn left to right). */
export function visualWord(word: string): string {
  if (!HEBREW.test(word)) {
    // a Latin word in a Hebrew line: its own letters left to right, the punctuation around it on the Hebrew side
    // ("Outlook," → ",Outlook")
    const m = /^([^A-Za-z0-9À-ɏ]*)(.*?)([^A-Za-z0-9À-ɏ%]*)$/.exec(word)!;
    return m[2] ? `${reverseRtl(m[3]!)}${m[2]}${reverseRtl(m[1]!)}` : reverseRtl(word);
  }
  const segments: { text: string; ltr: boolean }[] = [];
  let last = 0;
  for (const m of word.matchAll(LTR_RUN)) {
    if (m.index! > last) segments.push({ text: word.slice(last, m.index), ltr: false });
    segments.push({ text: m[0], ltr: true });
    last = m.index! + m[0].length;
  }
  if (last < word.length) segments.push({ text: word.slice(last), ltr: false });
  return segments
    .reverse()
    .map((s) => (s.ltr ? s.text : reverseRtl(s.text)))
    .join("");
}

/**
 * A line of mixed Hebrew text → its units in reading order (the first unit is the rightmost), each already in visual
 * order. Lay them out with `flexDirection: "row-reverse"` and `flexWrap: "wrap"`.
 */
export function rtlUnits(text: string): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const units: string[] = [];
  for (const w of words) {
    const prev = units.length ? units[units.length - 1]! : null;
    // Latin words in a row stay together, left to right
    if (prev !== null && !HEBREW.test(w) && !HEBREW.test(prev) && /[A-Za-z0-9]/.test(w)) units[units.length - 1] = `${prev} ${w}`;
    else units.push(w);
  }
  return units.map(visualWord);
}
