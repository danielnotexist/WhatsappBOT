-- =============================================================================
-- 0008_google_user_cap.sql — קריאת Gmail בלי CASA: יומן ההרשאות לתקרת 100 המשתמשים של Google
-- (0006 שמור למיגרציית הסוכנים ו-0007 למיגרציית הסליקה של HYP — שתי זרימות עבודה מקבילות.)
--
-- רקע (docs/google-setup.md §6): אפליקציה שלא עברה אימות ומבקשת scope רגיש/מוגבל מוגבלת ל-100 משתמשים
-- חדשים "לכל חיי הפרויקט, בלי איפוס" (support.google.com/cloud/answer/13463817, 15549945, 7454865).
-- Google סופרת משתמשים שאישרו — לא משתמשים פעילים — ולכן גם מי שניתק או מחק חשבון נשאר בספירה.
--
--   * google_scope_grants — חשבון Google (גיבוב sha256 של המייל באותיות קטנות) × scope שנספר בתקרה.
--     נשמר גם אחרי ניתוק ומחיקת חשבון (user_id → null). הקוד: lib/google/user-cap.ts.
--   * ops_flags — דגלי תפעול שנקבעים פעם אחת (למשל google_user_cap:80 / google_user_cap:95).
--   * google_scope_account_count(scopes) — כמה חשבונות שונים אישרו אחד מה-scopes.
--   * מילוי ראשוני מחיבורי Google קיימים (כולל מנותקים).
-- שתי הטבלאות: שרת בלבד (service_role). RLS פעיל בלי policy — אף שורה ללקוח.
-- =============================================================================

create table public.google_scope_grants (
  account_hash     text        not null check (account_hash ~ '^[0-9a-f]{64}$'),
  scope            text        not null check (scope like 'https://www.googleapis.com/auth/%'),
  user_id          uuid        references public.users (id) on delete set null,
  first_granted_at timestamptz not null default now(),
  primary key (account_hash, scope)
);
comment on table public.google_scope_grants is
  'כל חשבון Google שאישר אי-פעם scope ש-Google סופרת בתקרת 100 המשתמשים של אפליקציה לא מאומתת (gmail.readonly תמיד; calendar.events / gmail.send עד אימות ה-scopes הרגישים). לא נמחק בניתוק או במחיקת חשבון — Google ממשיכה לספור. שרת בלבד.';
comment on column public.google_scope_grants.account_hash is
  'sha256 (hex) של כתובת המייל של חשבון Google באותיות קטנות. לא נשמרת הכתובת עצמה.';
comment on column public.google_scope_grants.user_id is
  'המשתמש שאישר (null אחרי מחיקת החשבון — השורה נשארת לספירה).';

create index google_scope_grants_scope_idx on public.google_scope_grants (scope);

create table public.ops_flags (
  key        text        primary key check (length(key) between 1 and 120),
  value      jsonb       not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
comment on table public.ops_flags is
  'דגלי תפעול/התראות למפעיל שנקבעים פעם אחת (insert בלבד; קיים = כבר הותרע). למשל google_user_cap:80. שרת בלבד.';

-- -----------------------------------------------------------------------------
-- הרשאות: service_role בלבד (0002 סוגר anon/authenticated גם לטבלאות עתידיות; כאן במפורש)
-- -----------------------------------------------------------------------------
alter table public.google_scope_grants enable row level security;
alter table public.ops_flags           enable row level security;
revoke all on public.google_scope_grants from public, anon, authenticated;
revoke all on public.ops_flags           from public, anon, authenticated;
grant all on public.google_scope_grants to service_role;
grant all on public.ops_flags           to service_role;

-- -----------------------------------------------------------------------------
-- google_scope_account_count — חשבונות שונים שאישרו אחד מה-scopes (count distinct, ש-PostgREST לא עושה)
-- -----------------------------------------------------------------------------
create or replace function public.google_scope_account_count(p_scopes text[])
returns integer
language sql
stable
set search_path = ''
as $$
  select count(distinct g.account_hash)::integer
    from public.google_scope_grants g
   where g.scope = any (p_scopes);
$$;
comment on function public.google_scope_account_count(text[]) is
  'כמה חשבונות Google שונים אישרו אי-פעם אחד מה-scopes (תקרת המשתמשים של אפליקציה לא מאומתת). service_role בלבד.';

revoke execute on function public.google_scope_account_count(text[]) from public, anon, authenticated;
grant  execute on function public.google_scope_account_count(text[]) to service_role;

-- -----------------------------------------------------------------------------
-- מילוי ראשוני: חיבורי Google קיימים (גם מנותקים — Google כבר ספרה אותם)
-- -----------------------------------------------------------------------------
insert into public.google_scope_grants (account_hash, scope, user_id, first_granted_at)
select encode(sha256(convert_to(lower(c.account_email), 'UTF8')), 'hex'),
       s.scope,
       c.user_id,
       c.created_at
  from public.connections c
 cross join lateral unnest(c.scopes) as s(scope)
 where c.provider = 'google'
   and c.account_email is not null
   and s.scope in (
     'https://www.googleapis.com/auth/gmail.readonly',
     'https://www.googleapis.com/auth/gmail.modify',
     'https://www.googleapis.com/auth/calendar.events',
     'https://www.googleapis.com/auth/gmail.send'
   )
on conflict do nothing;
