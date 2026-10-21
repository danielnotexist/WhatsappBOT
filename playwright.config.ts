import { defineConfig, devices } from "@playwright/test";

/**
 * E2E (round plan §7): the signup flow against `next dev` in DATA_MODE=memory — no keys, no network.
 * Uses the Chromium that ships with the environment (/opt/pw-browsers); never run `playwright install`.
 *   pnpm e2e                       # all specs
 *   CAPTURE_SCREENS=1 pnpm e2e e2e/screens.spec.ts   # also writes design/signup-screens/*.png
 */
export const E2E_PORT = Number(process.env.E2E_PORT ?? 3100);
export const E2E_META_SECRET = "e2e-meta-secret"; // test-only HMAC secret for signing fake webhooks
const baseURL = `http://localhost:${E2E_PORT}`;

export default defineConfig({
  testDir: "e2e",
  // DEMO_MODE runs against a production build with its own servers: playwright.demo.config.ts (pnpm e2e:demo)
  testIgnore: ["demo.spec.ts"],
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL,
    locale: "he-IL",
    colorScheme: "dark",
    trace: "off",
    launchOptions: { executablePath: process.env.PW_CHROMIUM_PATH ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], channel: undefined } }],
  webServer: {
    command: `pnpm dev --port ${E2E_PORT}`,
    url: `${baseURL}/start`,
    reuseExistingServer: true,
    timeout: 240_000,
    env: {
      DATA_MODE: "memory",
      APP_URL: baseURL,
      META_APP_SECRET: E2E_META_SECRET,
      WA_VERIFY_TOKEN: "e2e-verify",
      // a throwaway all-ones key for the local dev server (not a secret; memory mode only)
      TOKEN_ENC_KEY: Buffer.alloc(32, 1).toString("base64"),
    },
  },
});
