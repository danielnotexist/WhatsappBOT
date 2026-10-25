# מעבר לחשבונות האמיתיים (GitHub + Vercel)

Supabase נשאר במקומו (`wrlmfpixcpqezakslzwz`, פרנקפורט). הכתובת זמנית `<project>.vercel.app` עד שיהיה דומיין.
הסימון ✋ = דניאל, 🤖 = Claude.

## 1. לפני המעבר
- 🤖 כל העבודה (Preview) נדחפה לענף `main`, כולל המתזמן החדש (Vercel Cron כל דקה → `/api/jobs/tick`).
- ✋ GitHub → הריפו → Settings → General → **Default branch** → `main`.

## 2. GitHub
- ✋ Settings → Danger zone → **Transfer** → שם החשבון החדש.
- ✋ להתקין את אפליקציית Claude על החשבון החדש ולתת גישה לריפו: https://github.com/apps/claude/installations/select_target
  (בלי זה Claude מאבד גישה לריפו אחרי ההעברה.)

## 3. Vercel החדש
- ✋ לשדרג ל-**Pro** (שימוש מסחרי + Cron כל דקה; ב-Hobby הפריסה של `main` תיכשל בגלל ה-Cron).
- ✋ Add New → Project → Import → הריפו. לא צריך להגדיר כלום; אם הפריסה הראשונה נכשלת על משתנים חסרים - זה צפוי.
- ✋ Account Settings → Tokens → טוקן לצוות של הפרויקט, תוקף 30 יום → להעביר ל-Claude.
- 🤖 ענף ייצור `main`, 29 המשתנים + `CRON_SECRET` חדש, `APP_URL` לכתובת החדשה, פריסה ובדיקת עשן.
- 🤖 בלוקי ה-pg_cron של 0013–0017 ב-Supabase.
- ⚠️ `TOKEN_ENC_KEY` של הפרויקט הישן מוגדר sensitive ואי אפשר לקרוא אותו (בדקנו: העותק שאצל Claude לא תואם). בפרויקט החדש נוצר
  מפתח חדש, ולכן אחרי המעבר: כולם נכנסים שוב לאתר, מחברים מחדש Google / Microsoft, וכרטיס בדיקה ב-HYP מוזן מחדש. בסביבת טסט זה בסדר.

## 4. כתובות חזרה (`<new>` = הכתובת החדשה)
| שירות | מה | מי |
|---|---|---|
| Microsoft Entra → App registrations → האפליקציה → Authentication | להוסיף Redirect URI: `<new>/api/auth/microsoft/callback` (להשאיר את הישן עד סוף המעבר). ב-API permissions להוסיף: Tasks.ReadWrite, Sites.Read.All, OnlineMeetings.Read, OnlineMeetingTranscript.Read.All | ✋ |
| Google Cloud → APIs & Services → Credentials → ה-OAuth client | Authorized redirect URI: `<new>/api/auth/google/callback`; Authorized JavaScript origin: `<new>`. ב-Library להפעיל Google Tasks API | ✋ |
| Meta (וואטסאפ) | Callback URL של ה-webhook: `<new>/api/wa/webhook` - **רגע המעבר בפועל** | 🤖 |
| Microsoft Graph (התראות מייל) | חידוש המינויים לכתובת החדשה | 🤖 |
| HYP | בדיקה אם מוגדרות כתובות בפאנל של HYP | 🤖 בודק, ✋ מעדכן |

## 5. אחרי 24 שעות תקינות
- ✋ להשבית את הפרויקט הישן ב-Vercel (danielnotexist404s-projects/alze).
- ✋ להסיר את כתובות החזרה הישנות מ-Entra ומ-Google.

## אחר כך
- דומיין: מחברים ב-Vercel, מעדכנים שוב `APP_URL` ואת טבלה 4, מאמתים את הדומיין ב-Resend, ומכבים `DEMO_MODE`.
- וואטסאפ: טוקן קבוע ורישום 18 התבניות.
