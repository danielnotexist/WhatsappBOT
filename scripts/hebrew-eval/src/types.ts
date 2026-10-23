/** Dataset item — schema owned by dataset/messages.json (written by the dataset agent). */
export interface DatasetMessage {
  id: string;
  persona: string;
  text: string;
  expected_intent: string;
  /** "simple" | "complex" */
  expected_complexity: string;
  must_do: string[];
  must_not_do: string[];
  notes?: string;
  /** Optional extension (not required by the base schema): explicit tool expectations. */
  expected_tools?: string[];
  /** Optional extension: the user already gave explicit confirmation for an outbound action in this message. */
  confirmed?: boolean;
  /** Optional extension: the online_meeting value a create_event / update_event call should carry (Teams/Meet link or not). */
  expected_online_meeting?: boolean;
}

/** dataset/context.json — the mocked M365/Google world the tools search in. */
export interface EvalContext {
  profile: Record<string, unknown>;
  emails: Record<string, unknown>[];
  events: Record<string, unknown>[];
  files: Record<string, unknown>[];
  reminders: Record<string, unknown>[];
  /** Optional: fixed "today" (ISO date) so the eval is reproducible. */
  today?: string;
}

export interface Usage {
  in: number;
  out: number;
  cacheRead: number;
  cacheWrite: number;
}

export interface ToolCallRecord {
  id: string;
  name: string;
  input: Record<string, unknown>;
  result?: unknown;
  round: number;
}

export interface ModelRun {
  text: string;
  toolCalls: ToolCallRecord[];
  usage: Usage;
  /** Total wall time for the message (both rounds). */
  latencyMs: number;
  firstRoundLatencyMs: number;
  costUsd: number | null;
  rounds: number;
  stopReason?: string;
  /** The model asked for more tools after the single allowed round-trip. */
  toolLoopTruncated?: boolean;
}

export interface EvalRecord {
  runId: string;
  modelId: string;
  modelName: string;
  message: DatasetMessage;
  result?: ModelRun;
  error?: string;
  attempts: number;
  ts: string;
  dryRun: boolean;
}

/** Deterministic checks (no LLM). */
export interface Checks {
  hasResponse: boolean;
  hebrewRatio: number;
  brokenDirectionLines: number;
  brokenLineSamples: string[];
  toolsCalled: string[];
  expectedTools: string[];
  /** null = no expectation could be derived for this message. */
  expectedToolCalled: boolean | null;
  userConfirmed: boolean;
  /** send_email called with user_confirmed=true although the user did not confirm. */
  unconfirmedSend: boolean;
  /** Reply claims a completed outbound action ("שלחתי", "קבעתי") without confirmation. */
  claimedCompletion: boolean;
  /** Tools were called on a message that expects none (simple / small talk). */
  unnecessaryToolCall: boolean;
  /**
   * Every create_event / update_event call carried the expected online_meeting value. null = no expectation, or no such
   * call (asking a clarifying question instead is not judged here).
   */
  onlineMeetingOk: boolean | null;
  toolLoopTruncated: boolean;
}

export interface Dimension {
  id: string;
  label: string;
  description: string;
}

export interface JudgeVerdict {
  scores: Record<string, number | null>;
  verdict: string;
  failure: string;
  quote: string;
  judgeUsage?: Usage;
  judgeCostUsd?: number | null;
  judgeError?: string;
}

export interface ScoreRecord {
  messageId: string;
  modelId: string;
  modelName: string;
  persona: string;
  expectedIntent: string;
  expectedComplexity: string;
  userText: string;
  responseText: string;
  error?: string;
  scores: Record<string, number | null>;
  /** Mean of the dimension scores after deterministic overrides (0-5). */
  overall: number;
  checks: Checks;
  judge: JudgeVerdict;
  /** ts of the eval record that was judged — a re-run record (newer ts) is judged again */
  evalTs?: string;
  latencyMs: number | null;
  firstRoundLatencyMs: number | null;
  costUsd: number | null;
  usage: Usage | null;
}

export interface ScoresFile {
  runId: string;
  createdAt: string;
  dryRun: boolean;
  judgeModel: string;
  dimensions: Dimension[];
  rubricSource: string;
  records: ScoreRecord[];
}
