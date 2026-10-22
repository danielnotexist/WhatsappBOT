-- =============================================================================
-- 0010_ai_spend_reserve.sql — שמירת מקום בתקרה היומית לפני קריאה בתשלום, וסגירה לפי העלות בפועל אחריה
--
-- רקע: ב-0009 הבדיקה הייתה "לקרוא את הסכום → לקרוא ל-API → להוסיף את העלות". קריאות שרצות במקביל עברו כולן מול אותו
-- סכום ישן, כך שהחריגה מהתקרה הייתה סכום כל הקריאות שבדרך, וקריאה שהפונקציה נהרגה באמצע (או שהרישום שלה נכשל)
-- לא נספרה בכלל. מעכשיו (lib/ai/budget.ts):
--   * ai_spend_reserve(day, est, budget) — לפני הקריאה: מוסיף הערכה עליונה (est) וקריאה אחת, רק אם הסכום החדש לא עובר
--                                         את budget (אטומי — שורת היום ננעלת). מחזיר את הסכום החדש, או -1 = נדחה.
--   * ai_spend_adjust(day, delta)        — אחרי הקריאה: מזיז את הסכום בהפרש (בפועל פחות ההערכה; לרוב שלילי), לא מתחת ל-0.
-- קריאה שלא נסגרה (timeout, פונקציה שנהרגה, רישום שנכשל) נשארת ספורה בהערכה שלה — נכשל סגור, לא פתוח.
-- ai_spend_add (0009) נשאר כמו שהוא.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- ai_spend_reserve — שומר מקום בתקרה (upsert אטומי עם תנאי)
-- -----------------------------------------------------------------------------
create or replace function public.ai_spend_reserve(p_day date, p_cost numeric, p_budget numeric)
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
  insert into public.ai_spend as s (day, cost_usd, calls)
  values (p_day, v_cost, 1)
  on conflict (day) do update
     set cost_usd   = s.cost_usd + excluded.cost_usd,
         calls      = s.calls + 1,
         updated_at = now()
   where s.cost_usd + excluded.cost_usd <= p_budget
  returning s.cost_usd into v_total;
  return coalesce(v_total, -1);
end;
$$;
comment on function public.ai_spend_reserve(date, numeric, numeric) is
  'לפני קריאה בתשלום: מוסיף הערכה עליונה וקריאה אחת ליום רק אם הסכום לא עובר את p_budget. מחזיר את הסכום החדש, או -1 כשנדחה (בלי לשנות). service_role בלבד.';

revoke execute on function public.ai_spend_reserve(date, numeric, numeric) from public, anon, authenticated;
grant  execute on function public.ai_spend_reserve(date, numeric, numeric) to service_role;

-- -----------------------------------------------------------------------------
-- ai_spend_adjust — סוגר הזמנה לפי העלות בפועל (הפרש חיובי או שלילי), לא מתחת ל-0
-- -----------------------------------------------------------------------------
create or replace function public.ai_spend_adjust(p_day date, p_delta numeric)
returns numeric
language sql
volatile
set search_path = ''
as $$
  insert into public.ai_spend as s (day, cost_usd, calls)
  values (p_day, greatest(coalesce(p_delta, 0), 0), 0)
  on conflict (day) do update
     set cost_usd   = greatest(s.cost_usd + coalesce(p_delta, 0), 0),
         updated_at = now()
  returning s.cost_usd;
$$;
comment on function public.ai_spend_adjust(date, numeric) is
  'אחרי קריאה בתשלום: מזיז את סכום היום בהפרש בין העלות בפועל להערכה (גם שלילי), לא מתחת ל-0. מחזיר את הסכום החדש. service_role בלבד.';

revoke execute on function public.ai_spend_adjust(date, numeric) from public, anon, authenticated;
grant  execute on function public.ai_spend_adjust(date, numeric) to service_role;
