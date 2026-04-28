#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PIP_TITLE_RE='^picture(?:[- ]in[- ])picture$'

last_window_id=""

while true; do
  pip_id="$(niri msg --json windows | jq -r --arg re "$PIP_TITLE_RE" '
    first(
      .[]
      | select(.is_floating == true)
      | select(.title | test($re; "i"))
      | .id
    ) // empty
  ')"

  if [ -n "$pip_id" ] && [ "$pip_id" != "$last_window_id" ]; then
    "$SCRIPT_DIR/pip.sh" restore >/dev/null 2>&1 || true
    last_window_id="$pip_id"
  fi

  if [ -z "$pip_id" ]; then
    last_window_id=""
  fi

  sleep 0.4
done
