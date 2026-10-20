# תזכיר: סעיף 4.7 "AI Providers" בתנאי WhatsApp Business Platform של Meta — ואיך {{שם}} מתמקם מולו

> **טיוטה לבדיקת עו"ד — אינו ייעוץ משפטי.** נכתב 20.10.2026 על בסיס מקורות ציבוריים (רשימה בסוף). ההחלטה העסקית (PLAN §8 סיכון #1): בונים במקביל לבדיקה המשפטית, עם תוכנית B מוכנה.

## 1. הסעיף במלואו (אנגלית, כפי שנשלף מ-facebook.com/legal/Meta-Terms-for-WhatsApp-Business-Platform ב-20.10.2026; העמוד מציין "Last Modified: September 23, 2026")

> **4.7 AI Providers.** Providers and developers of artificial intelligence or machine learning technologies, including but not limited to large language models, generative artificial intelligence platforms, general-purpose artificial intelligence assistants, or similar technologies as determined by Meta in its sole discretion ("AI Providers"), are strictly prohibited from accessing or using the WhatsApp Business Platform, whether directly or indirectly, for the purposes of providing, delivering, offering, selling, or otherwise making available such technologies when such technologies are the primary (rather than incidental or ancillary) functionality being made available for use, as determined by Meta in its sole discretion; provided, however, that such technologies may be made available to businesses in certain countries as set forth here. Notwithstanding the foregoing, you may retain an AI Provider as your Solution Provider. In such cases, you may not directly or indirectly allow WhatsApp Business Platform Data, including any anonymous, aggregate, or derived forms of WhatsApp Business Platform Data, to be used to create, develop, train, or improve any machine learning or artificial intelligence systems, models, or technologies, including large language models (collectively, "AI Models"); provided that you may use WhatsApp Business Platform Data to fine-tune an AI Model that is for your exclusive use, so long as this does not result in WhatsApp Business Platform Data being used to create, develop, train, or improve any other AI Models. This Section survives termination of these Terms.

תרגום חופשי של הליבה: ספקי/מפתחי טכנולוגיות AI (כולל "עוזרי AI כלליים") אסורים בשימוש בפלטפורמה כש-**ה-AI הוא הפונקציונליות העיקרית** (ולא נלווית) — **לפי שיקול דעתה הבלעדי של Meta**. מותר להשתמש בספק AI כ-Solution Provider, בתנאי שנתוני הפלטפורמה לא ישמשו לאימון מודלים (fine-tune לשימוש בלעדי — מותר).

## 2. ציר זמן ואכיפה

| מועד | מה קרה | מקור |
|---|---|---|
| אוקטובר 2025 | Meta מפרסמת את העדכון לתנאים; נימוק: ה-API נועד לשירות לקוחות של עסקים, עוזרי AI כלליים מעמיסים על המערכת ומשבשים את מודל ההכנסות | respond.io, MediaNama, Gulf News |
| 15.1.2026 | כניסה לתוקף/אכיפה. OpenAI (ChatGPT) ו-Microsoft (Copilot) הודיעו על עזיבה בגלל התנאים; Perplexity צוינה כמושפעת. (האם כולם כבו בפועל באותו יום — לא אומת ממקור ראשוני) | Yahoo Tech, TechCrunch, respond.io |
| דצמבר 2025–ינואר 2026 | רשות התחרות האיטלקית (AGCM) מתערבת → Meta פוטרת משתמשים עם מספר איטלקי; ב-15.1.2026 TechCrunch: גם ברזיל (+55) מוחרגת | TechCrunch |
| 16.2.2026 / 11.3.2026 | דף התמחור של Meta ל-AI Providers: מותר ומחויב לפי הודעה באיטליה (מ-16.2), ובכל ה-EEA + ברזיל (מ-11.3); מ-13.5.2026 ללא חיוב ב-EEA/איטליה; טורקיה (+90) מ-15.10.2026 ללא חיוב עד 11.4.2027 לפחות. ההיתר קיים "where Meta is legally required" | developers.facebook.com → pricing/ai-providers |
| 2026 | האיחוד האירופי פתח חקירת הגבלים עסקיים על המדיניות; ברזיל חוקרת גם | ppc.land, TechCrunch |

**המשמעות לישראל:** ישראל **לא** ברשימת המדינות המוחרגות. ההיתר קיים רק במקומות שבהם רגולטור חייב את Meta. מה שמותר בכל מקום: AI שהוא **נלווה** לשירות עסקי ("AI integrated as part of broader business services, like customer-support bots").

## 3. איפה {{שם}} עומד

**הטענה שלנו (positioning):** {{שם}} אינו "עוזר AI כללי" ואינו ספק מודלים. הוא **שירות משרדי לעסק** — ניהול מייל, יומן וקבצים של העסק דרך החיבור ל-Microsoft 365/Google — שמשתמש ב-AI כטכנולוגיית עיבוד (כמו שמערכת CRM משתמשת ב-AI לסיכום). המשתמש הוא בעל העסק (לקוח שלנו), לא "הציבור"; השיחה היא שירות לקוחות של {{שם}} ללקוחותיו.

**נקודות לטובתנו**
1. **לא general-purpose:** הבוט מסרב לשאלות כלליות שאינן קשורות למשרד (אין "כתוב לי שיר", אין חיפוש ברשת, אין עזרה בשיעורי בית). ה-system prompt וה-router מגבילים לכוונות מוגדרות (21 intents ב-`scripts/hebrew-eval/dataset`). זה **חייב להישאר כך** גם כהגבלת מוצר.
2. **הערך העיקרי הוא החיבור למערכות העסק** (Graph/Google), לא היכולת לשוחח. בלי חיבור, המוצר כמעט חסר ערך — בניגוד ל-ChatGPT.
3. **אנחנו לא "AI Provider"** לפי הדוגמאות: לא מפתחים LLM ולא פלטפורמת GenAI; אנחנו לקוח של Anthropic.
4. **Meta עצמה מבחינה** בין "AI model providers distributing assistants" לבין "businesses using AI for customer service" (TechCrunch, 15.1.2026).
5. **אין אימון על נתוני הפלטפורמה** — מתועד במדיניות הפרטיות ובהסכם עם Anthropic (no-training).

**נקודות לרעתנו (שעו"ד צריך לשקול)**
1. "as determined by Meta in its sole discretion" — Meta יכולה להחליט אחרת, והסנקציה היא חסימת המספר/ה-WABA בלי ערעור יעיל.
2. חוויית המשתמש **נראית** כמו צ'אט עם AI ("מה יש לי מחר?", הקלטות, ניסוח). ככל שהמוצר יתמוך בשיחה חופשית — הסיכון עולה.
3. מספר וואטסאפ **אחד לכל הלקוחות** (PLAN §0) מחזק את המראה של "פלטפורמת AI" ולא "עסק שמשרת את לקוחותיו". זה הדפוס שאפיין את ChatGPT/Perplexity.
4. כפתור "איזה מודל אתה?" עונה בכנות שמאחור יש Claude — לגיטימי, אבל מדגיש את רכיב ה-AI.

**מה עושים במוצר ובשיווק (ללא קשר לחוות הדעת)**
- מיתוג: "עוזר משרדי לעסק קטן" / "המזכירות של המשרד בוואטסאפ" — לא "צ'אטבוט AI", לא "ChatGPT לעסקים". דפי הנחיתה (design/directions) כבר כך; לבדוק שאין "AI" בכותרת הראשית.
- בפרופיל העסקי של המספר (WhatsApp Business Profile): קטגוריה "Business services / Professional services", תיאור ששם את המייל/היומן/הקבצים במרכז.
- אין מצב "שיחה כללית": מחוץ לכוונות המוגדרות הבוט מפנה ליכולות (`meta.capabilities`).
- תיעוד: לשמור את התזכיר הזה, את ההתכתבות עם Meta/פרטנר, ואת מסכי המוצר — ראיות ל"incidental or ancillary".

## 4. שלוש שאלות פתוחות לעו"ד

1. **מבחן "primary functionality":** האם שירות שבו 100% מהאינטראקציות עוברות דרך LLM, אך הפלט תמיד נוגע לנתוני העסק של המשתמש (מייל/יומן/קבצים), הוא "AI as primary functionality" או "AI as incidental"? יש פסיקה/הנחיה/תקדים (כולל מקרים של Zapier/Make/Notion-style assistants שנשארו בפלטפורמה)?
2. **מספר אחד לכולם:** האם הארכיטקטורה (WABA אחד של {{שם}}, לקוחות = משתמשי קצה שמקשרים את המספר שלהם) הופכת אותנו ל-"AI Provider ... making available such technologies" כלפי הציבור, לעומת תוכנית B (מספר של כל עסק, {{שם}} כ-Solution Provider בלבד)? האם Embedded Signup משנה את הניתוח?
3. **חשיפה וסעדים:** מה הסנקציה המעשית (השבתת WABA, אובדן המספר, חסימת ה-Business Manager של דניאל כולל נכסים אחרים?) ואיזה ערעור/SLA קיים? האם כדאי לעבוד דרך BSP ישראלי (למשל GlobalMessaging/CommBox/Infobip) שיישא בחלק מהסיכון ויש לו ערוץ ל-Meta?

## 5. תוכנית B — מספר וואטסאפ לכל עסק (Embedded Signup)

אם חוות הדעת שלילית או ש-Meta מתנגדת: כל לקוח מחבר **מספר משלו** (SIM של העסק או מספר וירטואלי) ל-WABA **משלו** דרך **Embedded Signup** (Meta's Tech Provider / Solution Partner flow), ו-{{שם}} פועל כ-**Solution Provider** שמנהל את ה-WABA עבורו. במקרה הזה "העסק" מבחינת Meta הוא משרד עו"ד לוי, והוא "משתמש ב-AI לשירות הלקוחות שלו" — הדפוס שמותר במפורש; הסעיף מתיר לעסק "retain an AI Provider as your Solution Provider".

| היבט | מספר אחד (תוכנית A) | מספר לכל עסק (תוכנית B) |
|---|---|---|
| סיכון §4.7 | בינוני–גבוה | נמוך |
| Onboarding | דקה (wa.me) | 10–15 דק׳: Embedded Signup, אימות מספר ב-SMS, display name, תשלום ל-Meta לפי עסק |
| עלות | 1,000 הודעות service חינם לכל המספר (משותף) | 1,000 חינם **לכל לקוח** — זול יותר בסקייל |
| דרישות מאיתנו | Business verification | Tech Provider onboarding ב-Meta (App Review ל-`whatsapp_business_management`/`messaging`, Business verification), קוד Embedded Signup באתר |
| השפעה על הקוד | — | `wa_identities` → הוספת `waba_id`, `phone_number_id` לכל לקוח; webhook משותף (אותו app); טוקן system-user לכל WABA (או shared token עם הרשאות) |
| תבניות | 7 תבניות פעם אחת | 7 תבניות **לכל WABA** (רישום אוטומטי בקוד) |
| ה-SIM | שלנו | של הלקוח; המספר לא יכול לשמש גם באפליקציית WhatsApp הרגילה (או: מספר משני/וירטואלי) |

ההמלצה: לבנות את סכמת הנתונים כבר עכשיו כך שתתמוך בשני המצבים (`phone_number_id` לכל `wa_identity`, ברירת מחדל = המספר שלנו).

## 6. טיוטת פנייה ל-Meta / Solution Partner (אנגלית)

Subject: Clarification request — Section 4.7 (AI Providers) for a business productivity service using the WhatsApp Business Platform

Hello,

We are an Israeli company building {{שם}}, a WhatsApp-based office assistant for small professional businesses (law firms, accountants, consultants, clinics). Before we launch, we would like to confirm that our use case is compatible with Section 4.7 ("AI Providers") of the Meta Terms for WhatsApp Business Platform.

How the service works:
- Each customer is a business owner who signs up on our website, connects their own Microsoft 365 or Google Workspace account (mail, calendar, files) via OAuth, and links their personal WhatsApp number to their account.
- Through WhatsApp, the customer asks for things that concern their own business data only: "what's on my calendar tomorrow", "summarize the email from X", "draft a reply", "find the contract file", "remind me on Thursday". Every outbound action (sending an email, creating or moving a meeting, sharing a file) requires the customer's explicit approval via reply buttons.
- The service is intentionally not a general-purpose assistant: requests unrelated to the customer's mailbox, calendar, files or reminders are declined. There is no open-ended chat, web search, content generation for third parties, or access for the public.
- We are not an AI model provider. We use third-party language models (Anthropic) as a processing technology under contractual terms that prohibit training on any data. No WhatsApp Business Platform Data is used to create, train or improve any AI model.
- We send only service messages within the customer service window and approved UTILITY templates (morning summary, reminders, billing, reconnection notices).

Our understanding is that the AI component here is incidental to a business productivity service, comparable to CRM or helpdesk tools that use AI for summarization, and that Section 4.7 targets providers whose primary offering is a general-purpose AI assistant. We would appreciate confirmation of that reading, or guidance on what would need to change (for example, operating each customer's own WhatsApp Business Account via Embedded Signup with us acting as Solution Provider).

We are happy to provide a demo account, screenshots of the full flow, and our privacy policy.

Thank you,
Daniel [שם משפחה] · [חברה] · [אתר] · [מייל]

## 7. מקורות
- Meta Terms for WhatsApp Business Platform §4.7 — https://www.facebook.com/legal/Meta-Terms-for-WhatsApp-Business-Platform (נשלף 20.10.2026)
- Meta, "New pricing policy for AI Providers leveraging the WhatsApp Business Platform" — https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing/ai-providers/
- TechCrunch, 15.1.2026, "After Italy, WhatsApp excludes Brazil from rival chatbot ban" — https://techcrunch.com/2026/01/15/after-italy-whatsapp-excludes-brazil-from-rival-chatbot-ban
- Yahoo Tech, "ChatGPT, Copilot being booted from WhatsApp" — https://tech.yahoo.com/ai/chatgpt/articles/chatgpt-copilot-being-booted-whatsapp-130055292.html
- MediaNama, 10.2025, "WhatsApp bans external AI providers from Business API" — https://www.medianama.com/2025/10/223-whatsapp-bans-external-ai-providers-business-api/
- Gulf News — https://gulfnews.com/technology/no-more-chatgpt-and-perplexity-on-whatsapp-meta-bans-major-ai-chatbots-from-2026-1.500316016
- respond.io (בלוג ספק, אינטרס מסחרי) — https://respond.io/blog/whatsapp-general-purpose-chatbots-ban
- ppc.land על חקירת האיחוד האירופי — https://ppc.land/whatsapp-bars-ai-chatbots-as-meta-solidifies-messaging-monopoly/

## 8. פריטים שלא אומתו
- התאריך "Last Modified: September 23, 2026" ו-"certain countries as set forth here" — הקישור לרשימת המדינות לא נשלף ישירות; הרשימה למעלה מבוססת על דף התמחור.
- האם ChatGPT/Copilot/Perplexity כבו בפועל ב-15.1.2026 (דיווחים משניים בלבד).
- סטטוס חקירות האיחוד האירופי וברזיל נכון להיום.
- האם Meta פרסמה הנחיה כתובה למבחן "primary vs incidental" — לא נמצאה.
