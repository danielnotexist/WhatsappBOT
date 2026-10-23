# מחקר: מחברים נוספים לעלזה (שוק ישראלי)

**תאריך:** 23.10.2026 · **סטטוס:** מחקר רשת בלבד, ללא שינויי קוד · **בסיס קיים:** Microsoft 365 (Outlook, יומן, OneDrive/SharePoint דרך Graph), Google (Gmail, Calendar, Drive), HYP (מתוכנן).

**שיטה:** עמוד המחברים של readywhen (https://readywhen.ai/connectors) שימש רק כמפת קטגוריות. לא הועתק ממנו טקסט. כל טענה על עלות או זמינות מגובה בקישור. מה שלא אומת נאמר במפורש.

**סולם מאמץ:** S = עד יומיים · M = 3 עד 7 ימי עבודה · L = שבועיים ומעלה (כולל אישורים חיצוניים).

**"עלות לעלזה" לעומת "דרישת מסלול אצל הלקוח":** אצל רוב הספקים הישראליים מפתח ה-API שייך לעסק, לא לנו. לכן לעלזה אין עלות, אבל העסק צריך להיות במסלול שכולל API. ההבחנה מופיעה בכל טבלה.

---

## 1. תקציר מנהלים

**Tier 1 (לבצע ראשונים):**

| # | מחבר | למה עכשיו | מאמץ |
|---|---|---|---|
| 1 | **Microsoft To Do** (+ קריאת Planner) | אותו טוקן Graph. `Tasks.ReadWrite` בלי admin consent לפי טבלת ההרשאות. תזכורות ומשימות הן ליבת העוזרת. | S |
| 2 | **קישורי Teams ו-Meet בפגישות** (כבר מתוכנן) | `Calendars.ReadWrite` ו-`calendar.events`, שכבר נדרשים. אין הרשאה חדשה. | S |
| 3 | **Google Tasks + Google Contacts** | ה-scopes רגישים (sensitive) ולא מוגבלים (restricted), כך שאין צורך ב-CASA. כדאי לצרף אותם לבקשת האימות של Google שעוד לא הוגשה. | S |
| 4 | **מורנינג (חשבונית ירוקה)** | מעל 170,000 עסקים. API ב-REST עם מפתח ו-secret של העסק (מסלול Best ומעלה, 45 ₪ לחודש בחיוב שנתי). לעלזה אין עלות. | M |
| 5 | **iCount** | ה-API ניתן ללא תשלום לכל לקוח עם מנוי בסיסי. טוקן Bearer. | M |
| 6 | **כלים ישראליים בלי הרשאה:** Hebcal (חגים, ערבי חג, שבת), שער יציג של בנק ישראל, קישורי Waze | חינם, בלי מפתח ובלי OAuth. ערך יומיומי גבוה לקהל הישראלי. | S |
| 7 | **monday.com** | חברה ישראלית. ה-API חינמי בכל המסלולים, כולל החינמי. אפליקציית OAuth ניתנת להפצה בקישור התקנה בלי פרסום בחנות. | M |

**ממצא רוחבי קריטי (משפיע גם על החיבור הקיים):** במדיניות ההסכמה ש-Microsoft מנהלת, שהיא ברירת המחדל בכל tenant חדש, משתמש רגיל **אינו יכול** לאשר בעצמו את `Mail.*`, `Calendars.*`, `Chat.Read/ReadWrite`, `OnlineMeetings.*`, `Tasks.*`, `Contacts.ReadWrite`, `People.Read`, `Files.Read(Write).All` ו-`Sites.Read(Write).All`. זה תקף גם כשטבלת ההרשאות מציינת "AdminConsentRequired: No". לכן ברוב העסקים נדרש אישור מנהל, או תהליך בקשת אישור מנהל (admin consent workflow) ([Microsoft Learn: manage app consent policies](https://learn.microsoft.com/en-us/entra/identity/enterprise-apps/manage-app-consent-policies)). בעסק קטן בעל העסק הוא בדרך כלל ה-Global Admin, ולכן אפשר. **ההמלצה: לבקש את כל ה-scopes של Tier 1 בבקשת ה-admin consent הראשונה**, כדי לא לחזור למנהל בכל יכולת חדשה. זה מחזק את ההחלטה הקיימת ב-PLAN לבדוק "2 tenants (עם/בלי user consent)".

---

## 2. מפת קטגוריות (לפי readywhen, רק כמפה)

readywhen מחלקים ל-19 קטגוריות: Communication & Chat, Mail, Calendar & Meetings, Meeting Transcripts, Video Conferencing, Project & Task Management, Docs & Knowledge Base, Cloud Storage, CRM, Sales Engagement, Customer Support, Marketing & Analytics, Code, Design, HR, ATS, Finance & Operations, Data & Spreadsheets, Forms & Surveys ([readywhen.ai/connectors](https://readywhen.ai/connectors)).

**רלוונטי לקהל של עלזה (עו"ד, רו"ח, יועצים, קליניקות):** מייל, יומן ופגישות, משימות, מסמכים ואחסון, CRM קל, כספים וחשבוניות.
**חסר אצלם ורלוונטי לישראל:** חשבוניות ישראליות (מורנינג, iCount, SUMIT, EZcount), סליקה ישראלית, לוח שנה עברי וחגים, שער יציג.
**פחות רלוונטי לקהל שלנו:** Code, Design, ATS, Sales Engagement, Marketing Analytics.

---

## 3. Microsoft 365: תוספות על אותו חיבור OAuth

מקור ההרשאות: [Microsoft Graph permissions reference](https://learn.microsoft.com/en-us/graph/permissions-reference). עמודת "חסום בברירת המחדל" מבוססת על רשימת ההחרגות של המדיניות המנוהלת ([manage-app-consent-policies](https://learn.microsoft.com/en-us/entra/identity/enterprise-apps/manage-app-consent-policies)). מקור משני עם תאריכי ההרחבה: [Topedia](https://blog.topedia.com/2025/11/microsoft-managed-default-app-consent-policy-now-blocks-20-additional-permissions/), שלפיו Files/Sites באוגוסט 2025, Mail, Calendars, Chat ו-OnlineMeetings בנובמבר 2025, ו-Tasks, Contacts ו-People ביוני 2026.

| יכולת | הרשאה (delegated) | admin consent לפי טבלת ההרשאות | חסום ל-user consent במדיניות ברירת המחדל | מה עלזה עושה בוואטסאפ | מאמץ |
|---|---|---|---|---|---|
| **Teams: קישור פגישה באירוע** (מתוכנן) | `Calendars.ReadWrite`, אירוע עם `isOnlineMeeting=true` ([create event](https://learn.microsoft.com/en-us/graph/api/user-post-events?view=graph-rest-1.0)) | לא | **כן** | "קבעי פגישת Teams עם דנה מחר ב-10" ← אישור ← הזמנה עם קישור | S |
| Teams: פגישה עצמאית (בלי אירוע) | `OnlineMeetings.ReadWrite`. לא נתמך בחשבון Microsoft אישי ([create onlineMeeting](https://learn.microsoft.com/en-us/graph/api/application-post-onlinemeetings?view=graph-rest-1.0)) | לא | **כן** | "קישור Teams מיידי" | S |
| **Teams: קריאת צ'אטים** | `Chat.ReadBasic` / `Chat.Read`. לא נתמך בחשבון אישי ([list chats](https://learn.microsoft.com/en-us/graph/api/chat-list?view=graph-rest-1.0)) | לא | **כן** (`Chat.Read`/`ReadWrite`. `Chat.ReadBasic` לא ברשימה) | "מה פספסתי בצ'אטים היום?" או "סכמי את השיחה עם רון" | M |
| Teams: שליחת הודעה בצ'אט | `ChatMessage.Send` | לא | לא | "תכתבי לרון ב-Teams שאני מאחר" ← אישור | S |
| **Teams: קריאת הודעות ערוץ** | `ChannelMessage.Read.All` ([list channel messages](https://learn.microsoft.com/en-us/graph/api/channel-list-messages?view=graph-rest-1.0)) | **כן** | (לא רלוונטי, ממילא דורש מנהל) | "סיכום ערוץ 'לקוחות' מהשבוע" | M |
| Teams: רשימת צוותים וערוצים | `Team.ReadBasic.All`, `Channel.ReadBasic.All` | לא | לא | בחירת ערוץ לפי שם | S |
| Teams: תמלולי פגישות | `OnlineMeetingTranscript.Read.All` | **כן** | (דורש מנהל) | "סיכום הפגישה של אתמול ומשימות ממנה" | M |
| **Microsoft To Do** | `Tasks.Read` / `Tasks.ReadWrite`. **נתמך גם בחשבון אישי** ([todo lists](https://learn.microsoft.com/en-us/graph/api/todo-list-lists?view=graph-rest-1.0)) | לא | **כן** (יוני 2026) | "תוסיפי משימה: להחזיר לעו"ד כהן עד חמישי", "מה פתוח לי השבוע?", תזכורת בוואטסאפ ביום היעד | S |
| **Planner** | `Tasks.Read` / `Tasks.ReadWrite`. לא נתמך בחשבון אישי ([planner tasks](https://learn.microsoft.com/en-us/graph/api/planneruser-list-tasks?view=graph-rest-1.0)) | לא (`Group.Read.All` כן, אם נדרש לתוכניות של קבוצה) | **כן** | "מה המשימות שהוקצו לי ב-Planner?", "סמני כבוצע" | S–M |
| **SharePoint Lists** | `Sites.Read.All` / `Sites.ReadWrite.All` (delegated, ללא admin consent לפי הטבלה), או `Sites.Selected` (אתר ספציפי, מנהל מגדיר) | לא | **כן** (אוגוסט 2025) | "מה הסטטוס של תיק 123 ברשימת התיקים?", "תוסיפי שורה לרשימת לידים" | M |
| **OneNote** | `Notes.Create` / `Notes.ReadWrite` ([list notebooks](https://learn.microsoft.com/en-us/graph/api/onenote-list-notebooks?view=graph-rest-1.0)) | לא | לא | "תשמרי את הסיכום הזה במחברת 'פגישות'" | S–M |

**הערות:**
- **אימות מוציא לאור (publisher verification):** Microsoft ממליצה לארגונים לאפשר user consent רק לאפליקציות של מוציא לאור מאומת ([configure user consent](https://learn.microsoft.com/en-us/entra/identity/enterprise-apps/configure-user-consent)). זה מתוכנן כבר ב-PLAN.
- **Protected APIs:** לפי מקורות משניים, אישור "protected API" נדרש רק לגישה מסוג application לכל הודעות הצ'אט (למשל `getAllMessages`), ולא לגישה delegated של המשתמש עצמו ([Microsoft Q&A](https://learn.microsoft.com/en-us/answers/questions/702938/api-to-fetch-all-users-chat-messages-in-msteam)). לא אומת מול העמוד הרשמי העדכני, שהחזיר 404.
- **סיכון:** Planner וצ'אטים של Teams דורשים חשבון עבודה עם רישיון מתאים. To Do עובד גם ב-Outlook.com.

---

## 4. Google: תוספות על אותו חיבור OAuth

**סיווג ה-scopes:** Non-sensitive דורש אימות בסיסי. Sensitive דורש אימות אפליקציה (וידאו ומדיניות פרטיות), **בלי** CASA. Restricted דורש אימות restricted **ו-CASA שנתי** אם הנתונים נשמרים או עוברים בשרת ([Gmail scopes](https://developers.google.com/workspace/gmail/api/auth/scopes), [sensitive scope verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/sensitive-scope-verification)).

| יכולת | scope | סיווג | CASA? | מה עלזה עושה | מאמץ |
|---|---|---|---|---|---|
| **Meet בפגישה** (מתוכנן) | `calendar.events`, אירוע עם `conferenceData.createRequest` ו-`conferenceDataVersion=1` ([create events](https://developers.google.com/workspace/calendar/api/guides/create-events)) | **Sensitive** (בבורר ה-scopes של Cloud Console ([דיון בפורום Google](https://discuss.google.dev/t/oauth-verification-pending-since-22-apr-2026-first-trust-safety-email-never-received/392005)). Nylas: "Calendar and Contacts scopes are sensitive" ([Nylas](https://developer.nylas.com/docs/provider-guides/google/google-verification-security-assessment-guide/))) | לא | "קבעי פגישת Meet עם הלקוח" | S |
| **Google Tasks** | `tasks` / `tasks.readonly` ([Tasks scopes](https://developers.google.com/workspace/tasks/auth)) | **Sensitive, לא אומת סופית:** עמוד התיעוד לא מציג סיווג. ה-scope אינו ברשימות ה-restricted (Gmail, Drive רחב, הודעות Chat). לאמת בבורר ה-scopes של הפרויקט. | לא (בהנחה שהוא sensitive) | "תוסיפי משימה", "מה ברשימת המשימות?" | S |
| **Google Contacts** (People API) | `contacts` ליצירה ([createContact](https://developers.google.com/people/api/rest/v1/people/createContact)), `contacts.readonly` לחיפוש | **Sensitive.** Google מביאה את "storing a new contact in Google Contacts" כדוגמה ל-scope רגיש ([sensitive scope verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/sensitive-scope-verification)) | לא | "מה הטלפון של רו"ח לוי?", "תשמרי את המספר הזה כאיש קשר" | S |
| Google Chat: שליחת הודעה | `chat.messages.create` | Sensitive ([Chat scopes](https://developers.google.com/workspace/chat/authenticate-authorize)) | לא | שליחה לחלל Chat | M (דורש הגדרת Chat app, ב-Workspace בלבד) |
| Google Chat: קריאת הודעות | `chat.messages` / `chat.messages.readonly` | **Restricted** ([Chat scopes](https://developers.google.com/workspace/chat/authenticate-authorize)) | **כן** | סיכום חללים | L |
| Google Meet REST API (רשומות ותמלולים) | `meetings.space.readonly` הוא Sensitive. הורדת הקלטות ותמלולים (`drive.readonly`, `drive.meet.readonly`) היא **Restricted** ([Meet scopes](https://developers.google.com/workspace/meet/api/guides/authenticate-authorize)) | מעורב | כן לתמלולים | סיכום פגישה | L |
| Google Keep | ה-API מיועד ל"enterprise administrators" ב-Workspace, עם service account או אישור מנהל ([Keep API](https://developers.google.com/workspace/keep/api/guides)) | (לא רלוונטי) | (לא רלוונטי) | (לא רלוונטי) | **דילוג** |

**המלצה:** הוסיפו את `tasks` ואת `contacts` (או `contacts.readonly`) ל-OAuth consent screen **לפני** הגשת אימות ה-sensitive המתוכנן (PLAN, שלב 4 בהכנות). כך עוברים סבב אימות אחד. Google מבקשת scope מינימלי ([Requesting Minimum Scopes](https://support.google.com/cloud/answer/13807380?hl=en)), ולכן צריך להצדיק כל scope בתרחיש מוצר ממשי.

---

## 5. ניהול עבודה ומשימות

| מחבר | שימוש בישראל (ראיה) | API, OAuth ועלות | מה עלזה עושה | מאמץ | סיכונים |
|---|---|---|---|---|---|
| **monday.com** | חברה ישראלית. ישראל כ-5% מההכנסות ([Calcalist](https://www.calcalistech.com/ctechnews/article/h15lenent)), בבסיס של כ-245 אלף לקוחות בעולם. | GraphQL. "API service as a free feature across all plans". חינמי, Basic ו-Standard: 1,000 קריאות ביום ([rate limits](https://developer.monday.com/api-reference/docs/rate-limits)). OAuth 2.0 עם scopes מפורטים ([OAuth](https://developer.monday.com/apps/docs/oauth)). הפצה בקישור התקנה בלי החנות ([changelog](https://developer.monday.com/apps/changelog/installed-outside-the-marketplace)). התקנה דורשת משתמש עם הרשאת התקנה (לרוב admin). | "מה הסטטוס של הלקוח X בבורד?", "תעדכני את הפריט ל'הושלם'", "מה מוטל עליי היום?" | M | מבנה הבורדים שונה בכל עסק (עמודות חופשיות). 1,000 קריאות ביום בחינמי מספיקות לשימוש אישי. בטוקני OAuth הישנים אין refresh. |
| **ClickUp** | אין נתון ישראלי אמין. | REST. OAuth חינמי, אבל **רק owner או admin של ה-Workspace יכולים ליצור אפליקציית OAuth** ([authentication](https://developer.clickup.com/docs/authentication)). 100 בקשות לדקה ב-Free עד Business ([rate limits](https://developer.clickup.com/docs/rate-limits)). | משימות, תזכורות, עדכון סטטוס | M | פופולריות בקהל היעד לא ידועה. |
| **Trello** | אין נתון ישראלי אמין. | REST עם API key וטוקן (או OAuth). 100 בקשות ל-10 שניות לטוקן ([rate limits](https://developer.atlassian.com/cloud/trello/guides/rest-api/rate-limits/)). העמוד לא מציין עלות. בפועל אין תשלום על API. | "תוסיפי כרטיס לרשימת 'לטיפול'" | S–M | שימוש עסקי קטן בקהל שלנו. |
| **Asana** | אין נתון ישראלי אמין. | OAuth בהרשמה ב-developer console ([OAuth](https://developers.asana.com/docs/oauth)). 150 בקשות לדקה בדומיין חינמי ([rate limits](https://developers.asana.com/docs/rate-limits)). | משימות ופרויקטים | M | (כמו ClickUp) |
| **Notion** | פופולרי אצל יועצים ופרילנסרים, בלי נתון ישראלי מוסמך. | Public integration (OAuth). אפשר להשתמש בלי פרסום. **ביקורת אבטחה נדרשת רק לרישום ב-Marketplace** ([public integrations](https://developers.notion.com/guides/get-started/public-integrations)). 180 בקשות לדקה לחיבור (600 ב-Business) ([request limits](https://developers.notion.com/reference/request-limits)). | "תשמרי סיכום פגישה בדף הלקוח", "מה כתוב אצלי על פרויקט X?" | M | מבנה חופשי. החיפוש מוגבל. |

---

## 6. חשבוניות והנהלת חשבונות ישראלית

| מחבר | שימוש בישראל | API, הרשאה ועלות | מה עלזה עושה | מאמץ | סיכונים |
|---|---|---|---|---|---|
| **מורנינג (חשבונית ירוקה)** | "מעל 170,000 עסקים" ([greeninvoice.co.il](https://www.greeninvoice.co.il/)) | REST עם API Key ו-Secret שהעסק יוצר ("כלים למפתחים"). sandbox זמין. **"זמין למנויי Best ומעלה"** ([help-center/api](https://www.greeninvoice.co.il/help-center/api/)). Best: 540 ₪ לשנה לפני מע"מ, וכולל "API, אינטגרציות ו-Webhooks" ([pricing](https://www.greeninvoice.co.il/pricing/)). עלות לעלזה: 0. | "מי לא שילם החודש?", "תפיקי קבלה ל-X על 1,200 ₪" (טיוטה ← אישור), "שלחי ללקוח תזכורת תשלום עם קישור" | M | אין OAuth: הלקוח מדביק מפתח וסוד, ונדרשת הצפנה ב-Vault. העסקים הקטנים ביותר (Basic) לא יוכלו להתחבר. |
| **iCount** | ותיק בשוק העצמאים. אין נתון כמותי. | REST v3 עם טוקן API מהגדרות המשתמש (Bearer) ([apiv3 docs](https://apiv3.icount.co.il/)). **"The iCount API is provided free of charge to all customers with a basic membership"** ([features/api](https://www.icount.net/features/api/)). | כמו במורנינג: חובות פתוחים, הפקת מסמך באישור, דוח הכנסות חודשי | M | הטוקן יורש את כל הרשאות המשתמש. מומלץ להנחות ליצור משתמש ייעודי. |
| **SUMIT** | נפוץ אצל עצמאים ועסקים קטנים. אין נתון כמותי. | REST מתועד ([developers/api](https://app.sumit.co.il/developers/api/)). כל מסלול כולל מכסת קריאות API (פי 5 מה"פעולות" במסלול), וחריגה מחויבת ([מחירון](https://help.sumit.co.il/he/articles/5507895)). | חשבוניות, לקוחות, סליקה | M | כל קריאה צורכת מכסה של הלקוח. |
| **EZcount (של HYP)** | חלק מ-HYP, שכבר נבחרה לסליקה. | API ללא תוספת תשלום כשיש חבילת מסמכים ([תמיכה](https://support.ezcount.co.il/hc/he/articles/115004472074)). לפי צד שלישי, מפתח ה-API מופיע רק ממסלול "שתיל" ([mypips](https://help.mypips.info/he/articles/9297316)). | (כמו לעיל) | M | מחירי המסלולים סותרים בין מקורות. סינרגיה עם HYP. |
| **רווחית** | ותיקה. אין נתון כמותי. | API עם טוקן מההגדרות ([general](https://rivhit-api.readme.io/docs/general), [token](https://rivhit-api.readme.io/docs/generating-your-api-token-1)). **עלות ומסלול לא נמצאו.** | מסמכים, לקוחות | M | לא ידוע אם ה-API כלול בכל מסלול. |
| **חשבשבת** | נפוצה מאוד אצל משרדי רו"ח. | שני ממשקים: H-Connect בחלונות (מקומי) ו-REST נפרד לענן (H-WEB), לפי מקורות צד שלישי ([cdx](https://cdx.co.il/general/hashavshevet-api/), [H-ERP](https://api.h-erp.co.il/docs/setupcust/)). לא נמצא תיעוד רשמי פתוח. | שאילתות יתרות וכרטיסי לקוח | L | התקנה מקומית, אין OAuth, תמחור לא שקוף. |
| **Priority** | ERP לעסקים בינוניים. | REST/OData. **נדרש לרכוש מודול API ורישיון API לכל משתמש**, וכתיבה דורשת חבילות טרנזקציות ([Priority OData PDF](https://cdn.priority-software.com/docs/Priority_OData_API.pdf), [REST API](https://prioritysoftware.github.io/restapi/)). | (לא לקהל שלנו) | L | עלות API אצל הלקוח. מחוץ לקהל היעד. |
| **רשות המסים: מספרי הקצאה** | חובה לחשבוניות מעל הסף. | API עם OAuth2 שמיועד ל**בתי תוכנה רשומים** ([מודל חשבוניות ישראל: תיאור ה-API, 7.2024](https://www.gov.il/BlobFolder/generalpage/hor-software-other/he/vat_software-houses-180724.pdf), [הנחיות ליצרני תוכנה](https://www.gov.il/BlobFolder/generalpage/israel-invoice-160723/he/IncomeTax_software-houses-050623.pdf)). | (לא נדרש) | L | **דילוג.** מורנינג, iCount ו-SUMIT כבר מקבלות מספר הקצאה. עלזה לא מפיקה חשבוניות בעצמה, ולכן אין צורך להירשם כבית תוכנה. |

---

## 7. סליקה ותשלומים

כל ה-APIs כאן דורשים **מסוף סליקה של העסק**. אין "API חינמי" במובן של חשבון מפתח עצמאי. העלות היא עמלות הסליקה של העסק. HYP כבר מתוכנן לגבייה של עלזה עצמה.

| מחבר | API | עלות וגישה | מה עלזה עושה | מאמץ | הערכה |
|---|---|---|---|---|---|
| **Grow (משולם)** | פורטל מפתחים ([developers.grow.business](https://developers.grow.business/)). כולל bit ו-PayBox כאמצעי תשלום ([grow.business/bit](https://grow.business/bit/)) | עמלות סליקה. לא נמצא מחירון API נפרד. | "שלחי ללקוח קישור תשלום על 800 ₪", "האם X שילם?" | M | Tier 2: לבחור ספק אחד לפי ביקוש לקוחות |
| **PayPlus** | REST עם api-key ו-secret-key. יש endpoint ל-GenerateLink ([docs](https://docs.payplus.co.il/reference/post_paymentpages-generatelink)) | לא נמצא מחירון ציבורי | קישור תשלום | M | Tier 2/3 |
| **Cardcom** | REST v11 (LowProfile), Swagger וסביבת בדיקות ([docs](https://cardcomapinametovalue.zendesk.com/hc/he/articles/27006768727698)). תומך bit ([cardcom bit](https://www.cardcom.solutions/%D7%91%D7%99%D7%98-%D7%9C%D7%A2%D7%A1%D7%A7%D7%99%D7%9D/)) | לא נמצא מחירון | קישור תשלום | M | Tier 2/3 |
| **Tranzila** | לא נמצא פורטל מפתחים רשמי, רק תיעוד צד שלישי ([BillRun](https://docs.bill.run/en/payment-gateway/tranzila)) | (לא ידוע) | (לא נבדק) | M–L | Tier 3 |
| **Bit / PayBox** | **אין API ישיר לעסקים.** bit זמין דרך סולקים ודרך PayMe ([ice.co.il](https://www.ice.co.il/finance/news/article/818884)) | דרך הסולק | (דרך Grow או Cardcom) | (לא רלוונטי) | דילוג כמחבר עצמאי |

---

## 8. CRM, תקשורת ותזמון

| מחבר | API, OAuth ועלות | מגבלות חשובות | מה עלזה עושה | מאמץ | הערכה |
|---|---|---|---|---|---|
| **Zoom** | OAuth דרך Marketplace. Free: Light 4 לשנייה ו-6,000 ביום, Medium 2 לשנייה ([rate limits](https://developers.zoom.us/docs/api/rate-limits/)) | **אפליקציה לא מפורסמת אי אפשר להתקין מחוץ לחשבון המפתח.** נדרשת ביקורת Marketplace ([devforum](https://devforum.zoom.us/t/oauth-apps-publishing-and-private-app-use-cases/62068), תשובות צוות ישנות). 100 יצירות או עדכונים של פגישה ליום למשתמש. | "קבעי Zoom עם הלקוח", קישור בהזמנה | M (+ זמן ביקורת) | Tier 2 |
| **HubSpot (Free CRM)** | OAuth חינמי. 110 בקשות ל-10 שניות לכל חשבון שמתקין ([usage](https://developers.hubspot.com/docs/api/usage-details)) | **עד 25 התקנות לפני רישום ב-Marketplace** (מספטמבר 2025) ([changelog](https://developers.hubspot.com/changelog/new-marketplace-distribution-app-install-limits)) | "תוסיפי ליד", "מה היה הקשר האחרון עם X?" | M | Tier 2 |
| **Zoho CRM** | Free edition: 5,000 קרדיטים ל-24 שעות ([specifications](https://help.zoho.com/portal/kb/crm/crm-reference/introduction-to-zoho-crm/articles/specifications-zoho-crm)) | | לידים ואנשי קשר | M | Tier 3 (נוכחות ישראלית לא מוכחת) |
| **Pipedrive** | API לכל לקוח. Private app מופץ בקישור ישיר בלי אישור ([private app](https://pipedrive.readme.io/docs/marketplace-registering-a-private-app)) | אין מסלול חינמי ל-CRM עצמו. ביקורת public app עד 21 ימי עסקים ([approval](https://pipedrive.readme.io/docs/marketplace-app-approval-process)) | עסקאות ושלבים | M | Tier 3 |
| **Salesforce** | **API רק ב-Enterprise ומעלה. Professional רק עם add-on** ([editions](https://developer.salesforce.com/docs/atlas.en-us.api_rest.meta/api/intro_rest_compatible_editions.htm)) | | (לא רלוונטי) | L | דילוג |
| **Slack** | OAuth חינמי | **אפליקציות שאינן ב-Marketplace מוגבלות ל-1 בקשה לדקה ב-`conversations.history`** ([changelog](https://docs.slack.dev/changelog/2025/05/29/rate-limit-changes-for-non-marketplace-apps)) | סיכום ערוצים | M | Tier 3 (נדיר אצל עו"ד ורו"ח) |
| **Calendly** | API v2 עם OAuth. **Webhooks רק ממסלול Standard בתשלום** ([webhooks](https://calendly.com/help/webhooks-overview), [getting started](https://developer.calendly.com/getting-started)) | חופף ליכולת התזמון של עלזה | | M | Tier 3 |

---

## 9. שירותים ישראליים כלליים

| שירות | גישה ועלות | מה עלזה עושה | מאמץ | הערכה |
|---|---|---|---|---|
| **Hebcal** | REST ב-JSON, **בלי מפתח**, חינם. רישיון CC BY 4.0 (חובת קרדיט). כ-90 בקשות ל-10 שניות ([developer APIs](https://www.hebcal.com/home/developer-apis)). פרמטר `i=on` ללוח חגים ישראלי ([REST API](https://www.hebcal.com/home/195/jewish-calendar-rest-api)). נבדק בפועל: מחזיר חגים בעברית. | אזהרה לפני קביעת פגישה בחג או בערב חג, "מתי כניסת שבת?", תזכורות שמכבדות ימי עבודה | S | **Tier 1** |
| **בנק ישראל: שער יציג** | SDMX/REST ציבורי, **בלי מפתח**: `edge.boi.org.il/FusionEdgeServer/sdmx/v2/...`, `DATA_TYPE=OF00`, פלט CSV או JSON ([BOI guide](https://www.boi.org.il/media/upqgqpuv/extracting-representative-exchange-rates-from-the-new-series-database.pdf)) | "מה השער היציג של הדולר היום?", המרת שכר טרחה או חשבון בדולרים | S | **Tier 1** |
| **Waze: deep links** | קישורי `waze.com/ul` ציבוריים וחינמיים ([deep links](https://developers.google.com/waze/deeplinks)) | בתזכורת לפגישה פיזית: "לנווט עם Waze" | S | **Tier 1** (חלק מתזכורות) |
| Waze: זמני נסיעה | **רק Transport SDK לשותפים, בתשלום ובלי גישה מהשרת** ([transport SDK](https://developers.google.com/waze/intro-transport)) | (לא רלוונטי) | (לא רלוונטי) | דילוג |
| **Google Maps Routes API** | Essentials: 10,000 אירועים בחודש ללא תשלום, ואחר כך 5$ לאלף ([pricing](https://developers.google.com/maps/billing-and-pricing/pricing)). **דורש חשבון חיוב פעיל.** | "תצאי בזמן: עם הפקקים יש 40 דקות לפגישה" | M | Tier 2. מתנגש עם הכלל "אין קריאות API בתשלום" אלא אם מגדירים מכסה קשיחה (quota cap). |
| **דואר ישראל: מעקב** | **לא נמצא API ציבורי.** במכרז מ-2019 נאמר שקיים API ללקוחות ששולחים דרך הדואר ([מסמך 2019](https://www.israelpost.co.il/media/1747/%D7%AA%D7%A9%D7%95%D7%91%D7%95%D7%AA-%D7%9C%D7%A9%D7%90%D7%9C%D7%95%D7%AA-%D7%A7%D7%95%D7%9C-%D7%A7%D7%95%D7%A8%D7%90-20190813.pdf)). Click2Post לעסקים ([click2post](https://doar.israelpost.co.il/content/click2post)). צבירה דרך צד שלישי ([AfterShip](https://www.aftership.com/carriers/israel-post/api)). | "איפה החבילה RR123...IL?" | M | Tier 3. גירוד (scraping) של אתר הדואר לא מומלץ (תנאי שימוש). |

---

## 10. מסמכים וחתימה אלקטרונית

| מחבר | עלות API | הערכה |
|---|---|---|
| **DocuSign** | חשבון מפתח חינמי לבדיקות בלבד. **ייצור דורש מסלול API בתשלום** (Starter מ-41 ליש"ט לחודש, 40 מעטפות) ([developer plans](https://ecom.docusign.com/en-GB/plans-and-pricing/developer)) | דילוג (בתשלום) |
| **PandaDoc** | **מקורות סותרים:** עמוד המחירים: production רק ב-Enterprise ([API pricing](https://www.pandadoc.com/api/pricing)). פוסט בבלוג מאוגוסט 2026: המסלול החינמי כולל מפתח production, עם 60 מסמכים בשנה ([blog](https://www.pandadoc.com/blog/pandadoc-free-plan-api/)). לא אומת. | Tier 3: לאמת לפני החלטה |
| **Comsign** | ComSignTrust API (גורם מאשר מורשה), דרך מכירות בלבד, בלי תיעוד או מחיר ציבוריים ([comsign API](https://www.comsign.co.il/%D7%A4%D7%AA%D7%A8%D7%95%D7%A0%D7%95%D7%AA-%D7%97%D7%AA%D7%99%D7%9E%D7%94-%D7%93%D7%99%D7%92%D7%99%D7%98%D7%9C%D7%99%D7%AA-%D7%9C%D7%90%D7%A8%D7%92%D7%95%D7%A0%D7%99%D7%9D/api-%D7%97%D7%AA%D7%99%D7%9E%D7%94-%D7%93%D7%99%D7%92%D7%99%D7%98%D7%9C%D7%99%D7%AA/)) | דילוג |
| **WeSign (קומדה)** | לא נמצא תיעוד API ציבורי. התוצאות בחיפוש היו של מוצרים אחרים באותו שם. | דילוג עד בירור ישיר |

**חלופה זולה:** עלזה יכולה לשלוח מסמך מ-OneDrive או Drive ולעקוב אחרי חזרתו החתום במייל. זה בלי מחבר חתימה ייעודי.

---

## 11. קליניקות

| מערכת | API ציבורי? | הערה |
|---|---|---|
| **Easybizy** | **כן:** "Public API: חדש" עם מפתחות ותיעוד, כולל לקוחות, לידים ותורים ([easybizy.net](https://easybizy.net/)) | Tier 3: לבדוק עלות ומסלול |
| **אודורו (Odoro)** | לא נמצא API ציבורי. המונח "ממשק" באתר מתייחס לחיבור לקופות החולים ([odoro.co.il](https://www.odoro.co.il/)) | דילוג |
| **Medform** | התממשקות לחשבוניות ישראל. לא נמצא API ציבורי ([medform.co.il](https://medform.co.il/)) | דילוג |
| מדי-קליק, Clinix ואחרות | לא נמצא מידע על API ציבורי ([סקירת מערכות](https://www.betipulnet.co.il/particles/Clinic_management_softwares)) | דילוג |

**המלצה:** בקליניקות להתחבר דרך **יומן Google או Outlook** (רוב המערכות מסנכרנות אליו), ולא דרך מערכת הניהול. נתונים רפואיים הם מידע ברגישות גבוהה במיוחד, ולכן חיבור ישיר מחייב בדיקה משפטית נפרדת.

---

## 12. משרדי עורכי דין

לא נמצא API ציבורי באף אחת מהמערכות הישראליות שנבדקו: עודכנית ([od.co.il](https://www.od.co.il/)), יודפת ([yodfat.net](https://yodfat.net/)), קליגל ([cligal.com](https://cligal.com/)), משיג ([masig.co.il](https://www.masig.co.il/)), Law One על SAP B1. לגבי Lawflex לא נמצא מידע כלל. **המלצה:** לשרת עורכי דין דרך Outlook, יומן, OneDrive ו-SharePoint (כולל SharePoint Lists כ"מאגר תיקים" קל). אפשר לפנות לעודכנית או ליודפת לבירור שיתוף פעולה, אבל זה מסלול שותפות ולא חיבור עצמאי.

---

## 13. המלצה מתועדפת

### Tier 1: לבצע ראשונים (חינם, נפוץ בישראל, ערך גבוה)
1. **Microsoft To Do + קריאת Planner:** `Tasks.ReadWrite`. S.
2. **קישורי Teams ו-Meet בפגישות** (מתוכנן): בלי scope חדש. S.
3. **Google Tasks + Contacts:** sensitive, בלי CASA. להוסיף לבקשת האימות הראשונה. S.
4. **מורנינג:** חובות, קבלות באישור, תזכורות תשלום. מפתח של הלקוח במסלול Best. M.
5. **iCount:** אותן יכולות. API ללא עלות במנוי בסיסי. M.
6. **Hebcal + שער יציג + קישורי Waze:** בלי הרשאות. S יחד.
7. **monday.com:** API חינמי בכל המסלולים. OAuth עם הפצה בקישור. M.

### Tier 2: אחרי Tier 1, לפי ביקוש
- **Teams: צ'אטים** (`Chat.Read` ו-`ChatMessage.Send`) **וערוצים** (`ChannelMessage.Read.All`, דורש מנהל), **SharePoint Lists**, **OneNote**, **תמלולי Teams** (דורש מנהל).
- **SUMIT, EZcount** (סינרגיה עם HYP), **רווחית** (לברר מסלול).
- **Zoom** (דורש ביקורת Marketplace), **HubSpot Free** (מגבלת 25 התקנות עד רישום).
- **ספק סליקה אחד לקישורי תשלום** (Grow, PayPlus או Cardcom, לפי מה שהלקוחות משתמשים בו).
- **Notion, ClickUp, Asana, Trello:** לפי בקשות של משתמשים.
- **Google Maps Routes:** רק עם מכסה קשיחה (quota cap) וחשבון חיוב.

### Tier 3 / דילוג (והסיבה)
| מחבר | סיבה |
|---|---|
| Salesforce | API רק ב-Enterprise או ב-add-on בתשלום |
| DocuSign | מסלול API בתשלום לייצור |
| Priority | רישיון API ומודול בתשלום |
| חשבשבת | התקנה מקומית, אין OAuth, אין תיעוד רשמי פתוח |
| Comsign / WeSign | מכירות בלבד, אין תיעוד ציבורי |
| Google Keep | מיועד למנהלי Workspace בלבד |
| קריאת Google Chat | Restricted, דורש CASA |
| Slack | רלוונטיות נמוכה לקהל. מגבלת 1 לדקה לאפליקציות שאינן ב-Marketplace |
| Calendly | Webhooks בתשלום. חופף ליכולת של עלזה |
| Zoho CRM, Pipedrive | נוכחות ישראלית לא מוכחת. ב-Pipedrive אין מסלול חינמי |
| PandaDoc | מקורות סותרים לגבי API חינמי. לאמת |
| דואר ישראל | אין API ציבורי |
| רשות המסים (מספר הקצאה) | נדרש רישום כבית תוכנה. מערכות החשבוניות כבר מטפלות בזה |
| Bit / PayBox | אין API ישיר. רק דרך סולק |
| Waze (זמני נסיעה) | רק לשותפים ובתשלום |
| מערכות קליניקה ועו"ד | אין API ציבורי (חוץ מ-Easybizy). לחבר דרך היומן |

---

## 14. פתוחים לאימות לפני מימוש
1. **סיווג `tasks` של Google:** לבדוק בבורר ה-scopes של הפרויקט (Data Access) שהוא Sensitive ולא Restricted.
2. **המדיניות המנוהלת של Microsoft:** לבדוק ב-tenant בדיקה עם הגדרות ברירת מחדל שה-consent ל-`Tasks.ReadWrite` אכן נחסם, ושה-admin consent workflow עובד מוואטסאפ (קישור למנהל).
3. **מורנינג:** לבדוק מגבלות קצב ומסלול sandbox בתיעוד הרשמי, ואם יש תוכנית שותפים עם OAuth (לא נמצאה).
4. **רווחית ו-EZcount:** לברר באיזה מסלול ה-API זמין (מקורות סותרים או חסרים).
5. **Zoom:** לבדוק את מדיניות הפרסום העדכנית (המקורות הם פורומים מ-2020 עד 2022).
6. **PandaDoc:** לבדוק אם המסלול החינמי באמת כולל מפתח production.
