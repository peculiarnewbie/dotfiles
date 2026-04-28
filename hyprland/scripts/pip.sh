#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
STATE_FILE="$SCRIPT_DIR/.pipstaterc"
PIP_NAME='(?i)^picture(?:[-\s]in[-\s]picture)$'

PIP_WINDOW="$(hyprctl -j clients | jq -c --arg re "$PIP_NAME" '
  first(
    .[]
    | select(.title | test($re))
    | {size: .size, at: .at}
  ) // empty
')"

if [ -z "$PIP_WINDOW" ]; then
  exit 0
fi

PIP_X_SIZE="$(printf '%s' "$PIP_WINDOW" | jq '.size[0]')"
PIP_Y_SIZE="$(printf '%s' "$PIP_WINDOW" | jq '.size[1]')"
PIP_X_POS="$(printf '%s' "$PIP_WINDOW" | jq '.at[0]')"
PIP_Y_POS="$(printf '%s' "$PIP_WINDOW" | jq '.at[1]')"

LEFT_EDGE=10
RIGHT_EDGE=1910
BOTTOM_EDGE=1190
TOP_EDGE=40
MIDDLE=1000

state_0_x="$LEFT_EDGE"
state_0_y="$((BOTTOM_EDGE - PIP_Y_SIZE))"
state_1_x="$((RIGHT_EDGE - PIP_X_SIZE))"
state_1_y="$((BOTTOM_EDGE - PIP_Y_SIZE))"
state_2_x="$((MIDDLE - (PIP_X_SIZE / 2)))"
state_2_y="$TOP_EDGE"

if [ -f "$STATE_FILE" ]; then
  # shellcheck disable=SC1090
  source "$STATE_FILE"
fi

PIPSTATE="${PIPSTATE:-0}"
case "$PIPSTATE" in
  0|1|2) ;;
  *) PIPSTATE=0 ;;
esac

current_state="-1"
if [ "$PIP_X_POS" -eq "$state_0_x" ] && [ "$PIP_Y_POS" -eq "$state_0_y" ]; then
  current_state=0
elif [ "$PIP_X_POS" -eq "$state_1_x" ] && [ "$PIP_Y_POS" -eq "$state_1_y" ]; then
  current_state=1
elif [ "$PIP_X_POS" -eq "$state_2_x" ] && [ "$PIP_Y_POS" -eq "$state_2_y" ]; then
  current_state=2
fi

if [ "$current_state" -ge 0 ]; then
  target_state="$(((current_state + 1) % 3))"
else
  target_state="$PIPSTATE"
fi

case "$target_state" in
  0)
    target_x="$state_0_x"
    target_y="$state_0_y"
    ;;
  1)
    target_x="$state_1_x"
    target_y="$state_1_y"
    ;;
  2)
    target_x="$state_2_x"
    target_y="$state_2_y"
    ;;
esac

hyprctl dispatch movewindowpixel "exact $target_x $target_y,title:$PIP_NAME"
printf 'export PIPSTATE=%s\n' "$target_state" >"$STATE_FILE"
