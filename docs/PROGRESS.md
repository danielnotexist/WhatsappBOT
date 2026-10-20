# יומן התקדמות

> מתעדכן בכל commit. מה נעשה · איך בודקים · מה דניאל צריך לעשות ידנית.
> הכללים לסוכנים: `AGENTS.md`. התוכנית: `docs/PLAN.md`.

## החלטות שהתקבלו אחרי התוכנית

- מחירים: **99 ₪ (עד 750 הודעות/חודש)** · **299 ₪ (fair use)**.
- בונים במקביל לבדיקה המשפטית של Meta §4.7 (`docs/legal/meta-ai-clause-memo.md`).
- שם המוצר עוד לא נבחר — בכל הטקסטים משתמשים ב-`{{שם}}` (מועמדים: `docs/naming.md`).
- כיוון עיצוב עוד לא נבחר — דניאל בוחר אחד משלושה ב-`design/directions/`.
- טון: מקצועי וחם, בלי בדיחות. פנייה ניטרלית (בלי "שלח/י").

## דרוש מדניאל

| # | מה | איפה | למה |
|---|---|---|---|
| 1 | לבחור שם מוצר | `docs/naming.md` | מחליף את `{{שם}}` בכל הטקסטים והתבניות |
| 2 | לבחור כיוון עיצוב (01 / 02 / 03) | `design/directions/README.md` | לפני בניית הדפים האמיתיים (אבן דרך 1) |
| 3 | מפתחות API ל-`scripts/hebrew-eval/.env` (`ANTHROPIC_API_KEY` חובה; `GOOGLE_API_KEY`/`OPENAI_API_KEY` אופציונלי) | `scripts/hebrew-eval/README.md` | להריץ את בדיקת העברית האמיתית (אבן דרך 0) ולבחור מודל |
| 4 | כל משתני הסביבה של האתר | `.env.example` | האתר עולה בלי, אבל כל אינטגרציה אמיתית דורשת |
| 5 | פורטלים (Meta, Entra, Google Cloud, HYP, Supabase, Vercel, Upstash, Resend) | `README.md` → "מה דניאל צריך לעשות ידנית" | לפי PLAN §9 |

## יומן

### 2026-10-20 — שלב א' 1: תשתית Next.js מאומתת

**מה נעשה**
- `pnpm lint && pnpm typecheck && pnpm test && pnpm build` עוברים (Next 16.4, React 19, Tailwind 4, Vitest 5).
- תוקן טסט לא יציב ב-`lib/crypto.test.ts` (טקסט של תו אחד יכול להופיע באקראי ב-base64).
- אומת: `app/layout.tsx` עם `lang="he" dir="rtl"`, פונטים עבריים דרך `next/font` (`lib/fonts.ts`: Frank Ruhl Libre + Assistant, subsets hebrew+latin, self-host).
- `proxy.ts` (התחליף של middleware ב-Next 16) מוסיף כותרות אבטחה; `proxy.test.ts` מוודא כל כותרת, CSP במצב report-only ו-matcher שמדלג על נכסים סטטיים. ב-build מופיע `ƒ Proxy (Middleware)`.
- `README.md` (עברית) עודכן; `AGENTS.md` קוצר לכללי העבודה בריפו.

**איך בודקים**
```bash
pnpm install && pnpm lint && pnpm typecheck && pnpm test && pnpm build
curl -sI http://localhost:3000/ | grep -i -E "content-security|x-frame"   # אחרי pnpm dev
```
