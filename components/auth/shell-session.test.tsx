// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ShellAccountLink, ShellSessionProvider, useMarkSignedIn } from "./shell-session";

const session = vi.hoisted(() => ({ signedIn: false }));
vi.mock("@/lib/auth/current-user", () => ({ hasSession: async () => session.signedIn }));

afterEach(cleanup);

describe("the signup / sign-in shell header (Daniel, 22.10.2026)", () => {
  it("signed out: 'כבר יש לך חשבון? כניסה' only where the screen offers it", () => {
    render(
      <ShellSessionProvider loginVisible>
        <ShellAccountLink signedIn={false} />
      </ShellSessionProvider>,
    );
    expect(screen.getByRole("link", { name: "כבר יש לך חשבון? כניסה" })).toHaveAttribute("href", "/login");
    cleanup();
    const { container } = render(
      <ShellSessionProvider loginVisible={false}>
        <ShellAccountLink signedIn={false} />
      </ShellSessionProvider>,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("signed in: the honey pill 'לאזור האישי' instead, on every screen of the shell", () => {
    for (const loginVisible of [true, false]) {
      render(
        <ShellSessionProvider loginVisible={loginVisible}>
          <ShellAccountLink signedIn />
        </ShellSessionProvider>,
      );
      const link = screen.getByRole("link", { name: "לאזור האישי" });
      expect(link).toHaveAttribute("href", "/account");
      expect(link.className).toContain("bg-honey");
      expect(screen.queryByText("כבר יש לך חשבון? כניסה")).toBeNull();
      cleanup();
    }
  });

  it("a code verified inside the shell switches the header at once (the layout read the cookie before it)", () => {
    let mark: () => void = () => {};
    function CodeCard() {
      mark = useMarkSignedIn();
      return null;
    }
    render(
      <ShellSessionProvider loginVisible>
        <ShellAccountLink signedIn={false} />
        <CodeCard />
      </ShellSessionProvider>,
    );
    expect(screen.getByRole("link", { name: "כבר יש לך חשבון? כניסה" })).toBeInTheDocument();
    act(() => mark());
    expect(screen.getByRole("link", { name: "לאזור האישי" })).toHaveAttribute("href", "/account");
  });

  it("outside a shell, marking is a no-op (the code card also renders on its own in tests)", () => {
    let mark: () => void = () => {};
    function Probe() {
      mark = useMarkSignedIn();
      return null;
    }
    render(<Probe />);
    expect(() => mark()).not.toThrow();
  });

  it("BySession picks by the session cookie, and the static shell carries the signed-out side", async () => {
    const { BySession, SessionSwitch } = await import("./by-session");
    session.signedIn = true;
    expect(await SessionSwitch({ signedIn: "in", signedOut: "out" })).toBe("in");
    session.signedIn = false;
    expect(await SessionSwitch({ signedIn: "in", signedOut: "out" })).toBe("out");
    const el = BySession({ signedIn: "in", signedOut: "out" });
    expect((el.props as { fallback: unknown }).fallback).toBe("out");
  });
});
