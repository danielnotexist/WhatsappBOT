import type { BotContext } from "@/lib/bot/context";
import { payLinkFor } from "@/lib/billing/pay-link";
import { acopy, agentButtons, agentLists, type AgentListLine } from "@/lib/copy/bot-agents";
import type { AgentKey, BuiltinRole, SubscriptionRow, UserRow } from "@/lib/db/types";
import type { InboundMessage, ListRow } from "@/lib/wa/types";
import { TOOL_BUNDLES, capsLine, normalizeCapabilities, type Capability } from "./capabilities";
import { MAX_INSTRUCTIONS } from "./constraints";
import { AGENT_DRAFT_TTL_MS, AGENT_STICKY_MS, activeAgents, cleanInstructions, customKey, findAgentByKey, findAgentByName, parseAgentKey, parseRecipients, sanitizeName, validateAgentName, type ResolvedAgent } from "./policy";
import { parseAgentAddress } from "./routing";
import { AGENT_FAIL_MESSAGES, canCreateCustom, createAgentFor, deleteAgentFor, loadAgents, setAgentEnabledFor, updateAgentFor, type AgentResult, type UserAgents } from "./service";
import { BUILTIN_AGENTS, BUILTIN_ORDER } from "./templates";
import { foldName } from "./text";

/**
 * Step 5b of the pipeline (docs/design/agents.md §5.1, §9): everything about agents that needs no model and is not
 * counted against the trial — `ag:` buttons, the create / edit flows (`profile.agent_draft`), the management commands,
 * and addresses that cannot go to the model (an unknown, disabled, locked or not-in-plan agent; "@מזכירה" alone).
 * Anything else comes back as a routing decision for step 7: the explicit agent, or the choices the router may pick
 * from plus the sticky agent.
 */
export type AgentStep =
  | { handled: true; note: string }
  | {
      handled: false;
      /** the text for the assistant (after an explicit address: only the rest) */
      text: string;
      agent: ResolvedAgent | null;
      via?: "mention" | "command" | "vocative";
      choices: ResolvedAgent[];
      /** the sticky agent, when still valid and active */
      activeKey: string | null;
      /** the message went back to the main assistant explicitly ("@עלזה …") */
      clearSticky: boolean;
    };

export interface StickyAgent {
  key: string;
  until: string;
}

type NewDraft = {
  mode: "new";
  step: "template" | "name" | "instructions" | "tools" | "choose_tools" | "recipients" | "confirm";
  template: BuiltinRole | null;
  name?: string;
  /** blank agent: the instructions; template: what the user added on top */
  additions?: string;
  capabilities?: Capability[];
  recipients?: string[];
  updatedAt: string;
};
type EditDraft = { mode: "edit"; key: AgentKey; field: "instructions" | "tools" | "recipients"; updatedAt: string };
type AgentDraft = NewDraft | EditDraft;

// ---------------------------------------------------------------- commands

export type AgentCommand = { kind: "list" } | { kind: "new"; template: BuiltinRole | "blank" | null } | { kind: "edit" | "disable" | "enable" | "delete"; name: string };

const LIST_RE = /^(סוכנים|הסוכנים|הסוכנים שלי|רשימת (ה)?סוכנים|מה הסוכנים יודעים לעשות|אילו סוכנים יש לי)$/;
const NEW_RE = /^(סוכן חדש|ליצור סוכן( חדש)?|יצירת סוכן( חדש)?)(\s+(.+))?$/;
const NAMED: [AgentCommand["kind"], RegExp][] = [
  ["edit", /^(עריכת (ה)?סוכן|לערוך (את )?(ה)?סוכן)\s+(.+)$/],
  ["disable", /^(השבתת (ה)?סוכן|להשבית (את )?(ה)?סוכן|כיבוי (ה)?סוכן|לכבות (את )?(ה)?סוכן)\s+(.+)$/],
  ["enable", /^(הפעלת (ה)?סוכן|להפעיל (את )?(ה)?סוכן)\s+(.+)$/],
  ["delete", /^(מחיקת (ה)?סוכן|למחוק (את )?(ה)?סוכן)\s+(.+)$/],
];

/** Management commands — whole messages only, matched without the model (§9.1). */
export function parseAgentCommand(raw: string): AgentCommand | null {
  const text = raw.normalize("NFC").replace(/\s+/g, " ").trim().replace(/[.!?]+$/, "").trim();
  if (LIST_RE.test(text)) return { kind: "list" };
  const n = text.match(NEW_RE);
  if (n) return { kind: "new", template: n[5] ? templateFromText(n[5]) : null };
  for (const [kind, re] of NAMED) {
    const m = text.match(re);
    if (m) return { kind, name: sanitizeName(m[m.length - 1]!) } as AgentCommand;
  }
  return null;
}

function templateFromText(text: string): BuiltinRole | "blank" | null {
  const f = foldName(sanitizeName(text));
  if (f === "ריק" || f === "סוכן ריק") return "blank";
  return BUILTIN_ORDER.find((r) => [BUILTIN_AGENTS[r].name, ...BUILTIN_AGENTS[r].aliases].some((n) => foldName(n) === f)) ?? null;
}

// ---------------------------------------------------------------- entry

/**
 * Whether the create / edit flow is waiting for typed text (a name, instructions, addresses). Earlier pipeline steps
 * that match whole-message commands (billing: "חשבוניות", "קבלה"…) leave such a message to the flow.
 */
export function agentDraftAwaitsText(user: UserRow, now: Date): boolean {
  const d = user.profile.agent_draft as AgentDraft | null | undefined;
  if (!d || typeof d !== "object" || !d.updatedAt || Date.parse(d.updatedAt) + AGENT_DRAFT_TTL_MS <= now.getTime()) return false;
  if (d.mode === "edit") return d.field === "instructions" || d.field === "recipients";
  return d.step === "name" || d.step === "instructions" || d.step === "recipients";
}

export async function handleAgentMessage(ctx: BotContext, user: UserRow, msg: InboundMessage, text: string, sub: SubscriptionRow | null): Promise<AgentStep> {
  const now = ctx.now();
  const state = await loadAgents(ctx.db, user.id, now, sub);
  const t = new Turn(ctx, user, msg.fromE164, state);
  const reply = msg.reply?.id ?? null;

  // 1. agent buttons and list replies
  if (reply?.startsWith("ag:")) {
    await t.button(reply);
    return { handled: true, note: "agent button" };
  }

  // 2. the next message of an open create / edit flow (text or a transcribed voice note). A question that expects a
  //    choice does not trap the user: an unrelated message drops the draft and goes on as a normal message.
  const draft = t.draft();
  if (draft && msg.type === "text" && (await t.draftText(draft, text))) return { handled: true, note: "agent draft" };

  // 3. management commands
  const command = parseAgentCommand(text);
  if (command) {
    await t.command(command);
    return { handled: true, note: `agent ${command.kind}` };
  }

  // 4. who the message is addressed to
  const sticky = t.sticky();
  let address = parseAgentAddress(text, state.agents, { sticky: Boolean(sticky) });
  const choices = activeAgents(state.agents);
  if (address?.kind === "unknown") {
    await t.say(acopy["agent.not_found"](address.name, state.agents.filter((a) => a.status !== "not_in_plan").map((a) => a.name)));
    return { handled: true, note: "agent unknown" };
  }
  if (address?.kind === "main") {
    if (!address.rest) {
      await t.setSticky(null);
      await t.say(acopy["agent.back_to_main"]());
      return { handled: true, note: "agent back to main" };
    }
    // an explicit "@עלזה <request>": the main assistant answers — no agent choices for the router, stickiness cleared
    return { handled: false, text: address.rest, agent: null, choices: [], activeKey: null, clearSticky: true };
  }
  if (address?.kind === "agent" && address.agent.status !== "active" && address.via === "vocative") {
    // "המזכירה, דנה ביקשה…" from a basic user, or a disabled / locked agent's name used as an ordinary word: not an
    // explicit address — the whole message goes on as it is
    address = null;
  }
  if (address?.kind === "agent") {
    const a = address.agent;
    if (a.status !== "active") {
      await t.say(t.unavailable(a));
      return { handled: true, note: `agent ${a.status}` };
    }
    if (!address.rest) {
      await t.setSticky(a.key);
      await t.say(acopy["agent.hello"](a.name, capsLine(a.capabilities)));
      return { handled: true, note: "agent hello" };
    }
    return { handled: false, text: address.rest, agent: a, via: address.via, choices, activeKey: null, clearSticky: false };
  }
  const activeKey = sticky && choices.some((a) => a.key === sticky.key) ? sticky.key : null;
  return { handled: false, text, agent: null, choices, activeKey, clearSticky: false };
}

/** After an assistant turn: the agent that answered stays sticky for 10 minutes; a main-assistant turn clears it. */
export async function updateStickyAfterTurn(ctx: BotContext, user: UserRow, answeredBy: string | null, hadSticky: boolean): Promise<void> {
  if (answeredBy) await ctx.db.mergeUserProfile(user.id, { active_agent: { key: answeredBy, until: new Date(ctx.now().getTime() + AGENT_STICKY_MS).toISOString() } satisfies StickyAgent });
  else if (hadSticky) await ctx.db.mergeUserProfile(user.id, { active_agent: null });
}

// ---------------------------------------------------------------- one turn

/**
 * One 5b turn. Everything it sends is stored with `hidden_from_model` (and the pipeline hides the inbound message it
 * answered): agent management — a dictated instruction above all — never reaches the model's history or the summary.
 */
class Turn {
  private readonly payLink: string;

  constructor(
    private readonly ctx: BotContext,
    private readonly user: UserRow,
    private readonly to: string,
    private readonly state: UserAgents,
  ) {
    this.payLink = payLinkFor(ctx.appUrl, user.id);
  }

  async say(text: string): Promise<void> {
    await this.ctx.wa.sendText(this.to, text);
    await this.ctx.db.insertMessage({ user_id: this.user.id, direction: "out", type: "text", text, hidden_from_model: true });
  }

  private async buttons(text: string, buttons: Parameters<BotContext["wa"]["sendButtons"]>[2]): Promise<void> {
    await this.ctx.wa.sendButtons(this.to, text, buttons);
    await this.ctx.db.insertMessage({ user_id: this.user.id, direction: "out", type: "button", text, hidden_from_model: true });
  }

  private async list(text: string, button: string, title: string, rows: ListRow[]): Promise<void> {
    await this.ctx.wa.sendList(this.to, text, button, [{ title, rows }]);
    await this.ctx.db.insertMessage({ user_id: this.user.id, direction: "out", type: "button", text, hidden_from_model: true });
  }

  // ---- profile state ----

  draft(): AgentDraft | null {
    const d = this.user.profile.agent_draft as AgentDraft | null | undefined;
    if (!d || typeof d !== "object" || !d.updatedAt) return null;
    return Date.parse(d.updatedAt) + AGENT_DRAFT_TTL_MS > this.ctx.now().getTime() ? d : null;
  }

  private async saveDraft(d: AgentDraft | null): Promise<void> {
    await this.ctx.db.mergeUserProfile(this.user.id, { agent_draft: d ? { ...d, updatedAt: this.ctx.now().toISOString() } : null });
  }

  sticky(): StickyAgent | null {
    const s = this.user.profile.active_agent as StickyAgent | null | undefined;
    return s && typeof s.key === "string" && Date.parse(s.until) > this.ctx.now().getTime() ? s : null;
  }

  async setSticky(key: string | null): Promise<void> {
    await updateStickyAfterTurn(this.ctx, this.user, key, true);
  }

  // ---- texts that depend on the plan ----

  unavailable(a: ResolvedAgent): string {
    if (a.status === "disabled") return acopy["agent.disabled"](a.name);
    if (a.status === "locked") return acopy["agent.locked"](a.name, this.payLink);
    return acopy["agent.builtin_needs_pro"](a.name, this.payLink);
  }

  private failure(r: Extract<AgentResult, { ok: false }>, name = ""): string {
    switch (r.code) {
      case "limit_trial":
        return acopy["agent.limit.trial"](this.payLink);
      case "limit_basic":
        return acopy["agent.limit.basic"](r.detail ?? name, this.payLink);
      case "limit_pro":
        return acopy["agent.limit.pro"]();
      case "builtin_needs_pro":
        return acopy["agent.builtin_needs_pro"](name, this.payLink);
      case "trial_builtin_edit":
        return acopy["agent.trial_builtin_edit"](this.payLink);
      case "builtin_no_delete":
        return acopy["agent.delete.builtin"](name);
      case "locked":
        return acopy["agent.locked"](name, this.payLink);
      case "recipients_invalid":
        return acopy["agent.error"](r.detail ? `הכתובת ״${r.detail}״ לא נראית תקינה.` : r.message);
      default:
        return acopy["agent.error"](r.message);
    }
  }

  private quotaLine(): string {
    const used = this.state.agents.filter((a) => a.kind === "custom").length;
    return this.state.plan === "trial" ? acopy["agent.quota.trial"]() : this.state.plan === "basic" ? acopy["agent.quota.basic"](used) : acopy["agent.quota.pro"](used);
  }

  // ---- commands ----

  async command(c: AgentCommand): Promise<void> {
    if (c.kind === "list") {
      const lines: AgentListLine[] = this.state.agents.map((a) => ({ name: a.name, capsLine: capsLine(a.capabilities), state: a.status }));
      await this.say(acopy["agent.list"](lines, this.quotaLine()));
      return;
    }
    if (c.kind === "new") {
      await this.startNew(c.template);
      return;
    }
    const agent = findAgentByName(this.state.agents, c.name);
    if (!agent) {
      await this.say(acopy["agent.not_found"](c.name, this.state.agents.filter((a) => a.status !== "not_in_plan").map((a) => a.name)));
      return;
    }
    if (agent.kind === "builtin" && this.state.plan !== "pro") {
      await this.say(this.state.plan === "trial" ? acopy["agent.trial_builtin_edit"](this.payLink) : acopy["agent.builtin_needs_pro"](agent.name, this.payLink));
      return;
    }
    if (c.kind === "edit") await this.editMenu(agent);
    else if (c.kind === "delete") await this.confirmDelete(agent);
    else await this.toggle(agent, c.kind === "enable");
  }

  private async startNew(template: BuiltinRole | "blank" | null): Promise<void> {
    const room = canCreateCustom(this.state);
    if (!room.ok) {
      await this.ctx.db.addAudit({ user_id: this.user.id, action: "agent.limit", target: "new", reason: "whatsapp", result: this.state.plan });
      await this.say(this.failure({ ok: false, code: room.code, message: AGENT_FAIL_MESSAGES[room.code], detail: room.existing }));
      return;
    }
    if (template === null) {
      await this.saveDraft({ mode: "new", step: "template", template: null, updatedAt: "" });
      const rows: ListRow[] = [...BUILTIN_ORDER.map((r) => ({ id: `ag:tpl:${r}`, title: BUILTIN_AGENTS[r].name, description: BUILTIN_AGENTS[r].summary })), agentLists.blankRow];
      await this.list(acopy["agent.new.ask_template"](), agentLists.templateButton, agentLists.templateTitle, rows);
      return;
    }
    await this.chooseTemplate(template === "blank" ? null : template);
  }

  private async chooseTemplate(template: BuiltinRole | null): Promise<void> {
    await this.saveDraft({ mode: "new", step: "name", template, updatedAt: "" });
    await this.buttons(acopy["agent.new.ask_name"](template ? BUILTIN_AGENTS[template].name : null), agentButtons.cancel);
  }

  private async editMenu(agent: ResolvedAgent): Promise<void> {
    await this.saveDraft(null);
    // a locked agent (over the quota after a downgrade) has no enable / disable: its state is the plan's, not a switch
    const toggle = agent.status === "locked" ? null : agent.status === "disabled" ? "enable" : "disable";
    await this.list(acopy["agent.edit.menu"](agent.name), agentLists.editButton, agentLists.editTitle, agentLists.editRows(agent.key, agent.kind === "builtin", toggle));
  }

  private async confirmDelete(agent: ResolvedAgent): Promise<void> {
    if (agent.kind === "builtin" || !agent.rowId) {
      await this.say(acopy["agent.delete.builtin"](agent.name));
      return;
    }
    await this.buttons(acopy["agent.delete.confirm"](agent.name), agentButtons.deleteConfirm(agent.rowId));
  }

  private async toggle(agent: ResolvedAgent, enabled: boolean): Promise<void> {
    const r = await setAgentEnabledFor(this.ctx.db, this.user.id, agent.key, enabled, { source: "whatsapp", now: this.ctx.now() });
    if (!r.ok) return this.say(this.failure(r, agent.name));
    if (r.agent.status === "locked") return this.say(acopy["agent.locked"](r.agent.name, this.payLink));
    await this.say(enabled ? acopy["agent.edit.enabled"](r.agent.name) : acopy["agent.edit.disabled"](r.agent.name));
  }

  // ---- buttons ----

  async button(id: string): Promise<void> {
    if (id === "ag:cancel") {
      const d = this.draft();
      await this.saveDraft(null);
      await this.say(d?.mode === "edit" ? acopy["agent.edit.cancelled"]() : acopy["agent.new.cancelled"]());
      return;
    }
    const del = id.match(/^ag:del:(yes|no):([0-9a-f-]{36})$/);
    if (del) {
      if (del[1] === "no") return this.say(acopy["agent.delete.kept"]());
      const r = await deleteAgentFor(this.ctx.db, this.user.id, customKey(del[2]!), { source: "whatsapp", now: this.ctx.now() });
      return this.say(r.ok ? acopy["agent.delete.done"](r.agent.name) : this.failure(r));
    }
    const ed = id.match(/^ag:ed:(instructions|tools|recipients|toggle|delete):(builtin:(?:secretary|intern|bookkeeper)|custom:[0-9a-f-]{36})$/);
    if (ed) return this.editField(ed[1] as "instructions" | "tools" | "recipients" | "toggle" | "delete", ed[2] as AgentKey);

    const draft = this.draft();
    if (!draft) return this.say(acopy["agent.new.expired"]());
    const tpl = id.match(/^ag:tpl:(secretary|intern|bookkeeper|blank)$/);
    if (tpl && draft.mode === "new") return this.chooseTemplate(tpl[1] === "blank" ? null : (tpl[1] as BuiltinRole));
    const bundle = id.match(/^ag:tb:([a-z_]+)$/);
    if (bundle) {
      const b = TOOL_BUNDLES.find((x) => x.id === bundle[1]);
      if (b) return draft.mode === "new" ? this.afterTools({ ...draft, capabilities: normalizeCapabilities(b.capabilities) }) : this.saveEdit(draft, { capabilities: b.capabilities });
    }
    if (draft.mode === "new") {
      if (id === "ag:inst:none" && draft.step === "instructions" && draft.template) return this.afterInstructions({ ...draft, additions: "" });
      if (id === "ag:tools:ok" && draft.step === "tools") return this.afterTools(draft);
      if (id === "ag:tools:change" && (draft.step === "tools" || draft.step === "choose_tools")) return this.chooseTools(draft);
      if (id === "ag:rcp:none" && draft.step === "recipients") return this.confirmNew({ ...draft, recipients: [] });
      if (id === "ag:save" && draft.step === "confirm") return this.saveNew(draft);
    } else if (id === "ag:rcp:none" && draft.field === "recipients") {
      return this.saveEdit(draft, { recipients: "" });
    }
    await this.say(acopy["agent.new.expired"]());
  }

  private async editField(field: "instructions" | "tools" | "recipients" | "toggle" | "delete", key: AgentKey): Promise<void> {
    const agent = parseAgentKey(key) ? findAgentByKey(this.state.agents, key) : null;
    if (!agent) return this.say(acopy["agent.new.expired"]()); // deleted since the menu was sent
    if (agent.kind === "builtin" && this.state.plan !== "pro") {
      return this.say(this.state.plan === "trial" ? acopy["agent.trial_builtin_edit"](this.payLink) : acopy["agent.builtin_needs_pro"](agent.name, this.payLink));
    }
    if (field === "toggle") return this.toggle(agent, agent.status === "disabled");
    if (field === "delete") return this.confirmDelete(agent);
    await this.saveDraft({ mode: "edit", key, field, updatedAt: "" });
    if (field === "instructions") return this.buttons(acopy["agent.edit.ask_instructions"](agent.name, agent.kind === "builtin"), agentButtons.cancel);
    if (field === "recipients") return this.buttons(acopy["agent.edit.ask_recipients"](agent.name), [...agentButtons.recipientsNone, ...agentButtons.cancel]);
    await this.list(acopy["agent.edit.ask_tools"](agent.name), agentLists.toolsButton, agentLists.toolsTitle, this.bundleRows(agent.kind === "builtin" ? BUILTIN_AGENTS[agent.role as BuiltinRole].capabilities : null));
  }

  /** The bundles as list rows; for a built-in, each bundle ∩ its template's capabilities (narrowing only), without empties or repeats. */
  private bundleRows(within: readonly Capability[] | null): ListRow[] {
    const seen = new Set<string>();
    const rows: ListRow[] = [];
    for (const b of TOOL_BUNDLES) {
      const caps = within ? b.capabilities.filter((c) => within.includes(c)) : [...b.capabilities];
      const sig = caps.join(",");
      if (!caps.length || seen.has(sig)) continue;
      seen.add(sig);
      const description = capsLine(caps);
      rows.push({ id: `ag:tb:${b.id}`, title: b.title, description: description.length > 72 ? `${description.slice(0, 71)}…` : description });
    }
    return rows.slice(0, 10);
  }

  // ---- the create flow ----

  /**
   * The answer to the open question. Free-text questions (name, instructions, recipients) take the message; questions
   * that expect a choice (template, capabilities, save) take only a matching answer — anything else drops the draft
   * and returns false, so the message goes on to the assistant instead of trapping the user for 30 minutes.
   */
  async draftText(draft: AgentDraft, text: string): Promise<boolean> {
    const done = async (p: Promise<void>) => {
      await p;
      return true;
    };
    const abandon = async () => {
      await this.saveDraft(null);
      return false;
    };
    const t = text.trim();
    if (/^ביטול[.!]?$/.test(t)) return done(this.button("ag:cancel"));
    if (draft.mode === "edit") return this.editText(draft, text);
    switch (draft.step) {
      case "template": {
        const tpl = templateFromText(text);
        return tpl ? done(this.chooseTemplate(tpl === "blank" ? null : tpl)) : abandon();
      }
      case "name": {
        const check = validateAgentName(text, this.state.rows);
        if (!check.ok) return done(this.buttons(acopy["agent.new.name_invalid"](AGENT_FAIL_MESSAGES[`name_${check.reason}`]), agentButtons.cancel));
        await this.saveDraft({ ...draft, step: "instructions", name: check.name });
        if (draft.template) return done(this.buttons(acopy["agent.new.ask_instructions_template"](BUILTIN_AGENTS[draft.template].name), [...agentButtons.instructionsNone, ...agentButtons.cancel]));
        return done(this.buttons(acopy["agent.new.ask_instructions_blank"](), agentButtons.cancel));
      }
      case "instructions": {
        const additions = cleanInstructions(text);
        if (!additions) return done(this.buttons(acopy["agent.new.instructions_invalid"](AGENT_FAIL_MESSAGES.instructions_empty), agentButtons.cancel));
        if ([...this.composeInstructions(draft.template, additions)].length > MAX_INSTRUCTIONS) return done(this.buttons(acopy["agent.new.instructions_invalid"](AGENT_FAIL_MESSAGES.instructions_too_long), agentButtons.cancel));
        return done(this.afterInstructions({ ...draft, additions }));
      }
      case "tools": {
        if (/^(מתאים|כן|אישור|בסדר)[.!]?$/.test(t)) return done(this.afterTools(draft));
        if (/^(לשנות|שינוי)[.!]?$/.test(t)) return done(this.chooseTools(draft));
        return abandon();
      }
      case "choose_tools": {
        const b = TOOL_BUNDLES.find((x) => foldName(x.title) === foldName(text));
        return b ? done(this.afterTools({ ...draft, capabilities: normalizeCapabilities(b.capabilities) })) : abandon();
      }
      case "recipients": {
        if (/^(בלי הגבלה|ללא הגבלה|אין)[.!]?$/.test(t)) return done(this.confirmNew({ ...draft, recipients: [] }));
        const parsed = parseRecipients(text);
        if (!parsed.ok || !parsed.recipients.length) {
          const reason = !parsed.ok && parsed.reason === "too_many" ? AGENT_FAIL_MESSAGES.recipients_too_many : !parsed.ok && parsed.bad ? `הכתובת ״${parsed.bad}״ לא נראית תקינה.` : AGENT_FAIL_MESSAGES.recipients_invalid;
          return done(this.buttons(acopy["agent.new.recipients_invalid"](reason), [...agentButtons.recipientsNone, ...agentButtons.cancel]));
        }
        return done(this.confirmNew({ ...draft, recipients: parsed.recipients }));
      }
      case "confirm":
        return /^(שמירה|לשמור|כן|שמור)[.!]?$/.test(t) ? done(this.saveNew(draft)) : abandon();
    }
  }

  private composeInstructions(template: BuiltinRole | null, additions: string): string {
    return template ? [BUILTIN_AGENTS[template].instructions, additions].filter(Boolean).join("\n\n") : additions;
  }

  private async afterInstructions(draft: NewDraft): Promise<void> {
    if (draft.template) {
      const caps = normalizeCapabilities(BUILTIN_AGENTS[draft.template].capabilities);
      await this.saveDraft({ ...draft, step: "tools", capabilities: caps });
      return this.buttons(acopy["agent.new.ask_tools"](capsLine(caps)), [...agentButtons.tools, ...agentButtons.cancel]);
    }
    return this.chooseTools(draft);
  }

  private async chooseTools(draft: NewDraft): Promise<void> {
    await this.saveDraft({ ...draft, step: "choose_tools" });
    await this.list(acopy["agent.new.choose_tools"](), agentLists.toolsButton, agentLists.toolsTitle, this.bundleRows(null));
  }

  private async afterTools(draft: NewDraft): Promise<void> {
    const caps = draft.capabilities ?? [];
    if (!caps.length) return this.chooseTools(draft);
    if (caps.includes("mail.forward")) {
      await this.saveDraft({ ...draft, step: "recipients", capabilities: caps });
      return this.buttons(acopy["agent.new.ask_recipients"](), [...agentButtons.recipientsNone, ...agentButtons.cancel]);
    }
    return this.confirmNew({ ...draft, capabilities: caps, recipients: [] });
  }

  private async confirmNew(draft: NewDraft): Promise<void> {
    await this.saveDraft({ ...draft, step: "confirm" });
    await this.buttons(
      acopy["agent.new.summary"]({ name: draft.name ?? "", templateName: draft.template ? BUILTIN_AGENTS[draft.template].name : null, capsLine: capsLine(draft.capabilities ?? []), recipients: draft.recipients ?? [], instructions: draft.additions ?? "" }),
      agentButtons.save,
    );
  }

  private async saveNew(draft: NewDraft): Promise<void> {
    const r = await createAgentFor(
      this.ctx.db,
      this.user.id,
      { name: draft.name ?? "", template: draft.template, instructions: this.composeInstructions(draft.template, draft.additions ?? ""), capabilities: draft.capabilities ?? [], recipients: draft.recipients ?? [] },
      { source: "whatsapp", now: this.ctx.now() },
    );
    if (!r.ok) {
      if (r.code.startsWith("name_")) {
        await this.saveDraft({ ...draft, step: "name" });
        return this.buttons(acopy["agent.new.name_invalid"](r.message), agentButtons.cancel);
      }
      await this.saveDraft(null);
      return this.say(this.failure(r));
    }
    await this.saveDraft(null);
    await this.say(r.approvalNote ? `${acopy["agent.created"](r.agent.name)}\n\n${acopy["agent.approval_note"]()}` : acopy["agent.created"](r.agent.name));
  }

  // ---- the edit flow ----

  private async editText(draft: EditDraft, text: string): Promise<boolean> {
    if (draft.field === "instructions") await this.saveEdit(draft, { instructions: /^ריק[.!]?$/.test(text.trim()) ? "" : text });
    else if (draft.field === "recipients") await this.saveEdit(draft, { recipients: /^(בלי הגבלה|ללא הגבלה|אין)[.!]?$/.test(text.trim()) ? "" : text });
    else {
      const b = TOOL_BUNDLES.find((x) => foldName(x.title) === foldName(text));
      if (!b) {
        await this.saveDraft(null); // a choice was expected: let the message through
        return false;
      }
      await this.saveEdit(draft, { capabilities: b.capabilities });
    }
    return true;
  }

  private async saveEdit(draft: EditDraft, patch: { instructions?: string; capabilities?: readonly Capability[]; recipients?: string }): Promise<void> {
    const r = await updateAgentFor(this.ctx.db, this.user.id, draft.key, patch, { source: "whatsapp", now: this.ctx.now() });
    if (!r.ok) {
      const agent = findAgentByKey(this.state.agents, draft.key);
      if (r.code === "recipients_invalid" || r.code === "recipients_too_many" || r.code === "instructions_too_long" || r.code === "instructions_empty" || r.code === "no_capabilities") {
        await this.saveDraft(draft); // keep the question open
        return this.buttons(this.failure(r, agent?.name), agentButtons.cancel);
      }
      await this.saveDraft(null);
      return this.say(this.failure(r, agent?.name));
    }
    await this.saveDraft(null);
    await this.say(r.approvalNote ? `${acopy["agent.edit.saved"](r.agent.name)}\n\n${acopy["agent.approval_note"]()}` : acopy["agent.edit.saved"](r.agent.name));
  }
}
