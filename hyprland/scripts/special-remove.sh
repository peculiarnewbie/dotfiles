#!/usr/bin/env bash
# Hide the currently shown special workspace if it has a name

line="$(hyprctl monitors | grep -m1 'special workspace:')"

# Extract the content inside parentheses, e.g. "(special:helium)" -> "special:helium"
inside_parentheses="$(sed -n 's/.*(\(.*\)).*/\1/p' <<<"$line")"

# Ensure it starts with "special:" and has a non-empty name after the colon
if [[ "$inside_parentheses" =~ ^special:([[:alnum:]_.:-]+)$ ]]; then
  name="${BASH_REMATCH[1]}"
  if [[ -n "$name" ]]; then
    hyprctl dispatch togglespecialworkspace "$name"
  fi
fi

target="$1"
if [[ -z "$target" ]]; then
  echo "Usage: $0 <workspace>"
  exit 1
fi

hyprctl dispatch workspace "$target"
