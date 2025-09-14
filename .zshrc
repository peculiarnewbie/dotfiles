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

# Single-user ssh-agent bootstrap reused across shells
export SSH_ENV="$HOME/.ssh/agent_env"

start_agent() {
  ssh-agent -s >| "$SSH_ENV"
  chmod 600 "$SSH_ENV"
  . "$SSH_ENV" >/dev/null
  ssh-add ~/.ssh/id_ed25519
}

if [ -f "$SSH_ENV" ]; then
  . "$SSH_ENV" >/dev/null
  # If the agent recorded in file isn't alive, start a new one
  if ! ssh-add -l >/dev/null 2>&1; then
    start_agent
  fi
else
  start_agent
fi

function yy() {
	local tmp="$(mktemp -t "yazi-cwd.XXXXXX")" cwd
	yazi "$@" --cwd-file="$tmp"
	IFS= read -r -d '' cwd < "$tmp"
	[ -n "$cwd" ] && [ "$cwd" != "$PWD" ] && builtin cd -- "$cwd"
	rm -f -- "$tmp"
}

alias ls="exa"

eval "$(starship init zsh)"

eval "$(zoxide init zsh)"

