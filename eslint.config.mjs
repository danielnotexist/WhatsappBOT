import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier/flat";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // מכבה כללי עיצוב שמתנגשים עם Prettier — חייב להיות אחרון
  prettier,
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "coverage/**",
    "next-env.d.ts",
    // תיקיות של סוכנים/כלים אחרים — לא חלק מאפליקציית ה-web
    "docs/**",
    "scripts/**",
    "design/**",
    "supabase/**",
    ".claude/**",
  ]),
]);

export default eslintConfig;
