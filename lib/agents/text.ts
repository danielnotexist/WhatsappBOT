/**
 * Text folding for matching agent names (docs/design/agents.md §5.2): NFC, no niqqud / cantillation, one form of
 * geresh (׳ ' ’ → ') and gershayim (״ " “ ” → "), maqaf → hyphen, no zero-width or bidi characters, one space for any
 * run of whitespace, Latin lower-cased. `map[i]` is the index in the NFC original of folded character i, so a
 * caller can cut the original text right after a matched prefix.
 */
const SKIP = /[֑-ֽֿ-ׇ​-‏‪-‮⁦-⁩﻿]/;
const GERESH = /[׳‘’`´']/;
const GERSHAYIM = /[״“”„"]/;

export interface Folded {
  /** the NFC original */
  source: string;
  folded: string;
  /** folded index → source index (length folded.length + 1) */
  map: number[];
}

export function foldText(text: string): Folded {
  const source = text.normalize("NFC");
  let folded = "";
  const map: number[] = [];
  let i = 0;
  for (const ch of source) {
    const at = i;
    i += ch.length;
    if (SKIP.test(ch)) continue;
    let out = ch;
    if (ch === "־") out = "-";
    else if (GERESH.test(ch)) out = "'";
    else if (GERSHAYIM.test(ch)) out = '"';
    else if (/\s/.test(ch)) {
      if (folded.endsWith(" ")) continue;
      out = " ";
    } else out = ch.toLowerCase();
    folded += out;
    for (let k = 0; k < out.length; k++) map.push(at);
  }
  map.push(source.length);
  return { source, folded, map };
}

/** The comparison form of a name: folded and trimmed. */
export function foldName(name: string): string {
  return foldText(name).folded.trim();
}
