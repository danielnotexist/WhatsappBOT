import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const root = fileURLToPath(new URL("./", import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [{ find: /^@\//, replacement: root }],
  },
  test: {
    // ברירת מחדל: node (lib/*). לבדיקות קומפוננטות מוסיפים בראש הקובץ: // @vitest-environment jsdom
    environment: "node",
    include: ["**/*.test.{ts,tsx}"],
    exclude: [
      "**/node_modules/**",
      "**/.next/**",
      "docs/**",
      "scripts/**",
      "design/**",
      "supabase/**",
    ],
    setupFiles: ["./vitest.setup.ts"],
    css: false,
  },
});
