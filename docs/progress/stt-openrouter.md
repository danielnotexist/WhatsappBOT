# תמלול הודעות קוליות דרך OpenRouter

> נכתב בענף נפרד; את הסעיף הזה יש להעביר ל-`docs/PROGRESS.md` במיזוג.

### 2026-10-21 — תמלול דרך OpenRouter (במקום Soniox כברירת מחדל)

**למה**
- דניאל כבר מחזיק מפתח OpenRouter, ובלעדיו אין צורך בחשבון נוסף. Soniox דרש מפתח וחשבון נפרדים.
- **מהירות**: ב-OpenRouter זו קריאה סינכרונית אחת (שולחים את השמע ומקבלים את הטקסט באותה קריאה). Soniox עבד בשלבים: העלאה, יצירת תמלול, polling כל 0.7 שנ׳, קריאת התוצאה ושתי מחיקות.
- **למה לא Sonnet/Haiku/GPT רגיל**: התמלול ב-OpenRouter עובר ב-endpoint נפרד (`/audio/transcriptions`) שמקבל רק מודלי תמלול ייעודיים (`output_modalities=transcription`). ברשימה שנבדקה ב-21.10.2026 (28 מודלים) אין מודלים של Anthropic. מודלי השיחה ממשיכים לעבוד על הטקסט שמתקבל מהתמלול, כמו קודם.

**מה נעשה**
- **`lib/stt/openrouter.ts`** (חדש) — `OpenRouterStt`: ‏`POST https://openrouter.ai/api/v1/audio/transcriptions` עם `Authorization: Bearer OPENROUTER_API_KEY`, וגוף JSON:
  `{ model, input_audio: { data: <base64 גולמי, לא data: URI>, format: "ogg" }, language: "he" }`.
  התשובה: `{ text, usage: { seconds?, cost?, …tokens } }`. ‏`usage.seconds` ממלא את `durationMs`, ו-`usage.cost` (בדולרים) נשמר ב-`costUsd`, שדה אופציונלי חדש ב-`Transcript`.
  - **שגיאות**: ‏`{ error: { code, message } }`. ‏402 (נגמר הקרדיט), 400 ו-413 הן שגיאות סופיות. ‏408, 429 ו-5xx (כולל 524 ו-529) מסומנות כניתנות לניסיון חוזר (retryable). גם שגיאה בתוך תשובת 200 ותשובה בלי `text` נחשבות כשל.
  - **Timeout** של 45 שנ׳ לכל מודל (`AbortSignal.timeout`). אצל הספקים עצמם יש מגבלה של כ-60 שנ׳. כך נשאר זמן לגיבוי בתוך `maxDuration=300` של ה-worker.
  - כותרת `X-Title: Alze` (מ-`lib/brand.ts`), כדי שהשימוש יופיע בלוח הבקרה של OpenRouter.
- **מודלים** (ניתנים לשינוי ב-env):
  - **ראשי `deepgram/nova-3`**: בעברית שולחים `language: "he"`, כי בלי זה Deepgram מניח אנגלית.
  - **גיבוי `openai/gpt-transcribe`**: נכנס לפעולה כשהראשי נכשל או מחזיר תמלול ריק (`FallbackStt` הקיים).
- **פורמט**: הודעה קולית בוואטסאפ היא Ogg/Opus, ונשלחת כמו שהיא עם `format: "ogg"`, שמופיע ברשימת הפורמטים של OpenRouter (wav, mp3, flac, m4a, ogg, webm, aac). אין המרת פורמט, כי ב-Vercel אין ffmpeg. Deepgram ו-OpenAI מפענחים Ogg/Opus בעצמם. סוגי קבצים אחרים מוואטסאפ ממופים לפי המיכל (container): ‏mp4→m4a, ‏aac, ‏mpeg→mp3, ‏amr (מועבר כמו שהוא; לא ברשימה הרשמית).
- **`lib/stt/env.ts`** — בחירת הספק:
  - `STT_PROVIDER` מקבל עכשיו `openrouter | soniox | openai | mock`.
  - **בלי `STT_PROVIDER`**: ב-memory/הדגמה → mock. כשיש `OPENROUTER_API_KEY` → openrouter. כשיש רק `SONIOX_API_KEY` → soniox (התקנה ישנה ממשיכה לעבוד). כשאין אף מפתח → EnvError בעברית עם השם `OPENROUTER_API_KEY`.
  - **משתנים חדשים**: `STT_MODEL` ו-`STT_FALLBACK_MODEL` (מזהה בצורה ספק/מודל; `none` מכבה את הגיבוי). ערך לא תקין → EnvError עם שם המשתנה.
  - **Soniox ו-OpenAI הישיר** נשארו כאפשרויות.
- **`lib/env.ts`** — `SONIOX_API_KEY` הוסר מהסכמה המלאה של האפליקציה (עבר ל-`lib/stt/env.ts` כמשתנה אופציונלי). `OPENROUTER_API_KEY` כבר היה שם, ועכשיו הוא משמש גם לתמלול.
- **`lib/stt/ogg.ts`** (חדש) — מחשב את אורך קובץ Ogg/Opus מהכותרות, בלי פענוח: מיקום ה-granule בעמוד האחרון, פחות ה-pre-skip, חלקי 48kHz (RFC 7845).
  - `lib/bot/voice.ts` משתמש בו כשהמודל לא מחזיר משך. כך "הבנתי כך: …" (`proc.transcript_echo`) עדיין נשלח על הקלטות של יותר מ-20 שנ׳ גם בלי `usage.seconds`.
  - דרך OpenRouter אין ביטחון (confidence) לכל מילה, כי `verbose_json` נדחה ב-400 אצל מודלים בלי חותמות זמן.
- **בדיקות** (‏549 → 559, עם fetch מדומה ובלי שום קריאת רשת):
  - בקשה ותשובה: base64 גולמי, `format: "ogg"`, עברית, `seconds`/`cost`.
  - מודל מוגדר ומיפוי פורמטים.
  - סיווג שגיאות (402/400/413 סופיות; 429/5xx/524/529 retryable; שגיאה בתשובת 200; תשובה בלי טקסט).
  - שגיאת רשת ו-timeout.
  - גיבוי nova-3 → gpt-transcribe דרך ה-env, גם על כשל וגם על תמלול ריק.
  - כל הצירופים של ה-env.
  - אורך Ogg/Opus, כולל "הבנתי כך" בהקלטה של 25 שנ׳ בלי משך מהמודל.
  - הדגמה עם `STT_PROVIDER=openrouter` ומפתח אמיתי עדיין מחזירה mock.

**ממצאים**
- **מקור התיעוד** (נבדק ב-21.10.2026): ‏`openrouter.ai/docs/api/api-reference/stt/create-transcription` ו-`openrouter.ai/docs/guides/overview/multimodal/stt`. רשימת המודלים נלקחה מ-`GET /api/v1/models?output_modalities=transcription`, שהוא ציבורי וחינמי.
- **פרמטרים**:
  - `language` הוא ISO-639-1, ובלעדיו השפה מזוהה אוטומטית.
  - קיים גם `keyterms`, אבל אנחנו לא שולחים אותו: פרמטר שהספק לא תומך בו מכשיל את הבקשה. לכן רמזי `context` לא נשלחים ל-OpenRouter.
- **מגבלות**: ‏base64 מעל 25MB מתקבל רק במודלים של OpenAI/Groq. הודעה קולית בוואטסאפ (Opus בכ-16–24kbps) רחוקה מזה מאוד.
- **דיוק בעברית** — WER על הקלטות וואטסאפ, `ivrit-ai/eval-whatsapp`, מתוך `benchmark.csv` של ה-leaderboard של ivrit.ai:

| מודל | WER |
|---|---|
| Soniox | 9.0% |
| **deepgram/nova-3** | **12.0%** |
| openai/gpt-4o-transcribe | 12.6% |
| whisper-large-v3 | 13.2% |
| gpt-4o-mini-transcribe | 15.8% |
| ElevenLabs scribe v1 | 26.4% |

  - ‏Nova-3 הוא המדויק ביותר מבין המודלים שזמינים ב-OpenRouter.
  - ‏`openai/gpt-transcribe` (הגיבוי) עוד לא נמדד שם. אם רוצים גיבוי שכבר נמדד: `STT_FALLBACK_MODEL=openai/gpt-4o-transcribe`.
  - Nova-3 נמדד ב-05.2026, לפני שב-09.2026 Deepgram שחררו מודל עברית משופר.
- **עלות** — לפי מחירון OpenRouter, לשנייה:
  - deepgram/nova-3: ‏0.0000717$ ≈ ‏0.0043$ לדקה.
  - openai/gpt-transcribe: ‏0.000075$ ≈ ‏0.0045$ לדקה.
  - לשם השוואה, Soniox עלה 0.0017$ לדקה.
  - דוגמה: 1,000 הקלטות של 30 שנ׳ ≈ ‏2.15$.
  - קריאה שנכשלה לא מחויבת.

**איך בודקים**
```bash
pnpm test -- lib/stt lib/bot/voice.test.ts lib/env.test.ts lib/demo-factories.test.ts
DATA_MODE=memory pnpm dev   # התמלול מדומה (MockStt), בלי קריאות בתשלום
```

**דרוש מדניאל**
1. **ב-Vercel**: ‏`OPENROUTER_API_KEY` (אותו מפתח שמשמש לתמונות) וקרדיט ב-OpenRouter. את `SONIOX_API_KEY` כבר לא צריך. רצוי לא להגדיר `STT_PROVIDER` בכלל.
2. **בדיקה בטלפון**: הקלטה בעברית של 5–10 שנ׳ ועוד אחת של יותר מ-20 שנ׳, כדי לראות "הבנתי כך: …". זה מאמת בפועל ש-Deepgram מקבל את ה-Ogg/Opus של וואטסאפ דרך OpenRouter. אם לא — `STT_MODEL=openai/gpt-4o-transcribe`.
3. **עו"ד / מדיניות פרטיות**: ספק התמלול השתנה. השמע עובר עכשיו ל-OpenRouter (ארה"ב) ומשם ל-Deepgram (ובגיבוי ל-OpenAI). צריך לעדכן את טבלת קבלני המשנה ב-`docs/legal/privacy-policy-he.md` ואת רשימת ה-DPA ב-`docs/legal/dpa-checklist-he.md` (שם עדיין כתוב Soniox). את המסמכים המשפטיים לא שיניתי.
   - ב-OpenRouter יש גם `provider.zdr` (Zero Data Retention), אבל הוא מגביל את הניתוב לספקים עם ZDR ועלול להכשיל את Deepgram, ולכן לא הופעל.

**משתני סביבה**
- **חדשים** (אופציונליים): `STT_MODEL` (ברירת מחדל `deepgram/nova-3`), `STT_FALLBACK_MODEL` (ברירת מחדל `openai/gpt-transcribe`, או `none`).
- **`STT_PROVIDER`**: נוסף הערך `openrouter`, שהוא גם ברירת המחדל.
- **`SONIOX_API_KEY`**: עכשיו אופציונלי.

**קבצים שנערכו**
- **חדשים**: `lib/stt/openrouter.ts`, `lib/stt/ogg.ts`, `lib/stt/test-fixtures.ts`.
- **קיימים**: `lib/stt/env.ts`, `lib/stt/types.ts`, `lib/stt/fallback.ts`, `lib/stt/stt.test.ts`, `lib/bot/voice.ts`, `lib/bot/voice.test.ts`, `lib/env.ts`, `lib/env.test.ts`, `lib/demo-factories.test.ts`, `.env.example`, `README.md`, `docs/deploy.md`, `docs/copy/bot-copy.md` (שורת ה"מתי" של `err.transcription_failed`).
- **לא נגעתי**: ב-`supabase/` (ההערה על `messages.transcript` עדיין מזכירה את Soniox) וב-`docs/PLAN.md`.
