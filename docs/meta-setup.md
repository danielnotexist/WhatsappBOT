# חיבור WhatsApp Cloud API אמיתי - מדריך לדניאל

> נכתב 22.10.2026. השלבים, השמות בממשק והמגבלות נבדקו מול התיעוד של Meta (developers.facebook.com) ושל Vercel באותו יום. המקורות בסעיף 10.
> Meta מזיזה כפתורים לעיתים קרובות. אם שם בממשק שונה מעט ממה שכתוב כאן, הכוונה היא לאותו מקום. אם משהו חסר לגמרי, לעצור ולשלוח לי צילום מסך (בלי טוקנים או סודות בצילום).
> הקוד: `app/api/wa/webhook/route.ts` (קבלת ההודעות), `lib/wa/*` (שליחה, חתימה, תבניות), `lib/env.ts` (המשתנים). התבניות: `docs/copy/wa-templates.md`.

## 0. התמונה בקצרה

- **שלב א' (עכשיו, בדיקה אמיתית):** מספר הבדיקה החינמי של Meta. שולחים ומקבלים הודעות אמיתיות בוואטסאפ, עד 5 מספרי נמענים שמאשרים מראש (המספרים שלך). לא צריך אימות עסק, לא צריך אמצעי תשלום, לא צריך מספר ישראלי. סעיפים 1-7.
- **שלב ב' (אחר כך, לפני לקוחות):** אימות העסק, שם התצוגה "עלזה", המספר הישראלי האמיתי, אמצעי תשלום ורישום התבניות. סעיף 9.
- **מונחים:** Meta מפצלת בימים אלה את "WhatsApp Business Account" (WABA) לשני חשבונות: **WhatsApp account** (המספרים) ו-**Messaging account** (תבניות, חיוב, webhooks). בחשבון קיים, ה-WABA ID הישן ממשיך לשמש כ-Messaging account ID, ולא צריך לשנות כלום עכשיו. בממשק החדש ה-ID שאני צריך מופיע לפעמים בשם **Messaging account ID** ולפעמים **WhatsApp Business Account ID** - זה אותו מספר מבחינתנו.
- **חלוקת עבודה:** את כל מה שנעשה בממשק של Meta (יצירה, אישורים, טוקן) עושה דניאל. את מה שנעשה ב-API (בדיקות, רישום תבניות, רישום המספר האמיתי, חיבור ה-webhook לחשבון) אני עושה, אחרי שהטוקן אצלי בצורה מאובטחת (סעיף 11).

## 1. Business portfolio (תיק עסקי)

עלזה היא מותג של secureops, ולכן הכול נפתח **תחת ה-portfolio של secureops**. אימות העסק (סעיף 9.1) נעשה לישות המשפטית, כך שאין טעם בתיק נפרד לעלזה.

1. https://business.facebook.com/settings - אם כבר יש portfolio של secureops (למשל בגלל דף פייסבוק של החברה), לבחור אותו בבורר למעלה ולדלג לסעיף 2.
2. אם אין: **Create a business portfolio** - שם העסק: **השם המשפטי של secureops** בדיוק כמו ברשם החברות / ברשות המסים (חשוב לאימות בהמשך), שם פרטי ומשפחה, מייל עסקי (עדיף בדומיין של secureops).
3. לוודא שדניאל הוא **Admin** של ה-portfolio (Users → People). רק Admin יכול ליצור משתמש מערכת (סעיף 5) ולמחוק מספרים.

## 2. אפליקציה ב-Meta (Meta app)

1. https://developers.facebook.com/apps → **Create app**. אם זו הפעם הראשונה, Meta תבקש להירשם כמפתח (אישור מייל וטלפון).
2. **App name:** `Alze` (Meta לא מאשרת את המילים WhatsApp או Meta בשם האפליקציה). **App contact email:** המייל של דניאל.
3. **Use case:** לבחור **Connect with customers through WhatsApp** → Next. (אם מוצגת בחירת סוג אפליקציה, לבחור **Business**. בזרימה הנוכחית הסוג נקבע לפי ה-use case.)
4. **Business portfolio:** לבחור את secureops (סעיף 1).
5. **Publishing requirements:** לעבור על הרשימה (בדרך כלל ריקה בשלב הזה) → Next → **Create app**. ייתכן שתתבקש הסיסמה של פייסבוק.

## 3. מספר הבדיקה ומספרי הנמענים

1. בלוח האפליקציה: **Start using the API** (או **Use cases → Customize** ליד "Connect with customers through WhatsApp" → **API Setup**).
2. בראש העמוד, בבחירת החשבון: לבחור חשבון קיים או **Create a WhatsApp Business account**. Meta יוצרת אוטומטית גם חשבון בדיקה ו**מספר בדיקה** (מספר אמריקאי שמתחיל ב-`+1 555`).
3. **Generate access token** - טוקן זמני (תוקף של שעות בודדות). הוא מספיק להודעת הבדיקה הראשונה בלבד. הטוקן הקבוע בסעיף 5.
4. **From:** מספר הבדיקה. מתחתיו מופיעים **Phone number ID** ו-**WhatsApp Business Account ID** (או Messaging account ID). שניהם לא סודיים, ואני צריך את שניהם (סעיף 11).
5. **To:** → **Manage phone number list** → **Add phone number** → המספר הנייד של דניאל בפורמט בינלאומי (`+972 5X-XXX-XXXX`) → קוד אימות מגיע **בוואטסאפ** לטלפון הזה → להזין את הקוד. אפשר לחזור על זה **עד 5 מספרים** בסך הכול (למשל מספר נוסף של בן משפחה או עובד לבדיקה של משתמש שני).
6. **Send message** - נשלחת תבנית `hello_world` (באנגלית) למספר שנבחר. היא אמורה להגיע לוואטסאפ תוך שניות.
7. **לענות** להודעה מהטלפון (כל טקסט). זה פותח חלון שיחה של 24 שעות, שבו אפשר לשלוח גם הודעות חופשיות (לא תבנית). בשלב הזה התשובה עוד לא מגיעה אלינו - ה-webhook בסעיף 6.

**מגבלות מספר הבדיקה:**
- שולח רק ל-5 המספרים שאושרו. שליחה לכל מספר אחר נכשלת בשגיאה `131030` ("Recipient phone number not in allowed list").
- שם התצוגה הוא "Test Number" ואי אפשר לשנות אותו. את "עלזה" רואים רק במספר האמיתי (סעיף 9.2).
- לא צריך אמצעי תשלום כדי לשלוח תבניות ממספר הבדיקה, והמגבלות שלו מקלות.
- תבנית שייכת לחשבון שבו נרשמה. במעבר למספר האמיתי (שנמצא בחשבון אחר) רושמים את התבניות שוב - אני עושה את זה.

## 4. App Secret

ה-App Secret הוא המפתח שבעזרתו השרת שלנו מוודא שכל הודעה שמגיעה ל-webhook באמת נשלחה מ-Meta (חתימת `X-Hub-Signature-256`; בקשה בלי חתימה תקינה נדחית ב-401).

1. בלוח האפליקציה: **App settings → Basic**.
2. **App secret** → **Show** → הסיסמה של פייסבוק → להעתיק **ישר למקום המאובטח** (סעיף 11), לא לצ'אט ולא לקובץ.
3. באותו עמוד מופיע גם **App ID** (לא סודי, לא חובה לשלוח).

## 5. טוקן קבוע (System User)

הטוקן הזמני מסעיף 3 פג אחרי שעות. השרת צריך טוקן של **משתמש מערכת** שלא פג.

1. https://business.facebook.com/settings → **Users → System users** → **Add**.
2. שם: `alze-server`. תפקיד: **Employee** (לא Admin). Employee מקבל גישה רק למה שמשייכים לו במפורש, ולכן הטוקן לא נוגע בשום נכס אחר של secureops (דפים, חשבונות מודעות). → **Create system user**.
3. לבחור את המשתמש החדש → **Assign assets**:
   - **Apps** → `Alze` → **Manage app** (Full control) → Assign.
   - **WhatsApp accounts** → כל חשבון הוואטסאפ שנוצר בסעיף 3 (גם חשבון הבדיקה אם מופיע ברשימה) → **Full control** → Assign. אם מופיע בנפרד גם **Messaging account** - לשייך גם אותו. Meta: גישה לאחד מהם לבד לא מספיקה.
   - לרענן את העמוד ולוודא שמופיע **Full control** ליד כל נכס (לפעמים לוקח כמה דקות).
4. **Generate token** (או Generate new token):
   - **App:** `Alze`.
   - **Token expiration:** **Never**. (האפשרות השנייה, 60 יום, מחייבת חידוש ידני, ואם נשכח - הבוט נעצר.)
   - **Permissions:** לסמן רק את שתי אלה:
     - `whatsapp_business_messaging` - שליחה וקבלה של הודעות.
     - `whatsapp_business_management` - תבניות, מספרים, חיבור ה-webhook לחשבון.
   - Meta מציעה בתיעוד גם `business_management`. **לא צריך אותו** אצלנו, וזו הרשאה רחבה על כל ה-portfolio. לא לסמן.
5. **Generate token** → הטוקן מוצג **פעם אחת בלבד** → להעתיק ישר למקום המאובטח (סעיף 11). אם הוא אבד, מייצרים חדש.

טוקן "Never" פג רק כשמבטלים אותו, מוחקים את משתמש המערכת או משנים לו הרשאות. **ביטול טוקן** (אם דלף): System users → `alze-server` → **Revoke tokens**, ואז Generate token חדש.

## 6. Webhook - כדי שההודעות יגיעו אלינו

**לפני השלב הזה** אני מאשר שני דברים: שהכתובת `https://alze.vercel.app/api/wa/webhook` פתוחה ל-Meta (סעיף 8), ושב-Vercel מוגדרים `WA_VERIFY_TOKEN` ו-`META_APP_SECRET`. בלי זה Meta לא תצליח לאמת את הכתובת.

1. בלוח האפליקציה: **Use cases → Customize** (ליד "Connect with customers through WhatsApp") → **Configuration**. (באפליקציות ותיקות: **WhatsApp → Configuration**.)
2. בקטע **Webhook** → **Edit**:
   - **Callback URL:** `https://alze.vercel.app/api/wa/webhook`
   - **Verify token:** המחרוזת שאשלח (אותה מחרוזת אני מגדיר ב-Vercel כ-`WA_VERIFY_TOKEN`). זו לא סיסמה של Meta, רק מחרוזת משותפת שמוכיחה ל-Meta שהשרת הוא שלנו.
   - **Verify and save.** Meta שולחת בקשת GET לכתובת, והשרת עונה רק אם המחרוזת תואמת.
3. אחרי השמירה מופיעה רשימת **Webhook fields** → ליד **messages** → **Subscribe**. בשלב הזה רק את השדה הזה.
4. אם מופיעה שגיאה ("The callback URL or verify token couldn't be validated"): לא לנסות שוב ושוב, לשלוח לי צילום של השגיאה. הסיבה הנפוצה: Vercel חוסם (401) או שהמשתנה עוד לא נכנס ל-deployment.

**העברת האפליקציה ל-Live:** Meta כותבת במפורש שחלק מה-webhooks לא נשלחים כשהאפליקציה במצב פיתוח (Dev). לכן אחרי ה-webhook:
1. **App settings → Basic:**
   - **Privacy Policy URL:** `https://alze.vercel.app/privacy`
   - **Terms of Service URL:** `https://alze.vercel.app/terms`
   - **User data deletion:** אותה כתובת של מדיניות הפרטיות.
   - **App icon:** 1024×1024 (אכין קובץ מהלוגו), **Category:** Business, מייל ליצירת קשר → **Save changes**.
2. בתפריט הצד: **Publish** → לעבור על הדרישות → **Publish**.
3. Meta בודקת שכתובת מדיניות הפרטיות נפתחת. זו עוד סיבה שהאתר צריך להיות ציבורי (סעיף 8). המסמכים המשפטיים עדיין טיוטה עם `[שם החברה]` - לפני לקוחות אמיתיים להשלים את פרטי secureops (`docs/legal/`).

## 7. בדיקה מקצה לקצה (אחרי שהכול אצלי)

1. אני בודק שהטוקן תקין (קריאה ל-`GET /{Phone Number ID}`) ושהכתובת עונה ל-Meta.
2. דניאל כותב מהטלפון (אחד מ-5 המספרים) למספר הבדיקה: "היי".
3. Meta שולחת את ההודעה ל-webhook → התור → ה-worker → עלזה עונה בוואטסאפ. אני עוקב בלוגים של Vercel.
4. אני שולח תבנית (`hello_world`, ואחר כך התבניות שלנו) כדי לבדוק גם שליחה מחוץ לחלון 24 השעות.

לידיעה טכנית: הקוד פונה כרגע ל-Graph API בגרסה `v21.0`. לפי Meta היא זמינה עד 21.1.2027. אעדכן לגרסה חדשה לפני כן, בנפרד מהמדריך הזה.

## 8. Vercel Deployment Protection - למה זה חוסם ומה עושים

**הבעיה:** לפי `docs/deploy.md` §3 האתר מוגן ב-**Vercel Authentication** בהיקף **All Deployments**. כל בקשה בלי כניסה ל-Vercel מקבלת 401 או מסך כניסה. Meta היא שרת, היא לא מתחברת ל-Vercel, ולכן:
- אימות ה-webhook (GET) והודעות נכנסות (POST) ל-`/api/wa/webhook` נחסמים.
- גם הקריאה הפנימית שלנו ל-`/api/wa/worker` (מהתור, QStash או התור המקומי) עוברת דרך אותה כתובת ונחסמת.
- Meta צריכה לפתוח את `/privacy` כדי להעביר את האפליקציה ל-Live (סעיף 6).

**מה Vercel מציעה היום (נבדק 22.10.2026):**

| אפשרות | זמינות | מתאים ל-Meta? |
|---|---|---|
| **Standard Protection** - מגן על הכול חוץ מהדומיינים של production | כל התוכניות | כן. `alze.vercel.app` ציבורי; כתובות preview וכתובות של deployment בודד נשארות מוגנות |
| **Protection Bypass for Automation** - סוד כ-header או כ-query parameter | כל התוכניות | header - לא (Meta לא שולחת headers משלנו). query parameter (`?x-vercel-protection-bypass=...`) - Vercel ממליצה עליו ל-webhooks, אבל ראו למטה |
| **Deployment Protection Exceptions** | כל התוכניות | לא. לפי דומיין, ומיועד ל-preview בלבד. **אין ב-Vercel חריגה לפי נתיב** |
| **OPTIONS Allowlist** - לפי נתיב | כל התוכניות | לא. רק לבקשות OPTIONS (CORS) |
| **Trusted Sources** (OIDC) | כל התוכניות | לא. Meta לא מציגה טוקן OIDC |
| **Trusted IPs** / הגנה על production בלבד | Enterprise בלבד | לא רלוונטי |

**ההחלטה: Standard Protection.**
- הכי מינימלי: הגדרה אחת, בלי שינוי קוד.
- הנקודות הרגישות מוגנות בקוד עצמו, לא ב-Vercel: אימות ה-webhook דורש את `WA_VERIFY_TOKEN`; כל POST נבדק בחתימת HMAC עם ה-App Secret ונדחה ב-401 אם היא לא תקינה; ה-worker דורש חתימת QStash או סוד פנימי; האזור האישי דורש כניסה עם קוד.
- כל ה-preview וכתובות ה-deployment הבודדות נשארות מוגנות.
- מה שהופך לציבורי: האתר ב-`alze.vercel.app` (דף הבית, הרשמה, מסמכים משפטיים). ה-noindex קיים רק במצב הדגמה (`proxy.ts`), כך שבמצב האמיתי מנועי חיפוש יכולים לאנדקס. ממילא האתר צריך להיות ציבורי בהשקה.

**למה לא Bypass ב-query parameter:** הסוד הזה פותח **את כל ה-deployments ואת כל הנתיבים** של הפרויקט, והוא היה נשמר בהגדרות של Meta ובלוגים. Meta לא מתעדת שהיא שומרת פרמטרים משלנו בכתובת. והקריאות הפנימיות ל-worker היו מחייבות שינוי קוד. זו תוכנית ב' בלבד, אם דניאל רוצה שהאתר יישאר סגור עד ההשקה: Settings → Deployment Protection → **Protection Bypass for Automation** → ליצור סוד בשם `meta-webhook`, כתובת ה-callback תהיה `https://alze.vercel.app/api/wa/webhook?x-vercel-protection-bypass=<הסוד>`, ואני מוסיף את ה-header לקריאות ל-worker. אם אימות ה-webhook נכשל בגלל שהפרמטר לא נשמר - חוזרים ל-Standard.

**הצעדים (Standard Protection):**
1. Vercel → הפרויקט → **Settings → Deployment Protection**.
2. **Vercel Authentication** נשאר **Enabled**. ההיקף: מ-**All Deployments** ל-**Standard Protection** → **Save**.
3. **Settings → Domains:** לוודא ש-`alze.vercel.app` משויך ל-**Production**. רק דומיין production יוצא מההגנה.
4. בדיקה בלי דפדפן (אני מריץ אותה, אבל אפשר גם מכל מחשב):
   ```bash
   # מחרוזת שגויה בכוונה: צריך לקבל 403 מהשרת שלנו, לא 401 או מסך כניסה של Vercel
   curl -s -o /dev/null -w '%{http_code}\n' 'https://alze.vercel.app/api/wa/webhook?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=1'
   ```
5. `docs/deploy.md` §3 יעודכן בהתאם בנפרד.

## 9. אחר כך: מעבר למספר האמיתי (שלב ב')

### 9.1 אימות העסק (Business verification)
- https://business.facebook.com/settings → **Security Center** → **Business verification** → **Start verification**.
- נדרש: השם המשפטי של secureops (זהה לשם ב-portfolio), כתובת, טלפון, **אתר של secureops שמופיע בו השם המשפטי**, ומסמך רשמי (תעודת התאגדות או תעודת עוסק, ולפעמים חשבון חשמל או טלפון על שם העסק). אישור בקוד למייל בדומיין העסק, ב-SMS או באימות דומיין.
- לא חובה כדי להתחיל, אבל: portfolio חדש מוגבל ל-**250** משתמשים שונים ב-24 שעות בהודעות יזומות (מחוץ לחלון השיחה). אימות העסק הוא אחת הדרכים להגיע ל-2,000 ומעלה. המגבלה היא לכל ה-portfolio. אחרי אימות גם מכסת המספרים עולה מ-2 ל-20.
- לוקח בין כמה ימים לשבועיים. כדאי להתחיל מוקדם.

### 9.2 שם התצוגה "עלזה"
- Meta בודקת שלשם יש **קשר ברור לעסק**, לפי מקורות חיצוניים (בעיקר האתר). כיוון שעלזה היא מותג של secureops, צריך ש:
  - האתר של עלזה יציג את השם "עלזה" ויכתוב שהשירות שייך ל-secureops (במסמכים המשפטיים ובתחתית האתר; כרגע כתוב שם `[שם החברה]`).
  - רצוי שגם האתר של secureops יזכיר את עלזה.
- אם השם נדחה: לנסות "עלזה מבית secureops", או את השם הלטיני `Alze`.
- השם נקבע בהוספת המספר (9.3). שינוי אחר כך: WhatsApp Manager → **Account tools → Phone numbers** → המספר → **Profile** → **Edit** ליד Display name (עד 10 שינויים ב-30 יום). אחרי אישור שם חדש צריך לרשום את המספר מחדש - אני עושה את זה.
- בתיאור העסק בפרופיל: "שירות לניהול מייל, יומן וקבצים לעסקים", ולא "עוזר AI". כך זה תואם את המיצוב מול סעיף 4.7 בתנאים של Meta (`docs/legal/meta-ai-clause-memo.md`).

### 9.3 המספר הישראלי האמיתי
- **דרישות:** מספר בבעלות secureops, עם קידומת מדינה ואזור, שיכול לקבל **SMS או שיחה קולית**, ו**לא פעיל באפליקציית WhatsApp** (לא רגילה ולא Business). אם ה-SIM היה פעם בוואטסאפ: באפליקציה → Settings → Account → **Delete my account**, ולחכות כמה דקות. מרגע שהמספר עובר ל-Cloud API אי אפשר להשתמש בו באפליקציה.
- **הוספה:** API Setup → **Add phone number** (או WhatsApp Manager → Account tools → Phone numbers):
  1. פרופיל: Display name **עלזה**, אזור זמן ירושלים, קטגוריה (Professional services או הקרובה), תיאור (9.2).
  2. המספר בפורמט `+972...` → קבלת קוד ב-SMS או בשיחה → להזין.
- **מה אני עושה אחר כך:**
  - רישום המספר ב-API (`POST /{Phone Number ID}/register`) עם **PIN של 6 ספרות** לאימות דו-שלבי. דניאל בוחר את ה-PIN, שומר אותו במנהל הסיסמאות ומעביר אותו כמו סוד (סעיף 11). Meta מגבילה ל-10 ניסיונות רישום ב-72 שעות.
  - חיבור האפליקציה לחשבון החדש (`POST /{WABA ID}/subscribed_apps`) כדי שה-webhook יקבל גם ממנו.
  - עדכון `WA_PHONE_NUMBER_ID` ו-`WA_PUBLIC_NUMBER` ב-Vercel.
- דניאל: לוודא שלמשתמש המערכת `alze-server` יש **Full control** גם על חשבון הוואטסאפ החדש (סעיף 5, שלב 3).

### 9.4 אמצעי תשלום
- Meta Business Suite → **Billing Hub** (Billing & payments) → **Payment methods** → להוסיף כרטיס אשראי של secureops ולשייך אותו לחשבון ההודעות (Messaging account).
- התמחור (Meta, בתוקף מ-1.10.2026): חיוב **לכל הודעה שנמסרה**, לפי קטגוריה ולפי מדינת הנמען. הודעות שמשתמשים שולחים אלינו - חינם. תבניות (Utility, Marketing, Authentication) - בתשלום. **הודעות שירות** (תשובות חופשיות בתוך חלון 24 השעות): **1,000 בחודש חינם לכל מספר**, ובתשלום מההודעה ה-1,001.
- **בלי אמצעי תשלום** Meta מפסיקה למסור הודעות שירות אחרי ה-1,000 החינמיות של החודש. כלומר הבוט פשוט מפסיק לענות. חובה לפני לקוחות.

### 9.5 תבניות ההודעה
הודעה יזומה (מחוץ ל-24 השעות מההודעה האחרונה של המשתמש) חייבת להיות תבנית מאושרת. ב-`docs/copy/wa-templates.md` יש 10 תבניות, כולן Utility בעברית (`he`):

| תבנית | מתי נשלחת |
|---|---|
| `morning_summary` | סיכום הבוקר |
| `reminder` | תזכורת שהגיע זמנה |
| `trial_ended_payment` | הודעות הניסיון נוצלו - קישור לתשלום |
| `payment_success` | התשלום התקבל |
| `payment_failed` | חיוב חודשי נכשל - ניסיון חוזר או עדכון כרטיס |
| `reconnect_needed` | החיבור ל-Microsoft / Google פג |
| `plan_limit_reached` | מכסת ההודעות של המסלול נוצלה |
| `card_update_needed` | הכרטיס חסום או לא תקף |
| `account_paused` | החשבון הושהה אחרי חיובים שנכשלו |
| `payment_receipt` | קבלה על חיוב חודשי |

- **אני רושם אותן ב-API** (`POST /{WABA ID}/message_templates`, דרך `registerTemplates()` ב-`lib/wa/templates.ts`). האישור לוקח בין דקות ל-24 שעות. אפשר לראות אותן ב-WhatsApp Manager → **Account tools → Message templates**.
- לפני הרישום צריך להחליט על הדומיין: 7 תבניות כוללות כפתור עם כתובת קבועה (`APP_DOMAIN`), ושינוי דומיין אחר כך פירושו גרסה חדשה לאישור. לבדיקה אפשר לרשום עם `alze.vercel.app` ולרשום שוב כשיהיה דומיין סופי.
- התבניות נרשמות פעם בחשבון הבדיקה ופעם בחשבון של המספר האמיתי (סעיף 3).

## 10. מקורות (נבדקו 22.10.2026)

- Meta - Get started: https://developers.facebook.com/documentation/business-messaging/whatsapp/get-started
- Meta - Access tokens (System user): https://developers.facebook.com/documentation/business-messaging/whatsapp/access-tokens
- Meta - Webhooks: https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/create-webhook-endpoint , https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/overview
- Meta - Phone numbers, registration: https://developers.facebook.com/documentation/business-messaging/whatsapp/business-phone-numbers/phone-numbers , https://developers.facebook.com/documentation/business-messaging/whatsapp/business-phone-numbers/registration
- Meta - Display names: https://developers.facebook.com/documentation/business-messaging/whatsapp/display-names
- Meta - Messaging limits: https://developers.facebook.com/documentation/business-messaging/whatsapp/messaging-limits
- Meta - Pricing: https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing
- Meta - Account model (Messaging account): https://developers.facebook.com/documentation/business-messaging/whatsapp/about-the-platform , https://developers.facebook.com/documentation/business-messaging/whatsapp/account-model-evolution/messaging/
- Meta - Graph API versions: https://developers.facebook.com/docs/graph-api/changelog
- Vercel - Deployment Protection: https://vercel.com/docs/deployment-protection , https://vercel.com/docs/deployment-protection/methods-to-bypass-deployment-protection , https://vercel.com/docs/deployment-protection/methods-to-bypass-deployment-protection/protection-bypass-automation , https://vercel.com/docs/deployment-protection/methods-to-bypass-deployment-protection/deployment-protection-exceptions

## 11. מה לשלוח לי, ואיך

| מה | איפה מוצאים | סודי? | איך מעבירים |
|---|---|---|---|
| **Access token** (קבוע, של `alze-server`) | סעיף 5 | **כן** | סוד בסביבה, בשם `WA_ACCESS_TOKEN` |
| **App Secret** | סעיף 4 | **כן** | סוד בסביבה, בשם `META_APP_SECRET` |
| **Phone Number ID** | API Setup, מתחת ל-From (סעיף 3) | לא | אפשר בצ'אט |
| **WABA ID** (Messaging account ID) | API Setup, ליד ה-Phone Number ID | לא | אפשר בצ'אט |
| מספר הבדיקה עצמו (`+1 555...`) | API Setup, From | לא | אפשר בצ'אט (נכנס ל-`WA_PUBLIC_NUMBER`) |
| בשלב ב': ה-PIN של 6 הספרות | סעיף 9.3 | **כן** | סוד בסביבה, בשם `WA_REGISTRATION_PIN` |

**איך מעבירים סוד - לא בצ'אט:**
1. **בסביבת Claude (המועדף):** בכותרת של הסשן ב-Claude → תפריט סביבת הענן → **Edit** → **Network secrets** (באפליקציה שלא עודכנה: **API credentials**), ואם הקטע הזה לא מוצע - כמשתנה סביבה. השמות בדיוק כמו בטבלה. הסשן הבא שלי קורא אותם משם, ואני מעביר אותם ל-Vercel כמשתנים מסוג **Sensitive** (אחרי שמירה אי אפשר לקרוא אותם בחזרה, גם לא מהממשק).
2. **ישירות ב-Vercel (אפשרי בנוסף):** Settings → Environment Variables → Add → השם מהטבלה → לסמן **Sensitive** → Production → Save. חשוב: את `WA_ACCESS_TOKEN` לא להוסיף לפני שאני מודיע שהאתר יוצא ממצב הדגמה, כי `DEMO_MODE=1` מסרב לעלות כשהוא מוגדר (`docs/deploy.md` §1). `META_APP_SECRET` אפשר כבר עכשיו.
3. גם בסביבת Claude צריך את הטוקן: ממשתנה Sensitive ב-Vercel אי אפשר לקרוא את הערך, ואני צריך אותו לבדיקות ולרישום התבניות.

**אם בכל זאת סוד הודבק בצ'אט:** אני מעביר אותו מיד ל-Vercel כ-Sensitive ולא מעתיק אותו לשום קובץ או commit. אבל ההמלצה היא להחליף אותו בהקדם, כי הוא נשאר בהיסטוריית השיחה:
- **טוקן:** System users → `alze-server` → **Revoke tokens** → Generate token חדש (סעיף 5) → להעביר בדרך המאובטחת.
- **App Secret:** App settings → Basic → App secret → **Reset** → להעביר את החדש בדרך המאובטחת. עד שהחדש מוגדר אצלנו, ה-webhook דוחה הודעות (401) ו-Meta מנסה שוב עד 7 ימים, כך ששום הודעה לא הולכת לאיבוד.
