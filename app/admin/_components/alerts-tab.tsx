import type { ReactNode } from "react";
import { Cta } from "@/components/brand/cta";
import type { OwnerAlertSettings } from "@/lib/admin/alerts";
import { formatAgo, formatDateTime } from "@/lib/admin/view";
import { ALERT_TYPE_LABEL, OWNER_ALERT_KINDS, type AlertUrgency } from "@/lib/copy/owner-alerts";
import type { OwnerAlertChannel, OwnerAlertRow, OwnerAlertStatus } from "@/lib/db/types";
import { cn } from "@/lib/utils";
import { saveAlertSettingsAction, sendTestAlertAction } from "../alerts-actions";
import { Empty, Ltr, Panel, Pill, TableWrap, td, th } from "./parts";

/**
 * "התראות" — what the owner is told about by mail (lib/admin/alerts.ts): a switch per type, the quiet hours and
 * Shabbat, a test mail, and the last 20 alerts. One plain form (works without JavaScript); the switches are native
 * checkboxes with role="switch", drawn in the panel's honey.
 */

const URGENCY: Record<AlertUrgency, string> = {
  urgent: "יוצא מיד, גם בשעות השקט",
  digest: "בשעות השקט נאסף למייל של הבוקר",
  urgent_at_100: "80% נאסף בשעות השקט, 100% יוצא מיד",
};

export const ALERT_STATUS: Record<OwnerAlertStatus, { label: string; tone: "ok" | "warn" | "error" | "off" }> = {
  sending: { label: "בשליחה", tone: "warn" },
  sent: { label: "נשלחה", tone: "ok" },
  queued: { label: "ממתינה למייל המרוכז", tone: "warn" },
  failed: { label: "נכשלה", tone: "error" },
  limited: { label: "נחסמה במגבלת הקצב", tone: "off" },
  merged: { label: "אוחדה עם מייל הפנייה", tone: "ok" },
};

export const ALERT_CHANNEL: Record<OwnerAlertChannel, string> = {
  email: "מייל",
  whatsapp: "וואטסאפ",
  "email+whatsapp": "מייל ווואטסאפ",
  digest: "מייל מרוכז",
};

const hours = Array.from({ length: 24 }, (_, h) => h);
const hh = (h: number) => `${String(h).padStart(2, "0")}:00`;

const field = "h-11 rounded-field border border-line bg-night px-3 text-[0.9375rem] text-cream";

/** A native checkbox drawn as a switch: the track fills with honey, the thumb moves to the inline end. */
function Switch({ id, name, checked, label, hint, children }: { id: string; name: string; checked: boolean; label: string; hint?: string; children?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-5 py-4">
      <div className="min-w-0">
        <label htmlFor={id} className="cursor-pointer text-[1rem] leading-snug font-semibold text-cream">
          {label}
        </label>
        {hint ? (
          <p id={`${id}-hint`} className="mt-1 max-w-[38rem] text-[0.875rem] leading-relaxed text-cream-muted">
            {hint}
          </p>
        ) : null}
        {children}
      </div>
      <input
        id={id}
        name={name}
        type="checkbox"
        role="switch"
        defaultChecked={checked}
        aria-describedby={hint ? `${id}-hint` : undefined}
        className={cn(
          "relative mt-0.5 h-7 w-12 flex-none cursor-pointer appearance-none rounded-full border-2 border-cream-muted/55 bg-cream/[0.06] transition-colors duration-150",
          "checked:border-honey checked:bg-honey focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-honey",
          "before:absolute before:top-1/2 before:start-[0.1875rem] before:size-[1.125rem] before:-translate-y-1/2 before:rounded-full before:bg-cream before:transition-[inset-inline-start] before:duration-200",
          "checked:before:start-[calc(100%-1.3125rem)] checked:before:bg-night motion-reduce:before:transition-none",
        )}
      />
    </div>
  );
}

export function AlertsTab({
  settings,
  recent,
  channels,
  now,
}: {
  settings: OwnerAlertSettings;
  recent: OwnerAlertRow[];
  channels: { emails: string[]; emailError: string | null; whatsapp: string | null; whatsappError: string | null };
  now: Date;
}) {
  return (
    <div className="grid gap-14">
      <Panel
        id="alerts"
        title="התראות"
        lead={
          <>
            מיילים על מה שקורה במערכת: נרשמים חדשים, פניות, תשלומים ותקלות. נשלחים אל{" "}
            {channels.emails.length ? (
              channels.emails.map((e, i) => (
                <span key={e}>
                  {i ? ", " : ""}
                  <Ltr className="text-cream">{e}</Ltr>
                </span>
              ))
            ) : (
              <span className="text-cream">אין כתובת</span>
            )}
            .
          </>
        }
        action={
          <form action={sendTestAlertAction}>
            <Cta type="submit" tone="ghost" size="sm">
              שליחת מייל בדיקה
            </Cta>
          </form>
        }
      >
        <div className="mb-8 grid gap-1 text-[0.875rem] leading-relaxed text-cream-muted">
          {channels.emailError ? <p className="text-cream">{channels.emailError}</p> : null}
          <p>
            וואטסאפ:{" "}
            {channels.whatsapp ? (
              <>
                פעיל, אל <Ltr className="text-cream">+{channels.whatsapp}</Ltr> (התבנית owner_alert).
              </>
            ) : (
              <>
                כבוי. יופעל אחרי שהתבנית <Ltr>owner_alert</Ltr> תאושר ב-Meta, עם <Ltr>OWNER_ALERT_WA</Ltr> ו-<Ltr>ADMIN_PHONE</Ltr>.
              </>
            )}
          </p>
          {channels.whatsappError ? <p className="text-cream">{channels.whatsappError}</p> : null}
        </div>

        <form action={saveAlertSettingsAction} className="grid gap-10">
          <fieldset className="min-w-0">
            <legend className="font-heading text-[1.125rem] font-bold text-cream">סוגי התראות</legend>
            <div className="mt-2 divide-y divide-line border-y border-line">
              {OWNER_ALERT_KINDS.map((k) => (
                <Switch key={k.type} id={`alert-${k.type}`} name={`type_${k.type}`} checked={settings.types[k.type]} label={k.label} hint={`${k.description} ${URGENCY[k.urgency]}.`}>
                  {k.type === "error_spike" ? (
                    <label className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[0.875rem] text-cream-muted">
                      תקלות בשעה שמפעילות התראה
                      <input name="spike_threshold" type="number" inputMode="numeric" min={1} max={10000} step={1} defaultValue={settings.errorSpikeThreshold} className={cn(field, "w-24 tabular")} />
                    </label>
                  ) : null}
                </Switch>
              ))}
            </div>
          </fieldset>

          <fieldset className="min-w-0">
            <legend className="font-heading text-[1.125rem] font-bold text-cream">שעות שקט</legend>
            <div className="mt-2 divide-y divide-line border-y border-line">
              <Switch id="alert-quiet" name="quiet_enabled" checked={settings.quiet.enabled} label="שעות שקט" hint="התראות שאינן דחופות נאספות, ויוצאות במייל מרוכז אחד כששעות השקט נגמרות. לפי שעון ישראל.">
                <div className="mt-3 flex flex-wrap gap-3">
                  <label className="grid gap-1.5 text-[0.8125rem] text-cream-muted">
                    מהשעה
                    <select name="quiet_start" defaultValue={settings.quiet.start} className={cn(field, "min-w-[7rem] tabular")}>
                      {hours.map((h) => (
                        <option key={h} value={h}>
                          {hh(h)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="grid gap-1.5 text-[0.8125rem] text-cream-muted">
                    עד השעה
                    <select name="quiet_end" defaultValue={settings.quiet.end} className={cn(field, "min-w-[7rem] tabular")}>
                      {hours.map((h) => (
                        <option key={h} value={h}>
                          {hh(h)}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </Switch>
              <Switch id="alert-shabbat" name="shabbat" checked={settings.quiet.shabbat} label="שבת וחג" hint="גם משישי בצהריים עד מוצאי שבת, ובחגים, נאספות ההתראות שאינן דחופות." />
            </div>
          </fieldset>

          <div>
            <Cta type="submit" tone="honey" size="sm">
              שמירת ההגדרות
            </Cta>
          </div>
        </form>
      </Panel>

      <Panel id="alerts-log" title="ההתראות האחרונות" lead="20 האחרונות, מהחדשה לישנה. כל אירוע נשלח פעם אחת בלבד.">
        {recent.length ? <AlertsTable rows={recent} now={now} /> : <Empty>עוד לא נשלחו התראות.</Empty>}
      </Panel>
    </div>
  );
}

function AlertsTable({ rows, now }: { rows: OwnerAlertRow[]; now: Date }) {
  return (
    <TableWrap label="טבלת ההתראות האחרונות">
      <table className="w-full min-w-[44rem] border-collapse text-[0.9375rem]">
        <thead>
          <tr className="border-b border-line">
            <th scope="col" className={th}>
              זמן
            </th>
            <th scope="col" className={th}>
              סוג
            </th>
            <th scope="col" className={th}>
              נושא
            </th>
            <th scope="col" className={th}>
              ערוץ
            </th>
            <th scope="col" className={th}>
              סטטוס
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((r) => {
            const st = ALERT_STATUS[r.status];
            return (
              <tr key={r.id}>
                <td className={cn(td, "whitespace-nowrap text-cream-muted")} title={formatDateTime(r.created_at)}>
                  {formatAgo(r.created_at, now)}
                </td>
                <td className={cn(td, "whitespace-nowrap")}>{ALERT_TYPE_LABEL[r.type]}</td>
                <td className={cn(td, "max-w-[26rem] break-words text-cream")}>{r.subject}</td>
                <td className={cn(td, "whitespace-nowrap text-cream-muted")}>{r.channel ? ALERT_CHANNEL[r.channel] : "-"}</td>
                <td className={td}>
                  <Pill tone={st.tone}>{st.label}</Pill>
                  {r.error && r.status !== "sent" ? <p className="mt-1 max-w-[18rem] text-[0.8125rem] leading-snug text-cream-muted">{r.error}</p> : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </TableWrap>
  );
}
