// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AgentSheet } from "./_components/agent-sheet";
import { AreaLink, AreaNav, AreaPanel } from "./_components/area-nav";
import { Banner } from "./_components/banner";
import { ACCOUNT_AREAS, areaFrom, areaHref, isAccountArea } from "./areas";
import { areasNeedingAttention, statusChips, type UsageView } from "./view";

/**
 * The personal area's areas (./areas.ts): which area a URL opens (deep links from WhatsApp, the pay page, OAuth returns
 * and the server actions), the status chips, and the client navigation that switches areas on the page.
 */

// useSearchParams follows the address, as Next.js keeps it in sync with history.pushState / replaceState
vi.mock("next/navigation", async () => {
  const React = await import("react");
  const subscribe = (cb: () => void) => {
    window.addEventListener("test:locationchange", cb);
    window.addEventListener("popstate", cb);
    return () => {
      window.removeEventListener("test:locationchange", cb);
      window.removeEventListener("popstate", cb);
    };
  };
  return {
    useSearchParams: () => new URLSearchParams(React.useSyncExternalStore(subscribe, () => window.location.search)),
  };
});

const original = { push: window.history.pushState.bind(window.history), replace: window.history.replaceState.bind(window.history) };
beforeEach(() => {
  window.history.pushState = (...args: Parameters<History["pushState"]>) => {
    original.push(...args);
    window.dispatchEvent(new Event("test:locationchange"));
  };
  window.history.replaceState = (...args: Parameters<History["replaceState"]>) => {
    original.replace(...args);
    window.dispatchEvent(new Event("test:locationchange"));
  };
});
afterEach(() => {
  cleanup();
  window.history.pushState = original.push;
  window.history.replaceState = original.replace;
  original.replace(null, "", "/");
});

const go = (url: string) => act(() => window.history.replaceState(null, "", url));

describe("areaFrom: the area a URL opens", () => {
  it("names each area by ?tab=, the overview by default", () => {
    expect(ACCOUNT_AREAS.map((a) => a.label)).toEqual(["סקירה", "חיבורים", "וואטסאפ", "סוכנים", "מנוי", "הגדרות"]);
    for (const { id } of ACCOUNT_AREAS) expect(areaFrom(new URLSearchParams(areaHref(id).split("?")[1] ?? ""))).toBe(id);
    expect(areaHref("overview")).toBe("/account");
    expect(areaHref("agents")).toBe("/account?tab=agents");
    expect(areaFrom({})).toBe("overview");
    expect(areaFrom(null)).toBe("overview");
    expect(areaFrom({ tab: "billing" })).toBe("overview"); // unknown → the overview, never an error
    expect(areaFrom({ tab: ["agents", "plan"] })).toBe("overview");
    expect(isAccountArea("plan")).toBe(true);
    expect(isAccountArea("__proto__")).toBe(false);
  });

  it("deep links land with their notice in the right area", () => {
    // OAuth return (lib/auth/oauth-return.ts), pay return (lib/billing/result.ts), the server actions (./actions.ts)
    expect(areaFrom({ tab: "connections", notice: "החיבור ל-Microsoft 365 הושלם" })).toBe("connections");
    expect(areaFrom({ tab: "plan", notice: "התשלום התקבל" })).toBe("plan");
    expect(areaFrom({ tab: "whatsapp", notice: "המספר נותק." })).toBe("whatsapp");
    expect(areaFrom({ tab: "settings", error: "המילה לא תואמת" })).toBe("settings");
    // older links keep working: the agent actions' ?at=agents, a template link ?new=, a bare notice from WhatsApp
    expect(areaFrom({ notice: "x", at: "agents" })).toBe("agents");
    expect(areaFrom({ new: "blank" })).toBe("agents");
    expect(areaFrom({ notice: "התשלום התקבל" })).toBe("overview");
    // tab wins over the older params
    expect(areaFrom({ tab: "plan", at: "agents", new: "blank" })).toBe("plan");
  });
});

const trialMeter: UsageView = { plan: "trial", used: 3, limit: 10, resetsOn: null };

describe("statusChips: the compact overview", () => {
  it("a fresh account: nothing connected, no number, the built-ins at work, the trial", () => {
    const chips = statusChips({ microsoft: "none", google: "none", phone: "none", activeAgents: 3, meter: trialMeter, subscriptionStatus: null });
    expect(chips.map((c) => [c.area, c.label, c.tone])).toEqual([
      ["connections", "עוד אין חיבורים", "off"],
      ["whatsapp", "וואטסאפ לא מקושר", "warn"],
      ["agents", "3 סוכנים פעילים", "ok"],
      ["plan", "ניסיון: 3 מתוך 10 הודעות", "ok"],
    ]);
    expect(chips[3]!.meter).toEqual({ used: 3, limit: 10 });
    expect(areasNeedingAttention(chips)).toEqual(["whatsapp"]);
  });

  it("states that need the user: a broken connection, a blocked number, a failed charge, a used-up allowance", () => {
    const paid: UsageView = { plan: "basic", used: 1204, limit: 750, resetsOn: "1.11" };
    const chips = statusChips({ microsoft: "active", google: "expired", phone: "blocked", activeAgents: 1, meter: paid, subscriptionStatus: "past_due" });
    expect(chips.map((c) => [c.label, c.tone])).toEqual([
      ["חיבור צריך חידוש", "warn"],
      ["המספר חסום", "error"],
      ["סוכן אחד פעיל", "ok"],
      ["בסיסי: התשלום נכשל", "error"],
    ]);
    expect(areasNeedingAttention(chips)).toEqual(["connections", "whatsapp", "plan"]);
    const full = statusChips({ microsoft: "active", google: "active", phone: "linked", activeAgents: 0, meter: { plan: "pro", used: 3000, limit: 3000, resetsOn: "1.11" }, subscriptionStatus: "active" });
    expect(full.map((c) => [c.label, c.tone])).toEqual([
      ["2 חיבורים פעילים", "ok"],
      ["וואטסאפ מקושר", "ok"],
      ["אין סוכנים פעילים", "off"],
      ["פרו: 3,000 מתוך 3,000 הודעות", "warn"],
    ]);
  });
});

function Areas() {
  return (
    <>
      <AreaNav attention={["whatsapp"]} />
      <AreaLink area="plan">בסיסי: 3 מתוך 750 הודעות</AreaLink>
      {ACCOUNT_AREAS.map((a) => (
        <AreaPanel key={a.id} area={a.id}>
          <section aria-labelledby={`${a.id}-t`}>
            <h2 id={`${a.id}-t`}>{`כותרת ${a.label}`}</h2>
          </section>
        </AreaPanel>
      ))}
    </>
  );
}

describe("the area navigation", () => {
  it("is a nav of real links; the URL picks the area shown and the link marked as current", () => {
    go("/account?tab=agents&notice=x");
    render(<Areas />);
    const nav = screen.getByRole("navigation", { name: "ניווט באזור האישי" });
    const links = within(nav).getAllByRole("link");
    expect(links.map((l) => [l.textContent, l.getAttribute("href")])).toEqual([
      ["סקירה", "/account"],
      ["חיבורים", "/account?tab=connections"],
      ["וואטסאפ", "/account?tab=whatsapp"],
      ["סוכנים", "/account?tab=agents"],
      ["מנוי", "/account?tab=plan"],
      ["הגדרות", "/account?tab=settings"],
    ]);
    expect(within(nav).getByRole("link", { name: "סוכנים" })).toHaveAttribute("aria-current", "page");
    expect(links.filter((l) => l.hasAttribute("aria-current"))).toHaveLength(1);
    // only the agents are shown (hidden areas are out of the accessibility tree)
    expect(screen.getAllByRole("region").map((r) => r.getAttribute("aria-labelledby"))).toEqual(["agents-t"]);
  });

  it("a click switches at once, pushes the address, moves focus to the area's heading; back walks the areas", async () => {
    go("/account");
    render(<Areas />);
    expect(screen.getByRole("region", { name: "כותרת סקירה" })).toBeInTheDocument();
    const nav = screen.getByRole("navigation", { name: "ניווט באזור האישי" });
    await act(async () => {
      fireEvent.click(within(nav).getByRole("link", { name: "חיבורים" }));
    });
    expect(window.location.pathname + window.location.search).toBe("/account?tab=connections");
    expect(screen.getByRole("region", { name: "כותרת חיבורים" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "כותרת סקירה" })).toBeNull();
    expect(within(nav).getByRole("link", { name: "חיבורים" })).toHaveAttribute("aria-current", "page");
    expect(document.activeElement).toBe(screen.getByRole("heading", { name: "כותרת חיבורים" }));

    // a status chip is a link to its area too
    await act(async () => {
      fireEvent.click(screen.getByRole("link", { name: "בסיסי: 3 מתוך 750 הודעות" }));
    });
    expect(window.location.search).toBe("?tab=plan");
    expect(screen.getByRole("region", { name: "כותרת מנוי" })).toBeInTheDocument();

    // a modified click is left to the browser (a new tab), nothing switches here
    fireEvent.click(within(nav).getByRole("link", { name: "הגדרות" }), { ctrlKey: true });
    expect(window.location.search).toBe("?tab=plan");
  });
});

describe("Banner: the result of an action in its area", () => {
  it("announces the notice; closing hides it and drops the notice from the address", async () => {
    go("/account?tab=connections&notice=%D7%A0%D7%95%D7%AA%D7%A7");
    render(<Banner kind="notice" text="החיבור ל-Microsoft 365 נותק." area="connections" />);
    expect(screen.getByRole("status")).toHaveTextContent("החיבור ל-Microsoft 365 נותק.");
    const close = screen.getByRole("link", { name: "סגירה" });
    expect(close).toHaveAttribute("href", "/account?tab=connections");
    await act(async () => {
      fireEvent.click(close);
    });
    expect(screen.queryByRole("status")).toBeNull();
    expect(window.location.search).toBe("?tab=connections");
  });

  it("an error is an alert", () => {
    render(<Banner kind="error" text="המילה לא תואמת" area="settings" />);
    expect(screen.getByRole("alert")).toHaveTextContent("המילה לא תואמת");
  });
});

describe("AgentSheet: a new agent opens from the address", () => {
  it("open while ?new= names its template; closing drops `new` and stays on the agents", async () => {
    go("/account?tab=agents&new=blank");
    render(
      <AgentSheet id="new:blank" newTemplate="blank" title="סוכן חדש" description="אפשר לשנות הכול אחר כך.">
        <label>
          שם
          <input name="name" />
        </label>
      </AgentSheet>,
    );
    const dialog = await screen.findByRole("dialog", { name: "סוכן חדש" });
    expect(within(dialog).getByLabelText("שם")).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(within(dialog).getByRole("button", { name: "סגירה" }));
    });
    expect(window.location.pathname + window.location.search).toBe("/account?tab=agents");
    await vi.waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("edit: closed until its button; the button names the agent", async () => {
    go("/account?tab=agents");
    render(
      <AgentSheet id="custom:1" title="עריכת ״חשבוניות״" trigger={{ label: "עריכה", srName: "של ״חשבוניות״" }}>
        <p>הטופס</p>
      </AgentSheet>,
    );
    expect(screen.queryByRole("dialog")).toBeNull();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "עריכה של ״חשבוניות״" }));
    });
    expect(await screen.findByRole("dialog", { name: "עריכת ״חשבוניות״" })).toHaveTextContent("הטופס");
  });
});
