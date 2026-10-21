// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { MAX_CELLS, UsageMeter, meterLevel } from "./usage-meter";

afterEach(cleanup);

describe("meterLevel", () => {
  it("is ok below 90%, high from 90%, full at or over the limit", () => {
    expect(meterLevel(0, 10)).toBe("ok");
    expect(meterLevel(8, 10)).toBe("ok");
    expect(meterLevel(9, 10)).toBe("high");
    expect(meterLevel(10, 10)).toBe("full");
    expect(meterLevel(12, 10)).toBe("full");
    expect(meterLevel(674, 750)).toBe("ok");
    expect(meterLevel(675, 750)).toBe("high");
    expect(meterLevel(0, 0)).toBe("full");
  });
});

describe("UsageMeter", () => {
  it("shows the 10-message trial as ten cells, filled from the start, with an accessible meter", () => {
    const { container } = render(<UsageMeter used={4} limit={10} label="הודעות בתקופת הניסיון" caption="נשארו 6." />);
    const meter = screen.getByRole("meter", { name: "הודעות בתקופת הניסיון" });
    expect(meter).toHaveAttribute("aria-valuenow", "4");
    expect(meter).toHaveAttribute("aria-valuemin", "0");
    expect(meter).toHaveAttribute("aria-valuemax", "10");
    expect(meter).toHaveAttribute("aria-valuetext", "4 מתוך 10");
    const cells = meter.querySelectorAll("[aria-hidden] > span");
    expect(cells).toHaveLength(10);
    expect([...cells].map((c) => c.hasAttribute("data-filled"))).toEqual([true, true, true, true, false, false, false, false, false, false]);
    expect(screen.getByText("נשארו 6.")).toBeInTheDocument();
    expect(container.firstElementChild).toHaveAttribute("data-level", "ok");
  });

  it("uses a continuous bar above the cell limit, with grouped numbers and a visible minimum fill", () => {
    render(<UsageMeter used={1} limit={3000} label="הודעות החודש" />);
    const meter = screen.getByRole("meter", { name: "הודעות החודש" });
    expect(meter.querySelectorAll("[data-filled]")).toHaveLength(0);
    const fill = meter.querySelector<HTMLElement>("[data-fill]")!;
    expect(fill.style.width).toContain("0.375rem"); // 1/3000 is still a visible sliver
    expect(meter).toHaveAttribute("aria-valuetext", "1 מתוך 3,000");
    expect(screen.getByText("3,000", { exact: false })).toBeInTheDocument();
  });

  it("scales the bar to the share used, and draws nothing at zero", () => {
    const { rerender } = render(<UsageMeter used={375} limit={750} label="הודעות החודש" />);
    expect(screen.getByRole("meter").querySelector<HTMLElement>("[data-fill]")!.style.width).toContain("50.00%");
    rerender(<UsageMeter used={0} limit={750} label="הודעות החודש" />);
    expect(screen.getByRole("meter").querySelector<HTMLElement>("[data-fill]")!.style.width).toBe("0px");
  });

  it("turns to the error colour at the limit and clamps values over it", () => {
    const { container } = render(<UsageMeter used={14} limit={10} label="הודעות בתקופת הניסיון" />);
    const meter = screen.getByRole("meter");
    expect(meter).toHaveAttribute("aria-valuenow", "10");
    expect(container.firstElementChild).toHaveAttribute("data-level", "full");
    expect(meter.querySelectorAll("[data-filled]")).toHaveLength(10);
    expect(meter.querySelector("[data-filled]")!.className).toContain("bg-destructive");
  });

  it("switches from cells to a bar exactly above MAX_CELLS", () => {
    const { rerender } = render(<UsageMeter used={1} limit={MAX_CELLS} label="א" />);
    expect(screen.getByRole("meter").querySelector("[data-fill]")).toBeNull();
    rerender(<UsageMeter used={1} limit={MAX_CELLS + 1} label="א" />);
    expect(screen.getByRole("meter").querySelector("[data-fill]")).not.toBeNull();
  });
});
