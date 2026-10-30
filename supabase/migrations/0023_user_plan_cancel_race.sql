-- =============================================================================
-- 0023_user_plan_cancel_race.sql — user_plan(): מנוי "active" עם ביטול עליו הוא מנוי מבוטל (סבב האבטחה, אזור E)
--
-- ביטול שנלחץ בזמן ש-HYP מחייב יכול היה להיכתב לפני עדכון ההצלחה של החיוב, ולהשאיר שורה active עם cancelled_at.
-- הקוד שומר עכשיו את הביטול (lib/billing/subscription.ts keptChanges), וזו רשת ביטחון: שורה כזאת נותנת את המסלול
-- רק עד סוף התקופה ששולמה, בדיוק כמו cancelled — התאום ב-TypeScript הוא paidPlanOf (lib/billing/plans.ts).
-- שאר המקרים לא משתנים. service_role בלבד (ההרשאות של 0003 נשמרות ב-create or replace).
-- =============================================================================

create or replace function public.user_plan(p_user_id uuid)
returns public.plan_kind
language sql
stable
set search_path = ''
as $$
  select coalesce(
    (select case
              when s.status = 'active' and s.cancelled_at is not null then
                case when s.next_charge_at > now() then s.plan else 'trial'::public.plan_kind end
              when s.status in ('active', 'past_due') then s.plan
              when s.status = 'cancelled' and s.next_charge_at > now() then s.plan   -- פעיל עד סוף התקופה
              else 'trial'::public.plan_kind
            end
       from public.subscriptions s
      where s.user_id = p_user_id),
    'trial'::public.plan_kind);
$$;
comment on function public.user_plan(uuid) is
  'המסלול בפועל: basic/pro כשהמנוי active/past_due, או cancelled (או active עם cancelled_at) שעדיין בתוך התקופה ששולמה; אחרת trial.';
