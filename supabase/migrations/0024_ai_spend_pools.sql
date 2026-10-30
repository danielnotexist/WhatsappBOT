-- =============================================================================
-- 0024_ai_spend_pools.sql — תקרה יומית נפרדת לצ'אט התמיכה האנונימי באתר
--
-- רקע: הצ'אט באתר (app/api/support/chat) פתוח לכל אחד בלי התחברות, והוא שמר מקום מאותה שורה יומית של ai_spend
-- שהבוט בוואטסאפ משתמש בה. מבקרים אנונימיים (המגבלות לכל IP נשמרות בזיכרון של כל שרת) יכלו למלא את התקרה ולעצור
-- את הבוט לכל הלקוחות עד סוף היום. מעכשיו לצ'אט התמיכה יש "קופה" משלו (lib/ai/budget.ts supportGuardFromEnv):
--   * ai_spend_pools                          — (יום, קופה) → כמה דולר יצאו וכמה קריאות. היום: 'support'.
--   * ai_spend_pool_reserve(pool, day, est, budget) — כמו ai_spend_reserve (0010), לקופה אחת.
--   * ai_spend_pool_adjust(pool, day, delta)        — כמו ai_spend_adjust (0010), לקופה אחת.
-- ai_spend של הבוט לא משתנה. שרת בלבד (service_role). RLS פעיל בלי policy.
-- =============================================================================

create table public.ai_spend_pools (
  pool       text           not null check (pool ~ '^[a-z][a-z0-9_]{0,31}$'),
  day        date           not null default ((now() at time zone 'Asia/Jerusalem')::date),
  cost_usd   numeric(12, 6) not null default 0 check (cost_usd >= 0),
  calls      integer        not null default 0 check (calls >= 0),
  updated_at timestamptz    not null default now(),
  primary key (pool, day)
);
comment on table public.ai_spend_pools is
  'הוצאה יומית על קריאות AI בקופה נפרדת מהבוט (היום: support — צ''אט התמיכה האנונימי באתר, SUPPORT_AI_DAILY_BUDGET_USD). שרת בלבד.';

alter table public.ai_spend_pools enable row level security;
revoke all on public.ai_spend_pools from public, anon, authenticated;
grant all on public.ai_spend_pools to service_role;

-- -----------------------------------------------------------------------------
-- ai_spend_pool_reserve — שומר מקום בתקרה של קופה (upsert אטומי עם תנאי). הסכום החדש, או -1 = נדחה.
-- -----------------------------------------------------------------------------
create or replace function public.ai_spend_pool_reserve(p_pool text, p_day date, p_cost numeric, p_budget numeric)
returns numeric
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_cost  numeric := greatest(coalesce(p_cost, 0), 0);
  v_total numeric;
begin
  if p_budget is null or v_cost > p_budget then
    return -1;
  end if;
  insert into public.ai_spend_pools as s (pool, day, cost_usd, calls)
  values (p_pool, p_day, v_cost, 1)
  on conflict (pool, day) do update
     set cost_usd   = s.cost_usd + excluded.cost_usd,
         calls      = s.calls + 1,
         updated_at = now()
   where s.cost_usd + excluded.cost_usd <= p_budget
  returning s.cost_usd into v_total;
  return coalesce(v_total, -1);
end;
$$;
comment on function public.ai_spend_pool_reserve(text, date, numeric, numeric) is
  'לפני קריאה בתשלום בקופה נפרדת: מוסיף הערכה עליונה וקריאה אחת רק אם הסכום לא עובר את p_budget. הסכום החדש, או -1. service_role בלבד.';

revoke execute on function public.ai_spend_pool_reserve(text, date, numeric, numeric) from public, anon, authenticated;
grant  execute on function public.ai_spend_pool_reserve(text, date, numeric, numeric) to service_role;

-- -----------------------------------------------------------------------------
-- ai_spend_pool_adjust — סוגר הזמנה לפי העלות בפועל, לא מתחת ל-0
-- -----------------------------------------------------------------------------
create or replace function public.ai_spend_pool_adjust(p_pool text, p_day date, p_delta numeric)
returns numeric
language sql
volatile
set search_path = ''
as $$
  insert into public.ai_spend_pools as s (pool, day, cost_usd, calls)
  values (p_pool, p_day, greatest(coalesce(p_delta, 0), 0), 0)
  on conflict (pool, day) do update
     set cost_usd   = greatest(s.cost_usd + coalesce(p_delta, 0), 0),
         updated_at = now()
  returning s.cost_usd;
$$;
comment on function public.ai_spend_pool_adjust(text, date, numeric) is
  'אחרי קריאה בתשלום בקופה נפרדת: מזיז את הסכום בהפרש בין העלות בפועל להערכה, לא מתחת ל-0. service_role בלבד.';

revoke execute on function public.ai_spend_pool_adjust(text, date, numeric) from public, anon, authenticated;
grant  execute on function public.ai_spend_pool_adjust(text, date, numeric) to service_role;
