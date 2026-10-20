// @vitest-environment jsdom
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
  /(^|:)-?(ml|mr|pl|pr|left|right|text-left|text-right|rounded-l|rounded-r|border-l|border-r)-/;

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
