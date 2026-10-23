-- =============================================================================
-- 0013_proactive_alerts.sql — התראות יזומות מהמייל והיומן (מסלול פרו)
--
-- רקע (ההחלטה של דניאל, 23.10.2026): בפרו, סיכום הבוקר מקבל סעיף "דברים שכדאי לא לפספס" (מיילים שמחכים לתשובה
-- 2 ימי עסקים ומעלה, מועדים מתוך מיילים, התנגשויות ביומן, פגישה עם גורם חיצוני, אזהרות פישינג), ובנוסף עד 2 התראות
-- דחופות ביום (התנגשות ביומן ב-24 השעות הקרובות, מייל דחוף מאדם אמיתי) — רק 08:00–20:00, לא בשבת ובחג.
-- הקוד: lib/proactive. המיגרציה מוסיפה:
--   * job_kind 'proactive_scan' — סריקה של משתמש אחד (lib/proactive/alerts.ts).
--   * proactive_alerts — כל פריט שהוצג: התראה דחופה (channel = urgent; פעם אחת לכל פריט, אף פעם לא שוב) או שורה
--                        בסעיף של סיכום הבוקר (channel = summary; פעם אחת ליום). ה-id משמש את הכפתורים
--                        ("לנסח תשובה", "להזכיר מחר" — al:<verb>:<id>). payload: מטא-דאטה בלבד (ספק, מזהה הודעה,
--                        שולח, נושא, כותרות פגישות) — בלי גוף מיילים. נמחק אחרי 30 יום (purge_proactive_alerts).
--   * proactive_alert_claim() — התקרה היומית (2) אטומית: נועל את שורת המשתמש, דוחה כפילות, ומעל התקרה או מחוץ
--                               לחלון 24 השעות של וואטסאפ רושם את הפריט כ-deferred — הוא נכנס לסיכום הבוקר הבא.
--   * schedule_proactive_scans() — pg_cron כל 20 דקות: משימת סריקה לשעה העגולה הבאה, למשתמשי פרו עם מספר פעיל וחיבור
--                                  פעיל שלא כיבו התראות (profile.alerts_disabled) או הודעות יזומות (proactive_disabled),
--                                  רק כשהשעה המקומית 08:00–19:59. שבת וחג נבדקים בקוד (לוח עברי, lib/time/rest-days.ts).
-- שרת בלבד (service_role). RLS פעיל בלי policy — אף שורה ללקוח, כמו 0008-0011.
-- =============================================================================

alter type public.job_kind add value if not exists 'proactive_scan';

create table public.proactive_alerts (
  id         uuid        primary key default gen_random_uuid(),
  user_id    uuid        not null references public.users (id) on delete cascade,
  item_key   text        not null check (length(item_key) between 1 and 300),
  kind       text        not null check (kind in ('urgent_mail', 'conflict', 'back_to_back', 'awaiting_reply', 'deadline', 'external_meeting', 'phishing')),
  channel    text        not null check (channel in ('urgent', 'summary')),
  status     text        not null check (status in ('sent', 'deferred', 'folded', 'listed')),
  local_day  date        not null,
  payload    jsonb       not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object' and pg_column_size(payload) <= 4096),
  created_at timestamptz not null default now(),
  constraint proactive_alerts_item_day_unique unique (user_id, channel, item_key, local_day),
  constraint proactive_alerts_status_channel check ((channel = 'summary') = (status = 'listed'))
);
comment on table public.proactive_alerts is
  'התראות יזומות (פרו): התראה דחופה (urgent, פעם אחת לפריט) או שורה בסעיף "דברים שכדאי לא לפספס" של סיכום הבוקר (summary, פעם ביום). payload = מטא-דאטה לכפתורים בלבד, בלי גוף מיילים. נמחק אחרי 30 יום. שרת בלבד.';
comment on column public.proactive_alerts.item_key is
  'הדבר עצמו: mail:<provider>:<id>, conflict:<a>|<b>, meeting:<provider>:<id>… — מונע התראה כפולה.';
comment on column public.proactive_alerts.status is
  'urgent: sent (נשלחה) / deferred (חלון 24 השעות סגור או שהתקרה היומית מלאה — תיכנס לסיכום הבוקר הבא) / folded (הוצגה בסיכום בוקר). summary: listed.';

create index proactive_alerts_user_day_idx on public.proactive_alerts (user_id, channel, local_day);
create index proactive_alerts_deferred_idx on public.proactive_alerts (user_id, created_at) where status = 'deferred';
create index proactive_alerts_created_idx  on public.proactive_alerts (created_at);

alter table public.proactive_alerts enable row level security;
revoke all on public.proactive_alerts from public, anon, authenticated;
grant all on public.proactive_alerts to service_role;

-- -----------------------------------------------------------------------------
-- proactive_alert_claim — התראה דחופה: כפילות / תקרה יומית / חלון סגור, אטומי למשתמש
-- -----------------------------------------------------------------------------
create or replace function public.proactive_alert_claim(
  p_user     uuid,
  p_item_key text,
  p_kind     text,
  p_day      date,
  p_payload  jsonb,
  p_cap      integer,
  p_deliver  boolean
)
returns jsonb
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_sent    integer;
  v_capped  boolean := false;
  v_deliver boolean := coalesce(p_deliver, false);
  v_id      uuid;
begin
  -- one claim per user at a time: two scans running together cannot both send the second alert of the day
  perform 1 from public.users u where u.id = p_user for update;
  if not found then
    raise exception 'proactive_alert_claim: unknown user' using errcode = 'P0002';
  end if;

  if exists (
    select 1 from public.proactive_alerts a
     where a.user_id = p_user
       and a.item_key = p_item_key
       and (a.channel = 'urgent' or a.local_day = p_day)
  ) then
    return jsonb_build_object('result', 'duplicate');
  end if;

  if v_deliver then
    select count(*) into v_sent
      from public.proactive_alerts a
     where a.user_id = p_user and a.channel = 'urgent' and a.local_day = p_day and a.status = 'sent';
    v_capped := v_sent >= greatest(coalesce(p_cap, 0), 0);
    v_deliver := not v_capped;
  end if;

  insert into public.proactive_alerts (user_id, item_key, kind, channel, status, local_day, payload)
  values (p_user, p_item_key, p_kind, 'urgent', case when v_deliver then 'sent' else 'deferred' end, p_day, coalesce(p_payload, '{}'::jsonb))
  returning id into v_id;

  return jsonb_build_object('result', case when v_deliver then 'claimed' when v_capped then 'cap' else 'deferred' end, 'id', v_id);
end;
$$;
comment on function public.proactive_alert_claim(uuid, text, text, date, jsonb, integer, boolean) is
  'התראה דחופה (lib/proactive/alerts.ts): duplicate אם הפריט כבר הותרע (בכל יום) או הוצג בסיכום של היום; אחרת מוסיף שורה — sent (claimed) כש-p_deliver ונשלחו פחות מ-p_cap היום, אחרת deferred (cap / deferred). נועל את שורת המשתמש. service_role בלבד.';

revoke execute on function public.proactive_alert_claim(uuid, text, text, date, jsonb, integer, boolean) from public, anon, authenticated;
grant  execute on function public.proactive_alert_claim(uuid, text, text, date, jsonb, integer, boolean) to service_role;

-- -----------------------------------------------------------------------------
-- schedule_proactive_scans — משימת סריקה לשעה העגולה הבאה (08:00–19:59 מקומי), למשתמשי פרו בלבד
-- dedupe_key = proactive_scan:<user>:<YYYY-MM-DD>T<HH> (זהה לקוד ב-lib/proactive/alerts.ts)
-- -----------------------------------------------------------------------------
create or replace function public.schedule_proactive_scans()
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_n integer := 0;
begin
  insert into public.jobs (kind, user_id, run_at, payload, dedupe_key)
  select 'proactive_scan'::public.job_kind,
         c.user_id,
         c.run_at,
         jsonb_build_object('slot', to_char(c.local_at, 'YYYY-MM-DD"T"HH24')),
         'proactive_scan:' || c.user_id::text || ':' || to_char(c.local_at, 'YYYY-MM-DD"T"HH24')
    from (
      select u.id as user_id,
             s.run_at,
             s.run_at at time zone u.timezone as local_at
        from public.users u
        cross join lateral (select date_trunc('hour', now()) + interval '1 hour' as run_at) s
       where u.deleted_at is null
         and public.user_plan(u.id) = 'pro'
         and coalesce(u.profile ->> 'alerts_disabled', 'false') <> 'true'
         and coalesce(u.profile ->> 'proactive_disabled', 'false') <> 'true'
         and exists (select 1 from public.wa_identities w where w.user_id = u.id and w.status = 'active')
         and exists (select 1 from public.connections k where k.user_id = u.id and k.status = 'active')
    ) c
   where extract(hour from c.local_at) between 8 and 19
  on conflict (dedupe_key) do nothing;

  get diagnostics v_n = row_count;
  return v_n;
end;
$$;
comment on function public.schedule_proactive_scans() is
  'יוצר משימת proactive_scan לשעה העגולה הבאה לכל משתמש פרו עם מספר וואטסאפ פעיל וחיבור פעיל, שלא כיבה התראות, כשהשעה המקומית שלו 08:00–19:59. שבת וחג נבדקים בקוד. אידמפוטנטי לפי dedupe_key. מחזיר כמה נוצרו.';

revoke execute on function public.schedule_proactive_scans() from public, anon, authenticated;
grant  execute on function public.schedule_proactive_scans() to service_role;

-- -----------------------------------------------------------------------------
-- purge_proactive_alerts — מינימום נתונים: שורות בנות יותר מ-30 יום נמחקות
-- -----------------------------------------------------------------------------
create or replace function public.purge_proactive_alerts(p_keep interval default interval '30 days')
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_n integer := 0;
begin
  delete from public.proactive_alerts where created_at < now() - p_keep;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;
comment on function public.purge_proactive_alerts(interval) is
  'מוחק שורות proactive_alerts ישנות מ-p_keep (ברירת מחדל 30 יום). מחזיר כמה נמחקו.';

revoke execute on function public.purge_proactive_alerts(interval) from public, anon, authenticated;
grant  execute on function public.purge_proactive_alerts(interval) to service_role;

-- -----------------------------------------------------------------------------
-- pg_cron (אם מותקן): סריקות כל 20 דקות, ניקוי פעם ביום
-- -----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise notice 'pg_cron not installed — proactive scan scheduling not added';
    return;
  end if;
  execute format('select cron.schedule(%L, %L, %L)',
    'wabot_schedule_proactive_scans', '*/20 * * * *', 'select public.schedule_proactive_scans()');
  execute format('select cron.schedule(%L, %L, %L)',
    'wabot_purge_proactive_alerts', '17 3 * * *', 'select public.purge_proactive_alerts()');
end;
$$;
