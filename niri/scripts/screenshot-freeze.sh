#!/bin/sh

tmpfile=$(mktemp /tmp/screenshot-XXXXXX.png)

grim "$tmpfile"

imv -f -s full "$tmpfile" &
imv_pid=$!

sleep 0.2

region="$(slurp)" || { kill "$imv_pid" 2>/dev/null; rm "$tmpfile"; exit 0; }

kill "$imv_pid" 2>/dev/null
wait "$imv_pid" 2>/dev/null

[ -n "$region" ] || { rm "$tmpfile"; exit 0; }

x=$(echo "$region" | cut -d, -f1)
y=$(echo "$region" | cut -d, -f2 | cut -d' ' -f1)
w=$(echo "$region" | cut -d' ' -f2 | cut -dx -f1)
h=$(echo "$region" | cut -d' ' -f2 | cut -dx -f2)

magick "$tmpfile" -crop "${w}x${h}+${x}+${y}" +repage png:- | swappy -f -

rm "$tmpfile"
