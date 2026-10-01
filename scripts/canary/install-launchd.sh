#!/bin/zsh
# Register the canary with launchd so that it runs once a day, or remove it with --uninstall.
# The job runs as the logged-in user, since the probe opens a browser window. A run missed while the
# Mac was asleep starts when it wakes up. The job runs from a clone of the repository in CANARY_HOME
# (see run.sh), made here on the first install; run this again after changing run.sh.
set -eu

LABEL="ai-summarizer.canary"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
REPO_DIR="${0:A:h:h:h}"
CANARY_HOME="${CANARY_HOME:-$HOME/Library/Application Support/ai-summarizer-canary}"
CANARY_REPO="$CANARY_HOME/repo"
# Over HTTPS, so that the daily pull needs no SSH key; the repository is public
REPO_URL="${CANARY_REPO_URL:-https://github.com/futamura/AISummarizer.git}"
HOUR="${CANARY_HOUR:-9}"
MINUTE="${CANARY_MINUTE:-0}"
MISE="$(command -v mise || echo "$HOME/.local/bin/mise")"
PNPM="$(command -v pnpm || echo "$HOME/Library/pnpm/pnpm")"

launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
if [[ "${1:-}" == "--uninstall" ]]; then
  rm -f "$PLIST" "$CANARY_HOME/run.sh"
  echo "Removed $LABEL (the profile, runs and clone in $CANARY_HOME are kept)"
  exit 0
fi

mkdir -p -m 700 "$CANARY_HOME"
if [[ ! -d "$CANARY_REPO/.git" ]]; then
  git clone --quiet --branch develop "$REPO_URL" "$CANARY_REPO"
fi
# mise refuses to read an untrusted mise.toml, and launchd cannot answer its prompt
"$MISE" trust --quiet "$CANARY_REPO/mise.toml"
(cd "$CANARY_REPO" && git pull --ff-only --quiet && "$MISE" exec -- "$PNPM" install --frozen-lockfile --prefer-offline --reporter=silent)
install -m 700 "$REPO_DIR/scripts/canary/run.sh" "$CANARY_HOME/run.sh"

cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/zsh</string>
    <string>$CANARY_HOME/run.sh</string>
  </array>
  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key>
    <integer>$HOUR</integer>
    <key>Minute</key>
    <integer>$MINUTE</integer>
  </dict>
  <key>StandardOutPath</key>
  <string>$CANARY_HOME/launchd.log</string>
  <key>StandardErrorPath</key>
  <string>$CANARY_HOME/launchd.log</string>
</dict>
</plist>
EOF

launchctl bootstrap "gui/$(id -u)" "$PLIST"
echo "Registered $LABEL: every day at $HOUR:$(printf %02d "$MINUTE"), from $CANARY_REPO, log in $CANARY_HOME/launchd.log"
