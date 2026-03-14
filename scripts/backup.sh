#!/usr/bin/env bash
set -euo pipefail

DIR="backups"
DB="playlist-party-db"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
FILE="$DIR/$DB-$TIMESTAMP.sql"

mkdir -p "$DIR"

# Warm up OAuth token (first wrangler call after expiry fails; this forces a refresh)
wrangler whoami > /dev/null 2>&1 || true

printf '\033[1;36m==> Exporting remote D1 database...\033[0m\n'
wrangler d1 export "$DB" --remote --output "$FILE"

printf '\033[1;36m==> Backup saved to %s\033[0m\n' "$FILE"
printf '\033[0;33m    Restore with: wrangler d1 execute %s --remote --file=%s\033[0m\n' "$DB" "$FILE"
