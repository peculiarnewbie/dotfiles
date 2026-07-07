# dotfiles

Personal configuration files for Linux (niri/Arch) and Windows setups.

## Install

```bash
git clone https://github.com/peculiarnewbie/dotfiles.git ~/git/dotfiles
cd ~/git/dotfiles
./install
```

The `install` script symlinks files and directories from this repo into `$HOME` and `$HOME/.config`. Existing files are backed up to `~/.dotfiles-backup/<timestamp>`.

After running the install script:

```bash
systemctl --user daemon-reload
systemctl --user enable --now ssh-agent.service
```

## What's included

| Config | Tool | Platform |
|--------|------|----------|
| `.zshrc`, `.bashrc`, `.profile`, `.zprofile` | Shell environment | Linux |
| `starship.toml` | Starship prompt | Linux/Windows |
| `ghostty/` | Ghostty terminal | Linux |
| `.wezterm.lua` | WezTerm terminal | Windows |
| `niri/`, `hyprland/` | Wayland compositors | Linux |
| `noctalia/` | Noctalia bar / launcher | Linux |
| `wallpapers/` | Desktop wallpapers | Linux |
| `vite-plus/` | Vite+ bin/package manifests | Linux |
| `kanata.kbd`, `kanata-linux.kbd` | Keyboard remapping | Windows/Linux |
| `whkdrc` | Komorebi hotkey daemon | Windows |
| `nvim/` | Neovim (LazyVim) | Linux/Windows |
| `yazi/` | TUI file manager | Linux |
| `oh-my-posh/`, `powershell/` | PowerShell / prompt | Windows |
| `systemd/` | User systemd units | Linux |
| `sunshine.conf` | Sunshine game streaming | Linux |
| `xremap.yml` | X11 key remapping | Linux |
| `.ideavimrc` | IdeaVim / JetBrains IDEs | All |
| `Zed/` | Zed editor | Linux/Windows |
| `scripts/` | Helper scripts (mostly Linux) | Linux |

## Dependencies

See [`PACKAGES.md`](./PACKAGES.md) for a hand-maintained list of packages to install.

## SSH agent

This repo expects `SSH_AUTH_SOCK` to point to `$XDG_RUNTIME_DIR/ssh-agent.socket`. The `ssh-agent.service` user unit in `systemd/user/ssh-agent.service` provides that socket.

## Custom helpers

- `gacp` — zsh/bash function that stages everything, asks `opencode` to write a conventional commit message, and pushes.
- `yy` — change directory after exiting `yazi`.
- `scripts/linux/` — small helper scripts added to `$PATH` by `.zshrc`.

## Notes

- Some configs contain machine-specific paths (e.g. `/home/bolt/...`). Review before running on a fresh system.
- The Windows and Linux setups coexist in one repo; install only the pieces you need.
