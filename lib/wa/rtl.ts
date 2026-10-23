/**
 * WhatsApp lays a line out by its first strong character: a Hebrew line that opens with an English term ("Google Drive:
 * רק קבצים…", "• Outlook — …") is shown left-to-right, with the Hebrew scrambled around it. The prompt asks the model
 * not to open a line in English; this makes it hold for every model and template: such a line gets a RIGHT-TO-LEFT
 * MARK (U+200F) in front. Lines that are English only, and lines that open with a link, are left as they are.
 */
const RLM = "‏";
const HEBREW = /[֐-׿]/;
/** the line's lead before its first letter: bullets, numbers, punctuation, markdown stars, spaces */
const LEAD = /^[\s•·*_~\-–—>#\d.,:;()"'״׳]*/u;

export function rtlLines(text: string): string {
  return text
    .split("\n")
    .map((line) => {
      if (!HEBREW.test(line) || line.startsWith(RLM)) return line;
      const rest = line.slice(line.match(LEAD)?.[0].length ?? 0);
      if (!/^[A-Za-z]/.test(rest) || /^(?:https?:\/\/|www\.)/i.test(rest)) return line;
      return RLM + line;
    })
    .join("\n");
}
