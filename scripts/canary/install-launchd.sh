#!/bin/zsh
# Register the canary with launchd so that it runs once a day, or remove it with --uninstall.
# The job runs as the logged-in user, since the probe opens a browser window. A run missed while the
# Mac was asleep starts when it wakes up.
set -eu

LABEL="ai-summarizer.canary"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
REPO_DIR="${0:A:h:h:h}"
CANARY_HOME="${CANARY_HOME:-$HOME/Library/Application Support/ai-summarizer-canary}"
HOUR="${CANARY_HOUR:-9}"
MINUTE="${CANARY_MINUTE:-0}"

launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
if [[ "${1:-}" == "--uninstall" ]]; then
  rm -f "$PLIST"
  echo "Removed $LABEL"
  exit 0
fi

mkdir -p -m 700 "$CANARY_HOME"
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
    <string>$REPO_DIR/scripts/canary/run.sh</string>
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
echo "Registered $LABEL: every day at $HOUR:$(printf %02d "$MINUTE"), log in $CANARY_HOME/launchd.log"
