// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS, STORAGE_KEY, TOGGLE_ATTRS } from "@/lib/a11y/settings";
import { resetStoreForTests, setSettings } from "@/lib/a11y/store";
import { BRAND } from "@/lib/brand";
import { HOOPOE_LOOP, REDUCED_MOTION_QUERY } from "./hoopoe-loop";
import { Meet } from "./meet";

/* ---- a controllable IntersectionObserver ---- */
let observers: FakeIO[] = [];
class FakeIO {
  constructor(public cb: IntersectionObserverCallback) {
    observers.push(this);
  }
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
  takeRecords = () => [];
}
function scrollTo(intersecting: boolean) {
  act(() => {
    for (const o of observers) {
      o.cb([{ isIntersecting: intersecting } as IntersectionObserverEntry], o as unknown as IntersectionObserver);
    }
  });
}

function mockReducedMotion(reduce: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: reduce && query === REDUCED_MOTION_QUERY,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

function setTabHidden(hidden: boolean) {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => (hidden ? "hidden" : "visible") });
  act(() => {
    document.dispatchEvent(new Event("visibilitychange"));
  });
}

const play = vi.fn(() => Promise.resolve());
const pause = vi.fn();

const frame = (container: HTMLElement) => container.querySelector<HTMLElement>("[data-state]")!;

beforeEach(() => {
  document.documentElement.setAttribute("dir", "rtl");
  observers = [];
  vi.stubGlobal("IntersectionObserver", FakeIO);
  mockReducedMotion(false);
  window.localStorage.removeItem(STORAGE_KEY);
  resetStoreForTests();
  play.mockClear();
  pause.mockClear();
  vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(play);
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(pause);
});
afterEach(() => {
  cleanup();
  act(() => setSettings(DEFAULT_SETTINGS));
  resetStoreForTests();
  document.documentElement.removeAttribute(TOGGLE_ATTRS.motion);
  // @ts-expect-error -- back to jsdom's own getter
  delete document.visibilityState;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("'נעים להכיר' (the hoopoe loop)", () => {
  it("one headline with her name, one line, and a decorative framed card that holds its shape", () => {
    const { container } = render(<Meet />);
    const section = screen.getByRole("region", { name: `נעים להכיר, זו ${BRAND.name}.` });
    expect(section).toHaveAttribute("id", "meet");
    expect(section.querySelectorAll("p")).toHaveLength(1);

    const card = frame(container);
    expect(card).toHaveAttribute("aria-hidden", "true");
    // an aspect-ratio box (no layout shift when the video arrives), rounded and lifted like the other cards
    expect(card.className).toMatch(/\baspect-\[4\/3\]/);
    expect(card.className).toMatch(/\bsm:aspect-video\b/);
    expect(card.className).toMatch(/\brounded-card\b/);
    expect(card.className).toMatch(/\bshadow-stage\b/);
    const poster = card.querySelector("img")!;
    expect(poster).toHaveAttribute("src", HOOPOE_LOOP.poster);
    expect(poster).toHaveAttribute("alt", "");
  });

  it("motion allowed: the video mounts when the card comes into view, both sources (webm first), and plays", () => {
    const { container } = render(<Meet />);
    // not before it is seen
    expect(container.querySelector("video")).toBeNull();
    scrollTo(true);

    const video = container.querySelector("video")!;
    expect(frame(container)).toHaveAttribute("data-state", "video");
    expect(video).toHaveAttribute("autoplay");
    expect(video).toHaveAttribute("loop");
    expect(video).toHaveAttribute("playsinline");
    expect(video).toHaveAttribute("preload", "metadata");
    expect(video).toHaveAttribute("poster", HOOPOE_LOOP.poster);
    expect(video.muted).toBe(true);
    expect(video.hasAttribute("controls")).toBe(false);
    expect([...video.querySelectorAll("source")].map((s) => [s.getAttribute("src"), s.getAttribute("type")])).toEqual([
      [HOOPOE_LOOP.webm, "video/webm"],
      [HOOPOE_LOOP.mp4, "video/mp4"],
    ]);
    expect(play).toHaveBeenCalled();
  });

  it("pauses off-screen and while the tab is hidden, and resumes when both are back", () => {
    const { container } = render(<Meet />);
    scrollTo(true);
    expect(container.querySelector("video")).not.toBeNull();

    pause.mockClear();
    scrollTo(false);
    expect(pause).toHaveBeenCalled();
    // the element stays (no reload when it scrolls back)
    expect(container.querySelector("video")).not.toBeNull();

    play.mockClear();
    scrollTo(true);
    expect(play).toHaveBeenCalled();

    pause.mockClear();
    setTabHidden(true);
    expect(pause).toHaveBeenCalled();

    play.mockClear();
    setTabHidden(false);
    expect(play).toHaveBeenCalled();
  });

  it("prefers-reduced-motion: the poster only - no video, nothing observed, nothing played", () => {
    mockReducedMotion(true);
    const { container } = render(<Meet />);
    scrollTo(true);
    expect(container.querySelector("video")).toBeNull();
    expect(frame(container)).toHaveAttribute("data-state", "poster");
    expect(frame(container).querySelector("img")).toHaveAttribute("src", HOOPOE_LOOP.poster);
    expect(observers).toHaveLength(0);
    expect(play).not.toHaveBeenCalled();
  });

  it("'עצירת אנימציות' (data-a11y-motion on <html>): the poster only, and switching it on takes a playing video away", () => {
    const { container } = render(<Meet />);
    scrollTo(true);
    expect(container.querySelector("video")).not.toBeNull();

    act(() => setSettings({ ...DEFAULT_SETTINGS, motion: true }));
    expect(document.documentElement.hasAttribute(TOGGLE_ATTRS.motion)).toBe(true);
    expect(container.querySelector("video")).toBeNull();
    expect(frame(container)).toHaveAttribute("data-state", "poster");

    // and on a fresh load with the setting saved
    cleanup();
    resetStoreForTests();
    play.mockClear();
    const again = render(<Meet />);
    scrollTo(true);
    expect(again.container.querySelector("video")).toBeNull();
    expect(play).not.toHaveBeenCalled();
  });
});
