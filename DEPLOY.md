# Deploying Playlist Party to Cloudflare Pages

## Prerequisites

- [Cloudflare account](https://dash.cloudflare.com/sign-up)
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/) installed (`bun add -g wrangler`)
- [Resend account](https://resend.com) for transactional email
- A verified domain for sending email (configured in Resend)

## 1. Create a D1 Database

```bash
wrangler d1 create playlist-party-db
```

Copy the `database_id` from the output and replace the placeholder in `wrangler.toml`:

```toml
[[d1_databases]]
binding = "DB"
database_name = "playlist-party-db"
database_id = "<your-database-id>"
```

## 2. Run Migrations on D1

Generate migrations from the Drizzle schema (if not already generated):

```bash
bunx drizzle-kit generate
```

Apply migrations to your remote D1 database:

```bash
wrangler d1 migrations apply playlist-party-db --remote
```

Or apply the SQL files directly:

```bash
wrangler d1 execute playlist-party-db --remote --file=drizzle/0000_sharp_whistler.sql
wrangler d1 execute playlist-party-db --remote --file=drizzle/0001_slow_amazoness.sql
```

Apply any newer migration files in `drizzle/` in order as well.

## 3. Set Secrets

```bash
wrangler secret put RESEND_API_KEY
# Paste your Resend API key when prompted

wrangler secret put RESEND_FROM_EMAIL
# e.g. noreply@playlist-party.com (must match a verified domain in Resend)

wrangler secret put HMAC_SECRET
# Random secret for email verification tokens (e.g. openssl rand -hex 32)
```

## 4. Deploy

The easiest way to deploy is the deploy script:

```bash
./deploy.sh              # Full deploy: tests → build → migrate → deploy
./deploy.sh --skip-tests # Skip Playwright tests
./deploy.sh --dry-run    # Print steps without executing
./deploy.sh --force      # Allow deploy with uncommitted changes
```

Or deploy manually:

```bash
bun run build
wrangler d1 migrations apply playlist-party-db --remote
wrangler pages deploy .svelte-kit/cloudflare
```

Or connect your GitHub repo to Cloudflare Pages for automatic deploys:

1. Go to **Cloudflare Dashboard > Pages > Create a project**
2. Connect your GitHub repository
3. Set build command: `bun run build`
4. Set build output directory: `.svelte-kit/cloudflare`
5. Add the D1 database binding and secrets in the Pages project settings

## 5. Custom Domain (Optional)

In the Cloudflare Pages project settings, add your custom domain under **Custom domains**.

## Local Development

```bash
bun install
bun run dev          # Starts dev server with better-sqlite3 (ADAPTER=node)
```

The dev server uses an in-memory email store — no Resend key needed locally. Sent emails are queryable at `http://localhost:5173/api/emails`.

## Running Tests

```bash
ADAPTER=node bun run build
ADAPTER=node bunx playwright test
```
