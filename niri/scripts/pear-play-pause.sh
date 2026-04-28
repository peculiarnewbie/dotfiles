#!/usr/bin/env bash
set -euo pipefail

# Find the main pear-desktop PID (ignore renderer subprocesses)
pid=$(pgrep -a -f "pear-desktop/app.asar" | grep -v -- '--type=renderer' | awk '{print $1}' | head -n1)

if [ -z "$pid" ]; then
    exit 0
fi

bus_name="org.mpris.MediaPlayer2.chromium.instance${pid}"

# Only send if the MPRIS bus is actually registered
if busctl --user list | grep -qF "${bus_name}"; then
    busctl --user call "${bus_name}" /org/mpris/MediaPlayer2 org.mpris.MediaPlayer2.Player PlayPause
fi
