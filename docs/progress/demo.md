# מצב הדגמה (`DEMO_MODE=1`) — האתר החי ב-Vercel

> 21.10.2026 · סוכן A · ענף `worktree-agent-a38ed9acfc9c2cfb1` · הערות לשילוב ב-`docs/PROGRESS.md` (לא נגעתי בו, כדי לא להתנגש בסוכנים המקבילים).
> מדריך ההעלאה: `docs/deploy.md`.

## מה נבנה

- **`lib/demo.ts`** — `isDemo()` / `assertDemoSafe()` / `demoProblems()`. סמנטיקה של staging (לפי עדכון הרכז אחרי שדניאל חיבר Supabase): הנתונים יכולים להיות אמיתיים, שום דבר לא יוצא החוצה.
  - מסרב לעלות (שגיאה בעברית, שמות בלבד) ליד `WA_ACCESS_TOKEN`, `HYP_KEY`, `HYP_PASSP`, `MS_CLIENT_SECRET`, `GOOGLE_CLIENT_SECRET`, `RESEND_API_KEY`, `QSTASH_TOKEN`, ובלי `TOKEN_ENC_KEY` תקין. `SUPABASE_*` מותר.
  - הבדיקה רצה בעליית השרת (`instrumentation.ts` — השרת לא עולה, נבדק ידנית עם `next start`) ובכל `isDemo()` (גם `proxy.ts`, כך שאף עמוד לא מוגש).
- **נתונים** (`lib/env.ts` `dataMode()`): בהדגמה — Supabase אם הוגדר `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`, אחרת זיכרון, גם ב-production. `DATA_MODE` מפורש גובר.
  - בזיכרון: מזהה משתמש נגזר מהמייל (`lib/auth/demo-user.ts`, HMAC עם תת-מפתח `demo`), וה-session (v2) נושא את המייל החתום — instance שלא מכיר את המשתמש יוצר אותו מחדש (`getSession()`, `ensureDemoSessionUser()` ל-`/pay` ולחזרה מהתשלום). ב-Supabase אין צורך ואין יצירה מחדש.
- **אינטגרציות** (`integrationsMocked()` ב-`lib/env.ts`): WA, AI, Microsoft (config + Graph), Google (config + fetch), HYP, מייל, STT (גם כש-`STT_PROVIDER` מוגדר), תור (תמיד `LocalQueue`), ו-`/api/pay/mock`. כולן מדומות בהדגמה, גם על Supabase.
- **קוד אימות**: `fixedCode` ב-`lib/auth/otp.ts` — `123456` לכל מייל, בלי לשמור ובלי לשלוח; הגבלות לפי IP נשארות, ושליחות לפי מייל דרך ה-limiter. המשתמש נוצר/נמצא כרגיל (ב-Supabase נשמר). מסך הקוד (`app/(auth)/start/code/page.tsx`) מציג `DemoCodeNote`.
- **Microsoft/Google** (`lib/auth/demo-connect.ts`): ה-start routes מריצים את החלפת הקוד מול ה-fixture, אוטמים את הטוקנים כמו ה-callback, וכותבים חיבור דרך שכבת הנתונים הרגילה (החשבון = המייל של המשתמש; בלי Graph subscription, בלי שינוי שם, בלי הודעת וואטסאפ) → `oauthReturnUrl` → `/start/ready?connected=…` או `/account`.
- **וואטסאפ**: `components/demo/DemoWaDialog.tsx` (לקוח) + `DemoWaGate.tsx` (שרת, קורא את המתג בזמן הבקשה). חלון: "בגרסה האמיתית ייפתח וואטסאפ עם ההודעה:" + בועה עם ההודעה והקוד האמיתי. **לא מחובר עדיין** למסך "מוכנה" (קובץ של סוכן C) — ראו `docs/deploy.md` §7.
- **בכל האתר**: `components/demo/DemoBar.tsx` ב-`app/layout.tsx` (נקרא בכל בקשה, חור דינמי בתוך Suspense), `X-Robots-Tag` ב-`proxy.ts`, ו-`robots` ב-metadata של ה-layout (נקבע ב-build).
- **תיקונים בדרך**:
  - `/api/pay/mock` היה נבנה כקובץ סטטי (Cache Components מריץ GET בזמן build) → `await connection()`.
  - הפניה מ-server action לנתיב API באותו דומיין נשארה בכתובת `/api/pay/mock` → בקשת RSC מקבלת תשובה רגילה והנתב עושה טעינה מלאה (כמו דף HYP האמיתי).
  - `/api/jobs/tick` בהדגמה דורש את הסוד הפנימי (כתובת ציבורית).
- `/api/health` מחזיר `mode`: `demo-memory` / `demo-supabase` / `memory` / `supabase`.

## בדיקות

- יחידה: 475 (היו 416; 59 חדשות) — `lib/demo.test.ts`, `lib/demo-factories.test.ts` (כל factory מדומה בהדגמה, גם עם מפתחות, גם עם Supabase; `createClient` מדומה), `lib/auth/demo-auth.test.ts` (session v2, מזהה נגזר, יצירה מחדש, OTP), `app/api/demo-routes.test.ts` (OTP, Microsoft/Google, health, tick, pay mock — גם בזיכרון וגם מול `SupabaseDb` עם `lib/db/__fixtures__/supabase-fake.ts`), `components/demo/demo.test.tsx`, `proxy.test.ts`.
- E2E: `pnpm e2e:demo` (`playwright.demo.config.ts`) — build + שני `next start` עם אותו `TOKEN_ENC_KEY` (שני "instances"): noindex + פס בכל עמוד; `/` → `/start` → מייל → `123456` → Microsoft (בלי בקשה אחת מחוץ ל-localhost) → ready → `/account`; אותה עוגייה ב-instance B → `/account` (המשתמש נוצר מחדש) → `/pay` → HYP מדומה → מנוי פעיל; `/login` → `123456` → `/account`. 3/3. החלון של וואטסאפ נבדק כשהכפתור עטוף (נבדק זמנית ונמחק).
- `pnpm e2e` הקיים (dev, memory) עובר בלי שינוי; `demo.spec.ts` מוחרג ממנו.

## דרוש מהרכז / מסוכן C
- לעטוף את כפתור הוואטסאפ ב-`components/auth/ready-step.tsx` ב-`<DemoWaGate href={waHref}>` (ולשקול להסתיר את ה-QR בהדגמה).
- אופציונלי: `DemoCodeNote` גם ב-`/login/code`; קישור ל-`/pay` מהאזור האישי (`payLinkFor`).
