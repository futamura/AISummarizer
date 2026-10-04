#!/usr/bin/env bash
# Run the visual regression tests (e2e/visual/) in the Playwright container, where their baselines come from.
# Arguments go to playwright test: pnpm test:visual:update passes --update-snapshots.
# node_modules and the pnpm store live in Docker volumes, so the macOS node_modules stays as it is.
# linux/amd64 matches the CI runners; Apple Silicon runs it through Rosetta.
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_DIR"

if ! docker info >/dev/null 2>&1; then
  echo "Docker is not running: start OrbStack or Docker Desktop first" >&2
  exit 1
fi

# The locked version, as the playwright-version job of ci.yml reads it: the macOS node_modules may lag behind the lockfile
PLAYWRIGHT_VERSION="$(sed -nE "s/^  '@playwright\/test@([0-9.]+)':.*/\1/p" pnpm-lock.yaml | head -n 1)"
if [ -z "$PLAYWRIGHT_VERSION" ]; then
  echo "No @playwright/test version in pnpm-lock.yaml" >&2
  exit 1
fi
PNPM_VERSION="$(node -p "require('./package.json').packageManager.split('@')[1].split('+')[0]")"

docker run --rm --platform linux/amd64 --ipc=host \
  -v "$REPO_DIR":/work \
  -v ai-summarizer-visual-node-modules:/work/node_modules \
  -v ai-summarizer-visual-pnpm-store:/pnpm-store \
  -w /work \
  -e E2E_VISUAL=1 \
  "mcr.microsoft.com/playwright:v${PLAYWRIGHT_VERSION}-noble" \
  bash -c 'set -e
    npm install --global --silent "pnpm@$0"
    pnpm install --frozen-lockfile --store-dir /pnpm-store
    pnpm build:e2e
    pnpm exec playwright test --config e2e/playwright.config.ts --project visual "$@"' "$PNPM_VERSION" "$@"
