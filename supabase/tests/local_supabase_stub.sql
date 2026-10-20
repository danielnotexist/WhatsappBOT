-- =============================================================================
-- local_supabase_stub.sql — רק ל-Postgres רגיל (בלי Supabase CLI / Docker).
--
-- מדמה את המינימום של סביבת Supabase כדי שהמיגרציות והבדיקות ירוצו מקומית:
--   * התפקידים anon / authenticated / service_role (service_role עם BYPASSRLS כמו ב-Supabase)
--   * סכמת auth עם auth.uid() / auth.role() / auth.jwt() שקוראים את request.jwt.claims
--   * סכמת extensions (ריקה)
--   * default privileges "פתוחים" כמו ב-Supabase — כדי לוודא ש-0002 באמת סוגר אותם
--
-- אין להריץ בפרויקט Supabase אמיתי (שם הכול כבר קיים).
-- שימוש:  psql -v ON_ERROR_STOP=1 -f supabase/tests/local_supabase_stub.sql <db>
-- =============================================================================

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end;
$$;

create schema if not exists auth;
create schema if not exists extensions;

grant usage on schema public     to anon, authenticated, service_role;
grant usage on schema auth       to anon, authenticated, service_role;
grant usage on schema extensions to anon, authenticated, service_role;

-- ברירות המחדל הפתוחות של Supabase (0002 מבטל אותן ל-anon/authenticated).
alter default privileges in schema public grant all on tables    to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;

create or replace function auth.jwt()
returns jsonb
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')
  )::jsonb;
$$;

create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(
    coalesce(
      current_setting('request.jwt.claim.sub', true),
      (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
    ),
    ''
  )::uuid;
$$;

create or replace function auth.role()
returns text
language sql
stable
as $$
  select nullif(
    coalesce(
      current_setting('request.jwt.claim.role', true),
      (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
    ),
    ''
  )::text;
$$;

grant execute on function auth.jwt(), auth.uid(), auth.role() to anon, authenticated, service_role;
