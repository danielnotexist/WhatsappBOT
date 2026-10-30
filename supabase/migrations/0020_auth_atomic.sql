-- =============================================================================
-- 0020_auth_atomic.sql — מונים אטומיים לקודי כניסה, לקוד הניהול, לקוד הקישור ולקישור הכניסה מוואטסאפ (סבב האבטחה, אזור B)
--
-- עד עכשיו השרת קרא שורה ואז כתב אותה בבקשה נפרדת (read-then-write), ולכן בקשות מקבילות עקפו כל מגבלה:
-- ניחושים מקבילים של קוד נספרו כניסיון אחד, שליחות מקבילות עברו את ההמתנה ואת המכסה, ואותו קוד קישור קישר שני טלפונים.
-- כל בדיקה ועדכון כאן קורים בפונקציה אחת, בטרנזקציה אחת, עם נעילה.
--
--   * auth_otps: mailbox (תיבת הדואר הקנונית: בלי +תגית, ובלי נקודות ב-gmail), requester (HMAC של כתובת ה-IP / רשת ‎/64),
--     challenge_hash (גיבוב של עוגיית הדפדפן שביקש את הקוד — רק הדפדפן הזה יכול לנחש, וזר לא "שורף" את הקוד).
--   * otp_issue()  — המתנה של 60 שנ׳ ומכסה לשעה (לכל מבקש, לכל תיבה, ותקרה כללית) + ביטול הקוד הקודם + הכנסה, באטומיות.
--   * otp_check()  — בודק קוד מול השורה הנעולה (FOR UPDATE): נכון → משומש; שגוי → attempts+1, ובמקסימום → משומש.
--   * link_tokens.token → token_hash: הקוד XXXX-XXXX לא נשמר בגלוי (HMAC בשרת). שורות קיימות נמחקות (תוקפן 15 דק׳).
--   * wa_identity_link()   — קישור מספר: שורה שמנותקת עוברת לחשבון החדש, מספר פעיל בחשבון אחר — לעולם לא.
--   * link_token_consume() — בודק את הקוד, "טלפון אחד לחשבון" ומקשר — הכול בנעילה אחת; הקוד נשרף פעם אחת בלבד.
--   * wa_trial_phones      — מספר (HMAC) שכבר קיבל תקופת ניסיון: חשבון חדש על אותו מספר לא מקבל ניסיון שני.
--   * wa_link_attempts     — rpc wa_link_attempt(): רק קוד שגוי נספר; אחרי שהחסימה פגה המונה מתאפס; הודעה רגילה
--                            מקבלת הפניה לאתר פעם בשעה; משלוח חוזר של אותה הודעה (wamid) לא נספר שוב.
--   * login_token_consume() — קישור הכניסה מוואטסאפ נשרף באטומיות (השוואת הגיבוב והמחיקה באותה פקודה).
--
-- אין `alter type ... add value`; אפשר להריץ בטרנזקציה אחת. כל הפונקציות: service_role בלבד.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- auth_otps: mailbox / requester / challenge_hash
-- -----------------------------------------------------------------------------
alter table public.auth_otps add column if not exists mailbox        text;
alter table public.auth_otps add column if not exists requester      text;
alter table public.auth_otps add column if not exists challenge_hash text;
comment on column public.auth_otps.mailbox is
  'תיבת הדואר הקנונית (lib/auth/otp.ts mailboxKey): בלי +תגית, ובלי נקודות ב-gmail.com. המכסות נספרות לפיה. null בשורות שלפני 0020.';
comment on column public.auth_otps.requester is
  'HMAC של כתובת ה-IP של המבקש (IPv6: רשת ‎/64). ההמתנה והמכסה הראשונה נספרות לכל מבקש, כדי שזר לא ינעל את בעל התיבה.';
comment on column public.auth_otps.challenge_hash is
  'גיבוב של עוגיית האתגר (wb_otp) שקיבל הדפדפן שביקש את הקוד. רק מי שמחזיק בה יכול לבדוק קוד מול השורה. null = קוד הניהול.';

create index if not exists auth_otps_mailbox_created_idx on public.auth_otps (mailbox, created_at desc);
create index if not exists auth_otps_created_idx         on public.auth_otps (created_at desc);

-- -----------------------------------------------------------------------------
-- otp_issue — המתנה + מכסות + ביטול הקוד הקודם + הכנסה, באטומיות (נעילה לכל תיבה)
-- מחזיר { status: ok | cooldown | too_many | busy, retry_after (שניות), id }
-- -----------------------------------------------------------------------------
create or replace function public.otp_issue(
  p_email              text,
  p_mailbox            text,
  p_requester          text,
  p_challenge_hash     text,
  p_code_hash          text,
  p_expires_at         timestamptz,
  p_cooldown_seconds   integer,
  p_max_per_requester  integer,
  p_max_per_mailbox    integer,
  p_max_global         integer default null,
  p_max_per_requester_all integer default null
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_last timestamptz;
  v_n    integer;
  v_id   uuid;
begin
  -- one issuer per mailbox at a time: parallel sends see each other's rows
  perform pg_advisory_xact_lock(hashtextextended('auth_otps:' || p_mailbox, 0));

  select max(o.created_at) into v_last
    from public.auth_otps o
   where o.mailbox = p_mailbox and o.requester = p_requester
     and (o.used_at is null or o.attempts > 0);
  -- the cooldown counts the latest open code or one burned by wrong guesses (a burned code does not open a new send at
  -- once); a code spent by a clean sign-in does not hold the next one back
  if v_last is not null and v_last > now() - make_interval(secs => p_cooldown_seconds) then
    return jsonb_build_object('status', 'cooldown',
      'retry_after', greatest(1, ceil(extract(epoch from (v_last + make_interval(secs => p_cooldown_seconds) - now()))))::integer);
  end if;

  select count(*) into v_n from public.auth_otps o
   where o.mailbox = p_mailbox and o.requester = p_requester and o.created_at > now() - interval '1 hour';
  if v_n >= p_max_per_requester then
    return jsonb_build_object('status', 'too_many', 'retry_after', 3600);
  end if;

  -- one requester across every address (random addresses from one IP must not fill the global ceiling for everyone)
  if p_max_per_requester_all is not null then
    select count(*) into v_n from public.auth_otps o
     where o.requester = p_requester and o.created_at > now() - interval '1 hour';
    if v_n >= p_max_per_requester_all then
      return jsonb_build_object('status', 'too_many', 'retry_after', 3600);
    end if;
  end if;

  select count(*) into v_n from public.auth_otps o
   where o.mailbox = p_mailbox and o.created_at > now() - interval '1 hour';
  if v_n >= p_max_per_mailbox then
    return jsonb_build_object('status', 'too_many', 'retry_after', 3600);
  end if;

  if p_max_global is not null then
    select count(*) into v_n from public.auth_otps o where o.created_at > now() - interval '1 hour';
    if v_n >= p_max_global then
      return jsonb_build_object('status', 'busy', 'retry_after', 600);
    end if;
  end if;

  -- a new code supersedes this requester's earlier one (another requester's code stays: it is not theirs to kill)
  update public.auth_otps o set used_at = now()
   where o.email = p_email and o.requester = p_requester and o.used_at is null;

  insert into public.auth_otps (email, mailbox, requester, challenge_hash, code_hash, expires_at)
  values (p_email, p_mailbox, p_requester, p_challenge_hash, p_code_hash, p_expires_at)
  returning id into v_id;

  return jsonb_build_object('status', 'ok', 'retry_after', 0, 'id', v_id);
end;
$$;
comment on function public.otp_issue(text, text, text, text, text, timestamptz, integer, integer, integer, integer, integer) is
  'מנפיק קוד באטומיות: המתנה לכל (תיבה, מבקש) לפי השורה האחרונה בכל מצב, מכסה לשעה לכל מבקש ולכל תיבה, תקרה כללית לשעה, ביטול הקוד הקודם של אותו מבקש והכנסה. ok / cooldown / too_many / busy.';

-- -----------------------------------------------------------------------------
-- otp_check — בדיקת קוד מול השורה הנעולה. מחזיר { status: ok | no_code | expired | too_many_attempts | invalid, attempts_left }
-- -----------------------------------------------------------------------------
create or replace function public.otp_check(
  p_email          text,
  p_challenge_hash text,
  p_code_hash      text,
  p_max_attempts   integer
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_id       uuid;
  v_hash     text;
  v_expires  timestamptz;
  v_attempts integer;
begin
  select o.id, o.code_hash, o.expires_at, o.attempts
    into v_id, v_hash, v_expires, v_attempts
    from public.auth_otps o
   where o.email = p_email
     and o.used_at is null
     and o.challenge_hash is not distinct from p_challenge_hash
   order by o.created_at desc
   limit 1
     for update;
  if not found then
    return jsonb_build_object('status', 'no_code', 'attempts_left', 0);
  end if;

  if v_expires <= now() then
    update public.auth_otps set used_at = now() where id = v_id;
    return jsonb_build_object('status', 'expired', 'attempts_left', 0);
  end if;

  if v_attempts >= p_max_attempts then
    update public.auth_otps set used_at = now() where id = v_id;
    return jsonb_build_object('status', 'too_many_attempts', 'attempts_left', 0);
  end if;

  if v_hash = p_code_hash then
    update public.auth_otps set used_at = now() where id = v_id;
    return jsonb_build_object('status', 'ok', 'attempts_left', p_max_attempts - v_attempts);
  end if;

  update public.auth_otps
     set attempts = v_attempts + 1,
         used_at  = case when v_attempts + 1 >= p_max_attempts then now() else null end
   where id = v_id;
  if v_attempts + 1 >= p_max_attempts then
    return jsonb_build_object('status', 'too_many_attempts', 'attempts_left', 0);
  end if;
  return jsonb_build_object('status', 'invalid', 'attempts_left', p_max_attempts - v_attempts - 1);
end;
$$;
comment on function public.otp_check(text, text, text, integer) is
  'בודק קוד מול הקוד הפעיל האחרון של (מייל, אתגר) בנעילת שורה: ניחושים מקבילים נספרים כל אחד, והקוד נשרף אחרי המקסימום או בהצלחה.';

-- -----------------------------------------------------------------------------
-- link_tokens: token (גלוי) → token_hash
-- -----------------------------------------------------------------------------
delete from public.link_tokens;
alter table public.link_tokens drop constraint if exists link_tokens_token_unique;
alter table public.link_tokens drop constraint if exists link_tokens_token_format;
alter table public.link_tokens drop column if exists token;
alter table public.link_tokens add column token_hash text not null;
alter table public.link_tokens add constraint link_tokens_token_hash_unique unique (token_hash);
alter table public.link_tokens add constraint link_tokens_token_hash_format check (token_hash ~ '^[A-Za-z0-9_-]{43}$');
comment on table public.link_tokens is
  'קוד קישור לוואטסאפ (XXXX-XXXX, 15 דק׳, חד-פעמי). נשמר רק HMAC שלו (token_hash); את הקוד עצמו השרת מחשב מ-id השורה ומהמפתח. שרת בלבד. [RLS: אין policies — service_role בלבד]';
comment on column public.link_tokens.token_hash is 'HMAC-SHA256 (base64url) של הקוד XXXX-XXXX עם מפתח המשנה link. ייחודי.';

-- -----------------------------------------------------------------------------
-- wa_trial_phones — מספרים שכבר קיבלו תקופת ניסיון (HMAC של המספר; נשאר גם אחרי מחיקת החשבון)
-- -----------------------------------------------------------------------------
create table if not exists public.wa_trial_phones (
  phone_hash  text        primary key check (phone_hash ~ '^[A-Za-z0-9_-]{43}$'),
  user_id     uuid        references public.users (id) on delete set null,
  created_at  timestamptz not null default now()
);
comment on table public.wa_trial_phones is
  'מספר וואטסאפ (HMAC, לא המספר) שכבר קושר לחשבון בתקופת ניסיון. חשבון אחר שמקשר אותו מספר מתחיל בלי ניסיון. user_id → null במחיקת חשבון (השורה נשארת). שרת בלבד.';
alter table public.wa_trial_phones enable row level security;
revoke all on public.wa_trial_phones from public, anon, authenticated;
grant all on public.wa_trial_phones to service_role;

-- -----------------------------------------------------------------------------
-- wa_identity_link — קישור מספר לחשבון: שורה מנותקת עוברת; מספר פעיל (גם באותו חשבון) → 23505
-- -----------------------------------------------------------------------------
create or replace function public.wa_identity_link(p_user_id uuid, p_phone text, p_wa_name text)
returns public.wa_identities
language plpgsql
set search_path = ''
as $$
declare
  r public.wa_identities;
begin
  insert into public.wa_identities as w (user_id, phone_e164, wa_name, status, linked_at)
  values (p_user_id, p_phone, p_wa_name, 'active', now())
  on conflict (phone_e164) do update
     set user_id = excluded.user_id, wa_name = excluded.wa_name, status = 'active', linked_at = now()
   where w.status = 'unlinked'
  returning * into r;
  if not found then
    raise exception 'wa_identity_link: phone % is linked', p_phone using errcode = '23505';
  end if;
  return r;
end;
$$;
comment on function public.wa_identity_link(uuid, text, text) is
  'מקשר מספר לחשבון. שורה מנותקת של אותו מספר עוברת לחשבון; מספר פעיל או חסום לא נדרס לעולם (23505).';

-- -----------------------------------------------------------------------------
-- link_token_consume — קוד קישור → קישור, הכול בנעילה אחת
-- מחזיר { result: linked | invalid | expired | no_user | second_phone | phone_taken, user_id, other_phone, trial_reused }
-- -----------------------------------------------------------------------------
create or replace function public.link_token_consume(p_token_hash text, p_phone text, p_wa_name text, p_phone_hash text)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_token   uuid;
  v_user    uuid;
  v_used    timestamptz;
  v_expires timestamptz;
  v_other   text;
  v_status  public.wa_identity_status;
  v_owner   uuid;
  v_prev    uuid;
  v_reused  boolean := false;
  v_tz      text;
  v_created timestamptz;
begin
  select t.id, t.user_id, t.used_at, t.expires_at into v_token, v_user, v_used, v_expires
    from public.link_tokens t where t.token_hash = p_token_hash
     for update;
  if not found then return jsonb_build_object('result', 'invalid'); end if;
  if v_used is not null or v_expires <= now() then return jsonb_build_object('result', 'expired'); end if;

  -- the account row lock: two tokens of one account from two phones wait for each other
  select u.timezone, u.created_at into v_tz, v_created
    from public.users u where u.id = v_user and u.deleted_at is null
     for update;
  if not found then return jsonb_build_object('result', 'no_user'); end if;

  select w.phone_e164 into v_other
    from public.wa_identities w
   where w.user_id = v_user and w.status <> 'unlinked' and w.phone_e164 <> p_phone
   limit 1;
  if found then return jsonb_build_object('result', 'second_phone', 'user_id', v_user, 'other_phone', v_other); end if;

  select w.status, w.user_id into v_status, v_owner from public.wa_identities w where w.phone_e164 = p_phone for update;
  if found and v_status <> 'unlinked' and (v_owner <> v_user or v_status = 'blocked') then
    return jsonb_build_object('result', 'phone_taken');
  end if;

  if found and v_status = 'active' then
    update public.wa_identities set wa_name = p_wa_name where phone_e164 = p_phone;
  else
    perform public.wa_identity_link(v_user, p_phone, p_wa_name);
  end if;
  update public.link_tokens set used_at = now() where id = v_token;

  -- one trial per phone: a phone that already had a trial on another (or a deleted) account starts this one without
  if p_phone_hash is not null and public.user_plan(v_user) = 'trial' then
    insert into public.wa_trial_phones (phone_hash, user_id) values (p_phone_hash, v_user)
    on conflict (phone_hash) do nothing;
    if not found then
      select tp.user_id into v_prev from public.wa_trial_phones tp where tp.phone_hash = p_phone_hash;
      if v_prev is distinct from v_user then
        v_reused := true;
        insert into public.usage as u (user_id, period_start, counted_messages, free_remaining, plan_limit)
        values (v_user, (v_created at time zone v_tz)::date, 0, 0, public.plan_message_limit('trial'))
        on conflict (user_id, period_start) do update set free_remaining = 0;
      end if;
    end if;
  end if;

  return jsonb_build_object('result', 'linked', 'user_id', v_user, 'trial_reused', v_reused);
end;
$$;
comment on function public.link_token_consume(text, text, text, text) is
  'קוד קישור → קישור המספר, באטומיות: הקוד נשרף פעם אחת, "טלפון אחד לחשבון" נבדק בנעילת החשבון, מספר פעיל בחשבון אחר לא נדרס, ומספר שכבר קיבל ניסיון לא מקבל ניסיון שני.';

-- -----------------------------------------------------------------------------
-- wa_link_attempts: last_pointer_at / last_message_id + wa_link_attempt()
-- -----------------------------------------------------------------------------
alter table public.wa_link_attempts add column if not exists last_pointer_at timestamptz;
alter table public.wa_link_attempts add column if not exists last_message_id text;

create or replace function public.wa_link_attempt(
  p_phone           text,
  p_strike          boolean,
  p_message_id      text,
  p_max_attempts    integer,
  p_block_seconds   integer,
  p_pointer_seconds integer
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  r       public.wa_link_attempts;
  v_reply boolean := false;
begin
  insert into public.wa_link_attempts (phone_e164, attempts) values (p_phone, 0) on conflict (phone_e164) do nothing;
  select * into r from public.wa_link_attempts where phone_e164 = p_phone for update;

  -- the same message delivered again: nothing new
  if p_message_id is not null and r.last_message_id is not distinct from p_message_id then
    return jsonb_build_object('attempts', r.attempts, 'blocked', coalesce(r.blocked_until > now(), false), 'reply', false);
  end if;
  if r.blocked_until is not null and r.blocked_until > now() then
    return jsonb_build_object('attempts', r.attempts, 'blocked', true, 'reply', false);
  end if;
  -- a block that ran out starts over
  if r.blocked_until is not null then
    r.attempts := 0;
    r.blocked_until := null;
  end if;

  if p_strike then
    r.attempts := r.attempts + 1;
    if r.attempts >= p_max_attempts then
      r.blocked_until := now() + make_interval(secs => p_block_seconds);
    else
      v_reply := true;
    end if;
  elsif r.last_pointer_at is null or r.last_pointer_at <= now() - make_interval(secs => p_pointer_seconds) then
    v_reply := true;
    r.last_pointer_at := now();
  end if;

  update public.wa_link_attempts
     set attempts = r.attempts, blocked_until = r.blocked_until, last_pointer_at = r.last_pointer_at,
         last_message_id = coalesce(p_message_id, r.last_message_id), last_attempt_at = now()
   where phone_e164 = p_phone;
  return jsonb_build_object('attempts', r.attempts, 'blocked', r.blocked_until is not null, 'reply', v_reply);
end;
$$;
comment on function public.wa_link_attempt(text, boolean, text, integer, integer, integer) is
  'מספר לא מקושר: קוד שגוי = ניסיון (3 → חסימה ל-24 שעות; אחרי שהחסימה פגה המונה מתאפס). הודעה בלי קוד לא נספרת — הפניה לאתר פעם ב-p_pointer_seconds. אותה הודעה (wamid) פעמיים = כלום.';

-- -----------------------------------------------------------------------------
-- login_token_consume — קישור הכניסה מוואטסאפ: השוואה ומחיקה באותה פקודה
-- -----------------------------------------------------------------------------
create or replace function public.login_token_consume(p_user_id uuid, p_nonce_hash text)
returns boolean
language sql
set search_path = ''
as $$
  with u as (
    update public.users
       set profile = profile - 'login_token'
     where id = p_user_id
       and deleted_at is null
       and profile -> 'login_token' ->> 'nonce_hash' = p_nonce_hash
    returning 1
  )
  select exists (select 1 from u);
$$;
comment on function public.login_token_consume(uuid, text) is
  'שורף את קישור הכניסה מוואטסאפ פעם אחת בדיוק: true רק לבקשה שמחקה את הגיבוב השמור.';

-- -----------------------------------------------------------------------------
-- הרשאות: service_role בלבד
-- -----------------------------------------------------------------------------
revoke execute on function public.otp_issue(text, text, text, text, text, timestamptz, integer, integer, integer, integer, integer) from public, anon, authenticated;
revoke execute on function public.otp_check(text, text, text, integer)                 from public, anon, authenticated;
revoke execute on function public.wa_identity_link(uuid, text, text)                   from public, anon, authenticated;
revoke execute on function public.link_token_consume(text, text, text, text)           from public, anon, authenticated;
revoke execute on function public.wa_link_attempt(text, boolean, text, integer, integer, integer) from public, anon, authenticated;
revoke execute on function public.login_token_consume(uuid, text)                      from public, anon, authenticated;
grant  execute on function public.otp_issue(text, text, text, text, text, timestamptz, integer, integer, integer, integer, integer) to service_role;
grant  execute on function public.otp_check(text, text, text, integer)                 to service_role;
grant  execute on function public.wa_identity_link(uuid, text, text)                   to service_role;
grant  execute on function public.link_token_consume(text, text, text, text)           to service_role;
grant  execute on function public.wa_link_attempt(text, boolean, text, integer, integer, integer) to service_role;
grant  execute on function public.login_token_consume(uuid, text)                      to service_role;
