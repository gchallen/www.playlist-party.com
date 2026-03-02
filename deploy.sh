#!/usr/bin/env bash
set -euo pipefail

# --- Flags ---
SKIP_TESTS=false
FORCE=false
DRY_RUN=false

for arg in "$@"; do
  case "$arg" in
    --skip-tests) SKIP_TESTS=true ;;
    --force) FORCE=true ;;
    --dry-run) DRY_RUN=true ;;
    *) echo "Unknown flag: $arg"; exit 1 ;;
  esac
done

# --- Helpers ---
step() {
  printf '\033[1;36m==> %s\033[0m\n' "$1"
}

run() {
  if $DRY_RUN; then
    printf '\033[0;33m  [dry-run] %s\033[0m\n' "$*"
  else
    "$@"
  fi
}

# --- 1. Dirty tree guard ---
step "Checking working tree"
if ! $FORCE && [ -n "$(git status --porcelain)" ]; then
  echo "Error: uncommitted changes. Commit first or use --force."
  exit 1
fi
echo "Working tree clean (or --force)."

# --- 2. Run E2E tests ---
if $SKIP_TESTS; then
  step "Skipping tests (--skip-tests)"
else
  step "Running Playwright tests"
  run env ADAPTER=node bun run build
  run env ADAPTER=node bunx playwright test
fi

# --- 3. Build for Cloudflare ---
step "Building for Cloudflare"
run bun run build

# --- 4. Apply D1 migrations ---
step "Applying D1 migrations"
run wrangler d1 migrations apply playlist-party-db --remote

# --- 5. Deploy ---
step "Deploying to Cloudflare Pages"
run wrangler pages deploy .svelte-kit/cloudflare

step "Done!"
