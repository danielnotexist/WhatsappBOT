# הקמת חיבור Google (אבן דרך 6) — מדריך לדניאל

> עודכן 21.10.2026. הפרמטרים והמגבלות נבדקו מול developers.google.com ו-support.google.com באותו יום.
> הקוד: `lib/google/**`, `app/api/auth/google/**`. משתני סביבה: `.env.example` (קטע Google).

## 0. מה מקבלים בשלב 1 (בלי CASA)

| יכולת | scope | סיווג אצל Google | מה זה דורש |
|---|---|---|---|
| זיהוי החשבון | `openid`, `email`, `profile` | לא רגיש | כלום |
| יומן: הצגה, חלונות פנויים, קביעה, הזזה, ביטול | `https://www.googleapis.com/auth/calendar.events` | **רגיש** | אימות אפליקציה (סעיף 5) |
| Drive: רק קבצים שנוצרו/נפתחו דרכנו | `https://www.googleapis.com/auth/drive.file` | לא רגיש | כלום |
| שליחת מייל מ-Gmail (אחרי כפתור אישור) | `https://www.googleapis.com/auth/gmail.send` | **רגיש** | אימות אפליקציה (סעיף 5) |
| קריאת Gmail | `https://www.googleapis.com/auth/gmail.readonly` | **מוגבל (restricted)** | CASA (סעיף 6) — כבוי ב-`GOOGLE_GMAIL_READ_ENABLED=false` |

- בחרנו `calendar.events` ולא `calendar` המלא (צר יותר: אירועים בלבד, בלי שיתוף/מחיקת יומנים). "חלונות פנויים" מחושבים מרשימת האירועים, לכן לא צריך `calendar.readonly` / `calendar.freebusy`.
- **לתקן במסמך הגילוי** `docs/legal/oauth-consent-screen-he.md` §3: שם כתוב `calendar` — הקוד מבקש `calendar.events`. הרשימה במסך שלנו חייבת להיות זהה למה שמבוקש בפועל.

## 1. פרויקט ב-Google Cloud

1. https://console.cloud.google.com → בורר הפרויקטים למעלה → **New project**. שם: שם המוצר (אפשר לשנות אחר כך). אם יש ארגון Workspace לעסק — לפתוח תחתיו.
2. **APIs & Services → Library** → להפעיל: **Google Calendar API**, **Google Drive API**, **Gmail API**. (בשלב 2 גם **Google Picker API**.)
3. חיוב (Billing) לא נדרש ל-APIs האלה במכסות שלנו.

## 2. מסך ההסכמה (Google Auth Platform)

ב-Console: **Google Auth Platform** (לשעבר "OAuth consent screen"):
1. **Branding** — שם האפליקציה (**עלזה** — `BRAND.name` ב-`lib/brand.ts`; שינוי אחרי אימות מחייב אימות מחדש), מייל תמיכה, לוגו (120×120), **Application home page**, **Privacy policy**, **Terms of service**, ו-**Authorized domains** (הדומיין של האתר). דף הבית ומדיניות הפרטיות חייבים להיות **באותו דומיין**, ציבוריים, ומדיניות הפרטיות חייבת לכלול את משפט ה-Limited Use (נוסח ב-`docs/legal/oauth-consent-screen-he.md` §3).
2. **Audience** — User type: **External**. Publishing status מתחיל ב-**Testing**.
3. **Data access** → Add or remove scopes → לסמן את שישת ה-scopes מהטבלה (בלי `gmail.readonly`).
4. **Clients** → Create client → Application type: **Web application**:
   - Authorized redirect URIs: `https://<הדומיין>/api/auth/google/callback` וגם `http://localhost:3000/api/auth/google/callback` לפיתוח. חייב להתאים בדיוק (כולל https וסלאש).
   - Authorized JavaScript origins: הדומיין (נדרש רק ל-Picker בשלב 2).
   - את **Client ID** ו-**Client secret** מעתיקים ל-Vercel: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` (Production + Preview). את ה-secret כדאי לשמור מיד במנהל סיסמאות — במסכים החדשים הוא לא תמיד מוצג שוב.

## 3. מצב Testing — מה המגבלות

- עד **100 משתמשי בדיקה** (Audience → Test users). רק הם יכולים להתחבר.
- כל משתמש רואה מסך אזהרה "Google hasn't verified this app" (להסביר ללקוחות הראשונים — "Advanced → Go to …").
- **ההרשאה פגה אחרי 7 ימים** מרגע האישור (גם ה-refresh token). אצלנו זה נראה כך: אחרי שבוע Google מחזירה `invalid_grant`, החיבור מסומן `expired`, ובפעם הבאה שהמשתמש מבקש משהו מהיומן/Drive הבוט שולח קישור חידוש (`err.connection_expired`) — לחיצה אחת ומאשרים שוב.
- החריגה היחידה: אפליקציה שמבקשת רק `openid/email/profile` — לא רלוונטי לנו.

## 4. בדיקה מקומית בלי פרויקט אמיתי

`DATA_MODE=memory pnpm dev` — זרימת ה-OAuth, היומן, Drive ו-Gmail רצים מול fixtures (`lib/google/__fixtures__/google-fixtures.ts`), בלי קריאה ל-Google. עם פרויקט אמיתי: להוסיף את עצמך כמשתמש בדיקה, להגדיר את שני המשתנים ו-`APP_URL`, ולפתוח `/api/auth/google/start` כשמחוברים לאתר (או קישור `?t=` מהשיחה: "לחבר את גוגל").

## 5. מעבר ל-Production ואימות ה-scopes הרגישים (calendar.events, gmail.send)

לפני שפותחים ללקוחות מעבר ל-100 משתמשי בדיקה. בדרך כלל 3–5 ימי עבודה (+2–3 ימים לאימות מיתוג), ולפעמים סבב שאלות במייל מצוות Trust & Safety.
1. **אימות דומיין** ב-Google Search Console (https://search.google.com/search-console) עם חשבון שהוא Owner/Editor בפרויקט.
2. **Branding → Verify branding** — בדיקה אוטומטית (דקות). את התוצאה מפרסמים תוך 7 ימים, אחרת צריך לאמת שוב.
3. **Audience → Publish app** (מעבר ל-In production).
4. **Verification Center** → מצהירים על כל ה-scopes, ולכל scope רגיש:
   - **הצדקה** (באנגלית), כולל למה scope צר יותר לא מספיק. טיוטה:
     - `calendar.events`: "Users ask the WhatsApp assistant to list today's meetings, find free time, and create, move or cancel events. Every write is shown as a draft and executed only after the user taps Approve. We do not need calendar sharing or calendar management, so we use calendar.events instead of calendar."
     - `gmail.send`: "Users dictate an email in WhatsApp; the assistant drafts it and sends it from the user's Gmail only after the user taps Send. We never read the mailbox (no read scope requested)."
   - **סרטון הדגמה** ביוטיוב (Unlisted): זרימת ההסכמה **באנגלית** (שפת הדפדפן אנגלית), מסך ההסכמה עם שם האפליקציה, **שורת הכתובת עם ה-client_id** בזמן ההפניה ל-Google, ואז שימוש בכל scope: בקשה בוואטסאפ → טיוטה → לחיצה על אישור → האירוע ביומן / המייל ב-Sent. אפשר כתוביות באנגלית לשיחה בעברית.
   - עד 3 קישורים לתיעוד (דף בית, מדיניות פרטיות, דף "איך זה עובד").
5. מסמך הגילוי שלנו (לפני ההפניה) צריך להופיע באתר כמו שהוא מוצג בסרטון.

## 6. קריאת Gmail — מסלול CASA (שלב מאוחר יותר)

- `gmail.readonly` (וגם `gmail.modify`, `gmail.compose`, `gmail.metadata`) הם **restricted**. מעבר לאימות של סעיף 5 צריך:
  1. להוכיח שהשימוש הוא מסוג מותר לפי מדיניות Gmail API / Limited Use (עוזרת אישית שמסכמת את התיבה למשתמש עצמו — מותר; בלי פרסום, בלי אימון מודלים, בלי קריאה אנושית אלא בהסכמה/אבטחה/חוק).
  2. **הערכת אבטחה CASA** (App Defense Alliance) אצל מעבדה מורשית של Google — בדרך כלל Tier 2 לאפליקציה כמו שלנו. עלות משוערת לפי PLAN: ~$550–720 לשנה; לוח זמנים: שבועות.
  3. **חידוש כל 12 חודשים** מתאריך מכתב ההערכה (LOA). Google שולחת תזכורת — לשמור אנשי קשר מעודכנים בפרויקט.
- בקוד הכול מוכן: `?feature=gmail_read` על `/api/auth/google/start` מבקש רק את ה-scope החדש עם `include_granted_scopes=true` (הסכמה מצטברת — לא צריך לאשר מחדש את היומן/Drive). כל עוד `GOOGLE_GMAIL_READ_ENABLED=false` הנתיב מחזיר 403 בעברית, והבוט עונה למבקשים לקרוא Gmail שהיכולת עוד לא זמינה.
- **סדר הפעלה:** CASA עבר → להוסיף את `gmail.readonly` ב-Data access → אימות restricted scope ב-Verification Center → `GOOGLE_GMAIL_READ_ENABLED=true` ב-Vercel → לכתוב את כלי הקריאה (search/get) ב-`lib/google/` בדומה ל-`lib/ms/tools.ts`.

## 7. לקוחות עם Google Workspace

- מנהל Workspace יכול לחסום אפליקציות חיצוניות. אז Google מחזירה `admin_policy_enforced` והמשתמש רואה אצלנו הסבר (`g.web.admin_blocked`).
- מה המנהל עושה: Admin console → **Security → Access and data control → API controls → Manage Third-Party App Access → Configure new app** → מחפש לפי ה-Client ID → **Trusted**.

## 8. Google Picker (שלב 2 — עוד לא בנוי)

`drive.file` רואה רק קבצים שנוצרו דרכנו או שהמשתמש בחר. כדי לבחור קבצים קיימים צריך את ה-Picker (JavaScript בדפדפן). יידרשו: הפעלת Google Picker API, **API key** מוגבל ל-Picker API ול-HTTP referrer של הדומיין, ה-**Project number** (App ID), Authorized JavaScript origins, והוספת `apis.google.com` / `docs.google.com` ל-CSP ב-`proxy.ts`. פירוט טכני: TODO ב-`lib/google/client.ts`.

## 9. ניתוק ומחיקה

ניתוק מהאזור האישי ומחיקת חשבון קוראים ל-`https://oauth2.googleapis.com/revoke` עם ה-refresh token לפני מחיקת הטוקנים אצלנו (נרשם ב-audit_log). המשתמש יכול גם לנתק בעצמו ב-https://myaccount.google.com/permissions — ואז בפעם הבאה הבוט יקבל `invalid_grant` ויציע חיבור מחדש.
