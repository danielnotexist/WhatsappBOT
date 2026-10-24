"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { cn } from "@/lib/utils";

/**
 * The overview's charts (dataviz rules: one series each, so no legend box — the title names it; honey columns at most
 * 24px wide with a 4px rounded top and a square foot on one baseline; hairline grid; the values in text tokens).
 * Hover or focus a column — arrows move along the days — for its value; every value is also in the table under the
 * chart. Time runs left to right (the numbers' own direction), oldest first.
 */

export type ValueFormat = "int" | "usd" | "ils";

const he = new Intl.NumberFormat("he-IL");
function fmt(v: number, format: ValueFormat): string {
  if (format === "usd") return v === 0 ? "$0" : v < 10 ? `$${v.toFixed(2)}` : `$${Math.round(v).toLocaleString("en-US")}`;
  if (format === "ils") return `${he.format(Math.round(v))} ₪`;
  return he.format(Math.round(v));
}

/** A clean ceiling for the axis: 1, 2, 5 × 10ⁿ. */
function niceMax(v: number): number {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 2, 5, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}

function dayLabel(day: string): string {
  const [, m, d] = day.split("-");
  return `${Number(d)}.${Number(m)}`;
}

export function DailyColumns({ title, total, rows, format = "int" }: { title: string; total: string; rows: { day: string; value: number }[]; format?: ValueFormat }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  const [active, setActive] = useState<number | null>(null);
  const titleId = useId();
  const tableId = useId();

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.max(240, Math.round(entry!.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const height = 168;
  const top = 14;
  const bottom = 24;
  const plotH = height - top - bottom;
  const max = niceMax(Math.max(0, ...rows.map((r) => r.value)));
  const slot = width / Math.max(rows.length, 1);
  const bar = Math.max(3, Math.min(24, slot - 4));
  const x = (i: number) => i * slot + (slot - bar) / 2;
  const h = (v: number) => (v <= 0 ? 0 : Math.max(2, (v / max) * plotH));
  const baseY = top + plotH;
  const point = active === null ? null : rows[active];

  const onKey = (e: KeyboardEvent<SVGSVGElement>) => {
    if (!rows.length) return;
    if (e.key === "ArrowRight" || e.key === "ArrowLeft" || e.key === "Home" || e.key === "End") {
      e.preventDefault();
      setActive((cur) => {
        if (e.key === "Home") return 0;
        if (e.key === "End") return rows.length - 1;
        const next = (cur ?? rows.length - 1) + (e.key === "ArrowRight" ? 1 : -1);
        return Math.min(rows.length - 1, Math.max(0, next));
      });
    }
  };

  return (
    <figure className="min-w-0">
      <figcaption className="flex items-baseline justify-between gap-4">
        <span id={titleId} className="text-[0.9375rem] text-cream-muted">
          {title}
        </span>
        <span className="text-[1.375rem] leading-none font-semibold text-cream">{total}</span>
      </figcaption>
      <div ref={wrapRef} dir="ltr" className="relative mt-4" onPointerLeave={() => setActive(null)}>
        <svg
          width={width}
          height={height}
          role="img"
          aria-labelledby={titleId}
          aria-describedby={tableId}
          tabIndex={0}
          onKeyDown={onKey}
          onFocus={() => setActive((a) => a ?? rows.length - 1)}
          onBlur={() => setActive(null)}
          className="block max-w-full rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-honey"
        >
          {/* hairline grid: the ceiling and the half */}
          {[0, 0.5, 1].map((f) => (
            <line key={f} x1={0} x2={width} y1={top + plotH * (1 - f)} y2={top + plotH * (1 - f)} stroke="var(--alze-line)" strokeWidth={1} />
          ))}
          {rows.map((r, i) => {
            const hh = h(r.value);
            const y = baseY - hh;
            const rad = Math.min(4, bar / 2, hh);
            const d =
              hh <= 0
                ? ""
                : `M${x(i)},${baseY} V${y + rad} Q${x(i)},${y} ${x(i) + rad},${y} H${x(i) + bar - rad} Q${x(i) + bar},${y} ${x(i) + bar},${y + rad} V${baseY} Z`;
            const last = i === rows.length - 1;
            return (
              <g key={r.day} onPointerEnter={() => setActive(i)}>
                {/* the hit target is the whole slot, not only the painted column */}
                <rect x={i * slot} y={top} width={slot} height={plotH} fill="transparent" />
                {d ? <path d={d} fill="var(--alze-honey)" opacity={active === null || active === i ? (last ? 1 : 0.82) : 0.4} /> : null}
              </g>
            );
          })}
          {/* the axis: the first, the middle and the last day; the ceiling's value */}
          {rows.length
            ? [0, Math.floor((rows.length - 1) / 2), rows.length - 1].map((i, k) => (
                <text key={k} x={k === 0 ? 0 : k === 2 ? width : x(i) + bar / 2} y={height - 6} textAnchor={k === 0 ? "start" : k === 2 ? "end" : "middle"} className="fill-cream-muted text-[11px]">
                  {dayLabel(rows[i]!.day)}
                </text>
              ))
            : null}
          <text x={0} y={top - 4} textAnchor="start" className="fill-cream-muted text-[11px] tabular">
            {fmt(max, format)}
          </text>
        </svg>
        {point && active !== null ? (
          <div
            role="status"
            className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded-xl border border-line bg-night px-3 py-2 text-center shadow-stage"
            style={{ left: Math.min(Math.max(x(active) + bar / 2, 56), width - 56) }}
          >
            <span className="block text-[1rem] leading-tight font-semibold text-cream tabular">{fmt(point.value, format)}</span>
            <span className="block text-[0.75rem] text-cream-muted">{dayLabel(point.day)}</span>
          </div>
        ) : null}
      </div>
      <details className="group mt-3">
        <summary className="inline-flex min-h-9 cursor-pointer items-center text-[0.8125rem] text-cream-muted underline-offset-4 hover:text-cream hover:underline">הנתונים בטבלה</summary>
        <div className="mt-2 max-h-64 overflow-auto rounded-xl border border-line">
          <table id={tableId} className="w-full text-[0.8125rem]">
            <thead className="sticky top-0 bg-night-2 text-cream-muted">
              <tr>
                <th scope="col" className="px-3 py-2 text-start font-normal">
                  יום
                </th>
                <th scope="col" className="px-3 py-2 text-end font-normal">
                  {title}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows
                .slice()
                .reverse()
                .map((r) => (
                  <tr key={r.day}>
                    <td className="px-3 py-1.5 tabular">{dayLabel(r.day)}</td>
                    <td className="px-3 py-1.5 text-end tabular">{fmt(r.value, format)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}

/**
 * A short list as horizontal bars (the funnel, the plans, the sources): the label and the count in text, a honey bar
 * for the size — one hue, the bar's length is the only encoding. `of`: the 100% (the first step of a funnel).
 */
export function ShareBars({ title, rows, of, className }: { title: string; rows: { key: string; label: string; count: number }[]; of?: number; className?: string }) {
  const max = Math.max(1, of ?? Math.max(0, ...rows.map((r) => r.count)));
  return (
    <figure className={cn("min-w-0", className)}>
      <figcaption className="text-[0.9375rem] text-cream-muted">{title}</figcaption>
      <ul className="mt-4 grid gap-3">
        {rows.map((r) => {
          const pct = Math.round((r.count / max) * 100);
          return (
            <li key={r.key} className={cn("grid items-center gap-3 text-[0.9375rem]", of ? "grid-cols-[minmax(0,7.5rem)_minmax(0,1fr)_2.5rem_2.75rem]" : "grid-cols-[minmax(0,7.5rem)_minmax(0,1fr)_2.5rem]")}>
              <span className="truncate text-cream">{r.label}</span>
              <span className="relative h-2.5 rounded-full bg-cream/[0.06]" aria-hidden="true">
                {r.count > 0 ? <span className="absolute inset-y-0 start-0 rounded-full bg-honey" style={{ width: `${Math.max(pct, 2)}%` }} /> : null}
              </span>
              <span className="text-end text-cream tabular">{he.format(r.count)}</span>
              {of ? <span className="text-end text-[0.8125rem] text-cream-muted tabular">{pct}%</span> : null}
            </li>
          );
        })}
      </ul>
    </figure>
  );
}
