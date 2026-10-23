# חיבור Microsoft 365 - הרשאות (עודכן 23.10.2026)

> הקוד: `lib/ms/oauth.ts` (`MS_SCOPES`, `MS_ADMIN_SCOPES`), `lib/ms/token-store.ts`, `app/api/auth/microsoft/**`, הכלים `lib/ms/tools.ts` ו-`lib/ms/workspace-tools.ts`. הסטטוס לכל שירות באזור האישי: `lib/connections/services.ts`.
> רקע ומקורות: `docs/research/connectors-israel.md` §3.

## 1. מה מבוקש

| הרשאה (delegated) | בשביל מה | שירות באזור האישי |
|---|---|---|
| `openid`, `profile`, `email`, `offline_access`, `User.Read` | זיהוי החשבון, וחיבור שנשאר פעיל | - |
| `Mail.ReadWrite`, `Mail.Send` | קריאה, חיפוש וטיוטות; שליחה אחרי אישור בכפתור | Outlook |
| `Calendars.ReadWrite` | הצגה, קביעה, הזזה וביטול של פגישות (קישורי Teams באירוע - באותה הרשאה) | יומן Outlook |
| `Files.Read.All` | חיפוש וקריאה של קבצים ב-OneDrive **ובספריות המסמכים של SharePoint** (Word, Excel, PowerPoint, PDF) | OneDrive, קבצי Word, Excel ו-PowerPoint |
| `Tasks.ReadWrite` **(חדש)** | Microsoft To Do: הצגת משימות פתוחות והוספת משימה לרשימה הראשית | Microsoft To Do |
| `Sites.Read.All` **(חדש)** | חיפוש אתרי SharePoint ורשימות (קריאה בלבד) | SharePoint |

`Chat.Read` (צ'אטים של Teams) **לא** מבוקש בשלב הזה.

## 2. מה דניאל לוחץ ב-Entra

1. https://entra.microsoft.com → **Identity → Applications → App registrations** → האפליקציה של עלזה.
2. **API permissions → Add a permission → Microsoft Graph → Delegated permissions** → לחפש ולסמן **Tasks.ReadWrite** ו-**Sites.Read.All** → **Add permissions**.
3. אופציונלי, ל-tenant של דניאל בלבד: **Grant admin consent for <הארגון>** (כך החשבון של דניאל לא יתבקש לאשר שוב).
4. אין צורך בסוד חדש, ב-Redirect URI חדש או במשתנה סביבה חדש.

הקוד מבקש את ההרשאות בזמן ריצה (v2, dynamic consent), כך שהחיבור עובד גם לפני סעיף 2. הרישום ב-API permissions הוא מה שמנהל IT רואה כשהוא בודק את האפליקציה, ומה ש-Publisher verification מציג - ולכן כדאי שיתאים.

## 3. אישור מנהל (admin consent)

- במדיניות ההסכמה ש-Microsoft מנהלת (ברירת המחדל ב-tenant חדש) משתמש רגיל **לא יכול** לאשר בעצמו את `Mail.*`, `Calendars.*`, `Files.Read.All`, `Sites.Read.All` ו-`Tasks.*` - גם כשבטבלת ההרשאות כתוב "Admin consent required: No". ברוב העסקים יופיע מסך "צריך אישור מנהל".
- הזרימה הקיימת מכסה את זה: ה-callback מזהה `AADSTS65001` / `consent_required`, שולח בוואטסאפ טקסט להעביר למנהל ה-IT (`err.admin_consent_needed`) עם קישור `/api/auth/microsoft/start?admin=1`. קישור האישור הזה (`buildAdminConsentUrl`) מבקש את **כל** `MS_ADMIN_SCOPES`, כולל `Tasks.ReadWrite` ו-`Sites.Read.All` - מנהל מאשר פעם אחת לכל הארגון.
- בעסק קטן בעל העסק הוא בדרך כלל ה-Global Admin, ואז הוא מאשר בעצמו במסך של Microsoft ("Consent on behalf of your organization").

## 4. חיבורים קיימים

- חיבור שנוצר לפני 23.10.2026 ממשיך לעבוד: הרענון של הטוקן מבקש **רק את ההרשאות שהחיבור קיבל** (`msRefreshScopes`). בקשת רענון עם הרשאה שלא אושרה הייתה נכשלת ב-`AADSTS65001` ומסמנת את החיבור "פג תוקף".
- באזור האישי Microsoft To Do ו-SharePoint מסומנים "צריך אישור נוסף"; הלחיצה היא החיבור הרגיל (ל-Microsoft אין הסכמה מצטברת), שמבקש את כל הרשימה מחדש. בשיחה הכלים `todo_*` ו-`sharepoint_search` (חיפוש אתרים) מחזירים את אותו קישור (`s.todo.consent`, `s.sharepoint.consent` ב-`docs/copy/bot-copy-services.md`).
- חיבור בלי רשימת הרשאות שמורה נחשב כמו הרשימה הישנה (`MS_SCOPES_V1`).
