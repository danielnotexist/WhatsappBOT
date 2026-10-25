import Link from "next/link";
import type { Route } from "next";
import { biggestDrop, deviceRows, formatPct, funnelRows, pageLabel, RANGES, sourceRows, totals, type FunnelRow, type RangeDays } from "@/lib/analytics/report";
import { formatInt } from "@/lib/admin/view";
import type { AnalyticsReport } from "@/lib/db/types";
import { cn } from "@/lib/utils";
import { tabHref } from "../tabs";
import { DailyColumns, ShareBars } from "./charts";
import { Empty, Ltr, Panel, Stat, TableWrap, td, th } from "./parts";

/**
 * "תנועה" (round plan "אנליטיקה ו-SEO"): who comes to the site, from where, and where the signup loses them — from the
 * cookie-less beacon (lib/analytics). One hue throughout (honey on the night stage, dataviz: every chart here is one
 * series, so no legend boxes — the titles name them): visitors and page views per day as two small multiples on their
 * own axes, the funnel as bars from the inline start with the share of the step before, the biggest drop called out
 * in words. Every figure is also in text or in a table.
 */
export function TrafficTab({ report, range }: { report: AnalyticsReport; range: RangeDays }) {
  const t = totals(report.daily);
  const rows = funnelRows(report.funnel);
  const drop = biggestDrop(rows);
  const started = rows.find((r) => r.step === "signup_start")?.count ?? 0;
  const paid = rows.find((r) => r.step === "paid")?.count ?? 0;
  const empty = t.views === 0 && rows.every((r) => r.count === 0);

  return (
    <div className="grid gap-14">
      <section aria-labelledby="traffic-title" className="min-w-0">
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
          <div className="min-w-0">
            <h2 id="traffic-title" className="font-heading text-[1.375rem] leading-tight font-bold">
              תנועה באתר
            </h2>
            <p className="mt-1 max-w-[44rem] text-[0.9375rem] leading-relaxed text-cream-muted">
              בלי עוגיות: כל מבקר מקבל מזהה אנונימי שמתחלף כל יום, ולכן מבקר שחוזר ביום אחר נספר שוב. לפי יום, בשעון ישראל.
            </p>
          </div>
          <RangePicker range={range} />
        </div>
        <dl className="mt-6 grid grid-cols-2 gap-x-6 border-y border-line py-2 sm:grid-cols-4 sm:gap-x-10">
          <Stat label="מבקרים" value={formatInt(t.visitors)} note={`ב-${formatInt(range)} הימים האחרונים`} />
          <Stat label="צפיות בדפים" value={formatInt(t.views)} note={t.perVisitor === null ? "אין עדיין ביקורים" : `${t.perVisitor.toLocaleString("he-IL")} דפים לביקור`} />
          <Stat label="התחילו הרשמה" value={formatInt(started)} note={`${formatPct(rows[1]?.ofFirst ?? null)} מהמבקרים`} />
          <Stat label="שילמו" value={formatInt(paid)} note={`${formatPct(rows.at(-1)?.ofFirst ?? null)} מהמבקרים`} />
        </dl>
      </section>

      {empty ? <Empty>עדיין אין ביקורים בטווח הזה. הנתונים מתחילים להיאסף מהביקור הראשון אחרי הפריסה.</Empty> : null}

      <Panel id="traffic-days" title="לפי יום" lead="היום הוא העמודה האחרונה. ריחוף או מקשי החצים מראים את הערך של כל יום.">
        <div className="grid gap-x-10 gap-y-12 lg:grid-cols-2">
          <DailyColumns title="מבקרים ייחודיים" total={formatInt(t.visitors)} rows={report.daily.map((d) => ({ day: d.day, value: d.visitors }))} />
          <DailyColumns title="צפיות בדפים" total={formatInt(t.views)} rows={report.daily.map((d) => ({ day: d.day, value: d.views }))} />
        </div>
      </Panel>

      <Panel id="traffic-funnel" title="משפך ההרשמה" lead="כמה מבקרים הגיעו לכל שלב, ומה החלק שלהם מהשלב שלפני.">
        {drop ? (
          <p className="mb-6 flex max-w-[44rem] gap-3 rounded-2xl border border-honey/35 bg-honey/[0.07] px-4 py-3 text-[0.9375rem] leading-relaxed">
            <span aria-hidden="true" className="mt-[0.45em] size-2 flex-none rounded-full bg-honey" />
            <span>
              <b className="font-semibold text-honey">הנפילה הגדולה ביותר בהרשמה:</b> בין ״{drop.from.label}״ ל״{drop.to.label}״. {formatPct(drop.dropPct)} לא המשיכו ({formatInt(drop.to.lost)} מתוך {formatInt(drop.from.count)}).
            </span>
          </p>
        ) : null}
        <FunnelBars rows={rows} dropAt={drop?.to.step ?? null} />
      </Panel>

      <div className="grid gap-x-12 gap-y-14 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Panel id="traffic-pages" title="הדפים המובילים" lead="צפיות, ומבקרים שראו את הדף.">
          {report.pages.length ? (
            <TableWrap label="טבלת הדפים המובילים">
              <table className="w-full min-w-[22rem] border-y border-line text-[0.9375rem]">
                <thead>
                  <tr className="border-b border-line">
                    <th scope="col" className={th}>
                      דף
                    </th>
                    <th scope="col" className={cn(th, "text-end")}>
                      צפיות
                    </th>
                    <th scope="col" className={cn(th, "text-end")}>
                      מבקרים
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {report.pages.map((p) => {
                    const label = pageLabel(p.path);
                    return (
                      <tr key={p.path}>
                        <td className={cn(td, "min-w-0")}>
                          {label ? <span className="block text-cream">{label}</span> : null}
                          <Ltr className={cn("inline-block max-w-full truncate align-bottom text-[0.8125rem]", label ? "text-cream-muted" : "text-cream")}>{p.path}</Ltr>
                        </td>
                        <td className={cn(td, "text-end text-cream tabular")}>{formatInt(p.views)}</td>
                        <td className={cn(td, "text-end text-cream-muted tabular")}>{formatInt(p.visitors)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </TableWrap>
          ) : (
            <Empty>אין צפיות בטווח הזה.</Empty>
          )}
        </Panel>
        <div className="grid min-w-0 content-start gap-14">
          <Panel id="traffic-sources" title="מאיפה הגיעו" lead="utm_source של הקמפיין, אחרת האתר המפנה.">
            {report.sources.length ? <ShareBars title="מבקרים לפי מקור" rows={sourceRows(report.sources)} /> : <Empty>אין ביקורים בטווח הזה.</Empty>}
          </Panel>
          <Panel id="traffic-devices" title="טלפון או מחשב" lead="לפי רוחב המסך בביקור.">
            <ShareBars title="מבקרים לפי מכשיר" rows={deviceRows(report.devices)} of={report.devices.reduce((s, d) => s + d.visitors, 0)} />
          </Panel>
        </div>
      </div>
    </div>
  );
}

/** 7 / 30 / 90 days: links (the server renders each range), the current one marked. */
function RangePicker({ range }: { range: RangeDays }) {
  return (
    <nav aria-label="טווח הימים">
      <ul className="flex rounded-full border border-line p-1">
        {RANGES.map((r) => (
          <li key={r}>
            <Link
              href={tabHref("traffic", r === 30 ? {} : { range: String(r) }) as Route}
              aria-current={r === range ? "page" : undefined}
              className="flex min-h-10 items-center rounded-full px-4 text-[0.9375rem] text-cream-muted transition-colors hover:text-cream aria-[current=page]:bg-honey aria-[current=page]:text-night"
            >
              {r} ימים
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/**
 * The funnel: one row per step — the name, a bar from the inline start (inline SVG; its length is the step's share of
 * the first step), the count and the share of the step before. The step after the biggest drop is marked in words.
 */
function FunnelBars({ rows, dropAt }: { rows: FunnelRow[]; dropAt: string | null }) {
  return (
    <ol className="grid gap-1">
      {rows.map((r, i) => {
        const width = Math.max(0, Math.min(100, r.ofFirst ?? 0));
        const isDrop = r.step === dropAt;
        return (
          <li key={r.step} className={cn("grid items-center gap-x-4 gap-y-1.5 rounded-xl px-3 py-2.5 sm:grid-cols-[minmax(0,10rem)_minmax(0,1fr)_4.5rem_6.5rem]", isDrop && "bg-honey/[0.06] ring-1 ring-honey/30")}>
            <span className="flex items-baseline justify-between gap-3 text-[0.9375rem] text-cream sm:block">
              <span>
                <span className="me-2 text-[0.8125rem] text-cream-muted tabular">{i + 1}.</span>
                {r.label}
              </span>
              <span className="flex flex-none items-baseline gap-2 tabular sm:hidden">
                <span className="text-cream">{formatInt(r.count)}</span>
                {i === 0 ? null : <span className="text-[0.8125rem] text-cream-muted">{formatPct(r.ofPrevious)} מהקודם</span>}
              </span>
            </span>
            <svg role="presentation" aria-hidden="true" width="100%" height="12" className="block overflow-visible">
              <rect x="0" y="0" width="100%" height="12" rx="6" fill="var(--alze-cream)" opacity="0.06" />
              {r.count > 0 ? <rect x={`${100 - Math.max(width, 1)}%`} y="0" width={`${Math.max(width, 1)}%`} height="12" rx="4" fill="var(--alze-honey)" /> : null}
            </svg>
            <span className="text-end text-cream tabular max-sm:hidden">{formatInt(r.count)}</span>
            <span className="text-end text-[0.8125rem] text-cream-muted tabular max-sm:hidden">
              {i === 0 ? "100%" : `${formatPct(r.ofPrevious)} מהקודם`}
            </span>
            {isDrop ? <span className="text-[0.8125rem] text-honey sm:col-span-4">כאן הכי הרבה נעצרים: {formatInt(r.lost)} לא המשיכו מהשלב הקודם.</span> : null}
          </li>
        );
      })}
    </ol>
  );
}
