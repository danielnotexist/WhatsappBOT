# תמלול הודעות קוליות דרך OpenRouter

> נכתב בענף נפרד; את הסעיף הזה יש להעביר ל-`docs/PROGRESS.md` במיזוג.

### 2026-10-21 — תמלול דרך OpenRouter (במקום Soniox כברירת מחדל)

**למה**
- דניאל כבר מחזיק מפתח OpenRouter, ובלעדיו אין צורך בחשבון נוסף. Soniox דרש מפתח וחשבון נפרדים.
- **מהירות**: ב-OpenRouter זו קריאה סינכרונית אחת (שולחים את השמע ומקבלים את הטקסט באותה קריאה). Soniox עבד בשלבים: העלאה, יצירת תמלול, polling כל 0.7 שנ׳, קריאת התוצאה ושתי מחיקות.
- **למה לא Sonnet/Haiku/GPT רגיל**: התמלול ב-OpenRouter עובר ב-endpoint נפרד (`/audio/transcriptions`) שמקבל רק מודלי תמלול ייעודיים (`output_modalities=transcription`). ברשימה שנבדקה ב-21.10.2026 (28 מודלים) אין מודלים של Anthropic. מודלי השיחה ממשיכים לעבוד על הטקסט שמתקבל מהתמלול, כמו קודם.

**מה נעשה**
- **`lib/stt/openrouter.ts`** (חדש) — `OpenRouterStt`: ‏`POST https://openrouter.ai/api/v1/audio/transcriptions` עם `Authorization: Bearer OPENROUTER_API_KEY`, וגוף JSON:
  `{ model, input_audio: { data: <base64 גולמי, לא data: URI>, format: "ogg" }, language: "he", provider: { data_collection: "deny" } }`.
  התשובה: `{ text, usage: { seconds?, cost?, …tokens } }`. ‏`usage.seconds` ממלא את `durationMs`, ו-`usage.cost` (בדולרים) נשמר ב-`costUsd`, שדה אופציונלי חדש ב-`Transcript`.
  - **שגיאות**: ‏`{ error: { code, message } }`. ‏402 (נגמר הקרדיט), 400 ו-413 הן שגיאות סופיות. ‏408, 429 ו-5xx (כולל 524 ו-529) מסומנות כניתנות לניסיון חוזר (retryable). גם שגיאה בתוך תשובת 200 ותשובה בלי `text` נחשבות כשל.
  - **Timeout** של 45 שנ׳ לכל מודל (`AbortSignal.timeout`). אצל הספקים עצמם יש מגבלה של כ-60 שנ׳. כך נשאר זמן לגיבוי בתוך `maxDuration=300` של ה-worker. גם קריאת גוף התשובה נמצאת בתוך אותה הגנה: timeout או ניתוק באמצע הגוף הופכים ל-`SttError` עם שם המודל, retryable.
  - **מדיניות נתונים**: כל בקשה שולחת `provider: { data_collection: "deny" }`. ברירת המחדל של OpenRouter היא `allow` (ספקים שעשויים לשמור את השמע ולאמן עליו). עם `deny` הבקשה מנותבת רק לספקים שלא אוספים את המידע, ואם אין כזה היא נכשלת (ולא עוברת לספק שאוסף). `deepgram/nova-3` מופיע ברשימת ה-ZDR הציבורית של OpenRouter (`GET /api/v1/endpoints/zdr`, נבדק 22.10.2026), כך שהוא מנותב גם עם `deny`. ‏`zdr: true` לא נשלח, כי נקודת הקצה של OpenAI (הגיבוי) לא ברשימה הזו.
  - כותרת `X-Title: Alze` (מ-`lib/brand.ts`), כדי שהשימוש יופיע בלוח הבקרה של OpenRouter.
- **מודלים** (ניתנים לשינוי ב-env):
  - **ראשי `deepgram/nova-3`**: בעברית שולחים `language: "he"`, כי בלי זה Deepgram מניח אנגלית.
  - **גיבוי `openai/gpt-transcribe`**: נכנס לפעולה כשהראשי נכשל או מחזיר תמלול ריק (`FallbackStt` הקיים).
- **פורמט**: הודעה קולית בוואטסאפ היא Ogg/Opus, ונשלחת כמו שהיא עם `format: "ogg"`, שמופיע ברשימת הפורמטים של OpenRouter (wav, mp3, flac, m4a, ogg, webm, aac). אין המרת פורמט, כי ב-Vercel אין ffmpeg. Deepgram ו-OpenAI מפענחים Ogg/Opus בעצמם. סוגי קבצים אחרים מוואטסאפ ממופים לפי המיכל (container): ‏mp4→m4a, ‏aac, ‏mpeg→mp3, ‏amr (מועבר כמו שהוא; לא ברשימה הרשמית).
- **`lib/stt/env.ts`** — בחירת הספק:
  - `STT_PROVIDER` מקבל עכשיו `openrouter | soniox | openai | mock`.
  - **בלי `STT_PROVIDER`**: ב-memory/הדגמה → mock. כשיש `OPENROUTER_API_KEY` → openrouter. כשיש רק `SONIOX_API_KEY` → soniox (התקנה ישנה ממשיכה לעבוד). כשאין אף מפתח → EnvError בעברית עם השם `OPENROUTER_API_KEY`.
  - **`STT_PROVIDER` מפורש גובר על memory**: ב-`DATA_MODE=memory` רק ברירת המחדל היא mock. מי שמגדיר `STT_PROVIDER=openrouter` עם מפתח אמיתי מתמלל באמת ומחויב, גם ב-memory (נבדק בטסט; `.env.example` מנוסח כך). רק `DEMO_MODE=1` הוא תמיד mock.
  - **משתנים חדשים**: `STT_MODEL` ו-`STT_FALLBACK_MODEL` (מזהה בצורה ספק/מודל; `none` מכבה את הגיבוי). ערך לא תקין → EnvError עם שם המשתנה.
  - **Soniox ו-OpenAI הישיר** נשארו כאפשרויות.
- **`lib/env.ts`** — `SONIOX_API_KEY` הוסר מהסכמה המלאה של האפליקציה (עבר ל-`lib/stt/env.ts` כמשתנה אופציונלי). `OPENROUTER_API_KEY` כבר היה שם, ועכשיו הוא משמש גם לתמלול.
- **`lib/stt/ogg.ts`** (חדש) — מחשב את אורך קובץ Ogg/Opus מהכותרות, בלי פענוח: מיקום ה-granule בעמוד האחרון, פחות ה-pre-skip, חלקי 48kHz (RFC 7845).
  - `lib/bot/voice.ts` משתמש בו כשהמודל לא מחזיר משך. כך "הבנתי כך: …" (`proc.transcript_echo`) עדיין נשלח על הקלטות של יותר מ-20 שנ׳ גם בלי `usage.seconds`.
  - דרך OpenRouter אין ביטחון (confidence) לכל מילה, כי `verbose_json` נדחה ב-400 אצל מודלים בלי חותמות זמן. **ההשלכה**: הענף "ביטחון נמוך → הבנתי כך" לא מופעל דרך OpenRouter, כך שהקלטה קצרה (עד 20 שנ׳) ולא ברורה מבוצעת בלי "הבנתי כך". שורת ה"מתי" של `proc.transcript_echo` ב-`docs/copy/bot-copy.md` עודכנה, והטסט ב-`lib/bot/voice.test.ts` מראה שהקלטה של 6 שנ׳ בלי ביטחון לא מקבלת הד.
- **עלות לכל הודעה** — `usage.cost` נשמר עכשיו בשורת ההודעה הקולית הנכנסת: `messages.cost_usd`, ומסלול התמלול ב-`model_used` (למשל `openrouter:deepgram/nova-3`), דרך `setMessageTranscript`. ‏`FallbackStt` מחבר את העלות של כל קריאה שענתה, כי גם תמלול ריק מחויב (הקלטה שקטה עוברת לשני המודלים ומחויבת פעמיים).
- **בדיקות** (‏549 → 562, עם fetch מדומה ובלי שום קריאת רשת):
  - בקשה ותשובה: base64 גולמי, `format: "ogg"`, עברית, `seconds`/`cost`.
  - מודל מוגדר ומיפוי פורמטים.
  - גוף הבקשה כולל `provider: { data_collection: "deny" }`.
  - סיווג שגיאות (401/402/400/413 סופיות; 408/429/5xx/524/529 retryable; שגיאה בתשובת 200; תשובה בלי טקסט).
  - שגיאת רשת ו-timeout, גם כשהם קורים באמצע קריאת הגוף.
  - העלות מצטברת ב-`FallbackStt` (גם על תמלול ריק) ונשמרת בשורת ההודעה הנכנסת.
  - `STT_PROVIDER` מפורש ב-`DATA_MODE=memory` הוא הספק האמיתי.
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

  - ‏Nova-3 הוא המדויק ביותר מבין המודלים ב-OpenRouter שנמדדו ב-ivrit.ai. ב-OpenRouter יש 28 מודלי תמלול, ורבים מהם לא נמדדו שם (למשל elevenlabs/scribe-v2, google/gemini-3.5-transcribe, assemblyai/universal-3-6-pro, mistralai/voxtral-*-transcribe-3-0).
  - ‏`openai/gpt-transcribe` (הגיבוי) עוד לא נמדד שם. אם רוצים גיבוי שכבר נמדד: `STT_FALLBACK_MODEL=openai/gpt-4o-transcribe`.
  - Nova-3 נמדד ב-05.2026, לפני שב-09.2026 Deepgram שחררו מודל עברית משופר.
- **עלות** — לפי מחירון OpenRouter, לשנייה:
  - deepgram/nova-3: ‏0.0000717$ ≈ ‏0.0043$ לדקה.
  - openai/gpt-transcribe: ‏0.000075$ ≈ ‏0.0045$ לדקה.
  - לשם השוואה, Soniox עלה 0.0017$ לדקה.
  - דוגמה: 1,000 הקלטות של 30 שנ׳ ≈ ‏2.15$.
  - חלופה זולה שנמדדה: `openai/whisper-large-v3` (WER 13.2% בטבלה) ב-0.0000075$ לשנייה ≈ ‏0.00045$ לדקה, בערך פי 10 פחות מ-nova-3. היא גם ברשימת ה-ZDR של OpenRouter (Groq, DeepInfra, Together), כך שאפשר להשתמש בה כגיבוי ששום ספק לא שומר: `STT_FALLBACK_MODEL=openai/whisper-large-v3`.
  - קריאה שנכשלה לא מחויבת.

**איך בודקים**
```bash
pnpm test -- lib/stt lib/bot/voice.test.ts lib/env.test.ts lib/demo-factories.test.ts
DATA_MODE=memory pnpm dev   # כל עוד STT_PROVIDER לא מוגדר: התמלול מדומה (MockStt), בלי קריאות בתשלום
```

**דרוש מדניאל**
1. **ב-Vercel**: ‏`OPENROUTER_API_KEY` (אותו מפתח שמשמש לתמונות) וקרדיט ב-OpenRouter. את `SONIOX_API_KEY` כבר לא צריך. רצוי לא להגדיר `STT_PROVIDER` בכלל.
2. **בדיקה בטלפון**: הקלטה בעברית של 5–10 שנ׳ ועוד אחת של יותר מ-20 שנ׳, כדי לראות "הבנתי כך: …". זה מאמת בפועל ש-Deepgram מקבל את ה-Ogg/Opus של וואטסאפ דרך OpenRouter. אם לא — `STT_MODEL=openai/gpt-4o-transcribe`.
3. **עו"ד / מדיניות פרטיות** — **תנאי למעבר למצב האמיתי**: ספק התמלול השתנה, והשמע עובר עכשיו ל-OpenRouter (ארה"ב) ומשם ל-Deepgram (ובגיבוי ל-OpenAI). הטיוטות עודכנו בענף הזה כדי שהדף `/privacy` לא יסתור את הקוד:
   - `docs/legal/privacy-policy-he.md` (גרסה 0.2): בסעיף 6 שורת OpenRouter (שאמרה "יצירת איורים בלבד, **אין** נתוני לקוחות") היא עכשיו "תמלול הודעות קוליות — קובץ השמע בלבד" + איורים. נוספו שורות ל-Deepgram ול-OpenAI (דרך OpenRouter). ‏Soniox מסומן כספק חלופי שפעיל רק אם הופעל. בסעיף 4 נוסף משפט על התמלול, ובפריטים שלא אומתו נוסף סעיף 8.
   - `docs/legal/dpa-checklist-he.md` שורה 12: ‏OpenRouter, ‏Deepgram ו-OpenAI במקום Soniox.
   - **דרוש אישור עו"ד** לספקי המשנה החדשים ולבסיס ההעברה לארה"ב לפני שמפעילים מצב אמיתי. עד אז — להשאיר `DEMO_MODE=1` (תמיד mock).
4. **בדיקת הגיבוי עם `data_collection: "deny"`**: ‏nova-3 נבדק (רשימת ה-ZDR). את `openai/gpt-transcribe` אי אפשר לבדוק בלי קריאה בתשלום. "deny" מסנן ספקים שעשויים לאחסן את המידע ולאמן עליו, ו-OpenAI לא מאמנת על נתוני API, אז הוא אמור לעבור — לא אומת. בדיקה בטלפון: פעם אחת עם `STT_MODEL=openai/gpt-transcribe` ו-`STT_FALLBACK_MODEL=none`. אם מתקבלת שגיאה בנוסח "No endpoints found matching your data policy" — להחליף את הגיבוי ל-`openai/whisper-large-v3` (ZDR).
5. **עלות לפני חסימות החיוב (פתוח, לא שונה כאן)**: התמלול (שלב 1b ב-`lib/bot/process-inbound.ts`) רץ לפני בדיקות `past_due` ומכסת הניסיון/החבילה (שלב 5), כך שגם משתמש שהשירות חסום לו מקבל תמלול על חשבוננו. הסדר הזה קדם לענף, אבל עכשיו התמלול יקר יותר (בערך פי 2.5 מ-Soniox, ועוד קריאה שנייה על תמלול ריק). אין גם מגבלת אורך להקלטה (רק 20MB, יותר משעה של Opus — כ-0.3–0.6$ להודעה). העברת הבדיקות לפני התמלול משנה התנהגות ("כניסה" ותשובות onboarding בהקלטה, `pending_input` של `past_due`), ולכן נשארה להחלטה: (א) לבדוק `past_due`/מכסה לפני התמלול; (ב) לחסום הקלטות ארוכות מכמה דקות לפי `oggOpusDurationMs`, עם הודעה חדשה; (ג) מפתח OpenRouter נפרד לתמלול עם תקרת קרדיט, כדי ש-402 לא יפיל גם את יצירת התמונות. העלות לכל הודעה נשמרת עכשיו ב-`messages.cost_usd`, כך שאפשר לעקוב.

**משתני סביבה**
- **חדשים** (אופציונליים): `STT_MODEL` (ברירת מחדל `deepgram/nova-3`), `STT_FALLBACK_MODEL` (ברירת מחדל `openai/gpt-transcribe`, או `none`).
- **`STT_PROVIDER` ב-`DATA_MODE=memory`**: ערך מפורש גובר על ה-mock (ראו למעלה).
- **`STT_PROVIDER`**: נוסף הערך `openrouter`, שהוא גם ברירת המחדל.
- **`SONIOX_API_KEY`**: עכשיו אופציונלי.

**קבצים שנערכו**
- **חדשים**: `lib/stt/openrouter.ts`, `lib/stt/ogg.ts`, `lib/stt/test-fixtures.ts`.
- **קיימים**: `lib/stt/env.ts`, `lib/stt/types.ts`, `lib/stt/fallback.ts`, `lib/stt/stt.test.ts`, `lib/bot/voice.ts`, `lib/bot/voice.test.ts`, `lib/db/types.ts`, `lib/db/memory.ts`, `lib/db/supabase.ts` (`setMessageTranscript` עם מסלול ועלות), `lib/env.ts`, `lib/env.test.ts`, `lib/demo-factories.test.ts`, `.env.example`, `README.md`, `docs/deploy.md`, `docs/copy/bot-copy.md` (שורות ה"מתי" של `err.transcription_failed` ו-`proc.transcript_echo`), `docs/legal/privacy-policy-he.md`, `docs/legal/dpa-checklist-he.md`.
- **לא נגעתי**: ב-`supabase/` (ההערה על `messages.transcript` עדיין מזכירה את Soniox) וב-`docs/PLAN.md`.
