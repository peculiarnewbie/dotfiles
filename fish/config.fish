source /usr/share/cachyos-fish-config/cachyos-config.fish

# overwrite greeting
#function fish_greeting
#    # smth smth
#end

# pnpm
set -gx PNPM_HOME "/home/bolt/.local/share/pnpm"
if not string match -q -- "$PNPM_HOME/bin" $PATH
  set -gx PATH "$PNPM_HOME/bin" $PATH
end
# pnpm end

# dotfiles scripts
set -gx PATH "/home/bolt/git/dotfiles/scripts/linux" $PATH

# Noctalia (Quickshell bar/launcher) on/off toggles
function noctalia-on
    systemctl --user start noctalia-shell
end

function noctalia-off
    systemctl --user stop noctalia-shell
end

function noctalia-status
    systemctl --user status noctalia-shell --no-pager
end

function noctalia-toggle
    if systemctl --user is-active --quiet noctalia-shell
        systemctl --user stop noctalia-shell
        echo "Noctalia stopped."
    else
        systemctl --user start noctalia-shell
        echo "Noctalia started."
    end
end
