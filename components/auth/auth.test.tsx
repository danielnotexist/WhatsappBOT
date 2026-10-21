// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CodeStep, CodeStepFromUrl, digitsOnly, formatCountdown, waitFromParam } from "./code-step";
import { ConnectStep, adminMailto } from "./connect-step";
import { EmailStep, EmailStepFromUrl, looksLikeEmail } from "./email-step";
import { deckForPath, toneForPath } from "./signup-shell";
import { Toggle } from "./toggle";

const push = vi.fn();
const replace = vi.fn();
const prefetch = vi.fn();
let search = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace, prefetch, bfcacheId: "_b_1_" }),
  usePathname: () => "/start/email",
  useSearchParams: () => search,
}));

function mockFetch(handler: (url: string, body: Record<string, unknown>) => unknown) {
  const fn = vi.fn(async (url: string, init?: RequestInit) => {
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
    return new Response(JSON.stringify(handler(url, body)), { status: 200, headers: { "content-type": "application/json" } });
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

beforeEach(() => {
  document.documentElement.setAttribute("dir", "rtl");
  window.matchMedia = vi.fn().mockImplementation((q: string) => ({ matches: false, media: q, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  // input-otp probes for password-manager badges; jsdom has no layout
  document.elementFromPoint = () => null;
  push.mockClear();
  replace.mockClear();
  prefetch.mockClear();
  search = new URLSearchParams();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("helpers", () => {
  it("validates emails, formats the countdown and cleans pasted codes", () => {
    expect(looksLikeEmail("dana@levi-law.co.il")).toBe(true);
    expect(looksLikeEmail("dana@levi")).toBe(false);
    expect(looksLikeEmail("not an email")).toBe(false);
    expect(formatCountdown(42)).toBe("0:42");
    expect(formatCountdown(60)).toBe("1:00");
    expect(formatCountdown(0.2)).toBe("0:01");
    expect(digitsOnly("הקוד שלך: 123 456")).toBe("123456");
    expect(digitsOnly("1234567")).toBe("123456");
    expect(waitFromParam(null)).toBe(60);
    expect(waitFromParam("42")).toBe(42);
    expect(waitFromParam("900")).toBe(60);
    expect(waitFromParam("-5")).toBe(0);
    expect(waitFromParam("x")).toBe(0);
  });

  it("maps routes to card tones (cream → pink → sage → night)", () => {
    expect(toneForPath("/start")).toBeNull();
    expect(toneForPath("/start/email")).toBe("email");
    expect(toneForPath("/start/code")).toBe("code");
    expect(toneForPath("/start/connect")).toBe("connect");
    expect(toneForPath("/start/ready")).toBe("ready");
    expect(toneForPath("/login/email")).toBe("email");
    expect(toneForPath("/login/whatsapp")).toBe("connect");
  });

  it("keeps the papers still to come in the deck — signup only", () => {
    expect(deckForPath("/start/email")).toEqual(["code", "connect", "ready"]);
    expect(deckForPath("/start/code")).toEqual(["connect", "ready"]);
    expect(deckForPath("/start/connect")).toEqual(["ready"]);
    expect(deckForPath("/start/ready")).toEqual([]);
    expect(deckForPath("/login/email")).toEqual([]);
    expect(deckForPath("/start")).toEqual([]);
  });

  it("builds the IT-admin mail with the consent link", () => {
    const href = adminMailto("https://app.example.co.il/api/auth/microsoft/start?admin=1&t=abc");
    expect(href.startsWith("mailto:?subject=")).toBe(true);
    expect(decodeURIComponent(href)).toContain("https://app.example.co.il/api/auth/microsoft/start?admin=1&t=abc");
    expect(decodeURIComponent(href)).toContain("עלזה");
  });
});

describe("EmailStep", () => {
  it("keeps the button disabled until the email is valid; the updates toggle is off by default", async () => {
    const fetchMock = mockFetch(() => ({ ok: true, cooldownSeconds: 60 }));
    render(<EmailStep />);
    const button = screen.getByRole("button", { name: "שליחת קוד" });
    const toggle = screen.getByRole("switch", { name: "עדכונים וטיפים" });
    expect(button).toBeDisabled();
    expect(toggle).toHaveAttribute("aria-checked", "false");
    fireEvent.change(screen.getByLabelText("כתובת מייל"), { target: { value: "Dana@Levi-Law.co.il" } });
    expect(button).toBeEnabled();
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-checked", "true");
    await act(async () => {
      fireEvent.click(button);
    });
    expect(fetchMock).toHaveBeenCalledWith("/api/auth/otp/send", expect.objectContaining({ method: "POST" }));
    expect(push).toHaveBeenCalledWith("/start/code?email=dana%40levi-law.co.il&updates=1");
  });

  it("shows the server's Hebrew message and stays on the card when sending fails", async () => {
    mockFetch(() => ({ ok: false, code: "too_many", message: "יותר מדי קודים לכתובת הזו." }));
    render(<EmailStep mode="login" initialEmail="dana@levi-law.co.il" />);
    expect(screen.queryByRole("switch")).toBeNull(); // no newsletter toggle when signing in
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "שליחת קוד" }));
    });
    expect(screen.getByRole("alert")).toHaveTextContent("יותר מדי קודים לכתובת הזו.");
    expect(push).not.toHaveBeenCalled();
  });

  it("loads the code card ahead once the address looks valid", () => {
    render(<EmailStep mode="login" />);
    expect(prefetch).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("כתובת מייל"), { target: { value: "dana@levi-law.co.il" } });
    expect(prefetch).toHaveBeenCalledWith("/login/code");
  });

  it("reads ?email= and the opt-in from the URL on the client (\"שינוי מייל\")", () => {
    search = new URLSearchParams({ email: "dana@levi-law.co.il", updates: "1" });
    render(<EmailStepFromUrl />);
    expect(screen.getByLabelText("כתובת מייל")).toHaveValue("dana@levi-law.co.il");
    expect(screen.getByRole("switch", { name: "עדכונים וטיפים" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("button", { name: "שליחת קוד" })).toBeEnabled();
  });
});

describe("CodeStep", () => {
  it("counts down to the resend button", async () => {
    vi.useFakeTimers();
    mockFetch(() => ({ ok: true, cooldownSeconds: 60 }));
    render(<CodeStep email="dana@levi-law.co.il" initialWait={3} />);
    expect(screen.getByText("0:03")).toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3500);
    });
    expect(screen.getByRole("button", { name: "שליחה חוזרת" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "שינוי מייל" })).toHaveAttribute("href", "/start/email?email=dana%40levi-law.co.il");
  });

  it("submits on the sixth digit and follows the server's next step", async () => {
    const fetchMock = mockFetch(() => ({ ok: true, isNewUser: true, next: "/start/connect" }));
    render(<CodeStep email="dana@levi-law.co.il" updates />);
    const input = screen.getByRole("textbox", { name: "קוד בן 6 ספרות" });
    await act(async () => {
      fireEvent.change(input, { target: { value: "123456" } });
    });
    await vi.waitFor(() => expect(replace).toHaveBeenCalledWith("/start/connect"));
    const body = JSON.parse(String(fetchMock.mock.calls[0]![1]!.body));
    expect(body).toEqual({ email: "dana@levi-law.co.il", code: "123456", updates: true });
  });

  it("explains a wrong code with the attempts left", async () => {
    mockFetch(() => ({ ok: false, code: "invalid_code", message: "הקוד לא נכון.", attemptsLeft: 3 }));
    render(<CodeStep email="dana@levi-law.co.il" />);
    await act(async () => {
      fireEvent.change(screen.getByRole("textbox", { name: "קוד בן 6 ספרות" }), { target: { value: "000000" } });
    });
    await vi.waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("הקוד לא נכון. נשארו 3 ניסיונות."));
  });

  it("reads email / opt-in / cooldown from the URL on the client and loads the next screen ahead", async () => {
    search = new URLSearchParams({ email: "dana@levi-law.co.il", updates: "1", wait: "7" });
    const fetchMock = mockFetch(() => ({ ok: true, isNewUser: true, next: "/start/connect" }));
    render(<CodeStepFromUrl demoNote={<p role="note">הערה</p>} />);
    expect(screen.getByText("dana@levi-law.co.il")).toBeInTheDocument();
    expect(screen.getByText("0:07")).toBeInTheDocument();
    expect(screen.getByRole("note")).toHaveTextContent("הערה");
    expect(screen.getByRole("link", { name: "שינוי מייל" })).toHaveAttribute("href", "/start/email?email=dana%40levi-law.co.il&updates=1");
    expect(prefetch).toHaveBeenCalledWith("/start/connect");
    expect(replace).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.change(screen.getByRole("textbox", { name: "קוד בן 6 ספרות" }), { target: { value: "123456" } });
    });
    await vi.waitFor(() => expect(replace).toHaveBeenCalledWith("/start/connect"));
    expect(JSON.parse(String(fetchMock.mock.calls[0]![1]!.body))).toEqual({ email: "dana@levi-law.co.il", code: "123456", updates: true });
  });

  it("goes back to the email card when the URL has no email (login mode → /login/email, next /account)", () => {
    render(<CodeStepFromUrl mode="login" />);
    expect(replace).toHaveBeenCalledWith("/login/email");
    expect(prefetch).toHaveBeenCalledWith("/account");
  });
});

describe("ConnectStep and Toggle", () => {
  it("offers Microsoft first, then Gmail, then skip; shows the IT link only when needed", () => {
    const { rerender } = render(<ConnectStep />);
    const links = screen.getAllByRole("link").map((l) => l.textContent);
    expect(links).toEqual(["חיבור Microsoft 365 / Outlook", "חיבור Gmail", "דילוג בינתיים"]);
    rerender(<ConnectStep error="הארגון דורש אישור חד-פעמי של מנהל ה-IT." adminLink="https://x.example/a" />);
    expect(screen.getByRole("alert")).toHaveTextContent("מנהל ה-IT");
    expect(screen.getByRole("link", { name: "שליחה למנהל ה-IT" }).getAttribute("href")).toMatch(/^mailto:/);
  });

  it("Toggle is a labelled switch", () => {
    const onChange = vi.fn();
    render(<Toggle checked={false} onChange={onChange} label="עדכונים וטיפים" />);
    fireEvent.click(screen.getByRole("switch", { name: "עדכונים וטיפים" }));
    expect(onChange).toHaveBeenCalledWith(true);
  });
});
