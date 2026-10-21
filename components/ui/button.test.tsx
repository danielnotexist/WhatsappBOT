// @vitest-environment jsdom
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { Button } from "@/components/ui/button";
import { DirectionProvider, useDirection } from "@/components/ui/direction";

function DirectionProbe() {
  const direction = useDirection();
  return <span data-testid="direction">{direction}</span>;
}

/** כיתות Tailwind פיזיות (שמאל/ימין) — אסורות בקומפוננטות RTL; חייבים start/end לוגיים. */
const PHYSICAL_CLASS =
  /(^|:)-?(ml|mr|pl|pr|left|right|rounded-l|rounded-r|rounded-tl|rounded-tr|rounded-bl|rounded-br|border-l|border-r|scroll-ml|scroll-mr|scroll-pl|scroll-pr)-|(^|:)(text-left|text-right|float-left|float-right|clear-left|clear-right|border-l|border-r|rounded-l|rounded-r)$/;

describe("Button (shadcn, rtl: true)", () => {
  afterEach(cleanup);

  it("renders a native button inside an RTL document and reads direction from the provider", () => {
    document.documentElement.setAttribute("dir", "rtl");
    document.documentElement.setAttribute("lang", "he");

    render(
      <DirectionProvider direction="rtl">
        <Button>שלח</Button>
        <DirectionProbe />
      </DirectionProvider>,
    );

    const button = screen.getByRole("button", { name: "שלח" });
    expect(button.tagName).toBe("BUTTON");
    expect(button).toHaveAttribute("data-slot", "button");
    expect(button.closest("[dir='rtl']")).toBe(document.documentElement);
    expect(screen.getByTestId("direction")).toHaveTextContent("rtl");
  });

  it("uses only logical (start/end) spacing utilities, so padding flips correctly in RTL", () => {
    render(<Button size="lg">המשך</Button>);
    const classes = screen.getByRole("button", { name: "המשך" }).className.split(/\s+/);

    expect(classes.filter((cls) => PHYSICAL_CLASS.test(cls))).toEqual([]);
    expect(classes.some((cls) => /:pe-\d/.test(cls))).toBe(true);
    expect(classes.some((cls) => /:ps-\d/.test(cls))).toBe(true);
    expect(classes).toContain("has-data-[icon=inline-start]:ps-2");
    expect(classes).toContain("has-data-[icon=inline-end]:pe-2");
  });

  it("supports rendering as a link (CTA) without losing the button styles", () => {
    render(
      <Button nativeButton={false} render={<a href="/start" />}>
        להתחיל
      </Button>,
    );
    // Base UI שומר על role="button" גם כשהאלמנט הוא <a> (נגישות אחידה)
    const link = screen.getByRole("button", { name: "להתחיל" });
    expect(link.tagName).toBe("A");
    expect(link).toHaveAttribute("href", "/start");
    expect(link.className).toContain("inline-flex");
  });
});

/** Every string literal in a source file, split into class-like tokens. */
function classTokens(source: string): string[] {
  const literals = [...source.matchAll(/"([^"\n]*)"|`([^`]*)`/g)].map((m) => m[1] ?? m[2] ?? "");
  return literals.flatMap((l) => l.split(/[\s{}$]+/)).filter(Boolean);
}

describe("logical (RTL-safe) classes across the brand and auth components", () => {
  const root = join(__dirname, "..");
  const dirs = ["brand", "auth"];
  const files = dirs.flatMap((d) => {
    try {
      return readdirSync(join(root, d))
        .filter((f) => f.endsWith(".tsx") && !f.endsWith(".test.tsx"))
        .map((f) => join(root, d, f));
    } catch {
      return [];
    }
  });

  it("finds the brand components", () => {
    expect(files.some((f) => f.endsWith("chat-demo.tsx"))).toBe(true);
  });

  it.each(files.map((f) => [f.slice(root.length + 1), f]))("%s uses no physical left/right utilities", (_name, file) => {
    const offenders = classTokens(readFileSync(file, "utf8")).filter((t) => PHYSICAL_CLASS.test(t));
    expect(offenders).toEqual([]);
  });

  it("the scanner itself catches physical classes", () => {
    expect(classTokens('className="ml-2 ps-4 hover:pr-1 text-right"').filter((t) => PHYSICAL_CLASS.test(t))).toEqual(["ml-2", "hover:pr-1", "text-right"]);
  });
});
