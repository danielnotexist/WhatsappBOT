-- =============================================================================
-- 0009_ai_spend.sql — תקרת הוצאה יומית ל-AI ולתמלול, ומכסת הודעות יומית למשתמש
--
-- רקע: מצב "AI חי" בהדגמה (DEMO_MODE=1 + LIVE_AI=1, lib/env.ts liveAiInDemo) מפעיל את המודל האמיתי (Anthropic) ואת
-- התמלול האמיתי (OpenRouter). כדי שבדיקות לא יעלו יותר ממה שהוחלט, כל קריאה בתשלום נספרת כאן, וה-pipeline בודק
-- לפני כל קריאה (lib/ai/budget.ts):
--   * ai_spend        — יום (לוח השנה של Asia/Jerusalem) → כמה דולר יצאו וכמה קריאות. AI_DAILY_BUDGET_USD (ברירת מחדל 3).
--                       בלי שום מידע על משתמשים: הסכום היומי לא יורד גם כשמשתמש מוחק את החשבון.
--   * ai_spend_users  — יום × משתמש → כמה הודעות הגיעו לקריאה בתשלום. DEMO_USER_DAILY_MESSAGES (ברירת מחדל 60).
--                       נמחק עם המשתמש (on delete cascade).
--   * ai_spend_add(day, cost, calls)                 — מוסיף עלות של קריאה ומחזיר את הסכום החדש של היום.
--   * ai_spend_admit_message(day, user_id, limit)    — סופר עוד הודעה רק אם המשתמש עוד לא הגיע ל-limit (אטומי);
--                                                      מחזיר את הספירה החדשה, או -1 כשהמכסה מלאה (ואז לא סופר).
-- היום מחושב בקוד (dateKey(localDateOf(now, 'Asia/Jerusalem'))) ונשלח כפרמטר; ברירת המחדל של העמודות זהה.
-- שתי הטבלאות: שרת בלבד (service_role). RLS פעיל בלי policy — אף שורה ללקוח.
-- =============================================================================

create table public.ai_spend (
  day        date           primary key default ((now() at time zone 'Asia/Jerusalem')::date),
  cost_usd   numeric(12, 6) not null default 0 check (cost_usd >= 0),
  calls      integer        not null default 0 check (calls >= 0),
  updated_at timestamptz    not null default now()
);
comment on table public.ai_spend is
  'הוצאה יומית על קריאות AI ותמלול בתשלום (Anthropic, OpenRouter) — לתקרה AI_DAILY_BUDGET_USD (lib/ai/budget.ts). יום = לוח השנה של Asia/Jerusalem. שרת בלבד.';
comment on column public.ai_spend.cost_usd is 'סכום העלות בדולר כפי שהספקים דיווחו (Anthropic usage × מחירון, OpenRouter usage.cost), או הערכה שמרנית כשלא דווח.';

create table public.ai_spend_users (
  day        date        not null default ((now() at time zone 'Asia/Jerusalem')::date),
  user_id    uuid        not null references public.users (id) on delete cascade,
  messages   integer     not null default 0 check (messages >= 0),
  updated_at timestamptz not null default now(),
  primary key (day, user_id)
);
comment on table public.ai_spend_users is
  'כמה הודעות של משתמש הגיעו היום לקריאה בתשלום (מודל / תמלול) — למכסה DEMO_USER_DAILY_MESSAGES. נמחק עם המשתמש. שרת בלבד.';

-- -----------------------------------------------------------------------------
-- הרשאות: service_role בלבד (0002 סוגר anon/authenticated גם לטבלאות עתידיות; כאן במפורש)
-- -----------------------------------------------------------------------------
alter table public.ai_spend       enable row level security;
alter table public.ai_spend_users enable row level security;
revoke all on public.ai_spend       from public, anon, authenticated;
revoke all on public.ai_spend_users from public, anon, authenticated;
grant all on public.ai_spend       to service_role;
grant all on public.ai_spend_users to service_role;

-- -----------------------------------------------------------------------------
-- ai_spend_add — מוסיף עלות של קריאה ליום ומחזיר את הסכום החדש (upsert אטומי)
-- -----------------------------------------------------------------------------
create or replace function public.ai_spend_add(p_day date, p_cost numeric, p_calls integer default 1)
returns numeric
language sql
volatile
set search_path = ''
as $$
  insert into public.ai_spend as s (day, cost_usd, calls)
  values (p_day, greatest(coalesce(p_cost, 0), 0), greatest(coalesce(p_calls, 0), 0))
  on conflict (day) do update
     set cost_usd   = s.cost_usd + excluded.cost_usd,
         calls      = s.calls + excluded.calls,
         updated_at = now()
  returning s.cost_usd;
$$;
comment on function public.ai_spend_add(date, numeric, integer) is
  'מוסיף עלות (דולר) וקריאות ליום ומחזיר את סכום היום. עלות שלילית או null נספרת כ-0. service_role בלבד.';

revoke execute on function public.ai_spend_add(date, numeric, integer) from public, anon, authenticated;
grant  execute on function public.ai_spend_add(date, numeric, integer) to service_role;

-- -----------------------------------------------------------------------------
-- ai_spend_admit_message — עוד הודעה של המשתמש היום, רק מתחת למכסה. on conflict ... where נועל את השורה,
-- כך ששתי הודעות במקביל לא עוברות שתיהן את המכסה.
-- -----------------------------------------------------------------------------
create or replace function public.ai_spend_admit_message(p_day date, p_user_id uuid, p_limit integer)
returns integer
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_count integer;
begin
  if p_limit is null or p_limit < 1 then
    return -1;
  end if;
  insert into public.ai_spend_users as u (day, user_id, messages)
  values (p_day, p_user_id, 1)
  on conflict (day, user_id) do update
     set messages   = u.messages + 1,
         updated_at = now()
   where u.messages < p_limit
  returning u.messages into v_count;
  return coalesce(v_count, -1);
end;
$$;
comment on function public.ai_spend_admit_message(date, uuid, integer) is
  'סופר הודעה נוספת של המשתמש ביום אם עוד לא הגיע ל-p_limit. מחזיר את הספירה החדשה, או -1 כשהמכסה מלאה (בלי לספור). service_role בלבד.';

revoke execute on function public.ai_spend_admit_message(date, uuid, integer) from public, anon, authenticated;
grant  execute on function public.ai_spend_admit_message(date, uuid, integer) to service_role;
