-- =============================================================================
-- 0019_tick_scheduler.sql — המתזמן בייצור: Supabase קורא כל דקה ל-GET /api/jobs/tick
--
-- רקע: dispatch_due_jobs (0003) צריך את סודות ה-Vault jobs_worker_url / qstash_token, שלא הוגדרו - ולכן בייצור
-- תזכורות, סיכומי בוקר, סריקות יזומות ומייל הבוקר לבעלים לא נשלחו. Vercel Cron כל דקה דורש Pro, וב-Hobby פריסה
-- עם Cron תדיר יותר מפעם ביום נכשלת. לכן הקצב מגיע מכאן: pg_cron + pg_net (בחינם, בלי קשר לתוכנית של Vercel).
--   * tick_dispatch() — שולח GET אל tick_url עם Authorization: Bearer <cron_secret> (אותו CRON_SECRET שב-Vercel;
--     app/api/jobs/tick/route.ts GET). ה-tick עצמו לוקח את המשימות (claim_due_jobs) ומפעיל את /api/jobs/run.
-- לפני ההפעלה, ב-Supabase (SQL editor, פעם אחת; הערכים לא נשמרים בריפו):
--   select vault.create_secret('https://<project>.vercel.app/api/jobs/tick', 'tick_url');
--   select vault.create_secret('<CRON_SECRET>', 'cron_secret');
-- בלי pg_net / vault / הסודות הפונקציה מתריעה (warning) ולא עושה כלום. שרת בלבד (service_role).
-- בלוק pg_cron נפרד בסוף הקובץ (כמו ב-0013 עד 0017): הוא מוחל אחרי שהסודות הוגדרו.
-- =============================================================================

create or replace function public.tick_dispatch()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url    text;
  v_secret text;
begin
  if not exists (select 1 from pg_catalog.pg_extension where extname = 'pg_net') then
    raise warning 'tick_dispatch: pg_net not installed — no tick';
    return false;
  end if;
  if not exists (select 1 from pg_catalog.pg_extension where extname = 'supabase_vault') then
    raise warning 'tick_dispatch: supabase_vault not installed — no tick';
    return false;
  end if;

  -- EXECUTE דינמי כדי שהפונקציה תיווצר גם בסביבה בלי vault/net (בדיקות מקומיות).
  execute $q$
    select (select decrypted_secret from vault.decrypted_secrets where name = 'tick_url'    limit 1),
           (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret' limit 1)
  $q$ into v_url, v_secret;

  if v_url is null or v_secret is null then
    raise warning 'tick_dispatch: vault secrets tick_url / cron_secret missing — no tick';
    return false;
  end if;

  execute $q$ select net.http_get(url := $1, headers := $2, timeout_milliseconds := 8000) $q$
    using v_url, jsonb_build_object('Authorization', 'Bearer ' || v_secret);
  return true;
end;
$$;
comment on function public.tick_dispatch() is
  'קריאה אחת ל-GET /api/jobs/tick (Vault: tick_url, cron_secret) דרך pg_net. pg_cron מריץ אותה כל דקה. true = נשלחה.';

revoke execute on function public.tick_dispatch() from public, anon, authenticated;
grant  execute on function public.tick_dispatch() to service_role;

-- -----------------------------------------------------------------------------
-- pg_cron (אם מותקן): tick כל דקה, במקום wabot_dispatch_due_jobs (שבלי סודות QStash לא שלח כלום).
-- בלוק נפרד — מוחל אחרי שהסודות tick_url / cron_secret הוגדרו ב-Vault.
-- -----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise notice 'pg_cron not installed — tick not scheduled';
    return;
  end if;
  if exists (select 1 from cron.job where jobname = 'wabot_dispatch_due_jobs') then
    perform cron.unschedule('wabot_dispatch_due_jobs');
  end if;
  execute format('select cron.schedule(%L, %L, %L)', 'wabot_tick', '* * * * *', 'select public.tick_dispatch()');
end;
$$;
