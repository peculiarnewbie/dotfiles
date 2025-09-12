#!/usr/bin/env bash

WS="$1"         # e.g. discord
MATCH="$2"      # regex for window class or process, e.g. 'discord|com.discordapp.Discord'
LAUNCH_CMD="$3" # command to launch the app

if [ -z "$WS" ] || [ -z "$MATCH" ] || [ -z "$LAUNCH_CMD" ]; then
  echo "Usage: $(basename "$0") <workspace> <class_or_proc_regex> <launch_cmd>"
  exit 1
fi

has_client() {
  if command -v jq >/dev/null 2>&1; then
    hyprctl -j clients 2>/dev/null | jq -e --arg re "$MATCH" \
      '.[] | select(((.class // "") | test($re)) or ((.initialClass // "") | test($re)))' >/dev/null
  else
    pgrep -fi "$MATCH" >/dev/null 2>&1
  fi
}

if ! has_client; then
  nohup bash -lc "$LAUNCH_CMD" >/dev/null 2>&1 &
fi

hyprctl dispatch togglespecialworkspace "$WS"
