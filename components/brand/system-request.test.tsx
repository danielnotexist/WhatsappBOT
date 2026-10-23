// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BRAND } from "@/lib/brand";
import { SYSTEM_REQUEST_COPY as T } from "@/lib/support/types";
import { SystemRequest } from "./system-request";

type Call = { url: string; method: string; body: Record<string, unknown> | null };
let calls: Call[];
let reply: Record<string, unknown>;
let prefill: string | null;

beforeEach(() => {
  document.documentElement.setAttribute("dir", "rtl");
  calls = [];
  reply = { ok: true };
  prefill = null;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      calls.push({ url, method, body: init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null });
      if (method === "GET") return Response.json({ ok: true, email: prefill });
      return Response.json(reply, { status: reply.ok ? 200 : 400 });
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function openDialog() {
  render(<SystemRequest />);
  fireEvent.click(screen.getByRole("button", { name: T.trigger }));
  return screen.findByRole("dialog", { name: T.title });
}
const posts = () => calls.filter((c) => c.method === "POST");

describe("בקשת מערכת - the dialog", () => {
  it("opens from its trigger as a named dialog with the lead, the four fields (business type optional) and a hidden honeypot", async () => {
    const dialog = await openDialog();
    expect(dialog).toHaveAccessibleDescription(T.lead);
    expect(T.lead).toContain(BRAND.name);
    expect(within(dialog).getByLabelText(T.system)).toBeRequired();
    // focus starts in the first field, not on the close button
    await waitFor(() => expect(within(dialog).getByLabelText(T.system)).toHaveFocus());
    expect(within(dialog).getByLabelText(T.want)).toBeRequired();
    expect(within(dialog).getByLabelText(T.email)).toHaveAttribute("type", "email");
    expect(within(dialog).getByLabelText(`${T.business} ${T.optional}`)).not.toBeRequired();
    const honeypot = dialog.querySelector<HTMLInputElement>("input[name=website]")!;
    expect(honeypot).toHaveAttribute("tabindex", "-1");
    expect(honeypot.closest("[aria-hidden=true]")).not.toBeNull();
  });

  it("prefills the email when signed in (the field stays editable)", async () => {
    prefill = "noa@example.com";
    const dialog = await openDialog();
    await waitFor(() => expect(within(dialog).getByLabelText(T.email)).toHaveValue("noa@example.com"));
    expect(calls[0]).toMatchObject({ url: "/api/support/ticket", method: "GET" });
  });

  it("checks the required fields before sending, with a Hebrew line on each and focus on the first", async () => {
    const dialog = await openDialog();
    fireEvent.click(within(dialog).getByRole("button", { name: T.submit }));
    const system = within(dialog).getByLabelText(T.system);
    expect(system).toHaveAttribute("aria-invalid", "true");
    expect(system).toHaveAccessibleDescription(T.errors.system);
    expect(within(dialog).getByLabelText(T.want)).toHaveAccessibleDescription(T.errors.want);
    expect(system).toHaveFocus();
    expect(posts()).toHaveLength(0);
  });

  it("sends kind 'system' with the answers, then confirms in place", async () => {
    const dialog = await openDialog();
    fireEvent.change(within(dialog).getByLabelText(T.system), { target: { value: "חשבשבת" } });
    fireEvent.change(within(dialog).getByLabelText(T.want), { target: { value: "להוציא דוח הכנסות חודשי" } });
    fireEvent.change(within(dialog).getByLabelText(T.email), { target: { value: "ron@example.com" } });
    fireEvent.click(within(dialog).getByRole("button", { name: T.submit }));
    expect(await within(dialog).findByRole("heading", { name: T.done })).toHaveFocus();
    expect(posts()[0]!.body).toEqual({ kind: "system", system: "חשבשבת", want: "להוציא דוח הכנסות חודשי", email: "ron@example.com", business: "", website: "" });
    expect(within(dialog).getByRole("status")).toHaveTextContent(T.doneLead);
  });

  it("shows the server's line per field, or its message", async () => {
    reply = { ok: false, code: "invalid", message: "חסרים פרטים בטופס.", fields: { email: "כתובת המייל לא תקינה." } };
    const dialog = await openDialog();
    fireEvent.change(within(dialog).getByLabelText(T.system), { target: { value: "Notion" } });
    fireEvent.change(within(dialog).getByLabelText(T.want), { target: { value: "לחפש בדפים של הצוות" } });
    fireEvent.change(within(dialog).getByLabelText(T.email), { target: { value: "x@y" } });
    fireEvent.click(within(dialog).getByRole("button", { name: T.submit }));
    await waitFor(() => expect(within(dialog).getByLabelText(T.email)).toHaveAccessibleDescription("כתובת המייל לא תקינה."));
    reply = { ok: false, code: "rate_limited", message: "נשלחו כבר כמה פניות מכאן. אפשר לנסות שוב בעוד שעה." };
    fireEvent.change(within(dialog).getByLabelText(T.email), { target: { value: "x@y.co" } });
    fireEvent.click(within(dialog).getByRole("button", { name: T.submit }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("נשלחו כבר כמה פניות מכאן");
  });

  it("closes on 'ביטול' and opens a fresh form next time", async () => {
    const dialog = await openDialog();
    fireEvent.change(within(dialog).getByLabelText(T.system), { target: { value: "Notion" } });
    fireEvent.click(within(dialog).getByRole("button", { name: T.cancel }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    fireEvent.click(screen.getByRole("button", { name: T.trigger }));
    expect(within(await screen.findByRole("dialog")).getByLabelText(T.system)).toHaveValue("");
  });

  it("source: logical classes only, no hard-coded brand name", () => {
    const src = readFileSync(join(__dirname, "system-request.tsx"), "utf8");
    expect(src.includes(BRAND.name)).toBe(false);
    expect(src).not.toMatch(/\b(ml|mr|pl|pr|left|right)-[\w[]/);
  });
});
