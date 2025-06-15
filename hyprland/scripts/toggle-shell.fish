#!/usr/bin/env fish

set script_dir (dirname (status -f))

bash "$script_dir/gamemode.sh"

# Try to kill all processes containing "caelestia"
if pkill -f caelestia
    echo "Killed all caelestia processes."
    powerprofilesctl set power-saver
else
    echo "No caelestia process found. Starting 'caelestia shell'..."
    powerprofilesctl set balanced
    caelestia shell
end
