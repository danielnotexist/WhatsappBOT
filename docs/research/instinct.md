# מחקר: Instinct - מה הסוכן האישי של Spear Street Technology עושה, ומה מזה מתאים לעלזה

**תאריך:** 23.10.2026 · **סטטוס:** מחקר רשת בלבד, ללא שינויי קוד · **מסמכים קשורים:** `docs/PLAN.md`, `docs/legal/meta-ai-clause-memo.md`, `docs/research/connectors-israel.md`

**שיטה.** עדיפות למקורות ראשוניים: אתר Instinct, תנאי השימוש ומדיניות הפרטיות (נשלפו ב-23.10.2026), פוסטים של המייסד ב-X ופרק פודקאסט עם המייסד. אחריהם עיתונות. X, The Verge, WIRED, CNN, Forbes ו-The Information לא נפתחו ישירות (חסימה או חומת תשלום), ולכן נקראו דרך העתקים, תקצירים או תקצירי חיפוש. זה מסומן ליד כל טענה.

**מקראה:**
- **[ראשוני]** - מקור של Instinct עצמה, של המייסד או של שותף רשמי.
- **[עיתונות]** - כתבה שנקראה ישירות.
- **[משני]** - העתק, תקציר חיפוש, אגרגטור או בלוג של מתחרה.
- **[לא מאומת]** / **[סותר]** - כמשמעו.
- נתוני שימוש (משתמשים, נפח עסקאות, צמיחה) הם הצהרות של החברה, ואף אחד מהם לא אומת באופן עצמאי.

---

## 1. תקציר מנהלים

**מה זה.** Instinct הוא סוכן אישי שעובד בהזמנה בלבד. מפעילה אותו Spear Street Technology, Inc. מסן פרנסיסקו, והמייסד הוא נח שין (Noah Shinn), לשעבר חוקר ב-Sierra ([תנאי שימוש](https://instinct.com/terms) [ראשוני]; [TechCrunch 24.8](https://techcrunch.com/2026/08/24/instincts-powerful-ai-assistant-is-raising-privacy-and-security-concerns/) [עיתונות]). אין לו אפליקציה. כותבים לו ב-SMS, ב-iMessage, ב-WhatsApp או במייל, או מתקשרים אליו. לסוכן יש מספר טלפון, כתובת מייל ומחשב משלו, והוא "מאומן להשתמש בטלפון ובמחשב כמו שבני אדם עושים" ([instinct.com](https://instinct.com/) [ראשוני]; [Invest Like the Best](https://podcasts.apple.com/ae/podcast/noah-shinn-building-instinct-the-personal-agent/id1154105909?i=1000792019848) [ראשוני]). השירות חינמי למשתמשים. המודל העסקי המתוכנן הוא עמלה מסוחרים ([תמליל הפודקאסט](https://podscripts.co/podcasts/invest-like-the-best-with-patrick-oshaughnessy/noah-shinn-building-instinct-the-personal-agent-invest-like-the-best-ep493) [ראשוני]).

**ההבדל המהותי מעלזה.** עלזה מציעה, מנסחת ומבקשת אישור. Instinct **מבצע** בעצמו: נכנס לאתרים, ממלא טפסים, משלם, מתקשר, מבטל ומזמין. חלק מהפעולות האלה הוא מבצע בלי לשאול. גם הכשלים המתועדים שלו נובעים משם: מייל שנשלח בלי אישור, הזמנה שבוטלה בניגוד לתנאי שהמשתמש קבע, וחשבון Resy שנחסם (פירוט בסעיף 5).

**10 היכולות המרכזיות שאין בעלזה היום:**

| # | יכולת | מצב ב-Instinct |
|---|---|---|
| 1 | ביצוע משימות אינטרנט מקצה לקצה במחשב ענן משלו: התחברות לאתרים, טפסים, צ'קאאוט, כולל כספת סיסמאות (Vault) וקודי אימות דו-שלבי (TOTP) | פעיל |
| 2 | תשלומים: כרטיס וירטואלי חד-פעמי מ-Stripe Link לכל רכישה, אחרי שהמשתמש מאשר את הסכום. בנוסף, צ'קאאוט Shop Pay אצל סוחרי Shopify | פעיל (ארה"ב) |
| 3 | שיחות טלפון לעסקים בשם המשתמש (Concierge), וגם שיחה יזומה למשתמש כשמשהו דחוף | Early access |
| 4 | נסיעות: הזמנה ושינוי, מימוש זיכויים, מעקב אחרי ירידת מחירים, צ'ק-אין, החזרים. לפי החברה, זו מחצית מנפח העסקאות | פעיל |
| 5 | מסעדות וכרטיסים: הזמנה, מעקב אחרי זמינות, תפיסת ביטולים | פעיל |
| 6 | קניות ומשלוחים (מכולת, DoorDash, Amazon), והמלצות מוצרים יזומות (Selections) | פעיל, שנוי במחלוקת |
| 7 | מנויים וחשבונות: איתור מנויים דרך הבנק והמייל, ביטול, מיקוח על חשבונות, תשלום קנסות | פעיל |
| 8 | פרואקטיביות: הסוכן "מתעורר" לבד, עוקב אחרי שיחות שנתקעו, מתריע על פישינג ומסמן התנגשויות ביומן | פעיל |
| 9 | רשת Instinct-to-Instinct לתיאום בין סוכנים ולהעברת קבצים, קבוצות צ'אט, וחיבור לסוכני שירות לקוחות (Sierra, Decagon) | פעיל וחלקי |
| 10 | זהות דיגיטלית משלו: מספר וכתובת מייל. בפיתוח: אפליקציית Mac שקוראת ושולחת iMessage ומריצה דפדפן מקומי, וחיבור ל-WHOOP | חלקי, דליפה |

**ממצא רוחבי קריטי לעלזה.** לפי סעיף 4.7 בתנאים של Meta, אסור ל-"AI Providers" להשתמש ב-WhatsApp Business Platform כשה-AI הוא הפונקציה העיקרית. ההחרגה היא רק בשווקים ש-Meta מפרטת ([תנאי Meta](https://www.facebook.com/legal/Meta-Terms-for-WhatsApp-Business-Platform) [ראשוני]). בעמוד התמחור של Meta נכון ל-15.10.2026 רשומים איטליה, ברזיל, 29 שווקים אירופיים וטורקיה. **ישראל לא ברשימה** ([Meta: AI Providers](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing/ai-providers.md) [ראשוני]). התזכיר הקיים (`docs/legal/meta-ai-clause-memo.md`) מגן על עלזה בטענה שהיא "שירות משרדי" ולא עוזר כללי. אימוץ יכולות צרכניות כלליות כמו קניות, נסיעות, מסעדות וגלישה חופשית יחליש את הטענה הזו ישירות. לכן ההמלצות כאן מעדיפות יכולות שנשארות בתוך "המשרד של העסק".

**5 המלצות לעלזה (פירוט בסעיפים 7 ו-8):**
1. **מנוע פרואקטיבי מתוך המייל והיומן:** מעקב אחרי מיילים שלא נענו, חילוץ מועדים, תדריך לפני פגישה והתנגשויות ביומן. כל אלה מגיעים כהצעה עם כפתור. ערך גבוה, אין מחבר חדש, ומתאים לסעיף 4.7.
2. **מגן פישינג והונאות העברה (BEC):** סימון מיילים חשודים, ובמיוחד "שינוי פרטי חשבון בנק", לפני שהמשתמש פועל. Instinct קיבל על כך שבחים ב-WIRED.
3. **גבייה בתוך השיחה:** קישור תשלום ללקוח של העסק דרך הסולק של העסק עצמו, וחשבונית, הכול באישור. עלזה לא נוגעת בכסף.
4. **שכבת בטיחות שלומדת מהכשלים של Instinct:** "שומר" נפרד שבודק כל פעולה יוצאת, תנאים של המשתמש שנאכפים בקוד, מחיקה אמיתית בניתוק חיבור, דף סטטוס, אין אימון על נתוני לקוחות ואין רישיון רחב בתנאים.
5. **שיחות קוליות בעברית, בשלב מאוחר ובהדרגה.** קודם שיחה יוצאת למשתמש עצמו בהתראה דחופה. אחר כך פיילוט של שיחות תיאום לעסקים, עם גילוי שמדובר ב-AI, תמליל, ואישור לפני כל התחייבות. **לא לאמץ:** קניות, נסיעות, שמירת כרטיס אשראי וצ'קאאוט אוטונומי.

---

## 2. החברה במספרים

| נושא | נתון | מקור ואמינות |
|---|---|---|
| ישות | Spear Street Technology, Inc. d/b/a Instinct, סן פרנסיסקו. נרשמה בקליפורניה באפריל 2026 | [תנאי שימוש](https://instinct.com/terms) [ראשוני]; [TFN](https://techfundingnews.com/noah-shinns-instinct-goes-from-100m-to-2-5b-in-weeks-23-year-olds-ai-assistant-just-raised-250m-series-b/) [עיתונות] |
| ציר זמן | **[סותר]** בטא פרטית מפברואר 2026 ובטא בהזמנה מאוגוסט ([Fortune](https://fortune.com/2026/09/30/noah-shinn-instinct-ai-assistant-meta-muse-alexandr-wang-tech-series-c-ai-agent-mark-zuckerberg/)). בתיאור הפודקאסט: "המוצר בן כשנה" ([Apple Podcasts](https://podcasts.apple.com/ae/podcast/noah-shinn-building-instinct-the-personal-agent/id1154105909?i=1000792019848)). הרישום הוא מאפריל 2026 | שלושה מקורות לא מתיישבים |
| מייסד | נח שין, בן 23. עזב את Northeastern ב-2023, היה מהעובדים הראשונים ב-Sierra, כותב ראשון של מאמר Reflexion ושותף ל-τ-bench | [Fortune](https://fortune.com/2026/09/30/noah-shinn-instinct-ai-assistant-meta-muse-alexandr-wang-tech-series-c-ai-agent-mark-zuckerberg/) [עיתונות]; [layer3labs](https://www.layer3labs.io/guides/who-is-noah-shinn) [משני] |
| גיוסים | סיד לפי שווי 50 מיליון דולר (Conviction, Greenoaks). A: 75 מיליון לפי 500 מיליון (Kleiner Perkins). B: 250 מיליון לפי 2.5 מיליארד (Index, Benchmark, 26.8). C: מיליארד לפי 10 מיליארד (Sequoia, Benchmark, Coatue, 28.9) | [TFN](https://techfundingnews.com/noah-shinns-instinct-goes-from-100m-to-2-5b-in-weeks-23-year-olds-ai-assistant-just-raised-250m-series-b/) [עיתונות]; [TechCrunch 28.9](https://techcrunch.com/2026/09/28/viral-ai-agent-instinct-raises-1b-series-c-at-a-10b-valuation/) [עיתונות]. **[סותר]** בכותרת של TFN מופיע "100 מיליון", ובגוף הכתבה 50 מיליון |
| עובדים | 14 | [Skift 28.9](https://skift.com/2026/09/28/instincts-app-is-fueled-by-travel-founder-says-its-half-of-volume/), בציטוט DealBook [עיתונות] |
| משתמשים | יותר מ-100,000 (ספטמבר) | The Information דרך [Crypto Briefing ב-X](https://x.com/Crypto_Briefing/status/2100057273162981781) [משני, לא מאומת] |
| צמיחה | כ-10% ביום, בלי הוצאה על שיווק. הגדילה מוגבלת בכוח מחשוב | [Apple Podcasts](https://podcasts.apple.com/ae/podcast/noah-shinn-building-instinct-the-personal-agent/id1154105909?i=1000792019848) [ראשוני]; [Fortune](https://fortune.com/2026/09/30/noah-shinn-instinct-ai-assistant-meta-muse-alexandr-wang-tech-series-c-ai-agent-mark-zuckerberg/) [עיתונות] |
| נפח עסקאות | "מיליארד דולר בשנה או יותר", כמחציתו נסיעות. אופן החישוב לא פורסם | [Skift 28.9](https://skift.com/2026/09/28/instincts-app-is-fueled-by-travel-founder-says-its-half-of-volume/) [עיתונות, הצהרת המייסד] |
| הוצאה למשתמש | "משתמשים שקונים מוציאים בממוצע מעל 1,300 דולר בחודש דרך Instinct" | פוסט של שין ב-X דרך [תקציר חיפוש](https://x.com/noahrshinn/status/2093368510449877180) [ראשוני, משני בגישה] |
| מחיר | חינם בבטא. התנאים מאפשרים גביית דמי שימוש בעתיד, וקובעים ש"כל התשלומים אינם מוחזרים" | [תנאי שימוש §4](https://instinct.com/terms) [ראשוני] |
| מודל עסקי | שיעור עמלה (take rate) אחיד מסוחרים, "לא 30%". המייסד הצהיר שלא יהיו פרסומות | [תמליל](https://podscripts.co/podcasts/invest-like-the-best-with-patrick-oshaughnessy/noah-shinn-building-instinct-the-personal-agent-invest-like-the-best-ep493) [ראשוני]. בניגוד לזה, Selections (סעיף 3.6) נראה כמו מנגנון המלצות מסחרי ([TechCrunch 30.9](https://techcrunch.com/2026/09/30/instincts-new-product-recommendations-are-giving-some-users-the-ick/)) |
| זמינות | בהזמנה בלבד. לכל משתמש 5 הזמנות, ויש מי שמוכר הזמנות ב-eBay. השירות "מופעל בארה"ב", ומשתמשים מחוץ לה ניגשים "ביוזמתם" | [Fortune](https://fortune.com/2026/09/30/noah-shinn-instinct-ai-assistant-meta-muse-alexandr-wang-tech-series-c-ai-agent-mark-zuckerberg/); [תנאי שימוש §6](https://instinct.com/terms) [ראשוני]. לא נמצא מידע על עברית או על ישראל |

---

## 3. מלאי יכולות

בכל יכולת: **מה** היא עושה, **איך** היא עובדת לפי מה שפורסם, **אישור** (האם המשתמש מאשר), ו**מגבלות** (כשלים ומגבלות מתועדים).

### 3.1 ממשק וערוצים
- **מה:** אין אפליקציה. SMS, iMessage, WhatsApp, מייל ושיחה קולית ([instinct.com](https://instinct.com/) [ראשוני]; [The Verge דרך progressiverobot](https://www.progressiverobot.com/2026/10/09/instinct-vs-muse-buzziest-ai-agent-survive-meta-hands-on/) [משני]). לפי החברה, חלק מהמשתמשים שולחים יותר מ-90% מההודעות בהקלטה קולית ([asymmetriccuriosity](https://asymmetriccuriosity.substack.com/p/instinct-an-assistant-with-a-phone) [משני]). דווח גם על תמיכה ב-CarPlay ובשעונים חכמים ([progressiverobot](https://www.progressiverobot.com/2026/10/09/instinct-vs-muse-buzziest-ai-agent-survive-meta-hands-on/) [משני]).
- **איך:** המייסד אמר שיותר מ-50% מהתעבורה לא עוברת ב-iMessage, ושהמטרה היא להופיע "בערוצים שבהם המשתמשים כבר נמצאים". המראיין שאל על הסיכון ש-WhatsApp ייחסם, והמייסד לא ענה ישירות ([תמליל](https://podscripts.co/podcasts/invest-like-the-best-with-patrick-oshaughnessy/noah-shinn-building-instinct-the-personal-agent-invest-like-the-best-ep493) [ראשוני]). **[לא מאומת]** איך Instinct מחובר ל-WhatsApp: לא נמצא מקור שמסביר אם זה דרך Business API או בדרך אחרת. לא נמצא גם דיווח על חסימה מצד Meta.
- **עיקרון עיצוב:** "להתמקד רק בהבנה" (understandability): המשתמש צריך לצפות מה הסוכן יעשה, והמידע החשוב מופיע בתחילת ההודעה ([asymmetriccuriosity](https://asymmetriccuriosity.substack.com/p/instinct-an-assistant-with-a-phone) [משני]).

### 3.2 מחשב משלו, דפדפן ופעולות באתרים
- **מה:** "יכול לעשות כמעט כל דבר שאדם עושה אונליין": מתחבר לחשבונות, ממלא טפסים, מאפס סיסמאות ומשלים רכישות ([תמליל](https://podscripts.co/podcasts/invest-like-the-best-with-patrick-oshaughnessy/noah-shinn-building-instinct-the-personal-agent-invest-like-the-best-ep493) [ראשוני]). דוגמה: אתר קניות חסם את הסוכן, הוא איפס סיסמה והשלים את הרכישה ([usecarly, עם קישורים לפוסטים](https://www.usecarly.com/blog/what-is-instinct-ai/) [משני]).
- **איך:**
  - **מחשב ענן לכל משתמש.** סוכן שעובד דרך המסך יכול לפעול גם בשירותים שאין להם API ([cellcog](https://cellcog.ai/blog/what-is-instinct-ai/) [משני, מתחרה]).
  - **Vault:** כספת לפרטי התחברות. לפי המייסד, 32% מהמשתמשים שומרים בה פרטים ([פוסט ב-X](https://x.com/noahrshinn/status/2095911123291881608) [ראשוני דרך תקציר]). לפי התנאים, תוכן ה-Vault לא משמש לאימון ([תנאי שימוש §3](https://instinct.com/terms) [ראשוני]). סיסמאות מתבקשות דרך קישור ל"כספת מאובטחת" ([The Verge דרך progressiverobot](https://www.progressiverobot.com/2026/10/09/instinct-vs-muse-buzziest-ai-agent-survive-meta-hands-on/) [משני]).
  - **TOTP (11.9):** הסוכן מייצר בעצמו קודי אימות דו-שלבי, בתקן של Google Authenticator, Authy ו-Microsoft Authenticator ([פוסט ב-X](https://x.com/noahrshinn/status/2098466184912089143) [ראשוני דרך תקציר]). קודם לכן הוא שלף קודים מהמייל של המשתמש ([Simon Taylor](https://threadreaderapp.com/thread/2093637347510309331.html) [משני]).
  - **כתובת מייל משלו (8.9):** כתובת ב-mail.instinct.com, "הצעד הראשון לכך ש-Instinct יחזיק ויפעיל חשבונות משלו" ([פוסט ב-X](https://x.com/noahrshinn/status/2097443132816396649) [ראשוני דרך תקציר]).
  - **1Password (4.9):** הוכרזה שותפות להעברת פרטי התחברות. ב-22.10 הושק "1Password for Agents", וברשימת השותפים מופיע Instinct. 1Password ממלאת את הסיסמה בטופס אחרי אישור במכשיר של המשתמש, בלי שהסוכן רואה את הסיסמה. **[לא מאומת]** אם האינטגרציה כבר פעילה ב-Instinct ([9to5Google](https://9to5google.com/2026/10/22/1password-will-let-ai-agents-use-your-passwords-without-seeing-them/) [עיתונות]; [סקירת חיפוש](https://explainx.ai/blog/instinct-1password-ai-agent-account-vaults-2026) [משני]).
  - **אפליקציית Mac (דליפה, 29.8):** צילום מסך של החוקרת Jane Manchun Wong מראה לשונית "Desktop" בבטא: קריאת שיחות iMessage אחרונות ושליחה מה-Mac, דפדפן מקומי למשימות הסוכן, וחיבור ל-WHOOP (נתוני בריאות) ([Runtimewire](https://runtimewire.com/article/instinct-mac-app-imessage-local-browser-whoop) [עיתונות]). התנאים הנוכחיים חלים במפורש גם על "Mac OS and other apps" ([תנאי שימוש](https://instinct.com/terms) [ראשוני]).
- **אישור:** התנאים מסמיכים את השירות "לפעול כסוכן שלך להתקשר בהסכמים, התחייבויות ועסקאות", כש"אלה מחייבים אותך כאילו נעשו ישירות על ידך". החברה "עשויה" להוסיף אישורים לפעולות מסוימות, אבל אינה מתחייבת שהם ימנעו טעויות ([תנאי שימוש §3](https://instinct.com/terms) [ראשוני]).
- **מגבלות:** CAPTCHA, אימות דו-שלבי ותהליכים שבירים. למחשב ענן אין עוגיות ואין "זהות רשת ביתית" כמו למחשב של המשתמש. בניסיון לקנות כרטיסים היו קריסות ואיבוד מקום בתור, ואדם השלים את הקנייה ([usecarly](https://www.usecarly.com/blog/what-is-instinct-ai/) [משני, עם קישורים לפוסטים]). סוחרים חוסמים לפעמים את הסוכן ([Simon Taylor](https://threadreaderapp.com/thread/2093637347510309331.html) [משני]).

### 3.3 תשלומים
- **מה:** רכישות ותשלומים בשם המשתמש. לפי המייסד, כ-40% מהמשתמשים מסרו כרטיס אשראי אישי בתוך כשלושה שבועות, ושיעור השימור אצל מי שמוסר מידע רגיש הוא כ-80% ([תמליל](https://podscripts.co/podcasts/invest-like-the-best-with-patrick-oshaughnessy/noah-shinn-building-instinct-the-personal-agent-invest-like-the-best-ep493) [ראשוני]).
- **איך:**
  - **לפני אוגוסט:** הכרטיס נשמר אצל Instinct, ואימות דו-שלבי עבר דרך המייל של המשתמש. Simon Taylor תיאר זאת כחשוף לפישינג ([Simon Taylor](https://threadreaderapp.com/thread/2093637347510309331.html) [משני]).
  - **מסוף אוגוסט, Stripe Link:** לכל רכישה הסוכן מבקש כרטיס וירטואלי חד-פעמי בסכום מסוים. המשתמש מאשר את הסכום (passkey או FaceID), ו"הסוכן לא רואה את הכרטיס האמיתי" ([פוסט של שין](https://x.com/noahrshinn/status/2093368510449877180) [ראשוני דרך תקציר]; [Patrick Collison](https://x.com/patrickc/status/2093385965905842566) [ראשוני דרך תקציר]; [Stripe](https://stripe.com/blog/giving-agents-the-ability-to-pay) [ראשוני]). התהליך ב-Link: OAuth, אחר כך בקשת הוצאה עם הקשר, אישור באפליקציה, ואז החזרת כרטיס חד-פעמי או Shared Payment Token. אפשר להגביל לפי סכום, מטבע וסוחר ([Stripe](https://stripe.com/blog/giving-agents-the-ability-to-pay) [ראשוני]).
  - **Shopify (28.9):** סוכני דפדפן יכולים להשלים צ'קאאוט אצל סוחרים זכאים, כולל Shop Pay. Instinct נזכר במפורש ([PYMNTS](https://www.pymnts.com/?p=4243821) [עיתונות]). לפי סקירה, 35% מהמשתמשים משתמשים בו לקניות אישיות ([eesel](https://www.eesel.ai/blog/instinct-ai-review) [משני, לא מאומת]).
  - **מה התנאים אומרים:** "אנחנו לא מעבדים תשלום", החברה אינה צד לעסקה, ומחלוקות הן בין המשתמש לספק ([תנאי שימוש §3](https://instinct.com/terms) [ראשוני]). לפי מדיניות הפרטיות, הסוכן עשוי לקבל פרטי תשלום כדי להזמין נסיעות ([פרטיות](https://instinct.com/privacy-policy) [ראשוני]).
- **אישור:** ב-Link כל סכום מאושר. בהזמנות שאינן דרך Link (למשל מסעדה עם דמי ביטול) דווחו פעולות בלי בקשה (סעיף 5).
- **מגבלות:** ארנק הסוכנים של Link זמין לאנשים בארה"ב בלבד ([Link FAQ](https://support.link.com/questions/link-agent-wallet-faq) [ראשוני]). **[סותר]** לפי Stripe Docs, זמין בארה"ב ובקנדה ([Stripe Docs](https://docs.stripe.com/agentic-commerce/link-agent-wallet) [ראשוני]). הטבות של הכרטיס המקורי, כמו מיילים, עשויות לא לחול ([סקירת חיפוש](https://techcrunch.com/2026/04/30/stripe-link-digital-wallet-ai-agents-shopping/) [משני]).

### 3.4 שיחות טלפון (Concierge) ושיחות למשתמש
- **מה:** הוכרז ב-16.9: "שירות white glove למקרים שדורשים מגע אישי", כמו מסעדה בלי הזמנה אונליין, רשימת ביטולים אצל רופא שיניים ובעיה בחשבון הכבלים. זמין ב-early access ([TechCrunch 17.9](https://techcrunch.com/2026/09/17/rival-ai-agents-instinct-and-metas-muse-both-add-the-ability-to-make-calls/) [עיתונות]). בנוסף, הסוכן מתקשר למשתמש כשמשהו דחוף. דוגמה: בשעה 14:55 התקשר להזכיר מסמך שצריך לחתום עליו עד 15:00. לפי המייסד, זה קרה לו כשלוש פעמים בכמה חודשים ([asymmetriccuriosity](https://asymmetriccuriosity.substack.com/p/instinct-an-assistant-with-a-phone) [משני]; [תמליל](https://podscripts.co/podcasts/invest-like-the-best-with-patrick-oshaughnessy/noah-shinn-building-instinct-the-personal-agent-invest-like-the-best-ep493) [ראשוני]).
- **איך:** לא פורסם: לא אם השיחות מוקלטות, לא אם הסוכן מזדהה כ-AI, ולא אם יש מעורבות אנושית ([TechCrunch 17.9](https://techcrunch.com/2026/09/17/rival-ai-agents-instinct-and-metas-muse-both-add-the-ability-to-make-calls/)). המונח "white glove" מרמז אולי על מעורבות אנושית **[לא מאומת]**.
- **אישור:** לפי תיעוד המשימות כפי שדווח, הסוכן מדווח בחזרה ולא מתחייב להזמנה בלי אישור ([Search Engine Watch דרך תקציר חיפוש](https://searchenginewatch.com/instinct-lands-1-billion-to-build-an-ai-assistant-that-actually-runs-your-errands/) [משני]).
- **הרחבה (7.10):** "שירות לקוחות מובנה". כש-Instinct פונה לעסק שמשתמש בסוכן של Sierra או של Decagon, שני הסוכנים פותרים את הבעיה בלי שיחת טלפון. עסקים משתתפים לא פורסמו ([פוסט ב-X](https://x.com/noahrshinn/status/2107875073038385546) [ראשוני דרך תקציר]). Instinct ברשימת השותפים של Personal Agent Protocol של Sierra ו-Meta, שהוכרז ב-6.10 ([unite.ai](https://unite.ai/sierra-unveils-personal-agent-protocol-built-with-meta-and-partners) [עיתונות]). **[משני]** לפי דיווח, פרוטוקול PACT של Decagon פותח יחד עם Instinct ([ai-agent.review](https://ai-agent.review/news/decagon-pact-support-agent-permissions/)).

### 3.5 נסיעות ומסעדות
- **מה:** הזמנה ושינוי של נסיעות מתוך שרשור הודעות, מימוש זיכויים שנשכחו אצל חברות תעופה, מעקב אחרי ירידת מחירים, ישיבה משותפת למשפחה, והוספה ליומן ([Skift 4.9](https://skift.com/2026/09/04/a-viral-ai-bot-just-showed-travel-what-frictionless-actually-means/) [עיתונות]). דוגמה ב-WIRED: הסוכן זיהה ש-Alaska הקדימה טיסה ב-90 דקות, ולכן הכרטיס זכאי להחזר מלא. הוא ביטל, חסך כ-550 דולר והזמין טיסה חלופית. הוא גם הזמין מסעדות בוונציה, כולל פנייה ב-WhatsApp למקומות קטנים ([WIRED דרך winzheng](https://www.winzheng.com/en/article/ai-agent-instinct-review-risk) [משני]). דווח גם על צ'ק-אין לטיסות ([eesel](https://www.eesel.ai/de/blog/instinct-ai-test) [משני]).
- **איך:** המייסד טוען שהזמנות ייעשו לפי "אירוע" ולא לפי "מי שהקדים" ([תמליל](https://podscripts.co/podcasts/invest-like-the-best-with-patrick-oshaughnessy/noah-shinn-building-instinct-the-personal-agent-invest-like-the-best-ep493) [ראשוני]). לפי Skift, האוטומציה "מדלגת על שלבי אישור מקובלים" ([Skift 4.9](https://skift.com/2026/09/04/a-viral-ai-bot-just-showed-travel-what-frictionless-actually-means/)).
- **מגבלות:**
  - ציטוט שגוי של מחירי מלונות ([Skift 4.9](https://skift.com/2026/09/04/a-viral-ai-bot-just-showed-travel-what-frictionless-actually-means/)).
  - חשבון Resy נחסם אחרי כ-200 בקשות API בשעה (בדיקה כל ~0.4 שניות). Resy: "לא מתירים בוטים או סוכנים לא מאושרים". החשבון שוחזר ([CNN דרך SeatSwiper](https://guides.seatswiper.com/instinct-ai-restaurant-reservations) [משני]).
  - הזמנה למסעדה בטוקיו בלי שהמשתמש ביקש, עם דמי ביטול של 100% (שם).
  - במבחן של The Verge: הסוכן הסיק עיר לא נכונה מקידומת הטלפון, ופספס קורס שהוא דרישת קדם ([progressiverobot](https://www.progressiverobot.com/2026/10/09/instinct-vs-muse-buzziest-ai-agent-survive-meta-hands-on/) [משני]).

### 3.6 קניות, משלוחים והמלצות (Selections)
- **מה:** מכולת, פרחים, מצרכים למתכון ורכבת לסוף השבוע ([instinct.com](https://instinct.com/) [ראשוני]). כרטיסים ומעקב אחרי ביטולים ב-IMAX ([usecarly](https://www.usecarly.com/blog/what-is-instinct-ai/) [משני]). החזרה ל-Ikea כולל מילוי הטפסים ([progressiverobot](https://www.progressiverobot.com/2026/10/09/instinct-vs-muse-buzziest-ai-agent-survive-meta-hands-on/) [משני]). המייסד הציג גם "ארון בגדים": המשתמש סורק את הבגדים ומקבל תוכנית לבוש שבועית בתמונות של עצמו, עם אפשרות להזמין ([asymmetriccuriosity](https://asymmetriccuriosity.substack.com/p/instinct-an-assistant-with-a-phone) [משני]).
- **Selections (29.9):** רשימות שאוצרו בידי "שפים מקומיים, מעצבים, אדריכלים ומדריכי טיולים", ונדחפות למשתמשים בלי שביקשו. התגובה הייתה שלילית: "לא הייתי צריכה מזוודה, משקפי שמש וכובע", ו-"ewwww" על המלצה שנגזרה מהמיילים. החברה לא אמרה אם היא מרוויחה מההמלצות ([TechCrunch 30.9](https://techcrunch.com/2026/09/30/instincts-new-product-recommendations-are-giving-some-users-the-ick/) [עיתונות]). יום קודם המייסד אמר בפודקאסט שהסוכן "לא יפעל נגד רצון המשתמש" (שם).
- **מגבלות:** הזמנה מ-Amazon דרשה 13 הודעות במקום שתי הקשות ([usecarly](https://www.usecarly.com/blog/what-is-instinct-ai/) [משני]). הסוכן ביטל משלוח DoorDash למרות הוראה מפורשת לבטל רק אם יש החזר, והמשתמש הפסיד 64 דולר. החברה התנצלה ולא פיצתה ([WIRED דרך winzheng](https://www.winzheng.com/en/article/ai-agent-instinct-review-risk) [משני]).

### 3.7 מנויים, חשבונות ועניינים אדמיניסטרטיביים
- **מה:** איתור מנויים נשכחים דרך גישה לבנק ולמייל, התחברות, אישור מייל הביטול, ביטול ודיווח על החיסכון ("עד הסוף", לפי המייסד) ([asymmetriccuriosity](https://asymmetriccuriosity.substack.com/p/instinct-an-assistant-with-a-phone) [משני]). דוגמאות מפוסטים של משתמשים: הורדת חשבון Comcast, תשלום קנסות כביש, מציאת רופא בתוך הרשת של הביטוח, ומיקוח על מנויים (כ-200 דולר בשנה) ([usecarly](https://www.usecarly.com/blog/what-is-instinct-ai/) [משני, עם קישורים לפוסטים]). תשלום חשבונות מופיע ברשימת היכולות של TechCrunch ([TechCrunch 28.9](https://techcrunch.com/2026/09/28/viral-ai-agent-instinct-raises-1b-series-c-at-a-10b-valuation/) [עיתונות]).

### 3.8 מייל, יומן, קבצים ועבודה
- **מה:** ניקוי תיבת דואר, follow-ups, ניהול CRM, הכנת חדר נתונים למשקיעים ([TechCrunch 24.8](https://techcrunch.com/2026/08/24/instincts-powerful-ai-assistant-is-raising-privacy-and-security-concerns/) [עיתונות]). מציאת מייל חשוב בספאם והשלמת אירועים חסרים ביומן ([usecarly](https://www.usecarly.com/blog/what-is-instinct-ai/) [משני]). סימון התנגשות ביומן בלי שהתבקש ([progressiverobot](https://www.progressiverobot.com/2026/10/09/instinct-vs-muse-buzziest-ai-agent-survive-meta-hands-on/) [משני]).
- **חיבורים:** Google Workspace: Gmail, Calendar, Drive, Docs, Sheets, Slides ו-Tasks ([פרטיות](https://instinct.com/privacy-policy) [ראשוני]). Slack ו-Notion ([progressiverobot](https://www.progressiverobot.com/2026/10/09/instinct-vs-muse-buzziest-ai-agent-survive-meta-hands-on/) [משני]). **[לא מאומת]** Microsoft 365 / Outlook: לא נמצא אזכור. זה רלוונטי, כי M365 הוא החיבור העיקרי של עלזה.
- **קבצים:** קבצים משותפים ואינטראקטיביים, והעברת PDF, תמונות וגיליונות בין סוכנים, "מוצפן מקצה לקצה" ([cellcog](https://cellcog.ai/blog/what-is-instinct-ai/); [eesel](https://www.eesel.ai/blog/instinct-ai-review)) [משני, לא נמצא פוסט ראשוני].

### 3.9 פרואקטיביות
- **מה:** הסוכן "מתעורר וישן" לאורך היום, בודק בשש בבוקר מה יש היום ומתחיל לבד עבודה שלא התבקשה. עבודת רקע נמשכת דקות או שעות ([asymmetriccuriosity](https://asymmetriccuriosity.substack.com/p/instinct-an-assistant-with-a-phone) [משני]; [תמליל](https://podscripts.co/podcasts/invest-like-the-best-with-patrick-oshaughnessy/noah-shinn-building-instinct-the-personal-agent-invest-like-the-best-ep493) [ראשוני]). הוא מציע פעולות ומבצע אותן. ב-WIRED הוא זיהה שינוי בטיסה שהמשתמש פספס, וסימן מייל פישינג כ-"NOT TO OPEN" ([WIRED דרך winzheng](https://www.winzheng.com/en/article/ai-agent-instinct-review-risk) [משני]).
- **איזון:** לפי WIRED, Instinct שולח פחות הודעות מ-Lindy, שהכותב מחק אחרי שנשלחו לו הודעות יומיות והסוכן הצטרף לפגישות Zoom בלי אישור (שם). Selections היא דוגמה לפרואקטיביות שנכשלה (3.6).
- **מגבלות:** בהאטה של ספטמבר תזכורות הגיעו באיחור, והתראות על מיילים לא הגיעו ([Business Insider דרך Yahoo](https://sg.news.yahoo.com/instinct-users-theyve-noticed-slowdown-163111405.html) [עיתונות]).

### 3.10 זיכרון והתאמה אישית
- **מה:** שמירת העדפות לצורך הזמנות עתידיות, כמו "It will be able to use that memory" ([Fortune](https://fortune.com/2026/09/30/noah-shinn-instinct-ai-assistant-meta-muse-alexandr-wang-tech-series-c-ai-agent-mark-zuckerberg/) [עיתונות]). בנסיעות הוא משתמש בהעדפות השמורות ובזיכויים קיימים ([Skift 28.9](https://skift.com/2026/09/28/instincts-app-is-fueled-by-travel-founder-says-its-half-of-volume/)). המייסד מתאר בניית אמון הדרגתית: המשתמש משתף "בקצב שנוח לו" ויכול לבטל גישה בכל רגע ([asymmetriccuriosity](https://asymmetriccuriosity.substack.com/p/instinct-an-assistant-with-a-phone) [משני]).
- **מגבלות:** שרשור אחד ארוך שומר על הקשר, אבל מתקשה לעקוב אחרי הרבה משימות לא קשורות ([eesel, עם קישור לפוסט](https://www.eesel.ai/blog/instinct-ai-review) [משני]). לא פורסם ממשק "מה אתה יודע עליי".

### 3.11 רשת Instinct-to-Instinct וקבוצות
- **רשת אנשים מהימנים (9.9, ופתוחה לכולם מ-14.9):** הסוכנים מתאמים ביניהם זמנים ותוכניות. לכל איש קשר נקבעת רמת גישה: לבן הזוג הכול, לעמית רק היומן של העבודה ([פוסט ב-X](https://x.com/noahrshinn/status/2097794967574028448) [ראשוני דרך תקציר]; [asymmetriccuriosity](https://asymmetriccuriosity.substack.com/p/instinct-an-assistant-with-a-phone) [משני]). המייסד דיווח על יותר מ-300 אלף תיאומים בשבוע הראשון ([eesel](https://www.eesel.ai/blog/instinct-ai-review) [משני, לא מאומת]).
- **קבוצות (5.10, early access):** Instinct נפרד מצטרף לקבוצה ועובד בשביל כולם, גם בשביל חברים בלי חשבון. הסוכן האישי מבקש רשות לפני שהוא מתחבר לסוכן הקבוצה. לסוכן הקבוצה אין גישה לחשבונות האישיים, ותשובות ממתינות מוחזקות כשמצטרף חבר חדש ([TechCrunch 5.10](https://techcrunch.com/2026/10/05/instinct-brings-its-ai-agent-to-group-chats-even-for-friends-without-an-account/) [עיתונות]).

### 3.12 מיקום, אודיו, מסך ובריאות
- **מה:** החברה מצהירה על חיבור ל"מייל, הודעות, מסך, אודיו, מיקום ועוד" ([PYMNTS](https://www.pymnts.com/news/artificial-intelligence/2026/personal-ai-agent-instinct-quadruples-valuation-to-10-billion-in-1-month/) [עיתונות]; [eesel](https://www.eesel.ai/blog/instinct-ai-review) [משני]). מדיניות הפרטיות הנוכחית מזכירה מיקום מדויק (אם המשתמש משתף), אודיו (אם הופעל), clickstream (הקשות, קליקים, מיקום סמן) ומידע רגיש כמו בריאות ופרטי התחברות לחשבונות צד שלישי ([פרטיות](https://instinct.com/privacy-policy) [ראשוני]). התנאים הקודמים כיסו גם צילומי מסך, תנועות סמן והקשות מקלדת ([TechCrunch 24.8](https://techcrunch.com/2026/08/24/instincts-powerful-ai-assistant-is-raising-privacy-and-security-concerns/) [עיתונות]). WHOOP מופיע רק בדליפה (3.2).

### 3.13 מחקר ומסמכים
- מחקר, השוואות ותכנון חתונה ([Fortune](https://fortune.com/2026/09/30/noah-shinn-instinct-ai-assistant-meta-muse-alexandr-wang-tech-series-c-ai-agent-mark-zuckerberg/) [עיתונות]). בדיקת שלוש טיסות לירח דבש מול האתרים, שמצאה שלוש טעויות ברשימות של המשתמש ([usecarly](https://www.usecarly.com/blog/what-is-instinct-ai/) [משני]). השכבה הזו פחות מתועדת, ואין עליה פרטים טכניים.

---

## 4. ארכיטקטורה, בטיחות ופרטיות (לפי מה שפורסם)

### 4.1 ארכיטקטורה
- **זהות משלו:** מספר טלפון, כתובת מייל ומחשב לכל סוכן ([TechCrunch 28.9](https://techcrunch.com/2026/09/28/viral-ai-agent-instinct-raises-1b-series-c-at-a-10b-valuation/) [עיתונות]).
- **"מאומן" להשתמש בטלפון ובמחשב:** כלומר סוכן computer-use. **[לא מאומת]** אילו מודלים משמשים. המדיניות מזכירה "ספקי מודלי AI צד שלישי" בלי שמות ([פרטיות](https://instinct.com/privacy-policy) [ראשוני]). המייסד טוען לביצועים ברמה של מודלי החזית "בעלות נמוכה מאוד", ואומר שהוא מקדיש כ-40% מהזמן לתכנון מחשוב ([תמליל](https://podscripts.co/podcasts/invest-like-the-best-with-patrick-oshaughnessy/noah-shinn-building-instinct-the-personal-agent-invest-like-the-best-ep493) [ראשוני]). השילוב הזה מרמז על אימון והרצה של מודלים משלהם, אבל זו הסקה ולא עובדה.
- **עבודת רקע:** משימות אצווה ורקע רצות על תצורות מחשוב זולות יותר ממשימות בזמן אמת (שם).
- **תלות במחשוב:** הגדילה מוגבלת בכוח מחשוב ([Fortune](https://fortune.com/2026/09/30/noah-shinn-instinct-ai-assistant-meta-muse-alexandr-wang-tech-series-c-ai-agent-mark-zuckerberg/)). בספטמבר היו האטה ותקלה, ואין דף סטטוס ([Business Insider](https://sg.news.yahoo.com/instinct-users-theyve-noticed-slowdown-163111405.html); [theagentlog, עם קישור ל-TheStreet](https://theagentlog.com/agent/instinct/) [משני]).

### 4.2 שכבות בטיחות שהמייסד תיאר
| שכבה | מה עושה | מקור |
|---|---|---|
| "חומות אש" (firewalls) | סורקות טקסט ומדיה נכנסים כדי לזהות ניסיונות להטות את הסוכן | [asymmetriccuriosity](https://asymmetriccuriosity.substack.com/p/instinct-an-assistant-with-a-phone) [משני]; [תמליל](https://podscripts.co/podcasts/invest-like-the-best-with-patrick-oshaughnessy/noah-shinn-building-instinct-the-personal-agent-invest-like-the-best-ep493) [ראשוני] |
| מוניטור נפרד | עובר על כל פעולה ו"מחשבה", ויכול לעצור, לאשר או לדחות לפני הביצוע | שם |
| בדיקת הזיות | מאמתת קריאות לכלים לפני הביצוע, במערכת נפרדת מהסוכן | [תמליל](https://podscripts.co/podcasts/invest-like-the-best-with-patrick-oshaughnessy/noah-shinn-building-instinct-the-personal-agent-invest-like-the-best-ep493) [ראשוני] |
| הודאה | גרסה מוקדמת נשלחה בלי השכבות האלה | שם |
| אישור תשלום | אישור סכום בכל רכישה דרך Link | [Stripe](https://stripe.com/blog/giving-agents-the-ability-to-pay) [ראשוני] |

**פער בין הצהרה למציאות:** אחרי שנבנו השכבות עדיין דווחו פעולות בלי אישור: מייל, הזמנה בטוקיו וביטול DoorDash (סעיף 5). לפי Skift, האוטומציה מדלגת על אישורים מקובלים. התנאים מטילים את כל האחריות על המשתמש.

### 4.3 תנאים ופרטיות: מה היה, מה השתנה, מה נשאר
| נושא | לפני 26.8.2026 | היום (נשלף 23.10.2026) |
|---|---|---|
| רישיון על תוכן המשתמש | "sub-licensable, worldwide, perpetual and irrevocable", כולל אימון מודלים ([TechCrunch 24.8](https://techcrunch.com/2026/08/24/instincts-powerful-ai-assistant-is-raising-privacy-and-security-concerns/)) | "לא טוענים לבעלות". שימוש לפיתוח ולאימון, עם opt-out שחל רק מכאן והלאה. מידע שסומן לבדיקת בטיחות עדיין עשוי לשמש לאימון. תוכן ה-Vault ונתוני Google Workspace לא משמשים לאימון ([תנאי שימוש §3](https://instinct.com/terms); [פרטיות](https://instinct.com/privacy-policy)) [ראשוני] |
| מכשיר | צילומי מסך, תנועות סמן, הקשות ([TechCrunch 24.8](https://techcrunch.com/2026/08/24/instincts-powerful-ai-assistant-is-raising-privacy-and-security-concerns/)) | בתנאים: לא מוזכר. במדיניות: clickstream (הקשות, קליקים, מיקום סמן) ([פרטיות](https://instinct.com/privacy-policy)) |
| סמכות לפעול | הסוכן מוסמך להתקשר בעסקאות מחייבות | נשאר ([תנאי שימוש §3](https://instinct.com/terms)) |
| ניתוק חיבור | המידע נשאר ונשמר בטקסט גלוי ([TechCrunch 24.8](https://techcrunch.com/2026/08/24/instincts-powerful-ai-assistant-is-raising-privacy-and-security-concerns/)) | ניתוק עדיין לא מוחק. צריך למחוק ידנית ב-app.instinct.com/workspace ([תנאי שימוש](https://instinct.com/terms); [פרטיות](https://instinct.com/privacy-policy)) |
| מחיקת חשבון | - | החברה "רשאית, אך לא חייבת" למחוק חומרים ([תנאי שימוש](https://instinct.com/terms)) |
| אבטחה | - | אין תיאור של הצפנה או הסמכות. "אין אמצעי אבטחה בלתי חדיר" ([פרטיות](https://instinct.com/privacy-policy)) |
| GDPR והעברה בינלאומית | - | לא מוזכרים. אין תקופות שמירה ([פרטיות](https://instinct.com/privacy-policy)) |
| אחריות | - | AS IS. "לא אחראים לפעולות לא מכוונות". פעולות "לא תמיד הפיכות". תקרת אחריות: הגבוה מבין 100 דולר לבין מה ששולם ב-6 חודשים. בוררות JAMS, ויתור על תביעה ייצוגית, דין קליפורניה ([תנאי שימוש §9-11](https://instinct.com/terms)) |
| אזהרות במדיניות | - | "תשלומים או תקשורת לא מכוונים", ו"הוראות מטעות שנועדו להשפיע על סוכנים אוטונומיים" ([פרטיות](https://instinct.com/privacy-policy)) |

---

## 5. כשלים ותקריות מתועדים

| תאריך | מה קרה | מקור |
|---|---|---|
| 21-22.8 | פיטר יאנג: Instinct סירב למחוק רשומות Gmail. אחר כך נוסף כלי מחיקה | [TechCrunch 24.8](https://techcrunch.com/2026/08/24/instincts-powerful-ai-assistant-is-raising-privacy-and-security-concerns/) |
| 21-22.8 | קלייר וו: הסוכן המשיך לסכם את תיבת הדואר אחרי ניתוק Google. לפי הבוט, המיילים נשמרו בטקסט גלוי | שם |
| 21-22.8 | אלכס כהן: מבחן prompt injection דרך מייל הצליח. הוא מחק את החשבון: "לא הגענו לנקודה שבה בטוח לתת ל-AI גישת קריאה וכתיבה לתיבה" | שם |
| 21-22.8 | קייטי ג'ייקובס סטנטון: מייל נשלח בשמה בלי בדיקה. "פעולה לא מורשית אחת מאפסת את האמון" | שם |
| 22.8 | הסוכן שלף קוד הרשמה מהמייל כדי להזמין מקום ב-Resy | שם |
| 9.2026 | DoorDash: ביטול בניגוד לתנאי שהמשתמש קבע, הפסד של 64 דולר | [WIRED דרך winzheng](https://www.winzheng.com/en/article/ai-agent-instinct-review-risk) [משני] |
| 21.9 | משתמש פרסם צילומים שבהם הסוכן דן במסמך פיננסי שלא סיפק. המייסד: הזיה, לא דליפה. לא הוכרע | [Runtimewire](https://runtimewire.com/article/instinct-noah-shinn-hallucination-stranger-data) |
| 21-22.9 | תקלה: הודעות לא נענו ותזכורות לא נשלחו. אין דף סטטוס. משתמש "לא ידע אילו מיילים נשלחו" | [theagentlog](https://theagentlog.com/agent/instinct/); [usecarly](https://www.usecarly.com/blog/what-is-instinct-ai/) [משני] |
| 23.9 | Resy חסמה חשבון אחרי כ-200 בקשות בשעה. הזמנה בטוקיו בלי בקשה, עם 100% דמי ביטול | [CNN דרך SeatSwiper](https://guides.seatswiper.com/instinct-ai-restaurant-reservations) [משני] |
| 24.9 | האטה ואיחור בתזכורות. משקיע הון סיכון "כמעט נטש" ועבר ל-Muse | [Business Insider](https://sg.news.yahoo.com/instinct-users-theyve-noticed-slowdown-163111405.html) |
| 29-30.9 | Selections: המלצות לא מבוקשות, תגובת נגד | [TechCrunch 30.9](https://techcrunch.com/2026/09/30/instincts-new-product-recommendations-are-giving-some-users-the-ick/) |
| שוטף | מחירי מלונות שגויים. דילוג על אישורים | [Skift 4.9](https://skift.com/2026/09/04/a-viral-ai-bot-just-showed-travel-what-frictionless-actually-means/) |

---

## 6. מתחרים בקטגוריה

| מוצר | מה שונה | זמינות ומחיר | מקור |
|---|---|---|---|
| **Meta Muse** | אפליקציה, ווב ו-**WhatsApp**. מכונה וירטואלית מבודדת לכל משתמש (Muse Secure VM). סוכן "Sentinel" נפרד מאשר כל פעולת connector וכל בקשת רשת. שיחות לעסקים בארה"ב (בטא). תקלות: שלח כתובת של יוטיובר לזר, נחסם ב-Amazon כי לא הזדהה כסוכן, ודווח שחלק משיחות המסעדה מטופלות בידי בני אדם | ארה"ב מ-8.9, קנדה מ-18.9. לא באירופה ולא בישראל. רמה חינמית. **[סותר]** לגבי מסלולים של 20 ו-100 דולר | [MarkTechPost דרך תקציר](https://www.marktechpost.com/2026/09/08/meta-introduces-muse-a-personal-ai-agent-that-runs-on-its-own-dedicated-secure-cloud-computer/) [משני]; [TechCrunch 17.9](https://techcrunch.com/2026/09/17/rival-ai-agents-instinct-and-metas-muse-both-add-the-ability-to-make-calls/); [progressiverobot](https://www.progressiverobot.com/2026/10/09/instinct-vs-muse-buzziest-ai-agent-survive-meta-hands-on/); [Medium](https://medium.com/@mateohq/meta-muse-in-the-uk-europe-and-australia-where-it-stands-in-october-2026-3342eb499e81) [משני] |
| **Meta AI בישראל** | בעברית, בתוך WhatsApp, עם אפשרות לחבר Gmail ו-Outlook. לא תוארו פעולות סוכן כמו הזמנות או שיחות. **מתחרה חינמי ישיר לחלק מהערך של עלזה** | הושק ביוני 2026 | [ynetnews](https://www.ynetnews.com/tech-and-digital/article/rk008bxwxge) |
| **OpenAI Dots** | סוכנים "always-on" עם מטרה ממושכת, בתוך ChatGPT, Slack ו-Teams. SMS "בקרוב". אינטגרציה עם בקרות האבטחה של Microsoft Agent 365. כללי אישור שהמשתמש מגדיר | Pro ו-Business Premium ב"שווקים זכאים". לפי דיווח, ההשקה של Pro לא כוללת EEA, בריטניה ושווייץ. **[לא מאומת]** ישראל | [TechCrunch 29.9](https://techcrunch.com/2026/09/29/openai-launches-dots-its-bubbly-agentic-avatar/); [DataCamp](https://www.datacamp.com/blog/openai-dots) [משני] |
| **Google Gemini "Call for Me"** | שיחות לעסקים מהמספר של המשתמש. ג'מיני מציג את עצמו, עובר תפריטים וממתין על הקו. המשתמש רואה תמליל חי ויכול להשתלט על השיחה. מידע אישי נמסר רק אחרי אישור | ניסוי בארה"ב, Pixel 11, מנוי Gemini | [TechCrunch 24.9 דרך תקציר](https://techcrunch.com/2026/09/24/google-tests-letting-gemini-make-phone-calls-initially-for-us-pixel-owners/) [משני] |
| **Anthropic Claude Duet** | סוכן פרואקטיבי שפונה **לעסקים קטנים ולאנשי מקצוע**. תדריך בוקר, דשבורד יומי, מחשב ענן משלו, יותר מ-6,000 connectors. מבקש אישור לפני שליחת הודעות ולפני תשלום (כפתורי Approve / Not now). אפליקציה בלבד, בלי WhatsApp. **הכי דומה לקונספט של עלזה** | Research preview, מנויי Pro ו-Max בארה"ב, רשימת המתנה | [claude.com](https://claude.com/product/claude-duet) [ראשוני]; [CNBC](https://www.cnbc.com/2026/10/21/anthropic-preview-of-claude-duet-personal-ai-agent-take-on-muse-dots.html) [משני] |
| **סוכני טקסט אחרים** | Poke (Apple Messages for Business, נרכשה ע"י Cognition). Wajo/Fo (מספר, מייל וכרטיס משלו, שיחות, העברה לאדם). Martin (SMS, טלפון, WhatsApp, מ-21 דולר לחודש). Tab (מכולת ומתנות ב-iMessage ו-WhatsApp, שווי 300 מיליון). Ollie (משפחה, SOC 2). ועוד | מגוון | [TechCrunch 10.10](https://techcrunch.com/2026/10/10/all-the-ai-agents-that-can-live-in-your-text-messages/) |
| **ישראל** | Shmooz: עוזר AI בעברית ב-WhatsApp, בדפי שיווק בלבד ([shmooz.ai](https://shmooz.ai/he/blogs/ai-%D7%91%D7%A2%D7%91%D7%A8%D7%99%D7%AA-%D7%91%D7%95%D7%95%D7%90%D7%98%D7%A1%D7%90%D7%A4)). סוכני קול בעברית לעסקים, בצד העסק ולא כעוזר אישי: Yappr, Daber, Connectop ([Yappr](https://goyappr.com/en/blog/voice-ai-pricing-israel-2026); [Daber](https://daber.ai/blog/daber-vs-reshetcall); [Connectop](https://connectop.co.il/en/)). TheMarker מדווח ש"גם סטארט-אפים ישראליים הצטרפו למרוץ", אבל השמות מאחורי חומת תשלום ([TheMarker](https://www.themarker.com/technation/2026-09-02/ty-article/.highlight/000001a0-6148-d9b7-abaf-e37ea44f0000)) | - | [משני] |

**מסקנה:** בארה"ב השוק עבר לסוכנים שמבצעים, עם מחשב ענן, שיחות ותשלומים. אף מתחרה גדול לא זמין היום בישראל בעברית ב-WhatsApp **עם פעולות**. Meta AI מכסה שיחה וחיבור למייל, אבל לא אישורים ופעולות משרדיות. החלון של עלזה הוא **עברית, M365, אישור בכפתור ומשרד מקצועי**, ולא תחרות עם Instinct על קניות ונסיעות.

---

## 7. עלזה: היתכנות לפי יכולת

### 7.1 עיקרון מנחה
1. **היקף:** כל יכולת חדשה צריכה להיות פעולה של "המשרד של העסק": מייל, יומן, קבצים, לקוחות, גבייה, ספקים. לא עוזר אישי כללי. זה נובע מסעיף 4.7 (סעיף 1 כאן) ומהתזכיר הקיים.
2. **אישור:** פעולה יוצאת או בלתי הפיכה מתבצעת רק אחרי לחיצת כפתור. זה כבר ב-`docs/PLAN.md` §2.3, וזה בדיוק המקום שבו Instinct נכשל.
3. **נתונים:** מינימום, EU, מחיקה אמיתית. Instinct נפגע ציבורית בגלל "ניתוק לא מוחק".

### 7.2 טבלת היתכנות

| יכולת בהשראת Instinct | התאמה לקהל (עו"ד, רו"ח, יועצים, קליניקות) | סעיף 4.7 | דרך טכנית | עלות משוערת | סיכון | המלצה |
|---|---|---|---|---|---|---|
| **מעקב follow-up**: מיילים שנשלחו ולא נענו, והתחייבויות כמו "אחזור אליך" | גבוהה מאוד | בתוך ההיקף | Graph subscriptions (קיים) + סיווג ב-Haiku 5.5 + `jobs` + תבנית utility | ~0.0002 דולר למייל (הערכה: 1,500 טוקני קלט ו-100 פלט לפי 0.10/0.50 דולר למיליון ב-[מחירון Anthropic](https://platform.claude.com/docs/en/about-claude/pricing)). כ-0.3 דולר לחודש למשתמש עם 50 מיילים ביום | נמוך | **עכשיו** |
| **חילוץ מועדים**: דיון, מועד הגשה, תשלום, חידוש רישיון. מיומן או ממייל אל תזכורת או אירוע | גבוהה מאוד | בתוך ההיקף | אותו צינור. הצעה עם כפתורים "להוסיף ליומן / תזכורת / לא" | כנ"ל | נמוך (רק הצעה) | **עכשיו** |
| **תדריך לפני פגישה + התנגשויות ביומן** | גבוהה | בתוך ההיקף | חלק מסיכום הבוקר, או הודעה 30 דקות לפני הפגישה עם הקשר מהמייל והקבצים | שקל אחד עד שניים לחודש (הערכה) | נמוך | **עכשיו** |
| **מגן פישינג ו-BEC**: "שינוי פרטי חשבון בנק", דומיינים דומים, דחיפות כספית | גבוהה מאוד (רו"ח ועו"ד מעבירים כספים) | בתוך ההיקף | סיווג כל מייל נכנס, אזהרה בלבד. עלזה לא פותחת קישורים | כנ"ל | נמוך (קריאה בלבד). סיכון לתוצאות חיוביות שגויות | **עכשיו** |
| **כתובת מייל לעלזה**: להעביר אליה מייל או מסמך כדי לטפל בו | בינונית-גבוהה | בתוך ההיקף | inbound email, למשל אצל ספק המייל הקיים. **[לא נבדק]** ספק ומחיר | נמוך | נמוך-בינוני (זיוף שולח, יש לאמת שולח מוכר) | **עכשיו או קרוב** |
| **קישור תשלום ללקוח של העסק** + "האם שילם?" + חשבונית | גבוהה | בתוך ההיקף (גבייה של העסק) | API של הסולק של העסק (Grow, Cardcom, PayPlus) ומורנינג או iCount. ראו `docs/research/connectors-israel.md` §6-7 | 0 לעלזה. העסק משלם עמלות סליקה | בינוני (פעולה כספית, תמיד באישור) | **עכשיו או קרוב** |
| **מכתב ביטול מנוי או שירות במייל** | בינונית | בתוך ההיקף (ספקים של העסק) | טיוטה ושליחה באישור. חוק הגנת הצרכן מאפשר ביטול במייל (סעיף 7.3) | זניח | נמוך | **קרוב** |
| **שיחה יוצאת למשתמש** בהתראה דחופה (מועד הגשה, פגישה) | בינונית | בתוך ההיקף | WhatsApp Cloud API Calling (ישראל לא ברשימת המדינות המוחרגות. צריך בקשת הרשאת שיחה: אחת ביום ושתיים בשבוע) או Twilio | שיחה ב-WhatsApp: **[לא נמצא מחיר]**. Twilio: 0.0646 עד 0.1868 דולר לדקה לנייד, ומספר ישראלי ב-5.5 עד 15 דולר לחודש | נמוך-בינוני (הטרדה) | **אחר כך** |
| **שיחות לעסקים בשם המשתמש** (קביעת תור, בירור, שינוי פגישה) בעברית | בינונית | בתוך ההיקף אם מדובר בספקים ובמשרדים | ספק קול בעברית: Yappr (טוען ל-0.25 דולר לדקה), או ElevenLabs Agents (0.08 דולר לדקה + LLM) ו-Twilio. **[לא מאומת]** איכות העברית | שיחה של 3 דקות: כ-0.5 עד 1 דולר (חישוב מהמקורות בסעיף 7.4) | בינוני-גבוה (משפטי, מוניטין) | **אחר כך, פיילוט** |
| **פעולות דפדפן** (קריאה בלבד: זמינות, מחיר, מידע ציבורי. מילוי PDF) | נמוכה-בינונית | גבולי | `browser_toolset_20260801` של Anthropic (GA, הדפדפן אצלנו) ושירות דפדפן מנוהל | כ-0.1 עד 1 דולר למשימה (הערכה גסה). Browserbase כ-0.10 עד 0.12 דולר לשעת דפדפן | בינוני-גבוה | **אחר כך, מוגבל** |
| **תיאום בין סוכני עלזה** + קבוצות WhatsApp | בינונית | בתוך ההיקף | תיאום פגישות בין משתמשי עלזה. Groups API מוגבל ל-8 משתתפים ודורש Official Business Account | נמוך | בינוני | **אחר כך** |
| **קניות, נסיעות, מסעדות, כרטיסים** | נמוכה לקהל | **מחוץ להיקף** | - | - | גבוה | **לא** |
| **כרטיס אשראי שמור + צ'קאאוט אוטונומי** | נמוכה | מחוץ להיקף | Link לא זמין בישראל | - | גבוה מאוד | **לא** |
| **התחברות לבנק, לרשות המסים, לנט המשפט או לביטוח לאומי** | גבוהה בתיאוריה | גבולי | דורש פרטי התחברות, ולפעמים כרטיס חכם או OTP לטלפון | - | גבוה מאוד (משפטי ואבטחתי) | **לא** |
| **המלצות מוצרים יזומות (Selections)** | אין | מחוץ להיקף | - | - | חוק הספאם ואמון | **לא** |

### 7.3 משפט ורגולציה בישראל (לא ייעוץ משפטי, לבדוק עם עו"ד)

| נושא | מה ידוע | השלכה לעלזה |
|---|---|---|
| **תיקון 13 לחוק הגנת הפרטיות** | בתוקף מ-14.8.2025. מרחיב את סמכויות האכיפה, מוסיף חובת ממונה הגנת פרטיות (DPO) במקרים מסוימים, מרחיב את "מידע בעל רגישות מיוחדת" (רפואי, פיננסי ועוד) ומוסיף קנסות מנהליים. **[סותר]** גובה הקנסות ומועד הדיווח על אירועים לא עקביים בין המקורות ([dpoisrael](https://dpoisrael.com/en/amendment-13/); [mineos](https://mineos.ai/hub-articles/israels-amendment-13-a-new-era-for-privacy); [levion, קליניקות](https://levion.tech/en/guides/amendment-13/)) [משני] | כל יכולת חדשה (קול, מיקום, הקלטות, מעקב אחרי כל המיילים) מגדילה את היקף המאגר ואת רגישותו. קליניקות = מידע רפואי. יש לעדכן את מסמך הגדרות המאגר. מחיקה בניתוק היא חובה |
| **טיוטת הנחיה של הרשות להגנת הפרטיות על AI** (2025) | בסיס חוקי בכל שלב, הסכמה מפורטת ולא כרוכה, חלות גם על מידע מוסק, ו**גילוי שמדובר ב-AI**. לא נמצא אישור שהטיוטה סופית ([Arnon](https://arnontl.com/news/israeli-privacy-authority-extends-period-for-comment-on-draft-guidance-on-ai-systems/); [EBN](https://www.ebnlaw.co.il/media-center/draft-guidance-from-the-israeli-privacy-protection-authority/)) [משני] | שיחות יוצאות: עלזה מציגה את עצמה כ"עוזרת דיגיטלית מטעם [העסק]". הסכמה נפרדת לכל יכולת חדשה, כמו קול, מעקב מיילים או שיחות |
| **חוק האזנת סתר** | משתתף בשיחה רשאי להקליט אותה בלי הסכמת האחרים. צד שלישי אינו רשאי ([recordinglaw](https://www.recordinglaw.com/world-laws/world-recording-laws/israel-recording-laws/) [משני]; [law.co.il](https://www.law.co.il/en/news/2022/01/13/civil-service-regulations-forbid-wiretapping-civil-servants/)) | **שאלה פתוחה לעו"ד:** האם סוכן AI שמתקשר בשם המשתמש נחשב "משתתף", ומה מעמדה של עלזה כספק. ברירת מחדל זהירה: גילוי בתחילת השיחה, שמירת תמליל ולא אודיו, מחיקה אחרי 90 יום |
| **חוק התקשורת, סעיף 30א (ספאם)** | דבר פרסומת בהודעה אלקטרונית או בחיוג אוטומטי מחייב הסכמה מראש ובכתב. פיצוי של עד 1,000 ₪ להודעה בלי הוכחת נזק. הודעות שירות בתגובה לפנייה אינן ספאם ([Times of Israel](https://blogs.timesofisrael.com/the-law-your-whatsapp-bot-keeps-breaking/) [משני]; [Hunton](https://www.hunton.com/privacy-and-cybersecurity-law-blog/new-anti-spam-law-takes-effect-in-israel)) | הודעות יזומות של עלזה: שירותיות בלבד. **אין Selections** ואין קידום של שותפים. בשיחות לעסקים: בלי תוכן שיווקי |
| **חוק הגנת הצרכן: ביטול עסקה** | ביטול אפשרי בטלפון, בדואר רשום, במייל או באתר, ואתר שמוכר אונליין חייב להציג קישור ביטול ([Mondaq, 2017](https://mondaq.com/consumer-law/626544/consumer-protection-law-prescribes-a-general-arrangement-for-canceling-transactions) [משני]) | "בטלי לי את המנוי" אפשרי עם **מייל** באישור, בלי כניסה לאתרים. לבדוק אם השינויים מאז 2017 רלוונטיים |
| **חוק הסדרת שירותי תשלום וייזום תשלום, 2023** | שירותי תשלום וייזום תשלום טעונים רישיון (רשות ניירות ערך, או רשות שוק ההון למי שכבר מפוקח) ([Arnon](https://arnontl.com/news/bill-on-payment-services/); [regulazia](https://regulazia.co.il/en/articles/payment-initiation-services-in-israel/); [Lexology](https://www.lexology.com/library/detail.aspx?g=a6fede36-1240-468d-af55-1800c655bda8)) [משני] | עלזה **לא** מחזיקה כספים, **לא** יוזמת העברה מחשבון בנק ו**לא** שומרת כרטיס של המשתמש לרכישות. מותר לה לייצר קישור תשלום דרך הסולק של העסק. **שאלה לעו"ד:** לוודא שזה לא נחשב "ייזום תשלום" |
| **לשכת עורכי הדין: חוות דעת אתיקה מורחבת (9.2026)** | "מידע מוגבל" (מידע אישי של לקוח, חיסיון). חובה לבדוק את תנאי הספק ואת ההגנות החוזיות והטכניות, ולקבל הסכמה מדעת של הלקוח כשיש סיכון. מערכת אוטונומית: כל פעולה בעלת משמעות משפטית רק "בבדיקה ובאישור אנושי". אנונימיזציה "אינה מוחלטת" ([Pearl Cohen](https://www.pearlcohen.com/israel-bar-association-issues-an-expanded-ethics-opinion-on-lawyers-use-of-ai/); [2024](https://www.pearlcohen.com/israeli-bar-associations-ethical-guidelines-on-using-ai/)) [משני] | **יתרון שיווקי:** מודל האישורים של עלזה תואם את חוות הדעת. כדאי להכין "דף לעורכי דין": אין אימון, EU, מחיקה ואישור בכל פעולה. לא לאפשר פעולות אוטונומיות בתיקים |

### 7.4 מדיניות WhatsApp Business

| כלל | מקור | השלכה |
|---|---|---|
| §4.7 AI Providers: איסור כשה-AI הוא הפונקציה העיקרית. ישראל לא ברשימת השווקים המותרים (15.10.2026). ב-EEA נכנס צו ביניים של הנציבות האירופית (6.2026), וזה לא חל על ישראל | [תנאי Meta](https://www.facebook.com/legal/Meta-Terms-for-WhatsApp-Business-Platform); [Meta AI Providers](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing/ai-providers.md); [Yahoo/Reuters](https://finance.yahoo.com/economy/policy/articles/eu-orders-meta-reopen-whatsapp-142603730.html) | כל יכולת "כללית" (קניות, מחקר חופשי, נסיעות) מחלישה את המיצוב. תוכנית B בתזכיר הקיים היא מספר לכל עסק דרך Embedded Signup |
| חלון של 24 שעות. מחוץ לחלון רק Message Templates מאושרות. פתיחת שיחה רק בתבנית | [WhatsApp Business Messaging Policy](https://whatsappbusiness.com/policy/) [ראשוני] | פרואקטיביות (follow-up, מועדים, פישינג) מחוץ לחלון = תבניות utility. לאחד כמה התראות להודעה אחת. Meta עשויה לסווג מחדש תבנית "שיווקית" |
| אוטומציה מותרת, אבל חייב להיות "נתיב הסלמה מהיר, ברור וישיר" לאדם | שם | נדרש ערוץ תמיכה אנושי מוצהר (מייל או טלפון) |
| אפשר ליצור קשר רק עם מי שמסר את המספר. מומלץ opt-in נפרד לכל קטגוריה | שם | הסכמה נפרדת להתראות יזומות, ובנוסף להסכמה לשירות |
| Calling: שיחות שהעסק יוזם, חוץ מארה"ב, קנדה, מצרים, וייטנאם וניגריה. בקשת הרשאה אחת ביום ושתיים בשבוע. ביטול אוטומטי אחרי 4 שיחות שלא נענו. **[סותר]** ב-changelog מופיעה מגבלה של 100 שיחות ביום | [Meta Calling](https://developers.facebook.com/documentation/business-messaging/whatsapp/calling.md) [ראשוני] | אפשר להשתמש בזה לשיחת התראה דחופה למשתמש. לא נמצא איסור מפורש על קול סינתטי |
| Groups API: עד 8 משתתפים, Official Business Account, הצטרפות רק בקישור | [Unipile](https://www.unipile.com/whatsapp-group-api/) [משני] | עלזה בקבוצת משרד קטנה אפשרית, אבל לא בשלב הזה |

### 7.5 עלויות: פירוט ומקורות
- **מודלים (Anthropic):**
  - Haiku 5.5: 0.10 דולר למיליון טוקני קלט ו-0.50 לפלט.
  - Sonnet 5.5: 2 ו-10 דולר. קריאה מ-cache: 0.10.
  - Opus 5.5: 4 ו-20 דולר.
  - Batch בחצי מחיר.
  - ([Anthropic pricing](https://platform.claude.com/docs/en/about-claude/pricing) [ראשוני])
- **Computer/Browser use:**
  - `computer_toolset_20260801` מוסיף כ-4,500 טוקני קלט לבקשה.
  - `browser_toolset_20260801` מוסיף כ-6,600 טוקני קלט לבקשה, ועוד צילומי מסך וטקסט עמוד.
  - בכלי הדפדפן, הדפדפן רץ **אצל המפתח**. Anthropic סורקת פלט של דפדפן לזיהוי הזרקות, וממליצה על אישור אנושי לרכישות, לשינויי חשבון, להודעות ולקבלת תנאים.
  - ([Anthropic pricing](https://platform.claude.com/docs/en/about-claude/pricing); [Browser use tool](https://platform.claude.com/docs/en/agents-and-tools/tool-use/browser-use-tool.md) [ראשוני])
  - הערכה גסה שלי: משימה של 20 עד 30 צעדים ב-Sonnet 5.5 עם cache עולה 0.1 עד 1 דולר. צריך למדוד.
- **דפדפן מנוהל:** Browserbase: 20 דולר לחודש ל-100 שעות, אחר כך כ-0.12 דולר לשעה. Proxy כ-12 דולר ל-GB ([tinyfish](https://www.tinyfish.ai/blog/browserbase-pricing) [משני]).
- **קול:**
  - ElevenLabs Agents: 0.08 דולר לדקה, ובנוסף LLM בין 0.0005 ל-0.045 דולר לדקה ([getmacha](https://www.getmacha.com/blog/elevenlabs-agents-pricing-explained) [משני]). **[לא מאומת]** תמיכה בעברית.
  - Yappr: 0.25 דולר לדקה, בלי מנוי. זו טענה של הספק ([Yappr](https://goyappr.com/en/blog/voice-ai-pricing-israel-2026)).
  - Twilio ישראל: 0.0659 דולר לדקה לקווי, 0.1868 לנייד. כנראה 0.0294 ו-0.0646 בשיחה ממספר ישראלי. מספר מקומי 5.5 דולר לחודש, מספר נייד 15 ([Twilio](https://www.twilio.com/en-us/voice/pricing/il) [ראשוני]).
  - Plivo זול יותר לקווי ([Plivo](https://www.plivo.com/voice/pricing/il/)).
  - **חישוב לשיחה של 3 דקות:** ElevenLabs כ-0.24 + LLM עד 0.13 + Twilio 0.19 עד 0.56. סה"כ כ-0.45 עד 0.95 דולר.
- **WhatsApp:** תבנית utility כ-0.0053 דולר לפי `docs/PLAN.md` §5. לא אומת.

### 7.6 עיצוב בטיחות: מה ללמוד מ-Instinct
1. **שומר נפרד (כמו המוניטור של Instinct ו-Sentinel של Muse):** מודל או כללים שבודקים כל `pending_action` לפני שהיא מוצגת לאישור: נמען חדש, סכום, קובץ מצורף רגיש, התאמה לבקשה המקורית. זה נוסף לכפתור, לא במקומו.
2. **"חומת אש" לתוכן נכנס:** כבר קיים עיקרון ה-`<data>`. להוסיף סיווג הזרקה למיילים ולקבצים, והוראה מתוך מייל לעולם אינה פקודה. Instinct נכשל במבחן של אלכס כהן.
3. **תנאים של המשתמש = אילוצים בקוד:** "רק אם יש החזר", "רק עד 500 ₪". נשמרים כשדות ב-`pending_action` ונבדקים לפני הביצוע. זה הלקח מ-DoorDash.
4. **מחיקה אמיתית בניתוק:** ניתוק M365 או Google מוחק סיכומים, אינדקסים ו-facts שנגזרו מהחיבור, ומציג אישור. זה הלקח מ-Gmail.
5. **בלי רישיון רחב ובלי אימון על תוכן לקוחות** בתנאים. בלי "סמכות להתקשר בשמך". כל התחייבות היא לחיצה מפורשת.
6. **תקרות ומכסות:** כבר קיים `max_outbound_per_day` לסוכנים. להוסיף תקרת קצב לכל דומיין חיצוני אם תהיה גלישה. זה הלקח מ-Resy.
7. **שקיפות תפעולית:** דף סטטוס, והודעה למשתמש כשמשהו לא בוצע ("התזכורת לא נשלחה בזמן"). זה הלקח מהתקלה של ספטמבר.
8. **פרואקטיביות עם מינון:** הגדרה לכל קטגוריה (follow-up, מועדים, פישינג), שעות שקט, ואיחוד הודעות. בלי המלצות מסחריות. זה הלקח מ-Selections ומ-Lindy.
9. **גילוי ותיעוד בשיחות:** "עוזרת דיגיטלית מטעם [שם העסק]", בלי התחייבות בשיחה, סיכום ותמליל למשתמש, ואישור לפני קביעה סופית. זה המודל של Google ושל Concierge.
10. **פרטי התחברות:** עלזה לא שומרת סיסמאות. אם תהיה גלישה עם התחברות בעתיד, 1Password for Agents ממלא בלי שהסוכן רואה את הסיסמה. **מגבלה:** חשבונות ב-1Password.eu לא נתמכים כרגע ([9to5Google](https://9to5google.com/2026/10/22/1password-will-let-ai-agents-use-your-passwords-without-seeing-them/) [עיתונות, דרך תקציר]).

---

## 8. רשימה מתועדפת

### עכשיו (ערך גבוה, סיכון נמוך, מתאים לעברית ולישראל, בלי מחבר חדש)
| # | יכולת | למה | מאמץ |
|---|---|---|---|
| 1 | **מעקב follow-up** על מיילים יוצאים שלא נענו ועל התחייבויות, עם טיוטת תזכורת לאישור | הכאב הכי נפוץ בקהל. מבוסס על Graph שכבר קיים | M |
| 2 | **חילוץ מועדים ומשימות** ממיילים אל יומן או תזכורת, בכפתור | מועדי הגשה, דיונים ותשלומים. סיכון נמוך כי זו הצעה | M |
| 3 | **מגן פישינג ו-BEC** | הונאות "שינוי פרטי חשבון" פוגעות ישירות ברו"ח ובעו"ד. קריאה בלבד | S-M |
| 4 | **תדריך לפני פגישה + התנגשויות** כחלק מסיכום הבוקר | משדרג יכולת קיימת | S |
| 5 | **קישור תשלום + חשבונית ללקוח של העסק**, באישור | "גבייה" היא פעולה משרדית. עלזה לא נוגעת בכסף | M |
| 6 | **כתובת מייל לעלזה** (העברה לטיפול) | פשוט, ומרחיב את "תיבת הכניסה" של עלזה | S-M |

### אחר כך (אחרי השקה ואחרי חוות דעת משפטית)
| # | יכולת | תנאי מקדים |
|---|---|---|
| 7 | שיחה יוצאת **למשתמש** בהתראה דחופה (WhatsApp Calling או Twilio) | בדיקת מחיר ואיכות. opt-in נפרד |
| 8 | **שיחות לעסקים בשם המשתמש** (תיאום תורים ופגישות) בעברית | חוות דעת על הקלטה וגילוי, בדיקת איכות קול עברי, פיילוט עם 5 משתמשים, אישור לפני כל התחייבות |
| 9 | ביטול מנוי או שירות **במייל** | תבנית מכתב ואימות פרטי הספק |
| 10 | תיאום פגישות בין משתמשי עלזה, ועלזה בקבוצת משרד | ביקוש, ו-Official Business Account לקבוצות |
| 11 | פעולות דפדפן **קריאה בלבד** (מידע ציבורי) ומילוי טפסי PDF | `browser_toolset_20260801` בסביבה מבודדת, רשימת דומיינים מותרים, בלי פרטי התחברות. ובדיקה מול סעיף 4.7 |
| 12 | "מה את יודעת עליי": תצוגה ומחיקה של facts | עיצוב באזור האישי |

### לעולם לא (או לא בעתיד הנראה)
| יכולת | למה |
|---|---|
| קניות, נסיעות, מסעדות, כרטיסים, משלוחים | מחוץ לקהל. מחליש את המיצוב מול סעיף 4.7. רוב הכשלים של Instinct כאן |
| שמירת כרטיס אשראי של המשתמש וצ'קאאוט אוטונומי | רישוי תשלומים בישראל. Link לא זמין בישראל. סיכון כספי |
| התחברות לבנק, לרשות המסים, לנט המשפט או לביטוח לאומי בשם המשתמש | פרטי התחברות רגישים, כרטיס חכם או OTP, אחריות מקצועית, וחוות הדעת של לשכת עוה"ד |
| המלצות מוצרים או שותפים יזומות (Selections) | חוק הספאם, אמון, ותגובת הנגד ש-Instinct ספג |
| גישה למסך, למקלדת או לסמן של המשתמש (keylogging), וקריאת iMessage דרך Mac | רגישות קיצונית לפי תיקון 13. מחוץ להיקף |
| סעיף "סוכן מוסמך להתקשר בשמך" ורישיון רחב לנתונים בתנאים | בדיוק מה שעורר את הביקורת על Instinct |
| polling אגרסיבי של אתרים ועקיפת CAPTCHA | חסימות (Resy, Amazon מול Muse) ותנאי שימוש של אתרים |
| הקלטת שיחות בלי גילוי | חוק, אתיקה ומוניטין |

---

## 9. שאלות פתוחות לאימות ולעו"ד

1. **סעיף 4.7:** האם הוספת פרואקטיביות ושיחות משנה את הניתוח בתזכיר הקיים? לשלב את השאלה בפנייה ל-Meta.
2. **הקלטה:** האם סוכן AI שמתקשר בשם המשתמש הוא "משתתף" לפי חוק האזנת סתר? האם חובה לגלות? מי מחזיק בתמליל?
3. **תשלומים:** האם יצירת קישור תשלום דרך ה-API של הסולק של העסק, לפי בקשת העסק ובאישורו, נחשבת "ייזום תשלום" לפי חוק 2023?
4. **מחיר שיחות ב-WhatsApp Calling בישראל:** לא נמצא. לבדוק בדף התמחור של Meta.
5. **איכות קול עברי:** ElevenLabs, OpenAI Realtime ו-Yappr. אין מדד עצמאי. לבנות מבחן כמו `scripts/hebrew-eval`.
6. **Instinct בישראל ובעברית:** לא נמצא מידע. אם דניאל מקבל הזמנה, לבדוק ישירות: עברית, WhatsApp ישראלי, M365.
7. **כרטיס וירטואלי חד-פעמי אצל מנפיקים ישראליים** (ישראכרט, מקס, כאל): לא נמצא מקור. רלוונטי רק אם בעתיד ירצו רכישות, וההמלצה היא שלא.

---

## 10. מקורות

**Instinct, ראשוני:** [instinct.com](https://instinct.com/) · [תנאי שימוש (26.8.2026)](https://instinct.com/terms) · [מדיניות פרטיות (26.8.2026)](https://instinct.com/privacy-policy) · [Invest Like the Best, פרק 493](https://podcasts.apple.com/ae/podcast/noah-shinn-building-instinct-the-personal-agent/id1154105909?i=1000792019848) · [תמליל](https://podscripts.co/podcasts/invest-like-the-best-with-patrick-oshaughnessy/noah-shinn-building-instinct-the-personal-agent-invest-like-the-best-ep493) · פוסטים של שין ב-X (נקראו דרך תקצירי חיפוש): [השקה](https://x.com/noahrshinn/status/2092691344456351744), [Stripe](https://x.com/noahrshinn/status/2093368510449877180), [1Password](https://x.com/noahrshinn/status/2095911123291881608), [מייל משלו](https://x.com/noahrshinn/status/2097443132816396649), [רשת אנשים מהימנים](https://x.com/noahrshinn/status/2097794967574028448), [TOTP](https://x.com/noahrshinn/status/2098466184912089143), [Concierge](https://x.com/noahrshinn/status/2100262985491231101), [שירות לקוחות](https://x.com/noahrshinn/status/2107875073038385546) · [Patrick Collison](https://x.com/patrickc/status/2093385965905842566) · [Pranav Reddy](https://x.com/pranavreddy/status/2092710913329770808)

**עיתונות:** [TechCrunch 24.8](https://techcrunch.com/2026/08/24/instincts-powerful-ai-assistant-is-raising-privacy-and-security-concerns/) · [TFN](https://techfundingnews.com/noah-shinns-instinct-goes-from-100m-to-2-5b-in-weeks-23-year-olds-ai-assistant-just-raised-250m-series-b/) · [Forbes 26.8](https://www.forbes.com/sites/iainmartin/2026/08/26/vcs-are-so-obsessed-with-this-ai-assistant-that-its-valuation-jumped-fivefold-in-weeks/) (לא נפתח) · [Runtimewire: Mac](https://runtimewire.com/article/instinct-mac-app-imessage-local-browser-whoop) · [Skift 4.9](https://skift.com/2026/09/04/a-viral-ai-bot-just-showed-travel-what-frictionless-actually-means/) · [TechCrunch 17.9](https://techcrunch.com/2026/09/17/rival-ai-agents-instinct-and-metas-muse-both-add-the-ability-to-make-calls/) · [Runtimewire: הזיה](https://runtimewire.com/article/instinct-noah-shinn-hallucination-stranger-data) · [Business Insider דרך Yahoo](https://sg.news.yahoo.com/instinct-users-theyve-noticed-slowdown-163111405.html) · [WIRED](https://www.wired.com/story/i-finally-found-an-ai-agent-worth-the-risk/) (נקרא דרך [winzheng](https://www.winzheng.com/en/article/ai-agent-instinct-review-risk)) · [Skift 28.9](https://skift.com/2026/09/28/instincts-app-is-fueled-by-travel-founder-says-its-half-of-volume/) · [TechCrunch 28.9](https://techcrunch.com/2026/09/28/viral-ai-agent-instinct-raises-1b-series-c-at-a-10b-valuation/) · [PYMNTS](https://www.pymnts.com/news/artificial-intelligence/2026/personal-ai-agent-instinct-quadruples-valuation-to-10-billion-in-1-month/) · [TechCrunch 30.9](https://techcrunch.com/2026/09/30/instincts-new-product-recommendations-are-giving-some-users-the-ick/) · [Fortune 30.9](https://fortune.com/2026/09/30/noah-shinn-instinct-ai-assistant-meta-muse-alexandr-wang-tech-series-c-ai-agent-mark-zuckerberg/) · [TechCrunch 5.10](https://techcrunch.com/2026/10/05/instinct-brings-its-ai-agent-to-group-chats-even-for-friends-without-an-account/) · [The Verge 9.10](https://www.theverge.com/tech/1008254/instinct-agent-ai-hands-on-muse-dots) (נקרא דרך [progressiverobot](https://www.progressiverobot.com/2026/10/09/instinct-vs-muse-buzziest-ai-agent-survive-meta-hands-on/)) · [TechCrunch 10.10](https://techcrunch.com/2026/10/10/all-the-ai-agents-that-can-live-in-your-text-messages/) · [unite.ai: PAP](https://unite.ai/sierra-unveils-personal-agent-protocol-built-with-meta-and-partners) · [PYMNTS: Shopify](https://www.pymnts.com/?p=4243821)

**משני (סקירות, אגרגטורים, מתחרים):** [asymmetriccuriosity](https://asymmetriccuriosity.substack.com/p/instinct-an-assistant-with-a-phone) · [usecarly](https://www.usecarly.com/blog/what-is-instinct-ai/) · [eesel](https://www.eesel.ai/blog/instinct-ai-review) · [cellcog](https://cellcog.ai/blog/what-is-instinct-ai/) · [theagentlog](https://theagentlog.com/agent/instinct/) · [SeatSwiper (CNN)](https://guides.seatswiper.com/instinct-ai-restaurant-reservations) · [Simon Taylor](https://threadreaderapp.com/thread/2093637347510309331.html) · [explainx](https://explainx.ai/blog/instinct-1password-ai-agent-account-vaults-2026) · [ai-agent.review](https://ai-agent.review/news/decagon-pact-support-agent-permissions/) · [layer3labs](https://www.layer3labs.io/guides/who-is-noah-shinn) · [Crypto Briefing (The Information)](https://x.com/Crypto_Briefing/status/2100057273162981781)

**תשלומים וזהות:** [Stripe: Giving agents the ability to pay](https://stripe.com/blog/giving-agents-the-ability-to-pay) · [Link agent wallet FAQ](https://support.link.com/questions/link-agent-wallet-faq) · [Stripe Docs: Link Agent Wallet](https://docs.stripe.com/agentic-commerce/link-agent-wallet) · [TechCrunch 30.4: Link](https://techcrunch.com/2026/04/30/stripe-link-digital-wallet-ai-agents-shopping/) · [9to5Google: 1Password for Agents](https://9to5google.com/2026/10/22/1password-will-let-ai-agents-use-your-passwords-without-seeing-them/)

**מתחרים:** [MarkTechPost: Muse](https://www.marktechpost.com/2026/09/08/meta-introduces-muse-a-personal-ai-agent-that-runs-on-its-own-dedicated-secure-cloud-computer/) · [Medium: זמינות Muse](https://medium.com/@mateohq/meta-muse-in-the-uk-europe-and-australia-where-it-stands-in-october-2026-3342eb499e81) · [ynetnews: Meta AI בישראל](https://www.ynetnews.com/tech-and-digital/article/rk008bxwxge) · [TechCrunch: Dots](https://techcrunch.com/2026/09/29/openai-launches-dots-its-bubbly-agentic-avatar/) · [DataCamp: Dots](https://www.datacamp.com/blog/openai-dots) · [TechCrunch: Gemini Call for Me](https://techcrunch.com/2026/09/24/google-tests-letting-gemini-make-phone-calls-initially-for-us-pixel-owners/) · [Claude Duet](https://claude.com/product/claude-duet) · [CNBC: Duet](https://www.cnbc.com/2026/10/21/anthropic-preview-of-claude-duet-personal-ai-agent-take-on-muse-dots.html) · [TheMarker](https://www.themarker.com/technation/2026-09-02/ty-article/.highlight/000001a0-6148-d9b7-abaf-e37ea44f0000) · [Shmooz](https://shmooz.ai/he/blogs/ai-%D7%91%D7%A2%D7%91%D7%A8%D7%99%D7%AA-%D7%91%D7%95%D7%95%D7%90%D7%98%D7%A1%D7%90%D7%A4) · [Yappr](https://goyappr.com/en/blog/voice-ai-pricing-israel-2026) · [Daber](https://daber.ai/blog/daber-vs-reshetcall) · [Connectop](https://connectop.co.il/en/)

**WhatsApp ו-Meta:** [Meta Terms §4.7](https://www.facebook.com/legal/Meta-Terms-for-WhatsApp-Business-Platform) · [AI Providers: שווקים](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing/ai-providers.md) · [Business Messaging Policy](https://whatsappbusiness.com/policy/) · [Cloud API Calling](https://developers.facebook.com/documentation/business-messaging/whatsapp/calling.md) · [Groups API (Unipile)](https://www.unipile.com/whatsapp-group-api/) · [צו הנציבות האירופית](https://finance.yahoo.com/economy/policy/articles/eu-orders-meta-reopen-whatsapp-142603730.html) · [TechCrunch 5.3](https://techcrunch.com/2026/03/05/meta-will-allow-rival-ai-chatbots-on-whatsapp-in-europe-but-for-a-fee/)

**משפט בישראל:** [dpoisrael: תיקון 13](https://dpoisrael.com/en/amendment-13/) · [mineos](https://mineos.ai/hub-articles/israels-amendment-13-a-new-era-for-privacy) · [levion: קליניקות](https://levion.tech/en/guides/amendment-13/) · [Arnon: טיוטת AI](https://arnontl.com/news/israeli-privacy-authority-extends-period-for-comment-on-draft-guidance-on-ai-systems/) · [EBN](https://www.ebnlaw.co.il/media-center/draft-guidance-from-the-israeli-privacy-protection-authority/) · [recordinglaw](https://www.recordinglaw.com/world-laws/world-recording-laws/israel-recording-laws/) · [law.co.il](https://www.law.co.il/en/news/2022/01/13/civil-service-regulations-forbid-wiretapping-civil-servants/) · [Times of Israel: ספאם ובוטים](https://blogs.timesofisrael.com/the-law-your-whatsapp-bot-keeps-breaking/) · [Hunton](https://www.hunton.com/privacy-and-cybersecurity-law-blog/new-anti-spam-law-takes-effect-in-israel) · [Mondaq: ביטול עסקה](https://mondaq.com/consumer-law/626544/consumer-protection-law-prescribes-a-general-arrangement-for-canceling-transactions) · [Arnon: שירותי תשלום](https://arnontl.com/news/bill-on-payment-services/) · [regulazia](https://regulazia.co.il/en/articles/payment-initiation-services-in-israel/) · [Lexology](https://www.lexology.com/library/detail.aspx?g=a6fede36-1240-468d-af55-1800c655bda8) · [Pearl Cohen 9.2026](https://www.pearlcohen.com/israel-bar-association-issues-an-expanded-ethics-opinion-on-lawyers-use-of-ai/) · [Pearl Cohen 2024](https://www.pearlcohen.com/israeli-bar-associations-ethical-guidelines-on-using-ai/)

**עלויות וטכנולוגיה:** [Anthropic pricing](https://platform.claude.com/docs/en/about-claude/pricing) · [Browser use tool](https://platform.claude.com/docs/en/agents-and-tools/tool-use/browser-use-tool.md) · [Computer use tool](https://platform.claude.com/docs/en/agents-and-tools/tool-use/computer-use-tool) · [Browserbase (tinyfish)](https://www.tinyfish.ai/blog/browserbase-pricing) · [ElevenLabs (getmacha)](https://www.getmacha.com/blog/elevenlabs-agents-pricing-explained) · [Twilio ישראל](https://www.twilio.com/en-us/voice/pricing/il) · [Plivo ישראל](https://www.plivo.com/voice/pricing/il/)
