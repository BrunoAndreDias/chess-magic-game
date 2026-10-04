#!/usr/bin/env bash
# Read-only: is this checkout ready to drive? Prints one line per check, exits 1 if any fails.
# Usage: doctor.sh [port]   (default 5288, the port drive.cjs uses)
set -u
ROOT="$(cd "$(dirname "$0")/../../../.." && pwd)"
PORT="${1:-${PORT:-5288}}"
CHROME="${CHROME:-$HOME/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing}"
bad=0
ok()   { echo "ok    $*"; }
fail() { echo "FAIL  $*"; bad=1; }

[ -d "$ROOT/node_modules/vite" ] && [ -d "$ROOT/node_modules/playwright-core" ] && ok "node_modules has vite and playwright-core" || fail "deps missing: run npm install in $ROOT"
[ -x "$CHROME" ] && ok "chromium at $CHROME" || fail "no chromium at \$CHROME ($CHROME); set CHROME= to a Chrome for Testing binary"
if pid=$(lsof -nP -iTCP:"$PORT" -sTCP:LISTEN -t 2>/dev/null | head -1) && [ -n "$pid" ]; then
  fail "port $PORT already held by pid $pid ($(ps -o command= -p "$pid" | cut -c1-90)); if it is a stale drive.cjs you started, kill $pid, else pick PORT="
else
  ok "port $PORT free"
fi
dev=$(lsof -nP -iTCP:5173 -sTCP:LISTEN -t 2>/dev/null | head -1)
[ -n "$dev" ] && echo "note  the user's npm run dev is on :5173 (pid $dev); leave it alone" || true
echo "rev   $(git -C "$ROOT" rev-parse --short HEAD)$(git -C "$ROOT" diff --quiet || echo ' +uncommitted changes')"
exit $bad
