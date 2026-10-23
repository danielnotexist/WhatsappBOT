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
