// @vitest-environment jsdom
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Cta } from "@/components/brand/cta";
import { waMeUrl } from "@/lib/auth/link-token";
import { DemoStrip } from "./DemoBar";
import { DemoCodeNote } from "./DemoCodeNote";
import { DemoCodeNoteLive, DemoFlag, resetDemoFlagForTests } from "./demo-flag";
import { DemoWaDialog, demoWaMessage } from "./DemoWaDialog";
import { DemoWaGate } from "./DemoWaGate";

vi.mock("next/server", () => ({ connection: async () => {} }));

const HREF = waMeUrl("972500000000", "ABCD-2345");
const button = (
  <Cta href={HREF} external tone="honey" block>
    חיבור לוואטסאפ
  </Cta>
);

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

describe("demo strip and code note", () => {
  it("the strip says nothing is really sent", () => {
    render(<DemoStrip />);
    expect(screen.getByRole("note")).toHaveTextContent("גרסת הדגמה - שום דבר לא נשלח באמת");
  });

  it("the code card names the demo code", () => {
    render(<DemoCodeNote />);
    expect(screen.getByRole("note")).toHaveTextContent("בגרסת ההדגמה הקוד הוא 123456");
  });
});

describe("DemoCodeNoteLive — the code card knows DEMO_MODE in its own commit", () => {
  afterEach(() => resetDemoFlagForTests());

  it("the build's value stands in until the running server has reported (a direct page load)", () => {
    const off = render(<DemoCodeNoteLive atBuild={false} />);
    expect(screen.queryByRole("note")).toBeNull();
    off.unmount();
    render(<DemoCodeNoteLive atBuild />);
    expect(screen.getByRole("note")).toHaveTextContent("בגרסת ההדגמה הקוד הוא 123456");
  });

  it("the running server wins: built without DEMO_MODE, run with it → the note is there from the first render", () => {
    render(<DemoFlag on />); // the DemoBar's request-time part, already on screen
    render(<DemoCodeNoteLive atBuild={false} />); // a client-side navigation to the code card
    expect(screen.getByRole("note")).toHaveTextContent("123456");
  });

  it("…and the other way round; a card already on screen follows the report", () => {
    render(<DemoCodeNoteLive atBuild />);
    expect(screen.getByRole("note")).toBeInTheDocument();
    act(() => {
      render(<DemoFlag on={false} />);
    });
    expect(screen.queryByRole("note")).toBeNull();
  });
});

describe("DemoWaDialog — the WhatsApp button in the demo", () => {
  it("reads the prefilled message out of the wa.me link", () => {
    expect(demoWaMessage(HREF)).toBe("היי עלזה! אפשר לקשר את החשבון שלי (ABCD-2345)");
    expect(demoWaMessage("not a url")).toBe("");
  });

  it("a click does not open WhatsApp; the dialog shows the real message, and closes", async () => {
    render(<DemoWaDialog href={HREF}>{button}</DemoWaDialog>);
    const link = screen.getByRole("link", { name: "חיבור לוואטסאפ" });
    expect(link).toHaveAttribute("href", HREF); // the button itself is untouched
    const notPrevented = fireEvent.click(link);
    expect(notPrevented).toBe(false);
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("בגרסה האמיתית ייפתח וואטסאפ עם ההודעה:");
    expect(dialog).toHaveTextContent("היי עלזה! אפשר לקשר את החשבון שלי (ABCD-2345)");
    expect(dialog).toHaveTextContent("בגרסת ההדגמה שום דבר לא נשלח.");
    fireEvent.click(screen.getByRole("button", { name: "הבנתי" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("enabled={false} passes the button through", () => {
    const { container } = render(
      <DemoWaDialog href={HREF} enabled={false}>
        {button}
      </DemoWaDialog>,
    );
    expect(container.querySelector("[data-demo-wa]")).toBeNull();
    expect(fireEvent.click(screen.getByRole("link", { name: "חיבור לוואטסאפ" }))).toBe(true);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("DemoWaGate switches on DEMO_MODE (server-rendered prop)", () => {
    const off = render(<DemoWaGate href={HREF}>{button}</DemoWaGate>);
    expect(off.container.querySelector("[data-demo-wa]")).toBeNull();
    off.unmount();
    vi.stubEnv("DEMO_MODE", "1");
    vi.stubEnv("TOKEN_ENC_KEY", Buffer.alloc(32, 4).toString("base64"));
    const on = render(<DemoWaGate href={HREF}>{button}</DemoWaGate>);
    expect(on.container.querySelector("[data-demo-wa]")).not.toBeNull();
  });
});

describe("logical (RTL-safe) classes in components/demo", () => {
  const PHYSICAL = /(^|:)-?(ml|mr|pl|pr|left|right|rounded-l|rounded-r|rounded-tl|rounded-tr|rounded-bl|rounded-br|border-l|border-r)-|(^|:)(text-left|text-right|float-left|float-right|border-l|border-r|rounded-l|rounded-r)$/;
  const files = readdirSync(__dirname).filter((f) => f.endsWith(".tsx") && !f.endsWith(".test.tsx"));
  it.each(files.map((f) => [f]))("%s uses no physical left/right utilities", (f) => {
    const literals = [...readFileSync(join(__dirname, f), "utf8").matchAll(/"([^"\n]*)"|`([^`]*)`/g)].map((m) => m[1] ?? m[2] ?? "");
    expect(literals.flatMap((l) => l.split(/[\s{}$]+/)).filter((t) => PHYSICAL.test(t))).toEqual([]);
  });
});
