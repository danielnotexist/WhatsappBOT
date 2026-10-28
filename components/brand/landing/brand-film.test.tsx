// @vitest-environment jsdom
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS, STORAGE_KEY, TOGGLE_ATTRS } from "@/lib/a11y/settings";
import { resetStoreForTests, setSettings } from "@/lib/a11y/store";
import { BRAND_FILM, BrandFilm, REDUCED_MOTION_QUERY } from "./brand-film";
import { DAY_SECTION, DaySection } from "./day-scenes";

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
    for (const o of observers) o.cb([{ isIntersecting: intersecting } as IntersectionObserverEntry], o as unknown as IntersectionObserver);
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

describe("'יום עבודה אחד, בוואטסאפ.' with the brand film (the test of 24.10.2026)", () => {
  it("the section keeps its heading and line; the film stands where the pinned scenes stood, behind one switch", () => {
    expect(DAY_SECTION).toBe("film");
    const { container } = render(<DaySection />);
    const section = screen.getByRole("region", { name: "יום עבודה אחד, בוואטסאפ." });
    expect(section).toHaveAttribute("id", "day");
    expect(section).toHaveTextContent("בלי אפליקציה חדשה ובלי ללמוד מערכת.");
    // the film, not the scenes
    expect(container.querySelector("[data-state]")).not.toBeNull();
    expect(section.querySelector("ol")).toBeNull();
    // the scenes are one line away
    cleanup();
    render(<DaySection variant="scenes" />);
    expect(screen.getAllByRole("list")[0]!.tagName).toBe("OL");
    expect(document.querySelector("video")).toBeNull();
  });

  it("a framed 16:9 card that holds its shape, with the poster underneath", () => {
    const { container } = render(<BrandFilm />);
    const card = frame(container);
    expect(card.className).toMatch(/\baspect-video\b/);
    expect(card.className).toMatch(/\brounded-card\b/);
    expect(card.className).toMatch(/\bshadow-stage\b/);
    const poster = card.querySelector("img")!;
    expect(poster).toHaveAttribute("src", BRAND_FILM.poster);
    expect(poster).toHaveAttribute("alt", "");
    // nothing to press before there is a video
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("motion allowed: the video mounts in view (webm first), muted, looping, inline, metadata only, and plays", () => {
    const { container } = render(<BrandFilm />);
    expect(container.querySelector("video")).toBeNull();
    scrollTo(true);
    const video = container.querySelector("video")!;
    expect(frame(container)).toHaveAttribute("data-state", "video");
    for (const a of ["autoplay", "loop", "playsinline"]) expect(video).toHaveAttribute(a);
    expect(video).toHaveAttribute("preload", "metadata");
    expect(video).toHaveAttribute("poster", BRAND_FILM.poster);
    expect(video).toHaveAttribute("aria-hidden", "true");
    expect(video.muted).toBe(true);
    expect(video.hasAttribute("controls")).toBe(false);
    expect([...video.querySelectorAll("source")].map((s) => [s.getAttribute("src"), s.getAttribute("type")])).toEqual([
      [BRAND_FILM.webm, "video/webm"],
      [BRAND_FILM.mp4, "video/mp4"],
    ]);
    expect(play).toHaveBeenCalled();
  });

  it("the sound button: 'הפעלת צליל' unmutes, 'השתקה' mutes again", () => {
    const { container } = render(<BrandFilm />);
    scrollTo(true);
    const video = container.querySelector("video")!;
    fireEvent.click(screen.getByRole("button", { name: "הפעלת צליל" }));
    expect(video.muted).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "השתקה" }));
    expect(video.muted).toBe(true);
    expect(screen.getByRole("button", { name: "הפעלת צליל" })).toBeInTheDocument();
  });

  it("pauses off-screen and while the tab is hidden, and resumes when both are back", () => {
    const { container } = render(<BrandFilm />);
    scrollTo(true);
    pause.mockClear();
    scrollTo(false);
    expect(pause).toHaveBeenCalled();
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

  it("prefers-reduced-motion: the poster only - no video, no sound button, nothing played", () => {
    mockReducedMotion(true);
    const { container } = render(<BrandFilm />);
    scrollTo(true);
    expect(container.querySelector("video")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
    expect(frame(container)).toHaveAttribute("data-state", "poster");
    expect(observers).toHaveLength(0);
    expect(play).not.toHaveBeenCalled();
  });

  it("'עצירת אנימציות' (data-a11y-motion on <html>): the poster only, and switching it on takes a playing film away", () => {
    const { container } = render(<BrandFilm />);
    scrollTo(true);
    expect(container.querySelector("video")).not.toBeNull();
    act(() => setSettings({ ...DEFAULT_SETTINGS, motion: true }));
    expect(document.documentElement.hasAttribute(TOGGLE_ATTRS.motion)).toBe(true);
    expect(container.querySelector("video")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
    expect(frame(container)).toHaveAttribute("data-state", "poster");
  });
});

describe("the web encodes (public/brand/video)", () => {
  const file = (p: string) => join(process.cwd(), "public", p);
  it("exist, stay under about 12 MB together, and the mp4 keeps its soundtrack", () => {
    const sizes = [BRAND_FILM.mp4, BRAND_FILM.webm, BRAND_FILM.poster].map((p) => statSync(file(p)).size);
    expect(sizes.reduce((a, b) => a + b, 0)).toBeLessThan(12.5 * 1024 * 1024);
    const mp4 = readFileSync(file(BRAND_FILM.mp4));
    expect(mp4.includes("avc1"), "H.264").toBe(true);
    expect(mp4.includes("mp4a"), "AAC track").toBe(true);
    // faststart: the movie header comes before the media data
    expect(mp4.indexOf("moov")).toBeLessThan(mp4.indexOf("mdat"));
    expect(readFileSync(file(BRAND_FILM.webm)).includes("V_VP9")).toBe(true);
    expect(readFileSync(file(BRAND_FILM.poster)).subarray(8, 12).toString()).toBe("WEBP");
  });
});
