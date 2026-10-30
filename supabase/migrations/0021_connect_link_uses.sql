-- =============================================================================
-- 0021_connect_link_uses.sql — קישורי החיבור מהשיחה (`t=`) עובדים פעם אחת (סבב האבטחה, אזור C)
--
-- הקישור /api/auth/{microsoft|google}/start?t=… חתום (HMAC) ונושא מזהה משתמש, ספק, תוקף, ייעוד (user/admin) ו-nonce
-- אקראי (lib/ms/connect-link.ts). עד עכשיו אותו קישור עבד שוב ושוב בתוך 30 הדקות.
--   * connect_link_uses     — גיבוב ה-nonce של כל קישור שכבר נפתח. מפתח ראשי: פתיחה שנייה נכשלת.
--   * connect_link_consume() — מכניס את הגיבוב באטומיות (insert … on conflict do nothing): true רק לפתיחה הראשונה.
--                              באותה קריאה נמחקות שורות שתוקף הקישור שלהן עבר לפני יותר מיום (הטבלה לא גדלה).
--
-- אין `alter type ... add value`; אפשר להריץ בטרנזקציה אחת. service_role בלבד.
-- =============================================================================

create table if not exists public.connect_link_uses (
  nonce_hash text primary key,
  user_id    uuid not null references public.users (id) on delete cascade,
  expires_at timestamptz not null,
  used_at    timestamptz not null default now()
);
comment on table public.connect_link_uses is
  'קישורי חיבור מהשיחה שכבר נפתחו (גיבוב sha256 של ה-nonce בלבד). פתיחה שנייה של אותו קישור נדחית.';

create index if not exists connect_link_uses_expires_idx on public.connect_link_uses (expires_at);

alter table public.connect_link_uses enable row level security;
revoke all on public.connect_link_uses from public, anon, authenticated;
grant all on public.connect_link_uses to service_role;

-- -----------------------------------------------------------------------------
-- connect_link_consume — הפתיחה הראשונה בלבד (אטומי), וניקוי שורות ישנות
-- -----------------------------------------------------------------------------
create or replace function public.connect_link_consume(p_nonce_hash text, p_user_id uuid, p_expires_at timestamptz)
returns boolean
language plpgsql
set search_path = ''
as $$
declare
  v_inserted int;
begin
  delete from public.connect_link_uses where expires_at < now() - interval '1 day';
  insert into public.connect_link_uses (nonce_hash, user_id, expires_at)
  values (p_nonce_hash, p_user_id, p_expires_at)
  on conflict (nonce_hash) do nothing;
  get diagnostics v_inserted = row_count;
  return v_inserted = 1;
end;
$$;
comment on function public.connect_link_consume(text, uuid, timestamptz) is
  'שורף קישור חיבור מהשיחה: true רק לפתיחה הראשונה של ה-nonce הזה; פתיחה חוזרת (גם במקביל) מקבלת false.';

revoke execute on function public.connect_link_consume(text, uuid, timestamptz) from public, anon, authenticated;
grant  execute on function public.connect_link_consume(text, uuid, timestamptz) to service_role;
