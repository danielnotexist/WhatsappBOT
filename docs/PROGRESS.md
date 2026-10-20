# יומן התקדמות

> מתעדכן בכל commit. מה נעשה · איך בודקים · מה דניאל צריך לעשות ידנית.
> הכללים לסוכנים: `AGENTS.md`. התוכנית: `docs/PLAN.md`.

## החלטות שהתקבלו אחרי התוכנית

- מחירים: **99 ₪ (עד 750 הודעות/חודש)** · **299 ₪ (fair use)**.
- בונים במקביל לבדיקה המשפטית של Meta §4.7 (`docs/legal/meta-ai-clause-memo.md`).
- שם המוצר עוד לא נבחר — בכל הטקסטים משתמשים ב-`{{שם}}` (מועמדים: `docs/naming.md`).
- כיוון עיצוב עוד לא נבחר — דניאל בוחר אחד משלושה ב-`design/directions/`.
- טון: מקצועי וחם, בלי בדיחות. פנייה ניטרלית (בלי "שלח/י").

## דרוש מדניאל

| # | מה | איפה | למה |
|---|---|---|---|
| 1 | לבחור שם מוצר | `docs/naming.md` | מחליף את `{{שם}}` בכל הטקסטים והתבניות |
| 2 | לבחור כיוון עיצוב (01 / 02 / 03) | `design/directions/README.md` | לפני בניית הדפים האמיתיים (אבן דרך 1) |
| 3 | מפתחות API ל-`scripts/hebrew-eval/.env` (`ANTHROPIC_API_KEY` חובה; `GOOGLE_API_KEY`/`OPENAI_API_KEY` אופציונלי) | `scripts/hebrew-eval/README.md` | להריץ את בדיקת העברית האמיתית (אבן דרך 0) ולבחור מודל |
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
