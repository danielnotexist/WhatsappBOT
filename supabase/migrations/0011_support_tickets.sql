-- =============================================================================
-- 0011_support_tickets.sql — פניות תמיכה מהאתר
--
-- רקע: צ'אט התמיכה באתר ("שאלות ותמיכה", components/brand/support-chat.tsx) עונה על שאלות על השירות, ומי שצריך
-- עזרה עם החשבון פותח פנייה (POST /api/support/ticket). הפנייה נשמרת כאן ונשלחת במייל לתיבת התמיכה
-- (SUPPORT_EMAIL, lib/support/notify.ts).
--   * support_tickets — שם, מייל, נושא (לא חובה), תיאור, והשיחה עם עלזה באתר עד הפנייה (אם המשתמש בחר לצרף,
--                       עד 20 הודעות). user_id רק כשהפונה מחובר; במחיקת החשבון → null (הפנייה נשארת לטיפול).
--   * status — open / in_progress / closed. אין עדיין ממשק ניהול: מטפלים מהמייל ומעדכנים כאן ידנית.
-- שרת בלבד (service_role). RLS פעיל בלי policy — אף שורה ללקוח, כמו 0008-0010.
-- =============================================================================

create table public.support_tickets (
  id         uuid        primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id    uuid        references public.users (id) on delete set null,
  name       text        not null check (length(btrim(name)) between 1 and 80),
  email      text        not null check (length(email) between 3 and 254 and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  subject    text        check (subject is null or length(subject) between 1 and 120),
  body       text        not null check (length(btrim(body)) between 1 and 4000),
  transcript jsonb       check (transcript is null or (jsonb_typeof(transcript) = 'array' and jsonb_array_length(transcript) <= 20 and pg_column_size(transcript) <= 32768)),
  status     text        not null default 'open' check (status in ('open', 'in_progress', 'closed'))
);
comment on table public.support_tickets is
  'פניות תמיכה מצ''אט התמיכה באתר (POST /api/support/ticket). נשלחות גם במייל לתיבת התמיכה. שרת בלבד.';
comment on column public.support_tickets.user_id is
  'המשתמש המחובר שפתח את הפנייה, אם היה מחובר. null לפונה אנונימי או אחרי מחיקת החשבון.';
comment on column public.support_tickets.transcript is
  'השיחה עם עלזה באתר עד הפנייה, אם הפונה בחר לצרף: [{role: user|assistant, text}], עד 20 הודעות.';

create index support_tickets_created_idx on public.support_tickets (created_at desc);
create index support_tickets_open_idx    on public.support_tickets (created_at) where status <> 'closed';
create index support_tickets_user_idx    on public.support_tickets (user_id) where user_id is not null;

-- -----------------------------------------------------------------------------
-- הרשאות: service_role בלבד (0002 סוגר anon/authenticated גם לטבלאות עתידיות; כאן במפורש)
-- -----------------------------------------------------------------------------
alter table public.support_tickets enable row level security;
revoke all on public.support_tickets from public, anon, authenticated;
grant all on public.support_tickets to service_role;
