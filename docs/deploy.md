# העלאה ל-Vercel — גרסת הדגמה (`DEMO_MODE=1`) ואחר כך המצב האמיתי

> עודכן 21.10.2026. הקוד: `lib/demo.ts` (המתג והבדיקות), `lib/env.ts` (`dataMode()`, `integrationsMocked()`),
> `instrumentation.ts` (בדיקה בעלייה), `proxy.ts` (noindex), `components/demo/*` (הפס, הערת הקוד, חלון הוואטסאפ).
> התוכנית: סעיף 1 בתוכנית הסבב ("אתר חי ב-Vercel לגלישה").

## 1. מה זה מצב הדגמה

אתר שלם שאפשר לגלוש בו (נחיתה, הרשמה, חיבור, אזור אישי, תשלום) **בלי שום דבר שיוצא החוצה**. סמנטיקה של staging: הנתונים יכולים להיות אמיתיים, השליחות לא.

| נושא | מה קורה בהדגמה |
|---|---|
| נתונים | אם מוגדר Supabase (`SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`) — הנתונים נשמרים שם, וכל ה-instances של Vercel רואים אותם (supabase-js ב-HTTPS, בלי חיבור קבוע — מתאים ל-serverless). בלי Supabase — זיכרון התהליך בלבד (ראו §6). `DATA_MODE` מפורש גובר. |
| קוד אימות | `123456` לכל מייל. לא נשמר קוד ולא נשלח מייל; מסך הקוד מציג "בגרסת ההדגמה הקוד הוא 123456". הגבלות הקצב (לפי IP, ושליחות לפי מייל) נשארות. המשתמש עצמו נוצר/נמצא כרגיל (ב-Supabase — נשמר). |
| Microsoft / Google | מסך המעבר עובר ל-`/api/auth/{microsoft,google}/start`, שכותב חיבור לדוגמה (טוקני fixture מוצפנים, החשבון = המייל של המשתמש) דרך שכבת הנתונים הרגילה, וחוזר ל-`/start/ready?connected=…` (בהרשמה) או ל-`/account`. אין פנייה ל-Microsoft או ל-Google. |
| וואטסאפ | כפתור "חיבור לוואטסאפ" פותח חלון: "בגרסה האמיתית ייפתח וואטסאפ עם ההודעה: היי עלזה! …" עם הקוד החד-פעמי האמיתי (ראו §7). אין שליחת הודעות. |
| תשלום | `/pay/<token>` → `/api/pay/mock` (במקום HYP) → `/api/pay/return` → `/account` עם מנוי פעיל. אין חיוב. |
| AI, תמלול, מייל, תור | תמיד המימוש המדומה (`MockProvider`, `MockStt`, `ConsoleMailer`, `LocalQueue`), גם אם יש מפתחות. |
| מנועי חיפוש | `X-Robots-Tag: noindex, nofollow` בכל תשובה (`proxy.ts`, נבדק בכל בקשה) + `<meta name="robots" content="noindex, nofollow">` (נקבע ב-build). |
| בכל עמוד | פס דק למעלה: "גרסת הדגמה — שום דבר לא נשלח באמת" (נקבע בכל בקשה). |

**ההדגמה מסרבת לעלות** (שגיאה בעברית עם שמות המשתנים, בלי ערכים) אם לידה מוגדר אחד מאלה — כל אחד מהם מאפשר לשלוח משהו באמת:
`WA_ACCESS_TOKEN`, `HYP_KEY`, `HYP_PASSP`, `MS_CLIENT_SECRET`, `GOOGLE_CLIENT_SECRET`, `RESEND_API_KEY`, `QSTASH_TOKEN`.
היא גם מסרבת בלי `TOKEN_ENC_KEY` תקין. הבדיקה רצה בעליית השרת (`instrumentation.ts`) ובכל שימוש במתג.

## 2. משתני סביבה ב-Vercel (Settings → Environment Variables)

לסמן לכל משתנה **Production + Preview** (ולא רק Runtime: Vercel מעביר אותם גם ל-build, וזה נדרש — ה-meta של noindex נקבע ב-build).

| משתנה | ערך | הערות |
|---|---|---|
| `DEMO_MODE` | `1` | המתג. |
| `TOKEN_ENC_KEY` | הפלט של `openssl rand -base64 32` | **Sensitive**. אותו ערך לכל ה-instances ולכל ה-deployments — ה-session חתום בו. לא להדפיס, לא להעתיק לצ'אט. החלפה = כולם מתנתקים, והטוקנים שכבר מוצפנים בו לא ייקראו. |
| `APP_URL` | הכתובת הקבועה, למשל `https://alze.vercel.app` | להפניות אחרי חיבור/תשלום. בלי זה — הכתובת של הבקשה. |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | מהפרויקט ב-Supabase (Project Settings → API) | **מומלץ**: נתונים שנשמרים בין instances. המיגרציות 0001–0005 כבר רצו שם. `SUPABASE_SERVICE_ROLE_KEY` — Sensitive, שרת בלבד, אף פעם לא `NEXT_PUBLIC_`. |
| `WA_PUBLIC_NUMBER` | אופציונלי | המספר שמופיע בקישור wa.me ובקוד ה-QR. בלי זה — מספר דמה (`972500000000`). |

**לא להגדיר** בהדגמה: אף אחד מהמפתחות ברשימת הסירוב ב-§1. מפתחות כמו `ANTHROPIC_API_KEY`, `SONIOX_API_KEY`, `MS_CLIENT_ID`, `GOOGLE_CLIENT_ID` מותרים אבל לא בשימוש (הכול מדומה) — עדיף לא להוסיף אותם עד המעבר למצב האמיתי.

שינוי במשתנים נכנס לתוקף רק ב-deployment הבא (Redeploy).

## 3. אתר פרטי — Deployment Protection

Settings → **Deployment Protection** → **Vercel Authentication** → Enabled, היקף: **All Deployments** (כולל כתובת ה-production).
- ב-**Standard Protection** כתובת ה-production (הדומיין הראשי של הפרויקט) נשארת ציבורית — לא מספיק כאן. אם All Deployments לא מוצע בתוכנית של החשבון, לא לחבר דומיין ולשלוח רק כתובות deployment (`*-<team>.vercel.app`), שמוגנות גם ב-Standard.
- רק מי שמחובר ל-Vercel עם הרשאה לפרויקט (דניאל) רואה את האתר. אחרים מקבלים מסך כניסה של Vercel.
- בדיקה בלי דפדפן (צריך לקבל 401 / הפניה ל-vercel.com, לא HTML של האתר):
  ```bash
  curl -sI https://<הכתובת>/ | head -5
  curl -s https://<הכתובת>/api/health   # לא אמור להחזיר JSON כשלא מחוברים
  ```
- אחרי כניסה: `/api/health` מחזיר `"mode": "demo-supabase"` (או `demo-memory`) ו-`"checks": { "env": "demo" }`.

## 4. ה-deploy עצמו

- הפרויקט ב-Vercel: framework Next.js, region `fra1` (`vercel.json`), Node 22.
- ה-build הוא `pnpm build` הרגיל. אין שלב מיוחד להדגמה — הכול לפי המשתנים.
- Fluid compute (ברירת המחדל) מתאים: Supabase דרך HTTPS, בלי חיבורי Postgres פתוחים.
- מקומית, אותו דבר כמו ב-Vercel:
  ```bash
  pnpm build
  DEMO_MODE=1 TOKEN_ENC_KEY=$(openssl rand -base64 32) pnpm start
  pnpm e2e:demo   # build + שני שרתי production (שני "instances") + e2e/demo.spec.ts
  ```

## 5. מה לבדוק אחרי deploy

1. בלי כניסה ל-Vercel — מסך כניסה של Vercel (§3).
2. אחרי כניסה: הפס למעלה בכל עמוד; `curl -sI` (עם עוגיית הכניסה, או מהדפדפן ב-DevTools) מראה `x-robots-tag: noindex, nofollow`.
3. `/` → "בואו נתחיל" → מייל → `123456` → חיבור Microsoft → `/start/ready?connected=microsoft` ("Outlook מחובר") → "חיבור לוואטסאפ" פותח את החלון → `/account` מציג את המייל ואת החיבור.
4. `/login` → מייל → `123456` → `/account`.

## 6. הדגמה בלי Supabase (זיכרון בלבד)

אפשר, אבל כל instance של Vercel מחזיק זיכרון משלו:
- מזהה המשתמש נגזר מהמייל (HMAC עם `TOKEN_ENC_KEY`), כך שכל ה-instances נותנים לאותו אדם אותו מזהה.
- ה-session כולל את המייל (חתום). instance שלא מכיר את המשתמש יוצר אותו מחדש מה-session, כך ש-`/account`, `/start/ready` ו-`/pay` עובדים בכל instance.
- מה שלא עובר בין instances: חיבורים, מנוי, מספרי וואטסאפ. אם Vercel מחליף instance באמצע הגלישה, הם "נעלמים". לכן ההמלצה: Supabase (§2).

## 7. חיבור הרכיבים (למי שעובד על המסכים)

- **מסך "מוכנה" (`components/auth/ready-step.tsx`) חייב לעטוף את כפתור הוואטסאפ ב-`DemoWaGate`:**
  ```tsx
  import { DemoWaGate } from "@/components/demo/DemoWaGate";
  <DemoWaGate href={waHref}>
    <Cta href={waHref} external tone="honey" block>…חיבור לוואטסאפ</Cta>
  </DemoWaGate>
  ```
  `DemoWaGate` הוא רכיב שרת שקורא את `DEMO_MODE` בזמן הבקשה (הדף כבר מחכה ל-`connection()`) ומעביר אותו כ-prop ל-`DemoWaDialog` (רכיב לקוח). מחוץ להדגמה הכפתור נשאר כמו שהוא. רכיב לקוח שרוצה את אותו חלון: `<DemoWaDialog href={waHref} enabled={isDemo}>` עם `isDemo` שהגיע מהשרת.
- קוד ה-QR באותו מסך מקודד את אותו קישור wa.me — בהדגמה כדאי להסתיר אותו או לעטוף גם אותו, כי סריקה בטלפון פותחת וואטסאפ אמיתי (למספר הדמה).
- הערת ההדגמה בכרטיסי הקוד (`/start/code`, `/login/code`): `demoNote={<DemoCodeNoteLive atBuild={isDemo()} />}` (`components/demo/demo-flag.tsx`). הערך של השרת הרץ מגיע מהפס העליון (`DemoBar` → `DemoFlag`) פעם אחת לכל טעינת דף, כך שההערה מצוירת יחד עם הכרטיס — גם כשה-build נעשה בלי `DEMO_MODE` (§4). לא לעטוף אותה ב-`<Suspense>` שנטען אחרי הכרטיס: תוכן שמגיע אחרי השלב מקפיץ אותו.
- הגעה ל-`/pay` מהאזור האישי: `payLinkFor(appUrl, user.id)` (`lib/billing/pay-link.ts`).

## 8. המעבר למצב האמיתי

1. **לנקות את נתוני ההדגמה** מ-Supabase (אם אותו פרויקט ימשיך ל-production): חיבורי ה-fixture, מנויים ותשלומים מה-HYP המדומה (עם "כרטיס" `0000000000000000000` — חיוב חודשי אמיתי ינסה לחייב אותו). ב-SQL Editor:
   ```sql
   delete from public.users;      -- cascade: חיבורים, מנויים, תשלומים, הודעות, תזכורות, jobs, audit
   delete from public.auth_otps;
   ```
   או פרויקט Supabase נפרד ל-production (מומלץ), ואז להריץ עליו את `supabase/migrations/*`.
2. ב-Vercel: למחוק את `DEMO_MODE` (או `0`), ולהוסיף את כל המשתנים לפי `.env.example`: `WA_*` + `META_APP_SECRET`, `MS_*`, `GOOGLE_*`, `ANTHROPIC_API_KEY`, `SONIOX_API_KEY`, `OPENROUTER_API_KEY`, `HYP_*`, `QSTASH_*`, `RESEND_API_KEY`. את `TOKEN_ENC_KEY` להשאיר (או לייצר חדש אם הנתונים נוקו — לא שניהם באמצע).
3. Redeploy. `/api/health` → `"mode": "supabase"`, `"checks": { "env": "ok" }`. אם חסר משהו — הודעה בעברית עם שמות המשתנים.
4. כתובות חזרה אצל הספקים: Meta webhook (`/api/wa/webhook`), HYP (`/api/pay/return`), Microsoft (`/api/auth/microsoft/callback`), Google (`/api/auth/google/callback`, `docs/google-setup.md`).
5. הפס, הערת הקוד, החלון ו-noindex נעלמים לבד. Deployment Protection — להחליט מחדש (אתר שיווקי ציבורי צריך כתובת ציבורית).
