# מעבר לחשבונות האמיתיים (GitHub + Vercel)

Supabase נשאר במקומו (אותו פרויקט, פרנקפורט; המזהה בדשבורד בלבד). הכתובת החדשה: **https://alze-nine.vercel.app** (זמנית, עד שיהיה דומיין).

## מצב (25.10)
- ✅ הריפו: `danielnotexist/WhatsappBOT`, ענף ברירת מחדל `main`.
- ✅ Vercel החדש (Hobby, `danielnotexist's projects`): 29 משתנים, פריסת ייצור מ-`main`, בדיקת עשן עברה.
- ✅ Supabase: Vault `tick_url` + `cron_secret`, 0019 (`wabot_tick` כל דקה מחזיר 200), ובלוקי ה-pg_cron של 0013–0017.
- ✅ Meta: ה-webhook מצביע ל-`https://alze-nine.vercel.app/api/wa/webhook` (אומת).
- ⏳ Entra + Google: להוסיף את כתובות החזרה (טבלה 4).
- ⏳ טוקן וואטסאפ קבוע (הנוכחי פג).
- ⏳ להשבית את הפרויקט הישן אחרי 24 שעות תקינות.
הסימון ✋ = דניאל, 🤖 = Claude.

## 1. לפני המעבר
- 🤖 כל העבודה (Preview) נדחפה לענף `main`, כולל המתזמן החדש: Supabase (pg_cron + pg_net, מיגרציה 0019) קורא כל דקה ל-`GET /api/jobs/tick` - עובד גם ב-Vercel Hobby, בחינם.
- ✋ GitHub → הריפו → Settings → General → **Default branch** → `main`.

## 2. GitHub
- ✋ Settings → Danger zone → **Transfer** → שם החשבון החדש.
- ✋ להתקין את אפליקציית Claude על החשבון החדש ולתת גישה לריפו: https://github.com/apps/claude/installations/select_target
  (בלי זה Claude מאבד גישה לריפו אחרי ההעברה.)

## 3. Vercel החדש
- Hobby (חינם) מספיק לבדיקות. ב-Hobby אין חברי צוות, ולכן לא מעבירים (Transfer) את הפרויקט הישן אלא מייבאים מחדש.
  Pro נדרש רק בהשקה (שימוש מסחרי).
- ✋ Add New → Project → Import → הריפו. לא צריך להגדיר כלום; אם הפריסה הראשונה נכשלת על משתנים חסרים - זה צפוי.
- ✋ Account Settings → Tokens → טוקן לצוות של הפרויקט, תוקף 30 יום → להעביר ל-Claude.
- 🤖 ענף ייצור `main`, 29 המשתנים + `CRON_SECRET` חדש, `APP_URL` לכתובת החדשה, פריסה ובדיקת עשן.
- 🤖 Supabase: הסודות `tick_url` + `cron_secret` ב-Vault, מיגרציה 0019 (מחליפה את `wabot_dispatch_due_jobs`), ובלוקי ה-pg_cron של 0013–0017.
- ⚠️ `TOKEN_ENC_KEY` של הפרויקט הישן מוגדר sensitive ואי אפשר לקרוא אותו (בדקנו: העותק שאצל Claude לא תואם). בפרויקט החדש נוצר
  מפתח חדש, ולכן אחרי המעבר: כולם נכנסים שוב לאתר, מחברים מחדש Google / Microsoft, וכרטיס בדיקה ב-HYP מוזן מחדש. בסביבת טסט זה בסדר.

## 4. כתובות חזרה (`<new>` = `https://alze-nine.vercel.app`)
| שירות | מה | מי |
|---|---|---|
| Microsoft Entra → App registrations → האפליקציה → Authentication | להוסיף Redirect URI: `<new>/api/auth/microsoft/callback` (להשאיר את הישן עד סוף המעבר). ב-API permissions להוסיף: Tasks.ReadWrite, Sites.Read.All, OnlineMeetings.Read, OnlineMeetingTranscript.Read.All | ✋ |
| Google Cloud → APIs & Services → Credentials → ה-OAuth client | Authorized redirect URI: `<new>/api/auth/google/callback`; Authorized JavaScript origin: `<new>`. ב-Library להפעיל Google Tasks API | ✋ |
| Meta (וואטסאפ) | Callback URL של ה-webhook: `<new>/api/wa/webhook` - **רגע המעבר בפועל** | 🤖 |
| Microsoft Graph (התראות מייל) | חידוש המינויים לכתובת החדשה | 🤖 |
| HYP | בדיקה אם מוגדרות כתובות בפאנל של HYP | 🤖 בודק, ✋ מעדכן |

## 5. אחרי 24 שעות תקינות
- ✋ להשבית את הפרויקט הישן ב-Vercel.
- ✋ להסיר את כתובות החזרה הישנות מ-Entra ומ-Google.

## אחר כך
- דומיין: מחברים ב-Vercel, מעדכנים שוב `APP_URL` ואת טבלה 4, מאמתים את הדומיין ב-Resend, ומכבים `DEMO_MODE`.
- וואטסאפ: טוקן קבוע ורישום 18 התבניות.
