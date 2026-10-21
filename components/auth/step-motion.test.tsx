// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import { Activity, useRef, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StepPaper, useLateResizeMorph } from "@/components/brand/step-card";
import { cardTones } from "@/lib/design/tokens";
import { ENTRANCE_RISE } from "./entrance";
import { StepAside, StepBody } from "./step-slots";

/*
 * The wiring of the step motion (the pure rules are in entrance.test.ts): what the slots and the paper do when React
 * mounts them, hides them (<Activity>, the router's back/forward cache) and shows them again. jsdom has no Web
 * Animations, so `animate` is a spy; motion itself never uses it here (it only takes WAAPI from Element.prototype).
 */

let pathname = "/start/email";
vi.mock("next/navigation", () => ({ usePathname: () => pathname }));

// prefers-reduced-motion: motion reads the media query once per module and then follows its "change" event
let reduceMotion = false;
const motionListeners: Array<() => void> = [];
function setReducedMotion(on: boolean) {
  reduceMotion = on;
  for (const listener of motionListeners) listener();
}

let now = 1000;
const animate = vi.fn(function (this: HTMLElement, _keyframes: Keyframe[], _options?: KeyframeAnimationOptions) {
  void _keyframes;
  void _options;
  return { cancel: vi.fn(), finish: vi.fn(), onfinish: null, playState: "running" } as unknown as Animation;
});

beforeEach(() => {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    get matches() {
      return query.includes("reduced-motion") ? reduceMotion : false;
    },
    media: query,
    addEventListener: (_: string, listener: () => void) => motionListeners.push(listener),
    removeEventListener: vi.fn(),
  }));
  vi.spyOn(performance, "now").mockImplementation(() => now);
  Object.defineProperty(HTMLElement.prototype, "animate", { value: animate, configurable: true, writable: true });
  animate.mockClear();
  setReducedMotion(false);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  delete (HTMLElement.prototype as Partial<HTMLElement>).animate;
});

/** the reference entrance (/login/whatsapp → /login/email): fade + 10px rise */
const ENTRANCE_KEYFRAMES = [
  { opacity: 0, transform: `translateY(${ENTRANCE_RISE}px)` },
  { opacity: 1, transform: "none" },
];
const entranceCalls = () => animate.mock.calls.filter(([keyframes]) => JSON.stringify(keyframes) === JSON.stringify(ENTRANCE_KEYFRAMES));

function Step({ mode, children = "מה המייל שלך?" }: { mode: "visible" | "hidden"; children?: ReactNode }) {
  return (
    <Activity mode={mode}>
      <StepAside>{children}</StepAside>
      <StepBody>שדה</StepBody>
    </Activity>
  );
}

describe("step slots — the entrance on mount, hide and show", () => {
  it("a step the router shows again after a page without steps replays the reference entrance; an instant re-show does not", () => {
    pathname = "/start/email";
    const { rerender } = render(<Step mode="visible" />);
    now += 2000;
    // "התנאים" → /terms: the signup is hidden; browser back 3 seconds later shows it again
    rerender(<Step mode="hidden" />);
    now += 3000;
    rerender(<Step mode="visible" />);
    const calls = entranceCalls();
    expect(calls).toHaveLength(2); // the question, then the answer
    expect(calls.map(([, options]) => options?.delay)).toEqual([100, 160]);
    expect(calls[0]![1]).toMatchObject({ duration: 420, fill: "backwards", easing: "cubic-bezier(0.22, 1, 0.36, 1)" });

    // hidden and shown again within one commit (React re-running effects): nothing to replay
    animate.mockClear();
    rerender(<Step mode="hidden" />);
    rerender(<Step mode="visible" />);
    expect(entranceCalls()).toHaveLength(0);
  });

  it("a step shown again after another step replays it", () => {
    pathname = "/start/code";
    const { rerender } = render(<Step mode="visible" />);
    rerender(<Step mode="hidden" />);
    pathname = "/start/connect"; // the next step takes the slots
    const next = render(<Step mode="visible" />);
    next.unmount();
    pathname = "/start/code"; // back
    rerender(<Step mode="visible" />);
    expect(entranceCalls()).toHaveLength(2);
  });

  it("a fresh step starts hidden for its entrance; a remount of the same step after its entrance does not start over", () => {
    pathname = "/login/email";
    const first = render(<StepAside>א</StepAside>);
    const fresh = first.container.querySelector<HTMLElement>("[data-slot=step-aside]")!;
    expect(fresh.style.opacity).toBe("0");
    now += 5000; // the entrance is long over; the same screen mounts its slot again (a fallback giving way)
    const second = render(<StepAside>ב</StepAside>);
    expect(second.container.querySelector<HTMLElement>("[data-slot=step-aside]")!.style.opacity).not.toBe("0");
  });

  it("reduced motion: no entrance at all, not even when a step is shown again", () => {
    setReducedMotion(true);
    pathname = "/login/code";
    const { rerender, container } = render(<Step mode="visible" />);
    expect(container.querySelector<HTMLElement>("[data-slot=step-aside]")!.style.opacity).not.toBe("0");
    rerender(<Step mode="hidden" />);
    now += 3000;
    rerender(<Step mode="visible" />);
    expect(animate).not.toHaveBeenCalled();
  });
});

/** what jsdom makes of a colour (it serialises to rgb()) */
function cssColor(value: string): string {
  const probe = document.createElement("div");
  probe.style.backgroundColor = value;
  return probe.style.backgroundColor;
}

describe("StepPaper", () => {
  it("reduced motion: the new paper colour is written in the step's own commit (never the previous paper under it)", async () => {
    setReducedMotion(true);
    const { rerender, container } = render(<StepPaper tone="email" />);
    const paper = container.querySelector<HTMLElement>("[data-paper]")!;
    expect(paper.style.backgroundColor).toBe(cssColor(cardTones.email.bg));
    rerender(<StepPaper tone="code" />);
    // synchronously after the commit — no animation frame in between…
    expect(paper.style.backgroundColor).toBe(cssColor(cardTones.code.bg));
    // …and still after motion's own render of its values (a microtask after every commit), before any frame
    await Promise.resolve();
    await Promise.resolve();
    expect(paper.style.backgroundColor).toBe(cssColor(cardTones.code.bg));
    expect(paper.style.boxShadow).not.toBe("");
    // no CSS transition either: the global reduced-motion rule would turn the colour change into a 0.01ms transition
    // whose first frame is the old colour
    expect(paper).toHaveClass("transition-none");
    expect(animate).not.toHaveBeenCalled();
  });

  it("shown again after the shell was off screen, the paper enters like the shell does; not on an instant re-show", () => {
    const view = (mode: "visible" | "hidden") => (
      <Activity mode={mode}>
        <StepPaper tone="email" />
      </Activity>
    );
    const { rerender } = render(view("visible"));
    rerender(view("hidden"));
    rerender(view("visible"));
    expect(animate).not.toHaveBeenCalled();
    rerender(view("hidden"));
    now += 4000;
    rerender(view("visible"));
    expect(animate).toHaveBeenCalledWith(
      [
        { opacity: 0, transform: "translateY(18px)" },
        { opacity: 1, transform: "none" },
      ],
      expect.objectContaining({ duration: 550, fill: "backwards" }),
    );
  });
});

describe("useLateResizeMorph — a size change after the step morphs instead of jumping", () => {
  // jsdom has no layout: sizes come from data-w / data-h, and the observer is fired by hand
  let observed: ResizeObserverCallback | null = null;
  beforeEach(() => {
    observed = null;
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(callback: ResizeObserverCallback) {
          observed = callback;
        }
        observe() {}
        disconnect() {}
      },
    );
    vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockImplementation(function (this: HTMLElement) {
      return Number(this.dataset.h ?? 0);
    });
    vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockImplementation(function (this: HTMLElement) {
      return Number(this.dataset.w ?? 480);
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  function Shell({ tick }: { tick: number }) {
    const grid = useRef<HTMLDivElement>(null);
    const paper = useRef<HTMLDivElement>(null);
    useLateResizeMorph(grid, paper);
    return (
      <div ref={grid} data-testid="grid" data-h={400} data-tick={tick}>
        <div ref={paper} data-testid="paper" data-h={400} />
      </div>
    );
  }
  function grow(el: HTMLElement, h: number) {
    el.dataset.h = String(h);
  }
  const fire = () => act(() => observed!([], {} as ResizeObserver));

  it("late growth (a streamed part, a notice): the paper goes from its old height to the new one, the grid untouched", () => {
    const { getByTestId } = render(<Shell tick={0} />);
    fire(); // the first observation: nothing changed
    expect(animate).not.toHaveBeenCalled();
    grow(getByTestId("grid"), 452);
    grow(getByTestId("paper"), 452);
    fire();
    expect(animate).toHaveBeenCalledTimes(1);
    expect(animate.mock.contexts[0]).toBe(getByTestId("paper"));
    expect(animate).toHaveBeenCalledWith(
      [
        { height: "400px", marginBottom: "52px" },
        { height: "452px", marginBottom: "0px" },
      ],
      { duration: 550, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
    );
  });

  it("a change that came with a render of the shell (a step change) is left to motion's layout morph", () => {
    const { getByTestId, rerender } = render(<Shell tick={0} />);
    grow(getByTestId("grid"), 452);
    grow(getByTestId("paper"), 452);
    rerender(<Shell tick={1} />); // measured in that commit
    fire();
    expect(animate).not.toHaveBeenCalled();
  });

  it("a width change (window resize, breakpoint) is not morphed", () => {
    const { getByTestId } = render(<Shell tick={0} />);
    getByTestId("grid").dataset.w = "360";
    grow(getByTestId("grid"), 520);
    grow(getByTestId("paper"), 520);
    fire();
    expect(animate).not.toHaveBeenCalled();
  });

  it("nothing under reduced motion", () => {
    setReducedMotion(true);
    const { getByTestId } = render(<Shell tick={0} />);
    grow(getByTestId("grid"), 452);
    grow(getByTestId("paper"), 452);
    if (observed) fire();
    expect(animate).not.toHaveBeenCalled();
  });
});
