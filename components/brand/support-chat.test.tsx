// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SUPPORT_COPY, SUPPORT_SUGGESTIONS } from "@/lib/support/types";
import { SupportChat } from "./support-chat";

type Call = { url: string; method: string; body: Record<string, unknown> | null };
let calls: Call[];
let chatReplies: Record<string, unknown>[];
let ticketReply: Record<string, unknown>;
let prefill: string | null;
/** resolves the next chat answer by hand (to see the typing dots) */
let hold: Promise<void> | null;

beforeEach(() => {
  document.documentElement.setAttribute("dir", "rtl");
  calls = [];
  chatReplies = [];
  ticketReply = { ok: true };
  prefill = null;
  hold = null;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null;
      calls.push({ url, method, body });
      if (url === "/api/support/ticket" && method === "GET") return Response.json({ ok: true, email: prefill });
      if (url === "/api/support/ticket") return Response.json(ticketReply, { status: ticketReply.ok ? 200 : 400 });
      if (hold) await hold;
      return Response.json(chatReplies.shift() ?? { ok: true, answer: "תשובה", ticket: false, suggestions: [], source: "kb", topic: null });
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const launcher = () => screen.getByRole("button", { name: SUPPORT_COPY.launcher });
const open = () => {
  fireEvent.click(launcher());
  return screen.getByRole("dialog", { name: SUPPORT_COPY.title });
};
const chatPosts = () => calls.filter((c) => c.url === "/api/support/chat");

describe("SupportChat — the launcher and the panel", () => {
  it("a round launcher at the bottom of the inline-start side (logical classes), closed at first", () => {
    render(<SupportChat />);
    const b = launcher();
    expect(b).toHaveAttribute("aria-expanded", "false");
    expect(b.className).toMatch(/\bstart-4\b/);
    expect(b.className).toMatch(/\bbottom-4\b/);
    expect(b.className).not.toMatch(/\b(left|right)-/);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("opens with the greeting, the four topic chips and the question field focused; Esc closes and focus returns", async () => {
    render(<SupportChat />);
    const dialog = open();
    expect(launcher()).toHaveAttribute("aria-expanded", "true");
    expect(launcher()).toHaveAttribute("aria-controls", dialog.id);
    expect(within(dialog).getByText(SUPPORT_COPY.greeting)).toBeInTheDocument();
    const chips = within(within(dialog).getByRole("list", { name: "נושאים" })).getAllByRole("button");
    expect(chips.map((c) => c.textContent)).toEqual([...SUPPORT_SUGGESTIONS]);
    expect(within(dialog).getByRole("log")).toHaveAttribute("aria-live", "polite");
    expect(document.activeElement).toBe(within(dialog).getByLabelText(SUPPORT_COPY.inputLabel));

    fireEvent.keyDown(within(dialog).getByLabelText(SUPPORT_COPY.inputLabel), { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(launcher()));
  });

  it("a chip asks its question: the typing dots, then the answer in the log; the chips step aside", async () => {
    let release!: () => void;
    hold = new Promise((r) => (release = r));
    chatReplies.push({ ok: true, answer: "שני מסלולים: 99 ₪ ו-299 ₪.", ticket: false, suggestions: [], source: "kb", topic: "pricing" });
    render(<SupportChat />);
    const dialog = open();
    fireEvent.click(within(dialog).getByRole("button", { name: "כמה זה עולה?" }));
    expect(within(dialog).getByRole("status", { name: SUPPORT_COPY.typing })).toBeInTheDocument();
    expect(chatPosts()[0]!.body).toEqual({ message: "כמה זה עולה?", history: [], chatId: expect.stringMatching(/^[0-9a-f-]{36}$/), page: "/" });
    // the conversation is stored for the support team, and the panel says so
    expect(within(dialog).getByText(SUPPORT_COPY.savedNotice)).toBeInTheDocument();
    await act(async () => release());
    const log = within(dialog).getByRole("log");
    expect(await within(log).findByText("שני מסלולים: 99 ₪ ו-299 ₪.")).toBeInTheDocument();
    expect(within(log).getByText("כמה זה עולה?")).toBeInTheDocument();
    expect(within(dialog).queryByRole("status", { name: SUPPORT_COPY.typing })).toBeNull();
    expect(within(dialog).queryByRole("list", { name: "נושאים" })).toBeNull();
    // the night card for her, honey for the visitor (not WhatsApp's grey/green)
    expect(within(log).getByText("שני מסלולים: 99 ₪ ו-299 ₪.").className).toContain("bg-night-2");
    expect(within(log).getByText("שני מסלולים: 99 ₪ ו-299 ₪.").className).not.toContain("--wa-in");
  });

  it("a typed question goes with Enter, with the earlier turns (not the greeting) as history", async () => {
    render(<SupportChat />);
    const dialog = open();
    const input = within(dialog).getByLabelText(SUPPORT_COPY.inputLabel);
    fireEvent.change(input, { target: { value: "איך מתחברים?" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await within(dialog).findByText("תשובה");
    fireEvent.change(input, { target: { value: "ואיך מבטלים?" } });
    fireEvent.click(within(dialog).getByRole("button", { name: SUPPORT_COPY.send }));
    await waitFor(() => expect(chatPosts()).toHaveLength(2));
    expect(chatPosts()[1]!.body).toEqual({
      message: "ואיך מבטלים?",
      history: [
        { role: "user", text: "איך מתחברים?" },
        { role: "assistant", text: "תשובה" },
      ],
      chatId: chatPosts()[0]!.body!.chatId, // one id for the whole conversation
      page: "/",
    });
    expect(chatPosts()[0]!.body!.chatId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("the 'not sure' answer brings the chips back and offers a ticket; an error is shown as an alert", async () => {
    chatReplies.push({ ok: true, answer: SUPPORT_COPY.fallback, ticket: true, suggestions: [...SUPPORT_SUGGESTIONS], source: "kb", topic: null });
    chatReplies.push({ ok: false, code: "rate_limited", message: "הרבה הודעות ברצף. אפשר לנסות שוב בעוד כמה דקות." });
    render(<SupportChat />);
    const dialog = open();
    const input = within(dialog).getByLabelText(SUPPORT_COPY.inputLabel);
    fireEvent.change(input, { target: { value: "מה מזג האוויר?" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await within(dialog).findByText(SUPPORT_COPY.fallback);
    expect(within(dialog).getByRole("list", { name: "נושאים" })).toBeInTheDocument();
    expect(within(dialog).getAllByRole("button", { name: SUPPORT_COPY.openTicket })).toHaveLength(2); // under the answer + the footer
    fireEvent.click(within(dialog).getByRole("button", { name: "איך מתחברים?" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("הרבה הודעות ברצף");
  });
});

describe("SupportChat — פתיחת פנייה", () => {
  it("the form: prefilled address, field errors, the chat attached, then the confirmation in focus", async () => {
    prefill = "noa@example.com";
    render(<SupportChat />);
    const dialog = open();
    const input = within(dialog).getByLabelText(SUPPORT_COPY.inputLabel);
    fireEvent.change(input, { target: { value: "יש לי תקלה" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await within(dialog).findByText("תשובה");

    fireEvent.click(within(dialog).getAllByRole("button", { name: SUPPORT_COPY.openTicket }).at(-1)!);
    expect(within(dialog).getByRole("heading", { name: SUPPORT_COPY.ticketTitle })).toBeInTheDocument();
    const name = within(dialog).getByLabelText("שם");
    expect(document.activeElement).toBe(name);
    await waitFor(() => expect(within(dialog).getByLabelText("אימייל")).toHaveValue("noa@example.com"));

    // nothing filled → the first missing field in focus, with its line
    fireEvent.click(within(dialog).getByRole("button", { name: SUPPORT_COPY.submitTicket }));
    expect(within(dialog).getByText("צריך למלא שם.")).toBeInTheDocument();
    expect(name).toHaveAttribute("aria-invalid", "true");
    expect(document.activeElement).toBe(name);
    expect(calls.some((c) => c.url === "/api/support/ticket" && c.method === "POST")).toBe(false);

    fireEvent.change(name, { target: { value: "נועה" } });
    fireEvent.change(within(dialog).getByLabelText("תיאור"), { target: { value: "החיבור ל-Outlook נופל כל יום." } });
    expect(within(dialog).getByLabelText(SUPPORT_COPY.attachChat)).toBeChecked();
    fireEvent.click(within(dialog).getByRole("button", { name: SUPPORT_COPY.submitTicket }));
    const heading = await within(dialog).findByRole("heading", { name: SUPPORT_COPY.ticketDone });
    expect(document.activeElement).toBe(heading);
    const post = calls.find((c) => c.url === "/api/support/ticket" && c.method === "POST")!;
    expect(post.body).toEqual({
      name: "נועה",
      email: "noa@example.com",
      subject: "",
      body: "החיבור ל-Outlook נופל כל יום.",
      transcript: [
        { role: "user", text: "יש לי תקלה" },
        { role: "assistant", text: "תשובה" },
      ],
      website: "",
    });
    expect(SUPPORT_COPY.ticketDone).toBe("הפנייה התקבלה. נחזור אליך במייל תוך יום עסקים.");
    fireEvent.click(within(dialog).getByRole("button", { name: SUPPORT_COPY.backToChat }));
    expect(within(dialog).getByRole("log")).toBeInTheDocument();
  });

  it("without a chat there is nothing to attach; the server's field errors are shown; the honeypot is out of reach", async () => {
    ticketReply = { ok: false, code: "invalid", message: "חסרים פרטים בטופס.", fields: { email: "כתובת המייל לא תקינה." } };
    render(<SupportChat />);
    const dialog = open();
    fireEvent.click(within(dialog).getByRole("button", { name: SUPPORT_COPY.openTicket }));
    expect(within(dialog).queryByLabelText(SUPPORT_COPY.attachChat)).toBeNull();
    const honeypot = dialog.querySelector<HTMLInputElement>('input[name="website"]')!;
    expect(honeypot).toHaveAttribute("tabindex", "-1");
    expect(honeypot.closest("[aria-hidden='true']")).not.toBeNull();
    fireEvent.change(within(dialog).getByLabelText("שם"), { target: { value: "דנה" } });
    fireEvent.change(within(dialog).getByLabelText("אימייל"), { target: { value: "dana@" } });
    fireEvent.change(within(dialog).getByLabelText("תיאור"), { target: { value: "שאלה על חשבונית" } });
    fireEvent.click(within(dialog).getByRole("button", { name: SUPPORT_COPY.submitTicket }));
    expect(await within(dialog).findByText("כתובת המייל לא תקינה.")).toBeInTheDocument();
    expect(within(dialog).getByLabelText("אימייל")).toHaveAttribute("aria-invalid", "true");
    expect(calls.find((c) => c.method === "POST")!.body).toMatchObject({ transcript: null });
  });
});
