#
# ~/.bashrc
#

# If not running interactively, don't do anything
[[ $- != *i* ]] && return

alias ls='ls --color=auto'
alias grep='grep --color=auto'
PS1='[\u@\h \W]\$ '

gacp() {
	local model="${1:-${OPENCODE_GACP_MODEL:-opencode-go/deepseek-v4-flash}}"
	local diff msg prompt

	git add -A || return 1
	diff=$(git diff --cached) || return 1
	[ -z "$diff" ] && { echo "No changes to commit."; return 0; }

	prompt="Draft a concise conventional commit message (1 sentence) for the git diff below. Focus on WHY the change was made, not a mechanical summary of WHAT changed. Use conventional commit format (type(scope): description). Lowercase, no trailing period, no quotes, no markdown, no explanation. Just the commit message.\n\n${diff}"
	msg=$(opencode run -m "$model" --dangerously-skip-permissions "${prompt}" 2>/dev/null | tail -1)
	msg=$(echo "$msg" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//;/^$/d')

	[ -z "$msg" ] && { echo "Failed to generate commit message."; return 1; }
	echo "→ $msg"
	git commit -m "$msg" && git push
}
