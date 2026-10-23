# מסמך תוכנית — עוזר AI בוואטסאפ לעסקים קטנים בישראל

> כלל תקשורת עם דניאל: בצ'אט משפט אחד. הפירוט רק כאן.
> סטטוס: סוף שלב 0–3 (מחקר, תחקיר, תוכנית). **אין קוד עד אישור.**

---

## 0. הקשר (למה בונים)

דניאל (IT/סייבר) מוכר ללקוחותיו — עו"ד, רו"ח, יועצים, קליניקות — עוזר AI בוואטסאפ שמטפל במייל, ביומן ובקבצים שלהם, בעברית, עם חיבור מלא ל-Microsoft 365 (עיקרי) ול-Google. מוצר SaaS במנוי (99 ₪ / 299 ₪), שירות עצמי מלא, השראה מ-readywhen.ai (מבנה ו-flow בלבד; מיתוג, טקסטים, דמות ופונט משלנו). מספר וואטסאפ אחד לכולם; כל אדם מחבר את המספר שלו ומקבל חשבון נפרד.

**החלטות שנסגרו בתחקיר:** הכול בוואטסאפ (אין צ'אט באתר) · שום פעולה יוצאת בלי אישור · אישורים בכפתורים "שלח/ערוך/בטל" · טון מקצועי וחם בלי בדיחות · נתונים ב-EU (פרנקפורט), מינימום נתונים, היסטוריה 90 יום · ניסיון 10 הודעות עם חיבור מלא · HYP (יעד שריג + חשבוניות שלהם) · תקציב תשתית ≤300 ₪/חודש · onboarding = כרטיס תמונה + משימה ראשונה · שם עברי קצר מקצועי · יש tenant Entra של העסק של דניאל.

---

## 1. ככה זה עובד אצלם → ככה אצלנו

| שלב | readywhen (נצפה 20.10.2026) | אצלנו |
|---|---|---|
| נחיתה | מסך אחד כהה, מוקאפ טלפון, "Takes about a minute", כפתור אחד | זהה במבנה; דמות/איור משלנו; הדגמת שיחה בעברית מונפשת |
| הרשמה | מייל → קוד 6 ספרות (10 דק', resend 60 שנ') → חיבור Gmail/Outlook (דרך Composio) או "דלג" → קונפטי "Your assistant is ready" + "It can't see your other chats" → Link to WhatsApp | זהה; כפתור **M365 ראשון**, Gmail שני; טוגל ניוזלטר כבוי (חוק הספאם); OAuth ישיר שלנו; QR במחשב |
| קישור לוואטסאפ | wa.me למספר +44 עם "Hi readywhen! Please link my account. (RW-<32 תווים>)" | wa.me ל-**+972** עם "היי! לקשר את החשבון שלי: ABCD-1234" — טוקן 8 תווים, 15 דק', חד-פעמי |
| הודעה ראשונה | ברוך הבא + "סיור/skip" + "רואה רק מה ששולחים לי כאן" → כרטיס תמונה "4 דרכים לעבוד איתי" → "שלח הקלטה עם מה שעל הצלחת שלך" | זהה בעברית; אחרי הכרטיס: שם, שם העסק, מה מעיק, שעת סיכום בוקר |
| דפוס תגובה | ✅ ריאקשן → "One sec..." (אנגלית) → תשובה | ✅ ריאקשן + typing indicator → תשובה. **הכול בעברית, פורמט עברי-תחילה** (אצלם RTL מעורב מתפרק) |
| חיבור מהשיחה | "Connect Outlook here: <link> — works once, for 30 minutes" | זהה |
| אישורים | טקסט חופשי | כפתורים שלח / ערוך / בטל |
| תשלום | חינם בבטא; מתוכנן $49/$99 לפי "פעולות" | 10 הודעות חינם → קישור HYP אישי → "החשבון פעיל" |

---

## 2. ארכיטקטורה

```
[לקוח בוואטסאפ] ──► Meta Cloud API ──webhook──► Vercel /api/wa/webhook
                                                 │ אימות X-Hub-Signature-256, dedupe לפי message id
                                                 │ 200 מיידי → enqueue (QStash)
                                                 ▼
                                      Vercel /api/wa/worker  (עד 800s)
                                      ├─ ✅ reaction + typing indicator
                                      ├─ טעינת user + memory + סיכום שיחה   ◄── Supabase (Frankfurt, RLS)
                                      ├─ Router: Haiku 5.5  →  פשוט? ענה / מורכב? Sonnet 5.5
                                      ├─ Tools: Graph (mail/cal/files) · Google · reminders · HYP
                                      │        תוצאות כלים = "מידע", לא הוראות
                                      ├─ פעולה יוצאת → pending_action + כפתורים (שלח/ערוך/בטל)
                                      ├─ קול: הורדה OGG → Soniox → טקסט
                                      └─ תשובה + audit_log + usage counter

[אתר Next.js 16 / Vercel Pro] ─ הרשמה OTP, OAuth callbacks (Microsoft/Google), אזור אישי, דף תשלום HYP → VERIFY
[Supabase pg_cron כל דקה] ─ jobs שהגיעו (סיכום בוקר, תזכורות, חידוש subscriptions, חיוב חודשי) → QStash → Vercel
[Microsoft Graph subscriptions] ─ מייל חדש → /api/graph/notify (202 + queue), חידוש כל 6 ימים
```

**Stack סופי:** Next.js 16 + TypeScript + Tailwind 4 + shadcn (RTL mode) על Vercel Pro ($20) · Supabase Pro Frankfurt ($25): Postgres, RLS, Vault, pg_cron, Storage · Upstash QStash (חינם עד 1,000/יום) · WhatsApp Cloud API ישירות מול Meta (בלי BSP) · Microsoft Graph ישיר (Entra multi-tenant ב-tenant של דניאל) · Google APIs ישיר · Anthropic API (Haiku 5.5 + Sonnet 5.5; בדיקת עברית מול Gemini 3.x Flash לפני נעילה) · Soniox לתמלול · HYP Pay (token + soft + SendHesh) · OpenRouter לתמונות. **בלי VPS, בלי Inngest, בלי Composio.**
**עלות תשתית קבועה:** ≈ $45 ≈ 140 ₪/חודש. בתקציב.

**למה לא Composio (מה ש-readywhen עושים):** מסך ההסכמה מציג "Composio", הטוקנים בארה"ב בלבד, ולא פותר את ה-Admin consent של Microsoft. אצלנו: Microsoft ישיר (הקהל העיקרי, יום עבודה). Google: Calendar + drive.file + gmail.send בלי CASA בשלב 1; קריאת Gmail אחרי CASA (~$550–720/שנה) בשלב 6.

### 2.1 ניתוב בין מודלים
1. כל הודעה → Haiku 5.5 (thinking off) עם system prompt משותף (cached) + פרופיל + סיכום שיחה: מסווג כוונה ומחזיר `{intent, complexity, needs_tools}`; אם פשוט (שאלה כללית, אישור, small talk) — עונה בעצמו.
2. מורכב/כלים (חיפוש מיילים, ניסוח, יומן, קבצים) → Sonnet 5.5 (effort low, `tool_choice: auto`, `strict: true`) בלולאת כלים.
3. סיכום בוקר → Sonnet 5.5 (לבדוק Haiku); תזכורות → תבנית ללא מודל.
4. עלות משוערת: $0.0018–0.0053/הודעה מעורב.

### 2.2 זיכרון
- `profile` (JSON): שם, עסק, תחום, העדפות, אנשי קשר חשובים, שעת סיכום.
- `conversation_summary`: סיכום מצטבר מתעדכן כל ~20 הודעות; למודל נשלחים הסיכום + 10 ההודעות האחרונות בלבד.
- `facts`: עובדות שהבוט למד (משימות פתוחות, "הרו"ח שלי הוא X").

### 2.3 אבטחה (לא אופציונלי)
- טוקני OAuth: AES-256-GCM עם מפתח ב-Vercel env (`TOKEN_ENC_KEY`), לא ב-DB; או Supabase Vault. אף פעם לא בלוגים.
- RLS על כל טבלה; service-role רק בשרת; בדיקת בידוד אוטומטית (לקוח א' ≠ לקוח ב').
- Scopes מינימליים; scope נוסף רק כשמפעילים יכולת.
- Prompt injection: תוכן מיילים/קבצים/הודעות נעטף כ-`<data>`; כל פעולה יוצאת = `pending_action` עם id, מתבצעת רק מלחיצת כפתור של אותו משתמש תוך 10 דק'.
- `audit_log` לכל פעולה: מה, מתי, למה, מי אישר, מזהה הודעת האישור.
- Webhooks: Meta HMAC + dedupe; HYP `APISign What=VERIFY` על כל redirect; Graph `clientState`.
- Rate limit: 20 הודעות/דקה למספר; חסימת מספרים לא מקושרים אחרי 3 ניסיונות טוקן.
- פרטיות: EU, מינימום נתונים (מטא-דאטה + סיכומים, לא גוף מיילים), 90 יום, מחיקת חשבון מלאה (כולל Graph subscriptions ו-revoke), מסמכי פרטיות/תנאים (טיוטה לעו"ד), DPA עם ספקים מחוץ ל-EU.

---

## 3. סכמת DB (Supabase, Postgres)

```
users             id, email (unique), name, business_name, business_type, timezone, morning_time, locale, created_at, deleted_at
auth_otps         id, email, code_hash, expires_at, attempts, used_at
link_tokens       id, user_id, token (unique), expires_at, used_at
wa_identities     id, user_id, phone_e164 (unique), wa_name, linked_at, status
connections       id, user_id, provider (microsoft|google), account_email, tenant_id, scopes[], enc_access, enc_refresh, expires_at, status, consent_type (user|admin), created_at, revoked_at
graph_subscriptions id, connection_id, subscription_id, resource, expires_at, client_state
messages          id, user_id, wa_message_id (unique), direction (in|out), type (text|audio|image|doc|button|template), text, media_url, transcript, model_used, tokens_in, tokens_out, cost_usd, agent_key, hidden_from_model (ניהול סוכנים — לא נשלח למודל), created_at
conversation_state user_id (pk), summary, last_summarized_msg_id, facts jsonb, updated_at
pending_actions   id, user_id, kind (send_mail|create_event|update_event|delete_event|share_file|forward_mail), payload jsonb, status (pending|approved|edited|cancelled|executed|expired), expires_at, approved_msg_id, executed_at, agent_key, agent_name (תקרה יומית לסוכן — טריגר enforce_agent_daily_cap)
jobs              id, user_id, kind (morning_summary|reminder|renew_subscription|charge|retry|proactive_scan), run_at, payload jsonb, status, attempts, last_error
proactive_alerts (0013) id, user_id, item_key, kind, channel (urgent|summary), status (sent|deferred|folded|listed), local_day, payload (מטא-דאטה בלבד), created_at — התקרה של 2 ביום אטומית ב-proactive_alert_claim(); נמחק אחרי 30 יום
reminders         id, user_id, text, due_at, job_id, status
usage             user_id, period_start, counted_messages, free_remaining, plan_limit, updated_at
subscriptions     id, user_id, plan (trial|basic|pro), status (trial|active|past_due|cancelled), hyp_token_enc, hyp_tokef, hyp_hkid, next_charge_at, cancelled_at
payments          id, user_id, hyp_trans_id (unique), amount_ils, ccode, acode, invoice_url, raw jsonb, created_at
audit_log         id, user_id, action, target, reason, approved_by_msg_id, pending_action_id, result, agent_key, agent_name, created_at
agents (0006)     id, user_id, name, role (secretary|intern|bookkeeper|custom), template, instructions, tools[] (יכולות), permissions jsonb (recipients, max_outbound_per_day), enabled
                  מובנים מוגדרים בקוד; שורה עם role מובנה = התאמה של משתמש פרו. מכסת מותאמים: ניסיון 0 / בסיסי 1 / פרו 3 (טריגר enforce_agent_rules). docs/design/agents.md
wa_templates      name, category, language, status, body
```
RLS: `user_id = auth.uid()` על הכול; הבוט פועל עם service-role בשרת בלבד. `messages`/`audit_log` מוחקים/מאנונמים אחרי 90 יום (pg_cron).

**מה נספר כ"הודעה" בניסיון:** כל הודעה נכנסת מהמשתמש (טקסט/קול/תמונה) שגוררת תשובה. לחיצות כפתור אישור, הודעות יזומות של הבוט, ותשובות שגיאה — לא נספרות. 10 חינם; התראה עדינה כשנשארות 3; בסיום — קישור תשלום ועצירה מנומסת עם המשך מאותו מקום אחרי תשלום.

---

## 4. מסלולים ותשלום (HYP)

**החלוקה שדניאל אישר ב-23.10.2026** (מקור אמת יחיד בקוד: `entitlements(plan)` ב-`lib/billing/plans.ts`; האכיפה בצד השרת, לא רק בממשק):

| | **בסיסי 99 ₪** | **פרו 299 ₪** |
|---|---|---|
| חשבונות מחוברים | אחד: Google **או** Microsoft | Google **ו**-Microsoft יחד |
| מייל, יומן (כולל קישור Meet / Teams), קריאה/סיכום/ניסוח/שליחה באישור | ✓ | ✓ |
| קריאת קבצים (OneDrive: Word/Excel/PowerPoint; Drive: קבצים שנפתחו דרך עלזה) | ✓ | ✓ |
| סיכום בוקר, תזכורות, הודעות קוליות | ✓ | ✓ |
| הודעות/חודש | עד 750 (~25 ביום) | fair use 3,000 |
| Google Tasks / Microsoft To Do | – | ✓ |
| SharePoint | – | ✓ |
| חיפוש וקריאה בכל ה-Drive (Docs/Sheets/Slides, `drive.readonly`) | – | ✓ |
| שמירת מסמכים חדשים ב-Drive (OneDrive: עוד לא) | – | ✓ |
| סוכנים מובנים (מזכירה / מתמחה / מנהלת חשבונות) | – | ✓ (כולל התאמה והשבתה) |
| סוכנים משלך | 1 | עד 3 |
| התראות יזומות ("דברים שכדאי לא לפספס" בסיכום הבוקר + עד 2 התראות דחופות ביום, 08:00–20:00, לא בשבת ובחג) ואזהרות פישינג | – | ✓ (23.10.2026) |
| סיכומי פגישות Teams ו-Google Meet (מהתמליל שהפלטפורמה שמרה, בלי בוט בפגישה; מייל סיכום לאישור, מסמך משימות, משימות ברשימה) | – | ✓ (23.10.2026) |
| סיכומי פגישות Zoom · מערכות העסק (monday ועוד) | – | בקרוב |

- **תקופת ניסיון (10 הודעות):** כמו בסיסי בחיבורים ובשירותים (חשבון אחד, בלי שירותי פרו), כדי שלשדרוג יהיה ערך; הסוכנים המובנים כמו שהם (ההחלטה הקודמת, docs/design/agents.md §0.3).
- **מי שחיבר שני חשבונות לפני החלוקה (או ירד מפרו לבסיסי):** לא מנתקים ולא מוחקים. החשבון שחובר אחרון פעיל, השני "מושהה" (הכלים, סיכום הבוקר וההקשר של המודל לא משתמשים בו), והאזור האישי מציג הודעה: לנתק אחד מהם או לשדרג.
- השורות "היסטוריה וזיכרון 90/365 יום" ו"עדיפות למודל החזק" ירדו מהרשימות הציבוריות: עוד לא ממומשות בקוד (פתוח להחלטה של דניאל).

מרווח גולמי (אחרי מע"מ 18%, לפי מחקר): 99 ₪ → קל 85%, בינוני 62–71%, כבד 6–31% ← לכן ההגבלה ל-750; 299 ₪ → 69–95%.

**זרימת תשלום HYP (יעד שריג):** 10 הודעות נגמרו → הבוט שולח קישור אישי → `APISign What=SIGN` עם `Amount, Coin=1, Order=<user>, Sign=True, MoreData=True, SendHesh=True, email` → דף תשלום HYP בעברית → redirect ל-success URL → השרת מאמת `APISign What=VERIFY` → `getToken` (שומר Token+Tokef מוצפנים) → subscription active → הבוט: "החשבון פעיל, ממשיכים". חידוש חודשי: pg_cron → `action=soft&CC=<token>&Token=True&SendHesh=True` (חשבונית מס-קבלה אוטומטית של HYP Invoice). כישלון → 3 ניסיונות ביום 1/3/5 → past_due → הודעה. ביטול → `status=cancelled`, פעיל עד סוף התקופה. **אין webhook ב-HYP** — הכול דרך redirect מאומת + חיוב יזום שלנו (לכן לא משתמשים ב-HK של HYP).

---

## 5. וואטסאפ — מגבלות ועלות (ישראל, מ-1.10.2026)

- **חלון 24 שעות:** כל הודעת משתמש פותחת/מאפסת. בתוכו — טקסט חופשי, כפתורים, תמונות. מחוצה לו — רק Template מאושר. **סיכום בוקר ותזכורות = תבניות Utility** (אישור עד 24ש'). אם המשתמש עונה — נפתח חלון.
- **מחירים (לא מאומת, אגרגטורים):** Utility/Service ≈ $0.0053 להודעה; Marketing ≈ $0.035. Service: 1,000 חינם למספר לחודש (משותף לכולם), אח"כ $0.0053. → לאחד בועות להודעה אחת.
- **תבניות שנרשום:** `morning_summary`, `reminder`, `trial_ended_payment`, `payment_success`, `reconnect_needed`.
- יכולות: reply buttons (3), lists (10), reactions, typing+read, media. מספר +972 (SIM ייעודי, לא פעיל באפליקציה). מגבלת unique users: 250 → 2,000 אחרי אימות עסק → אוטומטי.

---

## 6. המלצת AI, תמלול ושרת

- **LLM:** Haiku 5.5 ($0.10/$0.50) router + Sonnet 5.5 ($2/$10) חזק, prompt caching. **אין נתוני עברית לדור 5.x** (ב-leaderboard הישראלי Gemini 3 Pro/Flash 74, GPT-5.1 72.7, Claude 4.5 ~62). לכן: **אבן דרך 0 = בדיקת 100 הודעות בעברית** Haiku/Sonnet 5.5 מול Gemini 3.1 Flash-Lite/3.8 Flash ו-gpt-5.6; בוחרים לפי איכות+מהירות. הקוד נכתב עם שכבת provider ניתנת להחלפה.
- **EU:** Anthropic API ישיר = US. אם נדרש EU מלא → Bedrock eu endpoint (+10%). ממליץ להתחיל ישיר (DPA + no-training) ולעבור אם לקוח ידרוש.
- **תמלול עברי:** Soniox (WER 9% על סט וואטסאפ, $0.0017/דק') ראשי; gpt-4o-transcribe גיבוי; ivrit.ai self-host אם נרצה 6%.
- **שרת:** אין VPS. Vercel Pro (functions עד 800s) + Supabase Pro. הגדלה: 10 לקוחות — כלום; 100 — Supabase compute add-on (~$10–50), QStash בתשלום (~$1/100K); 1,000 — Supabase Medium/Large, שקילת מספר וואטסאפ לכל לקוח (1,000 חינם לכל מספר), Bedrock EU, אולי worker ייעודי (Hetzner CX23 €6, נירנברג) ל-STT self-host.
- **עלות ללקוח/חודש:** קל ≈13–15 ₪ · בינוני ≈25–32 ₪ · כבד ≈58–79 ₪ (וואטסאפ > AI).

---

## 7. עשרה שמות (בדיקת דומיין 20.10.2026; .co.il לפי DNS = "כנראה פנוי", לאמת ב-ISOC)

| # | שם | סגנון | הסבר | .co.il | .ai | .com | מותג ישראלי |
|---|---|---|---|---|---|---|---|
| 1 | **מוכן** mukan | מקצועי | "מוכן" = ready, נשמע כמו "נעשה". קצר, חיובי | כנראה פנוי | כנראה פנוי | תפוס (טורקי) | לא נמצא ← **המלצה** |
| 2 | **מזכיר** mazkir | מקצועי | מזכיר אישי + "מזכיר לך". ברור לעו"ד | כנראה פנוי | תפוס | תפוס (למכירה) | קרוב ל-mazkira.co.il (מרכזיה AI) |
| 3 | **תפקיד** tafkid | מקצועי | "זה התפקיד שלי". רציני | תפוס (DNS שבור) | פנוי | תפוס | – |
| 4 | **נכון** nachon | מקצועי | אמינות, דיוק | תפוס (סוכנות) | פנוי | תפוס | – |
| 5 | **בסדר** beseder | באמצע | "בסדר, סידרתי" — ישראלי בלי להיות מגוחך | תפוס | פנוי | תפוס | – |
| 6 | **סידור** sidur | באמצע | "סידור עבודה", "אני מסדר לך" | תפוס | כנראה פנוי | תפוס | מילה נפוצה |
| 7 | **דיוק** diuk | באמצע | מדויק, מקצועי | תפוס | כנראה פנוי | תפוס | – |
| 8 | **זריז** zariz | באמצע | מהיר, קליל | תפוס (סוכנות) | כנראה פנוי | תפוס | "זריז טכנולוגיות" |
| 9 | **הכל בסדר** hakolbeseder | מצחיק | התשובה הישראלית לכל דבר | תפוס | פנוי | תפוס | עסק קטן למעברי דירה |
| 10 | **סגור** sagur | מצחיק | "סגרתי לך את זה" | תפוס | תפוס | תפוס (למכירה) | צריך וריאציה (sagur-li) |

נפסלו: מזכירה, קודם, עוזר, נקודה, יומן — יש מוצר AI/וואטסאפ/יומן באותו שם. אחרי בחירה: לאמת ב-whois.isoc.org.il + חיפוש סימני מסחר.

---

## 8. סיכונים עיקריים

| # | סיכון | חומרה | התמודדות |
|---|---|---|---|
| 1 | **Meta Terms §4.7 "AI Providers"** — אסור ל-AI כפונקציה *עיקרית* (חל מ-15.1.2026; ChatGPT/Perplexity עזבו). עסקים שמשרתים לקוחות ב-AI — מותר. אנחנו אזור אפור | **קריטי** | לפני פיתוח: חוות דעת עו"ד + פנייה ל-Meta/פרטנר; מסגור "עוזר משרדי לעסק" (לא "צ'אטבוט AI"); תוכנית B: מספר וואטסאפ לכל לקוח (העסק שלו) |
| 2 | **Admin consent ב-M365** — מאז 2025 משתמשים לא מאשרים Mail/Calendar/Files.All לבד | גבוה | מסך "שלח למנהל IT" עם admin-consent URL; דניאל מאשר ללקוחותיו; Publisher Verification |
| 3 | איכות עברית של Haiku/Sonnet 5.5 לא מוכחת | בינוני | בדיקה לפני נעילה; שכבת provider |
| 4 | עלות וואטסאפ בלקוח כבד | בינוני | מכסה 750 בבסיסי, איחוד בועות |
| 5 | Google Gmail reading דורש CASA (~$700/שנה, שבועות) | בינוני | שלב 1 בלי קריאת Gmail; CASA בשלב 6 |
| 6 | HYP בלי webhook | נמוך | redirect מאומת + חיוב יזום שלנו |
| 7 | תיקון 13 / תקנות אבטחה — רמה "בינונית" כנראה | בינוני | לוגים 24 חודש, MFA, DPA, מסמך הגדרות מאגר, מדיניות בעברית |
| 8 | Display name / Business verification של Meta מתעכב | נמוך | להתחיל מיד |

---

## 9. חשבונות ואישורים שדניאל פותח (לפי סדר)

| # | מה | איפה | זמן |
|---|---|---|---|
| 1 | בחירת שם → קניית דומיין (.co.il + .ai) | isoc / Namecheap | יום |
| 2 | Meta: אימות Business (אם לא מאומת), אפליקציה WhatsApp, SIM ישראלי ייעודי, Display name, אמצעי תשלום, System user token | business.facebook.com / developers.facebook.com | 1–5 ימי עסקים |
| 3 | Entra: רישום אפליקציה multi-tenant ב-tenant של העסק, redirect URIs, secret; Partner Center → Publisher Verification | portal.azure.com / partner.microsoft.com | 1–7 ימים |
| 4 | Google Cloud: פרויקט, OAuth consent (external), scopes calendar + drive.file + gmail.send, אימות sensitive (וידאו + מדיניות) | console.cloud.google.com | 3–5 ימי עסקים |
| 5 | HYP: הפעלת טוקנים במסוף (שגיאה 901 = לא מופעל), "אימות על ידי חתימה", success URL, מסוף בדיקה, KEY/PassP | פורטל HYP | 1–3 ימים |
| 6 | Anthropic, Soniox, OpenRouter, Upstash, Vercel Pro, Supabase Pro (Frankfurt) | — | שעה |
| 7 | עו"ד: חוות דעת Meta §4.7 + מדיניות פרטיות/תנאים (אני כותב טיוטה) | — | במקביל |
| 8 | (שלב 6) CASA AL2 דרך TAC Security | — | שבועות, ~$550–720 |

---

## 10. עיצוב, פונטים, תמונות

- **Skills להתקנה (אחרי אישור):** Anthropic `frontend-design` (SKILL.md בלבד, אפס סקריפטים — בטוח) ✓ ; `pbakaus/impeccable` — חזק (61 כללי "AI tells", /audit /polish /animate) אבל מתקין hooks ב-settings.local.json, מוריד binary, טלמטריה דלוקה — **להתקין עם `DO_NOT_TRACK=1` ולבדוק את ה-hooks**, או לוותר; `vercel-labs/agent-skills` web-design-guidelines מושך כללים מ-GitHub בכל הרצה — לא להתקין.
- **ספריות:** motion 14 (RTL: להפוך x), GSAP 3.15 (חינם כולל plugins), lenis, dotlottie-react, shadcn 4 עם `rtl: true`, Magic UI (MIT). לא Aceternity בתשלום.
- **פונטים (4 זוגות, כולם Google, self-host ב-next/font עם subsets hebrew+latin):** 1) Frank Ruhl Libre 700–900 / Assistant — עורך-דין-י, אמין ← המלצה; 2) Suez One / IBM Plex Sans Hebrew — חם+טכני; 3) Karantina (hero בלבד) / Heebo — דרמטי; 4) Bona Nova / Noto Sans Hebrew narrow — שקט ופרימיום. בתשלום: Fontef Narkiss Block ₪1,000 (web, perpetual; אוסר שימוש עם AI tools!), AlefAlefAlef Almoni ~$1,350 משפחה. **לא Rubik** (גנרי).
- **OpenRouter תמונות:** `black-forest-labs/flux.2-pro` $0.03/תמונה לאיורים/hero; `openai/gpt-image-2` $0.006 (low) לסקיצות; Nano Banana 2 $0.067 לעריכות. ~30 תמונות ≈ $1–2. **וידאו:** יש ב-OpenRouter (veo-3.1-lite ~$0.40/8s, kling-v3 ~$0.42/5s) — אשאל לפני.
- **לפני בנייה:** 3 כיווני עיצוב (דפי דוגמה) — דניאל בוחר. 2 מועמדים מוקדמים: "משרד שקט" (ירוק-זית/שמנת, Frank Ruhl), "כחול-לילה" (navy/לימון, Suez One).

---

## 11. שלבי פיתוח ואבני דרך

| אבן דרך | תוכן | בדיקה |
|---|---|---|
| **0 — בדיקת עברית** | סקריפט 100 הודעות × 4 מודלים, דוח איכות/מהירות/עלות | טבלה; דניאל מאשר מודל |
| **1 — אתר + הרשמה** | Next.js, RTL, עיצוב נבחר, OTP במייל (Resend), מסך "חבר M365/Google" (דלג), מסך קונפטי + wa.me/QR, אזור אישי | Lighthouse 90+, OTP מגיע, טוקן נוצר |
| **2 — וואטסאפ + זיהוי** | webhook מאומת, dedupe, QStash, קישור טוקן↔טלפון, ברוך הבא + כרטיס + onboarding, reaction/typing, router Haiku, זיכרון | שיחה אמיתית מהטלפון של דניאל |
| **3 — ניסיון + תשלום** | ספירת 10, התראה ב-3, קישור HYP, VERIFY, token, "פעיל", חיוב חודשי, כישלון, ביטול, חשבונית | תשלום בדיקה במסוף 00100… |
| **4 — Microsoft 365** | OAuth + admin consent flow, Mail (קריאה/סיכום/חיפוש/ניסוח/שליחה באישור), Calendar (היום/מחר/קביעה/הזזה/ביטול), OneDrive (חיפוש, שליחת קובץ, Word/Excel/PPT→PDF→טקסט), Graph subscriptions | 2 tenants (עם/בלי user consent), בדיקת בידוד RLS |
| **5 — סיכום בוקר + תזכורות + קול** | תבניות Meta, pg_cron+jobs, תזכורות בשפה חופשית, Soniox | סיכום ב-07:30 של דניאל, הקלטה בעברית |
| **6 — Google** | Calendar + drive.file + gmail.send; CASA → Gmail read | חשבון Workspace + Gmail פרטי |
| **7 — Launch** | מדיניות פרטיות/תנאים, audit, rate limit, Lighthouse, 5 לקוחות ראשונים | — |
| **שלב 2** | סוכנים מותאמים (טבלת agents, תפקיד/הוראות/כלים/הרשאות), מזכירה/מתמחה/מנהלת חשבונות (חשבונית ירוקה/iCount) | — |
| **שלב 3 (קונספט)** | סוכן על המחשב של הלקוח — רק מסמך אבטחה | — |

בכל אבן דרך: קוד נקי + בדיקות, הסבר קצר בעברית, רשימת "מה דניאל עושה ידנית" (env vars, פורטלים).

---

## 12. אימות end-to-end (איך נדע שעובד)

1. הרשמה ממכשיר נקי → קוד במייל → M365 → קונפטי → wa.me → הבוט עונה תוך <5 שניות בעברית.
2. "מה יש לי מחר?" → יומן אמיתי. "תנסח תשובה ל-X" → טיוטה + כפתורים → "שלח" → המייל יצא → audit_log.
3. הקלטה בעברית → תמלול → פעולה.
4. 10 הודעות → קישור HYP → תשלום בדיקה → "פעיל" → חשבונית במייל.
5. בדיקת בידוד: משתמש ב' מנסה לקרוא נתוני א' דרך API → נחסם (RLS test).
6. 07:30 → סיכום בוקר מגיע כתבנית גם בלי חלון פתוח.
7. ניתוק חיבור + מחיקת חשבון → טוקנים נמחקו, subscriptions בוטלו, 0 שורות.

---

## נספח — תשובות התחקיר ומקורות (מקוצר)
- סבבים 1–5: קהל עו"ד/רו"ח/יועצים/קליניקות; M365 עיקרי + Google/Gmail/Outlook.com; חשבון פר-אדם; MVP מלא; אפס פעולות יוצאות בלי אישור; HYP יעד שריג + חשבוניות; 99/299; 10 הודעות; אין דומיין; Meta Business קיים; Google Cloud ייפתח; שירות עצמי; ≤300 ₪; אתר באותו מבנה עם מיתוג שלנו; טון מקצועי-חם; EU מינימום נתונים; חיבור בניסיון; כפתורים; כרטיס+משימה; שם עברי מקצועי; Entra tenant קיים.
- צילומי readywhen: /start → /login (Google / email / "Joined on WhatsApp? Sign in") → email → OTP → Connect Gmail/Outlook (Composio) → קונפטי → wa.me +44 עם טוקן → וואטסאפ (8 צילומים ב-scratchpad/wa/).
- מקורות מרכזיים: developers.facebook.com/docs/whatsapp/pricing (+updates-to-pricing), facebook.com/legal/Meta-Terms-for-WhatsApp-Business-Platform §4.7, learn.microsoft.com (publisher-verification, manage-app-consent-policies, driveitem-get-content-format, subscription), developers.google.com restricted-scope-verification + CASA, platform.claude.com/docs pricing, huggingface.co hebrew-llm-leaderboard, ivrit-ai hebrew-transcription-leaderboard, developers.hyp.co.il/pay (recurring-payments, tokenization, transaction-validation, basic-invoicing), vercel.com/pricing, supabase.com/pricing, upstash.com/pricing/qstash, openrouter.ai image/video pricing, fonts.google.com/metadata, github.com/pbakaus/impeccable, ui.shadcn.com/docs/rtl.
