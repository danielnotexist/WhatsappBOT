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

## דרוש מדניאל

| # | מה | איפה | למה |
|---|---|---|---|
| 1 | לאשר את מראה ההרשמה (צילומים) | `design/signup-screens/` | נקודת ביקורת לפני ליטוש דף הנחיתה, הכניסה והאזור האישי |
| 2 | `OPENROUTER_API_KEY` (עד $3) | — | יצירת הדוכיפת התלת-ממדית (20 וריאציות → בחירה → 4 פוזות) |
| 3 | **להחליף את מפתח Anthropic** (נחשף בצ'אט) | console.anthropic.com | הריצה המשלימה הסתיימה ($0.84) |
| 3א | לרכוש דומיין (alze.ai — "כנראה פנוי", לאמת) | `docs/naming.md` | `BRAND.domain`, Resend, תבניות Meta |
| 4 | כל משתני הסביבה של האתר | `.env.example` | האתר עולה בלי, אבל כל אינטגרציה אמיתית דורשת |
| 5 | פורטלים (Meta, Entra, Google Cloud, HYP, Supabase, Vercel, Upstash, Resend) | `README.md` → "מה דניאל צריך לעשות ידנית" | לפי PLAN §9 |

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
- **OAuth 2.0 web flow** (`lib/google/oauth.ts`): code + PKCE S256, `access_type=offline`, `prompt=consent`, `include_granted_scopes=true`. Scopes: `openid email profile`, `calendar.events` (לא `calendar` המלא), `drive.file`, `gmail.send`. הסכמה מצטברת ל-`gmail.readonly` חסומה מאחורי `GOOGLE_GMAIL_READ_ENABLED=false` (דורש CASA).
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
- **סיכום הבוקר כולל את יומן Google**: `googleFor` ב-`lib/jobs` (`googleForUser` → `listEvents` ליום המקומי); למשתמש עם שני החיבורים — היומנים ממוזגים לפי שעה (אירועי כל-היום קודם). מיילים שמחכים לתשובה — רק מ-Microsoft 365 (קריאת Gmail אחרי CASA).
- `docs/legal/oauth-consent-screen-he.md` §3–4: `calendar.events` במקום `calendar`.
- **בדיקות**: 386 (44 חדשות מאבן דרך 6 + 2 לסיכום בוקר עם Google), הכול מול fixtures / fetch מדומה.

**איך בודקים**
```bash
pnpm test -- lib/google app/api/auth/google lib/bot/connect-intent lib/copy/bot-google lib/jobs
DATA_MODE=memory pnpm dev   # "לחבר את גוגל" בשיחה → /api/auth/google/start?t=… → callback מדומה
```

**דרוש מדניאל:** פרויקט GCP + Calendar/Drive/Gmail APIs, מסך הסכמה External, OAuth client מסוג Web עם redirect `https://<דומיין>/api/auth/google/callback` (`docs/google-setup.md` §1–2); ב-Vercel `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_GMAIL_READ_ENABLED=false`; משתמשי בדיקה (עד 100, הרשאה פגה אחרי 7 ימים); לפני השקה — אימות דומיין, branding, סרטון הדגמה והצדקות ל-`calendar.events` ו-`gmail.send` (§5). קריאת Gmail רק אחרי CASA (§6).

### 2026-10-21 — מיזוג: סבב "עלזה" 1–4 + אבני דרך 5 ו-6 (ענף האינטגרציה)

- מוזג `worktree-agent-a3cd72339d3427793` (115480b: תזכורות, סיכום בוקר, הודעות קוליות, Google OAuth) לתוך הענף.
- **returnTo אחיד:** ה-callback של Microsoft עבר ל-`lib/auth/oauth-return.ts` (אותו כלל כמו Google): `returnTo=onboarding` → `/start/ready?connected=<provider>` או `/start/connect?error=…` (ו-`admin=1` כשהארגון דורש מנהל IT), אחרת `/account`.
- `/connect/google` → `/api/auth/google/start?returnTo=onboarding`; `/start/ready` מציג "Outlook מחובר" / "Gmail מחובר".
- `lib/bot/process-inbound.ts`: נשמרו גם handler ה"כניסה" (אחרי תמלול ההקלטה — אפשר גם להגיד "כניסה" בקול) וגם הקלטות, כפתורי תזכורת וזיהוי חיבור Microsoft/Google.
- **בדיקות אחרי המיזוג:** 416 יחידה/קומפוננטה, build, E2E 8/8 (נוסף נתיב Google עם ה-fixture), eval typecheck + dry-run, Supabase מקומי (`DB_NAME=whatsappbot_main_test`).

## מה נשאר (אבני דרך 5–7)
- אבן דרך 5 (שארית): רישום 7 התבניות ב-Meta (ידני), טיפול ב-change notifications (מייל חדש → מידע לסיכום).
- אבן דרך 6 (שארית): Google Picker בצד הלקוח (`docs/google-setup.md` §8), כפתורי החיבור באתר, אימות האפליקציה ב-Google, CASA לקריאת Gmail (ואז מיילים שמחכים לתשובה גם מ-Gmail בסיכום הבוקר).
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
