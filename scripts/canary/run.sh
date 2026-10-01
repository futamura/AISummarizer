#!/bin/zsh
# Run the canary probe with the repository's Node version. launchd starts it with a bare
# environment, so mise is looked up by its install path as well as on PATH.
set -eu

REPO_DIR="${0:A:h:h:h}"
MISE="$(command -v mise || echo "$HOME/.local/bin/mise")"

cd "$REPO_DIR"
exec "$MISE" exec -- node --loader ts-node/esm scripts/canary/probe.ts "$@"
