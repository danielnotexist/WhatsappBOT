# סוכנים — מובנים ומותאמים (מימוש `docs/design/agents.md`)

> נכתב בענף נפרד; את הסעיף הזה יש להעביר ל-`docs/PROGRESS.md` במיזוג.

### 2026-10-21 — סוכנים

**ההחלטה של דניאל (21.10):** 99 ₪ = סוכן אחד משלך · 299 ₪ = עד 3 סוכנים משלך ושלושת המובנים · שלוש תבניות: מזכירה, מתמחה, מנהלת חשבונות. בניסיון — המובנים כמו שהם, בלי סוכנים משלך (נימוק: `docs/design/agents.md` §0.3).

**מה נעשה**
- **מיגרציה `0006_agents.sql`** (0004 עדיין פנוי): עמודת `template`; אילוצים — שם 2–24 תווים בתווים מוגבלים, הנחיות עד 1,500 בלי `<` `>` ובלי תווי bidi, `tools` ⊆ אוצר היכולות, `permissions` רק `recipients` (עד 5) ו-`max_outbound_per_day` (1–30); שורת override אחת לכל תפקיד מובנה. `agent_custom_limit` (0/1/3) וטריגר `enforce_agent_rules` — נועל את שורת המשתמש (`for no key update`), `agent_limit_reached`, override מובנה רק בפרו, `role`/`user_id`/`template` קבועים; רץ גם תחת service_role. ייחוס: `agent_key`/`agent_name` ב-`pending_actions` וב-`audit_log`, `agent_key` ב-`messages`. `pending_action_kind += forward_mail`. RLS: `authenticated` כבר לא כותב ל-`agents` (רק קורא את שלו).
  - נבדק גם ידנית שהמכסה עומדת במקביליות: שתי לשוניות מוסיפות סוכן באותו רגע במסלול בסיסי → השנייה ממתינה לנעילה ונכשלת ב-`agent_limit_reached`.
- **שכבת הנתונים**: `AgentRow/NewAgent/AgentPatch/AgentKey`, `listAgents/getAgent/createAgent/updateAgent/deleteAgent/countAgentActionsSince` — כל מתודה מסננת לפי `user_id` גם כשיש `id`. `SupabaseDb` ממפה את שגיאות הטריגר ל-`AgentLimitError`/`AgentPlanError`/`AgentNameTakenError` (`lib/db/errors.ts`); `MemoryDb` משכפל את הטריגר והאילוצים (`lib/agents/constraints.ts`). `lib/billing/plans.ts`: `customAgents`, `builtinAgents`, `effectivePlan` (התאום של `user_plan`).
- **`lib/agents/`**: `capabilities` (9 יכולות → כלים לפי ספק; `remember_fact` רק לעוזרת הראשית), `templates` (ההנחיות בעברית לשלושת המובנים), `policy` (סינון הנחיות, שמות שמורים, הרשאות strict בכתיבה ונבלעות בזמן ריצה, resolver עם נעילה לפי ותק אחרי הורדת מסלול), `routing` (`@שם`, `סוכן: שם`, פנייה ישירה להקלטות, `@עלזה`/`סיום`; ניקוד, גרשיים, ההתאמה הארוכה קודם), `prompt` (הבלוק `<agent_instructions>` בסוף ה-system ומשפט הגבולות אחריו; בלוק router עם מזהים a1…aN, שמות ויכולות — בלי הנחיות), `guard` (נמענים מותרים ותקרה יומית לפי אזור הזמן של המשתמש), `service` (יצירה/עריכה/השבתה/מחיקה עם audit), `commands` (שלב 5b בצינור).
- **העברת מייל**: כלי `forward_email` (Microsoft 365) → טיוטת `forward_mail` עם [העבר] [ערוך] [בטל]; `GraphClient.forwardMessage` (`POST /me/messages/{id}/forward`, בלי scope חדש) ו-`listAttachments`; executor; מנותב תמיד ל-Microsoft.
- **המודל**: `runAssistant` מקבל סוכן מפורש (מדלג על ה-router), או רשימת סוכנים שה-router יכול לבחור מתוכה, ורמז "סוכן פעיל". בתור של סוכן: הכלים מסוננים גם ברשימה שנשלחת למודל וגם בחיפוש שמריץ אותם; כל טיוטה עוברת `guardAgentAction` ונושאת את מפתח הסוכן ושמו. מצב הסוכנים בפרופיל (`agent_draft`, `active_agent`) לא נשלח למודל.
- **וואטסאפ**: `סוכנים` / `סוכן חדש` (תבנית → שם → הנחיות, גם בהקלטה → יכולות → נמענים → שמירה) / `עריכת סוכן X` / `השבתת סוכן X` / `הפעלת סוכן X` / `מחיקת סוכן X`. כל הניהול בלי מודל ולא נספר בניסיון. שאלה שמחכה לבחירה לא "תוקעת": הודעה שלא קשורה מבטלת את הטיוטה וממשיכה כרגיל. כל תשובה של סוכן נפתחת ב-`*שם:*` (גם טיוטות), והסוכן נשאר "דביק" ל-10 דקות. טקסטים: `lib/copy/bot-agents.ts` + `docs/copy/bot-copy-agents.md`; `bill.plan_limit_reached`/`bill.upgraded` עודכנו.
- **האזור האישי**: סקשן "הסוכנים שלי" (`app/account/_components/agents-section.tsx`) בעיצוב "לילה ירוק" — שורות על הבמה כמו החיבורים, כל סוכן נפתח (`<details>`, בלי JS) לטופס: שם, "מה הסוכן עושה ואיך" עם מונה, יכולות, כתובות מותרות, תקרה יומית, השבתה ומחיקה. סוכן חדש מתחיל מקישור תבנית (`/account?new=<template>#agents`). שורת מכסה לפי מסלול, CTA לשדרוג, והמשפט הקבוע על אישור בכפתור. ההודעה אחרי פעולה מוצגת בתוך הסקשן. `Section/Row/Tile/Chevron` עברו ל-`_components/parts.tsx`.
- **דף התשלום ודף הנחיתה**: בסיסי += "סוכן אחד משלך"; פרו: "שלושת הסוכנים המובנים ועד 3 סוכנים משלך".
- **מסמכים**: PLAN §3 (שורות `agents`, `forward_mail`, ייחוס) ו-§4 (שורות הסוכנים), `style-guide.md` (המילה "סוכן" רק לפיצ'ר הזה).

**בדיקות**: 549 → 623 בדיקות יחידה (74 חדשות, ועוד הרחבות לקבצים קיימים): יכולות (כל כלי מסווג, התאמה למערך במיגרציה), policy, routing, prompt, service (בידוד בין משתמשים, מירוץ על המכסה), orchestrator (סינון כלים, כלי לא מורשה לא רץ, נמען מחוץ לרשימה, תקרה יומית, בחירת router, מזהה מומצא), זרימות בוואטסאפ מקצה לקצה (`lib/bot/agents-flow.test.ts`), Graph forward, טקסטים, האזור האישי. SQL: `supabase/tests/agents.test.sql` + `rls_isolation.test.sql` מעודכן. E2E: `e2e/agents.spec.ts` (ניסיון, בסיסי: יצירה → עריכה → השבתה → מחיקה, 375px בלי גלילה אופקית) + `e2e/account.spec.ts` עובר.

**איך בודקים**
```bash
pnpm test -- lib/agents lib/bot/agents-flow.test.ts lib/ai/orchestrator.test.ts app/account
DB_NAME=wabot_agents_test supabase/tests/run-local.sh
E2E_PORT=3417 pnpm exec playwright test e2e/agents.spec.ts
DATA_MODE=memory pnpm dev   # בוואטסאפ המדומה: "@מזכירה מה יש לי מחר?", "סוכן חדש", "סוכנים"
```

**דרוש מדניאל**
1. **להריץ את מיגרציה 0006 ב-Supabase לפני הפריסה** — הקוד קורא את העמודות החדשות (`agent_key`, `agent_name`) בטבלאות `messages` ו-`pending_actions`. גם בסביבת ההדגמה עם Supabase.
2. **לאישור** (`docs/design/agents.md` §14): (א) דביקות של 10 דקות; (ב) בחירה אוטומטית של סוכן ע״י ה-router (אפשר לכבות ולהשאיר רק פנייה מפורשת); (ג) במסלול הבסיסי הסוכן האחד יכול להתחיל מתבנית מובנית — מומש כך.
3. **ידני מהטלפון (אחרי שוואטסאפ חי)**: `@מזכירה מה יש לי מחר?` · יצירת סוכן בהקלטה · העברת חשבונית לכתובת בדיקה עם אישור · "שלחי בלי לשאול" בהנחיות → עדיין כפתורים.

**מחוץ לסבב**: חיפוש ברשת ל"מתמחה" (בתשלום), API לתוכנות הנהלת חשבונות, העברה מ-Gmail (אחרי CASA), שמירה ב-OneDrive, אוטומציות מתוזמנות לסוכן, זיכרון נפרד לכל סוכן, המשך העריכה של כפתור "ערוך" בטיוטה (פער קיים).
