# Playlist Party

Music-centered party invitation website where guests build a collaborative playlist via YouTube links.

## Tech Stack
- **SvelteKit** with TypeScript
- **Bun** as package manager (use `bun` not `npm`/`yarn`)
- **Drizzle ORM** with SQLite (D1 for Cloudflare, better-sqlite3 for local/Docker)
- **Tailwind CSS v4** (imported via `@import 'tailwindcss'` in app.css)
- **Playwright** for E2E testing (98 tests across 8 spec files)
- **nanoid** for token generation

## Key Conventions
- Use `better-sqlite3` for local dev — `ADAPTER=node` must be set as a prefix in package.json scripts (NOT in `.env` — `svelte.config.js` runs before Vite loads `.env` files)
- Default adapter is Cloudflare (`@sveltejs/adapter-cloudflare`)
- Token-based auth only (no login/OAuth) — invite tokens + share tokens
- YouTube metadata via oEmbed API (no API key needed)
- **Database migrations only** — use `bunx drizzle-kit generate` then apply migrations. NEVER use `drizzle-kit push`.
- **Pin all package versions** — use exact versions (e.g. `"5.1.6"`) not ranges (`"^5.1.6"`). Use `bun ncu` to check for updates, `bun ncu:apply` to upgrade.
- No WebSockets (Cloudflare Workers constraint) — use polling for real-time features.

## Commands
- `bun run dev` — start dev server
- `bun run build` — build for production (uses node adapter via ADAPTER=node in package.json)
- `bunx vite build` — build for Cloudflare (no ADAPTER prefix)
- `bun run deploy` — full deploy: tests → Cloudflare build → D1 migrations → Pages deploy
- `bunx playwright test` — run E2E tests
- `bunx drizzle-kit generate` — generate migrations (NEVER use `drizzle-kit push`)
- `bun ncu` — check for outdated dependencies
- `bun ncu:apply` — upgrade all dependencies to latest and reinstall

## Database Schema (5 tables)
- **parties** — party config (name, date, time, location, limits, nowPlayingSongId for party mode)
- **attendees** — guests with inviteToken, shareToken, acceptedAt/declinedAt, depth in invite tree
- **songs** — YouTube tracks with position, durationSeconds, addedBy → attendee
- **song_likes** — per-attendee likes on songs (unique songId+attendeeId)
- **email_sends** — rate-limiting log for outbound emails

## Routes
- `/` — landing page
- `/create` — party creation form (email verification → party setup)
- `/party/[token]` — main party page (invite acceptance, song management, creator admin)
- `/party/[token]/live` — DJ live screen (creator only, fullscreen YouTube playback)
- `/party/[token]/live?display` — display-only mirror (no auto-advance, has controls)
- `/share/[token]` — public share link for joining a party
- `/api/party/[token]/now-playing` — GET/POST current playing song
- `/api/party/[token]/like` — POST toggle song like
- `/api/youtube/validate` — YouTube URL validation + metadata
- `/api/emails` — dev/test email inspection (GET/DELETE)

## File Ownership (Agent Team)
- **Tester**: `tests/**`, `playwright.config.ts`
- **Developer**: `src/routes/**/+page.server.ts`, `src/routes/**/+server.ts`, `src/lib/server/**`, `src/lib/youtube.ts`, `wrangler.toml`, `drizzle.config.ts`
- **Designer**: `src/lib/components/**`, `src/app.css`, styling in `.svelte` files
- **Shared**: `src/routes/**/+page.svelte` — developer creates skeleton, designer polishes

## Production Debugging

### Pulling Cloudflare Pages logs
1. Get the deployment ID: `npx wrangler pages deployment list --project-name=playlist-party`
2. Start tailing (write to file, runs indefinitely):
   ```
   npx wrangler pages deployment tail --project-name=playlist-party <DEPLOYMENT_ID> --format=json > /tmp/cf-tail.json 2>&1 &
   ```
3. Trigger the error (e.g. via curl or browser)
4. Read the log: `cat /tmp/cf-tail.json`
5. Kill the tail process when done

The `--format=json` output includes `logs` array with console.error output and `exceptions`. The `hooks.server.ts` handleError hook logs `[errorId] status METHOD path: stacktrace` to console.error, which appears in the logs.

### Secrets
Set via `npx wrangler pages secret put SECRET_NAME --project-name=playlist-party`. Current secrets:
- `RESEND_API_KEY`, `RESEND_FROM_EMAIL` — email sending via Resend
- `HMAC_SECRET` — HMAC signing for email verification tokens

### Cloudflare compatibility
- `nodejs_compat` flag is enabled in `wrangler.toml`
- **Always explicitly import Node.js globals** like `Buffer` (e.g. `import { Buffer } from 'node:buffer'`) — they are NOT available as globals on Cloudflare Workers
