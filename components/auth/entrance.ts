/**
 * "Once per screen" for the step entrance (components/auth/step-slots.tsx).
 *
 * The entrance is the one Daniel picked as the reference (/login/whatsapp → "כניסה עם מייל במקום" → /login/email):
 * each slot fades in with a 10px rise, the question first, then the answer. It must play once per screen:
 *  - a new screen (another pathname) → the full entrance;
 *  - the SAME screen mounting again while it is still on screen (a Suspense fallback giving way to the streamed
 *    content) → no second entrance: the new element carries on from where the first one is (or simply stays put
 *    when the entrance is over);
 *  - a screen that was hidden by the router (React <Activity>, browser back/forward) and is shown again → the entrance
 *    again, like any step change: after another step, or after a page with no step at all (/terms, /login) — then the
 *    slot's last visit is still this screen, so "hidden for longer than RESHOW_GAP_MS" is what tells it apart from
 *    React re-running the effects in the same commit (StrictMode).
 * Pure and module-level (one per page), so it can be tested without React. Times are in milliseconds, delays in s.
 */

/** Seconds — the reference entrance: fade + rise, on the ease below. */
export const ENTRANCE_DURATION = 0.42;
/** px the slot rises while it fades in */
export const ENTRANCE_RISE = 10;
export const ENTRANCE_EASE = [0.22, 1, 0.36, 1] as const;
/** ms — a slot hidden for longer than this was off screen; shorter is an effect re-run within one commit */
export const RESHOW_GAP_MS = 32;

/** What a slot does when it mounts: `delay` in seconds (negative = start part-way through), or null for no entrance. */
export interface EntrancePlan {
  /** a new visit of this screen (false: a remount of the screen that is already showing) */
  fresh: boolean;
  delay: number | null;
}

interface Visit {
  screen: string;
  /** when its entrance started (ms); -Infinity when it appeared without one */
  startedAt: number;
  /** how many elements of this slot are mounted for this visit */
  mounted: number;
  /** when its last element left (ms); -Infinity while it has not */
  leftAt: number;
}

export interface EntranceGuard {
  /** At render, before mounting: the full entrance, a continuation, or nothing. Reads only. */
  plan(slot: string, screen: string, delay: number, now: number, animate: boolean): EntrancePlan;
  /**
   * When the element mounts (layout effect). `again` = this element was shown before (its effects re-run). Returns the
   * visit to hand back to `leave`, and `replay` = it is being shown again after being off screen: play the entrance.
   */
  enter(slot: string, screen: string, plan: EntrancePlan, now: number, again: boolean): { visit: Visit; replay: boolean };
  /** When the element unmounts or is hidden (layout-effect cleanup). */
  leave(visit: Visit, now: number): void;
}

export function createEntranceGuard(): EntranceGuard {
  const visits = new Map<string, Visit>();
  return {
    plan(slot, screen, delay, now, animate) {
      const current = visits.get(slot);
      if (!current || current.screen !== screen || current.mounted === 0) return { fresh: true, delay: animate ? delay : null };
      // the same screen is on screen and mounts again: carry on, never start over
      const elapsed = (now - current.startedAt) / 1000;
      return { fresh: false, delay: animate && elapsed < delay + ENTRANCE_DURATION ? delay - elapsed : null };
    },
    enter(slot, screen, plan, now, again) {
      let visit = visits.get(slot);
      // shown again: after another screen, or after this one was off screen (a page without steps in between)
      const replay = again && (visit?.screen !== screen || (visit.mounted === 0 && now - visit.leftAt > RESHOW_GAP_MS));
      if (!visit || visit.screen !== screen || replay || (!again && plan.fresh)) {
        visit = { screen, startedAt: replay || (!again && plan.delay !== null) ? now : -Infinity, mounted: 0, leftAt: -Infinity };
        visits.set(slot, visit);
      }
      visit.mounted += 1;
      return { visit, replay };
    },
    leave(visit, now) {
      visit.mounted = Math.max(0, visit.mounted - 1);
      visit.leftAt = now;
    },
  };
}

/** The page's guard (module state lives as long as the document). */
export const entranceGuard = createEntranceGuard();
