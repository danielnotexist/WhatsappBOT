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

## 5. סיכומי פגישות Teams (פרו, עודכן 23.10.2026)

> הקוד: `MS_MEETING_SCOPES` / `msScopesFor` / `msAdminScopesFor` ב-`lib/ms/oauth.ts`, `app/api/auth/microsoft/{start,callback}`, `lib/meetings/find.ts` (`teamsTranscript`), `lib/meetings/jobs.ts`. הטקסטים: `docs/copy/bot-copy-meetings.md`.

| הרשאה (delegated) | בשביל מה | אישור מנהל |
|---|---|---|
| `OnlineMeetings.Read` **(חדש, פרו)** | מציאת הפגישה המקוונת לפי קישור ההצטרפות של האירוע ביומן (`GET /me/onlineMeetings?$filter=JoinWebUrl eq '…'`) | לא נדרש לפי הטבלה של Microsoft (אבל ראו סעיף 3 על מדיניות ברירת המחדל) |
| `OnlineMeetingTranscript.Read.All` **(חדש, פרו)** | קריאת התמליל ש-Teams שמרה (`/onlineMeetings/{id}/transcripts` ו-`…/content?$format=text/vtt`) | **תמיד נדרש** |

- **רק בחיבור של משתמש פרו**: נתיב ה-start בודק את המסלול (`entitlements(plan).meetingSummaries`) ומוסיף את שתי ההרשאות גם לבקשת המשתמש וגם לקישור אישור המנהל (`?admin=1`). בסיסי ותקופת הניסיון מבקשים את הרשימה הרגילה בלבד.
- **כשרק ההרשאה הזו דורשת מנהל**: בארגון שבו משתמשים מאשרים בעצמם את שאר ההרשאות, `OnlineMeetingTranscript.Read.All` לבדה הייתה חוסמת את כל החיבור. לכן, כשחיבור פרו חוזר עם `consent_required` / `AADSTS65001` או עם `access_denied` / `AADSTS65004` (במסך "Need admin approval" לוחצים "Return to the application without granting consent"), ה-callback מבקש מ-Microsoft מחדש **בלי** שתי ההרשאות (state ו-PKCE חדשים), החיבור הרגיל מושלם, ונרשם `profile.ms_meetings_consent = "admin_required"`. כשמבקשים אחר כך סיכום של פגישת Teams, עלזה שולחת את קישור אישור המנהל (`mt.consent.teams_admin`). חיבור שני שנכשל כבר לא מנסה שוב (אין לולאה).
- **מסך שאין ממנו חזרה**: אם מנהל ה-IT כיבה את הקישור "Return to the application", המשתמש נשאר במסך של Microsoft. במקרה כזה צריך אישור מנהל לפני החיבור (`?admin=1`), כמו בכל שאר ההרשאות בסעיף 3.
- **חיבור קיים בלי ההרשאות**: הסיכום האוטומטי לא מתוזמן לפגישות Teams שלו (אין קריאות מיותרות ל-Graph), וכשמבקשים סיכום — קישור חיבור מחדש (`mt.consent.teams`). הרענון ממשיך לבקש רק את מה שהחיבור קיבל.
- **מי יכול לקרוא תמליל**: Graph מחזיר תמלילים בעיקר למארגן הפגישה. למשתתף שאינו המארגן (או בפגישה של ארגון אחר) התשובה היא 403/404, ועלזה עונה "אין לי גישה לתמליל" (`mt.no_access`) — רק כשביקשו.
- **התמליל עצמו**: נוצר רק כשמישהו בפגישה לחץ "Start transcription" (או שמדיניות הארגון מפעילה תמלול אוטומטי). בלי זה אין מה לסכם, והסיכום האוטומטי מוותר בשקט.

### מה דניאל לוחץ ב-Entra (פעם אחת)

1. https://entra.microsoft.com → **Identity → Applications → App registrations** → האפליקציה של עלזה.
2. **API permissions → Add a permission → Microsoft Graph → Delegated permissions** → לחפש ולסמן **OnlineMeetings.Read** ו-**OnlineMeetingTranscript.Read.All** → **Add permissions**.
3. ל-tenant של דניאל (בדיקה): **Grant admin consent for <הארגון>** — אחרת Teams של דניאל עצמו לא יסוכם עד שיאשר כמנהל.
4. בדיקה: חשבון פרו, פגישת Teams עם "Start transcription", ואחרי 10–20 דקות מהסוף הסיכום מגיע בוואטסאפ (או "סיכום של הפגישה האחרונה").
5. אין סוד חדש, Redirect URI חדש או משתנה סביבה חדש. **אין** צורך בהרשאות application (כמו `OnlineMeetingTranscript.Read.All` ברמת האפליקציה או application access policy) — הכול delegated, בשם המשתמש.

### Zoom

לא נתמך בשלב הזה ("בקרוב" במחירון): תמלילי ענן של Zoom דורשים אפליקציית OAuth ב-Zoom Marketplace שעוברת את הבדיקה של Zoom (scopes `cloud_recording:read`), ואצל המשתמש מנוי Zoom בתשלום עם הקלטה לענן. לא נבנה שלד בלי זה.

## 6. "המשך עם Microsoft" - כניסה והרשמה (28.10.2026)

> הקוד: `lib/auth/sso.ts` (הכללים), `lib/auth/sso-flow.ts`, `lib/ms/sso.ts`, `lib/ms/connect-store.ts`, `app/api/auth/microsoft/{start,callback}` (`?intent=signin`). בדיקות: `lib/auth/sso.test.ts`, `app/api/auth/sso-routes.test.ts`, `e2e/sso-transitions.spec.ts`.

הכפתור ב-`/start` וב-`/login` נכנס (או נרשם) עם חשבון Microsoft, ובאותו מסך הסכמה מחבר גם את המייל, היומן והקבצים. אותו Redirect URI (`/api/auth/microsoft/callback`), אותן הרשאות (`msScopesFor()` - הבסיס, בלי Teams של פרו), אותו סוד. ה-state וה-PKCE נשמרים בעוגייה מוצפנת בדפדפן (`wb_sso`, 15 דקות, רק ל-`/api/auth`), כי עוד אין משתמש לשמור עליו.

**מתי סומכים על כתובת המייל (מניעת nOAuth):**
- **חשבון אישי** (outlook.com, hotmail.com, live.com - ה-tenant `9188040d-6c67-4c5b-b112-36a304b66dad`): Microsoft מאמתת את הכתובת. נכנסים לחשבון קיים או נרשמים.
- **חשבון עבודה עם `xms_edov=true`**: בעל הדומיין אימת את כתובת ה-`email`. נכנסים לחשבון קיים או נרשמים.
- **כל השאר**: את ה-claim `email` מנהל ה-tenant יכול לכתוב כרצונו, ולכן לא משתמשים בו. משתמשים ב-`preferred_username` - **רק להרשמה חדשה**. אם כבר יש חשבון עם הכתובת הזו, לא נכנסים: נשלח קוד למייל ועוברים ל-`/login/code` עם הסבר. שום טוקן של Microsoft לא נשמר במקרה הזה.
- כל כניסה נרשמת ב-audit (`auth.sso`): הספק, ה-`tid` וה-`oid`, ובסיס האמון (`msa` / `xms_edov` / `unverified`).

### מה דניאל לוחץ ב-Entra (פעם אחת)

1. https://entra.microsoft.com → **Identity → Applications → App registrations** → האפליקציה של עלזה.
2. **Token configuration → Add optional claim → Token type: ID** → לסמן **email** ו-**xms_edov** → **Add**. אם מופיעה השאלה "Turn on the Microsoft Graph email permission" - לאשר.
3. **Authentication → Supported account types**: כדי שגם חשבונות אישיים (outlook.com) יוכלו להיכנס, צריך "Accounts in any organizational directory and personal Microsoft accounts". אם הרישום מוגבל לארגונים בלבד, חשבון אישי יקבל שגיאה מ-Microsoft והכניסה תחזור עם "הכניסה לא הושלמה".
4. אין סוד חדש, Redirect URI חדש או משתנה סביבה חדש.

בלי סעיף 2 הכניסה עדיין עובדת: חשבונות אישיים כרגיל, וחשבונות עבודה יכולים להירשם, אבל חשבון קיים של חשבון עבודה יקבל קוד במייל במקום כניסה ישירה.
