#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -lt 2 ]; then
  echo "usage: focus-or-spawn.sh <app_id_regex> -- <command...>" >&2
  exit 2
fi

app_id_regex="$1"
shift

if [ "${1:-}" = "--" ]; then
  shift
fi

if [ "$#" -eq 0 ]; then
  echo "error: missing command to spawn" >&2
  exit 2
fi

if ! niri msg --json windows >/dev/null 2>&1; then
  "$@" &
  exit 0
fi

window_id=$(niri msg --json windows | jq -r --arg re "$app_id_regex" '
  first(
    .. | objects
    | select(has("app_id") and has("id"))
    | select(.app_id | test($re))
    | .id
  )
')

if [ -n "$window_id" ] && [ "$window_id" != "null" ]; then
  niri msg action focus-window --id "$window_id"
else
  "$@" &
fi
