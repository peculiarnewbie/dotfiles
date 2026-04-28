# Plugins
source /usr/share/zsh/plugins/zsh-syntax-highlighting/zsh-syntax-highlighting.zsh
source /usr/share/zsh/plugins/zsh-autosuggestions/zsh-autosuggestions.zsh
ZSH_AUTOSUGGEST_HIGHLIGHT_STYLE='fg=8'

bindkey -e

bindkey '^[[A' history-beginning-search-backward
bindkey '^[[B' history-beginning-search-forward

# History file and sizes
HISTFILE="$HOME/.zsh_history"
HISTSIZE=100000
SAVEHIST=100000

# Write as you go and share across sessions
setopt inc_append_history
setopt share_history

# Useful hygiene
setopt hist_ignore_dups
setopt hist_ignore_all_dups
setopt hist_find_no_dups
setopt hist_reduce_blanks
setopt hist_verify

# highlight path completion
autoload -Uz compinit; compinit
zmodload zsh/complist
zstyle ':completion:*' menu select

# Use systemd user service for ssh-agent (shared across all apps)
export SSH_AUTH_SOCK="$XDG_RUNTIME_DIR/ssh-agent.socket"

# Add SSH key to agent once per session (prompts only at startup if needed)
if [ -f ~/.ssh/id_rsa ]; then
  ssh-add -l >/dev/null 2>&1 || ssh-add ~/.ssh/id_rsa 2>/dev/null
elif [ -f ~/.ssh/id_ed25519 ]; then
  ssh-add -l >/dev/null 2>&1 || ssh-add ~/.ssh/id_ed25519 2>/dev/null
fi

function yy() {
	local tmp="$(mktemp -t "yazi-cwd.XXXXXX")" cwd
	yazi "$@" --cwd-file="$tmp"
	IFS= read -r -d '' cwd < "$tmp"
	[ -n "$cwd" ] && [ "$cwd" != "$PWD" ] && builtin cd -- "$cwd"
	rm -f -- "$tmp"
}

alias ls="exa"

alias zed="/usr/bin/zeditor"

# vite-plus
. "$HOME/.vite-plus/env"

# bun
export PATH="/home/bolt/.bun/bin:$PATH"

# dotfiles scripts
export PATH="/home/bolt/git/dotfiles/scripts/linux:$PATH"

eval "$(starship init zsh)"

eval "$(zoxide init zsh)"

gacp() {
	local model="${1:-${OPENCODE_GACP_MODEL:-opencode-go/deepseek-v4-flash}}"
	local diff msg prompt

	git add -A || return 1
	diff=$(git diff --cached) || return 1
	[ -z "$diff" ] && { echo "No changes to commit."; return 0; }

	prompt="Output ONLY a single-line conventional commit message for this git diff (e.g. 'fix(auth): handle expired token'). Lowercase, no trailing period, no quotes, no markdown, no explanation. Just the message.\n\n${diff}"
	msg=$(opencode run -m "$model" --dangerously-skip-permissions "${prompt}" 2>/dev/null | tail -1)
	msg=$(echo "$msg" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//;/^$/d')

	[ -z "$msg" ] && { echo "Failed to generate commit message."; return 1; }
	echo "→ $msg"
	git commit -m "$msg" && git push
}

