-- =============================================================================
-- 0018_annual_referrals.sql — מסלול שנתי וחבר מביא חבר (סבב 3 בתוכנית)
--
-- מסלול שנתי (lib/billing/plans.ts — מקור אמת יחיד למחירים: בסיסי 990 ₪ לשנה, פרו 2,990 ₪ לשנה, כולל מע"מ):
--   * subscriptions.billing_cycle    — 'monthly' / 'annual'. חיוב שנתי אחד, ו-next_charge_at עוד שנה.
--   * subscriptions.scheduled_cycle  — מעבר משנתי לחודשי שנכנס לתוקף בחידוש (כמו scheduled_plan של 0007).
--   * billing_approvals.billing_cycle — המחזור שההצעה תומחרה בשבילו. מעבר מחודשי לשנתי מהאזור האישי נרשם כ-upgrade
--     (details.change = 'annual') — בלי ערך חדש ב-enum.
--   * payments.billing_cycle         — המחזור שהתשלום שילם עליו.
--   מכסת ההודעות נשארת חודשית (החודש הקלנדרי באזור הזמן של המשתמש) גם בשנתי: count_trial_message (0003) כבר סופר כך,
--   ולכן אף פונקציה של מכסה או תקופה לא משתנה כאן.
--
-- חבר מביא חבר (lib/referrals):
--   * referral_codes — קוד אישי לכל משתמש (קצר, קריא, בלי תווים שמתבלבלים: בלי 0/O, 1/I/L).
--   * referrals      — מי הביא את מי: pending (נרשם דרך הקישור) → rewarded (אחרי התשלום האמיתי הראשון של החבר) או
--                      rejected (הפניה עצמית: אותו מייל, טלפון או כרטיס). כל משתמש מופנה פעם אחת (referred_user_id ייחודי).
--   * referral_reward()       — התגמול פעם אחת בדיוק (נעילת שורה): חודש חינם לכל צד = next_charge_at נדחה ב-30 יום.
--                                בלי מנוי שיכול לקבל את זה עכשיו → זיכוי ממתין. למביא: עד 12 חודשים ב-365 ימים.
--   * referral_apply_credit() — זיכוי ממתין נכנס בתשלום המוצלח הבא.
--   * page_events.event: 'referral_visit' (ביקור דרך /r/<code>).
--   * owner_alerts.type: 'referral' (התראת מידע לבעלים, במייל המרוכז).
--   * admin_user_overview(): גם billing_cycle ו-referred (הפאנל: "הפניה" כמקור, והכנסה חודשית לפי המחזור).
--
-- אין כאן `alter type ... add value`: אפשר להריץ את הקובץ כולו בטרנזקציה אחת. אין בלוק pg_cron.
-- שרת בלבד (service_role) בטבלאות החדשות: RLS פעיל בלי policy, כמו 0008-0017.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- subscriptions: billing_cycle + scheduled_cycle
-- -----------------------------------------------------------------------------
alter table public.subscriptions
  add column if not exists billing_cycle text not null default 'monthly';
alter table public.subscriptions
  add column if not exists scheduled_cycle text;
alter table public.subscriptions
  add constraint subscriptions_billing_cycle_valid check (billing_cycle in ('monthly', 'annual'));
alter table public.subscriptions
  add constraint subscriptions_scheduled_cycle_valid check (scheduled_cycle is null or scheduled_cycle in ('monthly', 'annual'));
comment on column public.subscriptions.billing_cycle is
  'כל כמה זמן מחייבים: monthly (כל חודש) או annual (פעם בשנה, 10 חודשים במחיר של 12). next_charge_at הוא סוף התקופה ששולמה. מכסת ההודעות חודשית בשני המחזורים.';
comment on column public.subscriptions.scheduled_cycle is
  'מחזור שייכנס לתוקף בחידוש הבא (שנתי → חודשי). עד אז billing_cycle נשאר. null = אין שינוי. אין החזר על החלק שנותר מהשנה.';

grant select (scheduled_plan, billing_cycle, scheduled_cycle) on public.subscriptions to authenticated;

-- -----------------------------------------------------------------------------
-- billing_approvals / payments: the cycle
-- -----------------------------------------------------------------------------
alter table public.billing_approvals
  add column if not exists billing_cycle text not null default 'monthly';
alter table public.billing_approvals
  add constraint billing_approvals_billing_cycle_valid check (billing_cycle in ('monthly', 'annual'));
comment on column public.billing_approvals.billing_cycle is
  'המחזור שההצעה תומחרה בשבילו. upgrade עם details.change = ''annual'' = מעבר מחודשי לשנתי מהאזור האישי (התקופה השנתית מתחילה עכשיו, בקיזוז החלק שלא נוצל מהחודש).';

alter table public.payments
  add column if not exists billing_cycle text not null default 'monthly';
alter table public.payments
  add constraint payments_billing_cycle_valid check (billing_cycle in ('monthly', 'annual'));
comment on column public.payments.billing_cycle is 'המחזור שהתשלום שילם עליו (חודש / שנה). שדרוג יחסי ומעבר לשנתי: המחזור של התקופה שאחריהם.';

grant select (billing_cycle) on public.payments to authenticated;

-- -----------------------------------------------------------------------------
-- referral_codes — one per user
-- -----------------------------------------------------------------------------
create table if not exists public.referral_codes (
  user_id    uuid        not null,
  code       text        not null,
  created_at timestamptz not null default now(),
  constraint referral_codes_pkey         primary key (user_id),
  constraint referral_codes_user_id_fkey foreign key (user_id) references public.users (id) on delete cascade,
  constraint referral_codes_code_key     unique (code),
  constraint referral_codes_code_format  check (code ~ '^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6,12}$')
);
comment on table public.referral_codes is
  'הקוד האישי של "חבר מביא חבר" (הקישור /r/<code>). אחד לכל משתמש, ייחודי, בלי תווים שמתבלבלים. נמחק עם החשבון. שרת בלבד.';

alter table public.referral_codes enable row level security;
revoke all on public.referral_codes from public, anon, authenticated;
grant all on public.referral_codes to service_role;

-- -----------------------------------------------------------------------------
-- referrals — who brought whom
-- -----------------------------------------------------------------------------
create table if not exists public.referrals (
  id               uuid        not null default gen_random_uuid(),
  referrer_id      uuid        not null,
  referred_user_id uuid        not null,
  code             text        not null check (length(code) between 1 and 16),
  status           text        not null default 'pending',
  reason           text        check (reason is null or length(reason) <= 200),
  referrer_reward  text,
  referred_reward  text,
  created_at       timestamptz not null default now(),
  rewarded_at      timestamptz,
  payment_id       uuid,
  constraint referrals_pkey                    primary key (id),
  constraint referrals_referrer_id_fkey        foreign key (referrer_id) references public.users (id) on delete cascade,
  constraint referrals_referred_user_id_fkey   foreign key (referred_user_id) references public.users (id) on delete cascade,
  constraint referrals_payment_id_fkey         foreign key (payment_id) references public.payments (id) on delete set null,
  constraint referrals_referred_user_id_key    unique (referred_user_id),
  constraint referrals_not_self                check (referrer_id <> referred_user_id),
  constraint referrals_status_valid            check (status in ('pending', 'rewarded', 'rejected')),
  constraint referrals_referrer_reward_valid   check (referrer_reward is null or referrer_reward in ('applied', 'pending', 'capped')),
  constraint referrals_referred_reward_valid   check (referred_reward is null or referred_reward in ('applied', 'pending')),
  -- a reward exists exactly when the referral was rewarded
  constraint referrals_rewarded_shape          check ((status = 'rewarded') = (rewarded_at is not null and referrer_reward is not null and referred_reward is not null))
);
comment on table public.referrals is
  '"חבר מביא חבר": pending = נרשם דרך הקישור; rewarded = התשלום האמיתי הראשון של החבר עבר, ושני הצדדים קיבלו חודש חינם (או זיכוי ממתין, או — למביא — capped מעל 12 ב-365 ימים); rejected = הפניה עצמית (reason). כל משתמש מופנה פעם אחת. שרת בלבד.';
comment on column public.referrals.referrer_reward is 'החודש של המביא: applied (next_charge_at נדחה ב-30 יום), pending (אין עדיין מנוי שיכול לקבל — ייכנס בתשלום הבא), capped (מעל המכסה השנתית).';
comment on column public.referrals.referred_reward is 'החודש של החבר: applied או pending.';
comment on column public.referrals.payment_id is 'התשלום המוצלח הראשון של החבר, שבעקבותיו ניתן התגמול.';

create index if not exists referrals_referrer_idx on public.referrals (referrer_id, created_at desc);
create index if not exists referrals_created_idx  on public.referrals (created_at desc);

alter table public.referrals enable row level security;
revoke all on public.referrals from public, anon, authenticated;
grant all on public.referrals to service_role;

-- -----------------------------------------------------------------------------
-- referral_push — the free days onto next_charge_at, when the subscription can take them now: a paid plan whose period
-- has not ended, active without a failed renewal (or cancelled and still running — the access is extended), and no
-- charge of the user open (a charge in flight writes next_charge_at itself: the days wait as a pending credit).
-- Internal: called by referral_reward / referral_apply_credit only.
-- -----------------------------------------------------------------------------
create or replace function public.referral_push(p_user uuid, p_days integer)
returns boolean
language plpgsql
set search_path = ''
as $$
declare
  v_n integer;
begin
  if p_days is null or p_days < 1 or p_days > 3660 then
    raise exception 'referral_push: bad days %', p_days using errcode = '22023';
  end if;
  update public.subscriptions s
     set next_charge_at = s.next_charge_at + make_interval(days => p_days)
   where s.user_id = p_user
     and s.plan in ('basic', 'pro')
     and s.next_charge_at > now()
     and ((s.status = 'active' and s.cancelled_at is null and s.charge_failures = 0) or s.status = 'cancelled')
     and not exists (
           select 1 from public.billing_approvals a
            where a.user_id = p_user
              and a.status in ('processing', 'unknown')
              and a.kind in ('upgrade', 'retry', 'renew', 'renewal')
         );
  get diagnostics v_n = row_count;
  return v_n > 0;
end;
$$;
comment on function public.referral_push(uuid, integer) is
  'דוחה את next_charge_at ב-p_days כשהמנוי יכול לקבל את זה עכשיו (פעיל בלי חיוב שנכשל, או מבוטל שעוד בתוקף; בלי חיוב פתוח). true = נדחה. פנימי.';

-- -----------------------------------------------------------------------------
-- referral_reward — exactly once per referral (the referral row is locked; pending → rewarded). The referrer's row in
-- users is locked too, so two friends paying at the same moment count against the yearly cap one after the other.
-- -----------------------------------------------------------------------------
create or replace function public.referral_reward(p_referred uuid, p_payment uuid, p_days integer, p_cap integer)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_ref      public.referrals;
  v_count    integer;
  v_referrer text;
  v_referred text;
begin
  select * into v_ref from public.referrals r where r.referred_user_id = p_referred for update;
  if not found or v_ref.status <> 'pending' then
    return jsonb_build_object('result', 'none', 'referral', case when v_ref.id is null then null else to_jsonb(v_ref) end);
  end if;

  perform 1 from public.users u where u.id = v_ref.referrer_id for update;
  select count(*)::integer into v_count
    from public.referrals r
   where r.referrer_id = v_ref.referrer_id
     and r.id <> v_ref.id
     and r.status = 'rewarded'
     and r.referrer_reward in ('applied', 'pending')
     and r.rewarded_at > now() - interval '365 days';

  v_referrer := case
    when v_count >= coalesce(p_cap, 12) then 'capped'
    when public.referral_push(v_ref.referrer_id, p_days) then 'applied'
    else 'pending'
  end;
  v_referred := case when public.referral_push(p_referred, p_days) then 'applied' else 'pending' end;

  update public.referrals r
     set status = 'rewarded', rewarded_at = now(), payment_id = p_payment, referrer_reward = v_referrer, referred_reward = v_referred
   where r.id = v_ref.id
  returning * into v_ref;

  return jsonb_build_object(
    'result', 'rewarded',
    'referral', to_jsonb(v_ref),
    'referrer_next', case when v_referrer = 'applied' then (select s.next_charge_at from public.subscriptions s where s.user_id = v_ref.referrer_id) end,
    'referred_next', case when v_referred = 'applied' then (select s.next_charge_at from public.subscriptions s where s.user_id = p_referred) end
  );
end;
$$;
comment on function public.referral_reward(uuid, uuid, integer, integer) is
  'התגמול של הפניה, פעם אחת בדיוק (נעילת שורה): pending → rewarded, וחודש חינם לכל צד (referral_push) או זיכוי ממתין; למביא capped מעל p_cap ב-365 ימים. מחזיר jsonb: result (rewarded / none), referral, referrer_next, referred_next.';

-- -----------------------------------------------------------------------------
-- referral_apply_credit — the user's pending free months (either side), once the subscription can take them
-- -----------------------------------------------------------------------------
create or replace function public.referral_apply_credit(p_user uuid, p_days integer)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_n    integer;
  v_next timestamptz;
begin
  -- one at a time per user: the subscription row
  perform 1 from public.subscriptions s where s.user_id = p_user for update;
  select count(*)::integer into v_n
    from public.referrals r
   where r.status = 'rewarded'
     and ((r.referrer_id = p_user and r.referrer_reward = 'pending') or (r.referred_user_id = p_user and r.referred_reward = 'pending'));
  if v_n > 0 and public.referral_push(p_user, p_days * v_n) then
    update public.referrals r set referrer_reward = 'applied' where r.status = 'rewarded' and r.referrer_id = p_user and r.referrer_reward = 'pending';
    update public.referrals r set referred_reward = 'applied' where r.status = 'rewarded' and r.referred_user_id = p_user and r.referred_reward = 'pending';
  else
    v_n := 0;
  end if;
  select s.next_charge_at into v_next from public.subscriptions s where s.user_id = p_user;
  return jsonb_build_object('applied', v_n, 'next_charge_at', v_next);
end;
$$;
comment on function public.referral_apply_credit(uuid, integer) is
  'מכניס את החודשים החינמיים הממתינים של המשתמש (כמביא או כחבר) למנוי, כשהוא יכול לקבל אותם. מחזיר jsonb: applied, next_charge_at.';

revoke execute on function public.referral_push(uuid, integer)                   from public, anon, authenticated;
revoke execute on function public.referral_reward(uuid, uuid, integer, integer)  from public, anon, authenticated;
revoke execute on function public.referral_apply_credit(uuid, integer)           from public, anon, authenticated;
grant  execute on function public.referral_push(uuid, integer)                   to service_role;
grant  execute on function public.referral_reward(uuid, uuid, integer, integer)  to service_role;
grant  execute on function public.referral_apply_credit(uuid, integer)           to service_role;

-- -----------------------------------------------------------------------------
-- page_events.event: + referral_visit (not a funnel step)
-- -----------------------------------------------------------------------------
alter table public.page_events drop constraint if exists page_events_event_check;
alter table public.page_events add constraint page_events_event_check
  check (event is null or event in ('signup_start', 'code_sent', 'code_ok', 'wa_linked', 'mail_connected', 'paid', 'referral_visit'));
comment on column public.page_events.event is
  'שלב במשפך: signup_start, code_sent, code_ok (בדפדפן), wa_linked, mail_connected, paid (בשרת); referral_visit = ביקור דרך קישור של חבר (/r/<code>, לא שלב במשפך). ריק = צפייה בדף.';

-- -----------------------------------------------------------------------------
-- owner_alerts.type: + referral (an information alert: the morning digest in quiet hours)
-- -----------------------------------------------------------------------------
alter table public.owner_alerts drop constraint if exists owner_alerts_type_check;
alter table public.owner_alerts add constraint owner_alerts_type_check
  check (type in ('signup', 'ticket', 'system_request', 'payment_failed', 'charge_unknown', 'error_spike', 'ai_budget', 'connection_expired_paid', 'referral', 'test'));

-- -----------------------------------------------------------------------------
-- admin_user_overview: + billing_cycle, referred (a new result column needs drop + create)
-- -----------------------------------------------------------------------------
drop function if exists public.admin_user_overview();
create function public.admin_user_overview()
returns table (
  id                 uuid,
  email              text,
  name               text,
  business_name      text,
  created_at         timestamptz,
  last_seen_at       timestamptz,
  signup_source      jsonb,
  onboarding_step    text,
  plan               text,
  sub_status         text,
  charge_failures    integer,
  phone              text,
  wa_linked          boolean,
  connections_active integer,
  connections_broken integer,
  connections_ever   integer,
  providers          text[],
  usage_used         integer,
  usage_limit        integer,
  messages_30d       integer,
  ai_cost_30d        numeric,
  errors_7d          integer,
  failed_jobs_7d     integer,
  paid               boolean,
  open_tickets       integer,
  billing_cycle      text,
  referred           boolean
)
language sql
stable
set search_path = ''
as $$
  select u.id,
         u.email,
         u.name,
         u.business_name,
         u.created_at,
         u.last_seen_at,
         u.signup_source,
         u.profile -> 'onboarding' ->> 'step',
         public.user_plan(u.id)::text,
         s.status::text,
         coalesce(s.charge_failures, 0),
         (select w.phone_e164 from public.wa_identities w where w.user_id = u.id and w.status = 'active' order by w.linked_at desc limit 1),
         exists (select 1 from public.wa_identities w where w.user_id = u.id),
         (select count(*)::integer from public.connections c where c.user_id = u.id and c.status = 'active'),
         (select count(*)::integer from public.connections c where c.user_id = u.id and c.status in ('expired', 'error')),
         (select count(*)::integer from public.connections c where c.user_id = u.id),
         (select coalesce(array_agg(distinct c.provider::text), '{}') from public.connections c where c.user_id = u.id and c.status = 'active'),
         us.counted_messages,
         us.plan_limit,
         (select count(*)::integer from public.messages m where m.user_id = u.id and m.direction = 'in' and m.created_at >= now() - interval '30 days'),
         (select coalesce(sum(m.cost_usd), 0) from public.messages m where m.user_id = u.id and m.created_at >= now() - interval '30 days'),
         (select count(*)::integer from public.app_errors e where e.user_id = u.id and e.at >= now() - interval '7 days'),
         (select count(*)::integer from public.jobs j where j.user_id = u.id and j.status = 'failed' and j.updated_at >= now() - interval '7 days'),
         exists (select 1 from public.payments p where p.user_id = u.id and p.ccode = '0'),
         (select count(*)::integer from public.support_tickets t where t.user_id = u.id and t.status <> 'closed'),
         s.billing_cycle,
         exists (select 1 from public.referrals r where r.referred_user_id = u.id)
    from public.users u
    left join public.subscriptions s on s.user_id = u.id
    left join lateral (
      select x.counted_messages, x.plan_limit from public.usage x where x.user_id = u.id order by x.period_start desc limit 1
    ) us on true
   where u.deleted_at is null
   order by u.created_at desc
   limit 5000;
$$;
comment on function public.admin_user_overview() is
  'פאנל הניהול: שורה לכל משתמש פעיל (עד 5000) — תוכנית, סטטוס מנוי ומחזור החיוב, מספר וואטסאפ, חיבורים פעילים ופגומים, שימוש בתקופה, הודעות ועלות AI ב-30 יום, תקלות ועבודות שנכשלו ב-7 ימים, תשלום מוצלח, פניות פתוחות, והאם הגיע דרך הפניה. service_role בלבד.';

revoke execute on function public.admin_user_overview() from public, anon, authenticated;
grant  execute on function public.admin_user_overview() to service_role;
