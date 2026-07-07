# Package / dependency list

This is a living list of tools these dotfiles depend on. It is not an automated install script — copy the relevant lines for your package manager.

## Linux (Arch / pacman / AUR)

### Core shell environment

```bash
sudo pacman -S zsh zsh-syntax-highlighting zsh-autosuggestions git openssh
yay -S starship-bin zoxide-bin     # or install via cargo/rustup
```

### Terminal & launcher

```bash
sudo pacman -S ghostty
# or
yay -S ghostty-git
```

### Window manager / compositor

```bash
sudo pacman -S niri
# Optional / alternatives also configured:
# sudo pacman -S hyprland
```

### Keyboard remapping

```bash
sudo pacman -S kanata
```

### File managers & navigation

```bash
sudo pacman -S yazi exa            # exa is archived; eza is the maintained fork
# or
sudo pacman -S eza
```

### Media (used by yazi openers)

```bash
sudo pacman -S mpv imv
```

### Development

```bash
# Neovim + LazyVim dependencies
sudo pacman -S neovim nodejs npm ripgrep fd

# JS/TS runtime
# curl -fsSL https://bun.sh/install | bash

# opencode CLI — install via bun/npm or official installer
# bun install -g @opencodeai/opencode
```

### Optional / machine-specific

These are referenced by configs but you may not want them on every machine:

```bash
# Bar / launcher (used by niri autostart)
yay -S noctalia

# Authentication agent used by niri autostart
sudo pacman -S polkit-kde-agent

# Remote / game streaming
yay -S sunshine
```

### Browser

Currently set in `.profile`:

```bash
export BROWSER=helium-browser
```

Alternatives referenced in older autostart configs: `zen-browser`.

### Other autostart helpers

- `niri-float-sticky` — custom Go helper, path hardcoded in `niri/cfg/autostart.kdl`
- `qs -c noctalia-shell` — custom shell/launcher, ensure `qs` is on `$PATH`
- `pip-watch.sh` — lives in `niri/scripts/`
- `git-glance` — referenced in current uncommitted autostart changes; not part of this repo

## Windows

- [WezTerm](https://wezfurlong.org/wezterm/)
- [PowerShell 7](https://github.com/PowerShell/PowerShell)
- [Komorebi](https://github.com/LGUG2Z/komorebi) + `whkd`
- [Kanata](https://github.com/jtroo/kanata) (Windows build)
- [Oh My Posh](https://ohmyposh.dev/)

## Fonts

Starship uses Nerd Font glyphs. Install a Nerd Font, for example:

```bash
sudo pacman -S ttf-jetbrains-mono-nerd
```

## Notes

- This list is almost certainly incomplete. If something is missing, add it here.
- Some tools (`opencode`, `bun`, `git-glance`) are installed outside the system package manager.
