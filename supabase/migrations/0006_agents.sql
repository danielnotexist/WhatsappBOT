-- =============================================================================
-- 0006_agents.sql — סוכנים: מובנים (מזכירה / מתמחה / מנהלת חשבונות) ומותאמים (docs/design/agents.md §2)
-- (0004 נשאר פנוי בכוונה — ראו 0005.)
--
--   * agents.template              — מאיזו תבנית התחיל סוכן מותאם (null = סוכן ריק). רק ל-role='custom'. קבוע.
--   * אילוצים על agents            — שם 2–24 תווים בתווים מוגבלים; הנחיות עד 1,500 בלי < > ובלי תווי bidi;
--                                    tools ⊆ אוצר היכולות; permissions רק recipients / max_outbound_per_day.
--   * שורת override אחת לכל תפקיד מובנה למשתמש (אינדקס ייחודי חלקי).
--   * agent_custom_limit(plan)     — ניסיון 0, בסיסי 1, פרו 3 (= PLANS[*].customAgents ב-lib/billing/plans.ts).
--   * enforce_agent_rules()        — טריגר: מכסה (נועל את שורת המשתמש, כך ששתי הוספות במקביל לא עוברות שתיהן),
--                                    override מובנה רק בפרו, user_id / role / template לא משתנים.
--                                    רץ גם תחת service_role — המכסה נאכפת גם אם קוד השרת טועה.
--   * ייחוס: pending_actions / audit_log += agent_key, agent_name; messages += agent_key.
--   * pending_action_kind += 'forward_mail' (העברת מייל, באישור בכפתור כמו כל פעולה יוצאת).
--   * RLS: authenticated כבר לא כותב ל-agents (רק SELECT של שלו) — כתיבה רק מהשרת, אחרי הוולידציה של
--     lib/agents/service.ts.
--
-- ADD VALUE לא משמש באותה מיגרציה (מגבלת Postgres לטרנזקציה אחת) — 'forward_mail' לא מופיע כאן בשום ביטוי.
-- =============================================================================

alter type public.pending_action_kind add value if not exists 'forward_mail';

-- -----------------------------------------------------------------------------
-- 1. agents: עמודה חדשה + נרמול שורות קיימות (אין בפרודקשן; יש ב-seed ישן) לפני האילוצים
-- -----------------------------------------------------------------------------
alter table public.agents add column if not exists template text;

update public.agents
   set permissions = '{}'::jsonb
 where permissions - array['recipients', 'max_outbound_per_day'] <> '{}'::jsonb
    or jsonb_typeof(permissions) <> 'object';

update public.agents
   set tools = array(
         select distinct t
           from unnest(tools) as t
          where t in ('mail.read', 'mail.draft', 'mail.forward', 'calendar.read', 'calendar.write',
                      'files.read', 'files.save', 'reminders', 'morning'))
 where not (tools <@ array['mail.read', 'mail.draft', 'mail.forward', 'calendar.read', 'calendar.write',
                           'files.read', 'files.save', 'reminders', 'morning']::text[]);

update public.agents
   set instructions = left(translate(regexp_replace(instructions, '[‪-‮⁦-⁩]', '', 'g'), '<>', '‹›'), 1500)
 where instructions ~ '[<>‪-‮⁦-⁩]' or char_length(instructions) > 1500;

-- -----------------------------------------------------------------------------
-- 2. אילוצים
-- -----------------------------------------------------------------------------
alter table public.agents drop constraint if exists agents_name_length;

alter table public.agents
  add constraint agents_name_format check (
    char_length(name) between 2 and 24
    and name = btrim(name)
    and position('  ' in name) = 0
    and name ~ '^[A-Za-z0-9א-ת׳״''" -]+$'
  ),
  add constraint agents_template_valid check (
    template is null
    or (role = 'custom' and template in ('secretary', 'intern', 'bookkeeper'))
  ),
  add constraint agents_instructions_safe check (
    instructions is null
    or (char_length(instructions) <= 1500 and instructions !~ '[<>‪-‮⁦-⁩]')
  ),
  add constraint agents_tools_known check (
    cardinality(tools) <= 9
    and tools <@ array['mail.read', 'mail.draft', 'mail.forward', 'calendar.read', 'calendar.write',
                       'files.read', 'files.save', 'reminders', 'morning']::text[]
  ),
  add constraint agents_permissions_shape check (
    permissions - array['recipients', 'max_outbound_per_day'] = '{}'::jsonb
    and (not permissions ? 'recipients'
         or (jsonb_typeof(permissions -> 'recipients') = 'array'
             and jsonb_array_length(permissions -> 'recipients') <= 5
             and not jsonb_path_exists(permissions, '$.recipients[*] ? (@.type() != "string")')))
    and (not permissions ? 'max_outbound_per_day'
         or (jsonb_typeof(permissions -> 'max_outbound_per_day') = 'number'
             and (permissions ->> 'max_outbound_per_day')::numeric between 1 and 30
             and (permissions ->> 'max_outbound_per_day')::numeric = trunc((permissions ->> 'max_outbound_per_day')::numeric)))
  );

-- שורת override אחת לכל תפקיד מובנה (מותאמים — כמה שהמכסה מרשה)
create unique index if not exists agents_user_builtin_role_unique
  on public.agents (user_id, role)
  where role <> 'custom';

comment on table public.agents is
  'סוכנים (docs/design/agents.md). role=custom: סוכן של המשתמש (שם, הנחיות, יכולות), template = מאיזו תבנית התחיל. role מובנה (secretary/intern/bookkeeper): שורת override של משתמש פרו — מצב, הנחיות נוספות, צמצום יכולות, נמענים; המובנים עצמם מוגדרים בקוד (lib/agents/templates.ts). tools = יכולות (mail.read …), לא שמות כלים. permissions יכולות רק לצמצם (recipients, max_outbound_per_day) — אישור בכפתור לכל פעולה יוצאת הוא מבני ולא ניתן לכיבוי. מכסות: enforce_agent_rules. כתיבה — שרת בלבד; הלקוח קורא את שלו.';
comment on column public.agents.template     is 'null או secretary|intern|bookkeeper — רק ל-role=custom. לא משתנה אחרי היצירה.';
comment on column public.agents.instructions is 'הנחיות המשתמש (תוכן, לא מדיניות): עד 1,500 תווים, בלי < > ובלי תווי bidi. בשורת override — הנחיות נוספות לתבנית.';
comment on column public.agents.tools        is 'יכולות מתוך האוצר הקבוע (lib/agents/capabilities.ts → CAPABILITY_IDS). במובנה — צמצום מתוך יכולות התבנית (ריק = כל יכולות התבנית).';
comment on column public.agents.permissions  is '{"recipients": [עד 5 כתובות], "max_outbound_per_day": 1..30}. כל מפתח אחר נדחה.';

-- -----------------------------------------------------------------------------
-- 3. agent_custom_limit + enforce_agent_rules
-- -----------------------------------------------------------------------------
create or replace function public.agent_custom_limit(p_plan public.plan_kind)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case p_plan
    when 'trial' then 0
    when 'basic' then 1
    when 'pro'   then 3
  end;
$$;
comment on function public.agent_custom_limit(public.plan_kind) is
  'כמה סוכנים מותאמים (role=custom) מותר לפי מסלול: ניסיון 0, בסיסי 1, פרו 3. חייב להתאים ל-PLANS[*].customAgents ב-lib/billing/plans.ts (בדיקה ב-lib/agents/policy.test.ts).';

create or replace function public.enforce_agent_rules()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan  public.plan_kind;
  v_limit integer;
  v_count integer;
begin
  if tg_op = 'UPDATE' then
    if new.user_id is distinct from old.user_id
       or new.role is distinct from old.role
       or new.template is distinct from old.template then
      raise exception 'agent_immutable_field'
        using errcode = 'P0001', detail = 'user_id, role and template cannot change after insert';
    end if;
    return new;
  end if;

  -- INSERT: one writer per user at a time, so two tabs cannot both pass the quota.
  -- NO KEY UPDATE serialises agent inserts without blocking FK checks (KEY SHARE) from other tables.
  perform 1 from public.users u where u.id = new.user_id for no key update;
  if not found then
    raise exception 'agent_user_not_found' using errcode = '23503';
  end if;

  v_plan := public.user_plan(new.user_id);

  if new.role = 'custom' then
    v_limit := public.agent_custom_limit(v_plan);
    select count(*) into v_count
      from public.agents a
     where a.user_id = new.user_id
       and a.role = 'custom';
    if v_count >= v_limit then
      raise exception 'agent_limit_reached'
        using errcode = 'P0001', detail = format('plan=%s limit=%s', v_plan, v_limit);
    end if;
  elsif v_plan <> 'pro' then
    raise exception 'agent_builtin_requires_pro'
      using errcode = 'P0001', detail = format('plan=%s', v_plan);
  end if;

  return new;
end;
$$;
comment on function public.enforce_agent_rules() is
  'BEFORE INSERT OR UPDATE על agents: מכסת סוכנים מותאמים לפי user_plan (agent_limit_reached), override מובנה רק בפרו (agent_builtin_requires_pro), user_id/role/template קבועים (agent_immutable_field). נועל את שורת המשתמש בהוספה — בטוח במקביליות.';

drop trigger if exists agents_enforce_rules on public.agents;
create trigger agents_enforce_rules
  before insert or update on public.agents
  for each row execute function public.enforce_agent_rules();

revoke execute on function public.agent_custom_limit(public.plan_kind) from public, anon, authenticated;
revoke execute on function public.enforce_agent_rules()                 from public, anon, authenticated;
grant  execute on function public.agent_custom_limit(public.plan_kind) to service_role;
grant  execute on function public.enforce_agent_rules()                 to service_role;

-- -----------------------------------------------------------------------------
-- 4. ייחוס: מי הכין את הטיוטה, מי פעל, מי ענה
-- -----------------------------------------------------------------------------
alter table public.pending_actions
  add column if not exists agent_key  text,
  add column if not exists agent_name text;
alter table public.audit_log
  add column if not exists agent_key  text,
  add column if not exists agent_name text;
alter table public.messages
  add column if not exists agent_key  text;

alter table public.pending_actions
  add constraint pending_actions_agent_key_format check (agent_key is null or agent_key ~ '^(builtin:(secretary|intern|bookkeeper)|custom:[0-9a-f-]{36})$'),
  add constraint pending_actions_agent_name_length check (agent_name is null or char_length(agent_name) <= 60);
alter table public.audit_log
  add constraint audit_log_agent_key_format check (agent_key is null or agent_key ~ '^(builtin:(secretary|intern|bookkeeper)|custom:[0-9a-f-]{36})$'),
  add constraint audit_log_agent_name_length check (agent_name is null or char_length(agent_name) <= 60);
alter table public.messages
  add constraint messages_agent_key_format check (agent_key is null or agent_key ~ '^(builtin:(secretary|intern|bookkeeper)|custom:[0-9a-f-]{36})$');

comment on column public.pending_actions.agent_key  is 'הסוכן שהכין את הטיוטה: builtin:<role> או custom:<agents.id>. null = העוזרת הראשית. אין FK — מובנים וירטואליים, ומחיקת סוכן לא מוחקת היסטוריה. התקרה היומית נספרת לפיו.';
comment on column public.pending_actions.agent_name is 'שם הסוכן ברגע יצירת הטיוטה (כותרת בוואטסאפ).';
comment on column public.audit_log.agent_key        is 'הסוכן שפעל (מה-pending_action, או agent.create/update/… לניהול סוכנים).';
comment on column public.audit_log.agent_name       is 'תמונת מצב של שם הסוכן — שורדת מחיקת סוכן. אינו מידע אישי ולא מאונמם.';
comment on column public.messages.agent_key         is 'איזה סוכן ענה (תצוגה, דיבאג, עלויות לפי סוכן). null = העוזרת הראשית.';

create index if not exists pending_actions_user_agent_created_idx
  on public.pending_actions (user_id, agent_key, created_at)
  where agent_key is not null;

-- -----------------------------------------------------------------------------
-- 5. RLS: הלקוח קורא את הסוכנים שלו, לא כותב (כתיבה ישירה הייתה עוקפת את הוולידציה של שכבת השירות)
-- -----------------------------------------------------------------------------
revoke insert, update, delete on public.agents from authenticated;
drop policy if exists agents_insert_own on public.agents;
drop policy if exists agents_update_own on public.agents;
drop policy if exists agents_delete_own on public.agents;
-- agents_select_own (0002) נשאר.
