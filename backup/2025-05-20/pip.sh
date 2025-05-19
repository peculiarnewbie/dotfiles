PIP_NAME="Picture-in-Picture"
PIP_WINDOW=$(hyprctl -j clients | jq '.[] | select(.title == "Picture-in-Picture") | {size: .size, at: .at}')

# echo "$PIP_WINDOW"
PIP_X_SIZE=$(echo "$PIP_WINDOW" | jq '.size[0]')
PIP_Y_SIZE=$(echo "$PIP_WINDOW" | jq '.size[1]')

PIP_X_POS=$(echo "$PIP_WINDOW" | jq '.at[0]')
PIP_Y_POS=$(echo "$PIP_WINDOW" | jq '.at[1]')

LEFT_EDGE=2565
RIGHT_EDGE=4474
BOTTOM_EDGE=2235
TOP_EDGE=1080
MIDDLE=3510

echo "$PIP_X_SIZE $PIP_Y_SIZE"

echo "$1"

source "$(dirname $0)/.pipstaterc"

echo "$PIPSTATE"

case $PIPSTATE in
    0)
        hyprctl dispatch movewindowpixel "exact $LEFT_EDGE $(($BOTTOM_EDGE - $PIP_Y_SIZE)),title:^(Picture-in-Picture)$"
        ;;
    1)
        hyprctl dispatch movewindowpixel "exact $(($RIGHT_EDGE - $PIP_X_SIZE)) $(($BOTTOM_EDGE - $PIP_Y_SIZE)),title:^(Picture-in-Picture)$"
        ;;
    2)
        hyprctl dispatch movewindowpixel "exact $(($MIDDLE - ($PIP_X_SIZE / 2))) $TOP_EDGE,title:^(Picture-in-Picture)$"
        ;;
esac

TEMPPIPSTATE="$((($PIPSTATE + 1) % 3))"

echo "export PIPSTATE=$TEMPPIPSTATE" > "$(dirname $0)/.pipstaterc"


