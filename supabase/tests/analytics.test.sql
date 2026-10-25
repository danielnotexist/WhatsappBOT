-- =============================================================================
-- analytics.test.sql — מיגרציה 0017: page_events / analytics_daily() / analytics_top_pages() / analytics_sources() /
-- analytics_devices() / analytics_funnel() / purge_page_events()
-- טרנזקציה אחת + ROLLBACK. הצלחה = "ANALYTICS: ALL CHECKS PASSED".
-- =============================================================================
\set ON_ERROR_STOP on
\set QUIET on
\pset format unaligned
\pset tuples_only on

begin;

create function pg_temp.check(p_label text, p_ok boolean)
returns void
language plpgsql
as $$
begin
  if p_ok is distinct from true then
    raise exception 'FAILED: %', p_label;
  end if;
  raise notice 'ok - %', p_label;
end;
$$;

create function pg_temp.expect_state(p_label text, p_state text, p_sql text)
returns void
language plpgsql
as $$
begin
  begin
    execute p_sql;
  exception
    when others then
      if sqlstate = p_state then
        raise notice 'ok - % (%)', p_label, p_state;
        return;
      end if;
      raise exception 'FAILED: % — expected %, got % (%)', p_label, p_state, sqlstate, sqlerrm;
  end;
  raise exception 'FAILED: % — expected % but the statement succeeded', p_label, p_state;
end;
$$;

-- a visitor id: 64 hex characters
create function pg_temp.v(p_seed text)
returns text
language sql
as $$ select encode(sha256(convert_to(p_seed, 'UTF8')), 'hex') $$;

insert into public.users (id, email) values ('a1111111-1111-4111-8111-111111111111', 'analytics@example.com');

-- day 1 (2030-03-01): visitor A from a campaign on a phone, three pages, then the signup steps;
-- visitor B from google.com on a desktop, one page; visitor C direct on a desktop, two pages
insert into public.page_events (at, day, visitor, path, utm_source, utm_medium, utm_campaign, device) values
  ('2030-03-01 08:00+02', '2030-03-01', pg_temp.v('A1'), '/', 'facebook', 'paid_social', 'lawyers', 'mobile');
insert into public.page_events (at, day, visitor, path, device) values
  ('2030-03-01 08:01+02', '2030-03-01', pg_temp.v('A1'), '/pricing', 'mobile'),
  ('2030-03-01 08:02+02', '2030-03-01', pg_temp.v('A1'), '/start', 'mobile'),
  ('2030-03-01 09:00+02', '2030-03-01', pg_temp.v('C1'), '/', 'desktop'),
  ('2030-03-01 09:05+02', '2030-03-01', pg_temp.v('C1'), '/pricing', 'desktop');
insert into public.page_events (at, day, visitor, path, referrer_host, device) values
  ('2030-03-01 10:00+02', '2030-03-01', pg_temp.v('B1'), '/', 'www.google.com', 'desktop');
insert into public.page_events (at, day, visitor, path, device, event) values
  ('2030-03-01 08:03+02', '2030-03-01', pg_temp.v('A1'), '/start/email', 'mobile', 'signup_start'),
  ('2030-03-01 08:04+02', '2030-03-01', pg_temp.v('A1'), '/start/email', 'mobile', 'code_sent'),
  ('2030-03-01 08:04+02', '2030-03-01', pg_temp.v('A1'), '/start/email', 'mobile', 'code_sent'),
  ('2030-03-01 08:05+02', '2030-03-01', pg_temp.v('A1'), '/start/code', 'mobile', 'code_ok'),
  ('2030-03-01 09:06+02', '2030-03-01', pg_temp.v('C1'), '/start/email', 'desktop', 'signup_start');
-- a server-side step: no path, the user's hash
insert into public.page_events (at, day, visitor, user_id, event) values
  ('2030-03-01 08:10+02', '2030-03-01', pg_temp.v('user-A'), 'a1111111-1111-4111-8111-111111111111', 'wa_linked');
-- day 3: A again (a new id: the salt changed), direct
insert into public.page_events (at, day, visitor, path, device) values
  ('2030-03-03 12:00+02', '2030-03-03', pg_temp.v('A3'), '/', 'mobile');

-- ---------- daily ----------
select pg_temp.check('daily: every day of the range, also the empty one', (select count(*) from public.analytics_daily('2030-03-01', '2030-03-03')) = 3);
select pg_temp.check('daily: day 1 → 3 visitors, 6 page views (funnel steps are not page views)',
  (select visitors = 3 and views = 6 from public.analytics_daily('2030-03-01', '2030-03-03') where day = '2030-03-01'));
select pg_temp.check('daily: day 2 → zeros', (select visitors = 0 and views = 0 from public.analytics_daily('2030-03-01', '2030-03-03') where day = '2030-03-02'));
select pg_temp.check('daily: day 3 → one visitor', (select visitors = 1 and views = 1 from public.analytics_daily('2030-03-01', '2030-03-03') where day = '2030-03-03'));

-- ---------- top pages ----------
select pg_temp.check('top pages: "/" first with 4 views by 4 visitor-days',
  (select path = '/' and views = 4 and visitors = 4 from public.analytics_top_pages('2030-03-01', '2030-03-03', 10) limit 1));
select pg_temp.check('top pages: /pricing second with 2', (select path = '/pricing' and views = 2 from public.analytics_top_pages('2030-03-01', '2030-03-03', 10) offset 1 limit 1));
select pg_temp.check('top pages: the limit', (select count(*) from public.analytics_top_pages('2030-03-01', '2030-03-03', 2)) = 2);
select pg_temp.check('top pages: no funnel-step rows', not exists (select 1 from public.analytics_top_pages('2030-03-01', '2030-03-03', 10) where path = '/start/code'));

-- ---------- sources ----------
select pg_temp.check('sources: the campaign by utm', (select visitors = 1 and kind = 'utm' from public.analytics_sources('2030-03-01', '2030-03-03', 8) where source = 'facebook'));
select pg_temp.check('sources: google.com as a referrer', (select visitors = 1 and kind = 'referrer' from public.analytics_sources('2030-03-01', '2030-03-03', 8) where source = 'www.google.com'));
select pg_temp.check('sources: direct = no source on any page of the visit (C on day 1, A on day 3)',
  (select visitors = 2 and kind = 'direct' from public.analytics_sources('2030-03-01', '2030-03-03', 8) where source is null));
select pg_temp.check('sources: the later pages of a campaign visit are not "direct"', (select sum(visitors) from public.analytics_sources('2030-03-01', '2030-03-03', 8)) = 4);

-- ---------- devices ----------
select pg_temp.check('devices: 2 mobile visitor-days, 2 desktop',
  (select bool_and(case device when 'mobile' then visitors = 2 when 'desktop' then visitors = 2 end) and count(*) = 2 from public.analytics_devices('2030-03-01', '2030-03-03')));

-- ---------- funnel ----------
select pg_temp.check('funnel: seven steps in order', (select array_agg(step order by ord) from public.analytics_funnel('2030-03-01', '2030-03-03'))
  = array['visit', 'signup_start', 'code_sent', 'code_ok', 'wa_linked', 'mail_connected', 'paid']);
select pg_temp.check('funnel: 4 visits, 2 started, 1 code sent (twice, counted once), 1 ok, 1 linked, 0 mail, 0 paid',
  (select array_agg(actors order by ord) from public.analytics_funnel('2030-03-01', '2030-03-03')) = array[4, 2, 1, 1, 1, 0, 0]);
select pg_temp.check('funnel: the range filters', (select array_agg(actors order by ord) from public.analytics_funnel('2030-03-03', '2030-03-03')) = array[1, 0, 0, 0, 0, 0, 0]);

-- ---------- the range ----------
select pg_temp.expect_state('a reversed range is refused', '22023', $sql$select * from public.analytics_daily('2030-03-03', '2030-03-01')$sql$);
select pg_temp.expect_state('more than a year is refused', '22023', $sql$select * from public.analytics_funnel('2030-01-01', '2031-06-01')$sql$);

-- ---------- the table's rules ----------
select pg_temp.expect_state('a visitor id must be a sha256 hex', '23514',
  $sql$insert into public.page_events (visitor, path) values ('203.0.113.7', '/')$sql$);
select pg_temp.expect_state('unknown event rejected', '23514',
  $sql$insert into public.page_events (visitor, path, event) values (pg_temp.v('x'), '/', 'purchase')$sql$);
select pg_temp.expect_state('unknown device rejected', '23514',
  $sql$insert into public.page_events (visitor, path, device) values (pg_temp.v('x'), '/', 'fridge')$sql$);
select pg_temp.expect_state('a path starts with /', '23514',
  $sql$insert into public.page_events (visitor, path) values (pg_temp.v('x'), 'https://evil.example/')$sql$);
select pg_temp.expect_state('a row is a page view or a step', '23514',
  $sql$insert into public.page_events (visitor) values (pg_temp.v('x'))$sql$);
select pg_temp.expect_state('a long utm value rejected', '23514',
  $sql$insert into public.page_events (visitor, path, utm_source) values (pg_temp.v('x'), '/', repeat('a', 121))$sql$);
select pg_temp.check('no column for an IP or a User-Agent',
  not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'page_events' and column_name in ('ip', 'user_agent', 'ua')));
with r as (insert into public.page_events (visitor, path) values (pg_temp.v('today'), '/') returning day)
select pg_temp.check('day defaults to today in Israel', (select day = (now() at time zone 'Asia/Jerusalem')::date from r));

-- ---------- deleting the user keeps the anonymous row, without the link ----------
delete from public.users where id = 'a1111111-1111-4111-8111-111111111111';
select pg_temp.check('user deleted → user_id null, the step still counted',
  (select user_id is null from public.page_events where visitor = pg_temp.v('user-A'))
  and (select actors from public.analytics_funnel('2030-03-01', '2030-03-01') where step = 'wa_linked') = 1);

-- ---------- purge after 13 months ----------
insert into public.page_events (at, day, visitor, path) values (now() - interval '14 months', '2020-01-01', pg_temp.v('old'), '/');
insert into public.page_events (at, day, visitor, path) values (now() - interval '12 months', '2020-01-02', pg_temp.v('recent'), '/');
select pg_temp.check('purge_page_events removes rows older than 13 months', public.purge_page_events() >= 1);
select pg_temp.check('… the 14-month row is gone, the 12-month row stays',
  not exists (select 1 from public.page_events where visitor = pg_temp.v('old'))
  and exists (select 1 from public.page_events where visitor = pg_temp.v('recent')));

-- ---------- privileges ----------
select pg_temp.check('RLS on, anon / authenticated have no table privileges',
  (select relrowsecurity from pg_class where oid = 'public.page_events'::regclass)
  and not has_table_privilege('anon', 'public.page_events', 'select')
  and not has_table_privilege('anon', 'public.page_events', 'insert')
  and not has_table_privilege('authenticated', 'public.page_events', 'select')
  and not has_table_privilege('authenticated', 'public.page_events', 'insert'));
select pg_temp.check('service_role can write and read', has_table_privilege('service_role', 'public.page_events', 'insert') and has_table_privilege('service_role', 'public.page_events', 'select'));
select pg_temp.check('the report functions are service_role only',
  not has_function_privilege('authenticated', 'public.analytics_daily(date, date)', 'execute')
  and not has_function_privilege('anon', 'public.analytics_top_pages(date, date, integer)', 'execute')
  and not has_function_privilege('authenticated', 'public.analytics_sources(date, date, integer)', 'execute')
  and not has_function_privilege('anon', 'public.analytics_devices(date, date)', 'execute')
  and not has_function_privilege('authenticated', 'public.analytics_funnel(date, date)', 'execute')
  and not has_function_privilege('anon', 'public.purge_page_events(interval)', 'execute')
  and has_function_privilege('service_role', 'public.analytics_funnel(date, date)', 'execute'));

select 'ANALYTICS: ALL CHECKS PASSED';
rollback;
