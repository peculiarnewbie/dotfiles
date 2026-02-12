#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
STATE_FILE="$SCRIPT_DIR/.pipstaterc"
PIP_TITLE_RE='^picture(?:[- ]in[- ])picture$'

# Set these env vars if your active monitor is not 1920x1200:
#   PIP_OUTPUT_WIDTH
#   PIP_OUTPUT_HEIGHT
OUTPUT_WIDTH="${PIP_OUTPUT_WIDTH:-1920}"
OUTPUT_HEIGHT="${PIP_OUTPUT_HEIGHT:-1200}"
ACTION="${1:-cycle}"

# Screen edge spacing for PiP placement.
LEFT_MARGIN=10
RIGHT_MARGIN=10
TOP_MARGIN=40
BOTTOM_MARGIN=10
CENTER_X_OFFSET=40

pip_window_tsv="$(niri msg --json windows | jq -r --arg re "$PIP_TITLE_RE" '
  first(
    .[]
    | select(.is_floating == true)
    | select(.title | test($re; "i"))
    | [
        .id,
        (.layout.tile_pos_in_workspace_view[0] | floor),
        (.layout.tile_pos_in_workspace_view[1] | floor),
        (.layout.window_size[0] | floor),
        (.layout.window_size[1] | floor)
      ]
    | @tsv
  ) // empty
')"

if [ -z "$pip_window_tsv" ]; then
  exit 0
fi

IFS=$'\t' read -r window_id current_x current_y window_width window_height <<<"$pip_window_tsv"

case "$ACTION" in
  grow)
    niri msg action set-window-width --id "$window_id" "+5%"
    niri msg action set-window-height --id "$window_id" "+5%"
    exit 0
    ;;
  shrink)
    niri msg action set-window-width --id "$window_id" "-5%"
    niri msg action set-window-height --id "$window_id" "-5%"
    exit 0
    ;;
  reset-size)
    niri msg action set-window-width --id "$window_id" "560"
    niri msg action set-window-height --id "$window_id" "315"
    exit 0
    ;;
  cycle)
    ;;
  *)
    exit 2
    ;;
esac

if [ -f "$STATE_FILE" ]; then
  # Supports files like: export PIPSTATE=1
  # shellcheck disable=SC1090
  source "$STATE_FILE"
fi

PIPSTATE="${PIPSTATE:-0}"
case "$PIPSTATE" in
  0|1|2) ;;
  *) PIPSTATE=0 ;;
esac

target_x="$LEFT_MARGIN"
target_y="$BOTTOM_MARGIN"

case "$PIPSTATE" in
  0)
    target_x="$LEFT_MARGIN"
    target_y="$((OUTPUT_HEIGHT - BOTTOM_MARGIN - window_height))"
    ;;
  1)
    target_x="$((OUTPUT_WIDTH - RIGHT_MARGIN - window_width))"
    target_y="$((OUTPUT_HEIGHT - BOTTOM_MARGIN - window_height))"
    ;;
  2)
    target_x="$((OUTPUT_WIDTH / 2 - window_width / 2 + CENTER_X_OFFSET))"
    target_y="$TOP_MARGIN"
    ;;
esac

delta_x="$((target_x - current_x))"
delta_y="$((target_y - current_y))"

format_delta() {
  local value="$1"
  if [ "$value" -ge 0 ]; then
    printf '+%s' "$value"
  else
    printf '%s' "$value"
  fi
}

niri msg action move-floating-window \
  --id "$window_id" \
  --x "$(format_delta "$delta_x")" \
  --y "$(format_delta "$delta_y")"

next_state="$(((PIPSTATE + 1) % 3))"
printf 'export PIPSTATE=%s\n' "$next_state" >"$STATE_FILE"
