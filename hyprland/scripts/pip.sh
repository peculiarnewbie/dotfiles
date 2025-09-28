PIP_NAME="(?i)^picture(?:[-\s]in[-\s]picture)$"
PIP_WINDOW=$(hyprctl -j clients | jq --arg re "$PIP_NAME" '
  .[] | select(.title | test($re)) | {size: .size, at: .at}
')

# echo "$PIP_WINDOW"
PIP_X_SIZE=$(echo "$PIP_WINDOW" | jq '.size[0]')
PIP_Y_SIZE=$(echo "$PIP_WINDOW" | jq '.size[1]')

PIP_X_POS=$(echo "$PIP_WINDOW" | jq '.at[0]')
PIP_Y_POS=$(echo "$PIP_WINDOW" | jq '.at[1]')

LEFT_EDGE=10
RIGHT_EDGE=1910
BOTTOM_EDGE=1190
TOP_EDGE=40
MIDDLE=1000

echo "$PIP_X_SIZE $PIP_Y_SIZE"

echo "$1"

source "$(dirname $0)/.pipstaterc"

echo "$PIPSTATE"

case $PIPSTATE in
0)
  hyprctl dispatch movewindowpixel "exact $LEFT_EDGE $(($BOTTOM_EDGE - $PIP_Y_SIZE)),title:$PIP_NAME"
  ;;
1)
  hyprctl dispatch movewindowpixel "exact $(($RIGHT_EDGE - $PIP_X_SIZE)) $(($BOTTOM_EDGE - $PIP_Y_SIZE)),title:$PIP_NAME"
  ;;
2)
  hyprctl dispatch movewindowpixel "exact $(($MIDDLE - ($PIP_X_SIZE / 2))) $TOP_EDGE,title:$PIP_NAME"
  ;;
esac

TEMPPIPSTATE="$((($PIPSTATE + 1) % 3))"

echo "export PIPSTATE=$TEMPPIPSTATE" >"$(dirname $0)/.pipstaterc"
