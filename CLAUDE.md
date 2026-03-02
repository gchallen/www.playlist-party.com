# Playlist Party

Music-centered party invitation website. See full plan: `~/.claude/plans/encapsulated-meandering-kahn.md`

## Tech Stack
- **SvelteKit** with TypeScript
- **Bun** as package manager (use `bun` not `npm`/`yarn`)
- **Drizzle ORM** with SQLite (D1 for Cloudflare, better-sqlite3 for local/Docker)
- **Tailwind CSS v4** (imported via `@import 'tailwindcss'` in app.css)
- **Playwright** for E2E testing
- **nanoid** for token generation

## Key Conventions
- Use `better-sqlite3` for local dev — `ADAPTER=node` must be set as a prefix in package.json scripts (NOT in `.env` — `svelte.config.js` runs before Vite loads `.env` files)
- Default adapter is Cloudflare (`@sveltejs/adapter-cloudflare`)
- Token-based auth only (no login/OAuth) — invite tokens + admin tokens
- YouTube metadata via oEmbed API (no API key needed)
- **Database migrations only** — use `bunx drizzle-kit generate` then apply migrations. NEVER use `drizzle-kit push`.

## File Ownership (Agent Team)
- **Tester**: `tests/**`, `playwright.config.ts`
- **Developer**: `src/routes/**/+page.server.ts`, `src/routes/**/+server.ts`, `src/lib/server/**`, `src/lib/youtube.ts`, `wrangler.toml`, `drizzle.config.ts`
- **Designer**: `src/lib/components/**`, `src/app.css`, styling in `.svelte` files
- **Shared**: `src/routes/**/+page.svelte` — developer creates skeleton, designer polishes

## Commands
- `bun run dev` — start dev server
- `bun run build` — build for production
- `bunx playwright test` — run E2E tests
- `bunx drizzle-kit generate` — generate migrations (NEVER use `drizzle-kit push`)
