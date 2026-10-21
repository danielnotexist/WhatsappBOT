import { PRODUCT_NAME } from "@/lib/brand";
import type { ResolvedAgent } from "./policy";
import { foldName, foldText } from "./text";

/**
 * Who a message is addressed to (docs/design/agents.md §5.2). Only the START of the user's own message counts — never
 * mail, file or tool content (I7). In order:
 *   1. "@<name> …"                       → via "mention"   (unknown name → `unknown`)
 *   2. "סוכן: <name> …" / "סוכן <name>, …" → via "command"   (unknown name after "סוכן:" → `unknown`)
 *   3. "<name>, …" / "<name>: …" / "<name>" alone → via "vocative" (voice notes: transcription adds no "@")
 *   4. "@עלזה" / "עלזה, …" / "סיום" (the last only while an agent is sticky) → back to the main assistant.
 * Names match exactly after folding (niqqud, quote forms, spaces), the longest first ("מנהלת חשבונות" before "מנהלת").
 * Every resolved agent is matched whatever its status; the caller answers for disabled / locked / not-in-plan ones.
 */
export type AgentAddress =
  | { kind: "agent"; agent: ResolvedAgent; rest: string; via: "mention" | "command" | "vocative" }
  | { kind: "unknown"; name: string; rest: string }
  | { kind: "main"; rest: string };

const BOUNDARY = /^($|[\s,:;.!?\-–—])/;

interface Candidate {
  folded: string;
  agent: ResolvedAgent | null; // null = the main assistant (the product name)
}

function candidates(agents: readonly ResolvedAgent[]): Candidate[] {
  const list: Candidate[] = [{ folded: foldName(PRODUCT_NAME), agent: null }];
  for (const a of agents) for (const n of [a.name, ...a.aliases]) list.push({ folded: foldName(n), agent: a });
  return list.filter((c) => c.folded).sort((a, b) => b.folded.length - a.folded.length);
}

/** The candidate whose folded name starts `text` at `from`, followed by a word boundary. */
function matchAt(text: string, from: number, list: readonly Candidate[]): { cand: Candidate; end: number } | null {
  for (const cand of list) {
    if (text.startsWith(cand.folded, from) && BOUNDARY.test(text.slice(from + cand.folded.length))) return { cand, end: from + cand.folded.length };
  }
  return null;
}

function restAfter(f: ReturnType<typeof foldText>, foldedEnd: number): string {
  const rest = f.source.slice(f.map[foldedEnd] ?? f.source.length);
  const trimmed = rest.replace(/^[\s,:;\-–—]+/, "").trim();
  return /^[.!?…]*$/.test(trimmed) ? "" : trimmed;
}

function firstToken(text: string): string {
  return (text.match(/^[^\s,:;.!?]+/)?.[0] ?? "").slice(0, 40);
}

export function parseAgentAddress(text: string, agents: readonly ResolvedAgent[], opts: { sticky?: boolean } = {}): AgentAddress | null {
  const f = foldText(text);
  const lead = f.folded.length - f.folded.trimStart().length;
  const s = f.folded;
  const list = candidates(agents);
  const toResult = (m: { cand: Candidate; end: number }, via: "mention" | "command" | "vocative"): AgentAddress =>
    m.cand.agent ? { kind: "agent", agent: m.cand.agent, rest: restAfter(f, m.end), via } : { kind: "main", rest: restAfter(f, m.end) };

  // 1. @name
  if (s.startsWith("@", lead)) {
    const m = matchAt(s, lead + 1, list);
    if (m) return toResult(m, "mention");
    const name = firstToken(s.slice(lead + 1));
    if (!name) return null;
    return { kind: "unknown", name: firstToken(f.source.slice(f.map[lead + 1] ?? 0)), rest: restAfter(f, lead + 1 + name.length) };
  }

  // 2. סוכן: name / סוכן name, …
  const cmd = s.slice(lead).match(/^סוכן(\s*:\s*|\s+)/);
  if (cmd) {
    const from = lead + cmd[0].length;
    const m = matchAt(s, from, list);
    if (m) return toResult(m, "command");
    if (cmd[1]!.includes(":")) {
      const name = firstToken(s.slice(from));
      if (name) return { kind: "unknown", name: firstToken(f.source.slice(f.map[from] ?? 0)), rest: restAfter(f, from + name.length) };
    }
    return null;
  }

  // 3. vocative: "name, …" / "name: …" / the name alone
  const voc = matchAt(s, lead, list);
  if (voc) {
    const after = s.slice(voc.end);
    if (/^\s*[,:]/.test(after) || /^\s*[.!?…]*\s*$/.test(after)) return toResult(voc, "vocative");
  }

  // 4. "סיום" ends a sticky agent conversation
  if (opts.sticky && /^סיום\s*[.!]*\s*$/.test(s.slice(lead))) return { kind: "main", rest: "" };
  return null;
}
