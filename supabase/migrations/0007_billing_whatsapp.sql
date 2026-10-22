-- =============================================================================
-- 0007_billing_whatsapp.sql — חיוב מתוך וואטסאפ בלחיצה אחת (HYP, טוקן שמור)
-- (0006 שמור בכוונה למיגרציית הסוכנים שנבנית במקביל.)
--
--   * billing_approvals — הצעה שנשלחה בוואטסאפ עם כפתורים (שדרוג / ניסיון חוזר / חידוש / ביטול /
--     מעבר לבסיסי / המשך מנוי / ביטול מעבר מתוכנן לבסיסי — keep_pro). כלל קשיח: חיוב רק מלחיצה על כפתור, מהמספר המקושר שאליו נשלחה
--     ההצעה, תוך 10 דקות. ה-10 דקות אכוף כאן ב-CHECK (expires_at <= created_at + 10 min).
--   * claim_billing_approval() — pending → processing באופן אטומי (בדיקת משתמש, מספר, תוקף).
--     לחיצה כפולה / webhook כפול / שתי לחיצות במקביל → רק אחת מצליחה → חיוב אחד לכל אישור.
--   * אינדקס ייחודי: לכל משתמש לכל היותר חיוב אחד בתהליך או "לא ידוע" (תקלת רשת אחרי שליחה ל-HYP)
--     — עד בירור ידני לא נשלח חיוב נוסף. גם החיוב החודשי האוטומטי (kind = 'renewal', בלי מספר טלפון)
--     פותח שורה כזו לפני הפנייה ל-HYP, כך שחיוב אוטומטי ולחיצת "ניסיון חוזר" לא ירוצו יחד.
--   * payments.approval_id — לכל אישור לכל היותר תשלום מוצלח אחד.
--   * subscriptions.scheduled_plan — מעבר מסלול שנכנס לתוקף בחיוב הבא (פרו → בסיסי).
--   * raise_plan_limit() — שדרוג באמצע החודש מגדיל מיד את מכסת ההודעות של החודש הנוכחי.
--   * lower_plan_limit() — מעבר לבסיסי שנכנס לתוקף בחיוב החודשי מקטין מיד את מכסת החודש הנוכחי.
-- =============================================================================

create type public.billing_approval_kind   as enum ('upgrade', 'retry', 'renew', 'resume', 'cancel', 'downgrade', 'keep_pro', 'renewal');
create type public.billing_approval_status as enum ('pending', 'processing', 'succeeded', 'failed', 'declined', 'expired', 'unknown');

-- -----------------------------------------------------------------------------
-- billing_approvals
-- -----------------------------------------------------------------------------
create table public.billing_approvals (
  id               uuid                           primary key default gen_random_uuid(),
  user_id          uuid                           not null references public.users (id) on delete cascade,
  kind             public.billing_approval_kind   not null,
  plan             public.plan_kind               not null,
  amount_ils       numeric(10, 2)                 not null default 0,
  details          jsonb                          not null default '{}'::jsonb,
  phone_e164       text,
  status           public.billing_approval_status not null default 'pending',
  expires_at       timestamptz                    not null default (now() + interval '10 minutes'),
  approved_msg_id  text,
  approved_at      timestamptz,
  hyp_trans_id     text,
  ccode            text,
  error            text,
  created_at       timestamptz                    not null default now(),
  updated_at       timestamptz                    not null default now(),
  constraint billing_approvals_amount_nonneg     check (amount_ils >= 0),
  constraint billing_approvals_charge_amount     check (kind not in ('upgrade', 'retry', 'renew', 'renewal') or amount_ils > 0),
  constraint billing_approvals_paid_plan         check (plan in ('basic', 'pro')),
  constraint billing_approvals_details_is_object check (jsonb_typeof(details) = 'object'),
  constraint billing_approvals_ten_minutes       check (expires_at > created_at and expires_at <= created_at + interval '10 minutes'),
  -- הצעה למשתמש תמיד עם המספר שאליו נשלחה; רק חיוב חודשי אוטומטי (renewal) בלי מספר
  constraint billing_approvals_phone_format      check ((kind = 'renewal' and phone_e164 is null) or (kind <> 'renewal' and phone_e164 is not null and phone_e164 ~ '^\+[1-9][0-9]{6,14}$')),
  constraint billing_approvals_msg_unique        unique (approved_msg_id)
);
comment on table public.billing_approvals is
  'הצעת חיוב/שינוי מנוי בוואטסאפ (כפתורים). חיוב רק מלחיצה של המספר המקושר שאליו נשלחה ההצעה, תוך 10 דק''. claim_billing_approval() אטומי: pending → processing; אחריו succeeded / failed / unknown. שרת בלבד.';
comment on column public.billing_approvals.amount_ils      is 'הסכום שהוצג למשתמש (כולל מע"מ). מחייבים בדיוק אותו — לא מחשבים מחדש אחרי האישור.';
comment on column public.billing_approvals.details         is 'פירוט ההצעה: שורת חשבונית, ימים שנותרו, מע"מ, סוף תקופה, 4 ספרות אחרונות.';
comment on column public.billing_approvals.phone_e164      is 'המספר המקושר שאליו נשלחה ההצעה. לחיצה מכל מספר אחר נדחית. null רק ב-renewal (חיוב חודשי אוטומטי — נעילה, לא הצעה).';
comment on column public.billing_approvals.approved_msg_id is 'wamid של לחיצת האישור. ייחודי: לחיצה אחת מאשרת לכל היותר הצעה אחת.';
comment on column public.billing_approvals.status          is 'unknown = נשלח ל-HYP ולא התקבלה תשובה (תקלת רשת). חוסם חיובים נוספים למשתמש עד בירור ידני בפורטל HYP (Order = id).';

-- לכל היותר חיוב אחד "באוויר" למשתמש (processing / unknown) — חיוב כפול בלתי אפשרי גם במקביל.
create unique index billing_approvals_one_open_charge_per_user
  on public.billing_approvals (user_id)
  where status in ('processing', 'unknown') and kind in ('upgrade', 'retry', 'renew', 'renewal');

create index billing_approvals_user_created_idx on public.billing_approvals (user_id, created_at desc);

create trigger billing_approvals_set_updated_at
  before update on public.billing_approvals
  for each row execute function public.set_updated_at();

alter table public.billing_approvals enable row level security;
-- אין policy ואין GRANT ל-anon/authenticated: שרת בלבד (service_role).
revoke all on public.billing_approvals from anon, authenticated;
grant all on public.billing_approvals to service_role;

-- -----------------------------------------------------------------------------
-- payments.approval_id — תשלום מוצלח אחד לכל היותר לכל אישור
-- -----------------------------------------------------------------------------
alter table public.payments
  add column if not exists approval_id uuid references public.billing_approvals (id) on delete set null;
comment on column public.payments.approval_id is 'האישור בוואטסאפ שהוביל לחיוב (שדרוג / ניסיון חוזר / חידוש). null בחיוב חודשי אוטומטי ובתשלום מדף HYP.';

create unique index if not exists payments_one_success_per_approval
  on public.payments (approval_id)
  where approval_id is not null and ccode = '0';

-- -----------------------------------------------------------------------------
-- subscriptions.scheduled_plan — מעבר מסלול בחיוב הבא
-- -----------------------------------------------------------------------------
alter table public.subscriptions
  add column if not exists scheduled_plan public.plan_kind;
alter table public.subscriptions
  add constraint subscriptions_scheduled_plan_paid check (scheduled_plan is null or scheduled_plan in ('basic', 'pro'));
comment on column public.subscriptions.scheduled_plan is
  'מסלול שייכנס לתוקף בחיוב החודשי הבא (מעבר פרו → בסיסי מהשיחה). עד אז plan נשאר כמו שהוא. null = אין שינוי.';

grant select (scheduled_plan) on public.subscriptions to authenticated;

-- -----------------------------------------------------------------------------
-- claim_billing_approval — לחיצת אישור → processing (אטומי)
-- -----------------------------------------------------------------------------
create or replace function public.claim_billing_approval(
  p_id      uuid,
  p_user_id uuid,
  p_phone   text,
  p_msg_id  text
)
returns setof public.billing_approvals
language plpgsql
set search_path = ''
as $$
begin
  return query
    update public.billing_approvals a
       set status          = 'processing',
           approved_msg_id = p_msg_id,
           approved_at     = now()
     where a.id         = p_id
       and a.user_id    = p_user_id
       and a.phone_e164 = p_phone
       and a.status     = 'pending'
       and a.expires_at > now()
       -- the number is still the account's active linked number (not unlinked / blocked / moved to another account)
       and exists (
             select 1 from public.wa_identities w
              where w.user_id    = p_user_id
                and w.phone_e164 = p_phone
                and w.status     = 'active'
           )
    returning a.*;
exception
  -- חיוב אחר של המשתמש בתהליך / לא ידוע, או שה-wamid הזה כבר אישר הצעה אחרת → לא תופסים.
  when unique_violation then
    return;
end;
$$;
comment on function public.claim_billing_approval(uuid, uuid, text, text) is
  'תופס הצעה לביצוע: רק pending, רק לפני expires_at, רק של המשתמש ומהמספר שאליו נשלחה — וכשהמספר עדיין המספר הפעיל המקושר לחשבון. מחזיר את השורה (processing) או כלום. אחרי ה-claim האפליקציה מחייבת ב-HYP ומעדכנת succeeded / failed / unknown.';

-- -----------------------------------------------------------------------------
-- raise_plan_limit — שדרוג באמצע החודש: המכסה של החודש הנוכחי עולה מיד
-- -----------------------------------------------------------------------------
create or replace function public.raise_plan_limit(p_user_id uuid, p_new_limit integer)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_tz        text;
  v_remaining integer;
begin
  select u.timezone into v_tz from public.users u where u.id = p_user_id and u.deleted_at is null;
  if not found then
    return null;
  end if;

  update public.usage u
     set free_remaining = u.free_remaining + (p_new_limit - u.plan_limit),
         plan_limit     = p_new_limit
   where u.user_id      = p_user_id
     and u.period_start = date_trunc('month', now() at time zone v_tz)::date
     and u.plan_limit   < p_new_limit
  returning u.free_remaining into v_remaining;

  return v_remaining;
end;
$$;
comment on function public.raise_plan_limit(uuid, integer) is
  'מגדיל את המכסה של החודש הנוכחי (plan_limit והיתרה) למסלול החדש. null = אין שורה לחודש (count_trial_message ייצור אותה במכסה החדשה) או שהמכסה כבר גבוהה.';

-- -----------------------------------------------------------------------------
-- lower_plan_limit — מעבר לבסיסי שנכנס לתוקף: המכסה של החודש הנוכחי יורדת מיד
-- -----------------------------------------------------------------------------
create or replace function public.lower_plan_limit(p_user_id uuid, p_new_limit integer)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_tz        text;
  v_remaining integer;
begin
  select u.timezone into v_tz from public.users u where u.id = p_user_id and u.deleted_at is null;
  if not found then
    return null;
  end if;

  update public.usage u
     set free_remaining = greatest(0, u.free_remaining - (u.plan_limit - p_new_limit)),
         plan_limit     = p_new_limit
   where u.user_id      = p_user_id
     and u.period_start = date_trunc('month', now() at time zone v_tz)::date
     and u.plan_limit   > p_new_limit
  returning u.free_remaining into v_remaining;

  return v_remaining;
end;
$$;
comment on function public.lower_plan_limit(uuid, integer) is
  'מקטין את המכסה של החודש הנוכחי למסלול החדש (מעבר פרו → בסיסי בחיוב החודשי); היתרה יורדת באותו הפרש ולא מתחת ל-0. null = אין שורה לחודש או שהמכסה כבר נמוכה.';

revoke execute on function public.claim_billing_approval(uuid, uuid, text, text) from public, anon, authenticated;
revoke execute on function public.raise_plan_limit(uuid, integer)                from public, anon, authenticated;
revoke execute on function public.lower_plan_limit(uuid, integer)                from public, anon, authenticated;
grant  execute on function public.claim_billing_approval(uuid, uuid, text, text) to service_role;
grant  execute on function public.raise_plan_limit(uuid, integer)                to service_role;
grant  execute on function public.lower_plan_limit(uuid, integer)                to service_role;
