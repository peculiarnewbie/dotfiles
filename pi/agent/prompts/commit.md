---
description: Generate a git commit message from staged changes. Runs git diff --cached and writes a subject+body commit message.
argument-hint: "[context]"
---

Read the staged changes using `git diff --cached` (and `git diff --cached --stat` for a summary), then write a concise git commit message.

Rules:
- Subject must be imperative, <= 72 chars, no trailing period
- Body can be empty string or short bullet points
- Capture the primary user-visible or developer-visible change
- Use conventional commit format (feat:, fix:, refactor:, chore:, docs:, etc.)

Return a JSON object with keys: subject, body.

$@
