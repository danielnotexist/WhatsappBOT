import { defineConfig, devices } from "@playwright/test";

/**
 * E2E of DEMO_MODE=1 (round plan §1) against a PRODUCTION build — the way Vercel runs it: `next build` + `next start`
 * with NODE_ENV=production, no keys, nothing sent anywhere. Two `next start` instances share one build and one
 * TOKEN_ENC_KEY, standing in for two serverless instances: a session made on A must work on B (the user is
 * recreated there from the signed session).
 *   pnpm e2e:demo                          # builds, starts A and B, runs e2e/demo.spec.ts
 *   E2E_DEMO_SKIP_BUILD=1 pnpm e2e:demo    # reuse the existing .next (it must be a production build)
 * Uses the Chromium that ships with the environment (/opt/pw-browsers); never run `playwright install`.
 */
export const DEMO_PORT_A = Number(process.env.E2E_DEMO_PORT ?? 3270);
export const DEMO_PORT_B = DEMO_PORT_A + 1;
/** a throwaway all-twos key for the local demo servers (not a secret) */
export const E2E_DEMO_KEY = Buffer.alloc(32, 2).toString("base64");

const urlA = `http://localhost:${DEMO_PORT_A}`;
const urlB = `http://localhost:${DEMO_PORT_B}`;
const demoEnv = (appUrl: string) => ({ DEMO_MODE: "1", TOKEN_ENC_KEY: E2E_DEMO_KEY, APP_URL: appUrl, NEXT_TELEMETRY_DISABLED: "1" });
const build = process.env.E2E_DEMO_SKIP_BUILD ? "" : "pnpm build && ";

export default defineConfig({
  testDir: "e2e",
  testMatch: "demo.spec.ts",
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: urlA,
    locale: "he-IL",
    colorScheme: "dark",
    trace: "off",
    launchOptions: { executablePath: process.env.PW_CHROMIUM_PATH ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], channel: undefined } }],
  // started in order: A builds (with the demo env, like a Vercel build) and starts, then B starts on the same build
  webServer: [
    { command: `${build}pnpm start --port ${DEMO_PORT_A}`, url: `${urlA}/api/health`, reuseExistingServer: false, timeout: 600_000, env: demoEnv(urlA) },
    { command: `pnpm start --port ${DEMO_PORT_B}`, url: `${urlB}/api/health`, reuseExistingServer: false, timeout: 120_000, env: demoEnv(urlB) },
  ],
});
