# עוזר AI בוואטסאפ — אפליקציית ה-Web

אתר ההרשמה, האזור האישי ונקודות הקצה (webhooks, OAuth callbacks, תשלום) של העוזר האישי בוואטסאפ
לעסקים קטנים בישראל. התוכנית המלאה: [`docs/PLAN.md`](docs/PLAN.md).

**Stack:** Next.js 16 (App Router, Cache Components) · TypeScript strict · Tailwind 4 · shadcn (`rtl: true`, Base UI) ·
next/font (Frank Ruhl Libre + Assistant, self-host) · zod · Vitest · ESLint + Prettier · pnpm · Vercel (fra1).

## דרישות

- Node 22 (`.nvmrc`) — `nvm use`
- pnpm 10 — `corepack enable` או `npm i -g pnpm`

## התקנה והרצה

```bash
pnpm install
cp .env.example .env.local   # ולמלא ערכים (ראו "מה דניאל צריך לעשות ידנית")
pnpm dev                     # http://localhost:3000
```

האתר עולה גם בלי משתני סביבה — הוולידציה (`lib/env.ts`) רצה עצלה: כל מודול דורש רק מה שהוא צריך (`requireEnv([...])`) ונכשל עם הודעה בעברית שמפרטת את החסר.
`GET /api/health` מחזיר `checks.env: "ok" | "incomplete"` (שמות בלבד, בלי ערכים).

**פיתוח בלי Supabase/Resend/Meta/Anthropic:** `DATA_MODE=memory pnpm dev` — שכבת נתונים בזיכרון, קוד ה-OTP מודפס לקונסול (`[mail] קוד אימות ל-…`), הודעות הבוט מודפסות (`[wa:text] → …`), מודל mock, תור מקומי. אסור ב-production.
לדמות webhook של Meta מקומית: לחתום את ה-body ב-HMAC-SHA256 עם `META_APP_SECRET` ולשלוח `POST /api/wa/webhook` עם `x-hub-signature-256: sha256=<hex>`.
זרימת ההרשמה: `/start` → קוד → `/start/connect` → `/start/link` → `/account`.

## סקריפטים

| פקודה               | מה עושה                                                      |
| ------------------- | ------------------------------------------------------------ |
| `pnpm dev`          | שרת פיתוח (Turbopack)                                        |
| `pnpm build`        | build לפרודקשן                                               |
| `pnpm start`        | הרצת ה-build                                                 |
| `pnpm lint`         | ESLint (next/core-web-vitals + typescript + prettier)        |
| `pnpm typecheck`    | `next typegen` + `tsc --noEmit` (strict, noUncheckedIndexed) |
| `pnpm test`         | Vitest (lib/, proxy, קומפוננטות ב-jsdom)                     |
| `pnpm format`       | Prettier (+ מיון כיתות Tailwind) על כל הפרויקט               |
| `pnpm format:check` | בדיקת פורמט בלי לשנות                                        |
| `pnpm check`        | lint + typecheck + test (להריץ לפני commit)                  |

## מבנה התיקיות

```
app/
  layout.tsx            <html lang="he" dir="rtl">, פונטים, metadata, theme-color, DirectionProvider, Toaster
  page.tsx              דף נחיתה — placeholder (כותרת + CTA) עד שייבחר כיוון עיצוב
  globals.css           Tailwind 4 + shadcn tokens; --font-sans/--font-heading מגיעים מ-lib/fonts.ts
  (auth)/start/         הרשמה: מייל → /start/code (קוד) → /start/connect (M365/Google, דילוג) → /start/link (wa.me + טוקן). UI זמני עד בחירת עיצוב
  account/              האזור האישי: חיבורים (ניתוק), מספרי וואטסאפ, מנוי (ביטול), מחיקת חשבון — Server Actions
  api/auth/otp/send     POST {email} → קוד במייל (Resend) · api/auth/otp/verify POST {email, code} → עוגיית session
  api/wa/webhook        GET אימות רישום (WA_VERIFY_TOKEN) · POST אימות X-Hub-Signature-256 על ה-body הגולמי → תור (QStash / מקומי) → 200 מיידי
  api/wa/worker         מריץ משימה אחת מהתור (אימות חתימת QStash או סוד פנימי) → lib/bot
  pay/[token]/          דף תשלום אישי (קישור חתום מהשיחה, בלי session): בחירת מסלול → HYP
  api/pay/return        ה-success URL של HYP: APISign VERIFY → getToken → הפעלת מנוי + משימת חיוב חודשית → הודעה בוואטסאפ
  api/pay/mock          DATA_MODE=memory בלבד — מדמה את דף התשלום של HYP
  api/jobs/run          worker למשימות מתוזמנות (pg_cron → QStash): charge (אבני דרך 5: סיכום בוקר, תזכורות)
  api/health/route.ts   בדיקת חיות
components/ui/          shadcn: button, input, card, input-otp, dialog, sonner, direction (נוצרו ב-CLI, RTL-aware)
lib/
  env.ts                משתני סביבה — zod, שרת/לקוח, lazy
  crypto.ts             AES-256-GCM לטוקני OAuth (TOKEN_ENC_KEY) + AAD
  fonts.ts              זוג הפונטים הפעיל (להחלפה במקום אחד)
  db/                   שכבת נתונים: types.ts (ממשק Db), supabase.ts (service-role, שרת בלבד), memory.ts (זיכרון — בדיקות ו-DATA_MODE=memory)
  mail/                 שליחת קוד OTP: resend.ts (API), console.ts (פיתוח), index.ts (בחירה לפי DATA_MODE)
  auth/                 otp.ts (6 ספרות, 10 דק', 5 ניסיונות, 60 שנ' בין שליחות, 5 לשעה), session.ts (עוגייה חתומה 30 יום), link-token.ts (XXXX-XXXX, 15 דק'), keys.ts (HKDF מ-TOKEN_ENC_KEY)
  account/service.ts    לוגיקת האזור האישי (ניתוק, ביטול מנוי, מחיקה) — ללא תלות ב-Next, נבדק עם MemoryDb
  rate-limit.ts         חלון הזזה בזיכרון (לפי IP) + clientIp()
  wa/                   client.ts (Cloud API: טקסט/כפתורים/רשימה/תמונה/ריאקשן/נקרא+typing/תבנית/מדיה), webhook.ts (פרסור), signature.ts, sender.ts (ממשק + מקליט לבדיקות)
  queue/                qstash.ts (publish + אימות JWT), local.ts (fallback בתהליך), index.ts
  ai/                   types.ts (ממשק ספק), anthropic.ts (SDK, Haiku 5.5 router / Sonnet 5.5 strong, adaptive+low, caching), mock.ts, system-prompt.ts, tools.ts (draft_email, create_event, set_morning_time, remember_fact), memory.ts (סיכום מתגלגל + עובדות), orchestrator.ts (router → strong + לולאת כלים)
  bot/                  process-inbound.ts (הצינור: dedupe → זהות → ✅/typing → כפתורים → היכרות → מכסה → עוזר → זיכרון), linking.ts, onboarding.ts, pending.ts (שלח/ערוך/בטל + executors), context.ts
  copy/bot.ts           כל הטקסטים של הבוט לפי ה-ids ב-docs/copy/bot-copy.md (בדיקה מוודאת שכל id מתועד)
  product.ts            PRODUCT_NAME = "{{שם}}" עד שייבחר שם
  wa/signature.ts       אימות X-Hub-Signature-256 של Meta (timing-safe) + challenge של רישום webhook
  hyp/                  sign.ts (APISign SIGN/VERIFY), client.ts (HypClient: דף תשלום, VERIFY, getToken, soft עם טוקן + SendHesh, PrintHesh; MockHypGateway), index.ts
  billing/              plans.ts (99/750, 299/3000, ימי ניסיון חוזר 1/3/5), pay-link.ts (קישור /pay/<token> חתום, 7 ימים), subscription.ts (מכונת מצבים: הפעלה, חיוב חודשי, past_due), service.ts (startPayment, completePayment, runChargeJob + הודעות/תבניות)
proxy.ts                כותרות אבטחה (CSP report-only, HSTS, nosniff, referrer, permissions). ב-Next 16 זה השם של middleware
docs/                   תוכנית (PLAN.md), יומן התקדמות (PROGRESS.md), טקסטים (copy/), משפטי (legal/)
scripts/, supabase/, design/   נכתבים בנפרד; מוחרגים מ-lint/typecheck/prettier/vitest
```

קבצי קונפיגורציה: `components.json` (shadcn, `rtl: true`), `next.config.ts`, `tsconfig.json`, `eslint.config.mjs`,
`.prettierrc`, `vitest.config.mts` + `vitest.setup.ts`, `vercel.json` (regions: fra1), `.editorconfig`, `.nvmrc`.

## RTL ופונטים

- `<html lang="he" dir="rtl">` + `DirectionProvider direction="rtl"` (Base UI) ב-`app/layout.tsx`.
- קומפוננטות shadcn נוצרות עם `rtl: true` ולכן משתמשות רק ב-utilities לוגיים (`ps-`/`pe-`/`ms-`/`me-`/`start-`/`end-`).
  בקוד שלנו: **אין** `ml-`/`mr-`/`pl-`/`pr-`/`left-`/`right-`. יש בדיקה שמוודאת זאת ל-Button.
- פונטים: `lib/fonts.ts`. הזוג הפעיל הוא Frank Ruhl Libre (כותרות) / Assistant (גוף). שלושת הזוגות האחרים מ-PLAN §10
  מתועדים שם — החלפה = שינוי שני import-ים ושתי קריאות. `next/font` מוריד את הקבצים בזמן build ומגיש מהדומיין שלנו.
- כיתות: `font-sans` (גוף, ברירת מחדל ב-html) ו-`font-heading` (h1–h3 אוטומטית).

## אבטחה (מה כבר קיים)

- `proxy.ts`: `Content-Security-Policy-Report-Only` (לא חוסם עדיין — לעבור ל-enforce עם nonce לפני השקה), HSTS (רק ב-production),
  `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`, `X-Frame-Options: DENY`, COOP.
- `lib/crypto.ts`: טוקנים נשמרים ב-DB רק מוצפנים; מומלץ להעביר `aad: \`${userId}:${provider}\`` כדי לקשור טוקן למשתמש.
- `lib/wa/signature.ts`: כל webhook של Meta מאומת על ה-body הגולמי לפני parse.
- `lib/hyp/sign.ts`: `KEY`/`PassP` לעולם לא מגיעים לדפדפן; `redactHypQuery` לפני כל לוג.
- `lib/env.ts`: `serverEnv()` זורק אם נקרא בדפדפן; רק `NEXT_PUBLIC_*` ב-`clientEnv`.

## פריסה (Vercel)

- Framework: Next.js · Region: `fra1` (`vercel.json`) · Node 22.
- להגדיר את כל המשתנים מ-`.env.example` ב-Production וב-Preview.
- אחרי הפריסה: `GET https://<domain>/api/health` → `{"ok":true,"checks":{"env":"ok"}}`.

## מה דניאל צריך לעשות ידנית

לפי הסדר ב-PLAN §9. כל פריט מסתיים בערך שנכנס ל-Vercel → Environment Variables (השמות ב-`.env.example`).

1. **דומיין** — לבחור שם (PLAN §7), לקנות `.co.il` (ISOC) ו-`.ai`, לחבר ל-Vercel. → `APP_URL`, `NEXT_PUBLIC_APP_URL`.
2. **Vercel Pro + Supabase Pro (Frankfurt)** — ליצור פרויקטים. Supabase → Settings → API. → `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
3. **מפתח הצפנה** — `openssl rand -base64 32`, לשמור במנהל סיסמאות. → `TOKEN_ENC_KEY`.
4. **Meta / WhatsApp** — אימות Business, אפליקציית WhatsApp, SIM ישראלי ייעודי, Display name, אמצעי תשלום, System user token;
   להגדיר webhook ל-`https://<domain>/api/wa/webhook` עם ה-verify token. → `WA_PHONE_NUMBER_ID`, `WA_ACCESS_TOKEN`, `WA_VERIFY_TOKEN`, `META_APP_SECRET`.
5. **Microsoft Entra** — App registration multi-tenant ב-tenant של העסק, Redirect URI `https://<domain>/api/auth/microsoft/callback`,
   client secret; Partner Center → Publisher Verification. → `MS_CLIENT_ID`, `MS_CLIENT_SECRET`, `MS_TENANT=common`.
6. **Google Cloud** — פרויקט, OAuth consent (External), scopes calendar + drive.file + gmail.send, Redirect URI
   `https://<domain>/api/auth/google/callback`, אימות sensitive scopes. → `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`.
7. **HYP** — להפעיל טוקנים במסוף, "אימות על ידי חתימה", success/error URL (`https://<domain>/pay/return`), מסוף בדיקה. → `HYP_MASOF`, `HYP_KEY`, `HYP_PASSP`.
8. **Anthropic, Soniox, OpenRouter, Upstash QStash, Resend** — ליצור חשבונות ומפתחות; ב-Resend לאמת את הדומיין.
   → `ANTHROPIC_API_KEY`, `SONIOX_API_KEY`, `OPENROUTER_API_KEY`, `QSTASH_*`, `RESEND_API_KEY`.
9. **עו"ד** — חוות דעת Meta §4.7 + מדיניות פרטיות/תנאים (טיוטה תיכתב בקוד).
10. **עיצוב** — לבחור אחד משלושת כיווני העיצוב (נבנים בנפרד) ואת זוג הפונטים (`lib/fonts.ts`).

## הערות ל-Next 16

- `middleware.ts` הוחלף ב-`proxy.ts` (deprecated ב-16; אותו API, export בשם `proxy`).
- `cacheComponents: true`: דפים נבנים כ-static shell; קוד שתלוי בבקשה (cookies/headers/DB) עטוף ב-`<Suspense>` או ב-`await connection()`.
- `AGENTS.md` נוצר ע"י `create-next-app` ומפנה לתיעוד המקומי ב-`node_modules/next/dist/docs/` — לקרוא לפני כתיבת קוד Next.
