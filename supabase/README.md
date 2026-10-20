# supabase/ — מסד הנתונים (Postgres, Supabase Pro, Frankfurt)

הסכמה, האבטחה (RLS) והפונקציות של PLAN §3 / §2.3. כל טבלה תלויה ב-`users` עם `on delete cascade`, כך שמחיקת חשבון = 0 שורות.

## מבנה

| קובץ | מה יש בו |
|---|---|
| `migrations/0001_init.sql` | enums, 18 טבלאות (users, auth_otps, link_tokens, wa_identities, wa_link_attempts, connections, graph_subscriptions, messages, conversation_state, pending_actions, jobs, reminders, usage, subscriptions, payments, audit_log, agents, wa_templates), אינדקסים, טריגר `updated_at` |
| `migrations/0002_rls.sql` | deny-by-default: ביטול הרשאות ל-`anon`/`authenticated`, RLS על כל טבלה, policies "רק השורות שלי" (`auth.uid()`), GRANT ברמת עמודות (בלי טוקנים מוצפנים / raw) |
| `migrations/0003_functions.sql` | `count_trial_message` (ספירה אטומית, 10/750/3000), `user_plan`, `claim_due_jobs` / `finish_job` / `requeue_stale_jobs` (תור משימות עם SKIP LOCKED ו-backoff), `expire_pending_actions`, `purge_old_messages` (90/365 יום), `purge_old_audit_log` (24 חודש), `purge_expired_tokens`, `dispatch_due_jobs` (pg_cron → pg_net → QStash), תזמוני pg_cron |
| `seed.sql` | נתוני דמו (שני משתמשים: דנה — ניסיון עם M365; יוסי — מנוי בסיסי עם Google ותשלום). **לא לפרודקשן.** |
| `tests/rls_isolation.test.sql` | בידוד: לקוח א' לא רואה/משנה את לקוח ב'; `anon` = אפס; עמודות רגישות חסומות |
| `tests/functions.test.sql` | בדיקות עשן לכל פונקציה ב-0003 + cascade במחיקת משתמש |
| `tests/local_supabase_stub.sql` | מדמה את התפקידים ו-`auth.uid()` של Supabase ב-Postgres רגיל |
| `tests/run-local.sh` | מריץ הכול על DB מקומי טרי |
| `config.toml` | קונפיג Supabase CLI (לוקאלי) |

## בדיקה מקומית (בלי Supabase CLI / Docker)

דורש PostgreSQL 15+ מקומי (נבדק על 16):

```bash
supabase/tests/run-local.sh                      # peer auth: psql -U postgres או sudo -u postgres
PSQL="psql postgresql://postgres:postgres@127.0.0.1:5432" supabase/tests/run-local.sh
```

הסקריפט יוצר DB בשם `whatsappbot_test` (נמחק ונוצר מחדש בכל ריצה), מריץ stub → מיגרציות → seed → בדיקות.
הצלחה = השורה האחרונה `SUPABASE LOCAL: ALL TESTS PASSED`. בלי `pg_cron`/`pg_net` מקומיים מודפסים NOTICE בלבד — זה צפוי.

כל קובץ בדיקה הוא טרנזקציה אחת שמסתיימת ב-`rollback` ולא משאיר כלום.

## עם Supabase CLI

```bash
supabase start && supabase db reset               # מריץ מיגרציות + seed.sql
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 -f supabase/tests/rls_isolation.test.sql
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 -f supabase/tests/functions.test.sql
```

## פריסה לפרויקט האמיתי

```bash
supabase link --project-ref <PROJECT_REF>
supabase db push                                   # מיגרציות בלבד (לא seed)
```

## מה דניאל צריך לעשות ידנית

1. ליצור פרויקט Supabase **Pro** באזור **EU Frankfurt** (אי-אפשר לשנות אזור אחר כך). → `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` ב-Vercel.
2. Dashboard → Database → Extensions: להפעיל `pg_cron` ו-`pg_net`, ואז להריץ שוב את בלוק ה-`do $$` האחרון ב-`0003_functions.sql` (או `supabase db push` מחדש) כדי שהתזמונים יירשמו.
3. סודות ב-Vault (SQL Editor, כ-postgres):
   ```sql
   select vault.create_secret('https://<domain>/api/jobs/run', 'jobs_worker_url');
   select vault.create_secret('<QSTASH_TOKEN>', 'qstash_token');
   ```
   בלעדיהם `dispatch_due_jobs` לא תופס משימות (ומזהיר) — כלום לא הולך לאיבוד.
4. לוודא `select * from cron.job;` מציג את 8 המשימות `wabot_*`.
