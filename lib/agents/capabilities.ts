/**
 * Capabilities (docs/design/agents.md §3): an agent stores provider-neutral capability ids, never tool names. At run
 * time they map to the tools that actually exist for the user's connections, so one agent works with Microsoft and
 * with Google, and a renamed tool never breaks a saved row. The list equals the array in
 * supabase/migrations/0006_agents.sql (agents_tools_known) — a test keeps them in sync.
 */
export const CAPABILITY_IDS = ["mail.read", "mail.draft", "mail.forward", "calendar.read", "calendar.write", "files.read", "files.save", "reminders", "morning"] as const;

export type Capability = (typeof CAPABILITY_IDS)[number];

/** read: no side effects · outbound: only ever a pending action (approval by button) · internal: the user's own data */
export type CapabilityKind = "read" | "outbound" | "internal";

export const CAPABILITIES: Record<Capability, { label: string; kind: CapabilityKind; tools: readonly string[] }> = {
  "mail.read": { label: "קריאת מייל", kind: "read", tools: ["search_emails", "get_email", "gmail_search_emails", "gmail_get_email", "gmail_get_thread", "gmail_awaiting_reply", "gmail_read_status"] },
  "mail.draft": { label: "טיוטות מייל", kind: "outbound", tools: ["draft_email", "gmail_draft_email"] },
  "mail.forward": { label: "העברת מיילים", kind: "outbound", tools: ["forward_email"] },
  "calendar.read": { label: "קריאת יומן", kind: "read", tools: ["list_events", "gcal_list_events", "gcal_free_slots"] },
  "calendar.write": { label: "שינויים ביומן", kind: "outbound", tools: ["create_event", "update_event", "delete_event", "gcal_create_event", "gcal_update_event", "gcal_delete_event"] },
  "files.read": { label: "חיפוש וקריאת קבצים", kind: "read", tools: ["search_files", "get_file_text", "gdrive_list_files", "gdrive_get_file_text"] },
  "files.save": { label: "שמירת מסמכים", kind: "internal", tools: ["gdrive_save_doc"] },
  reminders: { label: "תזכורות", kind: "internal", tools: ["create_reminder", "list_reminders", "cancel_reminder"] },
  morning: { label: "סיכום בוקר", kind: "internal", tools: ["set_morning_time"] },
};

/**
 * Tools only the main assistant gets. `remember_fact` writes to the shared memory — an agent's instructions must not
 * be able to plant facts that later steer עלזה (invariant I6). Agents still read the memory.
 */
export const MAIN_ONLY_TOOLS: readonly string[] = ["remember_fact"];

const TOOL_TO_CAPABILITY = new Map<string, Capability>(CAPABILITY_IDS.flatMap((c) => CAPABILITIES[c].tools.map((t) => [t, c] as const)));

export function isCapability(x: unknown): x is Capability {
  return typeof x === "string" && (CAPABILITY_IDS as readonly string[]).includes(x);
}

/** Known ids only, without duplicates, in the canonical order (unknown values are dropped). */
export function normalizeCapabilities(list: readonly unknown[]): Capability[] {
  const set = new Set(list.filter(isCapability));
  return CAPABILITY_IDS.filter((c) => set.has(c));
}

export function capabilityOfTool(toolName: string): Capability | null {
  return TOOL_TO_CAPABILITY.get(toolName) ?? null;
}

/**
 * The tools an agent may call: the full list (base + provider tools) filtered by its capabilities. A tool that maps
 * to no capability never reaches an agent (and a test fails, so every new tool is classified on purpose).
 */
export function toolsForAgent<T extends { name: string }>(all: readonly T[], capabilities: readonly Capability[]): T[] {
  const allowed = new Set(capabilities);
  return all.filter((t) => {
    if (MAIN_ONLY_TOOLS.includes(t.name)) return false;
    const cap = capabilityOfTool(t.name);
    return cap !== null && allowed.has(cap);
  });
}

/** "קריאת מייל, טיוטות מייל והעברת מיילים" */
export function capsLine(capabilities: readonly Capability[]): string {
  const labels = normalizeCapabilities(capabilities).map((c) => CAPABILITIES[c].label);
  if (labels.length <= 1) return labels[0] ?? "";
  return `${labels.slice(0, -1).join(", ")} ו${labels.at(-1)}`;
}

/** Ready-made capability bundles for the WhatsApp flow (full control is on the site) — docs/design/agents.md §9.2. */
export const TOOL_BUNDLES: readonly { id: string; title: string; capabilities: readonly Capability[] }[] = [
  { id: "mail_read", title: "מייל לקריאה", capabilities: ["mail.read"] },
  { id: "mail_draft", title: "מייל וטיוטות", capabilities: ["mail.read", "mail.draft"] },
  { id: "mail_forward", title: "מייל והעברות", capabilities: ["mail.read", "mail.draft", "mail.forward"] },
  { id: "calendar", title: "יומן ותזכורות", capabilities: ["calendar.read", "calendar.write", "reminders"] },
  { id: "files", title: "קבצים", capabilities: ["files.read"] },
  { id: "files_save", title: "קבצים ושמירת מסמכים", capabilities: ["files.read", "files.save"] },
  { id: "mail_calendar", title: "מייל, יומן ותזכורות", capabilities: ["mail.read", "mail.draft", "calendar.read", "calendar.write", "reminders", "morning"] },
  { id: "all", title: "הכול", capabilities: CAPABILITY_IDS },
];
