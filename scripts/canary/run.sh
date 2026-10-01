#!/bin/zsh
# Run the canary probe from the canary's own clone of the repository, brought up to date with develop
# first. install-launchd.sh copies this script into CANARY_HOME and launchd runs that copy: macOS does
# not let a launchd job read ~/Documents, where the working copy usually lives, and the clone keeps the
# daily run independent of the branch checked out there. launchd starts it with a bare environment, so
# mise and pnpm are looked up by their install paths as well as on PATH.
set -eu

export CANARY_HOME="${0:A:h}"
REPO_DIR="$CANARY_HOME/repo"
MISE="$(command -v mise || echo "$HOME/.local/bin/mise")"
PNPM="$(command -v pnpm || echo "$HOME/Library/pnpm/pnpm")"

# The probe reports its own failures; this covers the steps before it, which would otherwise fail silently
notify_failure() {
  osascript -e 'display notification "Canary crashed before the probe: see launchd.log" with title "AI Summarizer canary"' || true
}
trap notify_failure ERR

cd "$REPO_DIR"
git pull --ff-only --quiet
"$MISE" exec -- "$PNPM" install --frozen-lockfile --prefer-offline --reporter=silent

trap - ERR
exec "$MISE" exec -- node --loader ts-node/esm scripts/canary/probe.ts "$@"
