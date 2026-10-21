# AGENTS.md

Rules for AI agents working in this repository. The product spec is `docs/PLAN.md` (approved by the owner, Daniel);
the running progress log is `docs/PROGRESS.md` (Hebrew — update it in every commit).

- Language: all user-facing text in Hebrew (professional, warm, no jokes, no "שלח/י" forms — neutral phrasing). Code, identifiers and comments in English.
- Product name: **עלזה** (Latin "Alze"), chosen by Daniel. Single source: `lib/brand.ts` — never hard-code the name. The assistant speaks about herself in the feminine (`docs/copy/style-guide.md`).
- Design direction: **"לילה ירוק"** — dark, cinematic, our own (never copy readywhen's text, logo or mascot). Tokens in `app/globals.css`, fonts in `lib/fonts.ts`, components in `components/brand/`; work by `.claude/skills/frontend-design/SKILL.md`. Logical CSS only (ps/pe/ms/me/start/end) — enforced by a test. The signup flow must keep the screen order of `docs/PLAN.md` / the round plan §3. `design/directions/` is archive.
- No paid API calls, no deployments, no installs outside the repo. Every integration has a mock/dry-run path and fails fast with a Hebrew message listing missing env vars (`lib/env.ts`).
- Before every commit: `pnpm lint && pnpm typecheck && pnpm test && pnpm build` (root), `npm run typecheck` + `npm run pipeline -- --dry-run` (scripts/hebrew-eval), `supabase/tests/run-local.sh` (supabase).
- Never commit secrets, `node_modules/`, `results/`, `.next/`.
- Next.js 16: `proxy.ts` replaces `middleware.ts`; `cacheComponents` is on (request-bound code needs `await connection()` or `<Suspense>`). Read `node_modules/next/dist/docs/` before writing Next code.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
