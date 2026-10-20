-- =============================================================================
-- 0003_functions.sql — פונקציות SQL שהאפליקציה/pg_cron קוראים להן
--
-- כל הפונקציות כאן הן לשרת בלבד (service_role / pg_cron כ-postgres):
--   REVOKE EXECUTE FROM public, anon, authenticated; GRANT EXECUTE TO service_role.
-- search_path = '' + שמות מלאים (public.*) — לפי ה-lint של Supabase (function_search_path_mutable).
--
-- רשימה:
--   plan_message_limit(plan)              מכסת הודעות לתקופה (10 / 750 / 3000)
--   user_plan(user_id)                    המסלול האפקטיבי (trial אם אין מנוי פעיל)
--   count_trial_message(user_id)          סופר הודעה אטומית; מחזיר כמה נשאר, או -1 אם נגמר (ולא סופר)
--   claim_due_jobs(limit)                 תופס משימות שהגיע זמנן (FOR UPDATE SKIP LOCKED → running)
--   finish_job(job_id, error, retry_at)   done / queued עם backoff / failed
--   requeue_stale_jobs(older_than)        משימות שנתקעו ב-running חוזרות לתור
--   expire_pending_actions()              pending שעבר expires_at → expired
--   purge_old_messages(days, plans[])     מחיקת messages + אנונימיזציה של audit_log מעבר ל-N ימים
--   purge_old_audit_log(days)             מחיקה פיזית של audit_log מעבר ל-N ימים (ברירת מחדל 730)
--   purge_expired_tokens()                ניקוי auth_otps / link_tokens / wa_link_attempts ישנים
--   dispatch_due_jobs(limit)              pg_cron: claim → POST ל-QStash (pg_net) → Vercel worker
--   + בלוק pg_cron בסוף הקובץ.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- plan_message_limit
-- -----------------------------------------------------------------------------
create or replace function public.plan_message_limit(p_plan public.plan_kind)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case p_plan
    when 'trial' then 10
    when 'basic' then 750
    when 'pro'   then 3000
  end;
$$;
comment on function public.plan_message_limit(public.plan_kind) is
  'מכסת הודעות לתקופה לפי מסלול (PLAN §3/§4): ניסיון 10 סה"כ, בסיסי 750/חודש, פרו 3000/חודש (fair use).';

-- -----------------------------------------------------------------------------
-- user_plan — המסלול האפקטיבי של משתמש
-- -----------------------------------------------------------------------------
create or replace function public.user_plan(p_user_id uuid)
returns public.plan_kind
language sql
stable
set search_path = ''
as $$
  select coalesce(
    (select case
              when s.status in ('active', 'past_due') then s.plan
              when s.status = 'cancelled' and s.next_charge_at > now() then s.plan   -- פעיל עד סוף התקופה
              else 'trial'::public.plan_kind
            end
       from public.subscriptions s
      where s.user_id = p_user_id),
    'trial'::public.plan_kind);
$$;
comment on function public.user_plan(uuid) is
  'המסלול בפועל: basic/pro כשהמנוי active/past_due, או cancelled שעדיין בתוך התקופה ששולמה; אחרת trial.';

-- -----------------------------------------------------------------------------
-- count_trial_message — ספירה אטומית של הודעה נכנסת
-- -----------------------------------------------------------------------------
create or replace function public.count_trial_message(p_user_id uuid)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_tz        text;
  v_created   timestamptz;
  v_plan      public.plan_kind;
  v_limit     integer;
  v_period    date;
  v_remaining integer;
begin
  select u.timezone, u.created_at
    into v_tz, v_created
    from public.users u
   where u.id = p_user_id
     and u.deleted_at is null;

  if not found then
    raise exception 'count_trial_message: user % not found or deleted', p_user_id
      using errcode = 'P0002';
  end if;

  v_plan  := public.user_plan(p_user_id);
  v_limit := public.plan_message_limit(v_plan);

  -- ניסיון: תקופה אחת שמתחילה ביום ההרשמה (10 הודעות סה"כ).
  -- מנוי: חודש קלנדרי לפי אזור הזמן של המשתמש.
  v_period := case
    when v_plan = 'trial' then (v_created at time zone v_tz)::date
    else date_trunc('month', now() at time zone v_tz)::date
  end;

  insert into public.usage as u (user_id, period_start, counted_messages, free_remaining, plan_limit)
  values (p_user_id, v_period, 1, greatest(v_limit - 1, 0), v_limit)
  on conflict (user_id, period_start) do update
     set counted_messages = u.counted_messages + 1,
         free_remaining   = u.free_remaining - 1
   where u.free_remaining > 0
  returning u.free_remaining into v_remaining;

  -- ON CONFLICT ... WHERE נכשל → המכסה נגמרה. לא סופרים, מחזירים -1.
  if not found then
    return -1;
  end if;

  return v_remaining;
end;
$$;
comment on function public.count_trial_message(uuid) is
  'סופר הודעה נכנסת אחת (אטומי, upsert על usage) ומחזיר כמה נשארו בתקופה אחרי הספירה. -1 = המכסה כבר נגמרה וההודעה לא נספרה (→ קישור תשלום / עצירה מנומסת). 3 = זמן להתראה העדינה. השרת מחליט מה נספר (PLAN §3).';

-- -----------------------------------------------------------------------------
-- claim_due_jobs — תפיסת משימות שהגיע זמנן
-- -----------------------------------------------------------------------------
create or replace function public.claim_due_jobs(p_limit integer default 50)
returns setof public.jobs
language sql
volatile
set search_path = ''
as $$
  with due as (
    select j.id
      from public.jobs j
     where j.status = 'queued'
       and j.run_at <= now()
     order by j.run_at
     limit greatest(p_limit, 1)
     for update skip locked
  )
  update public.jobs j
     set status    = 'running',
         locked_at = now(),
         attempts  = j.attempts + 1
    from due
   where j.id = due.id
  returning j.*;
$$;
comment on function public.claim_due_jobs(integer) is
  'תופס עד N משימות queued עם run_at <= now() (FOR UPDATE SKIP LOCKED — בטוח למספר workers במקביל), מסמן running, מעלה attempts ומחזיר אותן. ה-worker חייב לקרוא finish_job() בסוף.';

-- -----------------------------------------------------------------------------
-- finish_job — סיום משימה: הצלחה / ניסיון חוזר עם backoff / כישלון סופי
-- -----------------------------------------------------------------------------
create or replace function public.finish_job(
  p_job_id   uuid,
  p_error    text        default null,
  p_retry_at timestamptz default null
)
returns public.jobs
language plpgsql
set search_path = ''
as $$
declare
  v_job public.jobs;
begin
  select * into v_job from public.jobs where id = p_job_id for update;
  if not found then
    raise exception 'finish_job: job % not found', p_job_id using errcode = 'P0002';
  end if;

  if p_error is null then
    update public.jobs
       set status = 'done', last_error = null, locked_at = null
     where id = p_job_id
    returning * into v_job;

  elsif v_job.attempts < v_job.max_attempts then
    -- backoff: 5, 10, 20 דקות... (אלא אם ה-worker נתן זמן מפורש, למשל חיוב HYP ביום 3/5)
    update public.jobs
       set status     = 'queued',
           last_error = p_error,
           locked_at  = null,
           run_at     = coalesce(p_retry_at,
                                 now() + make_interval(mins => (5 * power(2, greatest(v_job.attempts - 1, 0)))::integer))
     where id = p_job_id
    returning * into v_job;

  else
    update public.jobs
       set status = 'failed', last_error = p_error, locked_at = null
     where id = p_job_id
    returning * into v_job;
  end if;

  return v_job;
end;
$$;
comment on function public.finish_job(uuid, text, timestamptz) is
  'p_error ריק → done. אחרת: אם attempts < max_attempts → חוזר ל-queued ב-p_retry_at (או backoff אקספוננציאלי 5/10/20 דק''); אחרת failed.';

-- -----------------------------------------------------------------------------
-- requeue_stale_jobs — משימות שה-worker לא סיים (Vercel מוגבל ל-800 שנ')
-- -----------------------------------------------------------------------------
create or replace function public.requeue_stale_jobs(p_older_than interval default interval '15 minutes')
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_requeued integer;
begin
  -- מוצו הניסיונות → failed
  update public.jobs
     set status = 'failed', locked_at = null,
         last_error = coalesce(last_error, 'stale: worker did not finish')
   where status = 'running'
     and locked_at < now() - p_older_than
     and attempts >= max_attempts;

  -- אחרת → חזרה לתור
  update public.jobs
     set status = 'queued', locked_at = null,
         last_error = 'stale: worker did not finish (requeued)'
   where status = 'running'
     and locked_at < now() - p_older_than
     and attempts < max_attempts;
  get diagnostics v_requeued = row_count;

  return v_requeued;
end;
$$;
comment on function public.requeue_stale_jobs(interval) is
  'משימות שנשארו running יותר מ-p_older_than (worker קרס / timeout) חוזרות ל-queued, או failed אם מוצו הניסיונות. מחזיר כמה הוחזרו לתור.';

-- -----------------------------------------------------------------------------
-- expire_pending_actions — פג תוקף האישור (10 דק')
-- -----------------------------------------------------------------------------
create or replace function public.expire_pending_actions()
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_n integer;
begin
  update public.pending_actions
     set status = 'expired'
   where status = 'pending'
     and expires_at <= now();
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;
comment on function public.expire_pending_actions() is
  'pending שעבר expires_at → expired. רץ כל דקה ב-pg_cron. הכפתור "שלח" על פעולה expired נדחה בשרת.';

-- -----------------------------------------------------------------------------
-- purge_old_messages — מדיניות שמירה (90 יום בסיסי/ניסיון, 365 פרו)
-- -----------------------------------------------------------------------------
create or replace function public.purge_old_messages(
  p_days  integer            default 90,
  p_plans public.plan_kind[] default null
)
returns table (messages_deleted bigint, audit_rows_anonymized bigint)
language plpgsql
set search_path = ''
as $$
declare
  v_cutoff timestamptz := now() - make_interval(days => greatest(p_days, 1));
begin
  return query
  with target as (
    select u.id
      from public.users u
     where p_plans is null
        or public.user_plan(u.id) = any (p_plans)
  ),
  del as (
    delete from public.messages m
     using target t
     where m.user_id = t.id
       and m.created_at < v_cutoff
    returning m.id
  ),
  anon as (
    update public.audit_log a
       set target = null,
           reason = null,
           approved_by_msg_id = null,
           anonymized_at = now()
      from target t
     where a.user_id = t.id
       and a.created_at < v_cutoff
       and a.anonymized_at is null
    returning a.id
  )
  select (select count(*) from del), (select count(*) from anon);
end;
$$;
comment on function public.purge_old_messages(integer, public.plan_kind[]) is
  'מוחק messages (כולל תמלולים/קישורי מדיה) ומאנמם audit_log (target/reason/approved_by_msg_id → null) שנוצרו לפני p_days ימים, למשתמשים במסלולים p_plans (null = כולם). conversation_state.last_summarized_msg_id מתאפס אוטומטית (FK SET NULL). קבצים ב-Storage נמחקים ע''י השרת לפי media_url לפני הקריאה.';

-- -----------------------------------------------------------------------------
-- purge_old_audit_log — מחיקה פיזית אחרי 24 חודש (§8 סיכון 7: לוגים 24 חודש)
-- -----------------------------------------------------------------------------
create or replace function public.purge_old_audit_log(p_days integer default 730)
returns bigint
language plpgsql
set search_path = ''
as $$
declare
  v_n bigint;
begin
  delete from public.audit_log
   where created_at < now() - make_interval(days => greatest(p_days, 1));
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;
comment on function public.purge_old_audit_log(integer) is
  'מחיקה פיזית של רשומות audit_log ישנות מ-p_days (ברירת מחדל 730 = 24 חודש). עד אז הרשומות מאונממות (purge_old_messages).';

-- -----------------------------------------------------------------------------
-- purge_expired_tokens — ניקוי OTP / טוקני קישור / מוני ניסיונות
-- -----------------------------------------------------------------------------
create or replace function public.purge_expired_tokens()
returns table (otps_deleted bigint, link_tokens_deleted bigint, link_attempts_deleted bigint)
language plpgsql
set search_path = ''
as $$
begin
  return query
  with o as (
    delete from public.auth_otps
     where expires_at < now() - interval '1 day'
        or used_at    < now() - interval '1 day'
    returning id
  ),
  l as (
    delete from public.link_tokens
     where expires_at < now() - interval '7 days'
        or used_at    < now() - interval '7 days'
    returning id
  ),
  a as (
    delete from public.wa_link_attempts
     where last_attempt_at < now() - interval '30 days'
       and (blocked_until is null or blocked_until < now())
    returning phone_e164
  )
  select (select count(*) from o), (select count(*) from l), (select count(*) from a);
end;
$$;
comment on function public.purge_expired_tokens() is
  'ניקוי יומי: OTP שפג/נוצל לפני יותר מיום, טוקני קישור ישנים משבוע, מוני ניסיונות של מספרים לא מקושרים אחרי 30 יום שקט.';

-- -----------------------------------------------------------------------------
-- dispatch_due_jobs — pg_cron (כל דקה): claim_due_jobs → QStash → Vercel
--
-- דורש: pg_net (HTTP אסינכרוני) + Supabase Vault עם שני סודות:
--   select vault.create_secret('https://<app>.vercel.app/api/jobs/run', 'jobs_worker_url');
--   select vault.create_secret('<QSTASH_TOKEN>',                         'qstash_token');
-- הקריאה: POST https://qstash.upstash.io/v2/publish/<jobs_worker_url>
--   headers: Authorization Bearer, Upstash-Deduplication-Id = <job_id>:<attempts>
--   body:    {job_id, kind, user_id, attempts, run_at, payload}
-- ה-worker מאמת Upstash-Signature, מבצע, וקורא finish_job(job_id, error?).
-- אם pg_net/Vault חסרים או שאין סודות — לא תופסים משימות (כדי לא לאבד אותן) ומזהירים.
-- מסלול חלופי בלי pg_net: cron → net.http_post ל-/api/jobs/tick עם סוד; ה-tick קורא claim_due_jobs דרך service_role.
-- -----------------------------------------------------------------------------
create or replace function public.dispatch_due_jobs(p_limit integer default 50)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url   text;
  v_token text;
  v_job   public.jobs;
  v_n     integer := 0;
begin
  if not exists (select 1 from pg_catalog.pg_extension where extname = 'pg_net') then
    raise warning 'dispatch_due_jobs: pg_net not installed — nothing dispatched';
    return 0;
  end if;
  if not exists (select 1 from pg_catalog.pg_extension where extname = 'supabase_vault') then
    raise warning 'dispatch_due_jobs: supabase_vault not installed — nothing dispatched';
    return 0;
  end if;

  -- EXECUTE דינמי כדי שהפונקציה תיווצר גם בסביבה בלי vault/net (בדיקות מקומיות).
  execute $q$
    select (select decrypted_secret from vault.decrypted_secrets where name = 'jobs_worker_url' limit 1),
           (select decrypted_secret from vault.decrypted_secrets where name = 'qstash_token'    limit 1)
  $q$ into v_url, v_token;

  if v_url is null or v_token is null then
    raise warning 'dispatch_due_jobs: vault secrets jobs_worker_url / qstash_token missing — nothing dispatched';
    return 0;
  end if;

  for v_job in select * from public.claim_due_jobs(p_limit) loop
    execute $q$ select net.http_post(url := $1, body := $2, headers := $3, timeout_milliseconds := 8000) $q$
      using 'https://qstash.upstash.io/v2/publish/' || v_url,
            jsonb_build_object(
              'job_id',   v_job.id,
              'kind',     v_job.kind,
              'user_id',  v_job.user_id,
              'attempts', v_job.attempts,
              'run_at',   v_job.run_at,
              'payload',  v_job.payload),
            jsonb_build_object(
              'Authorization',            'Bearer ' || v_token,
              'Content-Type',             'application/json',
              'Upstash-Deduplication-Id', v_job.id::text || ':' || v_job.attempts::text,
              'Upstash-Retries',          '2');
    v_n := v_n + 1;
  end loop;

  return v_n;
end;
$$;
comment on function public.dispatch_due_jobs(integer) is
  'רץ מ-pg_cron כל דקה: תופס משימות שהגיע זמנן ושולח כל אחת ל-QStash (pg_net) שמעביר ל-Vercel worker. מחזיר כמה נשלחו. SECURITY DEFINER כדי לקרוא Vault; EXECUTE רק ל-service_role/postgres.';

-- -----------------------------------------------------------------------------
-- הרשאות: שרת בלבד
-- -----------------------------------------------------------------------------
revoke execute on function public.plan_message_limit(public.plan_kind)              from public, anon, authenticated;
revoke execute on function public.user_plan(uuid)                                   from public, anon, authenticated;
revoke execute on function public.count_trial_message(uuid)                         from public, anon, authenticated;
revoke execute on function public.claim_due_jobs(integer)                           from public, anon, authenticated;
revoke execute on function public.finish_job(uuid, text, timestamptz)               from public, anon, authenticated;
revoke execute on function public.requeue_stale_jobs(interval)                      from public, anon, authenticated;
revoke execute on function public.expire_pending_actions()                          from public, anon, authenticated;
revoke execute on function public.purge_old_messages(integer, public.plan_kind[])   from public, anon, authenticated;
revoke execute on function public.purge_old_audit_log(integer)                      from public, anon, authenticated;
revoke execute on function public.purge_expired_tokens()                            from public, anon, authenticated;
revoke execute on function public.dispatch_due_jobs(integer)                        from public, anon, authenticated;

grant execute on function public.plan_message_limit(public.plan_kind)              to service_role;
grant execute on function public.user_plan(uuid)                                   to service_role;
grant execute on function public.count_trial_message(uuid)                         to service_role;
grant execute on function public.claim_due_jobs(integer)                           to service_role;
grant execute on function public.finish_job(uuid, text, timestamptz)               to service_role;
grant execute on function public.requeue_stale_jobs(interval)                      to service_role;
grant execute on function public.expire_pending_actions()                          to service_role;
grant execute on function public.purge_old_messages(integer, public.plan_kind[])   to service_role;
grant execute on function public.purge_old_audit_log(integer)                      to service_role;
grant execute on function public.purge_expired_tokens()                            to service_role;
grant execute on function public.dispatch_due_jobs(integer)                        to service_role;

-- פונקציות עתידיות ב-public לא יהיו ניתנות להרצה ע"י לקוחות אלא אם נעניק במפורש.
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;

-- =============================================================================
-- pg_cron — תזמון
--
-- הפעלה ב-Supabase (Pro, Frankfurt): Dashboard → Database → Extensions → הפעל pg_cron ו-pg_net,
-- או ב-SQL (כ-postgres):   create extension if not exists pg_cron;   create extension if not exists pg_net;
-- הבלוק למטה מנסה להפעיל בעצמו ומתזמן רק אם pg_cron קיים — אחרת מדפיס NOTICE ולא נכשל
-- (כך המיגרציה עוברת גם ב-Postgres מקומי בלי ההרחבות; מריצים אותה שוב / מריצים את ה-DO ידנית אחרי ההפעלה).
-- cron.schedule עם שם = upsert, לכן בטוח להריץ שוב.
-- לצפייה:  select * from cron.job;   select * from cron.job_run_details order by start_time desc limit 20;
-- =============================================================================
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    begin
      execute 'create extension if not exists pg_cron';
    exception when others then
      raise notice 'pg_cron available but could not be created (%): enable it from the Supabase dashboard', sqlerrm;
    end;
  else
    raise notice 'pg_cron is not available on this server — scheduling skipped';
  end if;

  if exists (select 1 from pg_available_extensions where name = 'pg_net') then
    begin
      execute 'create extension if not exists pg_net';
    exception when others then
      raise notice 'pg_net available but could not be created (%): enable it from the Supabase dashboard', sqlerrm;
    end;
  else
    raise notice 'pg_net is not available on this server — dispatch_due_jobs will no-op';
  end if;
end;
$$;

do $$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise notice 'pg_cron not installed — cron jobs not scheduled';
    return;
  end if;

  -- כל דקה: משימות שהגיע זמנן → QStash → Vercel
  execute format('select cron.schedule(%L, %L, %L)',
    'wabot_dispatch_due_jobs', '* * * * *', 'select public.dispatch_due_jobs(50)');

  -- כל דקה: פעולות ממתינות שפג תוקפן
  execute format('select cron.schedule(%L, %L, %L)',
    'wabot_expire_pending_actions', '* * * * *', 'select public.expire_pending_actions()');

  -- כל 5 דקות: משימות שנתקעו ב-running
  execute format('select cron.schedule(%L, %L, %L)',
    'wabot_requeue_stale_jobs', '*/5 * * * *', 'select public.requeue_stale_jobs(interval ''15 minutes'')');

  -- יומי 03:10 UTC: שמירת היסטוריה — 90 יום לניסיון/בסיסי, 365 לפרו
  execute format('select cron.schedule(%L, %L, %L)',
    'wabot_purge_messages_90', '10 3 * * *', 'select public.purge_old_messages(90, array[''trial'',''basic'']::public.plan_kind[])');
  execute format('select cron.schedule(%L, %L, %L)',
    'wabot_purge_messages_365', '15 3 * * *', 'select public.purge_old_messages(365, array[''pro'']::public.plan_kind[])');

  -- יומי 03:20 UTC: audit_log מעבר ל-24 חודש
  execute format('select cron.schedule(%L, %L, %L)',
    'wabot_purge_audit_log', '20 3 * * *', 'select public.purge_old_audit_log(730)');

  -- יומי 03:25 UTC: OTP / טוקני קישור / מוני ניסיונות
  execute format('select cron.schedule(%L, %L, %L)',
    'wabot_purge_expired_tokens', '25 3 * * *', 'select public.purge_expired_tokens()');

  -- יומי 03:30 UTC: היסטוריית ריצות של pg_cron עצמו (אחרת הטבלה תופחת)
  execute format('select cron.schedule(%L, %L, %L)',
    'wabot_cron_history_cleanup', '30 3 * * *', 'delete from cron.job_run_details where end_time < now() - interval ''7 days''');
end;
$$;
