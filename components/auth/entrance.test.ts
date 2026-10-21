import { describe, expect, it } from "vitest";
import { ENTRANCE_DURATION, createEntranceGuard } from "./entrance";

const CODE = "/start/code";
const EMAIL = "/start/email";

/** A slot mounting at `now` the way step-slots.tsx does it: plan at render, enter at mount. */
function mount(guard: ReturnType<typeof createEntranceGuard>, slot: string, screen: string, now: number, delay = 0.1, animate = true) {
  const plan = guard.plan(slot, screen, delay, now, animate);
  const { visit, replay } = guard.enter(slot, screen, plan, now, false);
  return { plan, visit, replay };
}

describe("step entrance — once per screen", () => {
  it("a new screen gets the full entrance, each slot on its own", () => {
    const guard = createEntranceGuard();
    expect(mount(guard, "aside", EMAIL, 0).plan).toEqual({ fresh: true, delay: 0.1 });
    expect(mount(guard, "body", EMAIL, 0, 0.16).plan).toEqual({ fresh: true, delay: 0.16 });
    // the next step: the full entrance again
    expect(guard.plan("aside", CODE, 0.1, 5000, true)).toEqual({ fresh: true, delay: 0.1 });
  });

  it("a fallback giving way to the streamed step does not start over: it carries on, then stays put", () => {
    const guard = createEntranceGuard();
    const fallback = mount(guard, "aside", CODE, 1000);
    // 250ms later the content replaces the fallback (planned while the fallback is still mounted)
    const early = guard.plan("aside", CODE, 0.1, 1250, true);
    expect(early.fresh).toBe(false);
    expect(early.delay).toBeCloseTo(0.1 - 0.25); // negative: start 150ms into the fade, where the fallback is
    // the commit: the fallback leaves, the content enters the same visit
    guard.leave(fallback.visit);
    const content = guard.enter("aside", CODE, early, 1250, false);
    expect(content.replay).toBe(false);
    expect(content.visit).toBe(fallback.visit);
    // once the entrance is over, a remount simply appears
    expect(guard.plan("aside", CODE, 0.1, 1000 + (0.1 + ENTRANCE_DURATION) * 1000 + 1, true)).toEqual({ fresh: false, delay: null });
  });

  it("leaving a screen and coming back to it (a new visit) plays the entrance again", () => {
    const guard = createEntranceGuard();
    const first = mount(guard, "body", EMAIL, 0, 0.16);
    guard.leave(first.visit);
    expect(guard.plan("body", EMAIL, 0.16, 60_000, true)).toEqual({ fresh: true, delay: 0.16 });
  });

  it("no entrance on the first paint (hydration) or under reduced motion — and none on a remount after it", () => {
    const guard = createEntranceGuard();
    const hydrated = mount(guard, "aside", CODE, 0, 0.1, false);
    expect(hydrated.plan).toEqual({ fresh: true, delay: null });
    expect(guard.plan("aside", CODE, 0.1, 10, true)).toEqual({ fresh: false, delay: null });
    guard.leave(hydrated.visit);
    expect(guard.plan("aside", EMAIL, 0.1, 20, false)).toEqual({ fresh: true, delay: null });
  });

  it("a step the router shows again after another one (back/forward) replays; strict-mode effect re-runs do not", () => {
    const guard = createEntranceGuard();
    const email = mount(guard, "aside", EMAIL, 0);
    // React (StrictMode) runs the mount effects twice: leave + enter again, same screen → nothing to replay
    guard.leave(email.visit);
    const again = guard.enter("aside", EMAIL, email.plan, 1, true);
    expect(again.replay).toBe(false);
    // "שליחת קוד": the email step is hidden (Activity), the code step enters
    guard.leave(again.visit);
    const code = mount(guard, "aside", CODE, 500);
    // browser back: the code step is hidden, the same email step is shown again → its entrance plays
    guard.leave(code.visit);
    const back = guard.enter("aside", EMAIL, email.plan, 9000, true);
    expect(back.replay).toBe(true);
    expect(back.visit.screen).toBe(EMAIL);
    // and from then on it is the current visit
    expect(guard.plan("aside", EMAIL, 0.1, 9100, true).fresh).toBe(false);
  });
});
