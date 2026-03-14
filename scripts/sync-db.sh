#!/usr/bin/env bash
set -euo pipefail

DB_REMOTE="playlist-party-db"
DB_LOCAL="local.db"
DUMP_FILE=$(mktemp /tmp/playlist-party-sync-XXXXXX.sql)

trap 'rm -f "$DUMP_FILE"' EXIT

# Warm up OAuth token (first wrangler call after expiry fails; this forces a refresh)
wrangler whoami > /dev/null 2>&1 || true

printf '\033[1;36m==> Exporting remote D1 database...\033[0m\n'
wrangler d1 export "$DB_REMOTE" --remote --output "$DUMP_FILE"

# Remove local DB files (including WAL artifacts)
printf '\033[1;36m==> Replacing local database...\033[0m\n'
rm -f "$DB_LOCAL" "$DB_LOCAL-shm" "$DB_LOCAL-wal"

# Import the dump into a fresh local.db
sqlite3 "$DB_LOCAL" < "$DUMP_FILE"

# D1 tracks migrations in d1_migrations; local drizzle-kit uses __drizzle_migrations.
# Recreate the local migration journal from the D1 one so drizzle-kit stays in sync.
# - drizzle-kit stores the tag (e.g. "0000_sharp_whistler") as "hash"
# - D1 stores the filename (e.g. "0000_sharp_whistler.sql") as "name"
# - created_at is numeric (milliseconds)
sqlite3 "$DB_LOCAL" <<'SQL'
CREATE TABLE IF NOT EXISTS "__drizzle_migrations" (
  id SERIAL PRIMARY KEY,
  hash text NOT NULL,
  created_at numeric
);
INSERT INTO "__drizzle_migrations" (hash, created_at)
  SELECT REPLACE(name, '.sql', ''),
         CAST(strftime('%s', applied_at) * 1000 AS INTEGER)
  FROM d1_migrations
  ORDER BY id;
SQL

# Re-enable WAL mode for local dev
sqlite3 "$DB_LOCAL" "PRAGMA journal_mode=WAL;"

printf '\033[1;32m==> Done! local.db synced from remote.\033[0m\n'
