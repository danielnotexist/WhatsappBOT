-- =============================================================================
-- seed.sql — נתוני דמו לבדיקות מקומיות בלבד (supabase db reset מריץ אוטומטית).
-- אסור להריץ בפרודקשן: טוקנים מזויפים, מיילים example.com, מספרים דמה.
--
-- משתמש A: דנה לוי — עו"ד, בניסיון (נשארו 3 הודעות), M365 מחובר.
-- משתמש B: יוסי כהן — רו"ח, מנוי בסיסי פעיל (HYP), Google מחובר, תשלום אחד.
-- =============================================================================

begin;

-- ---------- users ----------
insert into public.users (id, email, name, business_name, business_type, timezone, morning_time, locale, profile, created_at)
values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'dana@example.com',  'דנה לוי',  'משרד עו"ד לוי',  'law',
   'Asia/Jerusalem', '07:30', 'he-IL',
   '{"pain_points": ["מיילים מלקוחות", "תזכורות לדיונים"], "important_contacts": [{"name": "רונית", "role": "מזכירה"}]}'::jsonb,
   now() - interval '3 days'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'yossi@example.com', 'יוסי כהן', 'כהן רואי חשבון', 'accounting',
   'Asia/Jerusalem', '08:00', 'he-IL',
   '{"pain_points": ["מעקב חשבוניות"], "important_contacts": []}'::jsonb,
   now() - interval '40 days');

-- ---------- link_tokens (שניהם כבר נוצלו) ----------
insert into public.link_tokens (user_id, token, expires_at, used_at, created_at)
values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'DANA-0001', now() - interval '3 days' + interval '15 minutes', now() - interval '3 days' + interval '2 minutes', now() - interval '3 days'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'YOSI-0002', now() - interval '40 days' + interval '15 minutes', now() - interval '40 days' + interval '5 minutes', now() - interval '40 days');

-- ---------- wa_identities ----------
insert into public.wa_identities (id, user_id, phone_e164, wa_name, linked_at, status)
values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '+972501111111', 'Dana Levi', now() - interval '3 days',  'active'),
  ('bbbbbbbb-0000-4000-8000-000000000001', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '+972502222222', 'Yossi Cohen', now() - interval '40 days', 'active');

-- מספר לא מקושר שניסה טוקן שגוי פעמיים
insert into public.wa_link_attempts (phone_e164, attempts, last_attempt_at)
values ('+972503333333', 2, now() - interval '1 hour');

-- ---------- connections (טוקנים מזויפים — "enc:demo:*" לא ניתן לפענוח) ----------
insert into public.connections (id, user_id, provider, account_email, tenant_id, scopes, enc_access, enc_refresh, expires_at, status, consent_type)
values
  ('aaaaaaaa-0000-4000-8000-000000000002', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'microsoft', 'dana@levi-law.example', '11111111-2222-4333-8444-555555555555',
   array['Mail.ReadWrite', 'Mail.Send', 'Calendars.ReadWrite', 'Files.Read', 'offline_access'],
   'enc:demo:access:A', 'enc:demo:refresh:A', now() + interval '50 minutes', 'active', 'admin'),
  ('bbbbbbbb-0000-4000-8000-000000000002', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'google', 'yossi@example.com', null,
   array['https://www.googleapis.com/auth/calendar', 'https://www.googleapis.com/auth/drive.file', 'https://www.googleapis.com/auth/gmail.send'],
   'enc:demo:access:B', 'enc:demo:refresh:B', now() + interval '30 minutes', 'active', 'user');

insert into public.graph_subscriptions (connection_id, subscription_id, resource, expires_at, client_state)
values ('aaaaaaaa-0000-4000-8000-000000000002', 'demo-graph-sub-A', 'me/mailFolders(''inbox'')/messages', now() + interval '5 days', 'demo-client-state-A');

-- ---------- messages ----------
insert into public.messages (id, user_id, wa_message_id, direction, type, text, transcript, model_used, tokens_in, tokens_out, cost_usd, created_at)
values
  -- A
  ('aaaaaaaa-0000-4000-8000-000000000010', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'wamid.demo.A.1', 'in',  'text',  'היי! לקשר את החשבון שלי: DANA-0001', null, null, null, null, null, now() - interval '3 days'),
  ('aaaaaaaa-0000-4000-8000-000000000011', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'wamid.demo.A.2', 'out', 'text',  'ברוכה הבאה דנה! אני רואה רק מה ששולחים לי כאן.', null, null, null, null, null, now() - interval '3 days' + interval '5 seconds'),
  ('aaaaaaaa-0000-4000-8000-000000000012', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'wamid.demo.A.3', 'in',  'audio', null, 'תנסחי תשובה לרונית שאני אהיה בדיון מחר בעשר', null, null, null, null, now() - interval '1 hour'),
  ('aaaaaaaa-0000-4000-8000-000000000013', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'wamid.demo.A.4', 'out', 'button', 'הנה טיוטה לרונית: "היי רונית, מחר אני בדיון מ-10:00..." — לשלוח?', null, 'claude-sonnet-5-5', 1850, 210, 0.0058, now() - interval '59 minutes'),
  -- B
  ('bbbbbbbb-0000-4000-8000-000000000010', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'wamid.demo.B.1', 'in',  'text',  'מה יש לי מחר ביומן?', null, null, null, null, null, now() - interval '2 hours'),
  ('bbbbbbbb-0000-4000-8000-000000000011', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'wamid.demo.B.2', 'out', 'text',  'מחר: 09:00 פגישה עם לקוח, 13:00 הגשת דוח מע"מ.', null, 'claude-haiku-5-5', 900, 80, 0.0013, now() - interval '2 hours' + interval '4 seconds'),
  ('bbbbbbbb-0000-4000-8000-000000000012', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'wamid.demo.B.3', 'in',  'text',  'תזכיר לי מחר ב-12 לשלוח את הדוח', null, null, null, null, null, now() - interval '90 minutes');

-- ---------- conversation_state ----------
insert into public.conversation_state (user_id, summary, last_summarized_msg_id, facts)
values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'דנה עו"ד, רוצה עזרה עם מיילים מלקוחות ותזכורות לדיונים. סיכום בוקר 07:30.',
   'aaaaaaaa-0000-4000-8000-000000000011',
   '[{"text": "רונית היא המזכירה של דנה", "learned_at": "2026-10-17T08:00:00Z"}]'::jsonb),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'יוסי רו"ח, עוקב אחרי חשבוניות ודוחות מע"מ.',
   'bbbbbbbb-0000-4000-8000-000000000011',
   '[{"text": "דוח מע\"מ מוגש ב-15 לחודש", "learned_at": "2026-09-20T10:00:00Z"}]'::jsonb);

-- ---------- pending_actions (A: טיוטת מייל ממתינה לאישור) ----------
insert into public.pending_actions (id, user_id, kind, payload, status, expires_at, created_at)
values
  ('aaaaaaaa-0000-4000-8000-000000000020', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'send_mail',
   '{"to": "ronit@levi-law.example", "subject": "דיון מחר", "body": "היי רונית, מחר אני בדיון מ-10:00. תודה, דנה"}'::jsonb,
   'pending', now() + interval '8 minutes', now() - interval '2 minutes');

-- ---------- jobs + reminders ----------
insert into public.jobs (id, user_id, kind, run_at, payload, status, dedupe_key)
values
  ('aaaaaaaa-0000-4000-8000-000000000030', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'morning_summary', (date_trunc('day', now() at time zone 'Asia/Jerusalem') + interval '1 day 7 hours 30 minutes') at time zone 'Asia/Jerusalem', '{}'::jsonb, 'queued', 'morning_summary:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa:' || to_char(now() + interval '1 day', 'YYYY-MM-DD')),
  ('bbbbbbbb-0000-4000-8000-000000000030', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'reminder',        (date_trunc('day', now() at time zone 'Asia/Jerusalem') + interval '1 day 12 hours') at time zone 'Asia/Jerusalem', '{"reminder_id": "bbbbbbbb-0000-4000-8000-000000000040"}'::jsonb, 'queued', null),
  ('bbbbbbbb-0000-4000-8000-000000000031', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'charge',          now() + interval '20 days', '{"amount_ils": 99}'::jsonb, 'queued', 'charge:bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb:' || to_char(now() + interval '20 days', 'YYYY-MM')),
  ('bbbbbbbb-0000-4000-8000-000000000032', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'reminder',        now() - interval '1 minute', '{"reminder_id": "bbbbbbbb-0000-4000-8000-000000000041"}'::jsonb, 'queued', null);

insert into public.reminders (id, user_id, text, due_at, job_id, status)
values
  ('bbbbbbbb-0000-4000-8000-000000000040', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'לשלוח את דוח המע"מ', (date_trunc('day', now() at time zone 'Asia/Jerusalem') + interval '1 day 12 hours') at time zone 'Asia/Jerusalem', 'bbbbbbbb-0000-4000-8000-000000000030', 'scheduled'),
  ('bbbbbbbb-0000-4000-8000-000000000041', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'להתקשר לבנק', now() - interval '1 minute', 'bbbbbbbb-0000-4000-8000-000000000032', 'scheduled');

-- ---------- usage ----------
-- A (ניסיון): תקופה = יום ההרשמה לפי tz; 7 נספרו, 3 נשארו.
insert into public.usage (user_id, period_start, counted_messages, free_remaining, plan_limit)
values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', ((now() - interval '3 days') at time zone 'Asia/Jerusalem')::date, 7, 3, 10),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', date_trunc('month', now() at time zone 'Asia/Jerusalem')::date, 42, 708, 750);

-- ---------- subscriptions ----------
insert into public.subscriptions (user_id, plan, status, hyp_token_enc, hyp_tokef, hyp_hkid, next_charge_at, started_at)
values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'trial', 'trial', null, null, null, null, null),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'basic', 'active', 'enc:demo:hyp-token:B', '1228', null, now() + interval '20 days', now() - interval '10 days');

-- ---------- payments ----------
insert into public.payments (user_id, hyp_trans_id, amount_ils, ccode, acode, invoice_url, raw, created_at)
values
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'demo-hyp-0000001', 99.00, '0', '0012345', 'https://invoice.example/demo-1',
   '{"Id": "demo-hyp-0000001", "CCode": "0", "Amount": "99", "Order": "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", "demo": true}'::jsonb,
   now() - interval '10 days');

-- ---------- audit_log ----------
insert into public.audit_log (user_id, action, target, reason, approved_by_msg_id, result, created_at)
values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'connect_microsoft', 'dana@levi-law.example', 'הרשמה', null, 'ok', now() - interval '3 days'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'connect_google',    'yossi@example.com',     'הרשמה', null, 'ok', now() - interval '40 days'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'charge',            'demo-hyp-0000001',      'תשלום ראשון — מסלול בסיסי', null, 'ok', now() - interval '10 days'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'create_reminder',   'bbbbbbbb-0000-4000-8000-000000000040', 'בקשת המשתמש', 'wamid.demo.B.3', 'ok', now() - interval '90 minutes');

-- ---------- agents (0006 — B בסיסי: סוכן מותאם אחד, על בסיס התבנית של מנהלת החשבונות) ----------
-- "מנהלת חשבונות" והכינוי "הנהלת חשבונות" שמורים לסוכן המובנה, לכן השם "חשבוניות".
insert into public.agents (user_id, name, role, template, instructions, tools, permissions, enabled)
values
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'חשבוניות', 'custom', 'bookkeeper',
   'לאתר במייל חשבוניות, קבלות ודרישות תשלום, ולהכין העברה לרו״ח ברק. כל העברה — טיוטה לאישור.',
   array['mail.read', 'mail.draft', 'mail.forward'],
   '{"recipients": ["office@barak-cpa.example"], "max_outbound_per_day": 10}'::jsonb, true);

-- ---------- wa_templates (PLAN §5) ----------
insert into public.wa_templates (name, language, category, status, body)
values
  ('morning_summary',       'he', 'utility', 'approved', 'בוקר טוב {{1}}! הסיכום שלך להיום: {{2}}'),
  ('reminder',              'he', 'utility', 'approved', 'תזכורת: {{1}}'),
  ('trial_ended_payment',   'he', 'utility', 'pending',  '10 ההודעות החינמיות נגמרו. להמשך: {{1}}'),
  ('payment_success',       'he', 'utility', 'pending',  'התשלום התקבל — החשבון פעיל. ממשיכים!'),
  ('reconnect_needed',      'he', 'utility', 'pending',  'החיבור ל-{{1}} פג. לחיבור מחדש: {{2}}');

-- ---------- auth_otps (דוגמה לקוד שנוצל) ----------
insert into public.auth_otps (email, code_hash, expires_at, attempts, used_at, created_at)
values ('dana@example.com', 'demo-hash-not-a-real-code', now() - interval '3 days' + interval '10 minutes', 0, now() - interval '3 days' + interval '1 minute', now() - interval '3 days');

commit;
