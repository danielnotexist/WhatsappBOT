import { Assistant, Frank_Ruhl_Libre } from "next/font/google";

/**
 * קונפיגורציית פונטים — המקום היחיד שמחליפים בו את זוג הפונטים (PLAN §10).
 *
 * next/font מוריד את קובצי הפונט בזמן build ומגיש אותם מהדומיין שלנו (self-host):
 * הדפדפן לא פונה ל-Google, אין layout shift, ו-subsets hebrew+latin בלבד.
 *
 * הזוגות המועמדים (כותרות / גוף):
 *   1. Frank_Ruhl_Libre / Assistant        — "עורך-דין-י", אמין      ← הפעיל כרגע
 *   2. Suez_One / IBM_Plex_Sans_Hebrew     — חם + טכני
 *   3. Karantina (hero בלבד) / Heebo       — דרמטי
 *   4. Bona_Nova / Noto_Sans_Hebrew        — שקט ופרימיום
 *
 * להחלפה: משנים את שני ה-import-ים ואת שתי הקריאות למטה בלבד. next/font דורש קריאות
 * סטטיות עם ארגומנטים מילוליים (אי אפשר לבחור פונט דינמית בזמן ריצה), ולכן לא מגדירים כאן
 * את כל הזוגות יחד — זה היה מוריד ומטעין מראש 8 פונטים בכל דף.
 * ה-CSS variables (--font-heading / --font-body) נשארות זהות, כך ש-globals.css והקומפוננטות לא משתנים.
 */

export const headingFont = Frank_Ruhl_Libre({
  subsets: ["hebrew", "latin"],
  // פונט variable (300–900): קובץ אחד לכל המשקלים; כותרות משתמשות ב-700–900.
  variable: "--font-heading",
  display: "swap",
  fallback: ["Georgia", "Times New Roman", "serif"],
});

export const bodyFont = Assistant({
  subsets: ["hebrew", "latin"],
  variable: "--font-body",
  display: "swap",
  fallback: ["Arial", "Helvetica", "sans-serif"],
});

/** להצמדה ל-<html className> — מגדיר את ה-CSS variables לכל העץ. */
export const fontVariables = `${headingFont.variable} ${bodyFont.variable}`;

/** שמות הפונטים הפעילים (לתיעוד / דפי עיצוב). */
export const activeFontPair = {
  heading: "Frank Ruhl Libre",
  body: "Assistant",
} as const;
