// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Bubble } from "./bubble";
import { ChatDemo, DEMO_SCRIPT, finalState, type ChatStep } from "./chat-demo";
import { Confetti } from "./confetti";
import { Cta } from "./cta";
import { DraftCard } from "./draft-card";
import { Handwritten } from "./handwritten";
import { IncomingCall } from "./incoming-call";
import { MascotPlaceholder } from "./mascot-placeholder";
import { PhoneMockup } from "./phone-mockup";
import { Reveal } from "./reveal";
import { StepCard, StepProgress } from "./step-card";
import { TypingDots } from "./typing-dots";
import { VoiceNote } from "./voice-note";
import { WaButtons } from "./wa-buttons";
import { Wordmark } from "./wordmark";

const confettiCreate = vi.fn(() => Object.assign(vi.fn(), { reset: vi.fn() }));
vi.mock("canvas-confetti", () => ({ default: { create: confettiCreate } }));

function mockReducedMotion(reduce: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: reduce && query.includes("reduce"),
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

beforeEach(() => {
  document.documentElement.setAttribute("dir", "rtl");
  mockReducedMotion(false);
  // jsdom has no IntersectionObserver
  (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver = class {
    observe() {}
    disconnect() {}
  };
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  confettiCreate.mockClear();
});

describe("ChatDemo", () => {
  const script: ChatStep[] = [
    { kind: "out", text: "מה יש לי מחר?", time: "13:41", react: true },
    { kind: "typing", ms: 1000, wait: 200 },
    { kind: "in", text: "מחר: 09:00 פגישה", time: "13:41" },
    { kind: "buttons", time: "13:42", labels: ["שלח", "בטל"], replies: { שלח: "נשלח.", בטל: "בוטל." } },
  ];

  it("plays the script step by step with typing, then answers a button", async () => {
    vi.useFakeTimers();
    render(<ChatDemo script={script} loop={false} />);
    await act(() => vi.advanceTimersByTimeAsync(0)); // effects + start tick
    expect(screen.queryByText("מחר: 09:00 פגישה")).toBeNull();
    expect(screen.getByText("מה יש לי מחר?")).toBeInTheDocument();
    await act(() => vi.advanceTimersByTimeAsync(900)); // reaction + wait → typing
    expect(screen.getByRole("status", { name: "עלזה מקלידה" })).toBeInTheDocument();
    expect(screen.getByText("מקלידה…")).toBeInTheDocument();
    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(screen.getByText("מחר: 09:00 פגישה")).toBeInTheDocument();
    expect(screen.queryByRole("status")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "שלח" }));
    expect(screen.getByRole("button", { name: "שלח" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "בטל" })).toBeDisabled();
    await act(() => vi.advanceTimersByTimeAsync(1400));
    expect(screen.getByText("נשלח.")).toBeInTheDocument();
  });

  it("shows the whole conversation at once under reduced motion (no timers)", async () => {
    mockReducedMotion(true);
    vi.useFakeTimers();
    render(<ChatDemo script={script} />);
    await act(async () => {});
    expect(screen.getByText("מחר: 09:00 פגישה")).toBeInTheDocument();
    expect(screen.queryByRole("status")).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
    expect(screen.queryByRole("button", { name: "מההתחלה" })).toBeNull();
  });

  it("stops its timers when unmounted (AbortController)", async () => {
    vi.useFakeTimers();
    const { unmount } = render(<ChatDemo script={DEMO_SCRIPT} />);
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("finalState skips typing and keeps reactions", () => {
    const s = finalState(script);
    expect(s.map((m) => m.kind)).toEqual(["out", "in", "buttons"]);
    expect(s[0]).toMatchObject({ reaction: "✅" });
  });
});

describe("chat pieces", () => {
  it("Bubble puts the user's message on the end side with read ticks, עלזה's on the start side", () => {
    render(
      <>
        <Bubble side="out" time="10:00">
          אני
        </Bubble>
        <Bubble side="in" time="10:01" reaction="✅">
          עלזה
        </Bubble>
      </>,
    );
    expect(screen.getByText("אני").className).toContain("self-end");
    expect(screen.getByText("עלזה").className).toContain("self-start");
    expect(screen.getByText("✓✓")).toBeInTheDocument();
  });

  it("VoiceNote, DraftCard and TypingDots render their content", () => {
    render(
      <>
        <VoiceNote duration="0:34" transcript="תסכמי לי את היום" />
        <DraftCard draft={{ to: "a@b.co", subject: "נושא", body: "גוף" }} />
        <TypingDots />
      </>,
    );
    expect(screen.getByText("0:34")).toBeInTheDocument();
    expect(screen.getByText("״תסכמי לי את היום״")).toBeInTheDocument();
    expect(screen.getByText("a@b.co")).toHaveAttribute("dir", "ltr");
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("WaButtons locks after a choice and reports it", () => {
    const onChoose = vi.fn();
    render(<WaButtons labels={["שלח", "ערוך", "בטל"]} onChoose={onChoose} />);
    fireEvent.click(screen.getByRole("button", { name: "ערוך" }));
    expect(onChoose).toHaveBeenCalledWith("ערוך");
    expect(screen.getByRole("group", { name: "אישור הטיוטה" })).toBeInTheDocument();
  });
});

describe("frames and type", () => {
  it("PhoneMockup is a labelled region; IncomingCall is one described image", () => {
    render(
      <PhoneMockup label="עלזה מתקשרת">
        <IncomingCall />
      </PhoneMockup>,
    );
    expect(screen.getByRole("region", { name: "עלזה מתקשרת" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "עלזה מתקשרת אליך בוואטסאפ" })).toBeInTheDocument();
  });

  it("MascotPlaceholder is decorative unless labelled", () => {
    const { container } = render(<MascotPlaceholder />);
    expect(container.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    render(<MascotPlaceholder label="הדוכיפת של עלזה" pose="celebrate" />);
    expect(screen.getByRole("img", { name: "הדוכיפת של עלזה" })).toBeInTheDocument();
  });

  it("Wordmark links home with the brand name; Handwritten uses the hand font", () => {
    render(
      <>
        <Wordmark />
        <Handwritten>קודם כל</Handwritten>
      </>,
    );
    expect(screen.getByRole("link", { name: "עלזה — לדף הבית" })).toHaveAttribute("href", "/");
    expect(screen.getByText("קודם כל").className).toContain("font-hand");
  });

  it("Cta renders a link with href and a button otherwise", () => {
    render(
      <>
        <Cta href="/start/email">בואו נתחיל</Cta>
        <Cta tone="ink" type="submit" disabled>
          שליחת קוד
        </Cta>
        <Cta href="https://wa.me/972500000000" external>
          חיבור לוואטסאפ
        </Cta>
      </>,
    );
    expect(screen.getByRole("link", { name: "בואו נתחיל" })).toHaveAttribute("href", "/start/email");
    expect(screen.getByRole("button", { name: "שליחת קוד" })).toBeDisabled();
    expect(screen.getByRole("link", { name: "חיבור לוואטסאפ" })).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("StepCard flips to light tokens on light tones; StepProgress states the step", () => {
    render(
      <>
        <StepCard tone="code">
          <p>קוד</p>
        </StepCard>
        <StepCard tone="ready">
          <p>מוכנה</p>
        </StepCard>
        <StepProgress step={2} />
      </>,
    );
    expect(screen.getByText("קוד").closest("section")).toHaveClass("surface-light");
    expect(screen.getByText("מוכנה").closest("section")).not.toHaveClass("surface-light");
    expect(screen.getByText("שלב 2 מתוך 4")).toBeInTheDocument();
  });

  it("Reveal keeps content visible at rest", () => {
    render(
      <Reveal>
        <p>תוכן</p>
      </Reveal>,
    );
    expect(screen.getByText("תוכן")).toBeVisible();
  });
});

describe("Confetti", () => {
  it("fires once after the delay", async () => {
    vi.useFakeTimers();
    render(<Confetti delayMs={10} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20);
    });
    vi.useRealTimers();
    await vi.waitFor(() => expect(confettiCreate).toHaveBeenCalledTimes(1));
  });

  it("does nothing under reduced motion", async () => {
    mockReducedMotion(true);
    vi.useFakeTimers();
    render(<Confetti delayMs={10} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(50);
    });
    expect(confettiCreate).not.toHaveBeenCalled();
    expect(screen.getByTestId("confetti")).toHaveAttribute("aria-hidden", "true");
  });
});
