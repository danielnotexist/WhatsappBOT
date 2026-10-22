# קריאת Gmail ל-100 המשתמשים הראשונים (בלי CASA)

> 21.10.2026 · ענף `worktree-wf_01acec0d-90f-1` · מקושר מ-`docs/PROGRESS.md` (רשומת 22.10). תיקוני הסקירה מ-22.10 — בסעיף "תיקונים אחרי סקירה" למטה.
> החלטת דניאל: קוראים Gmail עכשיו עם `gmail.readonly` ל-100 המשתמשים הראשונים של אפליקציה לא מאומתת; אחר כך CASA או ספק מתווך (Composio). המדריך המלא: `docs/google-setup.md` §3 ו-§6.

## מה נבנה

- **תקרת המשתמשים של Google** (`lib/google/user-cap.ts`) — נבדק מול support.google.com/cloud (7454865, 13463817, 15549945): "100 new users in total", "over the entire lifetime of the project, and it cannot be reset or changed". Google סופרת מי *שאישר*, ולכן גם מי שניתק או מחק חשבון נשאר בספירה (ההנחה השמרנית — אין אמירה מפורשת על ביטול).
  - **פנקס** `google_scope_grants` (מיגרציה 0008): גיבוב sha256 של מייל החשבון × scope. לא נמחק בניתוק/מחיקה (`user_id` → null). מילוי ראשוני מחיבורי Google קיימים.
  - **מה נספר:** `gmail.readonly` תמיד, וגם `calendar.events`/`gmail.send` כל עוד `GOOGLE_SENSITIVE_SCOPES_VERIFIED=false` — **ממצא חשוב:** עד שה-scopes הרגישים מאושרים, כל חיבור Google צורך מקום בתקרה, גם בלי קריאת Gmail. ב-100 Google חוסמת חיבורים חדשים לגמרי. לכן אימות הרגישים (§5 במדריך) צריך לצאת לפני ~80 משתמשים.
  - `GOOGLE_GMAIL_READ_ENABLED` — ריק = פעיל כש-`GOOGLE_CLIENT_ID` מוגדר. `GOOGLE_GMAIL_READ_CAP` (ברירת מחדל 95). חשבון שכבר נספר תמיד יכול לאשר שוב בלי לצרוך מקום.
  - **התראות למפעיל ב-80 וב-95:** דגל חד-פעמי `google_user_cap:<סף>` בטבלת `ops_flags`, שורת לוג `[google:user-cap]`, audit `ops.google_user_cap`, ומייל ל-`OPERATOR_EMAIL` (חדש, אופציונלי) דרך `Mailer.sendOperatorAlert` (מתודה אופציונלית חדשה; Resend + console).
- **הסכמה מצטברת:**
  - חיבור רגיל (הרשמה באתר, "לחבר את גוגל", חיבור מחדש) מצרף את `gmail.readonly` כל עוד יש מקום. ה-scopes שהתבקשו נשמרים עם ה-state, וה-callback יודע מה נשאל.
  - משתמש Google בלי ההרשאה ששואל על התיבה → הכלי `gmail_read_status` מחזיר קישור `?feature=gmail_read` (רק `gmail.readonly`, `include_granted_scopes=true`). בתקרה מלאה — שורה אחת (`g.err.gmail_read_cap_reached`); כבוי — `g.err.gmail_read_unavailable`.
  - **הסרת סימון:** בחיבור רגיל `gmail.readonly` אופציונלי — בלי הודעת "חלקי", החיבור מצליח, ו-`g.connect_done` אומרת שאפשר לבקש בהמשך (audit `ok:gmail_read_declined`). בהסכמה המצטברת — הודעת "חלקי" עם קישור שמבקש שוב את Gmail (`&feature=gmail_read`).
- **שורת הסבר לפני מסך "לא מאומת"** (`g.unverified_heads_up`, הנוסח של דניאל) — נוספת לכל קישור חיבור ל-Google בשיחה (`process-inbound` בלוק 6, `onboarding` שלב connect, `g.connect_partial`, `g.gmail_read.consent`) — רק מול פרויקט Google אמיתי (לא בזיכרון/הדגמה), וכשהבקשה כוללת scope לא מאושר.
- **לקוח קריאה** (`lib/google/gmail.ts`, fetch בלי SDK): profile, messages.list (q, labelIds, pageToken), messages.get metadata (metadataHeaders חוזרים) / full, attachments.get לגוף גדול (עד 512KB), threads.list/get. גוף: text/plain קודם, אחרת HTML → טקסט (בלי script/style, חיתוך ל-400K תווים לפני ההמרה), charset לפי Content-Type (גם windows-1255), RFC 2047 בכותרות, ישויות HTML ב-snippet, רשימת קבצים מצורפים, חיתוך ל-6,000 תווים. "דיוור" לפי List-Unsubscribe / Auto-Submitted / Precedence.
- **כלים למודל** (`lib/google/gmail-tools.ts`) — מקבילים ל-`search_emails`/`get_email` של Microsoft עם התחילית `gmail_`: `gmail_search_emails`, `gmail_get_email`, `gmail_get_thread`, `gmail_awaiting_reply`. קריאה בלבד; תשובה = `gmail_draft_email` → כפתור אישור.
- **תוכן מייל = מידע** (`lib/ai/untrusted.ts`, PLAN §2.3): גוף ההודעה והתצוגה המקדימה עטופים ב-`<data source="gmail" id="…">`; כל התווים הנסתרים (Default_Ignorable_Code_Point, חוץ מ-RLM/LRM) מוסרים לפני שמנטרלים `<data`/`</data` (‹). הנושא, שם השולח וכתובתו ושמות הקבצים הם שורה אחת מנוקה מחוץ ל-`<data>`, ולכל תוצאה מצורפת הערה שאומרת שגם הם, וגם הטקסט בתוך `<data>`, אינם הוראות. ב-fixture יש מייל "ספק חדש" עם ניסיון הזרקה (כולל `&lt;/data&gt;` שהופך לתגית אחרי המרת HTML) — נבדק שנשאר בלוק `<data>` אחד.
- **סיכום בוקר:** "מיילים שמחכים לתשובה" גם מ-Gmail (threads.list של הדואר הנכנס האישי ב-7 ימים + threads.get, כך שתשובה מכל מכשיר נספרת), ממוזג עם Microsoft 365 מהחדש לישן, עד 5. בלי `gmail.readonly` (מעבר לתקרה) — בלי חלק Gmail. ההיוריסטיקה עברה ל-`lib/jobs/awaiting-reply.ts` (משותפת, מיוצאת גם מ-`morning-summary.ts`).

## מיגרציה
**0008_google_user_cap.sql** — 0006 שמור למיגרציית הסוכנים (זרימה מקבילה) ו-0007 נתפס בזרימת הסליקה של HYP שרצה במקביל (`0007_billing_approvals`, לפי רשימת המשימות המשותפת). לכן 0008, לא 0007 כפי שחושב בהוראות — כדי ששתי המיגרציות לא יתנגשו במספר הגרסה. בדיקות: `supabase/tests/google_user_cap.test.sql` (ספירה, ייחודיות, check, מחיקת משתמש משאירה את השורה, RLS/הרשאות, הגיבוב זהה ל-TypeScript).

## קבצים משותפים ששונו (מינימלי ותוספתי)
- `lib/db/types.ts` — `GoogleScopeGrantRow`, `OpsFlagRow` + 5 מתודות ב-`Db` אחרי `setConnectionStatus`.
- `lib/db/memory.ts`, `lib/db/supabase.ts` — המימושים, באותו מקום (טיפוסים דרך `import("./types")` כדי לא לגעת בבלוק ה-imports).
- `lib/bot/handle-inbound.ts` — פרמטר `gmailConsentLink` לכלי Google + import אחד.
- `lib/bot/process-inbound.ts` — שתי הודעות הקישור בבלוק 6 מקבלות `+ connectHeadsUpSuffix(…)` + import אחד.
- `lib/ai/tools.ts` — לא שונה.
- `lib/env.ts` — `GOOGLE_GMAIL_READ_ENABLED` (אופציונלי, ברירת מחדל מחושבת), `GOOGLE_GMAIL_READ_CAP`, `GOOGLE_SENSITIVE_SCOPES_VERIFIED`, `OPERATOR_EMAIL`.
- (תיקוני סקירה) `app/api/jobs/run/route.ts` — שורה אחת: בדיקת התראות התקרה אחרי כל job (לכל היותר פעם בשעה). `lib/db/memory.ts` — `deleteUser` מנקה את `user_id` בפנקס.

## בדיקות
- `lib/google/gmail.test.ts` — כל קריאת Gmail מול fetch מדומה (fixture): פרמטרים, מיפוי, HTML, windows-1255/RFC 2047, גוף דרך attachments, threads, היוריסטיקה, שגיאות (403 scope, 401 רענון, 404).
- `lib/google/user-cap.test.ts` — 79/80/95/96 משתמשים, התראה אחת לכל סף, קפיצה על כמה ספים, משתמש שניתק/נמחק נשאר בספירה, מה נספר לפני/אחרי אימות הרגישים, מייל למפעיל, שורת ההסבר בשיחה ובהרשמה בוואטסאפ.
- `lib/google/gmail-tools.test.ts` — הכלים, עטיפת `<data>` מול ניסיון ההזרקה, דרך העוזר (MockProvider), `gmail_read_status` (כבוי / קישור / תקרה מלאה / חשבון שכבר נספר).
- `app/api/auth/google/google-routes.test.ts` — הסכמה מצטברת, הרשמה באתר עם `gmail.readonly` + הסרת סימון, תקרה מלאה (חיבור בלי Gmail, 403 בעברית, חשבון ותיק מותר), הסכמה מצטברת חלקית.
- `lib/jobs/morning-summary.test.ts` — Gmail בסיכום, מעבר לתקרה בלי Gmail, מיזוג עם Microsoft וכשל Gmail.
- `lib/ai/untrusted.test.ts`.

## תיקונים אחרי סקירה (22.10.2026)

- **חוסם — ה-callback סמך על ה-scopes ש-Google החזירה.** הקישור ל-Google עובר דרך הדפדפן, ואפשר להוסיף בו `gmail.readonly` ל-`scope=`. התקרה והמתג נבדקו רק כשבונים את הקישור, ולכן משתמש יכול היה לקבל קריאת Gmail כשהתקרה מלאה או כשהיכולת כבויה. עכשיו `keepGrantedGmailRead` (`lib/google/user-cap.ts`) מחליט ב-callback: `gmail.readonly` נשמר בחיבור רק כשהיכולת פעילה, ו(החשבון כבר נספר לפני האישור, או שהבקשה כללה אותו). אחרת הוא מוסר מה-scopes של החיבור (audit `google.gmail_read_not_kept`). הפנקס רושם את מה ש-Google אישרה בפועל, כי היא כבר ספרה את זה.
- **`GOOGLE_GMAIL_READ_ENABLED=false` הוא עכשיו מתג כיבוי אמיתי:** כלי `gmail_*` (`lib/google/tools.ts`) וקורא ה-Gmail של סיכום הבוקר (`lib/jobs/index.ts`) בודקים גם את המתג (`gmailReadActive` — ערך לא תקין = כבוי, בלי להפיל את השיחה). §6.3 ו-§6.4 במדריך, `.env.example` ו-`lib/env.ts` אומרים את אותו הדבר.
- **`login_hint` = החשבון שעליו הוחלט** (`googleAccountOf`, גם של חיבור מנותק), וההחלטה (`gmail_read`) נשמרת עם ה-state. אם ההחלטה הייתה "כבר נספר" והמשתמש בחר במסך של Google חשבון חדש בזמן שהתקרה מלאה — ההרשאה לא נשמרת, והמשתמש מקבל שורה אחת (`g.err.gmail_read_cap_reached`).
- **רישום מוקדם בפנקס:** מיד אחרי שהחשבון ידוע, לפני שמירת החיבור. אישור שחזר בלי שנרשם (state שפג או לא מוכר, החלפת קוד שנכשלה, אין מייל) — שורת לוג `[google:user-cap] consent returned but not recorded`, ובחלק מהמקרים audit (`error:state_expired`).
- **התראות 80/95 גם בלי חיבור חדש:** `maybeCheckGoogleUserCapAlerts` רץ מ-`/api/jobs/run` (לכל היותר פעם בשעה לכל מופע), כך שמילוי ראשוני שחוצה סף מתריע מיד.
- **מיגרציה 0008:** המילוי הראשוני עבר לפונקציה `google_scope_grants_backfill()` (אידמפוטנטית, `btrim`+`lower` כמו בקוד). הבדיקה ב-SQL מריצה אותה על חיבורים אמיתיים (חיבור מנותק, אותה כתובת באותיות שונות, חיבור Microsoft שלא נספר).
- **הזרקה דרך כותרות:** `headerText` ב-`lib/google/gmail.ts` הופך נושא/שם/כתובת/שם קובץ לשורה אחת (גם `=0A` מקודד). בסיכום הבוקר שולח ונושא עוברים `oneLineUntrusted` וקיצור, ולכן מייל לא יכול להוסיף לסיכום "סעיף תזכורות" מזויף. נוסף fixture עם הזרקה בנושא ובשם השולח.
- **גוף ריק:** חלק גוף שגדול מ-512KB מסומן `bodyTruncated`, ו-`gmail_get_email` משתמש בתצוגה המקדימה (`body_is_preview`) כשאין טקסט.
- **שורת "אפליקציה לא מאומתת"** גם בקישור החידוש שנשלח כשפעולה שאושרה נכשלה (`err.connection_expired`, `g.err.missing_scope` ב-`googleExecutors`). נוספו בדיקות: חידוש בשיחה (`reconnectProviderFor`), הודעת "חלקי" מול פרויקט Google אמיתי, ומסד בלי טבלת הפנקס (סדר פריסה).
- **פרטיות:** מדיניות הפרטיות §5 תוקנה: הגיבוב פסבדונימי (sha256 בלי מלח). הרשומה מקושרת לחשבון עד מחיקתו, והניתוק עצמו לא מסיר את הקישור. השאלה על HMAC עם מפתח נוספה לשאלות לעו"ד (מסמך הגילוי §5, סעיף 5). `MemoryDb.deleteUser` מנקה את `user_id` כמו `on delete set null`.
- **טקסטים:** `g.err.gmail_read_cap_reached` / `g.web.gmail_read_cap_reached` כבר לא מבטיחים ש"היא תיפתח שוב אחרי בדיקת האבטחה של Google", כי הצעד הבא עוד לא הוחלט.

## מה דניאל עושה ידנית
1. Google Auth Platform → Audience → **Publish app** (מ-Testing ל-In production) — בלי זה ההרשאה פגה כל 7 ימים (`docs/google-setup.md` §3).
2. Data access: שישת ה-scopes הבסיסיים בלבד, **בלי** `gmail.readonly` (§6.4).
3. Supabase: מיגרציה 0008 **לפני** הפריסה.
4. Vercel: `GOOGLE_GMAIL_READ_CAP=95`, `GOOGLE_SENSITIVE_SCOPES_VERIFIED=false`, `OPERATOR_EMAIL=<הכתובת שלך>`; `GOOGLE_GMAIL_READ_ENABLED` ריק.
5. **להגיש אימות ל-calendar.events + gmail.send לפני ~80 משתמשים** (§5), וביום האישור `GOOGLE_SENSITIVE_SCOPES_VERIFIED=true`.
6. לעקוב: Console → Audience → OAuth user cap; ההתראות שלנו ב-80/95.

## פתוח / לשילוב
- **ענף הסוכנים (`worktree-wf_14ee0984-e52-2`, `lib/agents/capabilities.ts`):** היכולת `mail.read` ממפה רק את `search_emails`, `get_email` ו-`gmail_read_status`, ו-`toolsForAgent` עובד כרשימה מותרת. אחרי המיזוג צריך להוסיף ל-`CAPABILITIES['mail.read']` את `gmail_search_emails`, `gmail_get_email`, `gmail_get_thread` ו-`gmail_awaiting_reply`, ולהרחיב את הבדיקה "every tool is classified" כך שתבנה את `googleTools` עם `gmail.readonly` (ועם `gmailReadEnabled: true`). אחרת סוכן עם `mail.read` לא יקבל אף כלי מייל של Gmail.
- **PLAN (מסמך מאושר — לא נגעתי):** סיכון 5 בטבלת הסיכונים ושורה 56 ("שלב 1 בלי קריאת Gmail; CASA בשלב 6") לא משקפים את ההחלטה מ-21.10. ההחלטה נרשמה ב-`docs/PROGRESS.md` ("החלטות שהתקבלו אחרי התוכנית"). את עדכון הנוסח ב-PLAN דניאל מאשר.
- **מסך האתר `/connect/google`** (`components/auth/connect-transition.tsx` — מחוץ לתחום שלי): להציג את `gcopy["g.unverified_heads_up"]()` מתחת ל"מעבירים אותך ל-Google…" כשהמסך הבא יהיה "לא מאומת".
- **Microsoft `get_email`** (`lib/ms/tools.ts`) עדיין לא עוטף את גוף המייל ב-`<data>` — אפשר להשתמש ב-`wrapUntrusted` גם שם; לא נגעתי כדי לא להתנגש בזרימת הסוכנים (forward_email).
- **הדגמה (`DEMO_MODE`)**: חיבור ההדגמה מקבל את ה-scopes הבסיסיים של ה-fixture, בלי `gmail.readonly`, ולכן "מה חדש במייל" בהדגמה יציג קישור שלא מוסיף את ההרשאה. אם רוצים להדגים קריאת Gmail — לתת ל-`demoConnect` את `gmail.readonly` כשמבקשים `feature=gmail_read`.
- **משפטי:** מדיניות הפרטיות §5 קיבלה שורה על שמירת הגיבוב אחרי מחיקה; מסמך הגילוי §3–§5 עודכן (`gmail.readonly`, מסך לא מאומת, Limited Use, שאלות לעו"ד).
- **לא אומת:** האם Google תאשר את ה-scopes הרגישים כשהאפליקציה מבקשת בפועל גם `gmail.readonly` לא מוצהר (מדריך §6.4 — מה עושים אם הבודקים מעירים).
