# הקמת חיבור Google (אבן דרך 6) — מדריך לדניאל

> עודכן 21.10.2026 (ערב: קריאת Gmail ל-100 המשתמשים הראשונים בלי CASA). **23.10.2026:** נוספו Google Tasks (`tasks`, רגיש) וקריאת כל ה-Drive (`drive.readonly`, מוגבל, באותה תקרה) — מה ללחוץ: סעיף 10. הפרמטרים והמגבלות נבדקו מול developers.google.com ו-support.google.com באותו יום — המקורות בסוף כל סעיף.
> הקוד: `lib/google/**` (תקרת המשתמשים: `lib/google/user-cap.ts`; קריאת Gmail: `lib/google/gmail.ts`, `lib/google/gmail-tools.ts`), `app/api/auth/google/**`. משתני סביבה: `.env.example` (קטע Google + "תפעול").

## 0. מה מקבלים עכשיו

| יכולת | scope | סיווג אצל Google | מה זה דורש |
|---|---|---|---|
| זיהוי החשבון | `openid`, `email`, `profile` | לא רגיש | כלום |
| יומן: הצגה, חלונות פנויים, קביעה, הזזה, ביטול | `https://www.googleapis.com/auth/calendar.events` | **רגיש** | אימות אפליקציה (סעיף 5). עד אז — נספר בתקרת 100 |
| Drive: רק קבצים שנוצרו/נפתחו דרכנו | `https://www.googleapis.com/auth/drive.file` | לא רגיש | כלום |
| שליחת מייל מ-Gmail (אחרי כפתור אישור) | `https://www.googleapis.com/auth/gmail.send` | **רגיש** | אימות אפליקציה (סעיף 5). עד אז — נספר בתקרת 100 |
| Google Tasks: הצגה והוספה של משימות (23.10.2026) | `https://www.googleapis.com/auth/tasks` | **רגיש** (לא מוגבל — אין CASA; לוודא בבורר ה-scopes, סעיף 10) | אימות אפליקציה (סעיף 5). עד אז — נספר בתקרת 100 |
| קריאת Gmail: חיפוש, מייל מלא, שרשור, "מחכים לתשובה", סיכום הבוקר | `https://www.googleapis.com/auth/gmail.readonly` | **מוגבל (restricted)** | בלי CASA: רק ל-100 המשתמשים הראשונים (אצלנו עד 95 — סעיף 6). אחר כך CASA או ספק מתווך |
| קריאת כל ה-Drive: חיפוש לפי שם ותוכן, קריאת Docs / Sheets / Slides קיימים (23.10.2026) | `https://www.googleapis.com/auth/drive.readonly` | **מוגבל (restricted)** | בדיוק כמו קריאת Gmail: אותה תקרה ואותו פנקס, מתג משלו `GOOGLE_DRIVE_READ_ENABLED` (סעיף 6) |

- `drive.file` נשאר: הוא מה שמאפשר לשמור מסמכים שעלזה יוצרת (`gdrive_save_doc`) גם בלי `drive.readonly`.
- חיבורים שנוצרו לפני 23.10.2026 אין להם `tasks`: באזור האישי Google Tasks מסומן "צריך אישור נוסף", והלחיצה מבקשת רק את `tasks` (`?feature=tasks`, הסכמה מצטברת). בשיחה הכלים `gtasks_*` שולחים את אותו קישור.
- בחרנו `calendar.events` ולא `calendar` המלא (צר יותר: אירועים בלבד, בלי שיתוף/מחיקת יומנים). "חלונות פנויים" מחושבים מרשימת האירועים, לכן לא צריך `calendar.readonly` / `calendar.freebusy`.
- מסמך הגילוי `docs/legal/oauth-consent-screen-he.md` §3 מציג בדיוק את מה שמבוקש בפועל, כולל `gmail.readonly` (עודכן 21.10).

## 1. פרויקט ב-Google Cloud

1. https://console.cloud.google.com → בורר הפרויקטים למעלה → **New project**. שם: שם המוצר (אפשר לשנות אחר כך). אם יש ארגון Workspace לעסק — לפתוח תחתיו.
2. **APIs & Services → Library** → להפעיל: **Google Calendar API**, **Google Drive API**, **Gmail API**, **Google Tasks API** (23.10.2026). (בשלב 2 גם **Google Picker API**.)
3. חיוב (Billing) לא נדרש ל-APIs האלה במכסות שלנו.

## 2. מסך ההסכמה (Google Auth Platform)

ב-Console: **Google Auth Platform** (לשעבר "OAuth consent screen"):
1. **Branding** — שם האפליקציה (**עלזה** — `BRAND.name` ב-`lib/brand.ts`; שינוי אחרי אימות מחייב אימות מחדש), מייל תמיכה, לוגו (120×120), **Application home page**, **Privacy policy**, **Terms of service**, ו-**Authorized domains** (הדומיין של האתר). דף הבית ומדיניות הפרטיות חייבים להיות **באותו דומיין**, ציבוריים, ומדיניות הפרטיות חייבת לכלול את משפט ה-Limited Use (נוסח ב-`docs/legal/oauth-consent-screen-he.md` §3).
2. **Audience** — User type: **External**. Publishing status מתחיל ב-**Testing** — ועוברים ל-**In production** לפני שמזמינים לקוחות (סעיף 3).
3. **Data access** → Add or remove scopes → לסמן את שבעת ה-scopes הבסיסיים מהטבלה (כולל `tasks`). את `gmail.readonly` ואת `drive.readonly` **לא** מסמנים בשלב הזה — ראו סעיף 6.4.
4. **Clients** → Create client → Application type: **Web application**:
   - Authorized redirect URIs: `https://<הדומיין>/api/auth/google/callback` וגם `http://localhost:3000/api/auth/google/callback` לפיתוח. חייב להתאים בדיוק (כולל https וסלאש).
   - Authorized JavaScript origins: הדומיין (נדרש רק ל-Picker בשלב 2).
   - את **Client ID** ו-**Client secret** מעתיקים ל-Vercel: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` (Production + Preview). את ה-secret כדאי לשמור מיד במנהל סיסמאות — במסכים החדשים הוא לא תמיד מוצג שוב.

## 3. Testing או Production — חייבים Production (לא מאומת)

| | **Testing** | **In production, לא מאומת** (מה שאנחנו צריכים) |
|---|---|---|
| מי יכול להתחבר | רק עד 100 "test users" שמוסיפים ידנית ב-Audience → Test users | כל מי שיש לו חשבון Google |
| תוקף ההרשאה | **פגה 7 ימים אחרי האישור** — כולל ה-refresh token (חוץ מאפליקציה שמבקשת רק name/email/profile) | **אין** תפוגת 7 ימים. ה-refresh token נשאר עד ניתוק, 6 חודשים בלי שימוש, או החלפת סיסמה (עם scopes של Gmail) |
| מסך "Google לא אימתה את האפליקציה" | כן | כן — כל עוד מבקשים scope רגיש/מוגבל שלא אושר |
| תקרה | 100 test users | **100 משתמשים חדשים לכל חיי הפרויקט**, בלי איפוס, לכל scope רגיש/מוגבל שלא אושר |

**למה לא Testing:** במצב Testing כל לקוח היה מקבל אצלנו כל שבוע `invalid_grant` → החיבור מסומן `expired` → הבוט שולח קישור חידוש (`err.connection_expired`). זה עובד, אבל זו חוויה גרועה ללקוח משלם — וסיכום הבוקר נעצר עד שהוא לוחץ.

**איך עוברים ל-Production (בדיוק):**
1. Google Auth Platform → **Audience** → Publishing status: Testing → **Publish app** → בחלון "Push to production?" → **Confirm**. לא צריך אימות כדי ללחוץ; Google רק מזהירה שהאפליקציה תוצג כלא מאומתת.
2. לוודא ש-**Branding** מלא (שם, לוגו, דף בית ומדיניות פרטיות באותו דומיין) — זה מה שהמשתמש רואה במסך האישור.
3. משתמשים שהתחברו בזמן Testing: ההרשאה שלהם עדיין תפוג ב-7 ימים מהאישור המקורי. אחרי שהיא פגה הבוט שולח להם קישור חידוש — אישור אחד מחדש ומשם זה תקף. (אפשר גם לבקש מהם לכתוב "לחבר את גוגל" מיד אחרי המעבר.)
4. מסך "לא מאומת" — Google מציגה "Google hasn't verified this app" / "Google לא אימתה את האפליקציה הזו". ממשיכים ב-**Advanced / מתקדם** ואז **Go to Alze (unsafe) / מעבר אל עלזה (לא בטוח)**. הבוט מקדים לכל קישור חיבור ל-Google שורה אחת: "גוגל תציג מסך 'אפליקציה לא מאומתת' — זה צפוי בשלב הזה, אפשר ללחוץ 'מתקדם' ואז 'המשך'." (`g.unverified_heads_up`, רק מול פרויקט אמיתי — לא ב-`DATA_MODE=memory` / הדגמה).
   - ⚠️ במסך האתר `/connect/google` (רכיב `components/auth/connect-transition.tsx`, מחוץ לתחום של הסבב הזה) השורה עוד לא מוצגת — משימה לבעלי ה-UI: להציג את `gcopy["g.unverified_heads_up"]()` מתחת ל"מעבירים אותך ל-Google…".

מקורות: developers.google.com/identity/protocols/oauth2 (Refresh token expiration — "Testing … is issued a refresh token expiring in 7 days"); support.google.com/cloud/answer/15549945 (Manage App Audience — "Authorizations by a test user will expire seven days from the time of consent"; production = "available to any user with a Google Account").

## 4. בדיקה מקומית בלי פרויקט אמיתי

`DATA_MODE=memory pnpm dev` — זרימת ה-OAuth, היומן, Drive, שליחת Gmail **וקריאת Gmail** רצים מול fixtures (`lib/google/__fixtures__/google-fixtures.ts` — תיבת דואר בדויה עם 8 מיילים, כולל ניסיון הזרקת הוראות). קריאת Gmail כבויה כברירת מחדל בלי `GOOGLE_CLIENT_ID`; כדי לנסות: `GOOGLE_GMAIL_READ_ENABLED=true`. עם פרויקט אמיתי: להגדיר את שני המשתנים ו-`APP_URL`, ולפתוח `/api/auth/google/start` כשמחוברים לאתר (או קישור `?t=` מהשיחה: "לחבר את גוגל").

## 5. אימות ה-scopes הרגישים (calendar.events, gmail.send) — להגיש לפני ~80 משתמשים

**למה דחוף:** עד שהאימות הזה מאושר, **כל** חיבור Google (גם בלי קריאת Gmail) נספר בתקרת ה-100. במשתמש ה-100 Google חוסמת חיבורים חדשים לגמרי. אחרי האישור — חיבור רגיל כבר לא נספר, ורק מי שמאשר `gmail.readonly` צורך מקום. בקוד: `GOOGLE_SENSITIVE_SCOPES_VERIFIED=true` ב-Vercel ביום שהאישור מגיע.

בדרך כלל 3–5 ימי עבודה (+2–3 ימים לאימות מיתוג), ולפעמים סבב שאלות במייל מצוות Trust & Safety.
1. **אימות דומיין** ב-Google Search Console (https://search.google.com/search-console) עם חשבון שהוא Owner/Editor בפרויקט.
2. **Branding → Verify branding** — בדיקה אוטומטית (דקות). את התוצאה מפרסמים תוך 7 ימים, אחרת צריך לאמת שוב.
3. האפליקציה כבר **In production** (סעיף 3) — אימות לא מתבצע לאפליקציה במצב Testing.
4. **Verification Center** → מצהירים על ה-scopes, ולכל scope רגיש:
   - **הצדקה** (באנגלית), כולל למה scope צר יותר לא מספיק. טיוטה:
     - `calendar.events`: "Users ask the WhatsApp assistant to list today's meetings, find free time, and create, move or cancel events. Every write is shown as a draft and executed only after the user taps Approve. We do not need calendar sharing or calendar management, so we use calendar.events instead of calendar."
     - `gmail.send`: "Users dictate an email in WhatsApp; the assistant drafts it and sends it from the user's Gmail only after the user taps Send."
     - `tasks`: "Users ask the WhatsApp assistant to list their open Google Tasks or to add a task ("add a task: call the bank by Thursday"). The assistant reads the user's task lists and inserts the task into the default list; it never deletes tasks. tasks.readonly is not enough because adding a task is the main use."
   - **סרטון הדגמה** ביוטיוב (Unlisted): זרימת ההסכמה **באנגלית** (שפת הדפדפן אנגלית), מסך ההסכמה עם שם האפליקציה, **שורת הכתובת עם ה-client_id** בזמן ההפניה ל-Google, ואז שימוש בכל scope: בקשה בוואטסאפ → טיוטה → לחיצה על אישור → האירוע ביומן / המייל ב-Sent. אפשר כתוביות באנגלית לשיחה בעברית.
   - עד 3 קישורים לתיעוד (דף בית, מדיניות פרטיות, דף "איך זה עובד").
5. מסמך הגילוי שלנו (לפני ההפניה) צריך להופיע באתר כמו שהוא מוצג בסרטון.

## 6. קריאת Gmail בלי CASA — 100 המשתמשים הראשונים

**החלטת דניאל, 21.10.2026:** פותחים קריאת Gmail עכשיו ל-100 המשתמשים הראשונים, בלי הערכת אבטחה. כשיש תנועה — CASA או ספק מתווך (Composio), ומשלמים על מה שצריך.

### 6.1 מה Google אומרת (נבדק 21.10.2026)
- אפליקציה שמבקשת scope רגיש/מוגבל שלא אושר מציגה מסך "לא מאומת" ומוגבלת ל-**"100 new users in total, after the app presents the unverified app screen"** (support.google.com/cloud/answer/7454865, טבלת המכסות).
- **"The user cap applies over the entire lifetime of the project, and it cannot be reset or changed."** (support.google.com/cloud/answer/13463817, answer/15549945). כשהתקרה נגמרת — "Google sign-in to be disabled" למשתמשים חדשים.
- התקרה **לא חלה** על scopes שאושרו (answer/15549945).
- **מי נספר:** Google סופרת משתמשים *שאישרו* — לא משתמשים פעילים. אין בתיעוד אמירה מפורשת על משתמש שביטל הרשאה, אבל הניסוח ("new users in total", "lifetime", "cannot be reset") אומר שביטול לא מחזיר מקום. אנחנו מניחים את המקרה השמרני: **מי שניתק או מחק חשבון ממשיך להיספר.**
- את הספירה של Google רואים ב-Console: Google Auth Platform → Audience → **OAuth user cap**.

### 6.2 מה הקוד עושה
- **פנקס הרשאות** (`google_scope_grants`, מיגרציה 0008): שורה לכל חשבון Google × scope שנספר (גיבוב sha256 של כתובת המייל, בלי מלח — הכתובת עצמה לא נשמרת, אבל מי שיודע אותה יכול לחשב את הגיבוב, ולכן זה מידע פסבדונימי). לא נמחק בניתוק ולא במחיקת חשבון. אחרי ניתוק השורה עדיין מקושרת למשתמש; רק מחיקת החשבון מנתקת את הקישור (`user_id` → null). מילוי ראשוני מחיבורי Google קיימים (כולל מנותקים) — הפונקציה `google_scope_grants_backfill()`, שהמיגרציה מריצה פעם אחת.
- **רישום מוקדם:** ה-callback רושם את מה ש-Google אישרה בפועל ברגע שהחשבון ידוע — לפני שמירת החיבור, כדי שתקלה מאוחרת יותר לא תשאיר הרשאה שנספרה מחוץ לפנקס. מקרים שבהם המשתמש אישר אבל החשבון לא ידוע (state שפג או לא מוכר, החלפת קוד שנכשלה, אין כתובת מייל) נרשמים בלוג `[google:user-cap] consent returned but not recorded` (ובחלקם audit), כדי שאפשר יהיה להשוות מול הספירה ב-Console.
- **מה נספר:** `gmail.readonly` תמיד; `calendar.events` / `gmail.send` כל עוד `GOOGLE_SENSITIVE_SCOPES_VERIFIED=false` (וגם אחרי — שורות שנרשמו לפני האימות נשארות בספירה, כי הן כבר צרכו מקום).
- **התקרה שלנו:** `GOOGLE_GMAIL_READ_CAP` (ברירת מחדל **95** — מרווח של 5 למשתמשים שנמצאים באותו רגע במסך של Google). חשבון שכבר נספר אף פעם לא "עולה" מקום נוסף, ולכן תמיד יכול לאשר שוב.
- **מתי מבקשים `gmail.readonly`:**
  1. בחיבור רגיל (האתר בהרשמה, "לחבר את גוגל", חיבור מחדש) — מצטרף לשישת ה-scopes הבסיסיים כל עוד יש מקום. אם המשתמש מוריד את הסימון במסך של Google — זו בחירה, לא תקלה: החיבור מצליח, והבוט אומר שאפשר לבקש בהמשך.
  2. **הסכמה מצטברת** כשמשתמש Google בלי ההרשאה שואל על התיבה ("מה חדש במייל?") — הכלי `gmail_read_status` מחזיר קישור `?feature=gmail_read` שמבקש **רק** את `gmail.readonly` עם `include_granted_scopes=true` (היומן ו-Drive לא מאושרים מחדש). אם המשתמש לא מסמן — הודעת "חלקי" עם קישור לנסות שוב.
- **כשהתקרה מלאה:** לא מבקשים `gmail.readonly` מחשבונות חדשים. החיבור עצמו ממשיך (יומן, Drive, שליחה). מי שמבקש לקרוא מיילים מקבל שורה אחת (`g.err.gmail_read_cap_reached`), וסיכום הבוקר שלו בלי "מיילים שמחכים לתשובה" מ-Gmail.
- **ה-callback לא סומך על רשימת ה-scopes בקישור:** הקישור ל-Google עובר דרך הדפדפן, ואפשר לערוך בו את `scope=`. לכן `gmail.readonly` שחזר מ-Google נשמר בחיבור רק כשהיכולת פעילה, ו(החשבון כבר נספר לפני האישור הזה, או שהבקשה כללה אותו). אם הבקשה כללה אותו רק כי חשבון *אחר* של המשתמש כבר נספר (`login_hint` הוא רק רמז), והמשתמש בחר במסך של Google חשבון חדש — נשמר רק כל עוד יש מקום. אחרת ה-scope מוסר מהחיבור (audit `google.gmail_read_not_kept`), והפנקס בכל זאת רושם את האישור, כי Google כבר ספרה אותו. ה-`login_hint` הוא תמיד החשבון שעליו הוחלט (גם של חיבור מנותק).
- **התראות למפעיל ב-80 וב-95** (פעם אחת לכל סף, דגל `google_user_cap:<סף>` בטבלת `ops_flags`): שורת לוג `[google:user-cap]`, רשומת audit `ops.google_user_cap`, ומייל ל-`OPERATOR_EMAIL` דרך Resend אם הוגדר. נבדק אחרי כל אישור חדש, וגם בבדיקה תקופתית (לכל היותר פעם בשעה לכל מופע) מתוך `/api/jobs/run` — כך שמילוי ראשוני שחוצה סף מתריע מיד, ולא רק בחיבור הבא.
- **כלי הקריאה** (רק לחיבור עם `gmail.readonly`, וכשהיכולת פעילה): `gmail_search_emails` (תחביר החיפוש של Gmail), `gmail_get_email` (גוף ההודעה כטקסט — text/plain או HTML מומר, עד 6,000 תווים; כשאין טקסט — גוף גדול מ-512KB או בלי חלק טקסט — התצוגה המקדימה של Gmail, מסומנת `body_is_preview`), `gmail_get_thread`, `gmail_awaiting_reply`. גוף ההודעה והתצוגה המקדימה עטופים כ-`<data>`; הנושא, שם השולח וכתובתו ושמות הקבצים הם שורה אחת מנוקה (בלי שורות חדשות, תווים נסתרים או תגיות `data`), וההערה `UNTRUSTED_MAIL_NOTE` שמצורפת לכל תוצאה אומרת שגם הם מידע בלבד (`lib/ai/untrusted.ts`). בסיכום הבוקר שולח ונושא הם שורה אחת מנוקה וקצרה — מייל לא יכול להוסיף "סעיף" משלו.

### 6.3 מה מגדירים ב-Vercel
| משתנה | ערך | הערה |
|---|---|---|
| `GOOGLE_GMAIL_READ_ENABLED` | ריק (או `true`) | ריק = פעיל כש-`GOOGLE_CLIENT_ID` מוגדר. `false` = מתג כיבוי מיידי לכולם: לא מבקשים ולא שומרים `gmail.readonly`, וגם מי שכבר אישר מפסיק לקרוא (כלי `gmail_*`, Gmail בסיכום הבוקר). ההרשאות נשארות אצל Google — החזרה ל-`true` מחזירה את הקריאה בלי אישור חדש (מי שהתחבר מחדש בזמן הכיבוי יתבקש לאשר שוב, בלי מקום חדש בתקרה) |
| `GOOGLE_DRIVE_READ_ENABLED` | ריק (או `true`) | אותם כללים כמו `GOOGLE_GMAIL_READ_ENABLED`, ל-`drive.readonly` (חיפוש בכל ה-Drive וקריאת Docs / Sheets / Slides). `false` = כבוי לכולם; Gmail לא מושפע |
| `GOOGLE_GMAIL_READ_CAP` | `95` | 1–100. התקרה היא לחשבון, לא ל-scope: חשבון שנספר יכול לקבל גם קריאת Gmail וגם קריאת Drive בלי מקום נוסף |
| `GOOGLE_SENSITIVE_SCOPES_VERIFIED` | `false` | `true` רק ביום שסעיף 5 מאושר |
| `OPERATOR_EMAIL` | כתובת של דניאל | אופציונלי; בלי — לוג + דגל בלבד |

**סדר פריסה:** מיגרציה 0008 ב-Supabase **לפני** הקוד (בלי הטבלה, בדיקת התקרה נכשלת והחיבור ממשיך בלי `gmail.readonly` — אף משתמש לא נחסם).

### 6.4 `gmail.readonly` ב-Data access — לא לסמן (עדיין)
- scope שמבוקש בזמן ריצה ולא מופיע ב-Data access מציג את מסך "לא מאומת" (answer/7454865) — זה בדיוק המצב שאנחנו מקבלים בכל מקרה, אז הקריאה עובדת.
- מה שמוצהר ב-Data access הוא מה שמוגש לאימות. אם `gmail.readonly` מוצהר, הגשת האימות של סעיף 5 תכלול scope מוגבל — כלומר CASA.
- **לא אומת:** לא מצאנו תיעוד שמאשר ש-Google תאשר את הרגישים כשהאפליקציה מבקשת בפועל גם `gmail.readonly` לא מוצהר. אם הבודקים יעירו על זה — האפשרויות: `GOOGLE_GMAIL_READ_ENABLED=false` לזמן הבדיקה (§6.3: האפליקציה מפסיקה לבקש ולקרוא את Gmail לכולם, כולל מי שכבר אישר; ההרשאות שלהם נשארות אצל Google, וכשמחזירים ל-`true` הקריאה חוזרת — בלי אישור חדש, חוץ ממי שהתחבר מחדש בזמן הכיבוי), או להתקדם ל-CASA.

### 6.5 אחרי 95 (לא עכשיו)
- **CASA** (App Defense Alliance) אצל מעבדה מורשית — בדרך כלל Tier 2. עלות משוערת לפי PLAN: ~$550–720 לשנה; שבועות; חידוש כל 12 חודשים מתאריך ה-LOA. אחרי CASA: להצהיר `gmail.readonly` ב-Data access → אימות restricted scope ב-Verification Center → אחרי האישור התקרה כבר לא חלה, ויידרש שינוי קטן בקוד (מתג שמדלג על בדיקת התקרה — `GOOGLE_GMAIL_READ_CAP` מוגבל ל-100 בכוונה).
- **ספק מתווך (Composio)** — הוא מחזיק את אפליקציית ה-OAuth המאומתת; אצלנו זה יהיה מימוש נוסף של אותם ארבעה כלים (`gmail_*`) מול ה-API שלו. דורש הערכת פרטיות (צד שלישי שרואה את התיבה) ועדכון מסמך הגילוי.

## 7. לקוחות עם Google Workspace

- מנהל Workspace יכול לחסום אפליקציות חיצוניות. אז Google מחזירה `admin_policy_enforced` והמשתמש רואה אצלנו הסבר (`g.web.admin_blocked`).
- מה המנהל עושה: Admin console → **Security → Access and data control → API controls → Manage Third-Party App Access → Configure new app** → מחפש לפי ה-Client ID → **Trusted**.

## 8. Google Picker (שלב 2 — עוד לא בנוי)

`drive.file` רואה רק קבצים שנוצרו דרכנו או שהמשתמש בחר. כדי לבחור קבצים קיימים צריך את ה-Picker (JavaScript בדפדפן). יידרשו: הפעלת Google Picker API, **API key** מוגבל ל-Picker API ול-HTTP referrer של הדומיין, ה-**Project number** (App ID), Authorized JavaScript origins, והוספת `apis.google.com` / `docs.google.com` ל-CSP ב-`proxy.ts`. פירוט טכני: TODO ב-`lib/google/client.ts`.

## 9. ניתוק ומחיקה

ניתוק מהאזור האישי ומחיקת חשבון קוראים ל-`https://oauth2.googleapis.com/revoke` עם ה-refresh token לפני מחיקת הטוקנים אצלנו (נרשם ב-audit_log). המשתמש יכול גם לנתק בעצמו ב-https://myaccount.google.com/permissions — ואז בפעם הבאה הבוט יקבל `invalid_grant` ויציע חיבור מחדש. **שימו לב:** הגיבוב של חשבון ה-Google בפנקס התקרה (`google_scope_grants`) נשאר גם אחרי ניתוק ומחיקה, כי Google ממשיכה לספור אותו (סעיף 6.1). אחרי ניתוק הוא עדיין מקושר לחשבון אצלנו; מחיקת החשבון מנתקת את הקישור. זה גיבוב פסבדונימי (מי שיודע את הכתובת יכול לחשב אותו) — כך זה מנוסח במדיניות הפרטיות §5 ובשאלות לעו"ד (מסמך הגילוי §5).

## 10. Google Tasks וקריאת Drive (23.10.2026) — מה ללחוץ

**בקשת דניאל:** אייקון לכל שירות מתחת לחשבון באזור האישי, והשירותים מחוברים באמת. בקוד: `lib/connections/services.ts` (הסטטוס לכל שירות), `lib/google/tasks-tools.ts`, `lib/google/consent.ts`, `lib/google/tools.ts`.

1. **Google Tasks API:** https://console.cloud.google.com → לבחור את הפרויקט → **APIs & Services → Library** → לחפש **Google Tasks API** → **Enable**. בלי זה כל קריאה ל-Tasks תחזיר 403 (accessNotConfigured), והבוט יענה "אין תגובה".
2. **ה-scope `tasks` במסך ההסכמה:** **Google Auth Platform → Data access → Add or remove scopes** → בתיבת הסינון לכתוב `tasks` → לסמן `.../auth/tasks` (Google Tasks API, "Create, edit, organize, and delete all your tasks") → **Update** → **Save**. לבדוק שהוא מופיע תחת **Your sensitive scopes** ולא תחת restricted (המחקר לא מצא סיווג רשמי — `docs/research/connectors-israel.md` §14).
3. **`drive.readonly` — לא מוסיפים ל-Data access**, בדיוק כמו `gmail.readonly` (סעיף 6.4): הוא מבוקש בזמן ריצה, תחת תקרת 100 המשתמשים של אפליקציה לא מאומתת. הצהרה עליו הייתה מכניסה scope מוגבל להגשת האימות של סעיף 5, כלומר CASA. Drive API כבר מופעל (סעיף 1).
4. **אימות הרגישים (סעיף 5):** להוסיף את `tasks` להגשה, עם ההצדקה שבסעיף 5 וקטע בסרטון ("תוסיפי משימה" בוואטסאפ ← המשימה מופיעה ב-Google Tasks). את `GOOGLE_SENSITIVE_SCOPES_VERIFIED=true` מגדירים רק אחרי ש-**שלושת** הרגישים אושרו (`calendar.events`, `gmail.send`, `tasks`) — אחרת חיבור חדש עדיין נספר בתקרה.
5. **Vercel:** `GOOGLE_DRIVE_READ_ENABLED` ריק (פעיל כשיש `GOOGLE_CLIENT_ID`) או `false` לכיבוי. אין מיגרציה חדשה: הפנקס (`google_scope_grants`, 0008) מקבל כל scope של Google.
6. **מסמך הגילוי** (`docs/legal/oauth-consent-screen-he.md` §3) עודכן ל-`tasks` ול-`drive.readonly` — לפרסם באתר לפני שהבקשה הזו יוצאת למשתמשים אמיתיים.

**מה המשתמש רואה:** חיבור חדש מבקש את `tasks` עם שאר הבסיס, ואת `gmail.readonly` + `drive.readonly` כל עוד יש מקום (אפשר להוריד את הסימון — זו בחירה, לא תקלה). באזור האישי: Gmail, יומן, Tasks, Drive, Docs, Sheets, Slides, כל אחד "מחובר" / "צריך אישור נוסף" (לחיצה = הסכמה מצטברת ל-scope החסר בלבד) / "לא זמין" (קריאת Drive כבויה או שהתקרה מלאה לחשבון חדש).
