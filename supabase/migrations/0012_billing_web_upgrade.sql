-- =============================================================================
-- 0012_billing_web_upgrade.sql — שדרוג בסיסי → פרו מדף התשלום באתר (/pay/<token>)
--
-- רקע: עד עכשיו שדרוג היה רק מוואטסאפ (0007): הצעה עם כפתור, ולחיצה מהמספר המקושר תוך 10 דקות. בדף התשלום
-- האישי (בלי session, הקישור החתום מזהה את החשבון) מוצג אותו מחיר יחסי בדיוק, ולחיצה על "לשדרג עכשיו" מחייבת
-- את הכרטיס השמור באותו קוד חיוב (lib/billing/one-tap.ts).
--   * האישור מהאתר נרשם באותה טבלה, billing_approvals, כ-upgrade שנוצר כבר תפוס (processing): שליחת הטופס היא
--     הלחיצה. id = ה-nonce החד-פעמי של הטופס (UUID שנוצר בהצגת הדף, חתום יחד עם הסכום וסוף התקופה, 10 דקות),
--     approved_msg_id = 'web:' || id, בלי מספר טלפון.
--   * טופס שנשלח פעמיים (לחיצה כפולה, רענון, "חזרה" ושליחה מחדש) → אותו id → unique_violation → לא נוצר אישור
--     שני ולא יוצא חיוב שני. חיוב אחר פתוח של המשתמש (וואטסאפ / חודשי / "לא ידוע") → אותו אינדקס של 0007
--     (billing_approvals_one_open_charge_per_user) → לא מחייבים.
--   * אישור מהאתר לא נתפס אף פעם מוואטסאפ: claim_billing_approval() דורש את המספר שאליו נשלחה ההצעה, ואין כזה.
-- =============================================================================

alter table public.billing_approvals drop constraint billing_approvals_phone_format;
alter table public.billing_approvals add constraint billing_approvals_phone_format check (
  -- the automatic monthly charge (a lock, not an offer)
  (kind = 'renewal' and phone_e164 is null)
  -- an upgrade approved on the pay page: already claimed, by the form's single-use nonce (= the row id)
  or (kind = 'upgrade' and phone_e164 is null and status <> 'pending'
      and approved_msg_id is not null and approved_msg_id = 'web:' || id::text)
  -- an offer sent in WhatsApp: always to the linked number
  or (kind <> 'renewal' and phone_e164 is not null and phone_e164 ~ '^\+[1-9][0-9]{6,14}$')
);

comment on column public.billing_approvals.phone_e164 is
  'המספר המקושר שאליו נשלחה ההצעה. לחיצה מכל מספר אחר נדחית. null רק ב-renewal (חיוב חודשי אוטומטי — נעילה, לא הצעה) ובשדרוג שאושר בדף התשלום באתר (approved_msg_id = ''web:'' || id, 0012).';
comment on column public.billing_approvals.approved_msg_id is
  'wamid של לחיצת האישור, או ''web:'' || id לשדרוג שאושר בדף התשלום באתר (0012). ייחודי: לחיצה אחת מאשרת לכל היותר הצעה אחת.';
