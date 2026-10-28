# יומן התקדמות

> מתעדכן בכל commit. מה נעשה · איך בודקים · מה דניאל צריך לעשות ידנית.
> הכללים לסוכנים: `AGENTS.md`. התוכנית: `docs/PLAN.md`.

## החלטות שהתקבלו אחרי התוכנית

- מחירים: **99 ₪ (עד 750 הודעות/חודש)** · **299 ₪ (fair use)**.
- בונים במקביל לבדיקה המשפטית של Meta §4.7 (`docs/legal/meta-ai-clause-memo.md`).
- **שם המוצר: עלזה** (Alze) — "עליזה" + "על זה". מקור יחיד: `lib/brand.ts`. עלזה מדברת על עצמה בלשון נקבה.
- **כיוון עיצוב: "לילה ירוק"** — כהה וקולנועי, שלנו (לא העתק של readywhen). שלושת הכיוונים ב-`design/directions/` נשארים כארכיון.
- **הרשמה 1:1 לפי הצילומים של דניאל** (סדר המסכים והאינטראקציות; טקסטים ועיצוב שלנו).
- **קמע: דוכיפת תלת-ממדית רכה** — עד שתיווצר (OpenRouter, עד $3), placeholder SVG.
- **מודלים (נעול):** router = Haiku 5.5 adaptive/low (רק הודעות פשוטות), חזק = Sonnet 5.5 adaptive/low — `docs/hebrew-eval-report.md`.
- טון: מקצועי וחם, בלי בדיחות. פנייה ניטרלית (בלי "שלח/י").
- **קריאת Gmail בלי CASA ל-100 המשתמשים הראשונים** (דניאל, 21.10.2026): `gmail.readonly` עכשיו, תחת תקרת המשתמשים של אפליקציה לא מאומתת; CASA או ספק מתווך (Composio) בהמשך. משנה את PLAN §8 סיכון 5 ("שלב 1 בלי קריאת Gmail; CASA בשלב 6") — הנוסח ב-PLAN עוד לא עודכן (מסמך מאושר; ראו "דרוש מדניאל"). פירוט: `docs/progress/gmail-read.md`, `docs/google-setup.md` §6.
- **תשלום מתוך וואטסאפ (21.10.2026):** שדרוג / ניסיון חוזר / חידוש בלחיצה אחת עם הטוקן השמור — רק אחרי לחיצה על כפתור מהמספר המקושר, תוך 10 דקות, עם הסכום (כולל מע״מ) מוצג מראש. חיוב חודשי שנכשל: תזכורות בימים 1/3/5 עם `[ניסיון חוזר] [עדכון כרטיס]`, השהיה אחרי יום 7 (במקום past_due אחרי יום 5 ב-PLAN §4). ביטול ומעבר לבסיסי מהשיחה, בתוקף מסוף התקופה. המסמך נקרא בשיחה **"קבלה"** (לא "חשבונית"). פרטים: `docs/progress/hyp.md`, `docs/hyp-setup.md`.

- **חלוקה חדשה בין המסלולים (דניאל, 23.10.2026):** בסיסי = חשבון אחד (Google **או** Microsoft) עם מייל, יומן (Meet / Teams), קריאת קבצים, תזכורות, סיכום בוקר, הודעות קוליות וסוכן אחד; פרו = שניהם יחד + Google Tasks / To Do, SharePoint, כל ה-Drive, שמירת מסמכים, שלושת המובנים ועד 3 סוכנים, ובקרוב סיכומי פגישות, התראות יזומות ומערכות העסק. הניסיון = בסיסי בחיבורים. מקור אמת: `entitlements(plan)` ב-`lib/billing/plans.ts`. פירוט ביומן למטה ("מסלולים: בסיסי מול פרו") וב-PLAN §4.
- **התראות יזומות (דניאל, 23.10.2026):** בתוך סיכום הבוקר ("דברים שכדאי לא לפספס"), ובנוסף עד 2 התראות דחופות ביום למשתמש, 08:00–20:00, לא בשבת ובחג. פרו בלבד. ממומש — ראו ביומן "התראות יזומות ואזהרות פישינג".
- **תבניות מחוץ לחלון 24 השעות (דניאל אישר, 23.10.2026):** `proactive_alert` (התראה דחופה) ו-`meeting_summary_ready` (סיכום פגישה), UTILITY. דניאל רושם אותן ב-Meta בעצמו (`registerTemplates({ dryRun: false })`). עד האישור — התראה נדחית לסיכום הבוקר כמו קודם.
- **סיכומי פגישות (פרו, 23.10.2026):** Teams ו-Google Meet מהתמליל שהפלטפורמה שמרה (בלי בוט בפגישה); Zoom "בקרוב" (דורש אפליקציה ב-Zoom Marketplace שעוברת בדיקה). ממומש — ראו ביומן "סיכומי פגישות Teams ו-Google Meet".

## דרוש מדניאל

| # | מה | איפה | למה |
|---|---|---|---|
| 1 | לאשר את מראה ההרשמה (צילומים) | `design/signup-screens/` | נקודת ביקורת לפני ליטוש דף הנחיתה, הכניסה והאזור האישי |
| 2 | `OPENROUTER_API_KEY` (עד $3) | — | יצירת הדוכיפת התלת-ממדית (20 וריאציות → בחירה → 4 פוזות) |
| 3 | **להחליף את מפתח Anthropic** (נחשף בצ'אט) | console.anthropic.com | הריצה המשלימה הסתיימה ($0.84) |
| 3א | לרכוש דומיין (alze.ai — "כנראה פנוי", לאמת) | `docs/naming.md` | `BRAND.domain`, Resend, תבניות Meta |
| 4 | כל משתני הסביבה של האתר | `.env.example` | האתר עולה בלי, אבל כל אינטגרציה אמיתית דורשת |
| 5 | פורטלים (Meta, Entra, Google Cloud, HYP, Supabase, Vercel, Upstash, Resend) | `README.md` → "מה דניאל צריך לעשות ידנית" | לפי PLAN §9 |
| 6 | לאשר עדכון PLAN §8 סיכון 5 ושורה 56 לפי ההחלטה על קריאת Gmail (21.10) | `docs/PLAN.md` | PLAN עדיין אומר "קריאת Gmail רק אחרי CASA" |
| 7 | קריאת Gmail: Publish app ב-Google, מיגרציה 0008 לפני הפריסה, משתני התקרה ב-Vercel, להגיש אימות ל-scopes הרגישים לפני ~80 משתמשים | `docs/progress/gmail-read.md` → "מה דניאל עושה ידנית" | בלי Publish — ההרשאה פגה כל 7 ימים; עד אימות הרגישים כל חיבור Google נספר בתקרה |
| 8 | HYP: שני מסופים (בדיקה + אמיתי), טוקנים, חיוב טוקן בלי CVV, J2, ת״ז לא חובה, HYP Invoice; הגדרות פורטל; `HYP_*` | `docs/hyp-setup.md` §1–3 | תשלום ראשון, חיוב חודשי, שדרוג/חידוש בלחיצה וקבלות בשיחה |
| 9 | AI חי בהדגמה: מיגרציה 0009 ב-Supabase, ואז ב-Vercel `LIVE_AI=1` + `ANTHROPIC_API_KEY` + `OPENROUTER_API_KEY` כמשתני **Sensitive** (התקרות: `AI_DAILY_BUDGET_USD=3`, `DEMO_USER_DAILY_MESSAGES=60` הן ברירת המחדל) | `docs/deploy.md` §9 | הצ'אט באתר (`/demo/chat`) עונה עם המודל והתמלול האמיתיים |
| 10 | **להחליף את מפתח OpenRouter** (נשלח בצ'אט) בסוף הבדיקות, ולהכניס את החדש ישירות ב-Vercel | openrouter.ai → Keys | המפתח נחשף בשיחה |
| 12 | שירותים בכל חיבור (23.10): ב-GCP להפעיל **Google Tasks API** ולהוסיף את `tasks` ב-Data access (לא את `drive.readonly`); ב-Entra להוסיף **Tasks.ReadWrite** ו-**Sites.Read.All** ל-API permissions; `GOOGLE_DRIVE_READ_ENABLED` ב-Vercel (ריק = פעיל) | `docs/google-setup.md` §10, `docs/microsoft-setup.md` §2 | בלי Tasks API, Google Tasks עונה בשגיאה; בלי הרישום ב-Entra מנהלי IT לא יראו את ההרשאות החדשות ברישום |
| 11 | צ'אט התמיכה באתר: מיגרציה `0011_support_tickets.sql` ב-Supabase, `SUPPORT_EMAIL` ב-Vercel, ולאשר את הנוסח "נחזור אליך במייל תוך יום עסקים" ואת שמירת הפניות אחרי מחיקת חשבון (לבדיקת עו"ד) | `docs/deploy.md` §10, `docs/copy/support-chat.md` | בלי המיגרציה פנייה לא נשמרת; בלי `SUPPORT_EMAIL` היא לא נשלחת במייל |
| 12 | שדרוג מהאתר: מיגרציה `0012_billing_web_upgrade.sql` ב-Supabase **לפני** פריסת הקוד | `supabase/migrations/0012_billing_web_upgrade.sql`, `docs/hyp-setup.md` §0 | בלי המיגרציה לחיצה על "לשדרג עכשיו" נכשלת לפני כל פנייה ל-HYP (אין חיוב), והדף מציג "לא הצלחנו להשלים את השדרוג כרגע" |
| 13 | מסלולים (23.10): לאשר את שתי ההחלטות - הניסיון כמו בסיסי בחיבורים, ומי שחיבר שני חשבונות לפני החלוקה ממשיך עם האחרון שחובר והשני מושהה (בלי ניתוק). ולהחליט אם להחזיר לרשימות "היסטוריה 90/365 יום" ו"עדיפות למודל" (ירדו כי לא ממומשים) | `docs/PLAN.md` §4 | הרשימות באתר, בדף התשלום ובצ'אט התמיכה נבנות מ-`lib/billing/plans.ts` |
| 14 | התראות יזומות (23.10): מיגרציה `0013_proactive_alerts.sql` ב-Supabase **לפני** פריסת הקוד (בלעדיה סיכום הבוקר של משתמשי פרו מדלג על הסעיף, וסריקות לא נוצרות). התבנית `proactive_alert` אושרה ונבנתה — לרשום אותה ב-Meta (שורה 15) | `supabase/migrations/0013_proactive_alerts.sql`, `docs/copy/wa-templates.md` | עד שהתבנית מאושרת, התראה מחוץ לחלון נדחית לסיכום הבוקר הבא |
| 15 | **סיכומי פגישות + תבניות (23.10):** (א) מיגרציה `0014_meeting_summaries.sql` ב-Supabase **לפני** פריסת הקוד — בלי בלוק ה-pg_cron שבסוף הקובץ, ואותו מריצים בקידום לייצור (כמו ב-0013); (ב) ב-Entra להוסיף **OnlineMeetings.Read** ו-**OnlineMeetingTranscript.Read.All** (delegated) ל-API permissions, ול-tenant של דניאל גם Grant admin consent; (ג) לרשום ב-Meta את `proactive_alert` ו-`meeting_summary_ready` (`registerTemplates({ wabaId, accessToken, appUrl, dryRun: false, names: ["proactive_alert", "meeting_summary_ready"] })`); (ד) לבדוק בפגישת Teams אמיתית עם "Start transcription" ובפגישת Meet עם "תמליל" (Workspace) | `docs/microsoft-setup.md` §5, `docs/google-setup.md` §11, `docs/copy/wa-templates.md` §11–12 | בלי המיגרציה משימות `meeting_*` נכשלות בהכנסה ל-jobs; בלי ההרשאה ב-Entra מנהלי IT לא יראו אותה ברישום; בלי התבניות סיכום מחוץ לחלון לא נשלח (נשמר עד שמבקשים) |
| 16 | **פאנל הניהול (24.10):** (א) מיגרציה `0015_admin.sql` ב-Supabase **לפני** פריסת הקוד — היא מוסיפה בלבד (עמודות, טבלאות, פונקציות); בלוק ה-pg_cron שבסוף הקובץ (ניקוי שיחות האתר אחרי 180 יום והתקלות אחרי 90 יום) מריצים בקידום לייצור, כמו ב-0013 ו-0014; (ב) ב-Vercel: `ADMIN_EMAILS` (ריק = danielnotexist@gmail.com), ובהדגמה `LIVE_SUPPORT_MAIL=1` + `RESEND_API_KEY` + `MAIL_FROM` בדומיין מאומת — בלי מייל אמיתי קוד הכניסה לפאנל לא נשלח והפאנל נשאר סגור; (ג) עו"ד: שמירת שיחות הצ'אט באתר 180 יום, עוגיית מקור ההגעה, והשורות החדשות במדיניות הפרטיות | `supabase/migrations/0015_admin.sql`, `.env.example`, `docs/legal/privacy-policy-he.md` | בלי המיגרציה הפאנל לא נטען, תשובה עם כלים בוואטסאפ לא נשמרת (העמודה `messages.tools`), ומחיקת חשבון נכשלת כמו היום (`audit_log.user_id`) |
| 17 | **התראות לבעלים (24.10):** (א) מיגרציה `0016_owner_alerts.sql` ב-Supabase **לפני** פריסת הקוד, בלי בלוק ה-pg_cron שבסוף; את הבלוק מריצים בקידום לייצור, כמו ב-0013 עד 0015; (ב) לבדוק בטאב "התראות" ב-`/admin` ש"שליחת מייל בדיקה" מגיעה; (ג) בהמשך: לרשום את `owner_alert` ב-Meta, ורק אחרי האישור `OWNER_ALERT_WA=1` + `ADMIN_PHONE` ב-Vercel | `supabase/migrations/0016_owner_alerts.sql`, `docs/copy/wa-templates.md` §13 | בלי המיגרציה ההתראות לא נשלחות (נרשם ב"תקלות"); בלי בלוק ה-cron בייצור אין מייל מרוכז בבוקר ואין בדיקת קפיצה בתקלות |
| 18 | **מסלול שנתי וחבר מביא חבר (25.10):** (א) מיגרציה `0018_annual_referrals.sql` ב-Supabase **לפני** פריסת הקוד - מוסיפה בלבד, בלי `alter type ... add value` ובלי בלוק pg_cron (אפשר להריץ את כולה בטרנזקציה אחת); (ב) לרשום ב-Meta את 6 התבניות החדשות: `payment_success_annual`, `payment_failed_annual`, `card_update_needed_annual`, `account_paused_annual`, `payment_receipt_annual`, `referral_reward`; (ג) עו"ד: ביטול שנתי בלי החזר מול סעיף 13ד לחוק הגנת הצרכן, ניסוח "חבר מביא חבר" ועוגיית ההפניה (פריטים 7-8 בתנאי השימוש, פריט 10 במדיניות הפרטיות) | `supabase/migrations/0018_annual_referrals.sql`, `docs/copy/wa-templates.md`, `docs/hyp-setup.md` §4א | בלי המיגרציה כל קריאה וכתיבה של מנוי נכשלת (העמודה `billing_cycle` חסרה) - לכן לפני הקוד; בלי התבניות, הודעה למנוי שנתי מחוץ לחלון 24 השעות (חיוב שנכשל, קבלה, חודש חינם) לא נשלחת (נרשם בלוג, החיוב עצמו לא נפגע) |
| 12 | **בדיקה משפטית של הנחיות המותג של Google ו-Microsoft** (וגם monday.com, Priority, מורנינג, iCount) לפני שהחיבורים בדף הנחיתה עולים לפרודקשן | `lib/integrations/catalogue.ts`, `components/brand/integrations/icons.tsx` | סמלי המוצרים הם סימני מסחר: מותר רק לציין "עובדת עם", בגודל, במרווח ובצבעים המקוריים |

## יומן

### 2026-10-20 — שלב א' 1: תשתית Next.js מאומתת

**מה נעשה**
- `pnpm lint && pnpm typecheck && pnpm test && pnpm build` עוברים (Next 16.4, React 19, Tailwind 4, Vitest 5).
- תוקן טסט לא יציב ב-`lib/crypto.test.ts` (טקסט של תו אחד יכול להופיע באקראי ב-base64).
- אומת: `app/layout.tsx` עם `lang="he" dir="rtl"`, פונטים עבריים דרך `next/font` (`lib/fonts.ts`: Frank Ruhl Libre + Assistant, subsets hebrew+latin, self-host).
- `proxy.ts` (התחליף של middleware ב-Next 16) מוסיף כותרות אבטחה; `proxy.test.ts` מוודא כל כותרת, CSP במצב report-only ו-matcher שמדלג על נכסים סטטיים. ב-build מופיע `ƒ Proxy (Middleware)`.
- `README.md` (עברית) עודכן; `AGENTS.md` קוצר לכללי העבודה בריפו.

**איך בודקים**
```bash
pnpm install && pnpm lint && pnpm typecheck && pnpm test && pnpm build
curl -sI http://localhost:3000/ | grep -i -E "content-security|x-frame"   # אחרי pnpm dev
```

### 2026-10-20 — שלב א' 2: בדיקת העברית (אבן דרך 0) מאומתת

**מה נעשה**
- הדאטהסט `scripts/hebrew-eval/dataset/messages.json` אומת: בדיוק 100 פריטים, מזהים ייחודיים, כל שדה בסכמה (persona/category/intent/complexity/must_do...).
- `npm run typecheck` עובר; `npm run pipeline -- --dry-run` מפיק `results/<run>/` (jsonl לכל מודל, scores.json, report.md בעברית) בלי שום קריאת API.
- תוקן: הרובריקה `dataset/rubric.md` לא זוהתה (הממד נקרא בה `hebrew_naturalness`, הקוד חיפש `hebrew`) — נוסף alias; הדוח מציג עכשיו "רובריקה: rubric.md".
- `GOOGLE_API_KEY` מתקבל כשם חלופי ל-`GEMINI_API_KEY`.
- מזהי מודלים ומחירי Anthropic אומתו מול תיעוד ה-API (skill `claude-api`, 20.10.2026): `claude-haiku-5-5` $0.10/$0.50 (thinking off מותר רק ב-effort ≤ high — כך מוגדר), `claude-sonnet-5-5` $2/$10 (thinking `adaptive`; `disabled` נדחה ב-400; `tool_choice` כפוי נדחה — הקוד תמיד `auto` + `strict`). מחירי Gemini/GPT נשארו placeholders לאימות.

**איך בודקים**
```bash
cd scripts/hebrew-eval && npm install && npm run typecheck && npm run pipeline -- --dry-run
```
ריצה אמיתית (אחרי מפתחות ב-`.env`): `npm run pipeline` — עלות משוערת $10–15, רובה השופט.

### 2026-10-20 — שלב א' 3: מסד הנתונים מאומת על Postgres מקומי

**מה נעשה**
- `supabase/tests/run-local.sh`: DB טרי → stub של Supabase → מיגרציות 0001–0003 → seed → שתי הבדיקות. עובר: `SUPABASE LOCAL: ALL TESTS PASSED`.
- תוקנו 3 כשלים ב-`functions.test.sql`: (א) `min(uuid)` לא קיים ב-Postgres; (ב) בדיקות ששילבו קריאה לפונקציה ו-subquery באותו ביטוי — Postgres מחשב את ה-subquery (InitPlan) לפני הפונקציה, פוצלו לשני statements; (ג) הבדיקה הניחה DB ריק אבל `seed.sql` נטען לפניה — נוסף ניקוי בתוך הטרנזקציה (rollback בסוף).
- `supabase/README.md` (עברית): מבנה, הרצה מקומית, CLI, פריסה, ומה דניאל מגדיר בפורטל (pg_cron, pg_net, Vault).

**איך בודקים**
```bash
supabase/tests/run-local.sh
```

### 2026-10-20 — שלב א' 4: כיוון עיצוב שלישי + צילומי מסך

**מה נעשה**
- `design/directions/03-warm-clinic.html` — "קליניקה חמה" לפי PLAN §10: אפור חם + טורקיז עמוק + אקסנט אלמוגי, Karantina לכותרת הראשית + Heebo לגוף, מעוגל וידידותי, RTL, mobile-first, הדגמת שיחה מונפשת (כולל הודעה קולית מתומללת וכפתורי שלח/ערוך/בטל), fallback ל-reduced-motion, מצב כהה.
- `design/directions/screenshot.mjs` — מצלם את שלושת הכיוונים ב-375 ו-1280 (בהיר + כהה) עם Playwright ובודק גלילה אופקית. תוקנה גלילה אופקית בנייד בכיוון 02 (grid של סקשן הפרטיות).
- `design/directions/README.md` — פסקה לכל כיוון, יתרונות/חסרונות, קהלים, טבלת עזר לבחירה.

**איך בודקים**
```bash
node design/directions/screenshot.mjs        # דורש Playwright + Chromium (PLAYWRIGHT_PKG / PLAYWRIGHT_BROWSERS_PATH)
```

### 2026-10-20 — שלב א' 5: טקסטים של הבוט (docs/copy)

**מה נעשה**
- `docs/copy/bot-copy.md` הושלם: סעיפים 7 (`meta.*` — יכולות, מחירים, מה נספר, איזה מודל (בכנות), פרטיות, עצירה/השהיה/חידוש, מחיקת חשבון עם אישור, תמיכה, small talk, פוגענות) ו-8 (`safe.*` — הוראות בתוך מיילים/קבצים, מייל חשוד, בקשה לעקוף אישור, הבהרות לעמימות ולפרט חסר, שתי כוונות, ייעוץ מקצועי, "לא רואה שיחות אחרות", בקשת system prompt). סה"כ ~130 מחרוזות עם id.
- `docs/copy/wa-templates.md`: 7 תבניות UTILITY בעברית (`morning_summary`, `reminder`, `trial_ended_payment`, `payment_success`, `payment_failed`, `reconnect_needed`, `plan_limit_reached`) עם JSON מדויק ל-Create Template API (language `he`, examples, כפתורי URL/Quick reply) ומבנה ה-Send API.
- `docs/copy/conversation-flows.md`: 6 תמלילים (הרשמה+היכרות, סיכום בוקר→טיוטה→עריכה→שליחה, הקלטה→הזזת פגישה→התנגשות, קובץ→שיתוף, סוף ניסיון→תשלום→המשך, injection+עמימות+שתי כוונות).
- `docs/copy/style-guide.md`: עמוד אחד — קול, פנייה ניטרלית (בלי "שלח/י"), RTL, מספרים/תאריכים, כפתורים, אנגלית, כנות, מילון.

**דרוש מדניאל:** להחליף `{{שם}}` ו-`APP_DOMAIN` ב-JSON של התבניות לפני רישון ב-Meta.

### 2026-10-20 — אבן דרך 0: הריצה האמיתית (Anthropic בלבד)

**מה נעשה**
- הורצה בדיקת העברית האמיתית עם המפתח הזמני של דניאל: Haiku 5.5 + Sonnet 5.5 על 100 הודעות, Opus 5.5 על 20, שופט Sonnet 5.5. הדוח: `docs/hebrew-eval-report.md` (העתק של `results/m0-20261020/report.md` + הסתייגויות ופרשנות). עלות בפועל $3.02 (תקרה $3.00; חריגה של $0.02 ממקביליות).
- תשתית הבדיקה שופרה תוך כדי: `--budget` (תקרת הוצאה עם הערכה מראש + עצירה קשה, `spend.json` משותף ל-eval/judge), `--ids` (תת-קבוצה), `--max-rounds` (עד 4 סבבי כלים — הריצה הראשונה אפשרה סבב אחד וחתכה את Sonnet/Opus), `--redo-truncated`, המשך (resume) לשופט, מיזוג `run.json` בין ריצות, `--models` לשופט, קריאת JSONL סלחנית.
- **מסקנה ביניים:** מודל חזק = Sonnet 5.5 (עברית 4.03, בטיחות 4.88, $0.0076/הודעה). Router עדיין לא נעול — Haiku עם thinking-off מדליף אנגלית (21/100); לבדוק עם adaptive+low (~$0.5) לפני החלטה. Opus לא מועמד.
- Gemini / OpenAI: השורות מוכנות ב-`models.json`, ממתינות למפתחות.

**דרוש מדניאל:** אישור לריצה משלימה (~$1) + החלטה על מפתחות Gemini/OpenAI (ראו סוף הדוח).

### 2026-10-20 — שלב א' 6: מסמכים משפטיים (טיוטות לעו"ד)

**מה נעשה** — `docs/legal/`, כולם מסומנים "טיוטה לבדיקת עו"ד — אינו ייעוץ משפטי", עם מקורות ורשימת "לא אומת" בסוף:
- `meta-ai-clause-memo.md` — §4.7 במלואו (נשלף מהאתר של Meta), ציר זמן (אוקטובר 2025 → 15.1.2026 → חריגים EEA/ברזיל/טורקיה), המיקום שלנו, 3 שאלות לעו"ד, תוכנית B (מספר לכל עסק ב-Embedded Signup), טיוטת מייל באנגלית ל-Meta/פרטנר.
- `privacy-policy-he.md` — הודעה לפי סעיף 11 (תיקון 13), קטגוריות מידע, 90 יום, טבלת ספקי משנה עם מדינה ובסיס העברה, no-training, זכויות, אירוע אבטחה.
- `terms-of-service-he.md` — השירות, אחריות על אישורים, מגבלות AI, 10 הודעות, 99/750 ו-299 fair-use, מע"מ, חיוב חוזר HYP, ביטול, סעיף הסכמה מפורשת לפי Microsoft APIs §3(c), תקרת אחריות, דין ישראלי.
- `dpa-checklist-he.md` — 17 בקרות של תקנות אבטחת מידע (רמה בינונית) מול ה-stack, סטטוס ומה לכתוב.
- `oauth-consent-screen-he.md` — טקסט גילוי לפני OAuth ל-Microsoft ול-Google (scopes, Limited Use, ניתוק).

**דרוש מדניאל:** להעביר לעו"ד; להחליט על תוכנית A/B מול Meta; לשלוח את המייל ל-Meta/פרטנר.

### 2026-10-20 — שלב ב' 1: אבן דרך 1 — backend של הרשמה, קישור ואזור אישי

**מה נעשה**
- **OTP במייל:** `POST /api/auth/otp/send` ו-`/verify` + Server Actions לטפסים. 6 ספרות, 10 דקות, hash בלבד ב-DB (HMAC עם מפתח שנגזר מ-`TOKEN_ENC_KEY` ב-HKDF), 5 ניסיונות, 60 שניות בין שליחות, 5 קודים לשעה למייל, הגבלת IP. תשובות אחידות (אין חשיפת קיום חשבון). מיילר מאחורי ממשק: Resend (`lib/mail/resend.ts`, קריאת HTTPS אחת, מייל RTL בעברית) או קונסול.
- **Session:** עוגייה חתומה (`wb_session`, httpOnly, lax, 30 יום) — `lib/auth/session.ts`.
- **שכבת נתונים:** ממשק `Db` עם מימוש Supabase (service-role, עמודות מפורשות — בלי טוקנים מוצפנים) ומימוש בזיכרון. `DATA_MODE=memory` לפיתוח ובדיקות; ב-production חובה Supabase ואחרת שגיאה בעברית עם שמות המשתנים.
- **קישור וואטסאפ:** טוקן `XXXX-XXXX` (בלי 0/O/1/I), 15 דקות, חד-פעמי, שימוש חוזר בטוקן טרי ברענון; `wa.me/<WA_PUBLIC_NUMBER>?text=היי! לקשר את החשבון שלי: …`; `extractLinkToken` לצד הבוט. משתנה סביבה חדש: `WA_PUBLIC_NUMBER`.
- **דפים (UI זמני):** `/start` → `/start/code` → `/start/connect` (כפתורי M365/Google מושבתים עד אבנ"ד 4/6, דילוג) → `/start/link` → `/account` (חיבורים + ניתוק, מספרים + ניתוק, מנוי + ביטול, מחיקת חשבון עם מילת אישור "מחיקה", יציאה). עם Cache Components: קריאות cookies/searchParams בתוך `<Suspense>`.
- **בדיקות:** 74 (OTP, session, link token, MemoryDb, Resend עם fetch מדומה, rate limit, account service, route handlers עם `next/headers` מדומה).

**איך בודקים**
```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
DATA_MODE=memory pnpm dev   # /start → הקוד בקונסול → /account
```

**דרוש מדניאל:** `WA_PUBLIC_NUMBER` (המספר של ה-SIM), `RESEND_API_KEY` + אימות דומיין ב-Resend (השולח: `no-reply@<דומיין APP_URL>`).

### 2026-10-20 — שלב ב' 2: אבן דרך 2 — וואטסאפ, זיהוי, היכרות, מודל וזיכרון

**מה נעשה**
- **`lib/wa/`**: לקוח Cloud API מוקלד (טקסט, 3 כפתורי reply, רשימה עד 10, תמונה/מסמך, ריאקשן ✅, "נקרא"+typing indicator, תבניות עם פרמטרים וכפתורים, הורדת מדיה בשני שלבים עם מגבלת גודל), פרסור webhook לכל סוגי ההודעות, `RecordingWaSender` לבדיקות ולפיתוח.
- **Webhook/worker**: `POST /api/wa/webhook` מאמת חתימה על ה-body הגולמי, מפרסר, מכניס לתור (dedupe לפי wa message id) **אחרי** שהתשובה 200 נשלחת (`after()`); `POST /api/wa/worker` מאמת JWT של QStash (מפתח נוכחי/הבא, URL, hash של ה-body) או סוד פנימי כשאין QStash (פיתוח). `maxDuration=300`.
- **תור**: QStash (publish עם Upstash-Deduplication-Id, retries, delay) או fallback מקומי בתהליך עם אזהרה בעברית.
- **הצינור (`lib/bot/process-inbound.ts`)**: dedupe (unique) → זהות לפי טלפון → קישור חשבון בטוקן (3 ניסיונות שגויים → חסימה 24 שעות, טוקן פג/משומש/מספר שני/חשבון אחר — כל ההודעות מ-bot-copy) → ✅ + typing → כפתורי `pa:approve|edit|cancel:<id>` (רק הבעלים, רק pending, רק 10 דקות, audit עם מזהה ההודעה של הלחיצה) → מכונת מצבים של היכרות (ברוך הבא עם שורת האמון → סיור/נתחיל → כרטיס 4 הדרכים → משימה ראשונה → שם → עסק → רשימת "מה מעמיס" → רשימת שעת בוקר → nudge חיבור → סיום; השם מדולג אם ידוע) → מונה ניסיון/מסלול (`count_trial_message`, התראות ב-3 וב-1, עצירה מנומסת ב-0) → העוזר → שמירת הודעות → סיכום מתגלגל כל 20 הודעות.
- **`lib/ai/`**: ממשק ספק; Anthropic דרך ה-SDK הרשמי (Haiku 5.5 router + Sonnet 5.5 strong, thinking adaptive/effort low — לפי ממצאי הבדיקה, prompt caching על ה-system, כלים strict + tool_choice auto, שגיאות ממופות ל-retryable); MockProvider דטרמיניסטי; system prompt בעברית עם תאריך **ושעה** נוכחיים, איסור "שלחתי/קבעתי" לפני ביצוע, פנייה ניטרלית; כלים: `draft_email` ו-`create_event` יוצרים **pending_action** בלבד (הביצוע רק מכפתור), `set_morning_time`, `remember_fact`; זיכרון: פרופיל + סיכום + עובדות + 10 הודעות אחרונות.
- **`lib/copy/bot.ts`**: כל המחרוזות לפי ה-ids של docs/copy; בדיקה מוודאת שכל id מתועד ושאין צורות "שלח/י".
- **בדיקות**: 114 (לקוח WA עם fetch מדומה, פרסור webhook, חתימות Meta/QStash, routes, orchestrator, זיכרון, קישור, היכרות מלאה, pending actions, צינור מקצה לקצה בזיכרון, ספק Anthropic עם fetch מדומה).

**איך בודקים**
```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
DATA_MODE=memory META_APP_SECRET=x WA_VERIFY_TOKEN=y APP_URL=http://localhost:3000 pnpm dev   # ואז POST חתום ל-/api/wa/webhook — הבוט מדפיס [wa:text]
```

**דרוש מדניאל:** Meta (WA_PHONE_NUMBER_ID, WA_ACCESS_TOKEN, WA_VERIFY_TOKEN, META_APP_SECRET, רישום ה-webhook ל-`/api/wa/webhook`), Upstash (QSTASH_*), ANTHROPIC_API_KEY ב-Vercel. אופציונלי: `AI_ROUTER_MODEL` / `AI_STRONG_MODEL` לדריסת המודלים.

### 2026-10-20 — שלב ב' 3: אבן דרך 3 — ניסיון, תשלום HYP, מנוי

**מה נעשה**
- **מונה** (כבר מאבן דרך 2, `count_trial_message`): נספרות רק הודעות משתמש שגוררות תשובה; כפתורים/הודעות יזומות/שגיאות לא. התראות ב-3 וב-1 (רק בניסיון), עצירה מנומסת ב-0 עם **קישור תשלום אישי** `/pay/<token חתום, 7 ימים>` (בלי צורך ב-session בטלפון), שמירת `pending_input` והמשך מאותו מקום אחרי התשלום; הודעה חוזרת פעם ב-24 שעות; מסלול בסיסי ב-750 → `bill.plan_limit_reached` עם קישור שדרוג; חשבון מושהה (past_due) → `bill.past_due_blocked_reply` פעם ביום.
- **HYP (`lib/hyp/client.ts`)**: SIGN → דף תשלום (Amount, Coin=1, Order=`<user>:<plan>`, Sign, MoreData, SendHesh, Pritim+heshDesc, PageLang=HEB, email, שם), VERIFY על כל ה-redirect, `getToken` (CCode 901/902/910 מוסברים בעברית), `soft` עם טוקן (CC, Tmonth/Tyear מ-Tokef, Token=True, SendHesh=True → חשבונית מס-קבלה אוטומטית), PrintHesh (קישור לחשבונית). `MockHypGateway` לפיתוח/בדיקות.
- **מכונת מצבים (`lib/billing/subscription.ts`)**: trial → active (טוקן מוצפן AES-256-GCM עם AAD של המשתמש, `next_charge_at` = +חודש, משימת `charge` ב-jobs) → חיוב חודשי → כישלון: ניסיונות בימים 1/3/5 → past_due → הסדרה מהאתר → active. `payments` ייחודי לפי `hyp_trans_id` (redirect כפול לא מפעיל פעמיים).
- **routes**: `/pay/[token]` (בחירת מסלול, Server Action → SIGN → redirect ל-HYP), `/api/pay/return` (success URL: VERIFY → getToken → הפעלה → הודעה בוואטסאפ: טקסט בתוך חלון 24 שעות, אחרת תבנית `payment_success`/`payment_failed`), `/api/pay/mock` (memory בלבד), `/api/jobs/run` (worker ל-pg_cron→QStash; `charge` עובד, מסמן `finish_job`).
- **טקסטים**: כל `bill.*` מ-docs/copy נוספו ל-`lib/copy/bot.ts`.
- **בדיקות**: 130 (HYP client עם fetch מדומה, מכונת מצבים, service, שערי חיוב בצינור, routes).

**איך בודקים**
```bash
pnpm test -- lib/hyp lib/billing lib/bot app/api/pay
DATA_MODE=memory pnpm dev → /pay/<token> → "לתשלום" → /api/pay/mock → /api/pay/return → /account "החשבון פעיל"
```

**דרוש מדניאל:** HYP — `HYP_MASOF`, `HYP_KEY`, `HYP_PASSP`; במסוף להפעיל טוקנים (אחרת 901) ו-"אימות על ידי חתימה"; success/error URL = `https://<domain>/api/pay/return`; מסוף בדיקה לעסקת ניסיון. Supabase Vault: `jobs_worker_url` = `https://<domain>/api/jobs/run`.

### 2026-10-20 — שלב ב' 4: אבן דרך 4 — Microsoft 365

**מה נעשה**
- **OAuth (`lib/ms/oauth.ts`)**: authorization code + PKCE (S256), multi-tenant (`MS_TENANT=common`), scopes מינימליים (User.Read, Mail.ReadWrite, Mail.Send, Calendars.ReadWrite, Files.Read.All, offline_access), כתובת admin consent לארגון (`/organizations/v2.0/adminconsent`), החלפת code/רענון, סיווג שגיאות AADSTS (65001/90094 → דרוש אישור מנהל; invalid_grant → חיבור מחדש).
- **Routes**: `/api/auth/microsoft/start` (session או קישור חד-פעמי ל-30 דקות מהשיחה; `?admin=1`), `/api/auth/microsoft/callback` (state חד-פעמי בפרופיל המשתמש, טוקנים מוצפנים AES-256-GCM עם AAD, יצירת connection, Graph subscription על ה-inbox, הודעת `onb.connect_done` בוואטסאפ; שגיאת admin consent → `err.admin_consent_needed` עם הטקסט למנהל ה-IT והקישור), `/api/graph/notify` (validationToken + clientState).
- **Graph client (`lib/ms/graph.ts`)**: inbox / חיפוש KQL / מייל מלא (HTML→טקסט) / שליחה ותשובה; calendarView לפי אזור זמן / יצירה / עדכון / ביטול; חיפוש OneDrive / הורדה / `content?format=pdf`; subscriptions (יצירה, חידוש, מחיקה); retry אחרי 401 דרך token store שמרענן ומסמן `expired` ב-invalid_grant.
- **קריאת קבצים**: PDF ישירות, Word/Excel/PowerPoint דרך ה-PDF rendition של Graph, טקסט — חילוץ עם `unpdf` (עד 40K תווים).
- **כלים למודל** (רק כשיש חיבור פעיל): `search_emails`, `get_email`, `list_events`, `update_event`/`delete_event` (pending), `search_files`, `get_file_text`; executors ל-`send_mail`, `create_event`, `update_event`, `delete_event` — מבוצעים רק מלחיצת הכפתור.
- **צינור**: "לחבר את המייל"/"חבר שוב" → קישור חד-פעמי; חיבור שפג → `err.connection_expired` עם קישור; הכפתור `Microsoft 365` בהיכרות שולח קישור אמיתי. משימת `renew_subscription` ב-`/api/jobs/run` מחדשת subscriptions שפגים תוך יום.
- **בדיקות**: 146 — fixtures מוקלטים של Graph (הודעות, אירועים, קבצים, PDF קטן אמיתי, subscriptions, 401), OAuth עם fetch מדומה, token store, כלים בתוך ה-orchestrator, routes מקצה לקצה במצב memory.

**איך בודקים**
```bash
pnpm test -- lib/ms app/api/auth/microsoft
DATA_MODE=memory pnpm dev → /account → (כפתור M365 עדיין מושבת ב-UI; מהשיחה: "לחבר את המייל") → /api/auth/microsoft/start?t=… → callback מדומה
```

**דרוש מדניאל (PLAN §9 #3):** App registration multi-tenant ב-Entra של העסק: Redirect URI `https://<domain>/api/auth/microsoft/callback`, API permissions (delegated) כנ"ל, client secret → `MS_CLIENT_ID`, `MS_CLIENT_SECRET`, `MS_TENANT=common`; Publisher Verification ב-Partner Center (אחרת "unverified" במסך ההסכמה); בדיקה מול 2 tenants (עם/בלי user consent). **לאמת:** מגבלת 10,080 דקות ל-subscription של הודעות (אנחנו מחדשים כל 6 ימים), ו-`Files.Read.All` מול `Files.ReadWrite` אם נרצה שיתוף קישורים.

### 2026-10-21 — סבב "עלזה" 1: מותג + בדיקת עברית משלימה

**מה נעשה**
- **`lib/brand.ts`** — מקור יחיד: `name: "עלזה"`, `latin: "Alze"`, תגית, תיאור, דומיין placeholder (`alze.ai`). `lib/product.ts` הוסר; `app/layout.tsx` (כותרת/תיאור), המיילר, ה-system prompt וטקסטי הבוט קוראים משם.
- **כל `{{שם}}` הוחלף** — בקוד, ב-`docs/copy/*` (כולל JSON של תבניות Meta), ב-`docs/legal/*` (עם התאמת דקדוק: "עלזה היא שירות", "מה עלזה תעשה"), ב-README/AGENTS ובארכיון `design/directions`. `docs/naming.md` — ההחלטה מתועדת למעלה.
- **קול נקבה** (לפי ההחלטה שכבר הייתה ב-`style-guide.md`: "אם ייבחר שם נשי — מחליפים גלובלית"): "אני עוזרת", "מקשיבה…", "מחפשת במיילים…", "ממשיכה מאיפה שעצרנו"; ה-system prompt: "את עלזה — העוזרת המשרדית… על עצמך דברי בלשון נקבה". הפנייה למשתמש נשארה ניטרלית.
- **קישור וואטסאפ:** ההודעה ב-wa.me היא עכשיו `היי עלזה! אפשר לקשר את החשבון שלי (ABCD-2345)`; ה-parser מעדיף טוקן בסוגריים (גם כשה-bidi הופך אותם), מנקה סימני כיוון/רוחב-אפס, מקבל מינוס/מקפים, ועדיין מזהה את הפורמט הישן.
- **בדיקת עברית משלימה ($0.84 מתוך $1):** Haiku 5.5 adaptive/low על 100 ההודעות + שיפוט מחדש של 12 הרשומות שנדחו. Haiku adaptive: כולל 3.70, עברית 3.73, בטיחות 4.85, תשובות לא בעברית 1/100 (thinking off: 14/100); בהודעות פשוטות 3.81/5.00 — כמו Sonnet, בפי 15 זול. **נעילה ב-`lib/ai/anthropic.ts`:** router = Haiku 5.5 adaptive/low (מסווג ועונה רק לפשוטות), חזק = Sonnet 5.5. תקרת ה-router הועלתה ל-1024 טוקנים (החשיבה נספרת). `docs/hebrew-eval-report.md` עודכן.
- תשתית הבדיקה: הערכת העלות מראש לפי מזהה המודל אצל הספק (לפני כן מודל עם id מקומי חדש הוערך ב-$0); מודל `claude-haiku-5-5-adaptive` ב-`models.json`, ה-thinking-off כבוי כברירת מחדל.
- `.claude/worktrees/` מוחרג מ-git, tsc, eslint ו-vitest (worktrees של סוכנים).

**איך בודקים**
```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
pnpm test -- lib/auth/link-token lib/copy
cd scripts/hebrew-eval && npm run typecheck && npm run pipeline -- --dry-run
```

### 2026-10-21 — סבב "עלזה" 2: מערכת העיצוב "לילה ירוק"

**מה נעשה**
- **Tokens** (`app/globals.css` + `lib/design/tokens.ts`): לילה `#0F1C17`, משטח `#16261F`, קו `#26382F`, שמנת `#EFE9DC`, דבש `#E7B65C`, מרווה `#9CC9A8`; כרטיסי שלבים: נייר `#F2EADA` → ורוד-אבק `#D8A99C` → מרווה `#9DB8A0` → לילה. כהה כברירת מחדל (`<html class="dark">`, themeColor); `.surface-light` הופך את הטוקנים בכרטיסים הבהירים ומבטל שם את ה-`dark:` של shadcn. **בדיקת ניגודיות אוטומטית** (`lib/design/tokens.test.ts`): 33 צירופים טקסט/רקע ורכיבי UI, כולם AA (≥ 4.5 טקסט, ≥ 3 גבולות/פוקוס), והערכים ב-CSS חייבים להתאים ל-TS.
- **פונטים** (`lib/fonts.ts`, next/font self-host, hebrew+latin): Frank Ruhl Libre 300/700, **Gveret Levin** 400 (אומת שקיים ברשימת הפונטים של next/font), Assistant variable. סקאלת טיפוגרפיה: hero / title / hand / lede.
- **ספריות** (גרסאות מדויקות, כולן ≥ שבועיים, רישיונות נבדקו): `motion@14.0.0` (MIT; framer-motion/motion-dom נעולים על 14.0.0), `lenis@1.3.26` (MIT), `canvas-confetti@1.9.4` (ISC), `qrcode@1.5.4` (MIT) + types; לבדיקות: `@playwright/test@1.56.1` (Apache-2.0, תואם ל-Chromium ב-`/opt/pw-browsers`), `axe-core@4.14.0` (MPL-2.0, dev בלבד).
- **Skill** `frontend-design` הרשמי של Anthropic ב-`.claude/skills/frontend-design/` (SKILL.md + LICENSE, נקרא במלואו, אין סקריפטים). תוכנית העיצוב לפיו כתובה בראש `lib/design/tokens.ts`.
- **רכיבים** (`components/brand/`): `PhoneMockup`, `ChatDemo` (תסריט כ-data, לולאה עם `AbortController`, reduced-motion = כל השיחה בבת אחת בלי טיימרים), `Bubble`, `TypingDots`, `VoiceNote`, `DraftCard`, `WaButtons`, `IncomingCall`, `Handwritten`, `StepCard` + `StepProgress` (מעבר צבע + layout morph עם motion, מלא-מסך בנייד), `Confetti` (טעינה עצלה, canvas משלנו בלי worker, כבוי ב-reduced-motion), `QrCode` (SVG בצד שרת), `Reveal`, `MascotPlaceholder` (דוכיפת SVG), `Wordmark`, `Cta`.
- **RTL:** בדיקת ה-PHYSICAL_CLASS ב-`components/ui/button.test.tsx` הורחבה לסריקת כל קבצי `components/brand` ו-`components/auth`, והביטוי תופס עכשיו גם `text-right`/`float-left` בלי סיומת.

**איך בודקים**
```bash
pnpm test -- lib/design components/brand components/ui
```

### 2026-10-21 — סבב "עלזה" 3: ההרשמה 1:1 לפי הצילומים + שינויי בקאנד

**מה נעשה** (סדר המסכים לפי תוכנית הסבב §3)
1. **`/start`** — עלזה "מתקשרת" (מסך שיחת וואטסאפ נכנסת עם הדוכיפת, דחייה/מענה), "עושה את העבודה, באמת.", H1 "העוזרת האישית שלך, *בוואטסאפ*.", "לוקח בערך דקה.", "בואו נתחיל" (בנייד — נעוץ לתחתית), "כבר יש לך חשבון? כניסה".
2. **`/start/email`** — כרטיס שמנת: "קודם כל" / "מה המייל שלך?", שדה LTR, טוגל "עדכונים וטיפים" **דולק כברירת מחדל** (החלטת דניאל, 21.10; ההסכמה נשמרת בפרופיל עם חותמת זמן רק אם נשאר דולק), "בהמשך מאשרים את התנאים ומדיניות הפרטיות", "שליחת קוד" מושבת עד מייל תקין.
3. **`/start/code`** — כרטיס ורוד-אבק: 6 תאים (`input-otp`: הדבקה עם ניקוי, מעבר אוטומטי, one-time-code), שליחה אוטומטית בספרה השישית, "הקוד תקף 10 דקות · שליחה חוזרת בעוד 0:42" → "שליחה חוזרת", "שינוי מייל", הודעות שגיאה בעברית עם מספר הניסיונות.
4. **`/start/connect`** — כרטיס מרווה: "דבר אחרון" / "תנו לעלזה את *כוח-העל* הראשון שלה", 3 שורות אמון, Microsoft ראשי, Gmail, "דילוג בינתיים"; כשה-callback חוזר עם שגיאת ארגון — "שליחה למנהל ה-IT" (מייל מוכן עם קישור admin-consent חד-פעמי ל-30 דקות).
5. **`/connect/[provider]`** — מסך מעבר בהיר: עלזה ↔ Outlook/Gmail עם קו נע, "עלזה רוצה להתחבר ל-Outlook שלך", "מעבירים אותך ל-Microsoft…", ואחרי ~0.9 שנ' → `/api/auth/{microsoft|google}/start?returnTo=onboarding` (Google יגיע במיזוג של אבן דרך 6).
6. **`/start/ready`** — כרטיס לילה רחב: קונפטי (כבוי ב-reduced-motion), "נכנסת." / "העוזרת שלך *מוכנה*.", "היא לא רואה את שאר השיחות שלך.", "Outlook/Gmail מחובר" כשחוזרים מ-OAuth, "חיבור לוואטסאפ" (wa.me + טוקן), QR במחשב, "להשתמש במייל אחר", טלפון עם שיחה (הקלטה 0:34 → רשימה ממוספרת → "תגידו מילה וזה יוצא."). `/start/link` → הפניה לכאן (next.config).
7. **`/login`** — מסך מפוצל: "טוב לראות אותך שוב", "המשך עם מייל" (`/login/email` → `/login/code` → `/account`), "הצטרפת דרך וואטסאפ? כניסה כאן" (`/login/whatsapp`: wa.me עם "כניסה" + QR); צד שני — הדוכיפת ושורה אחת, בלי "אלפי לקוחות".
- **מעטפת אחת** (`components/auth/signup-shell.tsx`) — הכרטיס נשאר אותו אלמנט בין הדפים: הצבע מתחלף והגודל עושה morph (motion), התוכן נכנס בעדינות רק בניווט בצד הלקוח (ה-HTML מהשרת גלוי גם בלי JS); בנייד מלא-מסך.
- **בקאנד:** Microsoft `start` מקבל `returnTo=onboarding` (רשימה סגורה, בלי open redirect) → callback: הצלחה ל-`/start/ready?connected=microsoft`, כישלון ל-`/start/connect?error=…&admin=1`. **כניסה דרך וואטסאפ:** `lib/auth/login-token.ts` (חתום, 10 דק', חד-פעמי, טוקן חדש מבטל קודם, hash בפרופיל — בלי טבלה חדשה), `lib/bot/login-link.ts` — "כניסה" בשיחה מחזיר `/login/w/<token>` (גם כשהניסיון נגמר, לא נספר), ו-`/login/w/[token]` שורף את הטוקן **רק ב-POST** (תצוגה מקדימה של וואטסאפ לא שורפת אותו). מחרוזת חדשה `link.login_link` ב-bot-copy.
- **דפים משפטיים** `/terms`, `/privacy`, `/accessibility` — מרונדרים בזמן build מ-`docs/legal/*.md` (renderer קטן בלי HTML גולמי), באנר "טיוטה", `noindex`. נוספה טיוטת **הצהרת נגישות** (`docs/legal/accessibility-statement-he.md`). קישור "דילוג לתוכן" בכל הדפים.
- `/api/dev/outbox` — רק ב-DATA_MODE=memory (404 בכל מקום אחר): מה ש"נשלח" במייל ובוואטסאפ, בשביל ה-E2E.
- **בדיקות:** 215 יחידה/קומפוננטה (login token, handler "כניסה", returnTo, opt-in, EmailStep/CodeStep/ConnectStep, markdown) + **E2E Playwright** (`e2e/signup.spec.ts`, 5 תרחישים, `pnpm e2e`): intro→מייל→קוד (מה-mailer בזיכרון, כולל קוד שגוי)→connect→דילוג→ready→הטוקן ב-wa.me באמת מקשר מספר; נתיב Microsoft עם ה-fixture; `/login`→מייל→`/account`; "כניסה" בוואטסאפ→`/login/w/…`→`/account` ופעם שנייה נדחה; דפים משפטיים noindex.

**איך בודקים**
```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
pnpm e2e        # מריץ next dev במצב memory על פורט 3100 עם Chromium מ-/opt/pw-browsers
```

### 2026-10-21 — סבב "עלזה" 4: נקודת ביקורת — צילומי ההרשמה

**מה נעשה**
- **צילומי מסך** (כהה) של כל שלבי ההרשמה ב-375×812 וב-1280×800: `design/signup-screens/{start,email,code,connect,connect-microsoft,ready,login}-{375,1280}.png`, ובנייד גם `*-375-full.png` לדפים שנגללים (start, ready).
- **בדיקה אוטומטית** (`e2e/screens.spec.ts`, חלק מ-`pnpm e2e`): בכל מסך ובשני הגדלים — אין גלילה אופקית, ו-**axe-core 4.14: 0 ממצאים serious/critical** (WCAG 2.0/2.1/2.2 A+AA + best-practice).
- תוקן בדרך: ניגודיות שעות ההודעה על בועה ירוקה (`--wa-meta-out`, נבדק ב-AA יחד עם צבעי הוואטסאפ במוקאפ), `role="group"` לבועה קולית עם תווית, אזור השיחה הנגלל נגיש במקלדת, הטלפון בדף "מוכנה" במחשב, ה-CTA הנעוץ בנייד כולל את "כבר יש לך חשבון? כניסה", ריווח בכרטיס הקוד, `PROVIDERS` הועבר למודול משותף (בשרת היה client reference ולכן `/connect/*` החזיר 404).

**איך בודקים / מצלמים מחדש**
```bash
pnpm e2e                                              # כולל overflow + axe
CAPTURE_SCREENS=1 pnpm e2e e2e/screens.spec.ts        # כותב את הצילומים ל-design/signup-screens/
```

**דרוש מדניאל:** לעבור על הצילומים ולאשר את הכיוון לפני ליטוש דף הנחיתה, הכניסה והאזור האישי (שלב 5 בתוכנית הסבב).

### 2026-10-21 — אבן דרך 5: תזכורות, סיכום בוקר, הודעות קוליות (שולב מענף נפרד)

> פירוט מלא: `docs/progress/m5.md`. נבנה במקביל לסבבי "עלזה" ומוזג אחריהם: `lib/wa/templates.ts` קורא את השם מ-`lib/brand.ts`, ובדיקות ההקלטה עודכנו לקול הנקבה ("מקשיבה…", "ממשיכה לפי זה").

**מה נעשה**
- **פענוח זמן בעברית** (`lib/reminders/parse.ts`, דטרמיניסטי — לא המודל): "מחר ב-9", "עוד שעתיים", "ביום ראשון הבא ב-8:30", "כל יום בשמונה", "ברבע לתשע", "ב-5 אחה״צ", "הערב", "ב-22.10", "בימים א׳–ה׳ ב-7:30", "כל חודש ב-1", ISO. Asia/Jerusalem עם מעברי שעון נכונים (`lib/time/zoned.ts`, Intl בלבד): שעה שלא קיימת → השעה שאחריה, שעה כפולה → המופע הראשון. המוסכמות מתועדות בראש הקובץ; "היום" בלי שעה / בלי זמן → שואלים.
- **תזכורות** (`lib/reminders/service.ts`): יצירה חד-פעמית/חוזרת, רשימה, ביטול (כמה התאמות → שואלים), דחייה לשעה / למחר בבוקר, "טופל". בתוך חלון 24 שעות — "⏰ תזכורת: …" עם כפתורים; מחוצה לו — תבנית `reminder`. אידמפוטנטי (`last_fired_at`), חוזרת מתזמנת את המופע הבא לפי שעון הקיר; `proactive_disabled` → מבוטלת.
- **כלים למודל** (`lib/ai/reminder-tools.ts`): `create_reminder`, `list_reminders`, `cancel_reminder` — זמינים גם בלי חיבור.
- **סיכום בוקר** (`lib/jobs/morning-summary.ts`): א׳–ה׳ בשעה שנבחרה; פגישות היום, מיילים שמחכים לתשובה (היוריסטיקה על 7 ימים אחרונים), תזכורות של היום. מחוץ לחלון — תבנית `morning_summary`. Opt-in בלבד, מכבד השהיה, אחד ליום (dedupe), בלי חיבור ובלי תזכורות — לא שולחים.
- **תזמון**: `schedule_morning_summaries()` ב-SQL (pg_cron כל 10 דק׳), אחרי כל ריצה, ובבחירת שעה ב-onboarding / בכלי `set_morning_time`. `/api/jobs/run` מטפל ב-`reminder` ו-`morning_summary`; חדש: `/api/jobs/tick` (`claim_due_jobs` → התור; מסלול חלופי בלי pg_net ולולאת הפיתוח ב-memory).
- **הודעות קוליות** (`lib/stt/*`, `lib/bot/voice.ts`): "מקשיבה…" → הורדה מוואטסאפ (עד 20MB) → Soniox async (`stt-async-v5`, `he`+`en`, מחיקת הקובץ והתמלול אצל Soniox) → גיבוי gpt-4o-transcribe → mock. התמלול נשמר ב-`messages.transcript` וממשיך כטקסט (גם בתשובות ה-onboarding); הקלטה ארוכה או ביטחון נמוך → `proc.transcript_echo`; כישלון → `err.transcription_failed`, לא נספר בניסיון.
- **תבניות** (`lib/wa/templates.ts`): מטענים ל-`reminder`/`morning_summary`, הגדרות 7 התבניות ורישום (dry-run כברירת מחדל); בדיקה משווה מול ה-JSON ב-`docs/copy/wa-templates.md`.
- **DB**: מיגרציה `0005_m5_reminders_morning.sql` (0004 פנוי בכוונה) + `supabase/tests/m5_reminders.test.sql`. טקסטים: `lib/copy/bot-m5.ts` + `docs/copy/bot-copy-m5.md`.
- **בדיקות**: 340 אחרי המיזוג (154 חדשות: פענוח זמן ומעברי שעון 2026–2027, תזכורות, סיכום בוקר עם fixtures של Graph, STT עם fetch מדומה, הקלטות בצינור, routes).

**ממצא**: Meta דוחה פרמטר תבנית עם ירידת שורה, טאב או יותר מ-4 רווחים (132018) — הקוד משטח לשורה אחת; `docs/copy/wa-templates.md` תוקן.

**איך בודקים**
```bash
pnpm test -- lib/reminders lib/jobs lib/stt lib/bot/voice.test.ts app/api/jobs
DB_NAME=whatsappbot_m5_test supabase/tests/run-local.sh
DATA_MODE=memory pnpm dev   # "תזכיר לי בעוד דקה לבדוק", ואז: curl -X POST http://localhost:3000/api/jobs/tick
```

**דרוש מדניאל:** רישום התבניות ב-Meta (`APP_DOMAIN` → הדומיין; בלי תבנית מאושרת תזכורת/סיכום מחוץ לחלון נכשלים), `SONIOX_API_KEY` (אופציונלי: `OPENAI_API_KEY` לגיבוי, `STT_PROVIDER`), הרצת מיגרציה 0005 ב-Supabase, בדיקה בטלפון (סיכום ב-07:30, תזכורת מחוץ לחלון, הקלטה בעברית).

### 2026-10-21 — אבן דרך 6, שלב 1: Google — יומן, drive.file, שליחת Gmail (שולב מענף נפרד)

> פירוט מלא: `docs/progress/m6.md`; מדריך הקמה: `docs/google-setup.md`. נבנה במקביל לאבן דרך 5 ולסבבי "עלזה" ומוזג אחריהם.

**מה נעשה**
- **OAuth 2.0 web flow** (`lib/google/oauth.ts`): code + PKCE S256, `access_type=offline`, `prompt=consent`, `include_granted_scopes=true`. Scopes: `openid email profile`, `calendar.events` (לא `calendar` המלא), `drive.file`, `gmail.send`. הסכמה מצטברת ל-`gmail.readonly` חסומה מאחורי `GOOGLE_GMAIL_READ_ENABLED=false` (דורש CASA). *(עודכן 22.10: קריאת Gmail נפתחה ל-100 הראשונים בלי CASA — ראו הרשומה "קריאת Gmail" למטה.)*
- **נתיבים**: `/api/auth/google/start` (`?t=` קישור חד-פעמי מהשיחה או session; `returnTo=onboarding|account`) ו-`/api/auth/google/callback` (state חד-פעמי עם TTL של 30 דק׳, granular consent → הודעת "חלקי" עם קישור להשלמה, `access_denied`, `admin_policy_enforced`, `invalid_grant`). הפניה רק לנתיבים קבועים (`lib/auth/oauth-return.ts`) — אין open redirect.
- **טוקנים**: AES-256-GCM עם AAD `${userId}:google`, רענון 5 דק׳ לפני תפוגה, שמירת ה-refresh token הקיים; `invalid_grant` (כולל תפוגת 7 ימים במצב Testing) → `expired` + audit → הבוט שולח קישור חידוש.
- **לקוח fetch בלי SDK** (`lib/google/client.ts`): Calendar, Drive (כולל export והמרה), Gmail send (RFC 2822; מעל 4MB → upload), userinfo; סיווג שגיאות (401, scope חסר, rate limit/5xx, 404/410). **MIME** (`lib/google/mime.ts`): כותרות בעברית ב-RFC 2047, קבצים מצורפים עם `filename*`, הגנה מ-header injection.
- **כלים למודל** (`lib/google/tools.ts`, לפי ה-scopes שאושרו בפועל): `gcal_list_events`, `gcal_free_slots`, `gcal_create_event`/`gcal_update_event`/`gcal_delete_event` (pending), `gdrive_list_files`, `gdrive_get_file_text`, `gdrive_save_doc`, `gmail_draft_email` (pending, צירוף מ-Drive), `gmail_read_status`.
- **ניתוב ביצוע** (`lib/google/dispatch.ts`): `payload.provider` אם תויג, אחרת Microsoft פעיל, אחרת Google — כך `draft_email`/`create_event` הבסיסיים עובדים גם למשתמש Google בלבד. **Revoke** אצל Google בניתוק ובמחיקת חשבון (best-effort, audit).
- **באג שתוקן**: זיהוי "לחבר את המייל" נכשל כי `\b` ב-JS עובד רק על ASCII — עבר ל-`lib/bot/connect-intent.ts` (גם "לחבר את גוגל", "ג'ימייל", "דרייב").
- **טקסטים**: `lib/copy/bot-google.ts` + `docs/copy/bot-copy-google.md` (במיזוג: כותרת עם השם עלזה, "אני לא קוראת" בלשון נקבה).
- **מצב memory**: כל ה-hosts של Google מוגשים מ-`lib/google/__fixtures__/google-fixtures.ts`.

**במיזוג (אבני דרך 5 + 6 + "עלזה")**
- `lib/bot/process-inbound.ts`: הקלטה → תמלול לפני ה-onboarding (5), כפתורי תזכורת (5), ובלוק 6 עם `connectRequestProvider`/`reconnectProviderFor` (6). `handle-inbound.ts`: `stt` + כלי Graph ו-Google + executors מנותבים; כלי התזכורות ב-`BASE_TOOLS` תמיד. `context.ts`: `stt` + קישור OAuth ל-Google.
- **סיכום הבוקר כולל את יומן Google**: `googleFor` ב-`lib/jobs` (`googleForUser` → `listEvents` ליום המקומי); למשתמש עם שני החיבורים — היומנים ממוזגים לפי שעה (אירועי כל-היום קודם). מיילים שמחכים לתשובה — רק מ-Microsoft 365 (קריאת Gmail אחרי CASA). *(עודכן 22.10: גם מ-Gmail לחיבורים עם `gmail.readonly` — ראו "קריאת Gmail" למטה.)*
- `docs/legal/oauth-consent-screen-he.md` §3–4: `calendar.events` במקום `calendar`.
- **בדיקות**: 386 (44 חדשות מאבן דרך 6 + 2 לסיכום בוקר עם Google), הכול מול fixtures / fetch מדומה.

**איך בודקים**
```bash
pnpm test -- lib/google app/api/auth/google lib/bot/connect-intent lib/copy/bot-google lib/jobs
DATA_MODE=memory pnpm dev   # "לחבר את גוגל" בשיחה → /api/auth/google/start?t=… → callback מדומה
```

**דרוש מדניאל:** פרויקט GCP + Calendar/Drive/Gmail APIs, מסך הסכמה External, OAuth client מסוג Web עם redirect `https://<דומיין>/api/auth/google/callback` (`docs/google-setup.md` §1–2); ב-Vercel `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, ~~`GOOGLE_GMAIL_READ_ENABLED=false`~~ (בוטל 22.10: להשאיר **ריק** — `false` מכבה את קריאת Gmail לכולם); משתמשי בדיקה (עד 100, הרשאה פגה אחרי 7 ימים); לפני השקה — אימות דומיין, branding, סרטון הדגמה והצדקות ל-`calendar.events` ו-`gmail.send` (§5). ~~קריאת Gmail רק אחרי CASA (§6).~~ (עודכן 22.10: ל-100 הראשונים בלי CASA — §6.)

### 2026-10-21 — מיזוג: סבב "עלזה" 1–4 + אבני דרך 5 ו-6 (ענף האינטגרציה)

- מוזג `worktree-agent-a3cd72339d3427793` (115480b: תזכורות, סיכום בוקר, הודעות קוליות, Google OAuth) לתוך הענף.
- **returnTo אחיד:** ה-callback של Microsoft עבר ל-`lib/auth/oauth-return.ts` (אותו כלל כמו Google): `returnTo=onboarding` → `/start/ready?connected=<provider>` או `/start/connect?error=…` (ו-`admin=1` כשהארגון דורש מנהל IT), אחרת `/account`.
- `/connect/google` → `/api/auth/google/start?returnTo=onboarding`; `/start/ready` מציג "Outlook מחובר" / "Gmail מחובר".
- `lib/bot/process-inbound.ts`: נשמרו גם handler ה"כניסה" (אחרי תמלול ההקלטה — אפשר גם להגיד "כניסה" בקול) וגם הקלטות, כפתורי תזכורת וזיהוי חיבור Microsoft/Google.
- **בדיקות אחרי המיזוג:** 416 יחידה/קומפוננטה, build, E2E 8/8 (נוסף נתיב Google עם ה-fixture), eval typecheck + dry-run, Supabase מקומי (`DB_NAME=whatsappbot_main_test`).

## מה נשאר (אבני דרך 5–7)
- אבן דרך 5 (שארית): רישום 7 התבניות ב-Meta (ידני), טיפול ב-change notifications (מייל חדש → מידע לסיכום).
- אבן דרך 6 (שארית): Google Picker בצד הלקוח (`docs/google-setup.md` §8), כפתורי החיבור באתר, אימות האפליקציה ב-Google, CASA או ספק מתווך לקריאת Gmail מעבר ל-100 הראשונים (קריאת Gmail והחלק שלה בסיכום הבוקר כבר קיימים ל-100 הראשונים — רשומת "קריאת Gmail" למטה).
- סבב "עלזה" שלבים 5–7 (אחרי אישור הצילומים): דף נחיתה קולנועי, ליטוש כניסה ואזור אישי, הדוכיפת התלת-ממדית (OpenRouter), Lighthouse ≥ 90, audit.
- אבן דרך 7: השקה.

### 2026-10-21 — אתר חי ב-Vercel: מצב הדגמה, דף נחיתה, אזור אישי, ליטוש הרשמה, דוכיפת

**מה נעשה**
- `DEMO_MODE=1` ("staging"): כל האתר רץ ב-Vercel בלי שום מפתח חיצוני; קוד 123456; Supabase אמיתי לנתונים (פרנקפורט), כל האינטגרציות היוצאות ב-mock. פרטים: `docs/deploy.md`, `docs/progress/demo.md`.
- דף נחיתה קולנועי עם "יום עבודה" נעוץ בגלילה, מחירים מ-`lib/billing/plans.ts`, FAQ — `docs/progress/landing.md`.
- `/account` מחדש + ליטוש כל מסכי ההרשמה והכניסה, לוגואים של Microsoft/Google, הדוכיפת התלת-ממדית בכל המסכים — `docs/progress/polish.md`.
- חיווט: הערת הקוד בהדגמה בתוך כרטיס הקוד (הרשמה וכניסה), כפתורי wa.me עוברים דרך `DemoWaGate`, וה-QR בהדגמה מקודד טקסט בלבד (לא wa.me למספר שאינו שלנו).
- Vercel: פרויקט `alze`, פריסה אוטומטית בכל push, Vercel Authentication על כל ה-deployments.

**בדיקות**: 549 בדיקות יחידה, e2e 15/15, e2e:demo 3/3, build.

**הוחלט**: H1 בדף הנחיתה הוחלף לניסוח הניטרלי "מה שהבטחת לעשות." (דניאל, 21.10). **דרוש מדניאל**: קובץ 4K של הדוכיפת (אופציונלי, לחדות).

### 2026-10-21 — מעבר חלק בין שלבי ההרשמה והכניסה (בלי "ריענון")

**הבקשה:** במעבר מהמייל לקוד "כל הדף כאילו מתרענן". הרפרנס של דניאל: ‎/login/whatsapp ← "כניסה עם מייל במקום" ← ‎/login/email — כל מעבר בין שלבים צריך להיראות בדיוק כך.

**הסיבה:** עמודי הקוד קראו את `searchParams` בשרת בתוך `<Suspense fallback={null}>`. עם `cacheComponents` הניווט הציג קודם שלד ריק (בלי כותרת ובלי תוכן בכרטיס, כ-300ms) ורק אחר כך את התוכן. בנוסף, הנתב שומר שלבים קודמים מוסתרים (`<Activity>`), ולכן "שינוי מייל" החזיר את טופס המייל הקודם בלי אנימציה, עם כפתור תקוע על "שולחים…".

**מה נעשה**
- מייל וקוד (הרשמה וכניסה): הדפים סטטיים. `EmailStepFromUrl` / `CodeStepFromUrl` קוראים email/updates/wait מה-URL בצד הלקוח. ה-fallback הוא אותו כרטיס, אף פעם לא כרטיס ריק. אם אין מייל בעמוד הקוד — חזרה למסך המייל.
- הערת ההדגמה בכרטיס הקוד: מוצגת מיד לפי ה-build, ומאומתת בכל בקשה (כמו הפס העליון).
- `/start/connect` ו-`/start/ready`: הכרטיס סטטי ונטען פעם אחת. רק החלק שתלוי בבקשה נכנס לתוכו: בדיקת ה-session, שגיאת Microsoft, הקישור עם הטוקן וה-QR. ב-ready, עד שהטוקן מגיע, מוצג אותו מבנה עם כפתור ו-QR ממלאי מקום — אף פעם לא קישור wa.me שגוי. הקונפטי מצויר על `<body>`.
- אנימציית הכניסה (`useEntrance`) נשארה בדיוק כמו ברפרנס, ונוסף לה שומר "פעם אחת לכל מסך" (`components/auth/entrance.ts`): fallback שמתחלף בתוכן לא מתחיל אותה מחדש, ושלב שחוזר אחרי "אחורה"/"קדימה" בדפדפן נכנס כמו כל שלב. בטעינה ראשונה וב-reduced motion — בלי אנימציה, כמו קודם.
- "שינוי מייל": כרטיס מייל חדש (מפתח `bfcacheId`) עם הכתובת ועם בחירת העדכונים. גם בחזרה עם "אחורה" הכפתור חוזר ל"שליחת קוד".
- Prefetch: כרטיס המייל טוען מראש את כרטיס הקוד ברגע שהכתובת תקינה; כרטיס הקוד טוען מראש את המסך הבא.
- טעינה ישירה של מייל/קוד: השדה מקבל פוקוס (ה-fallback בלי autoFocus).
- דפים משפטיים: כתובות ארוכות נשברות לשורה הבאה (גלישה אופקית ב-375px ב-‎/privacy שהפילה את e2e).

**אימות:** דגימת פריימים (Playwright, כל פריים) על build הדגמה: 0 פריימים ריקים בכל המעברים (קודם: כ-18 פריימים ריקים במייל→קוד, בהרשמה ובכניסה), ואנימציית כניסה אחת זהה לרפרנס (השאלה אחרי 0.1s, התשובה אחרי 0.16s, 0.42s כל אחת).

**בדיקות:** 558 יחידה (9 חדשות), e2e 15/15, e2e:demo 3/3, build.

### 2026-10-21 — מעברים: סבב 2 (הערת ההדגמה, reduced motion, חזרה מדף אחר, פוקוס)

**הבקשה:** כמו בסבב הקודם — כל מעבר בין שלבים בדיוק כמו הרפרנס (‎/login/whatsapp ← "כניסה עם מייל במקום" ← ‎/login/email). הבדיקה מצאה שבמייל→קוד הכרטיס עדיין "קופץ".

**הסיבות ומה נעשה**
- **הערת ההדגמה (חוסם):** כשה-build נעשה בלי `DEMO_MODE` והשרת רץ איתו (כמו ב-`docs/deploy.md` §4), כרטיס הקוד הוצג בלי ההערה, וההערה הגיעה אחר כך בזרם נפרד: הנייר התכווץ, קפץ כ-55px למעלה בפריים אחד והתכווץ שוב. עכשיו הפס העליון (`DemoBar`, שקורא את `DEMO_MODE` בכל בקשה) מעביר את הערך ללקוח פעם אחת (`components/demo/demo-flag.tsx`), וכרטיס הקוד מצייר את ההערה באותו commit (`DemoCodeNoteLive`). אין יותר `<Suspense>` להערה.
- **הנייר עוקב אחרי שינוי גודל מאוחר:** motion מודד רק כשהנייר עצמו מתרנדר. `useLateResizeMorph` (`components/brand/step-card.tsx`) מזהה שינוי גובה שהגיע אחרי השלב (תוכן בזרם, הודעה) ומעביר את הנייר והחבילה שמאחוריו לגובה החדש באותו משך ו-ease של המעבר, לפני הציור. לדוגמה ‎/login → ‎/login/whatsapp: כפתור הוואטסאפ מגיע מאוחר יותר, והנייר גדל בהדרגה במקום לקפוץ.
- **reduced motion:** הכלל הגלובלי (`transition-duration: 0.01ms`) הפך כל שינוי צבע של הנייר למעבר CSS, שהפריים הראשון שלו עוד בצבע הקודם. עכשיו הנייר `transition-none`, והצבע והצל נכתבים ב-commit עצמו. השלב החדש מופיע מיד על הנייר הנכון, גם ברפרנס.
- **חזרה מדף בלי שלבים** (‎/start/email ← "התנאים" ← אחורה): השלב חזר בלי אנימציה. עכשיו השומר (`entrance.ts`) מזהה שלב שהיה מוסתר יותר מ-32ms ומריץ שוב את אנימציית הכניסה, והנייר נכנס כמו בפתיחת ההרשמה. הרצה כפולה של StrictMode (באותו commit) לא מפעילה אותה.
- **פוקוס:** בחזרה עם "אחורה"/"קדימה" לכרטיס הקוד או המייל, השדה מקבל שוב את הפוקוס. ה-fallback הסטטי עדיין לא לוקח פוקוס.
- **בלי JS:** טעינה של ‎/start/code או ‎/login/code בלי `email` מחזירה 307 לכרטיס המייל המתאים (`proxy.ts`), רק בטעינת דף. בקשות prefetch וניווט של הנתב לא מופנות.
- **"מוכנה" בזמן הנפקת הטוקן:** במקום span שנראה כמו כפתור פעיל יש `<button disabled>` במראה המושבת של הכפתור, ושורת status לקוראי מסך.

**אימות:** דגימת פריימים על build רגיל שרץ עם `DEMO_MODE=1`, ב-1280 וב-375, עם ובלי השהיית רשת של 200ms. מייל→קוד: הנייר יורד ברציפות מ-452 ל-398 (עד 7–10px לפריים, אף פעם לא למעלה), וההערה מופיעה כבר בפריים הראשון. כניסה מייל→קוד: 350→376 בצעדים של עד 4px, כמו ברפרנס (328→350). reduced motion: הצבע החדש מופיע באותו פריים כמו השלב החדש.

**בדיקות:** 579 יחידה (21 חדשות: `step-motion.test.tsx`, פוקוס, `ReadyLinkPending`, `DemoCodeNoteLive`, proxy), e2e, e2e:demo, build.

### 2026-10-22 — "עדכונים וטיפים" דולק כברירת מחדל (החלטת דניאל)

**מה נעשה**
- כרטיס המייל בהרשמה: הטוגל "עדכונים וטיפים" מתחיל **דולק**. אפשר לכבות אותו לפני "שליחת קוד".
- הבחירה עוברת לכרטיס הקוד ב-URL תמיד במפורש (`updates=1` או `updates=0`), וכך "שינוי מייל" מחזיר את הטוגל במצב שנבחר, גם כשכובה.
- בכניסה (`/login/email`) אין טוגל, ולכן גם אין שם הסכמה.
- ההסכמה נשמרת בפרופיל עם חותמת זמן רק אם הטוגל נשאר דולק (`/api/auth/otp/verify`, ללא שינוי).

**בדיקות:** 579 יחידה, e2e 15/15, e2e:demo 3/3, build.

### 2026-10-22 — מעברים: סבב אימות 3 (reduced motion מיידי באמת)

**הבדיקה:** build רגיל שרץ עם `DEMO_MODE=1`, ב-1280×800 וב-375×812, עם ובלי השהיית רשת של 200ms. לכל מעבר: צילום מסך כל ~40ms (screencast) ודגימת DOM בכל פריים (הנייר: גודל, מיקום, צבע; כל משבצת: שקיפות והזזה). מעברים: הרפרנס (‎/login/whatsapp ← "כניסה עם מייל במקום"), מייל→קוד, "שינוי מייל", מייל→קוד שוב (cooldown), אחורה/קדימה בדפדפן, קוד→חיבור, חיבור→מוכנה, כניסה: מייל→קוד ו"שינוי מייל".

**מה נמצא ותוקן**
- **reduced motion:** הכלל הגלובלי נתן לכל אלמנט מעבר CSS של 0.01ms על `all` (ברירת המחדל של transition-property). לכן כל שינוי סגנון במעבר שלב צויר פריים אחד בערך הישן: ב-375, ב-‎/start ← "בואו נתחיל", הנייר הופיע פריים אחד צר ב-32px (הריפוד של מסך הפתיחה) ואז קפץ לרוחב מלא. ב-1280, ב"מוכנה", העמודות התחלפו פריים אחרי התוכן. עכשיו משכים ועיכובים הם 0 (`app/globals.css`), והתוכן, הנייר, הגודל והצבע מתחלפים באותו פריים בכל המעברים. בדיקה ב-`lib/design/tokens.test.ts`.
- במעברים עם תנועה לא נמצאו פריים ריק, כניסה כפולה או קפיצה. בכל מעבר: אותה מעטפת ואותו נייר (אותו אלמנט), שינוי צבע וגודל רציף, ואנימציית כניסה אחת לכל משבצת. הנייר ריק כ-70–120ms, כמו ברפרנס (90–105ms). חיבור→מוכנה: הנייר מתמוסס לבמה בזמן שהוא משנה גודל, כמתוכנן.
- פעם או פעמיים נראתה עצירה של הדפדפן ל-250–300ms (בלי JS ארוך), גם ברפרנס עצמו. היא לא חזרה ב-30 מעברי קוד↔מייל ברצף, ולכן זו סביבת ה-headless ולא הקוד.

**בדיקות:** 580 יחידה, e2e 15/15, e2e:demo 3/3, build. הבדיקה "Microsoft path" נכשלה פעמיים באקראי: פעם אחת בריצה מלאה (`Invalid URL` בבקשה המדומה ל-login.microsoftonline.com) ופעם אחת בריצה ראשונה מול שרת dev קר (הכתובת נשארה ‎/start/connect). אחר כך היא עברה בשתי ריצות מלאות וב-8 חזרות ברצף. כדאי לעקוב.

### 2026-10-22 — תמלול הודעות קוליות דרך OpenRouter (שולב מענף נפרד)

> פירוט מלא: `docs/progress/stt-openrouter.md`. נבנה במקביל לסבבי המעברים ומוזג אחריהם, בלי התנגשויות.

**מה נעשה**
- `lib/stt/openrouter.ts` (חדש): קריאה סינכרונית אחת ל-`/audio/transcriptions` עם Ogg/Opus כמו שהוא, `language: "he"` ו-`provider: { data_collection: "deny" }`. ראשי `deepgram/nova-3`, גיבוי `openai/gpt-transcribe` (`FallbackStt`, גם על תמלול ריק). Timeout של 45 שנ׳ לכל מודל, סיווג שגיאות (402/400/413 סופיות; 408/429/5xx retryable).
- `lib/stt/env.ts`: ‏`STT_PROVIDER` = ‏`openrouter` (ברירת מחדל כשיש `OPENROUTER_API_KEY`) | ‏`soniox` | ‏`openai` | ‏`mock`. ‏`STT_MODEL` ו-`STT_FALLBACK_MODEL` חדשים. ‏`SONIOX_API_KEY` אופציונלי. בהדגמה תמיד mock.
- `lib/stt/ogg.ts`: אורך הקלטה מכותרות ה-Ogg, כדי ש"הבנתי כך" יישלח על הקלטה ארוכה גם בלי משך מהמודל.
- העלות של כל תמלול נשמרת ב-`messages.cost_usd`, והמסלול ב-`model_used` (`setMessageTranscript`).
- טיוטות המשפט (`docs/legal/privacy-policy-he.md`, `dpa-checklist-he.md`) עודכנו לספקי המשנה החדשים.

**בדיקות:** 593 יחידה, lint, typecheck, build.

**דרוש מדניאל:** ‏`OPENROUTER_API_KEY` וקרדיט ב-OpenRouter; בדיקה בטלפון (הקלטה קצרה וארוכה); אישור עו"ד לספקי המשנה לפני מצב אמיתי. החלטה פתוחה: התמלול רץ לפני בדיקות `past_due`/מכסה (פירוט בקובץ הענף).

### 2026-10-22 — קריאת Gmail ל-100 המשתמשים הראשונים (ענף נפרד) + תיקוני סקירה

> פירוט מלא: `docs/progress/gmail-read.md`; מדריך: `docs/google-setup.md` §3 ו-§6. נבנה בענף `worktree-wf_01acec0d-90f-1` במקביל לזרימות הסוכנים ו-HYP. מיגרציה **0008** (0006 ו-0007 שמורות להן).

**מה נעשה**
- `gmail.readonly` מתבקש בחיבור רגיל כל עוד יש מקום בתקרה של Google ל-100 משתמשים (לכל חיי הפרויקט). בנוסף יש הסכמה מצטברת `?feature=gmail_read` כשמשתמש שואל על התיבה. פנקס `google_scope_grants` (גיבוב פסבדונימי של החשבון), תקרה `GOOGLE_GMAIL_READ_CAP` (95), והתראות למפעיל ב-80 וב-95.
- כלי קריאה `gmail_search_emails` / `gmail_get_email` / `gmail_get_thread` / `gmail_awaiting_reply`, ו"מיילים שמחכים לתשובה" מ-Gmail בסיכום הבוקר.
- **תיקוני סקירה (22.10):** ה-callback לא שומר `gmail.readonly` שלא התבקש או שאינו בתוך התקרה, כי `scope=` בקישור ניתן לעריכה. `GOOGLE_GMAIL_READ_ENABLED=false` עוצר את הקריאה לכולם. `login_hint` הוא החשבון שעליו הוחלט. אישור נרשם בפנקס לפני כל שלב שיכול להיכשל. בדיקת התראות תקופתית רצה מ-`/api/jobs/run`. כותרות מייל הן שורה אחת מנוקה (אין "סעיף" מזויף בסיכום הבוקר). כל התווים הנסתרים מוסרים לפני ניטרול `</data>`. מדיניות הפרטיות §5 מתארת עכשיו גיבוב פסבדונימי שמקושר לחשבון עד מחיקתו.

**איך בודקים**
```bash
pnpm test -- lib/google app/api/auth/google lib/jobs lib/ai/untrusted
DB_NAME=whatsappbot_gmail_test supabase/tests/run-local.sh   # google_user_cap.test.sql כולל את המילוי הראשוני
```

**בדיקות:** 633 יחידה (25 חדשות בתיקוני הסקירה), build, SQL מקומי, eval typecheck + dry-run.

**במיזוג (22.10):** שולב אחרי ענף התמלול, בלי התנגשויות בקוד. אחרי המיזוג: 668 יחידה, build, SQL מקומי (0001–0008).

**דרוש מדניאל:** שורות 6–7 בטבלה "דרוש מדניאל" למעלה. **לשילוב עם ענף הסוכנים:** להוסיף את ארבעת כלי `gmail_*` ל-`CAPABILITIES['mail.read']` (`docs/progress/gmail-read.md` → "פתוח / לשילוב").

### 2026-10-22 — סוכנים: מובנים ומותאמים (שולב מענף נפרד)

> פירוט מלא: `docs/progress/agents.md`; העיצוב: `docs/design/agents.md`. נבנה במקביל לתמלול, ל-Gmail ול-HYP ומוזג אחרי התמלול וה-Gmail.

**מה נעשה (בענף)**
- 99 ₪ = סוכן אחד משלך · 299 ₪ = שלושת המובנים (מזכירה, מתמחה, מנהלת חשבונות) ועד 3 סוכנים משלך. בניסיון: המובנים כמו שהם.
- מיגרציה **0006_agents.sql**: אילוצים, `agent_custom_limit`, הטריגרים `enforce_agent_rules` ו-`enforce_agent_daily_cap`, ייחוס (`agent_key`/`agent_name`), `messages.hidden_from_model`, `pending_action_kind += forward_mail`. ‏`run-local.sh` מריץ גם בדיקת מקביליות בשני סשנים.
- `lib/agents/` (יכולות → כלים לפי ספק, תבניות, policy, ניתוב `@שם`, prompt, שומר נמענים ותקרה יומית, service, פקודות וואטסאפ), כלי `forward_email` (Microsoft 365), סקשן "הסוכנים שלי" באזור האישי.

**במיזוג**
- התנגשות אחת ב-`lib/db/memory.ts` (`deleteUser`): נשמרו גם ניתוק הפנקס של Google (`user_id = null`) וגם מחיקת הסוכנים.
- **Gmail × סוכנים:** היכולת `mail.read` ממפה עכשיו גם את `gmail_search_emails`, `gmail_get_email`, `gmail_get_thread`, `gmail_awaiting_reply` (כמו שביקש ענף ה-Gmail), והבדיקה "every tool is classified" בונה את כלי Google עם `gmail.readonly` ועם `gmailReadEnabled: true`, כך שכלי Gmail חדש שלא סווג מפיל אותה. בדיקה חדשה: סוכן עם `mail.read` מקבל את ארבעת הכלים, בלי `gmail_draft_email`. הטבלה ב-`docs/design/agents.md` §3 עודכנה.
- מספרי המיגרציות: 0006 (סוכנים), 0008 (Gmail); 0007 שמורה ל-HYP שמוזג הבא.

**בדיקות:** 770 יחידה, lint, typecheck, build, SQL מקומי (0001–0008, כולל מקביליות).

**דרוש מדניאל:** להריץ את 0006 לפני הפריסה (הקוד קורא את העמודות החדשות); אישור הדביקות של 10 דקות ובחירת הסוכן ע"י ה-router (`docs/progress/agents.md`).

### 2026-10-22 — תשלום מתוך וואטסאפ: לחיצה אחת עם טוקן שמור, קבלות בשיחה, ניסיונות חוזרים, ביטול ומעבר מסלול

**מה נעשה** (פירוט: `docs/progress/hyp.md`)
- **שדרוג בלחיצה**: "שדרוג" או 750 הודעות בבסיסי → הצעה עם סכום יחסי עד סוף התקופה, מע״מ ו-4 ספרות של הכרטיס → `[שדרוג עכשיו]` → `action=soft` עם `Token=True` + `SendHesh=True` → פרו מיד והמכסה עולה ל-3,000. אותו מנגנון ל"ניסיון חוזר", "חידוש מנוי" ו"המשך מנוי".
- **בטיחות החיוב**: טבלת `billing_approvals` (מיגרציה 0007) — חיוב רק מלחיצה של המספר הפעיל המקושר שאליו נשלחה ההצעה, תוך 10 דקות (CHECK במסד), claim אטומי, חיוב אחד לכל אישור, חיוב פתוח אחד למשתמש (גם מול החיוב החודשי), "לא ידוע" חוסם עד בירור ידני, הכול ב-`audit_log`.
- **קבלה בשיחה** אחרי כל חיוב (PDF דרך `/invoice/<token>` שמבקש `PrintHesh` טרי; מחוץ לחלון — תבנית `payment_receipt`), והפקודה **"קבלה"**.
- **חיוב חודשי שנכשל**: ימים 1/3/5 → `[ניסיון חוזר] [עדכון כרטיס]`, השהיה אחרי יום 7; כרטיס לא שמיש → בלי ניסיונות אוטומטיים; תקלת הגדרה שלנו → בלי הודעה ללקוח. **עדכון כרטיס**: דף HYP חדש בכל לחיצה (J2, בלי חיוב) → `getToken` עם `allowFalse=True`.
- **ביטול / מעבר לבסיסי** מהשיחה, עם כפתור אישור, בתוקף מסוף התקופה.
- `docs/hyp-setup.md` (חדש): מה לבקש מ-HYP, הגדרות הפורטל, משתני סביבה, מסוף וכרטיסי בדיקה, תסריט בדיקה, סוג המסמך, בירור "לא ידוע", החזרים, מעבר ל-production. 3 תבניות וואטסאפ חדשות + `payment_failed` מעודכנת (10 לרישום).

**איך בודקים**
```bash
pnpm vitest run lib/bot/billing-wa.test.ts lib/billing app/api/pay
DB_NAME=whatsappbot_hyp_test supabase/tests/run-local.sh
```
ידנית במסוף בדיקה של HYP: `docs/hyp-setup.md` §4.

**בדיקות**: 632 יחידה, Supabase מקומי (כולל `billing_whatsapp.test.sql`), build, eval typecheck + dry-run.

**דרוש מדניאל**: הבקשות מ-HYP והגדרות הפורטל (`docs/hyp-setup.md` §1–2), `HYP_*` ב-Vercel, רישום התבניות החדשות ב-Meta.

### 2026-10-22 — תשלום מתוך וואטסאפ: תיקוני סקירה (חיוב כפול, מחזורי חיוב, עדכון כרטיס, מכסה)

**מה תוקן** (פירוט: `docs/progress/hyp.md`, `docs/hyp-setup.md`)
- **חיוב כפול**: המנוי מתעדכן לפני שהאישור / שורת ה-`renewal` יוצאים מ-`processing` (המנעול משתחרר אחרון), החיוב החודשי קורא את המנוי שוב אחרי שלקח את המנעול, ואין יותר פנייה ל-HYP (`invoiceUrl`) כשהמנעול מוחזק. בדיקות: לחיצה אחרי כל שלב של החיוב החודשי / של שדרוג מקביל → חיוב אחד.
- **הצעה למחזור אחר**: שדרוג נבדק מול `period_end` וניסיון חוזר מול `due` + מצב ההשהיה; חיוב חודשי שעבר בינתיים, מחזור שהסתיים, השהיה או שינוי מסלול → "המצב השתנה", בלי חיוב.
- **המשך מנוי פעמיים** באותו מחזור השאיר מנוי פעיל בלי משימת חיוב — מפתח משימה לכל המשך, ו-`scheduleCharge` לא משאיר מנוי בלי משימה כשמפתח כבר שימש.
- **עדכון כרטיס אחרי כישלון "כרטיס"**: הניסיונות האוטומטיים חוזרים ביום הניסיון הבא עם הכרטיס החדש (קודם: השהיה ביום 7 בלי לנסות). מחוץ לחלון — תבנית `payment_failed` / `account_paused` עם `[ניסיון חוזר]`. רק `CCode=600` מעדכן כרטיס; `CCode=0` → לא נשמר, שגיאה למפעיל.
- **מכסה 750**: כל הודעה מקבלת תשובה (הצעה פעם ב-6 שעות, ובין לבין שורה קצרה), ההודעה האחרונה נשמרת, הזמן נרשם רק אחרי שההצעה נשלחה.
- **"שדרוג" בפרו עם מעבר מתוכנן** מבטל את המעבר רק בלחיצה (`keep_pro`, מיגרציה 0007). מעבר לבסיסי בחיוב החודשי מוריד גם את מכסת החודש (`lower_plan_limit()`).
- **אישור בלי מזהה עסקה** (`CCode=0`, `Id` חסר) → "לא ידוע", לא דחייה.
- **"החזר כספי"**: תשובה שלא מבטיחה מה שלא קיים ("הבקשה נרשמה, והתשובה תישלח למייל"), שורת audit עם העסקה האחרונה ושגיאה בלוג למפעיל.
- שם המוצר בפקודות נבנה מ-`lib/brand.ts`; בדיקת "שלח/י" בבדיקות הטקסטים תוקנה (`\b` לא תופס אותיות עבריות); `bill.past_due_day1/3/5` המתים הוסרו; "קבלה נשלחת אוטומטית במייל" בדף התשלום ובדף הבית.

### 2026-10-22 — מיזוג תשלום מתוך וואטסאפ (HYP) אחרי התמלול, ה-Gmail והסוכנים

> שני הסעיפים הקודמים נכתבו בענף `worktree-wf_01acec0d-90f-2`; פירוט: `docs/progress/hyp.md`, `docs/hyp-setup.md`.

**התנגשויות שנפתרו (כל ההתנהגויות נשמרו)**
- `lib/db/types.ts` / `memory.ts` / `supabase.ts` / `memory.test.ts`: הסוכנים (0006) ואישורי החיוב (0007) נוספו זה לצד זה — טיפוסים, מתודות, ניקוי ב-`deleteUser` (גם הפנקס של Google), בדיקות.
- `lib/billing/plans.ts`: מכסות הסוכנים (`customAgents`, `effectivePlan`…) יחד עם לוח הניסיונות החדש (ימים 1/3/5/7, `chargeAttemptAt`).
- `lib/wa/templates.ts` + `docs/copy/wa-templates.md`: התבניות החדשות של HYP, ו-`payment_success` בנוסח של דניאל ("קבלה נשלחה אוטומטית למייל").
- `README.md`: שורת HYP מהענף, ושורת OpenRouter מענף התמלול (בלי Soniox כחובה).

**התאמות בין הענפים**
- **שם סוכן מול פקודת חיוב:** בבסיסי, באשף "סוכן חדש", השם "חשבוניות" נתפס כפקודה "קבלה" (שלב 3a רץ לפני 5b). עכשיו פקודות החיוב לא נבדקות כשהאשף מחכה לטקסט: שם, הנחיות, כתובות, או עריכת הנחיות/כתובות (`agentDraftAwaitsText` ב-`lib/agents/commands.ts`). בשלבים של כפתורים, ובלי אשף, "קבלה"/"שדרוג" עובדות כמו קודם. בדיקה: `lib/agents/commands.test.ts`, והבדיקה הקיימת ב-`agents-flow.test.ts` עוברת שוב.
- **טקסטי החיוב לפי מסלולי הסוכנים:** הצעת השדרוג ו"שודרג" אומרות "שלושת הסוכנים המובנים ועד 3 סוכנים משלך". אישור המעבר לבסיסי מסביר מה קורה לסוכנים: בלי המובנים, והסוכן הוותיק משלך נשאר פעיל, השאר נעולים (`lib/copy/bot-billing.ts`, `docs/copy/bot-copy-billing.md`).
- **מיגרציות:** 0006 סוכנים · 0007 אישורי חיוב · 0008 פנקס Google — מספרים ייחודיים, בלי שינוי מספור.

**בדיקות:** 880 יחידה, lint, typecheck, build, SQL מקומי (0001–0008, כולל `billing_whatsapp.test.sql` ומקביליות), e2e 19/19.

**דרוש מדניאל:** להריץ 0006, 0007 ו-0008 לפי הסדר ב-Supabase לפני הפריסה.

### 2026-10-22 — שילוב ארבעת הענפים + בקשות דניאל: דף התשלום, "לאזור האישי", מקף קצר

> השילוב: תמלול (OpenRouter) ← Gmail ← סוכנים ← HYP, כל אחד ב-merge נפרד עם gates (הסעיפים למעלה). מיגרציות שנוספו מאז `d107fbc`: `0006_agents.sql`, `0007_billing_whatsapp.sql`, `0008_google_user_cap.sql` (ייחודיות ובסדר, בלי שינוי מספור).

**(א) דף התשלום בשפת האתר** (`app/pay/[token]/page.tsx`, `plan-card.tsx`, `app/pay/_components/pay-ui.tsx`)
- אותה במה כהה, wordmark ושורה בכתב יד + כותרת כמו בהרשמה. שני המסלולים כ"ניירות": בסיסי על נייר השמנת, **פרו על נייר דבש**. מחיר בספרות גדולות, "כולל מע״מ 15.10 ₪ / 45.61 ₪" (`vatOf`), המכסה ורשימת היכולות מאותו מקור כמו בדף הבית (`lib/billing/plans.ts` דרך `PRICING`). הדוכיפת עומדת על קצה הנייר (על פרו כשהם זה לצד זה). מתחת: המחירים כוללים מע״מ (18%), התשלום בדף המאובטח של HYP, קבלה במייל וביטול בכל רגע, ואישור תנאי השימוש עם קישור.
- שלושה מצבים: בחירת מסלול (ניסיון / הסתיים; "הסדרת התשלום" כשהחיוב לא עבר; "חידוש המנוי" אחרי ביטול, עם הפניה ל"המשך מנוי" בלי חיוב כשהתקופה עוד פעילה); **מנוי פעיל → "עדכון כרטיס"** דרך `/pay/card/<token>` (בדיקת J2 בלי חיוב, הזרימה מענף HYP) במקום תשלום חודש נוסף בטעות; קישור לא תקף → איך מבקשים חדש ("תשלום" בוואטסאפ). `noindex`.
- **`/pay/done` (חדש):** מי שמשלם מקישור בוואטסאפ בטלפון, בלי כניסה באתר, הגיע אחרי HYP ל-`/account` ומשם לכניסה, וההודעה הלכה לאיבוד. עכשיו `/api/pay/return` ו-`/pay/card/<token>` שולחים דפדפן מחובר ל-`/account` כמו קודם, ודפדפן לא מחובר ל-`/pay/done?r=<קוד>`: הדוכיפת חוגגת או חושבת, טקסט קבוע לכל קוד (`lib/billing/result.ts`, אף פעם לא טקסט מה-URL) וכפתור "חזרה לוואטסאפ".
- צבעי נייר הדבש נוספו לבדיקת הניגודיות (`lib/design/tokens.ts`).

**(ב) "לאזור האישי" כשמחוברים**
- דף הבית: חור דינמי קטן (`components/auth/by-session.tsx`, `<Suspense>` שקורא את עוגיית ה-session בלי מסד נתונים) מוסיף בקצה הכותרת (שמאל) גלולת דבש "לאזור האישי" במראה של "בואו נתחיל - לוקח דקה", ומוריד את "כניסה" שליד הקריאה לפעולה. שאר הדף נשאר prerendered (ב-build: `◐ /`).
- מעטפת ההרשמה והכניסה: "לאזור האישי" במקום "כבר יש לך חשבון? כניסה" כשמחוברים (למשל `/start/ready` מ"קישור מספר" באזור האישי). אחרי קוד נכון בתוך ההרשמה הכותרת מתחלפת מיד (`useMarkSignedIn`), כי ה-layout קרא את העוגייה לפני הקוד. גם בדפי התשלום.

**(ג) מקף קצר בכל טקסט האתר**
- "—" ו-"–" הוחלפו ב-"-" ב-`app/`, `components/`, ב-metadata ובכותרות, בתיאור ב-`lib/brand.ts`, בפס ההדגמה, בהודעות שמוצגות באתר (סוכנים, תשלום, סטטוס המנוי) ובהנחיות התבניות שמוצגות בטופס הסוכן. הניסוח לא השתנה.
- הטיוטות המשפטיות עוברות `siteDashes` בהצגה (`lib/legal/markdown.tsx`), כך ש-`docs/legal` נשאר המקור בלי שינוי.
- בדיקה חדשה `lib/design/dashes.test.tsx` סורקת כל מחרוזת, template ו-JSX ב-`app/` וב-`components/` (לא הערות) ואת הדפים המשפטיים. הכלל נכתב ב-`docs/copy/style-guide.md`. הטקסטים של וואטסאפ, המיילים והקבלות של HYP לא בכלל הזה.

**בדיקות:** 896 יחידה (חדשות: `lib/billing/result.test.ts`, `components/auth/shell-session.test.tsx`, `lib/design/dashes.test.tsx`, נחיתה מחוברת/לא מחוברת, routes של התשלום עם ובלי session), lint, typecheck, build, e2e 21/21 (חדש: `e2e/pay.spec.ts`; ב-`screens.spec.ts` גם דף התשלום, עדכון הכרטיס ו-`/pay/done` בשלושה רוחבים, בלי גלילה אופקית ו-axe נקי; בהרשמה ובאזור האישי הכותרת המחוברת), e2e:demo 3/3, eval typecheck + dry-run.

**דרוש מדניאל:** לעבור על דף התשלום (שלושת המצבים) ועל `/pay/done` בטלפון. ב-HYP: אותה כתובת חזרה `/api/pay/return` (ללא שינוי).

### 2026-10-22 — בדיקת אימות סופית: `hasSession` רק בזמן בקשה

- **תיקון:** בשרת הפיתוח (`next dev`, cacheComponents) כל כניסה מחוברת לדף עם חור ה-session (`/start/*`, `/login/*`, `/`, דפי התשלום) רשמה שגיאה "Next.js encountered the unstable value `new Date()` while prerendering": `hasSession` קרא את העוגייה ובדק תפוגה מול השעה הנוכחית בלי `connection()`. עכשיו `hasSession` (`lib/auth/current-user.ts`) קורא קודם ל-`await connection()`, כמו שאר הדפים שבודקים session. בפרודקשן לא היה שינוי התנהגות (החור כבר דינמי); השגיאה נעלמה מיומן השרת ב-e2e (0 מופעים, היו בכל ריצה).
- **אימות:** lint, typecheck, 896 יחידה, build, e2e 21/21, e2e:demo 3/3, SQL מקומי (כל הבדיקות), eval typecheck + dry-run. צילומים של DEMO_MODE בפרודקשן ב-1280 וב-375: `/`, `/start/email`, `/start/code`, `/account` אחרי הרשמה בקוד 123456, `/pay/<token>` מהאזור האישי ו-`/` מחובר: אין "—" או "–" בטקסט הגלוי, גלולת הדבש "לאזור האישי" בדף הבית כשמחוברים, דף התשלום בשפת האתר.

### 2026-10-22 — AI חי בהדגמה (`LIVE_AI`), תקרת הוצאה יומית, והצ'אט באתר (`/demo/chat`)

> התוכנית "בדיקה אמיתית של עלזה" §2–§3 (דניאל: צ'אט "כמו וואטסאפ" באתר עם AI ותמלול אמיתיים; תקרה $3 ליום). הסליקה נדחתה להמשך.

**(א) `LIVE_AI=1` — רק יחד עם `DEMO_MODE=1`**
- `lib/env.ts`: `liveAiFlag()`, `liveAiInDemo()`, `aiMocked()`, `sttMocked()`. `lib/ai/index.ts` שואל את `aiMocked()` ו-`lib/stt/env.ts` את `sttMocked()`; כל שאר האינטגרציות (וואטסאפ, מייל, HYP, Microsoft, Google, התור) נשארות על `integrationsMocked()` — מדומות תמיד בהדגמה.
- בהדגמה עם `LIVE_AI` התמלול הוא OpenRouter בלבד (`deepgram/nova-3` → `openai/gpt-transcribe`), או mock אם `STT_PROVIDER=mock`. בלי `LIVE_AI` — בדיוק כמו קודם; `LIVE_AI` מחוץ להדגמה לא משנה כלום.
- `lib/demo.ts` עדיין מסרב למפתחות ששולחים דברים באמת; מפתחות ה-AI מותרים (תועד). `/api/health` מחזיר `"liveAi": true|false`; הודעת העלייה (`instrumentation.ts`) אומרת אם ה-AI חי.

**(ב) תקרות (`lib/ai/budget.ts`, מיגרציה `0009_ai_spend.sql`)**
- `ai_spend` (יום → עלות וקריאות, בלי מידע על משתמשים) ו-`ai_spend_users` (יום × משתמש → הודעות, נמחק עם המשתמש). RLS בלי policy, שרת בלבד; הפונקציות `ai_spend_add` ו-`ai_spend_admit_message` (אטומית: סופרת רק מתחת למכסה, `-1` כשמלאה). היום = לוח השנה של ישראל. MemoryDb עם אותה התנהגות; SupabaseDb דרך rpc.
- בכל הודעה ה-pipeline עוטף את המודל והתמלול (`SpendTurn`): בדיקה **לפני כל קריאה** (router, חזק, סיכום זיכרון, תמלול), רישום העלות בפועל אחרי (מחירון Anthropic הקיים ב-`lib/ai/anthropic.ts`, `usage.cost` של OpenRouter, הערכה שמרנית כשאין דיווח). הקריאה הראשונה סופרת את ההודעה במכסת המשתמש. בדיקה מקדימה לפני ההקלטה ולפני ספירת הניסיון: הודעה שנחסמה לא עולה כלום ולא נספרת.
- כשמגיעים לתקרה: "הגענו לתקרת הבדיקות של היום. אפשר להמשיך מחר." / "הגענו ל-60 הודעות היום, המכסה של גרסת הבדיקה. אפשר להמשיך מחר." (`lib/copy/bot-live.ts`, `docs/copy/bot-copy-live.md`). ברירות מחדל: `AI_DAILY_BUDGET_USD=3`, `DEMO_USER_DAILY_MESSAGES=60`; ערך לא תקין → שגיאה בעברית עם שם המשתנה. מחוץ להדגמה התקרה פועלת רק אם `AI_DAILY_BUDGET_USD` מוגדר.

**(ג) הצ'אט באתר — `/demo/chat` + `app/api/demo/chat`**
- רק בהדגמה ורק למשתמש מחובר: `proxy.ts` מחזיר 404 אמיתי לפני הדף, והדף והנתיב בודקים שוב (הנתיב: 404 / 401). כניסה מהאזור האישי: "לבדוק את עלזה בצ'אט" (בהדגמה בלבד), והמספר הווירטואלי מוצג שם כ"הצ'אט באתר".
- **אותו pipeline:** `processInbound` עם sender מקליט לבקשה (`lib/demo-chat/`). לכל משתמש מספר וירטואלי שנגזר מ-`demo-<userId>` (`+999…`, כי `wa_identities` מקבל רק E.164); בפעם הראשונה הוא מקושר ומקבלים את ההיכרות הרגילה (`welcomeLinkedPhone`, משותף לקישור מוואטסאפ). `lib/bot/handle-inbound.ts` חשף `botContext()` — אותו חיווט (Graph/Google, executors, תקרות) עם sender ו-Db אחרים.
- **היסטוריה:** `ChatTranscript` עוטף את שכבת הנתונים: מה שה-pipeline שולח ולא שומר בעצמו (ההיכרות, טיוטה עם כפתורים, תוצאת כפתור) נשמר לפי הסדר עם `hidden_from_model` — ההקשר של המודל זהה לוואטסאפ. כפתורים ורשימות נשמרים כ-`wa-interactive:<json>`; משפט של העוזרת שלא נשלח (ליד טיוטה) מסומן ולא מוצג.
- **הקלטה:** MediaRecorder (webm/ogg, ב-Safari mp4), 32kbps, עד דקה ו-2MB; עולה כקובץ ועוברת במסלול ההודעה הקולית הרגיל דרך מקור מדיה בזיכרון (`RecordingWaSender.media`), בלי לשכפל לוגיקה. המיקרופון מותר רק בעמוד הזה (`Permissions-Policy: microphone=(self)`).
- **כפתורים:** כל לחיצה נשלחת כ-button / list reply. מזהה שמפנה לשורה (טיוטה `pa:`, תזכורת `rem:`, חיוב `bill:`, סוכן `ag:`) מתקבל רק אם השורה של אותו משתמש — אחרת 403 לפני שה-pipeline רץ; קידומות לא מוכרות נדחות.
- **הגבלות:** 20 בקשות לדקה למשתמש, 60 ל-IP, עד 2,000 תווים, Origin של אתר אחר נדחה; הודעות שגיאה בעברית.
- **עיצוב ("לילה ירוק"):** מסגרת הטלפון (`PhoneMockup`, עם הסתרת אי המצלמה בטלפון) בצד, ופסקת הסבר קצרה במסך רחב; בטלפון הצ'אט הוא המסך כולו (`app/globals.css` מצמיד את הדף לגובה המסך). בועות, `TypingDots` ("מקלידה…" / "מקשיבה…"), `VoiceNote` עם התמלול, `WaButtons`, רשימה נפתחת, קבצים וקישורים, `*מודגש*` ו-`>` ציטוט כמו בוואטסאפ, ושלוש הצעות להתחלה. הטקסט של הבוט עובר `siteDashes` (מקף קצר בלבד באתר).

**בדיקות:** יחידה חדשות — `lib/ai/budget.test.ts` (גבולות, עלויות, חסימה לפני קריאה, אמצע תור, מכסה למשתמש, מעבר יום בישראל, הקלטות, כשל סגור), `lib/db/supabase-ai-spend.test.ts`, `lib/copy/bot-live.test.ts`, `lib/demo-chat/format.test.ts`, `app/api/demo/chat/demo-chat-route.test.ts` (404/401, Origin, 429, ולידציה, קישור והיכרות, טקסט → כפתור → טיוטה → בטל עם היסטוריה זהה, כפתור של משתמש אחר / מזויף → 403 בלי עיבוד, הקלטה דרך מסלול הקול, גבולות הקלטה, תקרה עם `LIVE_AI` בלי קריאה למודל), `lib/demo-factories.test.ts` (הדגל מפעיל רק AI ותמלול), `proxy.test.ts` (404 ומיקרופון), SQL `supabase/tests/ai_spend.test.sql`. e2e:demo חדש: `/demo/chat` — 404 בלי כניסה, מהאזור האישי, ההיכרות, לחיצה על "נתחיל לעבוד", טיוטה מהודעה מוקלדת, "בטל", היסטוריה אחרי רענון, ומסך מלא ברוחב 390.

**דרוש מדניאל:** שורות 9–10 בטבלה למעלה. אחרי הפריסה: `/account` → "לבדוק את עלזה בצ'אט".

## וואטסאפ חי בהדגמה (`LIVE_WA=1`)
> משימה: לחבר את מספר הבדיקה של Meta לאתר החי (`docs/meta-setup.md`).
- `lib/demo.ts`: `liveWaFlag()`. עם `LIVE_WA=1` ההדגמה מתירה את `WA_ACCESS_TOKEN` בלבד; שאר המפתחות ששולחים דברים באמת (מייל, HYP, Microsoft, Google, QStash) עדיין נדחים.
- `lib/env.ts`: `liveWaInDemo()` ו-`waMocked()`. `lib/wa/index.ts` שואל את `waMocked()`: בהדגמה עם `LIVE_WA` השליחה אמיתית דרך ה-Cloud API, חוץ ממספרים וירטואליים של הצ'אט באתר (`+999…`), שנרשמים ולא נשלחים ל-Meta. הצ'אט באתר ממשיך עם ה-sender המקליט שלו.
- ה-webhook (`/api/wa/webhook`) דורש `WA_VERIFY_TOKEN` ו-`META_APP_SECRET` (חתימה), התור נשאר מקומי (`LocalQueue`) וה-worker מאומת בסוד הפנימי.
- בדיקות: `lib/demo-factories.test.ts` — הדגל מתיר רק את טוקן הוואטסאפ, שליחה למספר וירטואלי לא מגיעה ל-Meta, ו-`LIVE_WA` מחוץ להדגמה לא משנה כלום.
- **דרוש מדניאל:** להעביר את Deployment Protection ל-Standard (`docs/meta-setup.md` §8), ואז להגדיר את ה-webhook ב-Meta (§6).

### 2026-10-22 — תיקוני סקירה: תקרת ההוצאה, ההיכרות בצ'אט באתר, וההקלטה

> סקירת `/demo/chat` ו-`LIVE_AI`: שני ממצאים חוסמים ושבעה קטנים.

**חוסם 1 — AI חי בלי Supabase בפריסה.** בזיכרון כל instance של Vercel החזיק תקרה משלו (ומתאפסת בכל הפעלה), כלומר לא הייתה תקרה. עכשיו `spendLimits()` (`lib/ai/budget.ts`) זורק `EnvError` בעברית כש-`LIVE_AI` בהדגמה רץ בפריסה (`NODE_ENV=production` או `VERCEL`) על הזיכרון: ההודעה הראשונה נענית ב-503 עם `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, והמודל לא נקרא. מקומית (`next dev`) מותר. תועד ב-`.env.example` וב-`docs/deploy.md` §6 ו-§9.

**חוסם 2 — בקשה שנשמרה כשם.** ההצעות להתחלה נשארו מתחת לשאלה "איך לקרוא לך?", ולחיצה עליהן נשמרה כשם ("נעים להכיר, תזכירי לי מחר ב-9…"). עכשיו:
- `awaiting` ב-GET וב-POST של `/api/demo/chat` (`awaitingAnswer()` ב-`lib/bot/onboarding.ts`): כל עוד ההיכרות מחכה לשם, לשם העסק או לבחירה מרשימה, הדף מסתיר את ההצעות.
- `looksLikeRequest()`: שאלה, מילת בקשה בהתחלה ("תזכירי", "תנסח", "מה", "אפשר"…), ספרות בשם או יותר מדי מילים — לא נשמרים כשם או כשם עסק. העוזרת עונה על הבקשה, ואחריה השאלה חוזרת (`onb.ask_name_again`, `onb.ask_business_again`, או הרשימה שוב). "תודה" / "סבבה" במקום שם — השאלה חוזרת בלי מודל. "קוראים לי דנה" → "דנה". עובד גם בוואטסאפ, כי זה אותו pipeline.

**תקרה בלי חריגה במקביל (מיגרציה `0010_ai_spend_reserve.sql`).** במקום "לקרוא סכום → לקרוא ל-API → להוסיף": `ai_spend_reserve(day, est, budget)` שומר מראש הערכה עליונה (אטומי, נדחה אם הסכום היה עובר את התקרה), ו-`ai_spend_adjust(day, delta)` מתקן לעלות בפועל אחרי הקריאה. ההערכה: כל בייט בבקשה כטוקן במחיר כתיבת cache, ועוד כל ה-`max_tokens`; בתמלול — הגודל ב-6kbps, פעמיים (ספק וגיבוי). שגיאה עם סטטוס מהספק מחזירה את המקום; timeout או חיבור שנפל — ההערכה נשארת. כתיבה שנכשלה לפני הקריאה = אין קריאה (נכשל סגור); תיקון שנכשל מעל ההערכה עובר לשמירה הבאה בתהליך. MemoryDb ו-SupabaseDb עם אותה התנהגות.

**זמן.** כל הקריאות של הודעה חולקות 48 שניות (`DEMO_TURN_MS`) כ-AbortSignal, ל-Anthropic ולתמלול. בהדגמה החיה Anthropic מחכה עד 25 שניות עם ניסיון חוזר אחד (`ANTHROPIC_REQUEST_DEMO`), כך שאין קריאה שמחויבת אחרי שהנתיב (60 שניות) נעצר.

**הקלטה.** רק webm, ogg ו-mp4 (מה שהדפדפן מקליט), עד 512KB. האורך נמדד גם ב-WebM (`lib/stt/webm.ts`: Cluster Timecode + SimpleBlock, גם בגודל לא ידוע כמו ב-MediaRecorder), וגוף הבקשה נקרא רק עד הגבול גם בלי Content-Length. כשספק לא מדווח עלות ולא אורך, העלות מוערכת מגודל הקובץ. אורך ההקלטה נשמר במזהה המדיה של השורה, ולכן מוצג גם אחרי רענון; בבועה של ההקלטה של המשתמש מוצג מיקרופון במקום כפתור ניגון שלא עשה כלום.

**הדף.** לחיצה כפולה על המיקרופון לא פותחת שני זרמים, ויציאה מהדף בזמן בקשת ההרשאה משחררת את המיקרופון. רשימה ("לבחירה") שנפתחת נגללת לתצוגה. תיבת ההודעה ב-16px בטלפון (iOS לא מגדיל את הדף).

**בדיקות:** `lib/ai/budget.test.ts` (סירוב בפריסה על זיכרון, הערכות, שמירה במקביל, החזרה בשגיאת ספק, העברת תיקון שנכשל, AbortSignal), `lib/ai/anthropic.test.ts` (signal), `lib/stt/webm.test.ts`, `lib/bot/onboarding-answers.test.ts`, `lib/db/supabase-ai-spend.test.ts`, `app/api/demo/chat/demo-chat-route.test.ts` (התרחיש מהסקירה: הצעה במקום שם, `awaiting`, אורך אחרי רענון, סוגים, 512KB, WebM ארוך, העלאה בלי Content-Length), SQL `ai_spend.test.sql` + בדיקת שתי שמירות במקביל ב-`run-local.sh`.

**דרוש מדניאל:** להריץ ב-Supabase גם את `supabase/migrations/0010_ai_spend_reserve.sql` (אחרי 0009) לפני `LIVE_AI=1`.

## וואטסאפ חי - תיקונים מהבדיקה הראשונה עם דניאל
- **הודעות שלא קיבלו תשובה אחרי הקישור:** בלי QStash, התור המקומי שלח את העבודה ל-worker בתוך `after()` בלי לחכות לה, ו-Vercel הקפיא את הפונקציה באמצע. נוסף `drain()` ל-`LocalQueue` (ול-`Queue` כאופציונלי), וה-webhook וה-`/api/jobs/tick` מחכים לו. ל-webhook נוסף `maxDuration = 300`.
- **סימני התקדמות (בקשת דניאל):** שלוש הנקודות של "מקלידה" מיד (ושוב אחרי "רק שנייה…" וכל 20 שניות), 👀 על ההודעה מיד, "רק שנייה…" אם אחרי 4 שניות עוד לא נשלחה תשובה (פעם אחת, לא נשמר בהיסטוריה), ו-✅ במקום ה-👀 בסיום. `lib/bot/process-inbound.ts` (`startProgress`), הטקסט ב-`lib/copy/bot-live.ts` (`progress.wait`).
- **QR וכפתור הוואטסאפ ב-`/start/ready`:** עם `LIVE_WA=1` הם פותחים את וואטסאפ באמת, ולא את חלון ההסבר של ההדגמה.
- בדיקות: `lib/queue/local.test.ts`, "רק שנייה…" ב-`lib/bot/process-inbound.test.ts`, ועדכון הסדר ב-onboarding / voice.
- **רשימת "מה מעמיס" - כמה בחירות:** רשימה בוואטסאפ מאפשרת בחירה אחת להודעה (מגבלה של Meta). אחרי כל בחירה עלזה שולחת "עוד משהו שמעמיס?" עם מה שנשאר ועם השורה "זהו, מספיק"; הבחירות נשמרות ב-`profile.pain_points` (ו-`pain_point` נשאר הראשון). `lib/bot/onboarding.ts` (`sendPainList`), טקסטים ב-`lib/copy/bot.ts` ו-`docs/copy/bot-copy.md`.

## Microsoft ו-Google חיים בהדגמה (`LIVE_MS=1`, `LIVE_GOOGLE=1`)
> דניאל שאל למה "החיבור לגוגל" באתר לא דרש SSO: בהדגמה החיבור היה מדומה (fixture עם המייל של החשבון).
- `lib/demo.ts`: `liveMsFlag()` / `liveGoogleFlag()`; עם הדגל ההדגמה מתירה את `MS_CLIENT_SECRET` / `GOOGLE_CLIENT_SECRET` בהתאמה (ורק אותם).
- `lib/env.ts`: `liveMsInDemo()`, `msMocked()`, `liveGoogleInDemo()`, `googleMocked()`. `lib/ms/index.ts` ו-`lib/google/index.ts` שואלים אותם: עם הדגל - OAuth אמיתי מול Entra / GCP, Graph ו-Google APIs אמיתיים, ובלי fixture. `/api/auth/{microsoft,google}/start` מדלגים על `demoConnect` כשהספק חי.
- כתובות החזרה אומתו מול שני הספקים (`https://alze.vercel.app/api/auth/microsoft/callback`, `.../google/callback`). ה-webhook של Graph (`/api/graph/notify`) פתוח אחרי המעבר ל-Standard Protection.
- חיבורי ההדגמה הישנים (fixture) לא נמחקו מהמסד (המחיקה נחסמה); דניאל ניתק אותם מהאזור האישי, והחיבור האמיתי מחליף אותם.
- בדיקות: `lib/demo-factories.test.ts` - כל דגל פותח רק את הספק שלו, והסוד של הספק השני עדיין נדחה.

## בדיקה חיה של דניאל (23.10 לילה) - חשבון מיקרוסופט הלא נכון
- **התקלה:** דניאל חיבר שני חשבונות Microsoft באותו tenant (קודם חשבון ה-admin של onmicrosoft.com בלי תיבת דואר, אחר כך daniel@secureops.co.il). `activeMicrosoftConnection` בחר את הראשון ברשימה (הישן), ולכן כל קריאה למייל ול-OneDrive החזירה "התיבה לא פעילה".
- **התיקון:** `activeMicrosoftConnection` / `activeGoogleConnection` בוחרים את החיבור הפעיל האחרון. ה-callback של כל ספק מנתק עכשיו חיבורים קודמים של אותו ספק (`replaceOtherConnections` ב-`lib/account/service.ts`, דרך אותו ניתוק של האזור האישי) - חשבון אחד לכל ספק.
- בדיקה: `lib/account/service.test.ts`.

## מחקר קונקטורים לשוק הישראלי (23.10)
- `docs/research/connectors-israel.md`: Tier 1 - Microsoft To Do / Planner, קישורי Teams ו-Meet, Google Tasks ו-Contacts, מורנינג (חשבונית ירוקה), iCount, Hebcal / שער יציג / Waze, monday.com. Tier 2 ו-3 עם נימוקים ומקורות.
- חשוב: ב-tenant עם הגדרות ברירת מחדל רוב ההרשאות של Mail / Calendars / Files דורשות אישור מנהל - כדאי לבקש את כל ההרשאות של Tier 1 בבקשת אישור המנהל הראשונה.

## צ'אט התמיכה באתר ("שאלות ותמיכה")
> בקשת דניאל: צ'אט שנפתח באתר, עונה על שאלות על השירות, ומאפשר לפתוח פנייה - בעיצוב שלנו. החלטת דניאל: Haiku בלבד ותשובות קצרות מאוד. (PLAN §0 אומר "אין צ'אט באתר" - הכוונה הייתה לעבודה עם העוזרת; זה צ'אט תמיכה על השירות בלבד.)
- **הווידג'ט** (`components/brand/support-chat.tsx`): כפתור עגול עם הדוכיפת בפינה התחתונה בצד ימין (`start-*`, כפתור הנגישות בצד שמאל), `aria-label="שאלות ותמיכה"`. חלון קטן ב"לילה ירוק": פתיחה מעלזה, ארבעה נושאים ("מה עלזה עושה?", "כמה זה עולה?", "איך מתחברים?", "האם המידע שלי מאובטח?"), שדה שאלה, נקודות "מקלידה", ו"פתיחת פנייה". הבועות (`Bubble`, `TypingDots`) - כרטיס הלילה לעלזה ודבש לשואל. Esc סוגר והפוקוס חוזר לכפתור; פתיחה מעבירה פוקוס לשדה; `role="log"` מכריז על תשובות חדשות; בטלפון - גיליון תחתון ברוחב מלא. מוצג בדף הנחיתה, במסמכים המשפטיים ובאזור האישי בלבד.
- **תשובות** (`app/api/support/chat`, `lib/support/answer.ts`): מאגר ידע עברי (`lib/support/knowledge.ts`) מ-PLAN, מ-`lib/billing/plans.ts` (מחירים ומכסות מחושבים מהקוד), מהטקסטים של דף הנחיתה ומהטיוטות המשפטיות - כולל "פרנקפורט, האיחוד האירופי" ולא "שרתים בישראל". עם מודל: Haiku (שכבת ה-router), `max_tokens` 200, 1-3 משפטים, רק מתוך המאגר, סירוב לשאלות מחוץ לתחום, וסימון `[[פנייה]]` כשצריך פנייה. רק תחת התקרה היומית: `SpendGuard.anonymousAi` (`lib/ai/budget.ts`) שומר מקום ב-`ai_spend` ומתקן לעלות בפועל, בלי מכסה למשתמש (אין חשבון). בלי מודל, בלי תקרה מוגדרת, תקרה מלאה, שגיאה או תשובה חתוכה - התאמת מילות מפתח (כולל תחיליות ואותיות סופיות), או "לא בטוחה שהבנתי - אפשר לבחור נושא או לפתוח פנייה" עם הנושאים.
- **הגבלות:** 10 לדקה ו-60 ליום ל-IP, 500 תווים, עד 6 הודעות קודמות (zod), Origin (`lib/same-origin.ts`, משותף עם `/api/demo/chat`), בלי התחברות, ובלי רישום תוכן השיחה.
- **פניות** (`app/api/support/ticket`): שם, אימייל (ממולא מראש למשתמש מחובר, `GET`), נושא (לא חובה), תיאור, ובחירה לצרף את השיחה (עד 20 הודעות). zod עם שגיאה בעברית לכל שדה, honeypot, 5 לשעה ו-20 ליום ל-IP. נשמר בטבלה חדשה `support_tickets` (מיגרציה `0011_support_tickets.sql`, RLS בלי policy, `user_id` → null במחיקת חשבון) דרך `Db.createSupportTicket` (MemoryDb + SupabaseDb), ונשלח במייל ל-`SUPPORT_EMAIL` (`Mailer.sendSupportTicket`, Resend עם Reply-To; בהדגמה לקונסול, בלי התוכן). מייל שנכשל לא מכשיל את הפנייה. אישור: "הפנייה התקבלה. נחזור אליך במייל תוך יום עסקים."
- **טקסטים:** `docs/copy/support-chat.md`. **פריסה:** `docs/deploy.md` §10, `.env.example` (`SUPPORT_EMAIL`).
- **בדיקות:** `lib/support/knowledge.test.ts` (נושאים, מחירים מהקוד, בלי "בישראל", קול האתר, התאמות), `app/api/support/chat/support-chat-route.test.ts` (מאגר, Origin, 10 לדקה / 60 ליום, ולידציה, Haiku + 200 + הקשר, סימון פנייה, תקרה → מאגר בלי קריאה, שגיאת ספק / חיתוך → מאגר, בלי תקרה ב-production → בלי מודל), `app/api/support/ticket/support-ticket-route.test.ts` (שמירה, מייל, משתמש מחובר ומילוי מראש, ולידציה, honeypot, Origin, הגבלה, מייל שנכשל, `SUPPORT_EMAIL`), `components/brand/support-chat.test.tsx` (פתיחה, נושאים, שליחה, Esc ופוקוס, טופס הפנייה), `lib/ai/budget.test.ts` (`anonymousAi`), SQL `supabase/tests/support_tickets.test.sql`.

## תפריט נגישות באתר (בקשת דניאל)
> "הכי פשוט, משתלב בעיצוב, כפתור צף קטן עם הפונקציות הנדרשות, בצד שמאל, קטן כדי שלא ימשוך יותר מדי תשומת לב".
- **הכפתור:** עיגול 40px בפינה השמאלית התחתונה (`end-4`, כלומר inline-end ב-RTL), סמל הנגישות כ-SVG שלנו, צבעים שקטים (`night-2`, `line`, `cream-muted`), מיקוד גלוי, `aria-label="תפריט נגישות"`. הצד הימני נשאר פנוי לכפתור התמיכה. המשתנה `--fab-bottom` (`app/globals.css`) מרים את הכפתור מעל פס "בואו נתחיל" ב-`/start` בטלפון (`data-pinned-cta`) ומעל שורת ההקלדה ב-`/demo/chat` בטלפון; הכפתור לא מוסתר באף עמוד (ובהדפסה כן).
- **החלונית** (`components/brand/accessibility-widget.tsx`): הגדלת טקסט (3 דרגות: 112.5%/125%/150%), ניגודיות גבוהה, הדגשת קישורים, גופן קריא (Arial), עצירת אנימציות, ריווח שורות, איפוס הגדרות, וקישור ל"הצהרת נגישות". מתגים עם `role="switch"`, המיקוד עובר לחלונית, Esc סוגר ומחזיר את המיקוד לכפתור, Tab החוצה או לחיצה מחוץ סוגרים.
- **איך זה עובד:** כל הגדרה היא `data-a11y-*` על `<html>`, והעיצוב ב-`app/globals.css` (ניגודיות = אותה פלטה, מוקצנת). נשמר ב-`localStorage` (`alze:a11y`, בתוך try/catch) ומוחל לפני הציור הראשון בסקריפט קטן ב-`<head>` של `app/layout.tsx` (`A11Y_INIT_SCRIPT` ב-`lib/a11y/settings.ts`, עם `suppressHydrationWarning` על `<html>` בלבד). המצב המשותף ב-`lib/a11y/store.ts`.
- **עצירת אנימציות:** כמו "הפחתת תנועה" של המכשיר - CSS (אותו כלל של משך 0), `MotionConfig` (`components/brand/a11y-motion.tsx`), `useReducedMotion` משלנו (`lib/hooks/use-reduced-motion.ts`, במקום זה של motion בשבעה רכיבים), Lenis נכבה מיד, הקונפטי לא נורה, הסצנה הנעוצה בדף הנחיתה והדגמת השיחה בראש הדף מוצגות בלי תנועה. "הפחתת תנועה" של המכשיר ממשיכה לעבוד כמו קודם.
- **הצהרת הנגישות** (`docs/legal/accessibility-statement-he.md`, מוצגת ב-`/accessibility` ומקושרת מהפוטר): נוסף סעיף "תפריט הנגישות באתר", מגבלות ידועות (וואטסאפ, מסכי Microsoft/Google, עמוד הסליקה, הגדרות שנשמרות בדפדפן בלבד), ופנייה ל-`support@[domain]` כמו בתנאי השימוש.
- **בדיקות:** `components/brand/accessibility-widget.test.tsx` (פתיחה/סגירה, Esc, מיקוד, כל מתג ← מאפיין ושמירה, דרגות טקסט, איפוס, טעינה מהשמירה, אחסון חסום, הסקריפט המוטמע זהה ל-`applySettings`, `useReducedMotion`), `app/(legal)/accessibility/page.test.tsx`, ו-e2e `e2e/accessibility.spec.ts` (מיקום, מקלדת, שמירה אחרי רענון בלי שגיאת hydration, `/start` בטלפון, קישור להצהרה).
- **דרוש מדניאל:** שם החברה, ופרטי רכז/ת הנגישות (שם, טלפון, מייל) בהצהרה; בדיקה ידנית עם קורא מסך.

## פניות התמיכה במייל אמיתי + פרטי הצהרת הנגישות (23.10)
- `LIVE_SUPPORT_MAIL=1` (`lib/demo.ts`, `lib/env.ts` `liveSupportMailInDemo()`): בהדגמה רק המייל של פנייה מצ'אט התמיכה נשלח באמת דרך Resend (`lib/support/notify.ts`); קודי כניסה וכל שאר המיילים נשארים בקונסול. `MAIL_FROM` חדש (כתובת שולח בדומיין מאומת ב-Resend; ברירת מחדל no-reply@<APP_URL>).
- ב-Vercel: `SUPPORT_EMAIL=danielnotexist@gmail.com` (בחירת דניאל), `MAIL_FROM` בדומיין secureops.co.il המאומת ב-Resend.
- הצהרת הנגישות: שם החברה עלזה, רכז הנגישות דניאל כהן, 050-2164062, danielnotexist@gmail.com (מדניאל, 23.10). נשאר: מספר ח.פ.
- שדרוג מבסיסי לפרו: כבר קיים - משלמים רק את ההפרש היחסי עד סוף התקופה (`quoteUpgrade` ב-`lib/billing/money.ts`), ומהחידוש הבא 299 ₪. הבקשה בשפה חופשית בוואטסאפ מטופלת בתיקוני איכות הבוט.

## מחקר Instinct (23.10)
- `docs/research/instinct.md`: מה Instinct עושה (ביצוע עצמאי בדפדפן ענן, כרטיסים וירטואליים, שיחות, נסיעות, פרואקטיביות), הכשלים המתועדים שלו, ו-5 המלצות לעלזה (מנוע פרואקטיבי מהמייל והיומן, מגן פישינג / BEC, קישורי גבייה דרך הסולק של העסק, שכבת בטיחות, שיחות קוליות בשלב מאוחר). בלי מימוש.
- **ממצא לבדיקה מיידית:** לפי עמוד "AI Providers" של Meta (15.10.2026) ישראל לא ברשימת השווקים שבהם מותר עוזר AI כללי ב-WhatsApp Business. להשוות מול `docs/legal/meta-ai-clause-memo.md` ולהעביר לעו"ד.

## שדרוג מבסיסי לפרו באתר (באג שדניאל דיווח, 23.10)
> הבאג: באזור האישי מנוי בסיסי ראה "לשדרוג לפרו", אבל הכפתור הוביל ל-`/pay/<token>`, שלמנוי פעיל הציג רק "עדכון כרטיס" עם הערה "מעבר בין מסלולים... לכתוב 'שדרוג'". לא הייתה דרך לשדרג באתר.
- **דף השדרוג** (`/pay/<token>` למנוי בסיסי פעיל עם כרטיס שמור): נייר הדבש של פרו (כמו בבחירת המסלול) עם הסכום לתשלום עכשיו (ההפרש היחסי, אותו `quoteUpgrade` של וואטסאפ: (299-99) × ימים שנותרו / ימי המחזור, מינימום 1 ₪), המע״מ, מספר הימים ותאריך סוף התקופה, "מהחיוב הבא: 299 ₪", 4 הספרות של הכרטיס, מה נוסף בפרו (מ-`lib/billing/plans.ts` בלבד: 3,000 במקום 750, הסוכנים המובנים, 3 סוכנים משלך במקום אחד), כפתור "לשדרג עכשיו" וקישור "עדכון כרטיס" (`?view=card`). הפנים: `app/pay/[token]/upgrade-faces.tsx`.
- **אין שדרוג בלחיצה** (אין כרטיס שמור, תוקף הכרטיס עבר, חיוב חודשי שלא עבר, או שהחיוב החודשי בתהליך): דף עדכון הכרטיס עם הסבר קצר. מבוטל / מושהה - בחירת המסלול כמו קודם. מנוי פרו: עדכון כרטיס, וההערה הישנה הוחלפה בשורה ניטרלית "מעבר למסלול הבסיסי: בשיחה עם עלזה, לכתוב ״מעבר לבסיסי״" (אין מעבר לבסיסי באתר).
- **החיוב** (`upgradeAction` - server action, POST בלבד): אותו קוד חיוב של וואטסאפ. מה ש-`executeApproval` עשה הוצא ל-`executeClaimedCharge` ב-`lib/billing/one-tap.ts` (בדיקת התאמה למחזור, כרטיס, `action=soft` עם הסכום שהוצג ו-`Order` = מזהה האישור, שורת `payments`, עדכון המנוי לפני שחרור המנעול, audit `subscription.upgrade`), ושני הצדדים קוראים לו: הלחיצה בוואטסאפ והכפתור באתר (`lib/billing/web-upgrade.ts`). אחרי הצלחה: "המסלול שודרג לפרו" בדף (הסכום, הקבלה למייל, החיוב הבא וסכומו), ובוואטסאפ אותה הודעה "שודרג..." + הקבלה (בתוך החלון) או התבנית `payment_success` (מחוץ לחלון). כישלון: "השדרוג לא הושלם" עם הסיבה, "לנסות שוב" (הצעה חדשה) או "לעדכון הכרטיס", ושום דבר לא משתנה.
- **פעם אחת בלבד:** הדף חותם בטופס nonce חד-פעמי + הסכום + סוף התקופה (10 דקות, `createUpgradeOfferToken` ב-`lib/billing/links.ts`). הלחיצה יוצרת את שורת האישור ב-`billing_approvals` כבר תפוסה (`processing`) עם `id` = ה-nonce (`Db.openWebCharge`, מיגרציה `0012_billing_web_upgrade.sql`: שדרוג בלי טלפון רק עם `approved_msg_id = 'web:' || id`, אף פעם לא `pending`). לחיצה כפולה / רענון / "חזרה" ושליחה מחדש → אותו מפתח ראשי → אין אישור שני ואין חיוב שני, והדף מראה את התוצאה של הראשון (ממתין עד 8 שניות אם הוא עוד בתהליך). חיוב אחר פתוח (וואטסאפ, חודשי, "לא ידוע") → אותו אינדקס של 0007 → "יש חיוב קודם שעדיין בבדיקה". ההצעה חייבת להיות חתומה לאותו משתמש של הקישור - אי אפשר לשדרג חשבון אחר. בצד הלקוח הכפתור ננעל מהלחיצה הראשונה (`PendingSubmit`).
- **האזור האישי** (שינוי מקומי בכרטיס המנוי בלבד): למנוי בסיסי פעיל נוסף "לשדרוג לפרו", ו"עדכון אמצעי תשלום" מוביל ל-`?view=card`. "לשדרוג לפרו" באזור הסוכנים מגיע עכשיו ישר לדף השדרוג (אותו קישור).
- **הדגמה:** `MockHypGateway` - בלי חיוב אמיתי; החיוב המדומה מצליח. ב-`DATA_MODE=memory` בפיתוח `POST /api/dev/hyp {"charge": ["4"]}` מתכנן דחייה לחיוב הבא (ו-`GET` מחזיר כמה חיובים היו) - כך ה-e2e והצילומים עוברים גם במסלול הכישלון.
- **בדיקות:** `lib/billing/one-tap.test.ts` (וואטסאפ והאתר משאירים אותה טביעת רגל: אותה בקשה ל-HYP, אותו מנוי, אותו תשלום, אותו audit ואותה הודעה; אישור לא תואם / בלי כרטיס / דחייה לא מחייבים), `lib/billing/web-upgrade.test.ts` (דף ההצעה וחסימות, חיוב פעם אחת כולל במקביל ואחרי 10 דקות, הצעה של משתמש אחר / מזויפת / ישנה, מצב שהשתנה, חיוב פתוח, דחייה ונסיון חוזר, כרטיס, אין תשובה, preflight, הודעה בתוך החלון ומחוצה לו), `app/pay/[token]/actions.test.ts` (הקישור, ההצעה, כפילות, מצב, busy, שגיאה), `app/pay/[token]/upgrade-faces.test.tsx` (כל הפנים, מקף קצר בלבד), `app/api/dev/hyp/route.test.ts`, SQL `supabase/tests/billing_web_upgrade.test.sql`, ו-e2e `e2e/pay.spec.ts` (בסיסי → האזור האישי → שדרוג → דחייה → נסיון חוזר → פרו, רענון בלי חיוב נוסף) ו-`e2e/screens.spec.ts` (axe + גלישה אופקית לדף השדרוג).
## בדיקה חיה של דניאל (23.10 לילה) - תיקוני איכות בשיחה
- **ההיכרות לא בולעת בקשות:** "תביא לי את המייל האחרון שקיבלתי" נשמר כשם העסק, וברשימת "מה מעמיס" נשלחה שוב הרשימה בלי תשובה. `looksLikeRequest()` (`lib/bot/onboarding.ts`) מזהה עכשיו גם "תביא/תביאי", "תסדר", "תעבירי לי…" (פועל בגוף שני עם "לי"/"את"), שמות פועל ("לחבר", "לשדרג", "ליצור"), "אתה יכול…"/"אני צריכה…", שאלה, ברכה לפני הבקשה, ובזמן רשימה פתוחה - כל טקסט של שלוש מילים ומעלה. העוזרת עונה קודם, ואז השאלה חוזרת. שמות עסק כמו "משרד עו״ד לוי", "כהן רואי חשבון", "תמר עיצובים" עדיין מתקבלים; "תודה" במקום שם עסק מחזיר את השאלה, ו"אין לי עסק" מדלג בלי לשמור. בזמן ההיכרות, בקשת חיבור ("הג׳ימייל") ותהליך יצירת סוכן (רשימת התבניות, השם שמוקלד) לא נבלעים כתשובה.
- **מנוי, שדרוג וסוכנים - מהנתונים ולתהליך האמיתי:** "איזה מנוי אני", "באיזה מסלול אני", "מה המסלול שלי" - פקודת סטטוס (`lib/billing/commands.ts`); בניסיון נשלח טקסט חדש `bill.status_trial` עם ההודעות שנשארו וקישור התשלום. "אני רוצה לשדרג למנוי פרו", "מנוי פרו", "לשדרג לפרו", "איך משדרגים?", "לשדרוג" - ישר להצעת השדרוג בלחיצה (או לדף התשלום). "אתה יכול ליצור לי סוכן", "תיצרי לי סוכן", "אפשר ליצור סוכן?" - ישר לתהליך היצירה (`lib/agents/commands.ts`). לכל ניסוח אחר יש למודל שני כלים (`lib/ai/account-tools.ts`): `start_upgrade` ו-`start_agent_creation` - ה-pipeline מריץ אחרי התשובה את אותו תהליך בדיוק, וההודעות שלו הן התשובה. ב-system prompt: המסלולים מתוך `lib/billing/plans.ts`, המסלול של המשתמש, ההודעות שנשארו, החיוב הבא, הסוכנים הפעילים, ואיסור מפורש לומר "אי אפשר ליצור סוכנים" או "אין דרך לשדרג מכאן". ה-router (Haiku) מעביר כל שאלה על מנוי/שדרוג/סוכנים למודל החזק.
- **פנייה ניטרלית:** ה-system prompt היה כתוב בעצמו בציווי זכר ("כתוב", "ענה", "אתה") - והמודל חיקה. עכשיו כל ההנחיות בשם הפועל, עם סעיף "פנייה ניטרלית למשתמש - חובה" ודוגמאות כן/לא ("אפשר לכתוב", לא "כתוב"; "אם מתאים", לא "אם תרצה"; "אחרי האישור", לא "אחרי שתאשר"; אף פעם לא "את או אתה"). גם ההערות שהכלים מחזירים למודל ("לענות במשפט קצר").
- **ג׳ימייל בכל כתיב:** ג׳ימייל / ג'ימייל / ג’ימייל / גימייל / gmail / גוגל, עם או בלי "לחבר", ו"אני רוצה לחבר…". מילה בודדת ("הג׳ימייל", "גוגל", "Outlook") - קישור חיבור, אלא אם הספק כבר מחובר (`lib/bot/connect-intent.ts`).
- **מה החיבורים מאפשרים - עובדות:** סעיף "חיבורים" ב-system prompt נבנה מההרשאות שניתנו בפועל (`lib/ai/account-context.ts`): Outlook - קריאה, שליחה, יומן, ו-OneDrive/SharePoint לקריאה בלבד; Google - יומן, שליחה מ-Gmail, קריאת Gmail רק עם ההרשאה, ו-Drive רק לקבצים שנוצרו או נפתחו דרכי (drive.file), במפורש. ספק שלא מחובר - מה החיבור יאפשר. פגישה עם קישור Teams/Meet דרך היומן. בלי "יתברר אחרי האישור".
- **"מחר" אחרי חצות:** בין 00:00 ל-04:59 "מחר" נקבע לבוקר הקרוב (כמו קודם, עד 03:59), אבל התשובה כותבת את התאריך המפורש ("היום, יום ו׳ 23.10, 9:00") ומצרפת כפתור אחד "ליום ש׳ 24.10" (`rem:next`) שמעביר את התזכורת (פעם אחת). בשעות האלה כל הד של "היום"/"מחר" כולל תאריך. ב-system prompt: מה "מחר" אומר עכשיו, לא לתקן/לבטל/לקבוע מחדש תזכורת שהמערכת קבעה, ולא לספר על ניסיונות פנימיים ("בניסיון הראשון…"). "תזכירי אותי … על לאכול" נשמר כ"לאכול".
- **בלי דליפת מצב פנימי:** ה-system prompt קיבל את כל `users.profile` - כולל `oauth_pending` (state ו-verifier של חיבור שהתחיל), `login_token` וחותמות זמן. כנראה מכאן "החיבור השני מופיע אבל לא ברור לי אם פעיל". עכשיו רשימה סגורה: רק "מה מעמיס", סיכום בוקר כבוי, והודעות יזומות כבויות. החיבורים - רק פעילים, החדש לכל ספק (אותו חיבור שהכלים משתמשים בו).
- **בדיקות:** `lib/bot/onboarding.test.ts` (שחזור קטע 1 מהבדיקה: שם עסק, רשימת "מה מעמיס", שעת הבוקר; "תודה"/"אין לי עסק"; חיבור וסוכן באמצע ההיכרות), `lib/bot/onboarding-answers.test.ts`, `lib/bot/account-intents.test.ts` (סטטוס בניסיון ובמסלול, שדרוג דטרמיניסטי ודרך הכלי, יצירת סוכן), `lib/billing/billing-wa-units.test.ts`, `lib/agents/commands.test.ts`, `lib/bot/connect-intent.test.ts`, `lib/ai/system-prompt.test.ts` (הכלל הניטרלי, אין ציווי זכר בהנחיות, עובדות המסלולים, רשימה סגורה של הפרופיל, הרשאות, "מחר" אחרי חצות), `lib/ai/orchestrator.test.ts`, `lib/reminders/parse.test.ts`, `lib/reminders/service.test.ts` (ההקלטה של 03:43 והכפתור).
- **דרוש מדניאל:** אין. אחרי הפריסה - לנסות שוב את הקטעים מהבדיקה (בעיקר "איזה מנוי אני", "אני רוצה לשדרג למנוי פרו", "תיצרי לי סוכן", "הג׳ימייל", ותזכורת "מחר" אחרי חצות).
## סקירת הקוד של תיקוני האיכות (23.10) - מה עוד תוקן
- **ההיכרות לא בולעת בקשות - לפי התוכן, לא לפי המילה הראשונה:** הבדיקה ב-`requestSignal()` (`lib/bot/onboarding.ts`) מדלגת על ברכות ומילות מילוי ("אוקיי", "סבבה", "רגע", "רק", "קודם", "דחוף", "ו" בהתחלה) ובודקת את שלוש המילים הראשונות: מילת שאלה, ציווי ("קראי", "הצג", "תוציאי"), שם פועל, "תזכורת", "@מזכירה" או "מזכירה,". בשם ובשם העסק גם מילת עבודה (מייל, יומן, פגישה, קובץ, תזכורת) או זמן ("מחר ב-10") הם בקשה. "המייל האחרון שלי", "פגישה עם רוני מחר ב-10", "Check my email", "עזרה" - נענים, לא נשמרים. שם עסק שנראה כמו בקשה רק בגלל מילה אחת ("מי עדן", "24/7 שירותים") נשמר כשהוא נשלח שוב כמו שהוא; "תעשיות כהן", "תמצית…", "אין סוף עיצובים" עוברים מיד. "תדלגי", "לא משנה", "אחר כך", "עוד אין" - מדלגים.
- **קישור חיבור באמצע שאלה:** אחרי הקישור השאלה הפתוחה נשאלת שוב, ו"חיברתי" / "עשיתי" / "בוצע" אחריו לא נשמרים כשם או כשם העסק.
- **תשובות מוקלדות לרשימות:** "המייל והיומן שלי", "בעיקר מיילים", "הכל", "זהו" נספרים כבחירה ברשימת "מה מעמיס"; "שבע וחצי", "8:00", "רבע לשמונה" ו"לא צריך" / "אין צורך" - בשאלת שעת הבוקר. בלי מודל ובלי לספור הודעה. אם העוזרת עצמה קבעה את השעה (`set_morning_time`), ההיכרות ממשיכה ולא שואלת שוב.
- **"חבר" הוא גם חבר:** בקשת חיבור דורשת עכשיו פועל ואחריו מה מחברים ("לחבר את המייל", "להתחבר לגוגל", "תחברי לי את הג׳ימייל"). "חברי הוועד שלחו מייל", "חבר שלי שלח לי מייל", "תחברי בין המייל לתיק" - לא קישור. ספק שכבר מחובר לא מקבל קישור חדש אלא עם "שוב" / "מחדש" (וב-system prompt: "חשבון אחר או חיבור מחדש: לחבר מחדש את…"). כתיבים נוספים: "ג׳י-מייל", "G-mail", "יומן גוגל", "גוגל קלנדר", "המייל של גוגל" (`lib/bot/connect-intent.ts`).
- **פקודות מנוי:** "איזו חבילה?" (אחרי מייל משליחויות) ו"איזה מסלול?" בלי "אני"/"שלי" נשארים לעוזרת; ציווי בלי המסלול ("תשדרגי", "תשדרגי לי", "לשדרג לי") - בקשה לשפר טיוטה, לא הצעת שדרוג (`lib/billing/commands.ts`).
- **ה-router לא עונה בעצמו על מנוי/שדרוג/סוכנים/הרשאות - בקוד:** תשובה של ה-router נשלחת רק כשה-intent אינו `account`, ההודעה בלי מילים כמו מנוי/מסלול/שדרוג/סוכן/גישה/הרשאה/דרייב/Meet/Teams, והתשובה בלי פנייה מגדרית ("אם תרצה", "תצטרך", "אתה"). ה-router מקבל את ה-JSON כ-structured output (`output_config.format`, סכמה ב-`ROUTER_SCHEMA`) - בבדיקה החיה 11 מתוך 40 תשובות שלו לא היו JSON.
- **פנייה ניטרלית - עוד שני כללים מהבדיקה החיה:** בלי "אתה"/"את" כנושא גם בהווה ("המסלול שלך: בסיסי", לא "אתה על המסלול הבסיסי"); וב-reply של ה-router "אם יש צורך" / "אם יעלה משהו". גם הנחיית הסיכום של הזיכרון ובלוק הסוכנים של ה-router כתובים עכשיו בשם הפועל, והבדיקה שאין ציווי זכר עוברת עליהם ועל ההנחיות של הסוכנים המובנים.
- **Drive:** "אין גישה לשאר הקבצים ב-Drive, גם לא לקבצים או לתיקיות ששותפו עם המשתמש" (Sonnet הוסיף "או ששותפו איתי"). השורה מתחילה בעברית ("קבצים ב-Google Drive…").
- **שורה שמתחילה באנגלית:** לפני השליחה, שורה עברית שמתחילה במילה באנגלית ("• Google Drive: …") מקבלת סימן כיוון RLM, כדי שוואטסאפ יציג אותה מימין לשמאל (`lib/wa/rtl.ts`). ב-prompt: דוגמה כן/לא, והדגשה רק לכותרת.
- **כל הודעה נשלחה למודל פעמיים:** ההודעה נשמרת לפני הקריאה למודל, הזיכרון קרא אותה, ו-`runAssistant` הוסיף אותה שוב. עכשיו הזיכרון מדלג על השורה של ההודעה הנוכחית (`inboundId`).
- **שדרוג יחד עם בקשה אחרת:** "תביאי לי את המייל האחרון ואיך משדרגים?" - התשובה על המייל נשלחת, ואחריה הצעת השדרוג (`textBeyondFlows`).
- **שתי תזכורות ל"מחר" אחרי חצות:** כפתור אחד "הכול ליום ש׳ 24.10" שמעביר את שתיהן (`rem:next:<id>,<id>`); כפתורים עם אותה כותרת לא נשלחים לעולם, ואם שליחת הכפתורים נכשלת - האישור יוצא כטקסט.
- **סוכן ושאלות חשבון:** בתור סוכן אין את כלי השדרוג והיצירה, ולכן בהנחיות הסוכן: "אפשר לכתוב ״שדרוג״ / ״סוכן חדש״" או לפנות ל-@עלזה. ה-router מחזיר agent: null לשאלות חשבון.
- **ההודעות שנשארו:** בסעיף "החשבון" - "(ההודעה הנוכחית כבר נספרה)", וכלל: לא לתקן בסוגריים הודעות קודמות.
- **הקריאה הראשונה עם סט כלים חדש:** סכמות הכלים (strict) מקומפלות פעם אחת (מטמון של 24 שעות ב-API) - בבדיקה החיה 19 עד 50 שניות. בהדגמה הקריאה הראשונה לכל סט כלים מחכה עד 45 שניות בלי ניסיון חוזר (`coldTimeoutMs` ב-`lib/ai/anthropic.ts`). המלצה: אחרי פריסה ששינתה תיאור של כלי - הודעה אחת לכל צירוף (בסיס, + Microsoft, + Google).
- **בדיקת העברית מריצה את ה-prompt של המוצר:** `scripts/hebrew-eval/src/product-prompt.generated.ts` נוצר מ-`lib/ai/eval-prompt-sync.test.ts` (נכשלת אם ה-prompt השתנה בלי לחדש). נוספו msg-101 עד msg-108 מהבדיקה החיה, ושתי בדיקות אוטומטיות: פנייה מגדרית וסיפור על ניסיון פנימי.
- **בדיקות:** `lib/bot/onboarding-answers.test.ts` (כל הניסוחים מהסקירה, שמות עסק, תשובות לרשימות, "חיברתי"), `lib/bot/onboarding.test.ts` (מקצה לקצה: קישור ואז "חיברתי", בקשות בשם ובשם העסק, "מי עדן" פעמיים, דילוגים, רשימות מוקלדות, שעת בוקר מהעוזרת), `lib/bot/connect-intent.test.ts`, `lib/billing/billing-wa-units.test.ts`, `lib/ai/orchestrator.test.ts`, `lib/ai/anthropic.test.ts`, `lib/ai/system-prompt.test.ts`, `lib/reminders/service.test.ts`, `lib/bot/process-inbound.test.ts`, `lib/wa/rtl.test.ts`, `lib/ai/eval-prompt-sync.test.ts`.
- **דרוש מדניאל:** אין.
## שירותים בכל חיבור: אייקונים באזור האישי, ושירותים שמחוברים באמת (23.10)
> בקשת דניאל (עם צילומי מסך של לוח חיבורים של מתחרה): מתחת לכל חשבון מחובר שורת אייקונים "סולידיים ויפים, בעיצוב שלנו", ובריחוף "Gmail - מחובר" / "Google Tasks - צריך אישור נוסף". ו"אם צריך להוסיף משהו ב-Google או ב-Microsoft כדי שזה יתממשק - שזה יקרה".
- **קטלוג השירותים** (`lib/connections/services.ts`): Google - Gmail, יומן Google, Google Tasks, Google Drive, Google Docs, Google Sheets, Google Slides. Microsoft 365 - Outlook, יומן Outlook, OneDrive, SharePoint, Microsoft To Do, קבצי Word, Excel ו-PowerPoint. לכל שירות ה-scopes שהוא צריך, והסטטוס נגזר רק מעמודת `scopes` של החיבור: **מחובר** / **צריך אישור נוסף** (קישור להסכמה: ב-Google הסכמה מצטברת ל-scope החסר בלבד, ב-Microsoft החיבור הרגיל) / **לא זמין** (קריאה מוגבלת של Google כבויה, או שהתקרה מלאה לחשבון חדש). Gmail ו-Drive נשארים "מחובר" עם מה שעובד כשהקריאה לא זמינה.
- **Google - scopes:** `tasks` (רגיש, בלי CASA) נוסף לבסיס. `drive.readonly` (מוגבל) מבוקש כמו `gmail.readonly`: מצטרף לחיבור רגיל כל עוד יש מקום בתקרת 100 המשתמשים, או בהסכמה מצטברת `?feature=drive_read`, עם מתג משלו `GOOGLE_DRIVE_READ_ENABLED`, ולעולם לא מכשיל חיבור רגיל. `drive.file` נשאר (שמירת מסמכים). הפנקס (`lib/google/user-cap.ts`) סופר גם את `drive.readonly` ואת `tasks` (עד אימות הרגישים); התקרה לחשבון, לא ל-scope. ה-callback שומר `drive.readonly` רק לפי אותם כללים של `gmail.readonly` (`keepGrantedRestrictedRead`). תכונות חדשות: `drive_read`, `tasks`.
- **Microsoft - scopes:** `Tasks.ReadWrite` ו-`Sites.Read.All` נוספו ל-`MS_SCOPES` ולקישור אישור המנהל. `Files.Read.All` כבר מכסה את OneDrive ואת ספריות המסמכים של SharePoint. בלי `Chat.Read`. **תיקון חשוב:** הרענון של טוקן Microsoft מבקש עכשיו רק את מה שהחיבור קיבל (`msRefreshScopes`) - רענון עם הרשאה שלא אושרה נכשל ב-AADSTS65001 והיה מסמן כל חיבור קיים "פג תוקף". שמות scopes שחוזרים עם `https://graph.microsoft.com/` או באותיות אחרות מנורמלים (`normalizeMsScopes`).
- **כלים בוואטסאפ:** `gtasks_list_tasks` / `gtasks_create_task` (Google Tasks) ו-`todo_list_tasks` / `todo_create_task` (Microsoft To Do) - הוספת משימה לרשימה שלך היא פעולה פנימית כמו תזכורת, בלי כפתור אישור, ועם תשובה שחוזרת על מה שנוסף ("נוספה משימה ל-Google Tasks: ..., עד 24.10."). `gdrive_list_files` מחפש בכל ה-Drive לפי שם ותוכן כש-`drive.readonly` קיים, ו-`gdrive_get_file_text` קורא Docs (text/plain), Sheets (text/csv) ו-Slides (text/plain); בלעדיו `gdrive_read_status` מחזיר קישור לאישור או שורה אחת. `sharepoint_search` (Microsoft Search: מסמכים או אתרים) ו-`sharepoint_get_file_text` (כמו קובץ OneDrive, דרך `/drives/{id}`). חיבור בלי ה-scope מקבל מהכלי עצמו קישור לאישור (`g.tasks.consent`, `s.todo.consent`, `s.sharepoint.consent`). כותרות משימות, הערות ושמות קבצים הם מידע לא מהימן (`TASKS_NOTE`, `<data>`). מיפוי ליכולות הסוכנים: משימות → "תזכורות", SharePoint / קריאת Drive → "חיפוש וקריאת קבצים" (בלי מיגרציה).
- **הקשר החשבון במודל:** שורה קטנה ונפרדת ב-`lib/ai/system-prompt.ts` - "שירותים פעילים ב-Google: Gmail, יומן Google ו-Google Tasks" (רק המחוברים).
- **ה-UI** ("חיבורים" ב-`/account`): `components/brand/service-icons.tsx` - עשרה סמלים משלנו, מלאים, על רשת 24px (מעטפה, יומן, סימן וי, תיקייה, מסמך, גיליון, מצגת, ענן, שכבות, שני דפים); לא לוגואים של החברות. `components/brand/service-row.tsx` - אריח 36px לכל שירות: מחובר = אריח מרווה מלא עם סמל בצבע הלילה; צריך אישור = אריח כהה עם נקודת דבש; לא זמין = אריח מקווקו ודהוי. כל אייקון הוא כפתור או קישור עם `aria-label` ("Gmail - מחובר") ו-`aria-describedby` לבועה (`role="tooltip"`, נייר עם טקסט דיו): ריחוף (נשארת כשהעכבר על הבועה), פוקוס במקלדת, נגיעה בטלפון (מחליפה מצב; באייקון "צריך אישור" הנגיעה הראשונה מסבירה והשנייה פותחת את האישור), Esc ונגיעה בחוץ סוגרים. הבועה מחוץ לזרימה (בלי קפיצת תוכן), נשארת 8px מקצה המסך ב-390px, וההופעה רק כשתנועה מותרת. מתחת לשורה: "4 שירותים מחכים לאישור נוסף". שורה רק לחשבון פעיל; כפתורי החיבור והניתוק לא השתנו. `/start/ready` לא שונה.
- **טקסטים:** `docs/copy/bot-copy-services.md` (חדש - To Do, SharePoint וטקסט שורת האייקונים), `docs/copy/bot-copy-google.md` (`g.tasks.*`, `g.drive_read.*`, `g.err.drive_read_*`, `g.web.drive_read_*`). **מסמכים:** `docs/google-setup.md` §0, §1, §2, §5, §6.3, §10; `docs/microsoft-setup.md` (חדש); `docs/legal/oauth-consent-screen-he.md` §2-§4.
- **בדיקות:** `lib/connections/services.test.ts` (סטטוס לכל מצב, קישורים, שערים, מקף קצר), `components/brand/service-row.test.tsx` (רינדור, aria, ריחוף/פוקוס/נגיעה/Esc, צורה לכל מצב, CSS לוגי, תנועה מופחתת), `lib/ms/workspace-tools.test.ts` (To Do ו-SharePoint מול fixtures, 403 → קישור, הדגמה בזיכרון), `lib/google/tools.test.ts` (Tasks, קריאת Drive, ייצוא Docs/Sheets/Slides, `gdrive_read_status`), `lib/ms/oauth.test.ts` (scopes, נרמול, רענון עם ההרשאות של החיבור), `lib/google/user-cap.test.ts` ו-`app/api/auth/google/google-routes.test.ts` (`drive_read`, `tasks`), `lib/copy/bot-services.test.ts`, e2e ב-`e2e/account.spec.ts` (שורת Microsoft ו-Google, בועה בריחוף ובפוקוס, בלי גלילה אופקית ב-390px). fixtures: Tasks ב-`lib/google/__fixtures__`, To Do / Microsoft Search / `/drives/{id}` ב-`lib/ms/__fixtures__`; ה-token של Microsoft בזיכרון מחזיר את כל ההרשאות.
- **דרוש מדניאל:** שורה 12 בטבלה למעלה. במצב הדגמה בלי `GOOGLE_CLIENT_ID` קריאת Drive כבויה, ולכן Docs / Sheets / Slides יוצגו "לא זמין".
## חיבורים בדף הנחיתה - בדיקת עיצוב ל-preview (23.10)
> בקשת דניאל: להראות באתר עם אילו אפליקציות עלזה עובדת, עם האייקונים המוכרים (כמו רשימת החיבורים של המתחרה, רק בהשראה - בלי טקסט, לוגו או קמע שלהם): בראש הדף, כדי שיראו מיד, ובמחירים - מה כל מסלול כולל. לבדיקה ב-preview של Vercel, עוד לא לפרודקשן.
- **הנתונים** (`lib/integrations/catalogue.ts`): שורה לכל מערכת - שם, שורת תועלת בעברית, ספק (Google / Microsoft 365 / מערכות העסק) וסטטוס (`available` / `soon`). מערכת חדשה = שורה אחת, והיא מופיעה בשלושת המקומות (סמל מצויר ב-`components/brand/integrations/icons.tsx`, ובלעדיו אות בצבע המותג).
- **הסטטוסים לפי הקוד בענף הזה, לא לפי התוכנית:** זמינים היום - Gmail, Google Calendar, Drive, Docs, Sheets, Slides, Outlook (מייל ויומן), OneDrive, Word, Excel, PowerPoint. "בקרוב" - קישורי Meet ו-Teams בזימון, Google Tasks, Microsoft To Do, SharePoint (ההרשאה `Files.Read.All` קיימת, אבל חיפוש הקבצים היום רק ב-OneDrive), monday.com, Priority, מורנינג (חשבונית ירוקה) ו-iCount. כשיכולת עולה מחליפים את הסטטוס באותה שורה; הבדיקה מוודאת שכל "זמין" נשען על הרשאה שהאפליקציה באמת מבקשת.
- **הסמלים:** SVG נאמן לסמלים הרשמיים - סמלי Google Workspace (2020), סמלי Fluent של Microsoft (מה-CDN של Microsoft) והסמל של monday.com - כל אחד על אריח לבן מעוגל, כמו הלוגואים במסך החיבור. ל-Priority, מורנינג ו-iCount אין סמל מצויר (לא ממציאים): אות בצבע המותג.
- **בראש הדף:** שורה שקטה "עובדת עם" מתחת לכפתור ולשורת ההודעות החינמיות, לא ליד הכותרת: 8 אריחים (Google ואז Microsoft) וקישור "כל החיבורים". נכנסת במסך הראשון גם ב-1440×900.
- **במחירים:** בתחתית כל מסלול "כולל חיבור ל:" עם 11 האריחים הזמינים (בשני המסלולים בדיוק אותו דבר - ההבדל בין המסלולים נשאר בהודעות ובסוכנים, `lib/billing/plans.ts`). מתחת לגיליון: "החיבורים זהים בשני המסלולים וגם בהודעות החינמיות" וקישור לרשימה.
- **הרשימה המלאה** (`#connectors`, בין "היא רואה רק מה ששולחים לה." למחירים, וקישור "חיבורים" בכותרת): "מתחברת לכלים שכבר יש לכם." - שלוש עמודות מרופדות בקווים, כמו שאר הדף (Google, Microsoft 365, מערכות העסק): אריח, שם, שורת תועלת, תג "בקרוב", ובסוף "ועוד בהמשך" עם הפניה ל"שאלות ותמיכה".
- **נגישות:** כל שורת אריחים היא toolbar עם עצירת Tab אחת; החיצים זזים לאורך השורה (הפוכים ב-RTL), Home/End לקצוות. לכל אריח שם (ו"בקרוב" כשצריך) ותיאור - שורת התועלת. הבועה נפתחת במעבר עכבר, במיקוד מקלדת ובנגיעה; Esc, נגיעה בחוץ או יציאה מהשורה סוגרים; היא נשארת בתוך כרטיס המסלול או המסך. בלי גלילה אופקית ב-390px, והאנימציה של הבועה נעלמת בהפחתת תנועה.
- **בדיקות:** `lib/integrations/catalogue.test.ts` (סטטוסים מול ה-scopes בקוד, אותם חיבורים בשני המסלולים, עברית קצרה בלשון נקבה, בלי "—"), `components/brand/integrations/integrations.test.tsx` (סמל או אות לכל מערכת, מזהי gradient ייחודיים, toolbar, תיאור, בועה במיקוד, חיצים, Esc, נגיעה, CSS לוגי, הערת סימני המסחר), `components/brand/landing/landing.test.tsx` (שלושת המיקומים והקישור בכותרת), ו-`lib/integrations/catalogue.ts` נוסף לבדיקת המקפים (`lib/design/dashes.test.tsx`).
- **מומלץ לפני פרודקשן: בדיקה משפטית של הנחיות המותג של Google ו-Microsoft** (שימוש בסמלי מוצרים כדי לציין "עובדת עם", גודל ומרווח, אריח לבן, בלי לשנות צבעים או לשלב עם הסמל שלנו), וגם של monday.com, Priority, מורנינג ו-iCount. הערת סימני המסחר נמצאת בקוד (`catalogue.ts`, `icons.tsx`). שורה 12 ב"דרוש מדניאל".
- **לבחירת דניאל:** להשאיר את השורה העליונה, את החיבורים במחירים, או את שניהם; אילו 8 מערכות מופיעות למעלה (`featured` בקטלוג).
- **אחרי המיזוג עם אייקוני השירותים:** Google Tasks, Microsoft To Do ו-SharePoint סומנו "זמין" בקטלוג של דף הבית (`lib/integrations/catalogue.ts`), כי ההרשאות והכלים שלהם כבר בקוד. Meet / Teams נשארים "בקרוב" עד שקישורי הפגישות ייכנסו.

## רעיון לבהמשך (דניאל, 23.10)
- דניאל משווק של Acronis: להציע ללקוחות עלזה בהמשך Mail Relay / גיבוי מיילים (Acronis) כתוספת. לא עכשיו.
- עו"ד אישר את השימוש בלוגואים ואת הכלל של Meta (לפי דניאל, 23.10).
- "רק שנייה…" הוחלף ב-"עלזה על זה…" (הסלוגן, בקשת דניאל 23.10); השם מ-`BRAND`.
- התראות יזומות (מ-Instinct): לפי ההמלצה שאושרה - בתוך סיכום הבוקר, ועוד עד 2 התראות דחופות ביום.

## מסך החיבור בהרשמה - אריחי ספקים (כיוון "provider-tiles", 23.10)
- **הבעיה (דניאל):** שני כפתורי גלולה כבדים על הנייר הירוק, קישור דילוג וחלל ריק - לא בשפה של שאר ההרשמה.
- **עכשיו** (`components/auth/connect-step.tsx`): תווית "איפה המייל שלך?" (כמו "כתובת מייל" בשלב המייל), ושני אריחים בצבע נייר על הנייר הירוק, בפינות `rounded-field`: לוגו רשמי על אריח לבן, שם החשבון, שורה של מה שעובד היום (Microsoft 365: Outlook, יומן ו-OneDrive · Google: Gmail, יומן ו-Drive) וחץ שקט. Microsoft ראשון, עם פתק דבש מוטה "הנפוץ במשרדים" על הקצה העליון. מתחת לאריחים, בסגנון שורת העזר של שלב הקוד: "הסיסמה לא עוברת דרכנו, ואפשר לנתק בכל רגע." בשורה התחתונה: "שלב 3 מתוך 4" ו"דילוג בינתיים" (בטלפון ליד הדוכיפת; במסך רחב ההתקדמות בצד אחד והדילוג בצד השני).
- **ליטוש אחרי השופטים (23.10):**
  - **בלי הבטחות:** Teams ו-Meet הוסרו מהשורות (בקטלוג הם עדיין "בקרוב"). השורות קצרות ונכנסות בשורה אחת ב-390px, ושני האריחים באותו גובה.
  - **הכפתור הצף של הנגישות:** בטלפון ל-`StepBody` יש ריווח תחתון לפי `--fab-bottom`, כך שבסוף הגלילה שום דבר על הכרטיס לא מתחתיו; לאריחים ולדילוג יש `scroll-mb`, כך שמיקוד במקלדת מגלגל אותם מעליו; ובמצב שגיאה ב-390×844 האריח של Google נגמר מעל הכפתור.
  - **הדוכיפת והכותרת:** במסך רחב הכרטיס עדיין ממורכז, אבל לא עולה גבוה מדי: שני מרווחים גמישים ב-`<main>` (`components/auth/signup-shell.tsx`) שומרים לראש הנייר רצפה של 10.5rem מתחת לכותרת. כרטיס גבוה יותר (תיבת שגיאה) יורד למטה במקום לדחוף את הכרבולת לכפתור "לאזור האישי". זה מתקן גם את 1366×768 ו-1280×800 בכל השלבים, שם הכרבולת נגעה בכותרת גם בלי שגיאה.
  - **מיקוד והצבעה:** רק האריח שמתחת לעכבר או במיקוד משתנה: הרמה של 2px, מסגרת בדיו, החץ מתמלא בדיו וזז מעט לכיוון הקריאה (בלי תנועה בהפחתת תנועה). במיקוד מקלדת: אותה מסגרת דיו והילה רכה כמו בשדה המייל, ועוד קו מיקוד חיצוני. לדילוג אין יותר מעבר מונפש.
  - **נגישות:** הקישור הוא שם החשבון, ומכסה את כל האריח (`::after`), כך שהאריח כולו לחיץ והשם הנגיש ("חיבור Microsoft 365 / Outlook") מכיל את הטקסט הנראה (axe `label-content-name-mismatch`, שנכשל בגרסה הקודמת). הפתק ושורת המוצרים הם התיאור של הקישור, מוסתרים כתוכן, ולכן נקראים פעם אחת. הפתק בגודל 14px, לא נחתך.
- **התנהגות שלא השתנתה:** הקישורים `/connect/microsoft`, `/connect/google`, `/start/ready`; `ConnectError` ו"שליחה למנהל ה-IT"; חריץ ה-`notice`; "שלב 3 מתוך 4" והדוכיפת.
- **הבדיקה המהבהבת "Microsoft path" (e2e):** הסיבה: הבדיקה יירטה את ההפניה של שרת ה-dev ל-login.microsoftonline.com. לפעמים Chromium המשיך בהפניה בלי להעביר אותה ל-route, דף ההתחברות האמיתי של Microsoft נטען דרך הרשת, והבקשות שלו (בלי `redirect_uri`) הגיעו ל-handler ונפלו על "Invalid URL" (אותו דפוס נראה פעם בבדיקת Google, עם דף השגיאה האמיתי של Google). עכשיו הבדיקה עובדת כמו בדיקת Google: מיירטת את `/api/auth/microsoft/start`, קוראת את כתובת ההפניה (`maxRedirects: 0`) ומחזירה 302 ישר ל-callback, כך שהדפדפן לא יוצא מ-localhost. בקשה שבכל זאת יוצאת ל-Microsoft נחסמת. גם זמן ההמתנה לדף ההעברה עלה ל-30 שניות (שרת dev קר). עבר 6 חזרות ברצף ובריצה המלאה.
- **ליטוש שני אחרי ביקורת (23.10):**
  - **חומר אחד:** האריחים עשויים מאותו חומר כמו שדה המייל ותאי הקוד (`fieldClass`): לבן שקוף על הנייר (`bg-white/50`, במעבר עכבר 65%, במיקוד 80%), במקום קרם 75% שיצא חאקי-אפור על המרווה. תיבת השגיאה (לבן 40%) שייכת עכשיו לאותה משפחה.
  - **בלי מדבקת דבש:** הפתק המוטה "הנפוץ במשרדים" (סגנון "הכי פופולרי" של עמודי מחירים) הוסר. במקומו שורה בכתב היד, בדיו, בשורה של "איפה המייל שלך?" מעל האריח של Microsoft. על נייר הדבש הופך לדיו, כמו נקודות ההתקדמות.
  - **שפת מיקוד אחת:** אריח במיקוד מקבל מסגרת דיו והילה של 4px, בדיוק כמו שדה המייל. בלי הקו החיצוני הנוסף (רק במצב ניגודיות מאולצת, שבו צללים לא מוצגים).
  - **השורה התחתונה בטלפון ובטאבלט:** "שלב 3 מתוך 4" ומתחתיו "דילוג בינתיים", במקום שתי פיסות טקסט צמודות שנקראו כמשפט אחד.
  - **בלוק אמון אחד:** "הסיסמה לא עוברת דרכנו..." מוצגת רק במסך רחב, שם רשימת ההבטחות על הבמה הכהה. בטלפון ובטאבלט ההבטחות כבר על אותו נייר.
  - **הכותרת:** "הראשון שלה" לא נשבר, כך שב-1440 אין יותר "שלה" לבד בשורה.
  - **קורא מסך:** לכל אריח תיאור מוסתר אחד במשפט ("הנפוץ במשרדים. Outlook, יומן ו-OneDrive"), עם עצירה בין הפתק למוצרים.
  - **כפתור הנגישות הצף:** 44px (היה 40px).
  - **"עצירת אנימציות" של האתר:** עוצרת עכשיו גם את ההרמה של האריח ואת תזוזת החץ (`translate: none` בבלוק הנגישות ב-`app/globals.css`), לא רק את המעברים.
  - **e2e Microsoft:** השער שמחזיק את ההעברה לא תלוי יותר בבדיקת כתובת שיכולה לפגר: הכתובת נבדקת ב-commit (`waitForURL` שנפתח לפני הלחיצה), מה שנבדק לפני השחרור הוא מה שמסך ההעברה מציג, לשער יש תקרה של 20 שניות (כשל אמיתי במקום תקיעה), ומסלול `/connect/microsoft` מתחמם לפני הבדיקה.
- **בדיקות:** `components/auth/auth.test.tsx` (סדר, כתובות, שם ותיאור לכל אריח, בלי Teams/Meet, שורת הסיסמה); e2e 26/26.

## פגישות Teams ו-Google Meet ביומן
> משימה: כשעלזה קובעת או מעדכנת פגישה, אפשר לצרף פגישה מקוונת: Teams ב-Microsoft 365, Google Meet ב-Google. בלי הרשאות חדשות.

- **כלים:** שדה `online_meeting` (בוליאני) ב-`create_event`, `gcal_create_event`, `update_event` ו-`gcal_update_event`. ביצירה המודל מסמן אותו כשמבקשים Teams, Meet, זום, וידאו, "אונליין" או "קישור לפגישה", או כשהמשתמש אומר במפורש שהפגישה מרחוק ("נדבר מרחוק", "לא יגיע פיזית"). משתתף מעיר אחרת או מחו״ל אינו בקשה: המודל שואל שאלה קצרה אחת ("להוסיף פגישת Teams?"). "שיחה" לבדה היא בדרך כלל טלפון, ולכן false (`lib/ai/system-prompt.ts`, סעיף "פגישות מקוונות"; `onlineMeetingField` ב-`lib/ai/tools.ts`). בשינוי: רק כשמבקשים להוסיף קישור לפגישה שאין לה `join_url` ושהמשתמש ארגן (`organizer_is_me`). Zoom לא נוצר: בבקשה לזום נוצרת Teams או Meet לפי היומן, והטיוטה מראה את זה לפני האישור.
- **Microsoft 365:** ביצירה ובעדכון `isOnlineMeeting: true` + `onlineMeetingProvider: "teamsForBusiness"` (ההרשאה הקיימת Calendars.ReadWrite). לפני כן בדיקה של `allowedOnlineMeetingProviders` ב-`GET /me/calendar`: Graph לא דוחה בקשת Teams ביומן בלי Teams (חשבון אישי), אלא יוצר את האירוע בלי קישור (201). לכן אם הבדיקה לא ענתה (429, 5xx, תקלת רשת), שום דבר לא נוצר: נשלח `act.cal.online_check_failed` ("לא הצלחתי לבדוק... אפשר לנסות שוב בעוד כמה דקות") ואותה טיוטה נשלחת מחדש עם כפתורים חדשים, כך שלחיצה מאוחרת יותר יוצרת את הפגישה. שגיאה אחרת של הבדיקה (403, 404) מדווחת כ-`err.generic`. הקישור מ-`onlineMeeting.joinUrl`, ואם לא חזר מיד - קריאה נוספת אחת של האירוע.
- **Google:** `conferenceData.createRequest` (requestId חדש בכל בקשה, `hangoutsMeet`) עם `conferenceDataVersion=1` (ההרשאה הקיימת calendar.events). הקישור מ-`hangoutLink` או מנקודת הכניסה מסוג `video`. Meet נוצר ברקע: בקשה במצב `pending` נקראת פעם נוספת. האירוע נוצר עם מזהה שלנו (hex, תת-קבוצה של base32hex), כך שאם Google דחתה את ה-Meet אבל יצרה את האירוע בכל זאת, התשובה אומרת שהפגישה נקבעה וההזמנות יצאו בלי קישור, ולא מוצעת פגישה שנייה.
- **לא מחליפים קישור קיים:** פגישה שכבר יש לה פגישה מקוונת (Teams, Meet, תוסף כמו Zoom, גם קישור שלא מוצג או בקשה שעוד בהכנה; `hasConference` ב-`lib/google/client.ts`) לא מקבלת בקשה חדשה. הכלי לא מכין טיוטה רק בשביל קישור (`status: "already_online"` עם הקישור), והזזה של פגישה מקוונת נשארת הזזה. אם בין הטיוטה לאישור נוסף קישור, אין PATCH ואין מייל עדכון למשתתפים (`act.cal.online_exists`).
- **רק המארגן:** הוספת קישור לפגישה שהמשתמש לא ארגן לא מגיעה לשאר המשתתפים, ולכן הכלי מחזיר `not_organizer` והמבצע עונה `act.cal.online_organizer_only`.
- **הטיוטה:** שורה "פגישת Teams" או "פגישת Google Meet" (עם "(הקישור יישלח בהזמנה)" כשיש משתתפים), לפי היומן שהפגישה תיקבע בו. היומן נקבע כבר בטיוטה (`provider` ב-payload, גם ב-`create_event` הכללי), כך שהשירות שמוצג הוא השירות שנוצר. בטיוטת שינוי: שורת "פגישה: {כותרת}, {תאריך} ב-{שעה}" (הכלי קורא את האירוע לפני הטיוטה), "הוספת פגישת Teams" / "הוספת פגישת Google Meet", ו"המשתתפים יקבלו עדכון עם הקישור." כשיש משתתפים. הזזה: "להזיז?" עם [הזז]; כל שינוי אחר: "לעדכן?" עם [עדכן].
- **אחרי האישור:** "קישור לפגישה: ..." בשורה מתחת ל"נקבע" / "הוזז" / "עודכן" (או "נוסף קישור Teams לפגישה ״...״" כשרק הקישור נוסף).
- **אין Teams או ש-Google דחתה את ה-Meet:** שום דבר לא נוצר ולא משתנה. נשלחת טיוטה חדשה של אותה פגישה בלי קישור, עם ההסבר בראשה ו-[קבע בלי קישור] / [עדכן בלי קישור], כך שהפגישה נקבעת בלי קישור רק אם מאשרים את הטיוטה הזו (`ActionResult.offer` ו-`onlineMeetingUnavailable()` ב-`lib/bot/pending.ts`). ההסבר "היא זמינה רק בחשבון עבודה או בית ספר" מופיע רק בחשבון Microsoft אישי (tenant של חשבונות אישיים או כתובת outlook / hotmail / live / msn; `isPersonalMicrosoftAccount` ב-`lib/online-meeting.ts`); חשבון עבודה בלי Teams מקבל את המשפט בלי הסיבה.
- **טיוטה חלופית של סוכן:** שומרת את הסוכן שהכין את המקורית ומקבלת 10 דקות משלה, אבל עוברת את אותה בדיקה כמו כל טיוטה של הסוכן (`guardAgentAction`: רשימת הנמענים כפי שהיא עכשיו, התקרה היומית, והסוכן פעיל). כשהסוכן לא רשאי, נשלח `act.cal.online_not_done` עם "אפשר לבקש מ-״@{שם}״ לקבוע אותה בלי קישור". כשאי אפשר לשמור את הטיוטה בכלל - ההסבר בלבד.
- **קישורים קיימים:** `join_url` ו-`organizer_is_me` בתוצאות `list_events` ו-`gcal_list_events`, והמודל מוסיף "קישור לפגישה: ..." מתחת לפגישה. בסיכום הבוקר שורת קישור מתחת לפגישה מקוונת, רק בהודעה החופשית (בתבנית `morning_summary` אין מקום: 300 תווים לסעיף), ורק כל עוד ההודעה כולה עד 3,500 תווים (`MORNING_TEXT_BUDGET`): קישור Teams ארוך, והפגישות, המיילים והסיום תמיד נשארים.
- **אבטחה:** `lib/online-meeting.ts` (`safeJoinUrl`): רק קישור https לשירות פגישות מוכר (Teams, Meet, Zoom, Webex), בלי רווחים או תווים נסתרים, עד 1,024 תווים. כל קישור אחר (למשל מארגן חיצוני ששם קישור משלו ב-entry point) לא מגיע למודל ולא להודעה של עלזה. שגיאת Meet מזוהה רק לפי ההודעה של ה-API עצמו (`apiMessage`), לא לפי הנתיב (מזהה אירוע יכול להכיל "meet").
- **טקסטים:** `act.cal.online_label`, `act.cal.update_target`, `act.cal.add_online`, `act.cal.attendees_notified`, `act.cal.updated`, `act.cal.join_link`, `act.cal.join_link_later`, `act.cal.online_missing`, `act.cal.online_added`, `act.cal.online_exists`, `act.cal.online_organizer_only`, `act.cal.online_unavailable`, `act.cal.online_not_done` (`lib/copy/bot.ts`, מתועדים ב-`docs/copy/bot-copy.md`).
- **fixtures:** Graph - `GET /me/calendar` לפי `onlineMeetingProviders`; ביומן בלי Teams (`["skypeForConsumer"]`) האירוע נוצר בלי קישור, כמו ב-Graph. `isOrganizer` ו-`onlineMeetingProvider` באירועים, וקישור Teams לפגישה עם רו״ח ברק. Google - `conferenceMode` (success / pending / refuse / refuse_created), מזהה אירוע שהלקוח בחר (409 על כפילות), ו-Meet לשיחה עם משפחת אברהם.
- **בדיקות:** `lib/online-meeting.test.ts`, `lib/ms/online-meeting.test.ts`, `lib/google/online-meeting.test.ts` (גוף הבקשה, הקישור בתשובה, הטיוטה, חשבון אישי מול חשבון עבודה, דחייה של Graph ושל Google, אירוע שנוצר למרות הדחייה, בדיקת ספק שנכשלה, Meet ב-pending, רשימת אירועים, עדכון, קישור קיים, מארגן בלבד, טיוטה חלופית של סוכן), `lib/jobs/morning-summary.test.ts` (תקציב הקישורים), ועדכון `lib/google/tools.test.ts` ו-`lib/ai/orchestrator.test.ts`: טיוטת שינוי קוראת עכשיו את האירוע פעם אחת גם אצל העוזרת הראשית; ביטול עדיין לא.
- **לבדוק מול הספקים האמיתיים:** כדאי לנסות עם `LIVE_MS=1` בחשבון עבודה ובחשבון outlook.com (לוודא ש-`allowedOnlineMeetingProviders` אכן בלי `teamsForBusiness` ושהאירוע לא נוצר), ועם `LIVE_GOOGLE=1` בחשבון gmail.com ובחשבון Workspace שבו Meet כבוי.

### תיקונים אחרי סקירה
- **לא אומרים "נוסף קישור" לפני שהקישור חזר:** בעדכון, הקישור נקרא מהאירוע לפני שנבחרת השורה הראשונה. `act.cal.online_added` רק כשיש קישור (או שהפגישה המקוונת קיימת והקישור בהכנה). כש-Graph מחזיר את האירוע בלי פגישה (`isOnlineMeeting` false, ספק "unknown", `onlineMeeting` null, למשל מדיניות Teams שמכבה את התוסף ל-Outlook) או ש-Google מחזירה `failure`, בבקשה של הקישור בלבד התשובה היא `act.cal.online_missing` ("אין אפשרות ליצור...") ו-`act.cal.online_not_added` ("הפגישה ״...״ נשארה בלי קישור, והמשתתפים קיבלו עדכון בלי קישור."), והפעולה מסומנת `failed`.
- **השמטה שקטה = אין אפשרות, לא "לנסות שוב":** `act.cal.online_missing` משתמש בניסוח של `act.cal.online_unavailable` ובלי "אפשר לבקש להוסיף אותו": באותו חשבון זה ייכשל שוב, וכל ניסיון שולח עדכון לכל המשתתפים.
- **בדיקת Teams שלא ענתה:** `GraphClient.onlineMeetingProviders` מחזיר null רק ל-429 / 5xx / 408 / תקלת רשת, וזורק על כל השאר. במקום `err.provider_down` (שהבטיח "אנסה שוב ואעדכן" בלי שמשהו ינסה) - `act.cal.online_check_failed` וטיוטה חדשה של אותה פגישה (`onlineCheckFailed` ב-`lib/bot/pending.ts`, הסימון `online_retry` פותח אותה במשפט ההסבר).
- **Teams נבדק לפני הטיוטה:** `update_event` (Microsoft) בודק את `allowedOnlineMeetingProviders` כשמבקשים קישור לפגישה בלי קישור, ובלי Teams מחזיר `online_unavailable` (בלי טיוטה). `create_event` הכללי שואל דרך `ToolContext.onlineMeetingCheck` (מחובר ב-`lib/bot/handle-inbound.ts`), ובלי Teams מכין מיד את הפגישה בלי קישור עם ההסבר וכפתור [קבע בלי קישור]. ב-Google אי אפשר לבדוק מראש עם `calendar.events` (נדרש calendar.readonly או calendar.calendarlist), ולכן רק התגובה ל-400 (מתועד ב-`lib/online-meeting.ts`).
- **השירות בתוצאת הכלי:** `create_event`, `gcal_create_event` ו-`update_event` / `gcal_update_event` מחזירים `online_service` ("Teams" / "Google Meet"), וההערה מבקשת לציין אותו במשפט הקצר. בהנחיות: בקשה מפורשת ל-Meet כששני היומנים מחוברים → `gcal_create_event`; ל-Teams → `create_event`.
- **מזהה יציב לפגישה:** ב-Google מזהה האירוע הוא מזהה הפעולה בלי מקפים (32 תווי hex). אחרי 5xx, timeout או ניתוק ביצירה קוראים את האירוע לפי המזהה: אם נוצר, התשובה "נקבע" עם הקישור; אם לא (404/410), "השירות לא זמין" כמו קודם; אם הקריאה עצמה נכשלה, `act.cal.create_unverified` ("לא הצלחתי לוודא אם הפגישה נוצרה...") ובלי טיוטה חדשה, כדי לא ליצור פגישה שנייה ולשלוח הזמנות שוב. אותו דבר אחרי דחיית Meet שהקריאה אחריה נכשלה. ב-Graph: `transactionId` = מזהה הפעולה ב-POST.
- **דחיית Meet:** מזוהה לפי 400 והמילה conference בהודעה של ה-API, בלי לדרוש `reason: "invalid"` (Google לא מתעדת את השגיאה).
- **טיוטה חלופית של סוכן:** נבדקת גם היכולת (`capabilityOfAction` ב-`lib/agents/capabilities.ts`: פגישה → `calendar.write`), כך שסוכן שהוסרה ממנו גישת היומן לא מקבל טיוטת יומן בשמו.
- **קישור שכתוב בטקסט:** `joinUrlInText` (`lib/online-meeting.ts`) מוצא קישור פגישה במקום או בגוף האירוע (תוסף Zoom ב-Outlook, קישור Zoom / Teams בתיאור של Google), לפי אותם כללים של `safeJoinUrl`. פגישה כזו נחשבת פגישה עם קישור: אין טיוטת "הוספת פגישת Teams", הקישור מוצג ב-`join_url` ובסיכום הבוקר.
- **טקסטים:** `act.cal.online_exists` בלי קישור: "לפגישה כבר יש פגישה מקוונת, והקישור מופיע באירוע ביומן. לא נוסף קישור חדש."; בחשבון אישי: "(יצירת פגישת Teams מהיומן זמינה רק בחשבון עבודה או בית ספר)". חדשים: `act.cal.online_not_added`, `act.cal.online_check_failed`, `act.cal.create_unverified`; `act.cal.join_link_later` עם `ready`.
- **הערכת העברית:** `online_meeting` נוסף ל-`create_event` / `update_event` ב-`scripts/hebrew-eval`, עם סעיף "פגישות מקוונות" בהנחיות, שדה `expected_online_meeting` ובדיקה אוטומטית ("online_meeting נכון" בדוח). חמישה פריטים חדשים (`msg-109`…`msg-113`; במקור `msg-101`…`msg-105`, מוספרו מחדש במיזוג כי המספרים כבר היו תפוסים): "פגישת טימס", "זום עם כהן" → true, "שיחה עם כהן", "פגישה במשרד", "לקוח מחיפה" → false.
- **תקציב:** `SpendGuard` מעגל את ההערכה למיקרו-דולר לפני ההזמנה, כך שהזמנה ושחרור שלה לא משאירים מיקרו-דולר (הבדיקה בוואטסאפ הקולי נשברה כשההנחיות התארכו).
- **בדיקות:** `lib/ms/online-meeting.test.ts` (חשבון אישי לפני הטיוטה ואחרי האישור, בדיקה שלא ענתה ואישור שני שיוצר את הפגישה, 403 בבדיקה, השמטה של Graph ביצירה ובעדכון כש-Teams ברשימה, בדיקה שלא ענתה בעדכון, 400 על PATCH, קישור Zoom במקום, `transactionId`, סוכן בלי `calendar.write`, טיוטה חלופית של סוכן לעדכון עם רשימת נמענים), `lib/google/online-meeting.test.ts` (`failure` ביצירה ובעדכון, דחיית Meet עם reason אחר, יצירה שענתה 503 / ניתוק אחרי שנכתבה, דחייה שאחריה הקריאה נכשלה, קישור Zoom בתיאור, `online_service`), `lib/online-meeting.test.ts` (`joinUrlInText`, הטקסטים החדשים).

### מיזוג ל-claude/preview (23.10)
- **הכול נשמר משני הצדדים:** `graphTools` מקבל גם `connection` (זיהוי חשבון אישי ל-Teams) וגם `scopes` / `connectLink` (To Do / SharePoint); `ToolContext` נושא גם `requestFlow` / `addReplyButtons` וגם `onlineMeetingCheck`; ה-fixtures של Graph ו-Google נושאים גם את To Do / Tasks / `denied` וגם את `onlineMeetingProviders` / `conferenceMode`.
- **ניסוח ניטרלי:** ההערות החדשות בתוצאות הכלים של הפגישות המקוונות כתובות בשם הפועל ("לענות במשפט קצר"), כמו שאר הכלים.
- **סטטוס:** Google Meet ו-Microsoft Teams מסומנים "זמין" ב-`lib/integrations/catalogue.ts` (קישור לפגישה כשמבקשים; Teams בחשבון עבודה), והבדיקות ב-`catalogue.test.ts` וב-`integrations.test.tsx` עודכנו. בשורת היכולות של יומן Outlook (`lib/ai/account-context.ts`) נוסף שבחשבון Microsoft אישי אין קישור Teams.
- **הערכת העברית:** רצה על ה-prompt של המוצר (כולל הסעיף "פגישות מקוונות"; `product-prompt.generated.ts` חודש), עם שתי העמודות של שני הצדדים בדוח (online_meeting נכון, פנייה מגדרית, סיפור על ניסיון פנימי). 113 פריטים; `dataset/README.md` עודכן.

## מסלולים: בסיסי מול פרו (23.10)
> משימה: דניאל אישר חלוקה חדשה - שמי שמשלם יותר יקבל יותר. עד עכשיו שני המסלולים כללו את כל החיבורים והיו שונים רק בהודעות ובסוכנים.

- **מקור אמת אחד:** `entitlements(plan)` ב-`lib/billing/plans.ts` (`maxProviders`, `tasks`, `sharepoint`, `fileCreate`, `driveFullRead`, `meetingSummaries`, `proactive`, `businessSystems`, `builtinAgents`, `customAgents`). המספרים לא השתנו (99 ₪ / 750, 299 ₪ / 3,000, 10 הודעות ניסיון). מאותו מקום: `planFeatures` (שורות המחירון), `PRO_FEATURES` / `missingProFeatures` (מה חסר במסלול), `providerGate` / `connectionsInForce` / `mayConnect` (חשבון אחד).
- **החלטה - הניסיון:** כמו בסיסי בחיבורים ובשירותים (חשבון אחד, בלי שירותי פרו), כדי שלשדרוג יהיה ערך; הסוכנים המובנים נשארים בניסיון כמו שהם (ההחלטה הקודמת).
- **החלטה - שני חשבונות מלפני החלוקה (או ירידה מפרו):** שום דבר לא מנותק ולא נמחק. החשבון שחובר אחרון (`created_at` החדש מבין החיבורים הפעילים; חיבור מחדש לא משנה אותו) פעיל, והשני "מושהה": הכלים, סיכום הבוקר (`lib/jobs/index.ts`) וההקשר של המודל לא משתמשים בו. באזור האישי הודעה: "עכשיו פעיל X, ו-Y מחובר אבל מושהה. אפשר לנתק את אחד מהם, או לשדרג לפרו". המודל יודע ואומר את זה.
- **אכיפה בשרת:**
  - `/api/auth/{google,microsoft}/start` (`lib/connections/plan-gate.ts`): חשבון שני בבסיסי / בניסיון, ו-`feature=drive_read` / `feature=tasks` בבסיסי, מחזירים 303 לדף התשלום האישי `/pay/<token>?why=second_account|pro_feature` (קוד קבוע, לא טקסט מה-URL), לפני כל כתיבה. חיבור מחדש של החשבון הפעיל פתוח. אישור מנהל של Microsoft (`admin=1`) לא נחסם (לא יוצר חיבור). חיבור רגיל של Google בבסיסי לא מבקש `drive.readonly`.
  - בשיחה (`lib/bot/process-inbound.ts`): "לחבר את גוגל" כשחשבון אחר פעיל בבסיסי → `s.plan.one_account` (בלי קישור ובלי מודל).
  - כלים: `googleTools` / `graphTools` מקבלים `entitlements` (בבסיסי: Drive במצב drive.file גם כשיש לטוקן drive.readonly, בלי `gdrive_save_doc`, בלי `gtasks_*` / `todo_*` / `sharepoint_*`, בלי `gdrive_read_status`). והשער האחרון ב-orchestrator: `toolsForPlan` (`lib/ai/plan-tools.ts`) מוציא לפי שם את כלי הפרו ומוסיף `pro_feature`, שעונה בשורה אחת (`s.plan.pro_feature`) עם "שדרוג". סינון היכולות של סוכן רץ על הרשימה המסוננת, ו-`pro_feature` הוא main-only.
  - `lib/connections/services.ts`: סטטוס חדש `pro_only` - "במסלול פרו", האייקון קישור לשדרוג (במקום "צריך אישור נוסף"): Google Tasks, To Do, SharePoint, Docs / Sheets / Slides; בחשבון מושהה כל השירותים. Drive וקבצי Office נשארים "מחובר" עם מה שיש בבסיסי.
  - ההנחיות למודל: כל מסלול עם מה שהוא כולל (ו"בקרוב" בפרו), בסעיף "החשבון" מה כלול ומה רק בפרו, ובסעיף "חיבורים" שהספק השני לא ניתן לחיבור / מושהה. כלל חדש: שירות שלא במסלול → `pro_feature`. ה-prompt של הערכת העברית חודש (`pro_feature` נוסף לכלים וגם ל-mock שלה).
- **ממשק:** המחירון בדף הנחיתה - בבסיסי השורות שלו והאייקונים של שירותי החשבון האחד מתחת ל"חשבון אחד: Google או Microsoft"; בפרו "כל מה שבבסיסי, ובנוסף:" עם שורות הפרו, "בקרוב" ליד מה שעוד לא קיים, וכל האייקונים (מערכות העסק עם "בקרוב"). `integrationsForPlan` לפי `plan` בכל פריט ב-`lib/integrations/catalogue.ts`. כרטיסי המסלול בדף התשלום, פני השדרוג (`proAdds`) וכרטיס המנוי באזור האישי ("מה כלול במסלול") מאותן שורות. שאלות נפוצות וצ'אט התמיכה (`lib/support/knowledge.ts`) עודכנו ונבנים מהמסלולים. בשלב החיבור בהרשמה, עם חשבון מחובר: שורה שהשני בפרו.
- **טקסטים:** `s.plan.pro_feature`, `s.plan.one_account` וטקסטי האתר - `docs/copy/bot-copy-services.md` §1, §2, §3.
- **בדיקות:** `lib/billing/plans.test.ts`, `lib/connections/plan-gate.test.ts`, `lib/ai/plan-tools.test.ts`, ובנוסף ב-`google-routes.test.ts` / `ms-routes.test.ts` (הפניה לדף התשלום), `services.test.ts` / `service-row.test.tsx`, `system-prompt.test.ts`, `connect-intent.test.ts` (סירוב בשיחה, חשבון מושהה), `google/tools.test.ts` / `ms/workspace-tools.test.ts`, `landing.test.tsx`, `upgrade-faces.test.tsx`, `e2e/account.spec.ts`. בדיקות קיימות שבדקו שירותי פרו על משתמש בניסיון עודכנו לרוץ על פרו.
- **פתוח:** חיבור שקיבל `drive.readonly` לפני החלוקה שומר את ההרשאה בטוקן (הכלים לא משתמשים בה בבסיסי; ביטול אמיתי דורש חיבור מחדש). יצירת קבצים ב-OneDrive עוד לא קיימת (רק Drive). הודעת וואטסאפ יזומה למי שחשבונו מושהה - לא נשלחת (רק האזור האישי והמודל כשנשאלים). הערכת העברית החיה לא הורצה מחדש (עולה כסף).

## האזור האישי באזורים: סקירה, חיבורים, וואטסאפ, סוכנים, מנוי, הגדרות (23.10)
> משימה: דניאל - "שיהיה יותר מסודר, בלי לגלול ובלי שדברים נעלמים בתפריטים; למשל אזור סוכנים". העיצוב ("לילה ירוק") נשאר, רק מסודר מחדש. אותם server actions ואותם טקסטים.

- **מבנה:** למעלה סקירה קצרה שמופיעה בכל אזור - הברכה, המשפט של עלזה, המייל, ו-4 צ'יפים שכל אחד קישור לאזור שלו: חיבורים ("חיבור אחד פעיל" / "חיבור צריך חידוש"), וואטסאפ ("מקושר" / "לא מקושר"), סוכנים ("3 סוכנים פעילים"), והמסלול עם ההודעות ("בסיסי: 120 מתוך 750 הודעות", עם פס קטן; "התשלום נכשל" כשנכשל). מתחת - ניווט ואזור אחד בכל פעם. במסך רחב: עמודה בצד ההתחלה (ימין), דביקה; בטלפון: שורה דביקה אחת של שישה תאים (אייקון מעל שם), כולם גלויים ב-390 בלי גלילה אופקית (צר מזה - השורה נגללת בתוך עצמה). נקודת דבש ליד אזור שצריך טיפול.
- **כתובות (`app/account/areas.ts`):** `/account` = סקירה, `/account?tab=connections|whatsapp|agents|plan|settings`. כל האזורים מרונדרים בשרת פעם אחת (אותם נתונים כמו קודם), והכתובת קובעת מה מוצג. לחיצה מחליפה מיד (`history.pushState`, ש-Next.js מסנכרן עם `useSearchParams`), מעבירה פוקוס לכותרת האזור, וכפתור "אחורה" עובר בין האזורים. הקישורים אמיתיים: בלי JavaScript או בלשונית חדשה השרת מציג את האזור. דפוס נגישות: `<nav>` עם `aria-current="page"` וכותרת לכל אזור (לא tabs - כל אזור הוא כתובת).
- **הודעות באזור הנכון:** כל action חוזר לאזור שלו עם ההודעה שם (`back()` ב-`actions.ts`: ניתוק → חיבורים, ניתוק מספר → וואטסאפ, ביטול מנוי → מנוי, מחיקה שנכשלה → הגדרות, סוכנים → סוכנים). חזרה מ-OAuth → `?tab=connections` (`lib/auth/oauth-return.ts`), חזרה מתשלום / עדכון כרטיס → `?tab=plan` (`lib/billing/result.ts`), קישור "החלפת מספר" בוואטסאפ → `?tab=whatsapp` (`lib/bot/linking.ts`), "לאזור האישי" בפני השדרוג בדף התשלום → `?tab=plan`. קישורים ישנים עובדים: `?at=agents#agents` ו-`?new=<תבנית>` פותחים את הסוכנים, ו-`/account?notice=…` בלי אזור מציג את ההודעה בסקירה. "סגירה" בהודעה סוגרת במקום ומורידה אותה מהכתובת.
- **סקירה:** שורה שקטה לכל אזור (חיבורים עם שני הספקים, המספר, הסוכנים הפעילים ושורת המכסה) עם "ניהול" או הצעד החסר ("קישור מספר"); בהדגמה גם הצ'אט באתר. לצידה כרטיס המנוי (הנייר עם הדוכיפת) בגרסה מקוצרת: מד ההודעות והצעד הבא, ו"פרטי המנוי והתשלום".
- **סוכנים:** כרטיסים ברשת (שתי עמודות): שם, מצב, מקור, יכולות, וההצעה לנסות בוואטסאפ בניסיון. עריכה ויצירה נפתחות בגיליון צד (`_components/agent-sheet.tsx`, Dialog של base-ui: פוקוס נשאר בפנים, Esc סוגר, בטלפון מסך מלא) עם אותם טפסים. "סוכן חדש" - ארבע תבניות בשורה; קישור תבנית (`?tab=agents&new=…`) מרנדר את הטופס בשרת ופותח את הגיליון, וסגירה מורידה את `new`. אחרי שמירה הגיליון נסגר וההודעה בראש האזור; שגיאה חוזרת לגיליון ששלח אותה (Next.js מרכיב את הדף מחדש אחרי redirect של action, אז השליחה נזכרת מחוץ ל-React).
- **מנוי:** כרטיס המנוי המלא (חיוב הבא, שדרוג לפרו, עדכון אמצעי תשלום, ביטול בקיפול כמו קודם), ולצידו "מה כלול במסלול" פתוח על הבמה (לא מקופל), ומתחת "במסלול פרו, בנוסף:" בשתי עמודות. `PlanFeatureList` קיבל `tone="night"`.
- **הגדרות:** פרטי החשבון (שם, העסק, מתי נפתח) ומחיקת החשבון - פתוחה באזור שלה (בלי קיפול), עם מילת האישור כמו קודם.
- **אריחי השירותים (ניסיון, דניאל):** בשורת השירותים של כל חשבון - האריחים המאוירים של הסט הכהה (`public/brand/integrations/night/*.webp`, `next/image` בגודל הקודם) במקום הגליפים. המצב נשמר: מחובר - צבע מלא ומסגרת מרווה; צריך אישור - שקוף למחצה עם נקודת הדבש; במסלול פרו - שקוף עם מסגרת דבש; לא זמין - דהוי באפור עם קו מקווקו. השמות והטולטיפים לא השתנו. חזרה לגליפים: `SERVICE_ICON_STYLE = "glyphs"` ב-`lib/connections/service-tiles.ts` (מיוצא גם מ-`services.ts`).
- **טעינה:** השלד של `<Suspense>` הוא צורת הדף (הכותרת, הצ'יפים, הניווט) בלי נתונים, כך שאין הבהוב ריק ואין קפיצה. בדיקת הסשן כמו קודם (`await connection()` ואז הפניה ל-`/login`).
- **קבצים:** `app/account/page.tsx`, `areas.ts`, `view.ts` (`statusChips`, `areasNeedingAttention`), `actions.ts`; `_components/area-nav.tsx`, `banner.tsx`, `overview.tsx`, `rows.tsx`, `plan-slip.tsx`, `agents-section.tsx`, `agent-sheet.tsx`, `settings.tsx`.
- **בדיקות:** `app/account/areas.test.tsx` חדש (כתובות והודעות לפי אזור, קישורים ישנים, צ'יפים, ניווט: aria-current, החלפה, פוקוס, לחיצה עם Ctrl, הודעה וסגירה, גיליון סוכן חדש לפי הכתובת). `actions.test.ts` (`tab` במקום `at`), `result.test.ts` ו-`google-routes.test.ts` (האזור בכתובת החזרה), `upgrade-faces.test.tsx`. E2E: `account.spec.ts` (מעבר בין אזורים, אחורה, קישורים ישנים, מקלדת, הצ'יפים, ששת התאים בטלפון), `agents.spec.ts` (כרטיסים, גיליון עריכה / יצירה, שגיאה שחוזרת לגיליון, Esc), `pay.spec.ts`, `screens.spec.ts` (גם סקירה / סוכנים / מנוי / הגדרות, axe), `demo.spec.ts`. `pnpm e2e` 28/28.
- **פתוח:** אחרי שגיאה בשמירת סוכן מה שהוקלד לא נשמר (הטופס חוזר לערכים השמורים, כמו קודם); שגיאה ביצירת סוכן חדש מחזירה לרשת (הכתובת בלי `new`, כמו קודם). `pnpm e2e:demo` לא הורץ (build נפרד); הכתובת שלו עודכנה.

## התראות יזומות ואזהרות פישינג (פרו, 23.10)
> משימה: שני שירותי הפרו שסומנו "בקרוב" (`docs/research/instinct.md` §8, המלצות 1, 2, 4 ו-3). ההחלטה של דניאל: בתוך סיכום הבוקר, ובנוסף עד 2 התראות דחופות ביום למשתמש. עכשיו "זמין" במחירון, בדף התשלום, באזור האישי, בצ'אט התמיכה ובהנחיות למודל (`proactive` בלי `soon` ב-`lib/billing/plans.ts`, ו-`proactive` ב-`PRO_FEATURES` כך ש-`pro_feature` עונה עליו בבסיסי).

- **"דברים שכדאי לא לפספס" בסיכום הבוקר** (`lib/proactive/digest.ts`, מחובר ב-`lib/jobs/morning-summary.ts`): רק בפרו (`entitlements.proactive`, נבדק בשרת) ורק כשההתראות לא כובו. הסעיף ראשון אחרי "בוקר טוב": אזהרות פישינג (מיילים מ-3 הימים האחרונים, עד 2), התראות דחופות שלא נשלחו (ראו למטה), התנגשויות היום בין שני היומנים, פגישות צמודות בשני מקומות, מועדים מתוך מיילים מ-14 הימים האחרונים שנופלים מהיום עד שבוע ("עד יום ה׳", "עד ה-30.10", "עד סוף השבוע", "by Friday" — `lib/proactive/deadlines.ts`), מיילים מאנשים שמחכים לתשובה 2 ימי עסקים ומעלה (א׳–ה׳ בלי חגים; בלי דיוור, no-reply, List-Unsubscribe / Auto-Submitted / Precedence — `lib/proactive/mail.ts`), ופגישה בהמשך היום עם משתתף מחוץ לעסק ("אפשר לבקש תדריך קצר"). עד 9 שורות. מייל שבסעיף לא חוזר ב"מיילים שמחכים לתשובה". בבסיסי ובניסיון הסיכום זהה לקודם (גם בלי הקריאות הנוספות).
- **כפתורים:** בתוך החלון — רשימה אחת מתחת לסיכום ("בחירת פעולה", עד 10 שורות): `[לנסח תשובה]` `[להזכיר מחר]` `[תזכורת למועד]` `[לטפל בהתנגשות]` `[תדריך לפגישה]` `[לסמן כחשוד]`. מחוץ לחלון — תבנית `morning_summary` הקיימת: שורות המייל בסעיף המיילים, שורות היומן בסעיף הפגישות, וה-quick reply `[לנסח תשובה]` נושא `al:reply:<id>` של המייל הראשון. כל שורה נשמרת (`proactive_alerts`) כדי שהכפתור ימצא אותה (`al:<פעולה>:<id>`, תמיד עם מזהה המשתמש). ניסוח, תדריך והזזת פגישה הופכים לבקשה רגילה לעוזרת (אותו מסלול, טיוטה עם כפתורי אישור); תזכורת — שירות התזכורות, בלי מודל. שום דבר לא נשלח ולא משתנה בלי אישור.
- **התראות דחופות** (`lib/proactive/alerts.ts`): עד 2 ביום למשתמש, רק 08:00–20:00 (שעון המשתמש, ברירת מחדל Asia/Jerusalem), לא בשבת ובחג ולא בערב שבת / חג מ-14:00 (`lib/time/rest-days.ts` — החגים מלוח השנה העברי של ICU, בלי טבלה). שני סוגים: התנגשות ביומן ב-24 השעות הקרובות, ומייל דחוף בעל אות חזק — מאדם שהמשתמש כבר כתב אליו (Sent Items), שכותב במפורש שזה דחוף ("דחוף", "בהול", "urgent", "ASAP") או מסומן בחשיבות גבוהה, ושאינו חשוד כפישינג. סריקה = משימת `proactive_scan` (pg_cron `schedule_proactive_scans()` כל 20 דקות לשעה העגולה הבאה; התראת Graph על מייל חדש מוסיפה סריקה בעוד 2 דקות, פעם ב-10 דקות; אחרי כל סריקה ואחרי סיכום הבוקר — הסריקה הבאה). התקרה, הכפילות וה"פעם אחת לפריט" אטומיים ב-SQL (`proactive_alert_claim`, נועל את שורת המשתמש).
- **חלון 24 השעות:** אין תבנית מאושרת להתראה (`lib/wa/templates.ts`), ולכן מחוץ לחלון ההתראה לא נשלחת: היא נרשמת `deferred` ונכנסת פעם אחת לסיכום הבוקר הבא ("• מייל דחוף מ-…"). כך גם התראה שלישית ביום ושליחה שנכשלה. תועד ב-`docs/copy/wa-templates.md`.
- **פישינג / BEC** (`lib/proactive/phishing.ts`): קריאה בלבד. אותות דטרמיניסטיים עם משקל: דומיין דומה לאיש קשר מוכר או למותג (אות דומה, אות אחת, TLD אחר, punycode), שם תצוגה של איש קשר מוכר מכתובת אחרת או של מותג מחוץ לדומיינים שלו, Reply-To בדומיין אחר (לא בדיוור), שינוי פרטי בנק / IBAN, לחץ לתשלום דחוף, בקשת התחברות עם קישור חשוד (IP, מקצר, punycode, `@` בכתובת). 3 ומעלה = חשוד, 1–2 = גבולי. "אנשי קשר מוכרים" = מי שהמשתמש כתב אליו (Sent Items ב-Graph, נמענים בשרשורים ב-Gmail). כשעלזה קוראת מייל (`get_email`, `search_emails`, `gmail_get_email`, `gmail_search_emails`) בפרו, חשוד מקבל `phishing_warning.say` ("⚠️ שימו לב: …") והמודל פותח בו ולא מבצע שום בקשה מהמייל; גבולי מקבל `phishing_signals` לשיקול המודל. `[לסמן כחשוד]` רק ב-Microsoft 365 עם Mail.ReadWrite: קטגוריה "חשוד - פישינג" ב-Outlook, בלי להזיז, למחוק או לענות. ב-Gmail (gmail.readonly) — רק אזהרה.
- **מודל זול** (`lib/proactive/classify.ts`): רק בסיכום הבוקר, רק למייל גבולי שלא נקרא ולמועד שכתוב במילים שהכללים לא קוראים, עד 3 קריאות לריצה, ב-router (Haiku) עם JSON. מאחורי מגן ההוצאות כשהוא מוגדר (`guard.anonymousAi` ב-`lib/jobs/index.ts`). התוכן עטוף ב-`<data>`, והמודל מחליט רק כן / לא / תאריך — הטקסט למשתמש תמיד מהטקסטים שלנו. כשמגיעים לתקרה או שהקריאה נכשלת — נשארים עם הכללים (גבולי לא מסומן).
- **שליטה:** "בלי התראות" / "להחזיר התראות" בוואטסאפ (בלי מודל ובלי ספירה), הכפתור `[בלי התראות]` בכל התראה, ובאזור האישי → הגדרות: "התראות יזומות" עם כפתור אחד (בבסיסי: "כלול במסלול פרו" ו"מעבר לפרו"). נשמר ב-`profile.alerts_disabled`; למודל מגיעה רק שורה אחת כשהן כבויות (רשימת המפתחות המותרים ב-`lib/ai/system-prompt.ts`). כיבוי מבטל סריקות שבתור.
- **מיגרציה `0013_proactive_alerts.sql`:** `job_kind` + `proactive_scan`, הטבלה `proactive_alerts` (שרת בלבד, RLS בלי policy; payload = מטא-דאטה בלבד: ספק, מזהה, שולח, נושא, כותרות פגישות — בלי גוף מיילים), `proactive_alert_claim()`, `schedule_proactive_scans()`, `purge_proactive_alerts()` (מחיקה אחרי 30 יום, cron יומי). `supabase/tests/proactive_alerts.test.sql`.
- **עוד:** `GraphClient.listInbox({ withHeaders })` (Reply-To, חשיבות, כותרות דיוור), `sentRecipients`, `markSuspicious`; ב-Gmail הכותרות Reply-To / Importance / X-Priority ו-`gmailSentRecipients`. ה-fixture של Graph: תיבה ניתנת לשינוי (`state.messages`, `fixtureGraphMessage`), Sent Items ו-PATCH של קטגוריות. ההנחיות למודל: סעיף "מיילים חשודים והתראות יזומות" (ה-prompt של הערכת העברית חודש; `npm run pipeline -- --dry-run` עובר). צ'אט התמיכה: שאלה חדשה "מה הן ההתראות היזומות?".
- **טקסטים:** `docs/copy/bot-copy-proactive.md` (`lib/copy/bot-proactive.ts`), הערה ב-`act.morning.summary` (`bot-copy.md`).
- **בדיקות:** `lib/proactive/*.test.ts` — מועדים, יומן (ההתנגשות ב-fixtures בין הדיון בבית המשפט לפגישת הצוות, משתתפים חיצוניים), כותרות דיוור, פישינג (אמת: gm5, דומיין דומה, שם תצוגה, קישור התחברות; בלי אזעקת שווא: כל ה-fixtures הרגילים, התראת האבטחה של Google, ניוזלטר, "ביטוח לאומי"), סיכום הבוקר בפרו / בסיסי / ניסיון / כבוי / בלי Mail.ReadWrite / מודל זול, התקרה של 2, כפילות, יום חדש, חלון סגור → סיכום הבוקר, שעות שקטות / שישי / שבת / יום כיפור, כיבוי, בסיסי, תזמון, הכפתורים דרך `processInbound`, הפקודות, ההגדרה באזור האישי, האזהרה בכלי הקריאה. `lib/time/rest-days.test.ts`, `lib/copy/bot-proactive.test.ts`, `lib/db/supabase-proactive.test.ts`, `app/account/account.test.tsx`.
- **פתוח:** תבנית ייעודית להתראה (`proactive_alert`) תאפשר התראה גם מחוץ לחלון — החלטה של דניאל ורישום ב-Meta. "לנסח תשובה" יוצר טיוטת מייל חדש לשולח עם "Re:", לא תשובה בשרשור (ל-`draft_email` אין `reply_to`). ב-Gmail הבדיקה רואה רק את תיבת הדואר הנכנס האישית (בלי קטגוריות עדכונים / קידומי מכירות, בלי מיילים עם כותרות דיוור), ופישינג שמסווג שם לא נבדק בסיכום. "אנשי קשר חשובים" = מי שהמשתמש כתב אליו ב-60 הימים האחרונים; אין עדיין רשימה ידנית. סף "ערב שבת" קבוע (14:00), בלי שעות כניסת שבת. ההערכה החיה של העברית לא הורצה (עולה כסף).

- **0013 על Supabase החי (23.10):** הוחל בלי בלוק ה-pg_cron בסוף (סריקות כל 20 דקות + ניקוי יומי), כי הקוד בייצור עוד לא מכיר את `proactive_scan`. את הבלוק מריצים כשה-Preview עובר לייצור.

## סבב 2 על ה-Preview: אריחי האייקונים שלנו, מחירון מקוצר, `/pricing`, בקשת מערכת ושירותים דהויים באזור האישי (23.10)
> משימה: ההערות של דניאל על ה-Preview - הלוגואים הרשמיים על אריחים לבנים נראים רע על הדף הכהה; המחירון גבוה מדי (היה צריך להקטין את הזום); "חסרה מערכת?" צריך להיות טופס; באזור האישי לראות מה חיבור ייתן.

- **אריחי Nano Banana במקום הלוגואים על לבן:** מקור אחד - `lib/integrations/tiles.ts`: `INTEGRATION_MARK_STYLE = "tiles"` (מתג אחד; `"svg"` מחזיר את סמלי המוצרים בקוד על האריח הלבן, `components/brand/integrations/icons.tsx` נשאר), `INTEGRATION_TILE` (מזהה בקטלוג → קובץ), `tileSrc` / `integrationTileSrc`. הסט הכהה (`public/brand/integrations/night/`) ברצועת "עובדת עם" וברשימת החיבורים, הסט הבהיר (`paper/`) על נייר המחירון. `IntegrationTile` / `MoreTile` מציירים את התמונה ב-`next/image`, בלי שבב לבן: התמונה מוגדלת מעט ונחתכת ברדיוס המסגרת שלה (19%). הטולטיפים והשמות לקורא מסך לא השתנו. בכותרות הקבוצות ברשימת החיבורים ירד שבב הלוגו הלבן של Google / Microsoft (חוזר עם המתג). `lib/connections/service-tiles.ts` משתמש באותו `tileSrc`.
- **"ועוד בהמשך" → "בקשת מערכת":** השורה האחרונה בעמודת מערכות העסק היא כפתור שפותח טופס (`components/brand/system-request.tsx`, Dialog של base-ui: במרכז במסך רחב, גיליון תחתון בטלפון; פוקוס בשדה הראשון, Esc / "ביטול" / X סוגרים והפוקוס חוזר לכפתור). שדות: שם המערכת, מה עלזה תעשה איתה, אימייל (ממולא כשמחוברים, דרך `GET /api/support/ticket`), סוג העסק (לא חובה), ו-honeypot. **בלי מיגרציה:** אותו `POST /api/support/ticket` עם `kind: "system"` (`lib/support/system-request.ts`) - נשמר ב-`support_tickets` עם הנושא "בקשת מערכת: <שם>" והתשובות בגוף, ונשלח במייל לתיבת התמיכה (`notifySupport`; נושא המייל "בקשת מערכת: <שם>"). אותן הגבלות: Origin, 5 בשעה / 20 ביום לכל IP - **תקציב משותף** עם הפניות, honeypot. שאילתה לדניאל: `select * from support_tickets where subject like 'בקשת מערכת:%'`.
- **מחירון מקוצר בדף הנחיתה:** הכותרת בשורה אחת ליד הפסקה (מ-1280), בכל מסלול השם וההודעות ליד המחיר, שורות התכונות צפופות יותר, ובתחתית שורה אחת: "חשבון אחד: Google או Microsoft" / "כולל 16 חיבורים, ועוד 4 בקרוב" (נספר מהקטלוג), 8 אריחים קטנים (28px) ו-"+K" שפותח את השאר במקום (`collapsed` ב-`IntegrationChips`, `aria-expanded`). ב-1440×900 הכותרת ושני הכרטיסים נכנסים במסך אחד (נבדק ב-e2e). מתחת: "להשוואה המלאה" → `/pricing`. הגיליון (`PlanSheet`) משותף לדף הנחיתה ול-`/pricing`.
- **`/pricing` חדש** (`app/pricing/page.tsx`, סטטי; רק "לאזור האישי" בזמן בקשה): הגיליון, "ההשוואה המלאה." - טבלה אמיתית (`<table>`, כותרות עמודה למסלולים, כותרת שורה לכל יכולת, ארבע קבוצות; ✓ / קו / "בקרוב" עם טקסט לקורא מסך; כותרת דביקה) שנבנית כולה מ-`entitlements` ו-`PLANS` (`lib/billing/compare.ts`; השורות המשותפות במילים של הבסיסי, שורות הפרו במילים של הפרו), "החיבורים בכל מסלול." (כל האריחים לפי חשבון, עם טולטיפים, וקישור לבקשת מערכת), "שאלות על המסלולים." (`PRICING_FAQ`: אחרי ההודעות החינמיות, מעבר בין מסלולים, החשבון השני במעבר לבסיסי, מע״מ, "בקרוב", ביטול - רק עובדות שהקוד אוכף או שצ'אט התמיכה כבר אומר), וסיום. "מחירים" בכותרת האתר מוביל לכאן (בדף עצמו `aria-current`, ושאר הקישורים חוזרים ל-`/#…`). `COMING_SOON` חדש ב-`lib/billing/plans.ts` (סיכומי פגישות, מערכות העסק) - מקור אחד ל"בקרוב" במחירון ובטבלה.
- **אזור אישי → חיבורים:** חשבון שלא מחובר מציג את שורת השירותים שלו דהויה, כתצוגה של מה שהחיבור ייתן (`previewServices` ב-`lib/connections/services.ts`, סטטוס חדש `preview`): "Gmail - יתחבר עם Google", בטולטיפ מה השירות עושה; שירות שלא במסלול - "... במסלול פרו"; חשבון שני במסלול של חשבון אחד - שורת "Google ו-Microsoft יחד: במסלול פרו". כפתורים שרק מסבירים (בלי קישורים) - "חיבור" בשורה הוא הדרך פנימה. חשבון מחובר נשאר עם עיצוב הסטטוס הקודם.
- **טקסטים:** `docs/copy/support-chat.md` - "בקשת מערכת", "דף המחירים", "שירותים של חשבון שלא מחובר".
- **בדיקות:** `lib/integrations/tiles.test.ts` (כל מערכת בקטלוג → קובץ קיים בשני הסטים, 24 קבצים זהים), `lib/billing/compare.test.ts`, `components/brand/system-request.test.tsx`, `app/pricing/page.test.tsx`, ובנוסף `integrations.test.tsx` (שני המצבים של המתג, השורה המקופלת), `landing.test.tsx` (המחירון המקוצר, הכותרת, הרשימה בלי שבבים לבנים והכפתור לבקשה), `support-ticket-route.test.ts` (בקשת מערכת: שמירה, מייל, מחובר, שגיאות, honeypot, Origin ותקציב משותף), `services.test.ts` / `service-row.test.tsx` (`preview`). E2E חדש `e2e/pricing.spec.ts`: המחירון ב-1440×900, `/pricing` ב-390 וב-1440 (בלי גלילה אופקית, axe נקי), הטופס ב-390 עם שליחה אמיתית. `pnpm e2e` 32/32.
- **פתוח:** האריחים שלנו עדיין מזכירים את סמלי המוצרים (M של Gmail, משולש Drive) - לכלול אותם בבדיקת הנחיות המותג (שורה 12 ב"דרוש מדניאל"). אין עדיין ממשק לצפייה בבקשות מערכת (המייל והטבלה). בקשת מערכת מאדם לא מחובר נשמרת בשם "פונה מהאתר" (הטופס לא מבקש שם). `/pricing` לא במפת אתר (אין sitemap בריפו).

## "נעים להכיר" - סרטון הדוכיפת בדף הנחיתה (23.10)
- **המיקום:** סקשן קצר חדש מיד אחרי ה-hero ולפני "יום עבודה אחד, בוואטסאפ." (`components/brand/landing/meet.tsx`, `#meet`): ה-hero אומר מה היא עושה, כאן פוגשים אותה, ואחר כך היום שלה. כותרת אחת - "נעים להכיר, זו עלזה." (השם מ-`BRAND`) - ושורה אחת: "שקטה, מסודרת ויודעת איפה הכול - כמו עוזרת ותיקה במשרד, רק בוואטסאפ." במסך רחב המילים בצד ההתחלה והכרטיס בעמודה הרחבה (5:7); בטלפון הכרטיס מתחת למילים, ברוחב מלא.
- **הכרטיס** (`components/brand/landing/hoopoe-loop.tsx`): לסרטון רקע ירוק משלו, אז הוא מוצג ככרטיס ממוסגר ולא "צף" על הדף - `rounded-card`, `shadow-stage` וקו שערה פנימי מעל התמונה. קופסה ביחס קבוע (4:3 בטלפון כדי שהציפור תהיה גדולה יותר, 16:9 מ-`sm`) עם הפוסטר מתחת, כך שאין קפיצת תוכן כשהסרטון מגיע. דקורטיבי (`aria-hidden`) - הכותרת אומרת מי היא.
- **הסרטון:** `autoPlay muted loop playsInline preload="metadata"`, פוסטר, webm (VP9) ואז mp4 (H.264). ה-`<video>` נוצר רק בדפדפן, בפעם הראשונה שהכרטיס נכנס למסך (IntersectionObserver), ומושהה כשהוא יוצא מהמסך או כשהלשונית מוסתרת. בהפחתת תנועה של המכשיר או ב"עצירת אנימציות" (`data-a11y-motion` על `<html>`) - רק הפוסטר, בלי וידאו ובלי הורדה; הפעלת ההגדרה תוך כדי צפייה מחזירה לפוסטר. בלי JS - הפוסטר. ההעדפה של המכשיר נקראת ישירות מ-`matchMedia` ולא דרך `lib/hooks/use-reduced-motion.ts`, כדי לא להכניס את motion לטעינה הראשונה של דף הנחיתה.
- **בדיקות:** `components/brand/landing/meet.test.tsx` - הכותרת והשורה, הכרטיס (aria-hidden, יחס קבוע, פוסטר), הסרטון עולה רק כשנכנס למסך עם שני המקורות בסדר הנכון, השהיה מחוץ למסך ובלשונית מוסתרת וחזרה, הפחתת תנועה = פוסטר בלבד, ו"עצירת אנימציות" (גם בהפעלה תוך כדי וגם בטעינה עם ההגדרה שמורה). בדיקת ה-CSS הלוגי והשם ב-`landing.test.tsx` סורקת גם את הקבצים החדשים.
- **נבדק בדפדפן (DATA_MODE=memory):** 1440 ו-390 - מתנגן (webm), מושהה אחרי גלילה הלאה, בלי גלילה אופקית; 390 עם הפחתת תנועה - פוסטר בלבד.

## סיכומי פגישות Teams ו-Google Meet + תבניות מחוץ לחלון (פרו, 23.10)
> משימה: אחרי פגישת Teams / Meet / Zoom — סיכום בעברית מהתמליל של הפלטפורמה (בלי בוט בפגישה), עם כפתורים למייל סיכום, מסמך משימות ומשימות ברשימה; ותבניות utility להתראה דחופה מחוץ לחלון 24 השעות (דניאל אישר).

**סטטוס לפי פלטפורמה**
- **Teams — עובד** (חשבון עבודה של Microsoft 365, עם תמלול שהופעל בפגישה): קישור ההצטרפות של האירוע ← `GET /me/onlineMeetings?$filter=JoinWebUrl eq '…'` ← `/transcripts` ← `/content?$format=text/vtt`. הרשאות חדשות (delegated, **רק בחיבור של משתמש פרו**): `OnlineMeetings.Read` ו-`OnlineMeetingTranscript.Read.All` (השנייה תמיד דורשת מנהל). מה ללחוץ ב-Entra: `docs/microsoft-setup.md` §5.
- **Google Meet — עובד** (Google Workspace עם תמלול): המסמך ש-Meet שומרת ב-Drive של המארגן — קודם מהקבצים המצורפים לאירוע, אחר כך חיפוש ב-Drive — מיוצא כטקסט. ההרשאה: `drive.readonly` שכבר קיימת בפרו (תחת התקרה של אפליקציה לא מאומתת). Meet REST API **לא** בשימוש: `meetings.space.readonly` מוגבל (CASA). `docs/google-setup.md` §11.
- **Zoom — "בקרוב"**: תמלילי ענן דורשים אפליקציית OAuth ב-Zoom Marketplace שעוברת בדיקה, ואצל המשתמש מנוי בתשלום עם הקלטה לענן. לא נבנה שלד. במחירון: שורה "סיכומי פגישות Zoom" עם "בקרוב"; בבקשה בשיחה — `mt.zoom_soon`.

**מה נעשה**
- **`lib/meetings/`:** `meeting.ts` (פגישה אחת משני היומנים: פלטפורמה לפי קישור, משתתפים בלי המשתמש, מפתח למופע), `transcript.ts` (VTT של Teams ומסמך של Meet → "דובר: מילים", חיתוך לחלקים בגבולות שורה), `find.ts` (התמליל לפי פלטפורמה: found / not_ready / none / consent / no_access / unsupported), `summarize.ts` (קריאה אחת ל-Sonnet עם JSON schema: סיכום קצר, החלטות, משימות עם אחראי ותאריך, שאלות פתוחות; תמליל ארוך מ-90 אלף תווים — הערות לכל חלק ב-Haiku ואז Sonnet אחד על ההערות, עד 8 חלקים; הכול מאחורי מגן ההוצאות, התמליל עטוף ב-`<data>` וכל שורה שחוזרת מנוקה), `deliver.ts` (טקסט + כפתורים בחלון, התבנית מחוצה לו), `jobs.ts`, `actions.ts` (הכפתורים והפקודות), `tools.ts` (הכלי `meeting_summary`), `workspace.ts` / `workspace-server.ts`.
- **התזמון:** `meeting_plan` לכל משתמש פרו כל שעה עגולה 07:00–22:59 (pg_cron `schedule_meeting_plans()`; כל ריצה גם מתזמנת את הבאה, ל-DATA_MODE=memory). היא קוראת את שני היומנים (פגישות שנגמרו ב-3 השעות האחרונות או ייגמרו בשעתיים הקרובות) ויוצרת `meeting_summary` לסוף הפגישה + 10 דקות לכל פגישת Teams ביומן Microsoft / Meet ביומן Google שאפשר לקרוא (ההרשאה בחיבור). מפתח `meeting_summary:<user>:<provider>:<event>:<end>` — פגישה שזזה מקבלת משימה חדשה, והישנה מדלגת. אחרי סיכום הבוקר מתוזמנת גם תוכנית.
- **הסיכום:** התמליל לא מוכן → שוב אחרי 15, 30 ו-60 דקות, ואז ויתור שקט. סיכום אוטומטי לא מסביר אף פעם למה אין סיכום (רוב הפגישות לא מתומללות), מכבד שעות שקטות (08:00–20:00, לא בשבת ובחג — פגישה שנגמרה ב-19:45 מסוכמת ב-08:00), "בלי סיכומי פגישות", עצירת הודעות יזומות והשהיה. נשמר רק הסיכום (טבלה `meeting_summaries`, נמחק אחרי 30 יום), לא התמליל.
- **הכפתורים** (`mt:<verb>:<id>`): [מייל למשתתפים] → טיוטת `send_mail` רגילה לאישור (הראשון ב-"אל", השאר בעותק; ה-executor של Microsoft שולח עכשיו גם `cc`), [מסמך משימות] → Google Doc ב-Drive של המשתמש (`drive.file`, `fileCreate`) או הרשימה בשיחה כשאין Google (ב-Microsoft אין כאן הרשאת כתיבה ל-OneDrive), [להוסיף למשימות] → To Do / Google Tasks (קודם של הפלטפורמה של הפגישה), פעם אחת לכל סיכום (`meeting_summary_mark()` אטומי). מהתבנית: [לראות את הסיכום], [בלי סיכומי פגישות].
- **לפי בקשה:** "סיכום של הפגישה האחרונה" / "תסכמי את הפגישה עם כהן" — הכלי `meeting_summary` (פרו בלבד, גם בשער לפי שם ב-`lib/ai/plan-tools.ts`; לסוכנים לא) מוצא את הפגישה (שבועיים אחורה, לפי שם או משתתף) ומתזמן את אותה משימה עם `on_demand`: מיד, בלי שעות שקטות, ועם הסבר כשאין: אין תמליל / עוד לא מוכן / אין גישה (לא המארגן) / חסרה הרשאה (קישור חיבור מחדש, או קישור אישור מנהל כשהארגון דרש אותו) / Zoom בקרוב. פגישה שעוד לא נגמרה — הסיכום יגיע אחריה.
- **הרשאות Microsoft לפרו:** `msScopesFor({ meetings })` בבקשת המשתמש ו-`msAdminScopesFor` בקישור המנהל. כשרק זוג ההרשאות החדש דורש מנהל (`AADSTS65001` / `consent_required`, או `access_denied` / `AADSTS65004` אחרי "Return to the application"), ה-callback מבקש מחדש בלי הזוג, החיבור הרגיל מושלם, ונרשם `profile.ms_meetings_consent = "admin_required"`. הרענון שומר את ההרשאות שהחיבור קיבל.
- **תבניות (B):** `proactive_alert` ("התראה: {{1}} … ועלזה תטפל בזה.", [לטפל עכשיו] עם אותו payload `al:reply:<id>` / `al:conf:<id>`, [בלי התראות] = `al:off`) ו-`meeting_summary_ready`. `lib/proactive/alerts.ts`: התראה דחופה נשלחת מחוץ לחלון בתבנית (`sendProactive`), עם אותה תקרה של 2 ביום, שעות שקטות וכיבוי; כשהשליחה נכשלת (לפני אישור ב-Meta) — `deferred` לסיכום הבוקר, כמו קודם. `docs/copy/wa-templates.md` (12 תבניות; מבחן מסנכרן).
- **מחירון וקטלוג:** `COMING_SOON` = מערכות העסק בלבד; שורת הפרו "סיכומי פגישות Teams ו-Google Meet" כלולה, ו"סיכומי פגישות Zoom" מסומן "בקרוב" (`ZOOM_SOON_LINE`, `proSoonTexts`) ב"מה מסומן בקרוב", בצ'אט התמיכה, בעובדות המסלול למודל ובשורה משלו בטבלת `/pricing` — לא בכרטיס המחיר המקוצר, כדי ששני הכרטיסים יישארו במסך אחד ב-1440×900 (`e2e/pricing.spec.ts`). `PRO_FEATURES.meeting_summaries` (התשובה של `pro_feature` בבסיסי). ההנחיות למודל (רשימת המסלולים) והקובץ של הערכת העברית עודכנו. צ'אט התמיכה: "את מסכמת פגישות?".
- **מיגרציה `0014_meeting_summaries.sql`:** `job_kind` + `meeting_plan`, `meeting_summary`; הטבלה `meeting_summaries` (שרת בלבד, RLS בלי policy, שורה למופע, תוכן עד 32KB); `meeting_summary_mark()`, `schedule_meeting_plans()`, `purge_meeting_summaries()`; בלוק pg_cron נפרד בסוף (תכנון כל 20 דקות, ניקוי יומי) — מוחל רק בקידום לייצור.
- **טקסטים:** `docs/copy/bot-copy-meetings.md` (`lib/copy/bot-meetings.ts`, מבחן שכל מזהה מתועד), `alert.template.*` ב-`bot-copy-proactive.md`.

**איך בודקים**
```bash
pnpm vitest run lib/meetings lib/proactive/alerts.test.ts lib/wa/templates.test.ts lib/copy/bot-meetings.test.ts lib/ms/oauth.test.ts app/api/auth/microsoft
DB_NAME=whatsappbot_test supabase/tests/run-local.sh   # MEETING SUMMARIES: ALL CHECKS PASSED
```
- **בדיקות:** VTT (שעות, NOTE, מזהי cue, `<v.class>`, ישויות, CRLF, BOM), מסמך Meet, חיתוך; מציאת התמליל ב-Teams (מופע של פגישה חוזרת, לא מוכן / אין, בלי הרשאה — בלי קריאה ל-Graph, 403) וב-Meet (קובץ מצורף, חיפוש ב-Drive, בלי `drive.readonly`, scope שהוסר); הסיכום (קריאה אחת ל-strong עם ה-schema, חלקים ל-router, חלקי, ניקוי, JSON שבור); התוכנית (סוף + 10, Zoom / בלי קישור / רחוק מדי לא, בלי הרשאה לא, בסיסי, כבוי, שעות התכנון); המשימה (טקסט + כפתורים, התבנית ו"לראות את הסיכום", ניסיונות חוזרים ונטישה שקטה, תמליל שהגיע בניסיון השני, שעות שקטות, שער פרו / כבוי / השהיה, פגישה שזזה / נמחקה, שקט באוטומטי, כישלון מודל); לפי בקשה (קישור חיבור מחדש, קישור מנהל, אין תמליל, עוד לא מוכן, 403, Meet בלי Drive, סיכום קיים); הכפתורים דרך `processInbound` (טיוטה עם עותק ושליחה רק אחרי "שלח", To Do פעם אחת, Google Tasks, Google Doc, הרשימה בשיחה, מזהה זר, אחרי ירידה לבסיסי, כיבוי והחזרה); הכלי (האחרונה, "עם כהן", Zoom, לא נמצאה, עוד לא נגמרה, לא בבסיסי ולא לסוכן); הרשאות Microsoft ונתיבי החיבור (פרו מול ניסיון, אישור מנהל, חזרה בלי הזוג ובלי לולאה); התבניות; ההתראות מחוץ לחלון (התבנית, ה-payload, לחיצה על "לטפל עכשיו", כישלון → נדחית); `supabase-meetings.test.ts`; `meeting_summaries.test.sql`.

**פתוח**
- בדיקה מול Graph ו-Google אמיתיים לא הורצה (אין קריאות בתשלום / שירותים חיים בסשן): לוודא שקישור ה-`JoinWebUrl` מהאירוע תואם בדיוק (Teams מחזיר לפעמים קידוד שונה), שמשתתף שאינו מארגן אכן מקבל 403, ואת שמות מסמכי התמליל של Meet בממשק בעברית.
- מסך "Need admin approval" של Microsoft בלי קישור חזרה (מדיניות של ארגון) משאיר את המשתמש שם — אז צריך אישור מנהל קודם (`?admin=1`).
- "מסמך משימות" ב-Microsoft 365 בלבד נשלח כרשימה בשיחה: אין הרשאת כתיבה ל-OneDrive (`Files.ReadWrite` לא מבוקש).
- סיכום אוטומטי לא מודיע כשחסרה הרשאה — רק כשמבקשים. אפשר להוסיף הודעה חד-פעמית אם דניאל ירצה.
- ההערכה החיה של העברית לא הורצה (עולה כסף); לא נוספו פריטי הערכה לכלי החדש.
- **"נעים להכיר" הוסר (בקשת דניאל, 23.10):** הקטע עם סרטון הדוכיפת אחרי הפתיחה הוסר - "לא מתאים". במקומו ייבנה סרט תדמית ב-HyperFrames. קבצי הווידאו נשארו ב-`public/brand/video/` לשימוש אפשרי בסרט.

## סבב 3 על ה-Preview: הלוגואים הרשמיים בצבע, ישר על המשטח (23.10)
> משימה (דניאל): הלוגואים הרשמיים של המוצרים בצבע, בלי שבב לבן מאחוריהם ובלי אריחי Nano Banana - בכל מקום. רשימת החיבורים ככרטיסים כהים.

- **המתג:** `lib/integrations/tiles.ts` - `INTEGRATION_MARK_STYLE = "marks"` (חדש; `"tiles"` מחזיר את אריחי Nano Banana, `"svg"` את השבב הלבן). `IntegrationTile` במצב `marks` מצייר את הסמל מ-`components/brand/integrations/icons.tsx` ישר על המשטח (`data-mark="bare"`, בלי רקע, צל או פינות). גודל אופטי אחיד: טבלת `BARE` ב-`tile.tsx` (אחוז מהצד לכל סמל - ה-viewBox של Google חתוך לציור, של Microsoft עם אוויר של 48px, הדפים גבוהים, Gmail / Meet / monday רחבים, ריבוע מלא כמו Calendar קטן יותר). `BareMark` משותף גם לאזור האישי. האריחים ב-`public/brand/integrations/` נשארו, וגם `INTEGRATION_TILE` / `tileSrc`.
- **Priority, מורנינג, iCount:** אין להם סמל נקי - מונוגרמה שלנו (`MonogramMark`): האותיות בלבן על לוח מעוגל בצבע המותג, עם אותו אור עליון עדין של לוחות Office, באותו גודל ומשקל של שאר הסמלים. הצבעים מהאתרים שלהם: Priority `#3B37E6` (היה `#13241C` - נעלם על הלילה), מורנינג `#0DAC81`, iCount `#7133D9`. monday.com עם הסמל הרשמי.
- **רצועת "עובדת עם", המחירון (על הנייר) ו-`/pricing`:** הסמלים בלי שבב, בגודל הקודם. ריחוף / טולטיפ פתוח - שטיפה עדינה מתחת לסמל (`chips.tsx`, לפי המשטח). הניגודיות נבדקה בצילומים: גם Slides הצהוב ו-Word הכחול הכהה קריאים על הנייר ועל הלילה.
- **"מתחברת לכלים שכבר יש לכם." מחדש** (`components/brand/landing/connectors.tsx`): קבוצה לכל חשבון עם ספירה ליד הכותרת ("8 חיבורים", "4 בקרוב"), ובה רשת כרטיסים - משטח בהיר במדרגה מהלילה (`bg-cream/[0.045]`) עם קו שערה, פינה 1.25rem; בכל כרטיס הסמל במרכז (48px), השם ושורת התועלת הקטנה מתחת (נשארה גלויה ולא בטולטיפ - קריאה גם בטלפון ובלי מקלדת), ו"בקרוב" בפינה. "ועוד בהמשך" הוא כרטיס מקווקו שפותח את "בקשת מערכת". עמודות: 2 בטלפון, 3 מ-544px, 4 מ-768px (שתי שורות מלאות לכל חשבון), **8 מ-1280px** - שורה אחת לכל חשבון. נוסו 6 עמודות כפי שביקשת: 8 המוצרים של כל חשבון נשברו ל-6+2 עם חור גדול; 8 נראה מסודר יותר (צילומים בסשן). קל להחזיר: `GRID` בקובץ.
- **אזור אישי → חיבורים** (`components/brand/service-row.tsx`): `SERVICE_ICON_STYLE = "marks"` (חדש ב-`lib/connections/service-tiles.ts`; `"tiles"` / `"glyphs"` נשארו), `SERVICE_MARK` - שירות → סמל בקטלוג (יומן Outlook ← Outlook, קבצי Office ← Word). הסטטוס בלי שבב: מחובר - צבע מלא; צריך אישור - שקוף למחצה ונקודת דבש; במסלול פרו - שקוף בתוך טבעת דבש דקה; לא זמין - אפור דהוי בתוך קו מקווקו; תצוגה (לא מחובר) - דהוי ופחות רווי.
- **בדיקות:** `tiles.test.ts` (המתגים על `marks`, כל שירות ← מערכת בקטלוג, האריחים עדיין בדיסק), `integrations.test.tsx` (מצב `marks`: SVG בלי תמונה ובלי רקע, מונוגרמות בצבע המותג, ריבוע "עוד" מקווקו; `tiles` ו-`svg` עם `mark=` מפורש; מזהי gradient ייחודיים גם במצב החדש), `landing.test.tsx` (ספירות, סמל בכל כרטיס, בלי תמונות ושבבים, הרשת), `app/pricing/page.test.tsx`, `service-row.test.tsx`.
- **נגישות:** האותיות של המונוגרמה מצוירות ב-pseudo-element (`data-letters`) ולא כטקסט בדף - "iC" גלוי בתוך כפתור בשם "iCount" נכשל ב-axe (`label-content-name-mismatch`, נתפס ב-`e2e/pricing.spec.ts` ב-`/pricing`).
- **צילומים (DATA_MODE=memory, 1440 / 390):** הרצועה, רשת החיבורים, המחירון ב-1440×900, `/pricing`, האזור האישי - בלי גלילה אופקית ב-390. `pnpm e2e` 32/32 (שתי בדיקות `/pricing` הורצו שוב אחרי תיקון המונוגרמה). `supabase/tests/run-local.sh` לא רץ בסשן - אין Postgres מקומי (אין שינוי SQL).
- **פתוח:** יומן Outlook ו-Outlook מופיעים בשורת Microsoft באזור האישי עם אותו סמל (Microsoft לא מפרסמת סמל נפרד ליומן; השם והטולטיפ מבדילים). הסמלים הרשמיים על רקע כהה - לכלול בבדיקת הנחיות המותג של Google ו-Microsoft לפני ייצור (שורה 12 ב"דרוש מדניאל"; Google מבקשת את ה-G על לבן - לכן בכותרות הקבוצות אין לוגו חשבון).
### 2026-10-23 — סרט תדמית 20 שניות (UI motion) ב-`media/brand-film/`
**מה נעשה**
- סרט של 10 תיבות ב-120 BPM (40 פעמות, 20.0 שניות) לפי הבריף והסטוריבורד של דניאל: צורה אחת שלא נחתכת — התראת מייל במסך נעילה ("3 מיילים חדשים" → 12 → 27), "תזכיר לי אחר כך", הודעת וואטסאפ "תביאי לי מה חשוב" + 👀 + מקלידה, כרטיס סיכום, טיוטה עם שלח / ערוך / בטל (גרירה על "שלישי" → "רביעי"), טעינה ← ✓, אירוע יומן עם Meet, מתג "סיכום בוקר" שהידית שלו הופכת למחוון הטאבים, כרטיס פרו בדבש, "עלזה על זה." — וחזרה להתראה. הפריים האחרון הוא הראשון (לולאה).
- `index.html` אחד עם `seek(t)` טהור (בלי transitions, בלי טיימרים, בלי מצב בין פריימים); קפיצים בצורה סגורה, ערך שמשנה יעד = סכום קפיץ לכל שינוי (כולל המחזור הקודם, כך ש-`seek(0)` ו-`seek(20)` זהים בפיקסלים). פורמט רחב `?format=wide` (1920×1080) עם אותו טיימליין ומצלמה משלו. קומפוזיציה של HyperFrames (`hyperframes lint` נקי מלבד אזהרת אורך הקובץ; `snapshot` עובד דרך `hf-seek`).
- מוזיקה: "Ramp It Up" (Mixkit, רישיון Mixkit Stock Music Free) — נמדד ב-numpy: 120.00 BPM, מתחילים בפעמה חזקה ב-63.868 שניות. צלילי ממשק סינתטיים מרעש (בלי סמפלים), כל צליל ממוקם לפי השיא הנמדד שלו, פריים אחד אחרי התמונה. ‎-14 LUFS.
- רינדור: Playwright (מ-`/opt/node-tools`), 4 תת-פריימים לפריים (240fps) ממוזגים ב-ffmpeg `tmix` לטשטוש תנועה, 60fps, H.264 yuv420p faststart עם אודיו.
- `media/**` הוחרג מ-eslint, tsc, vitest ו-prettier של האתר. הרינדורים, `node_modules`, `.venv` והמוזיקה לא נכנסים ל-git.
**איך בודקים**
```bash
cd media/brand-film   # README.md: כל הפקודות
node render.mjs --beats && node render.mjs --loopcheck
node render.mjs --full && node render.mjs --full --format wide   # out/*.mp4
```
**פתוח**
- 4 תת-פריימים בתנועות מהירות מאוד (הידית שהופכת למחוון) נראים כ-4 עותקים ולא כמריחה רציפה — אם יפריע, להעלות ל-8.
- "תזכיר לי אחר כך" ו"שלח / ערוך / בטל" בלשון ציווי כמו בסטוריבורד ובכפתורי המוצר; אם צריך ניטרלי — "להזכיר אחר כך".

### 2026-10-24 — סרט תדמית v2: "לילה ירוק" (16 שניות, `media/brand-film/`)

**מה נעשה** (בקשת דניאל אחרי v1: בשפה החזותית שלנו, התוכן על המוצר)
- שפת "יום עבודה אחד" מדף הנחיתה: במה כהה (night), טקסט קרם, שעה גדולה בדבש שמתגלגלת כמו מונה (07:58 → 08:02 → 08:03 → 18:20 → 07:30), קו ההתקדמות הדק בצד, טלפון כמו PhoneMockup עם שיחת וואטסאפ (בועות, מקלידה…, טיוטה, שלח / ערוך / בטל), והדוכיפת ליד הטלפון בתנוחה של כל סצנה (מתחלפת על הפעמה, קפיץ בלי קפיצה).
- התסריט נכתב מחדש מתוך מה שהמוצר עושה (lib/billing/plans.ts, דף הנחיתה, /pricing): מיילים / פגישות / הבטחות ← הודעה קולית ← סיכום וטיוטה, "שום דבר לא יוצא בלי אישור" ← "מה יש לי מחר?" עם Meet ו-Teams ← סיכום בוקר במסך הנעילה ← פרו (Google ו-Microsoft יחד, סיכומי פגישות, התראות יזומות, שלושת הסוכנים, 299 ₪) ← "מה שהבטחת לעשות. עלזה על זה." · "10 הודעות ראשונות בחינם." ← לולאה. 8 תיבות (משפט מוזיקלי אחד של אותו שיר, 120 BPM).
- סימני המוצרים בצבעים המקוריים (מ-icons.tsx ו-provider-logo.tsx): Gmail ו-Outlook בהתראות, Google Calendar ו-Outlook עם Meet ו-Teams ביומן, סימן וואטסאפ במעבר לשיחה, Google + Microsoft + WhatsApp בפרו.
- תיקונים מ-v1: 8 תת-פריימים לפריים, בלי מעבר אפור בשינויי צבע, כרטיס הפרו מלא מהפריים הראשון שלו, טיפוגרפיה גדולה יותר בגרסת 1920×1080 (פריסה משלה), הפריים האחרון זהה לראשון (961 פריימים).
- `assets/mascot` הוא קישור ל-`public/brand/mascot` (אותם קבצים כמו באתר).

**איך בודקים**
```bash
cd media/brand-film   # README.md: כל הפקודות
node render.mjs --beats && node render.mjs --loopcheck
node render.mjs --full && node render.mjs --full --format wide   # out/*.mp4
```

**פתוח**
- הסימנים של Google, Microsoft ו-WhatsApp בסרט — אותה בדיקה משפטית מול הנחיות המותגים כמו באתר, לפני פרסום.
- כל סצנה שתי שניות: הכותרות קריאות, תוכן הטלפון עובר מהר (הוא תמונה, לא טקסט לקריאה).

## סבב 4 על ה-Preview: כרטיס פרו בדבש, סמלים בכל שורה במחירון (24.10)
> משימות (דניאל): (1) כרטיס הפרו בדבש כמו בסרט התדמית, הבסיסי נשאר נייר קרם, ובשני הכרטיסים כל שורה נפתחת בסמל. (2) הסרט רץ מהר מדי - כל סצנה כפליים זמן; ולשים אותו בדף הנחיתה במקום הסצנה הנעוצה של "יום עבודה אחד, בוואטסאפ." (ניסיון).

**מחירון (דף הנחיתה + `/pricing`)**
- `PlanSheet` (`components/brand/landing/pricing.tsx`): במקום גיליון נייר אחד בשתי עמודות - שני כרטיסים זה לצד זה (אחד מתחת לשני בטלפון). בסיסי על נייר הקרם (`alze-paper-grain`), פרו על דבש (`bg-honey`) עם טקסט דיו, קווי שערה `border-ink/20` ו"כל מה שבבסיסי, ובנוסף:" - כמו כרטיס הפרו בסרט. המבנה, הגדלים והמרווחים נשארו, כך ששני המסלולים עדיין נכנסים במסך אחד ב-1440×900 (התחתית ב-873px).
- `PlanFeatureList` (`components/brand/plan-features.tsx`) קיבל `lead`: כל שורה נפתחת בתמונה דקורטיבית (`aria-hidden`, המילים אומרות הכול). שורה שעוסקת במוצר - הסמלים הרשמיים בצבע (`FEATURE_MARKS` לפי מזהה השורה ב-`planFeatures`): חשבונות ← G של Google + ארבעת הריבועים של Microsoft; מייל ← Gmail + Outlook; יומן ← Google Calendar + Outlook; קבצים ← Drive + OneDrive; משימות ← Tasks + To Do; כל ה-Drive ← Drive; שמירת מסמכים ← Docs; SharePoint; פגישות ← Teams + Meet; תזכורות והודעות קוליות ← וואטסאפ; מערכות העסק ← monday.com. שאר השורות (הסוכנים, ההתראות היזומות) - ✓ בעיגול קטן: דיו עם ✓ בדבש על הפרו, ירוק-אזוב עם ✓ בדיו על הנייר. "בקרוב" נשאר. בלי `lead` הרשימה כמו קודם (דף התשלום, הצעת השדרוג, האזור האישי - לא שונו).
- `WhatsAppIcon` חדש ב-`icons.tsx`: הבועה הלבנה על הירוק של וואטסאפ (אותו ציור כמו `WhatsappGlyph` וכמו בסרט).
- ניגודיות (`lib/design/tokens.ts`): נוספו ✓ דבש בעיגול דיו, עיגול דיו על דבש, ✓ דיו בעיגול אזוב ועל הנייר; דיו ודיו-מעומעם על דבש כבר נבדקו (כרטיס הפרו בדף התשלום).
- הכרטיסים עלו ל-Preview לפני הסרט (דניאל: "בוא נראה איך זה יראה"); הסרט מגיע בנפרד.
- דניאל: הסמלים לפני המשפט לא יפים - כל שורה נפתחת עכשיו ב-✓ בלבד (`FEATURE_LEAD_STYLE = "check"` ב-`plan-features.tsx`; "marks" מחזיר את הסמלים). הסמלים נשארים בשורה בתחתית כל כרטיס, הדבש נשאר.

**הסרט: כל סצנה כפליים זמן (v2.1, `media/brand-film/`)**
- 16 תיבות במקום 8 (32 שניות, אותו שיר ואותו 120 BPM): שתי תיבות לכל סצנה, ושלוש לבוקר העמוס (ההתראות מגיעות אחת לשתי פעמות) ולמייל (רשימה, טיוטה, שלח / ערוך / בטל, "נשלח."). התזמון כתוב מחדש פעמה אחר פעמה (ולא מתיחה אחידה): התוכן נכנס בקצב טבעי ואז נשאר על המסך לקריאה - בערך 3 שניות ליומן, לסיכום הבוקר ולכרטיס הפרו.
- המוזיקה: נמדד מחדש ב-`tools/beatgrid.py --bars 16` - אותה פעמה חזקה ב-63.868 שניות, והחלון של 16 תיבות (תיבות 31-46) הוא הקטע הרם והיציב של השיר, בין השבירה של תיבה 30 לאקורד הסיום של תיבה 47. 120.00 BPM, סטייה חציונית 2.3ms. הלולאה חוזרת מתיבה 46 ל-31, ותיבה 39, הרמה ביותר בקטע, נופלת בדיוק על הזריחה (07:30). המיקס נבנה מחדש (‎-14.4 LUFS, שיא ‎-1.0 dBTP, 29 צלילי ממשק לפי האירועים החדשים).
- הטלפון קריא: סולם טיפוגרפי משלו בתוך המסך (`--z: 1.35`) - הצ'אט ב-24px ומעלה בגרסת 1920×1080. בועות ברוחב 90%; "משפחת לוי, במשרד" ביומן קוצר ל"משפחת לוי" כדי ש-Meet ו-Teams ייכנסו בתוך הבועה; התאריך והשעה במסך הנעילה לא נוגעים זה בזה.
- הלולאה: `seek(0)` ו-`seek(32)` זהים בפיקסלים (`--loopcheck`), 1,921 פריימים, הראשון והאחרון זהים; 8 תת-פריימים לפריים כמו קודם.
- הסרט הוא גרסת 1920×1080 בלבד (דניאל אישר אותה; הגרסה הריבועית ירדה). הרינדור: `out/alze-film-1920x1080.mp4` (60fps, H.264 עם אודיו AAC, 10MB) - לא ב-git.

**הסרט בדף הנחיתה (ניסיון)**
- "יום עבודה אחד, בוואטסאפ.": הכותרת ושורת הפתיחה נשארו; במקום הסצנה הנעוצה - הסרט 16:9 בכרטיס ממוסגר (`components/brand/landing/brand-film.tsx`: `rounded-card`, `shadow-stage`, קו שערה מעל התמונה, הפוסטר מתחת - בלי קפיצת תוכן). `<video>` עם autoplay muted loop playsInline ו-preload="metadata", נטען רק כשהכרטיס נכנס למסך, עוצר מחוץ למסך ובטאב מוסתר. כפתור צליל אחד בפינה ("הפעלת צליל" / "השתקה"). תחת prefers-reduced-motion או "עצירת אנימציות" (`data-a11y-motion` על `<html>`) - הפוסטר בלבד, בלי וידאו ובלי כפתור.
- **החזרה בשורה אחת:** `DAY_SECTION = "film"` ב-`components/brand/landing/day-scenes.tsx` - לשנות ל-`"scenes"` והסצנות (כולל הנעוצה, `DaySwitch`) חוזרות כמו שהיו; הקוד שלהן לא נגע.
- קבצי הרשת ב-`public/brand/video/` (נוצרים ב-`media/brand-film/tools/encode-web.sh` מהרינדור הרחב): `brand-film.mp4` (H.264 CRF 23, 1920×1080, 30fps, AAC 128k, faststart - 3.5MB), `brand-film.webm` (VP9 בשני מעברים + Opus - 2.3MB), `brand-film-poster.webp` (הפריים של 15.5 שניות, "מה יש לי מחר?" - 43KB). סך הכול 5.8MB.
- בדיקות: `brand-film.test.tsx` (המתג, המסגרת, הטעינה בכניסה למסך, השתקה והפעלה, עצירה מחוץ למסך ובטאב מוסתר, הפוסטר בלבד תחת הפחתת תנועה ו"עצירת אנימציות", קבצי הרשת: גודל, מסלול אודיו ב-mp4, faststart, VP9, WebP), `e2e/landing-film.spec.ts` (מתנגן מושתק ב-1440, כפתור הצליל, עוצר כשיוצאים מהמסך, פוסטר בלבד ובלי גלילה אופקית ב-390 עם הפחתת תנועה). בדיקות הסצנות ב-`landing.test.tsx` רצות עכשיו על `variant="scenes"`.

**פתוח**
- זה ניסיון: אם הסרט לא עובד בדף - שורה אחת חוזרת לסצנות.
- סימני Google, Microsoft ו-WhatsApp בסרט - אותה בדיקה משפטית כמו באתר. רישיון המוזיקה של Mixkit מתיר שימוש באתר ובפרסום ברשת (`CREDITS.md`).

## פאנל ניהול לבעלים: `/admin` (24.10)
> התוכנית: "פאנל ניהול לבעלים" (מאושרת). רק דניאל נכנס. תוכן ההודעות של הלקוחות מוצג תמיד (החלטה של דניאל).

**הכניסה (`lib/admin/auth.ts`, `lib/admin/tokens.ts`)**
- שלושה תנאים בכל דף ובכל פעולה: session תקף, מייל ברשימת `ADMIN_EMAILS` (`lib/env.ts`, ברירת מחדל danielnotexist@gmail.com), ועוגיית הפאנל `wb_admin` (HMAC במפתח `derivedKey("admin")`, 12 שעות, `path=/admin`, httpOnly, SameSite=Strict).
- העוגייה ניתנת רק אחרי קוד חד-פעמי אמיתי שנשלח במייל לבעלים: 6 ספרות, 10 דקות, 5 ניסיונות, דקה בין שליחות, 5 בשעה, הגבלת קצב לפי משתמש ו-IP. הקוד אף פעם לא 123456, וגם אם יוקלד - נדחה. הקוד נשמר כ-hash ב-`auth_otps` (מפתח `admin:<email>`) ובעוגיית אתגר קצרה (`wb_admin_code`) שקושרת אותו לדפדפן שביקש.
- המייל: בהדגמה רק עם `LIVE_SUPPORT_MAIL=1` (אותו מתג של מייל הפניות, Resend); מחוץ להדגמה - ה-mailer הרגיל; ב-memory בפיתוח - ה-outbox (`/api/dev/outbox`). אחרת: הודעה בעברית שאומרת מה חסר, והפאנל סגור.
- מי שאינו בעלים מקבל 404 אמיתי: "ניהול" באזור האישי מוביל ל-`GET /admin/enter`, שבודק את המייל ומציב עוגיית שער (`wb_admin_gate`); בלעדיה `proxy.ts` מחזיר 404 לכל `/admin*` לפני שהדף נטען. הדף וכל פעולה בודקים שוב (`requireOwner`). כל צפייה במשתמש נרשמת ב-`audit_log` (`admin.view_user`), וגם שליחת קוד, כניסה ושינוי סטטוס פנייה.

**נתונים חדשים (`0015_admin.sql`, `supabase/tests/admin.test.sql`)**
- `users.signup_source` (utm, דומיין מפנה, דף נחיתה, זמן - מהעוגייה `alze_src` ש-`proxy.ts` שם בביקור הראשון; `signIn` מעתיק למשתמש חדש בלבד) ו-`users.last_seen_at` (כניסה, הודעה נכנסת, טעינת `/account`; פעם בשעה לכל היותר).
- `support_chats` + `support_chat_append()`: הצ'אט באתר שומר כל שאלה ותשובה תחת מזהה שיחה מהדפדפן, מקושר לחשבון כשמחוברים; שיחה של משתמש אחד לא מקבלת תורות מאחר. בווידג'ט נוספה השורה "השיחה נשמרת כדי שנוכל לעזור.", ובמדיניות הפרטיות שורה ותקופת שמירה (180 יום).
- `app_errors` + `reportError()` (`lib/errors/report.ts`): מוחק טוקנים, מפתחות, קודים בכתובות ומחרוזות ארוכות, מקצר ל-500 תווים. נקרא מ-`onRequestError` ב-`instrumentation.ts` ומנקודות ה-catch: הבוט, `jobs/run`, החזרה מ-OAuth, החיוב, ה-worker, החזרה מהתשלום, הצ'אט באתר.
- `messages.tools`: הכלים שהמודל הפעיל בכל תשובה (`toolsUsed`). נשלח רק כשהופעל כלי.
- `support_tickets.admin_note` / `status_changed_at`. `admin_user_overview()` ו-`admin_daily_stats()` (שעון ישראל) - service_role בלבד.
- **תיקון:** `audit_log.user_id` יכול להיות null — עד עכשיו מחיקת חשבון נכשלה ב-Supabase על רשומת `account.delete`.

**המסכים (`app/admin`)** — לילה ירוק, דבש רק למה שחשוב, מספרים טבלאיים, CSS לוגי (הבדיקה ב-`app/account/account.test.tsx` סורקת גם את `app/admin`).
- סקירה: משתמשים, פעילים היום / בשבוע, הכנסה חודשית קבועה, עלות AI היום והחודש מול התקרה, פניות פתוחות, תקלות ב-24 שעות; שלושה גרפים של 30 יום (הרשמות, הודעות, עלות) ב-SVG בלי ספריות, עם tooltip בריחוף ובמקלדת וטבלה מתחת; משפך, תוכניות ומקורות.
- משתמשים: חיפוש (מייל, טלפון גם בצורה 05…, שם עסק), סינון לפי תוכנית, סטטוס ו"צריך עזרה", מיון, 50 בדף; הטבלה נגללת בתוך עצמה בטלפון.
- משתמש (`/admin/users/<id>`): פרופיל, מקור, שלב ההרשמה, וואטסאפ, מערכות ושירותים, מנוי ותשלומים ובקשות אישור, שימוש, סוכנים, תזכורות ועבודות שנכשלו, התראות וסיכומי פגישות, השיחה המלאה בוואטסאפ (תמלול, כלים, מודל, עלות, עם דפדוף אחורה), ציר הפעולות, תקלות, פניות ושיחות באתר; כפתורי מייל, וואטסאפ (wa.me) והעתקת פרטים.
- צריך עזרה, פניות (סטטוס + הערה), צ'אט באתר, תקלות (סינון לפי מקור ומשתמש). "ניהול" באזור האישי מופיע לבעלים בלבד.
- נתוני דמו לצילומים: `POST /api/dev/admin-seed` (DATA_MODE=memory בפיתוח בלבד, 404 בכל מקום אחר; אנשים בדויים בדומיין example).

**בדיקות**
- יחידה: `lib/admin/auth.test.ts` (404 למי שאינו בעלים ולבעלים בלי העוגייה, עוגייה פגה חוזרת לקוד, בהדגמה בלי מייל אמיתי אין קוד, 123456 נדחה, 5 ניסיונות), `lib/admin/source.test.ts` (העוגייה, ה-proxy, מקור ההרשמה במשתמש חדש בלבד, 404 ב-proxy), `lib/admin/view.test.ts`, `lib/db/memory-admin.test.ts`, `lib/db/supabase-admin.test.ts`, `lib/errors/report.test.ts`, `app/api/support/chat/support-chat-store.test.ts`.
- SQL: `supabase/tests/admin.test.sql` (העמודות, `support_chat_append`, הסקירה, הספירות היומיות, הניקוי, מחיקת משתמש, RLS ו-grants, `audit_log` עם null).
- e2e: `e2e/admin.spec.ts` — משתמש מגיע עם `utm_source=test`, פותח פנייה ומדבר עם הבוט; הבעלים נכנס, קוד שגוי נדחה, הקוד מה-outbox פותח; המשתמש עם המקור, הפנייה והשיחה; שינוי סטטוס; משתמש רגיל מקבל 404 ב-`/admin` וב-`/admin/enter`.

**פתוח**
- 0015 מוסיפה בלבד; מריצים אותה ב-Supabase לפני הפריסה, ואת בלוק ה-pg_cron בקידום לייצור.
- בהדגמה בלי `LIVE_SUPPORT_MAIL=1` הפאנל לא נפתח (בכוונה: בלי מייל אמיתי כל אחד היה נכנס עם 123456).
- `adminListUsers` מסנן בשרת האפליקציה מעל `admin_user_overview()` (עד 5000 משתמשים); מעבר לזה - להעביר את הסינון ל-SQL.

## פאנל ניהול: השיחה וציר הפעולות בחלונות משלהם (24.10)
> הבקשה של דניאל: כפתור שפותח את כל השיחה בוואטסאפ בחלון חדש, ואת ציר הפעולות מסודר, בלי לגלול בלי סוף.

- **כרטיס המשתמש** (`/admin/users/<id>`): שני האזורים הארוכים ("השיחה בוואטסאפ", "ציר הפעולות") הוחלפו בכרטיס אחד, "פעילות" (`app/admin/_components/activity-card.tsx`): ארבע ההודעות האחרונות בשורה אחת כל אחת, הודעות נכנסות ועלות AI ב-30 יום, ההודעה האחרונה; חמש הפעולות האחרונות במילים, ומונים לפי סוג. "פתיחת השיחה המלאה" ו"ציר הפעולות המלא" נפתחים בלשונית חדשה (`target=_blank`, `rel=noopener`).
- **תיקון:** קישור ארוך בבועה (למשל קישור החיבור ל-Google) גלש מהעמודה וכיסה את ציר הפעולות. עכשיו `min-w-0` על ילדי ה-grid/flex, `[overflow-wrap:anywhere]` על טקסט הבועה ו-`max-w` לבועה.
- **`/admin/users/<id>/conversation`**: קורא בסגנון וואטסאפ כהה (`conversation-reader.tsx`, קומפוננטת לקוח קטנה): חלונית בגובה קבוע שנגללת בתוך עצמה ונפתחת בהודעה האחרונה, תגיות יום (היום / אתמול / תאריך, שעון ישראל), תמלול להודעות קוליות, מתחת לכל תשובה הכלים במילים, המודל והעלות, "כפתורים" כגלולה, "מחוץ לזיכרון" במסגרת מקווקוות. חיפוש שמסמן ומסנן, סינון (הכול / רק הלקוח / רק עלזה / עם כלים / קוליות), "טעינת הודעות קודמות" דרך `olderMessagesAction` (בעלים בלבד, `adminMessages`). בצד: נתוני השיחה (סך הכול, ראשונה ואחרונה, עלות, הכלים הנפוצים); בטלפון הם מתקפלים מעל השיחה.
- **`/admin/users/<id>/activity`**: ציר אחד לחשבון - `audit_log` במילים בעברית, יחד עם התקלות של המשתמש, העבודות שנכשלו ובקשות האישור לתשלום. לפי ימים בשעון ישראל (כותרות דביקות), אייקון וצבע לכל סוג (כניסה, וואטסאפ, חיבורים, תשלומים ומנוי, תזכורות, סוכנים, פעולות בשם המשתמש, ניהול, תקלות), תוצאה כגלולה (הצליח / בוטל / נכשל / לבדיקה / ממתין) עם הסיבה הגולמית מתחת, סינון לפי סוג וטווח (7 / 30 / הכול) בכתובת, ודפדוף.
- **המילים** (`lib/admin/audit-labels.ts`): כל שם פעולה שהקוד כותב ל-`audit_log`, כולל המשפחות הדינמיות (`<kind>.execute`, `billing.approve.<kind>` …). שם לא מוכר מוצג כמו שהוא. הבדיקה סורקת את הקוד ונכשלת על פעולה חדשה בלי תווית.
- **השער**: `lib/admin/user-view.ts` (`openUserView`) - אותו שער לכרטיס ולשני הדפים החדשים: בעלים עם פאנל פתוח, מזהה תקין של משתמש קיים, אחרת 404; כל צפייה נרשמת (`admin.view_user` / `admin.view_conversation` / `admin.view_activity`).
- נתוני הדמו (`lib/admin/demo-seed.ts`): לדנה לוי חודש מלא - כ-200 הודעות, קישור ארוך, הודעות קוליות, כפתורים, ניהול סוכנים, וציר בכל הסוגים עם תקלות, עבודה שנכשלה ובקשות אישור. שמות הכלים בדמו הם עכשיו השמות האמיתיים.
- בדיקות: `lib/admin/audit-labels.test.ts` (כיסוי התוויות מול הקוד, התוצאות, המיזוג, הסינון), `lib/admin/conversation.test.ts` (הסינונים, החיפוש, הסימון, הנתונים), `lib/admin/days.test.ts` (ימים בשעון ישראל, כולל המעבר לשעון חורף), `app/admin/users/[id]/views.test.ts` (404 למי שאינו בעלים, מזהה שגוי, ורישום הצפייה), ו-`e2e/admin.spec.ts` (הכפתורים עם `target=_blank`, הקישור הארוך נשאר בתוך החלונית, סינון, חיפוש, טעינת קודמות, ציר לפי סוג, 404 למשתמש רגיל).

## התראות לבעלים (24.10, סבב 1 בתוכנית "התראות, אנליטיקה, שנתי")
> הבקשה של דניאל: לדעת מה קורה במערכת בלי לפתוח את הפאנל. מייל בלבד בינתיים; וואטסאפ אחרי אישור תבנית ב-Meta.

**מה נעשה**
- **`lib/admin/alerts.ts`** — פונקציה אחת, `notifyOwner(event)`: מייל אל `ADMIN_EMAILS` דרך `adminMailer` (Resend; בפיתוח ב-memory ה-outbox). ה-hooks קוראים ל-`ownerAlert(event)` בשורה אחת: רץ אחרי התשובה (`after()` של Next), ומחוץ לבקשה כ-promise שאף אחד לא מחכה לו. לא חוסם את המשתמש ולא את מסלול הוואטסאפ, ואף פעם לא זורק: כשל נרשם בשורה וב-`reportError` (מקור `owner_alerts`, שלא נספר בקפיצת תקלות).
- **הסוגים והמקומות:** נרשם חדש (`signIn` ב-`lib/auth/otp.ts`, עם מקור ההרשמה); פנייה ובקשת מערכת (בתוך `notifySupport`, מיזוג: אם `SUPPORT_EMAIL` היא גם כתובת בעלים, הכתובת הזו לא מקבלת מייל שני); תשלום שנכשל וחיוב בבדיקה (החיוב החודשי ב-`lib/billing/subscription.ts`, החיוב בלחיצה בוואטסאפ ובדף התשלום ב-`one-tap.ts`, תשלום ראשון שנדחה ב-`service.ts`); קפיצה בתקלות (מעל סף בשעה, מ-`app_errors`); תקציב AI ב-80% וב-100% (`SpendGuard`, `onSpend`, בלי await ובלי גישה ל-DB מתחת לסף); חיבור Google / Microsoft שפג אצל לקוח משלם (`token-store` של שניהם, הבדיקה אם משלם ברקע).
- **הגנות:** כל אירוע פעם אחת (`owner_alerts.dedupe_key`), מגבלת קצב לכל סוג (קפיצת תקלות: אחת בשעה; תקציב: פעם ביום לכל סף; נרשם חדש: בלי מגבלה; השאר 20–30 בשעה), שורה `limited` כשנחסם.
- **שעות שקט:** ברירת מחדל 22:00–07:00 שעון ישראל, ושבת וחג (משישי בצהריים, `lib/time/rest-days.ts`). התראה שאינה דחופה נשמרת `queued`, ובסוף שעות השקט יוצא מייל מרוכז אחד ("סיכום שעות השקט"). דחופים יוצאים מיד: תשלום שנכשל, חיוב בבדיקה, קפיצה בתקלות, תקציב ב-100%.
- **המשימה:** `owner_alerts` (job חדש, משימת מערכת כל רבע שעה): בדיקת קפיצה בתקלות + המייל המרוכז. `/api/jobs/tick` יוצר אותה (אידמפוטנטי לפי המפתח), וב-0016 גם `schedule_owner_alerts()` ל-pg_cron עם אותו מפתח בדיוק.
- **הטאב "התראות" ב-`/admin`** (`app/admin/_components/alerts-tab.tsx`): מתג לכל סוג עם הסבר, סף התקלות, שעות שקט (מ/עד) ושבת וחג, "שליחת מייל בדיקה", ו-20 ההתראות האחרונות (זמן, סוג, נושא, ערוץ, סטטוס). הפעולות (`app/admin/alerts-actions.ts`) בודקות את הבעלים שוב (404 לכל אחד אחר) ונרשמות ב-audit (`admin.alerts_update`, `admin.alerts_test`). ההגדרות ב-`ops_flags`, במפתח `owner_alerts:settings`.
- **המייל:** הנוסחים ב-`lib/copy/owner-alerts.ts` — נושא בעברית, שורות, קישור ישיר לדף המתאים בפאנל לפי `APP_URL`, וגרסת HTML מימין לשמאל בלילה ירוק עם כפתור דבש.
- **וואטסאפ:** תבנית `owner_alert` ב-`lib/wa/templates.ts` וב-`docs/copy/wa-templates.md` §13. **כבויה.** נשלחת רק עם `OWNER_ALERT_WA=1` + `ADMIN_PHONE`, אחרי שהתבנית אושרה ב-Meta.
- **מיגרציה `0016_owner_alerts.sql`** (מוסיפה בלבד): הטבלה `owner_alerts` (יומן + תור הלילה, נמחקת אחרי 90 יום), `owner_alert_claim()`, `owner_alerts_take_queued()`, `schedule_owner_alerts()`, `purge_owner_alerts()`, `job_kind 'owner_alerts'`. בלוק pg_cron נפרד בסוף.
- `/api/dev/outbox` מחזיר גם `ownerAlerts` ו-`tickets` (פיתוח בלבד).

**בדיקות**
- יחידה: `lib/admin/alerts.test.ts` (המייל והקישור, פעם אחת, מגבלות הקצב, המתגים, שעות שקט ושבת, המייל המרוכז וכשל שלו, הדחופים, כשל שליחה בלי זריקה, מיזוג `SUPPORT_EMAIL`, וואטסאפ כבוי / דלוק / בלי `ADMIN_PHONE`, המשימה, ה-hooks), `lib/copy/owner-alerts.test.ts` (כל סוג: נושא, שורות, קישור, HTML, escape), `app/admin/alerts-actions.test.ts` (404 למי שאינו בעלים, שמירה, ערך שגוי, מייל בדיקה), `lib/db/supabase-owner-alerts.test.ts`, וה-hooks בבדיקות של otp, הפניות, החיוב החודשי, החיוב בלחיצה, התקציב, טוקן Google, התבניות, env וה-tick/run.
- SQL: `supabase/tests/owner_alerts.test.sql`.
- e2e: `e2e/owner-alerts.spec.ts` — הרשמה ← מייל התראה אחד לבעלים ב-outbox; פנייה ← מייל אחד; כיבוי המתג "נרשם חדש" בפאנל ← ההרשמה הבאה בלי מייל.

**לפני הפריסה**
- להריץ את `0016_owner_alerts.sql` ב-Supabase **לפני** פריסת הקוד, בלי בלוק ה-pg_cron שבסוף. את הבלוק (`wabot_schedule_owner_alerts` כל רבע שעה, `wabot_purge_owner_alerts`) מריצים בקידום לייצור, כמו ב-0013 עד 0015. בלי המיגרציה ההתראות נכשלות בשקט (נרשם ב"תקלות"), ושום פעולה של משתמש לא נפגעת.
- משתני סביבה: אין חדש חובה. המייל יוצא אל `ADMIN_EMAILS` (ריק = danielnotexist@gmail.com) דרך `RESEND_API_KEY` + `MAIL_FROM`; בהדגמה צריך `LIVE_SUPPORT_MAIL=1`. וואטסאפ בהמשך: `OWNER_ALERT_WA=1` + `ADMIN_PHONE` (למשל 972501234567), רק אחרי אישור `owner_alert` ב-Meta.


## אנליטיקה ו-SEO (25.10, סבב 2 בתוכנית "התראות, אנליטיקה, שנתי")
> הבקשה של דניאל: לדעת מי מגיע, מאיפה ואיפה נוטשים בהרשמה, וש-Google ימצא את האתר. בלי חבילות חדשות ובלי עוגיות מעקב.

**אנליטיקה משלנו, בלי עוגיות (`lib/analytics`)**
- **הדפדפן:** `PageBeacon` (`components/analytics/page-beacon.tsx`, ב-root layout בתוך Suspense) שולח `navigator.sendBeacon('/api/a')` בכל מעבר דף: הנתיב בלבד (השאילתה נזרקת; utm_source / utm_medium / utm_campaign בשדות משלהם), הדומיין המפנה בדף הראשון של הביקור בלבד, טלפון או מחשב לפי רוחב החלון. בונה ה-payload טהור ונבדק (`lib/analytics/beacon.ts`). Do-Not-Track או Global Privacy Control - לא נשלח כלום. לא נשלח כלום מ-`/admin`, `/api`, `/dev`, `/pay`, `/invoice`, `/login/w` (טוקן בכתובת).
- **שלבי המשפך:** `signup_start` (כרטיס המייל על המסך), `code_sent`, `code_ok` - מהדפדפן (`email-step.tsx`, `code-step.tsx`, רק בהרשמה). `wa_linked` (`welcomeLinkedPhone`, גם בצ'אט ההדגמה), `mail_connected` (החזרה מ-Google ומ-Microsoft, וחיבור ההדגמה), `paid` (התשלום הראשון ב-`activateSubscription`, פעם אחת לעסקה) - נכתבים בשרת ישירות (`lib/analytics/track.ts`, אחרי התשובה, בלי לעכב ובלי לזרוק).
- **`POST /api/a`:** zod (שדות ידועים בלבד, נתיב בלי שאילתה, שלב שרת לא יכול להגיע מהדפדפן), מגבלת קצב 120 לדקה לכל IP (`lib/rate-limit`), רובוטים לפי User-Agent נזרקים (Googlebot, תצוגות קישור, HeadlessChrome, curl...), DNT/GPC גם ככותרת, 204 מיד והכתיבה ב-`after()`. **המזהה:** `visitor = sha256(מלח יומי + IP + User-Agent)`; המלח נגזר ב-HKDF מ-`TOKEN_ENC_KEY` ומהתאריך (`derivedKey("analytics")`), מתחלף כל יום ולא נשמר. ה-IP וה-User-Agent לא נשמרים - רק ה-hash וסוג המכשיר. מקושר למשתמש רק כשיש session תקף (משתמש שנמחק - בלי קישור).
- **מיגרציה `0017_analytics.sql`** (מוסיפה בלבד, **בלי `alter type ... add value`** - אפשר להריץ בטרנזקציה אחת): `page_events` (id, at, day בשעון ישראל, visitor, user_id עם on delete set null, path, referrer_host, utm_source/medium/campaign, device, event), אינדקסים על (day) ועל (event, day), RLS בלי policy ו-service_role בלבד כמו 0007-0016; `analytics_daily()`, `analytics_top_pages()`, `analytics_sources()`, `analytics_devices()`, `analytics_funnel()` (service_role בלבד); `purge_page_events()` אחרי 13 חודשים; בלוק pg_cron נפרד בסוף (`wabot_purge_page_events` פעם ביום). בדיקה: `supabase/tests/analytics.test.sql`.
- **Db:** `insertPageEvent` / `analyticsReport` ב-MemoryDb (אותן תשובות כמו ה-SQL, אותו יום לדוגמה בשתי הבדיקות) וב-SupabaseDb (חמש הפונקציות במקביל; הפרת FK של משתמש שנמחק - שוב בלי הקישור).

**הטאב "תנועה" ב-`/admin`** (`app/admin/_components/traffic-tab.tsx`, `?tab=traffic&range=7|30|90`, אותו שער ואותו עיצוב)
- מבקרים, צפיות, דפים לביקור, התחילו הרשמה, שילמו; שני גרפים יומיים (מבקרים ייחודיים, צפיות) כ-small multiples ב-SVG, עם tooltip וטבלה; המשפך ביקור ← התחלת הרשמה ← קוד נשלח ← קוד אומת ← וואטסאפ ← מייל ← תשלום עם המספר, האחוז מהשלב הקודם, והנפילה הגדולה ביותר **בתוך ההרשמה** במילים (ביקור ← התחלת הרשמה הוא ההמרה של האתר ומוצג לבד, אחרת הוא היה מנצח תמיד); הדפים המובילים עם שם בעברית; מקורות (utm או אתר מפנה, "ישיר (בלי מפנה)" ו"לא ידוע"); טלפון מול מחשב. גוון אחד (דבש) לפי ה-dataviz skill; עובד ב-390.
- "מבקרים" על פני טווח = מבקרים-ביום (המזהה מתחלף כל יום) - כתוב בטאב.
- דמו לצילומים: `POST /api/dev/admin-seed` מוסיף 90 יום של תנועה (`lib/admin/demo-seed.ts`, דטרמיניסטי, פעם אחת).

**SEO (`lib/seo`)**
- **metadata מלא** (`pageMetadata`): כותרת עם התבנית "· עלזה", תיאור, `alternates.canonical` לפי `APP_URL` (`metadataBase`), Open Graph ב-he_IL עם תמונת השיתוף של הדף (מפורשת: Next ממזג metadata שטוח, ו-openGraph של דף מחליף את של ה-layout), `twitter: summary_large_image`. לדפים: `/`, `/pricing`, `/start`, עמודי "לפי מקצוע", והמסמכים המשפטיים.
- **עמודי "לפי מקצוע" חדשים:** `/for/lawyers`, `/for/accountants`, `/for/consultants`, `/for/clinics` (`app/for/[profession]`, הטקסט ב-`components/brand/landing/profession-pages.ts`): כותרת למשרד, שלוש שאלות מהיום-יום עם התשובה (הראשונה מהסקציה בדף הבית), מה היא עושה במשרד, אמון, קריאה לפעולה. הסקציה בדף הבית מקשרת אליהם. slug לא מוכר - 404 אמיתי כבר ב-`proxy.ts` (`lib/seo/professions.ts`).
- **noindex:** `/admin`, `/account`, `/pay`, `/login` (כולל כרטיסי הקוד והמייל ו-`/login/w`), `/demo`, שלבי ההרשמה אחרי `/start`. בנוסף `X-Robots-Tag: noindex, nofollow` מ-`proxy.ts` לכל `/admin`, `/account`, `/api`, `/pay`, `/invoice`, `/login`, `/demo` (גם ל-route handlers כמו החשבונית).
- **המסמכים המשפטיים** עדיין noindex ומחוץ ל-sitemap (טיוטות לעו"ד); מתג אחד: `LEGAL_INDEXED` ב-`lib/seo/site.ts`.
- **תמונות שיתוף** 1200×630 (`app/opengraph-image.tsx`, `app/pricing/opengraph-image.tsx`, `app/for/[profession]/opengraph-image.tsx`, `lib/og/card.tsx`): לילה ירוק, קרם ודבש, הסמל והשם. הפונט Varela Round מקובץ TTF בריפו (`assets/fonts`, OFL) - next/og לא קורא woff2. satori בלי bidi, ולכן כל שורה עברית נבנית בסדר ויזואלי (`lib/og/rtl.ts`: מילה לפריט, row-reverse + wrap, לטינית ומספרים בסדר שלהם, סוגריים מתהפכים). נבדק בעין: העברית נקראת נכון מימין לשמאל.
- **`app/sitemap.ts`** (הדפים הציבוריים עם lastModified) ו-**`app/robots.ts`**: בייצור פתוח, הנתיבים הפרטיים חסומים, וכתובת ה-sitemap. **כש-`VERCEL_ENV !== "production"`** (Preview, הרצה מקומית) או ב-DEMO_MODE - `Disallow: /`, כדי שאתר הבדיקה לא ייכנס לחיפוש.
- **JSON-LD** בדף הבית: Organization (שם מ-BRAND, כתובת, לוגו `/icon.png`) ו-SoftwareApplication (BusinessApplication, he, הצעה לבסיסי 99 ולפרו 299 ₪ מ-`lib/billing/plans.ts`). המחירים כוללים מע"מ (`valueAddedTaxIncluded`), כמו במחירון וב-`lib/billing/money.ts`.

**פרטיות:** שורות חדשות ב-`docs/legal/privacy-policy-he.md` (גרסה 0.3) - בטבלה בסעיף 2, תקופת שמירה של 13 חודשים בסעיף 5, וסעיף 10 (עוגיות) - עם סימון לעו"ד, ופריט 9 ברשימת הפריטים לעו"ד. הדף `/privacy` מוצג מהקובץ, אז השינוי שם.

**בדיקות**
- יחידה: `lib/analytics/beacon.test.ts` (השאילתה נזרקת, utm, המפנה, נתיבים מוחרגים, DNT/GPC), `lib/analytics/send.test.ts` (jsdom: sendBeacon, DNT, GPC), `app/api/a/route.test.ts` (zod, מגבלת קצב, ה-hash ביום ובין ימים, אין IP ואין UA בשורה, רובוטים, 204, session, משתמש שנמחק), `lib/analytics/report.test.ts` (חשבון המשפך והנפילה הגדולה), `lib/analytics/track.test.ts` (השלבים בצד השרת, וואטסאפ ותשלום ראשון פעם אחת), `lib/db/memory-analytics.test.ts`, `lib/db/supabase-analytics.test.ts`, `app/admin/traffic-tab.test.tsx`, `lib/seo/seo.test.ts` (metadata של כל דף ציבורי, noindex בפרטיים, X-Robots-Tag, sitemap, robots כולל Preview, JSON-LD), `lib/og/rtl.test.ts`; וה-callbacks של Google ו-Microsoft (mail_connected).
- SQL: `supabase/tests/analytics.test.sql`.
- e2e: `e2e/analytics-seo.spec.ts` - ביקור עם `?utm_source=e2e` והרשמה דרך המסכים ← הבעלים רואה את המקור "e2e" ואת שלבי המשפך בטאב; `/robots.txt` ו-`/sitemap.xml` תקינים ו-`/admin` חסום; `/opengraph-image` הוא PNG ב-1200×630; עמוד מקצוע ב-1440 וב-390 בלי גלילה אופקית ו-axe נקי. `CAPTURE_TRAFFIC=<dir>` שומר צילומים.

**לפני הפריסה**
- להריץ את `0017_analytics.sql` ב-Supabase **לפני** פריסת הקוד, **בלי בלוק ה-pg_cron שבסוף** (`wabot_purge_page_events`); את הבלוק מריצים בקידום לייצור, כמו ב-0013 עד 0016. אין בה `alter type ... add value`. בלי המיגרציה הביקורים לא נשמרים (שורת אזהרה בלוג) ושום דבר באתר לא נשבר.
- משתני סביבה: אין חדש. `TOKEN_ENC_KEY` כבר קיים (ממנו נגזר המלח), `APP_URL` לכתובות ה-canonical וה-sitemap, ו-`VERCEL_ENV` ש-Vercel מגדיר לבד.

**פתוח**
- המלח נגזר מ-`TOKEN_ENC_KEY`: מי שמחזיק במפתח ובטבלה יכול בעיקרון לנסות לשחזר IP מתוך מזהה (מרחב IPv4 קטן). החלופה - מלח אקראי ב-`ops_flags` שנמחק כל יום - חזקה יותר לפרטיות; אפשר לעבור אליה אם עו"ד ידרוש.
- `/start` ועמודי המקצוע ב-sitemap; המסמכים המשפטיים ייכנסו כש-`LEGAL_INDEXED = true`.
- נתוני הדמו של הפאנל (תשלומים של 116.82 ₪) ותשובת הדוגמה בצ'אט הדמו ("לפני מע״מ") מניחים מחיר לפני מע"מ, בעוד שהמחירון והחיוב כוללים מע"מ - לא נגעתי, כדאי ליישר.
- תיקון (25.10): תמונות השיתוף הציגו את `BRAND.domain` (alze.ai) - דומיין תפוס שלא שייך לנו. הכתובת הוסרה מהתמונה עד שהדומיין יירכש.

## מסלול שנתי וחבר מביא חבר (25.10, סבב 3 בתוכנית "התראות, אנליטיקה, שנתי")
> הבקשה של דניאל: תשלום שנתי עם חודשיים מתנה, ו"חבר מביא חבר" שמזכה את שני הצדדים בחודש חינם. מצב mock בלבד - אף חיוב אמיתי.

**מסלול שנתי**
- **המחירים** (`lib/billing/plans.ts`, מקור אמת יחיד): בסיסי 990 ₪ לשנה, פרו 2,990 ₪ לשנה, כולל מע״מ (10 חודשים במחיר של 12; 82.50 / 249.17 ₪ לחודש). `priceOf(plan, cycle)`, `annualPerMonthIls`, `planNameHe(plan, cycle)` ("בסיסי שנתי"), `addOneYear` (29.2 → 28.2). מכסת ההודעות נשארת חודשית.
- **החיוב:** תשלום ראשון שנתי בדף HYP (`Order` = `<user>:<plan>:annual`, `Amount` = המחיר השנתי), `next_charge_at` + שנה; החידוש פעם בשנה באותו קוד (`chargeSubscription`), שורת המסמך "מנוי בסיסי שנתי — <תאריך>–<תאריך>", אותם ימי ניסיון (1/3/5/7), אותה השהיה ואותה התראה לבעלים ("חיוב שנתי: ..."). `Order` שנתי עם סכום נמוך מהשנתי מופעל חודשי ונרשם `payment.amount_mismatch`.
- **שינויים:** שדרוג לפרו באמצע השנה - ההפרש של המחירים השנתיים (2,000 ₪) × ימים שנותרו / ימי השנה, סוף השנה לא זז (בוואטסאפ, בדף התשלום ובאזור האישי). מחודשי לשנתי - מהאזור האישי (`lib/billing/annual-switch.ts`): השנה מתחילה היום, החלק שלא נוצל מהחודש מקוזז, טופס חתום (מטרה `ann`, 10 דקות, nonce חד-פעמי) ואישור `upgrade` עם `details.change = "annual"`. משנתי לחודשי (`scheduled_cycle`) ומפרו לבסיסי בשנתי - בחידוש, בלי החזר; ביטול שנתי - עד סוף השנה, בלי החזר (כתוב בעברית בכל מקום שמציע אותם).
- **האתר:** מתג "חודשי / שנתי · חודשיים מתנה" במחירון בדף הבית וב-`/pricing` (ברירת מחדל חודשי; `components/brand/landing/plan-cycle.tsx`, עוגיית `alze_cycle` כדי שדף התשלום ייפתח על אותו מחזור). שני הכרטיסים עדיין נכנסים ב-1440×900 (`e2e/pricing.spec.ts`), כרטיס פרו בדבש ושורות ✓ כמו קודם. דף התשלום: בחירת מחזור, "לתשלום שנתי, 990 ₪", ובשדרוג "2,990 ₪ לשנה". השוואה מלאה: שורת "מחיר לשנה, חודשיים מתנה".
- **האזור האישי (מנוי):** "מסלול בסיסי שנתי, 990 ₪ לשנה", החיוב הבא עם התאריך והסכום, הצעת "מעבר לחיוב שנתי" (עם הקיזוז והסכום לתשלום), שינויים מתוכננים ("בחידוש יעבור לחיוב חודשי" + ביטול השינוי), והערת הביטול השנתי.
- **וואטסאפ:** ההצעות והאישורים מציינים את המחזור ("לשנה"), הסטטוס "פרו שנתי", אישור ביטול שנתי עם "על החלק שנותר מהשנה אין החזר". 6 תבניות חדשות (ראו "דרוש מדניאל" 18) - לא שיניתי את נוסח התבניות המאושרות.
- **הידע של עלזה ושל צ'אט התמיכה:** `lib/support/knowledge.ts` (שנתי, חבר מביא חבר), `lib/ai/account-context.ts` (המחזור והשינוי המתוכנן), ושאלות חדשות ב-FAQ של המחירון.
- **הפאנל:** "מחזור חיוב" ו"בחידוש יעבור לחיוב" בכרטיס המשתמש; ההכנסה החודשית סופרת שנתי כ-1/12.

**חבר מביא חבר (`lib/referrals`)**
- **הקוד והקישור:** קוד אישי של 7 תווים בלי תווים שמתבלבלים (בלי 0/O, 1/I/L), ייחודי, נוצר בשימוש הראשון. `/r/<code>` (`app/r/[code]/route.ts`) שומר עוגייה `alze_ref` (30 יום, httpOnly, Lax), סופר `referral_visit` באנליטיקה (המזהה היומי האנונימי, בלי הקוד) ומפנה לדף הבית עם ה-utm. `/r` פרטי ב-robots.
- **ההרשמה:** `signIn` (`lib/auth/otp.ts`) מצמיד את ההפניה למשתמש **חדש** בלבד (כניסה של משתמש קיים - כלום). משתמש מופנה פעם אחת.
- **התגמול:** רק אחרי **התשלום האמיתי הראשון** של החבר (`completePayment`, `firstTime`), פעם אחת בדיוק: `referral_reward()` ב-SQL נועל את שורת ההפניה (ואת שורת המביא לספירת התקרה), כך שהפניה כפולה, ניסיון חוזר או שני redirects במקביל נותנים חודש אחד. חודש = `next_charge_at` נדחה ב-30 יום (גם בשנתי, גם במנוי מבוטל שעוד בתוקף). למביא בלי מנוי בתשלום, או עם חיוב פתוח באותו רגע - זיכוי ממתין שנכנס בתשלום המוצלח הבא (`referral_apply_credit()`, בכל מסלול חיוב). למביא עד 12 חודשים ב-365 ימים; מעבר לזה החבר עדיין מקבל את שלו (`capped`).
- **נגד ניצול:** אותו משתמש, אותו מייל (גם עם נקודות ו-+tag של Gmail), מספר וואטסאפ שקושר אי פעם לשני החשבונות, או אותו כרטיס (טוקן HYP) - נדחה (`rejected` + סיבה), נבדק בהרשמה (מייל) ושוב לפני התגמול.
- **הודעות:** בוואטסאפ לשניהם (בתוך החלון טקסט, מחוץ לו התבנית `referral_reward`); התראת מידע לבעלים (סוג `referral`, במייל המרוכז); `audit_log`: `referral.attach`, `referral.reject`, `referral.reward`, `referral.credit_applied`, `referral.link` - עם תוויות בעברית.
- **האזור האישי:** "חבר מביא חבר" באזור המנוי: הקישור, "העתקת הקישור", "שליחה בוואטסאפ" (wa.me עם הודעה מוכנה), איך זה עובד בשתי שורות, ומונים (הצטרפו, שילמו, חודשים חינם). **וואטסאפ:** "חבר מביא חבר" / "הזמנת חבר" מחזיר את הקישור (בלי המודל, לא נספר).
- **הפאנל:** בכרטיס המשתמש - הגיע דרך מי, הקוד שלו, ומי הגיע דרכו (עם הסטטוס); בסקירה - "הפניה" כמקור הרשמה, ופאנל "חבר מביא חבר" עם מונים ורשימה.

**מיגרציה `0018_annual_referrals.sql`** (מוסיפה בלבד; **אין `alter type ... add value`, אין בלוק pg_cron**): `subscriptions.billing_cycle` / `scheduled_cycle`, `billing_approvals.billing_cycle`, `payments.billing_cycle`; `referral_codes`, `referrals` (RLS בלי policy, service_role בלבד); `referral_push()`, `referral_reward()`, `referral_apply_credit()`; `page_events.event` + `referral_visit`; `owner_alerts.type` + `referral`; `admin_user_overview()` + `billing_cycle`, `referred`.

**החלטות כסף (לאישור דניאל)**
- שנתי = 10 × החודשי. יחסי לפי ימים שלמים (היום נספר), על פני ימי המחזור (365/366 בשנתי); לעולם לא יותר ממחזור אחד; ימי חינם שמעבר למחזור ששולם (חודש חינם שכבר ניתן) לא מתומחרים ולא מזוכים, ובמעבר לשנתי הם עוברים לסוף השנה החדשה.
- שנה ששולמה ב-29.2 מסתיימת ב-28.2; ביום הראשון שלה נחשבים 365 מתוך 366 ימים (לטובת הלקוח, בפרוטות).
- מעבר לשנתי: השנה מתחילה ביום החיוב (לא בסוף החודש הנוכחי), והקיזוז הוא החלק היחסי של החודש. מינימום חיוב 1 ₪.
- ביטול שנתי ומעבר משנתי לחודשי / מפרו לבסיסי - בלי החזר (לבדיקת עו"ד מול סעיף 13ד).
- חבר מביא חבר: התקרה סופרת חודשים שניתנו וחודשים ממתינים; זיכוי ממתין נכנס בתשלום המוצלח הבא; אין זיכוי כספי בשום מצב.
- סיכון ידוע, קטן: חיוב חודשי שמתחיל בדיוק ברגע של התגמול יכול לכתוב את `next_charge_at` שלו מעל הדחייה (חלון של מילישניות; `referral_push` לא נוגע במנוי עם חיוב פתוח). התוצאה האפשרית היא חודש חינם שלא ניתן - לעולם לא חיוב כפול או ביתר.

**בדיקות**
- יחידה: `lib/billing/annual.test.ts` (מחירים ומקבילה לחודש, שנה ושנה מעוברת, יחסי בכמה תאריכים כולל 29.2 וליד מעברי השעון, קיזוז חודשי → שנתי, תשלום ראשון שנתי וחידוש אחרי שנה, פרו → בסיסי ושנתי → חודשי בחידוש, ביטול שנתי, חיוב שנתי שנכשל עם ניסיונות, past_due והתראה לבעלים, Order שנתי עם סכום חסר, שדרוג באמצע השנה פעם אחת גם במקביל, המעבר לשנתי מהאזור האישי, וואטסאפ: שדרוג, ביטול וסטטוס), `lib/referrals/referrals.test.ts` (הקוד, הייחודיות והעוגייה, הפקודה, הצמדה בהרשמה למשתמש חדש בלבד, כל דחייה: עצמי, מייל, טלפון, כרטיס, הפניה אחת למשתמש, תגמול רק אחרי תשלום ראשון ופעם אחת גם ב-redirects במקביל, תקרת 12, זיכוי ממתין בתשלום הראשון ואחרי חיוב פתוח, מביא שנתי, המונים), `app/account/annual-actions.test.ts` (פעולות השרת), `app/r/[code]/route.test.ts`, `lib/db/supabase-referrals.test.ts`.
- SQL: `supabase/tests/annual_referrals.test.sql`, ומרוץ של שתי סשנים ב-`run-local.sh` (שני תגמולים במקביל → אחד, 30 יום לכל צד).
- e2e: `e2e/annual-referrals.spec.ts` (HYP mock): שנתי ב-`/pricing` → הרשמה → 990 ₪ → באזור האישי החיוב הבא בעוד שנה → שדרוג באמצע השנה ביחסי; חודשי → שנתי מהאזור האישי; A מעתיק קישור, B נרשם דרכו ומשלם → לשניהם +30 יום, המונים והפאנל; המתג ב-390. כל ה-e2e הקיימים עוברים. `CAPTURE_DIR=<dir>` שומר צילומים.

**לפני הפריסה**
- להריץ את `0018_annual_referrals.sql` ב-Supabase **לפני** פריסת הקוד (אין בה בלוק pg_cron, אין `alter type`). בלעדיה כל קריאה של מנוי נכשלת על העמודה `billing_cycle`.
- לרשום את 6 התבניות ב-Meta (`docs/copy/wa-templates.md`); משתני סביבה - אין חדש.

**פתוח**
- נוסח "חבר מביא חבר" ותקרת 12 החודשים - לאישור דניאל; ביטול שנתי בלי החזר - לעו"ד.
- `alze_ref` ו-`alze_cycle` נוספו לסעיף העוגיות במדיניות הפרטיות (טיוטה, לעו"ד).

## מעבר לחשבונות האמיתיים - הכנה (25.10)
- **באג בייצור:** המתזמן לא רץ. ב-pg_cron רץ `wabot_dispatch_due_jobs`, אבל ב-Vault אין `jobs_worker_url` / `qstash_token`, ואין Vercel Cron - תזכורות, סיכומי בוקר, סריקות יזומות ומייל הבוקר לבעלים לא נשלחו.
- **התיקון:** `vercel.json` → `crons` כל דקה ל-`/api/jobs/tick`; ב-`app/api/jobs/tick/route.ts` נוסף `GET` שבודק `Authorization: Bearer <CRON_SECRET>` (בלי `CRON_SECRET` → 503 עם הודעה בעברית). בדיקה ב-`app/api/jobs/jobs-routes.test.ts`. דורש Vercel Pro, ולכן נכנס רק ל-`main` (הפרויקט הישן ב-Hobby).
- **`main`:** נוצר מ-`claude/preview` + התיקון. מדריך המעבר: `docs/migration-he.md`.
- **עדכון (25.10):** דניאל נשאר ב-Vercel Hobby עד ההשקה, וב-Hobby Cron מותר פעם ביום בלבד (פריסה עם Cron כל דקה נכשלת). ה-Cron יצא מ-`vercel.json`; במקומו מיגרציה `0019_tick_scheduler.sql`: `tick_dispatch()` שולחת דרך pg_net `GET /api/jobs/tick` עם `Authorization: Bearer <cron_secret>` (Vault: `tick_url`, `cron_secret`), ו-pg_cron מריץ אותה כל דקה במקום `wabot_dispatch_due_jobs`. בדיקה: `supabase/tests/tick_scheduler.test.sql`. ה-`GET` עם `CRON_SECRET` ב-route נשאר (גם ל-Vercel Cron ב-Pro).
- **המעבר בוצע (25.10):** הפרויקט החדש ב-Vercel (Hobby) - `https://alze-nine.vercel.app`, מ-`danielnotexist/WhatsappBOT` ענף `main`. 29 משתנים (רגילים מהפרויקט הישן, סודיים מה-scratchpad, `SUPABASE_SERVICE_ROLE_KEY` מ-Supabase; `TOKEN_ENC_KEY` ו-`CRON_SECRET` חדשים). Supabase: Vault `tick_url`/`cron_secret`, 0019 ובלוקי ה-cron של 0013–0017 הוחלו; `wabot_tick` מחזיר 200 כל דקה. Meta webhook הועבר לכתובת החדשה. נשאר: כתובות החזרה ב-Entra וב-Google (דניאל), טוקן וואטסאפ קבוע, והשבתת הפרויקט הישן. מפתח ההצפנה החדש מחייב חיבור מחדש של Google / Microsoft וכניסה מחדש לאתר.

## סליקה חיה בהדגמה - מסוף בדיקה בלבד (27.10)
- מתג חדש `LIVE_HYP=1` (`lib/demo.ts` `liveHypFlag`, `hypTestTerminal`; `lib/env.ts` `liveHypInDemo`, `hypMocked`): בהדגמה HYP אמיתי רק כש-`HYP_MASOF` מתחיל ב-`00100` (מסוף בדיקה, בלי כסף אמיתי). ליד מסוף אמיתי - `DemoConfigError`. `lib/hyp/index.ts`, `app/api/pay/mock`, `app/invoice/[token]` עברו ל-`hypMocked()`. בדיקות: `lib/demo-factories.test.ts`. מדריך: `docs/hyp-setup.md` §3.
- מדניאל: מספר מסוף הבדיקה, KEY ו-PassP מהפורטל, "אימות על ידי חתימה" מופעל, והפנייה לאחר עסקה מוצלחת ל-`https://alze-nine.vercel.app/api/pay/return`.

## לוגו וסלוגן (28.10)
- דניאל בחר: סמל עם ראש הדוכיפת בטבעת דבש (`public/brand/mascot/emblem.webp`, חיתוך מ-`front.webp`) + "עלזה" ב-Fredoka Bold (`lib/fonts.ts` `logoFont`, המחלקה `.alze-logo-type` ב-`app/globals.css`), וסלוגן החברה `BRAND.slogan` = "מבקשים בוואטסאפ. היא על זה." מתחת לשם בכותרת ובתחתית דף הבית (`<Wordmark slogan />`). `components/brand/wordmark.tsx`: `Emblem` + `Wordmark`. נבדקה גם דבורה כקמע (השוואה ב-scratchpad) - דניאל נשאר עם עלזה והדוכיפת.
