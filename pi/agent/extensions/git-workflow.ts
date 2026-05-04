/**
 * Git Workflow Extension
 *
 * Interactive commit and push workflow modeled after t3code.
 * Shows changed files, optional commit message (auto-generate via /commit template),
 * and progress during operations.
 *
 * Commands:
 *   /git          – Show git status and actions
 *   /git commit   – Commit staged changes
 *   /git push     – Push current branch
 *   /git status   – Show detailed git status
 *   /gacp         – Stage all, generate message, commit & push (one shot)
 *
 * Model selection for commit message generation:
 *   Set your preferred model with /model before running /gacp.
 *   The current model generates the commit message from the staged diff.
 */

import type { ExtensionAPI, ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import { exec } from "node:child_process";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

/**
 * Spawn a process, write content to stdin, close stdin, and collect stdout.
 * Critical for pi subprocesses: pi's readPipedStdin() hangs when stdin is a
 * pipe that never closes (as with exec/spawn default pipe). By writing content
 * and immediately closing stdin, we signal EOF so pi can proceed.
 */
function spawnWithStdin(
  cmdArgs: string[],
  stdinContent: string,
  cwd: string,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmdArgs[0], cmdArgs.slice(1), {
      cwd,
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env },
      timeout: 120_000,
    });

    let stdout = "";
    let stderr = "";
    let settled = false;

    const settle = (err?: Error) => {
      if (settled) return;
      settled = true;
      if (err) reject(err);
      else resolve(stdout.trim());
    };

    child.stdout.on("data", (data: Buffer) => { stdout += data.toString(); });
    child.stderr.on("data", (data: Buffer) => { stderr += data.toString(); });

    child.on("error", (err) => settle(err));
    child.on("close", (code, signal) => {
      if (code === 0) settle();
      else if (signal) settle(new Error(`Process killed by ${signal}`));
      else settle(new Error(`Process exited with code ${code}\n${stderr.trim()}`));
    });

    // Write prompt to stdin and close it — this signals EOF so pi can proceed
    child.stdin.write(stdinContent);
    child.stdin.end();
  });
}

interface GitStatus {
  isRepo: boolean;
  branch: string | null;
  hasChanges: boolean;
  staged: GitFile[];
  unstaged: GitFile[];
  untracked: string[];
  ahead: number;
  behind: number;
  hasUpstream: boolean;
  isDefaultBranch: boolean;
  hasOrigin: boolean;
}

interface GitFile {
  path: string;
  insertions: number;
  deletions: number;
  status: string;
}

function formatCount(n: number, singular: string, plural: string): string {
  return `${n} ${n === 1 ? singular : plural}`;
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max - 3) + "...";
}

const TOAST_DESCRIPTION_MAX = 72;

/** Async command execution — does NOT block the event loop, so TUI stays live */
async function cmdAsync(cwd: string, ...args: string[]): Promise<string> {
  const fullCmd = args.map((a) => (a.includes(" ") ? `"${a}"` : a)).join(" ");
  try {
    const { stdout } = await execAsync(fullCmd, {
      cwd,
      encoding: "utf-8",
      timeout: 30000,
    });
    return stdout.trim();
  } catch (err: unknown) {
    if (err instanceof Error) {
      const msg = err.message.replace(/^Command failed:[^]*?\n/, "").trim();
      throw new Error(msg || `Command failed: ${fullCmd}`);
    }
    throw new Error(`Command failed: ${fullCmd}`);
  }
}

async function cmdOptAsync(cwd: string, ...args: string[]): Promise<string | null> {
  try {
    return await cmdAsync(cwd, ...args);
  } catch {
    return null;
  }
}

async function getGitStatus(cwd: string): Promise<GitStatus> {
  const isRepoResult = await cmdOptAsync(cwd, "git", "rev-parse", "--is-inside-work-tree");
  if (!isRepoResult || isRepoResult !== "true") {
    return {
      isRepo: false, branch: null, hasChanges: false,
      staged: [], unstaged: [], untracked: [],
      ahead: 0, behind: 0, hasUpstream: false, isDefaultBranch: false, hasOrigin: false,
    };
  }

  const branch = await cmdOptAsync(cwd, "git", "branch", "--show-current") ?? "";
  const stagedOutput = await cmdOptAsync(cwd, "git", "diff", "--cached", "--stat") ?? "";
  const unstagedOutput = await cmdOptAsync(cwd, "git", "diff", "--stat") ?? "";
  const untrackedOutput = await cmdOptAsync(cwd, "git", "ls-files", "--others", "--exclude-standard") ?? "";
  const aheadBehind = await cmdOptAsync(cwd, "git", "rev-list", "--left-right", "--count", "HEAD...@{upstream}") ?? "0\t0";
  const remoteUrl = await cmdOptAsync(cwd, "git", "remote", "get-url", "origin") ?? "";

  const hasOrigin = remoteUrl.length > 0;
  const [a, b] = aheadBehind.split("\t").map((s) => parseInt(s.trim(), 10) || 0);
  const behind = a || 0;
  const ahead = b || 0;
  const hasUpstream = aheadBehind !== "0\t0";

  // Determine default branch
  const defaultBranch = (await cmdOptAsync(cwd, "git", "symbolic-ref", "refs/remotes/origin/HEAD"))
    ?.replace("refs/remotes/origin/", "")
    .trim() ?? "main";

  const isDefaultBranch = branch.trim() === defaultBranch;

  return {
    isRepo: true,
    branch: branch.trim() || null,
    hasChanges: stagedOutput.length > 0 || unstagedOutput.length > 0 || untrackedOutput.length > 0,
    staged: parseDiffStat(stagedOutput),
    unstaged: parseDiffStat(unstagedOutput),
    untracked: untrackedOutput.split("\n").map((s) => s.trim()).filter((s) => s.length > 0),
    ahead, behind, hasUpstream, isDefaultBranch, hasOrigin,
  };
}

function parseDiffStat(output: string): GitFile[] {
  const files: GitFile[] = [];
  for (const line of output.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith(" ") || trimmed.startsWith("Commit") || trimmed.startsWith(" total")) continue;

    const match = /^\s*(.+?)\s*\|\s*(\d+)\s*([+-]+)?\s*$/.exec(trimmed);
    if (match) {
      const changes = match[3] || "";
      const insertions = (changes.match(/\++/g) || []).reduce((sum, s) => sum + s.length, 0);
      const deletions = (changes.match(/-+/g) || []).reduce((sum, s) => sum + s.length, 0);
      files.push({
        path: match[1].trim(),
        insertions,
        deletions,
        status: changes,
      });
    }
  }
  return files;
}

function formatFileList(files: GitFile[], max: number): string {
  if (files.length === 0) return "  (none)";
  const lines = files.slice(0, max).map((f) => {
    const changes: string[] = [];
    if (f.insertions > 0) changes.push(`\x1b[32m+${f.insertions}\x1b[0m`);
    if (f.deletions > 0) changes.push(`\x1b[31m-${f.deletions}\x1b[0m`);
    return `  ${f.path} \x1b[2m(${changes.join(" ")})\x1b[0m`;
  });
  if (files.length > max) {
    lines.push(`  \x1b[2m... and ${files.length - max} more\x1b[0m`);
  }
  return lines.join("\n");
}

function formatSummary(status: GitStatus): { title: string; description: string; details: string[] } {
  const details: string[] = [];

  if (status.staged.length > 0) {
    details.push(`\x1b[1mStaged changes:\x1b[0m`);
    details.push(formatFileList(status.staged, 10));
  }
  if (status.unstaged.length > 0) {
    details.push(`\x1b[1mUnstaged changes:\x1b[0m`);
    details.push(formatFileList(status.unstaged, 10));
  }
  if (status.untracked.length > 0) {
    details.push(
      `\x1b[1mUntracked files:\x1b[0m ${status.untracked.length} ${status.untracked.length === 1 ? "file" : "files"}`,
    );
  }

  const parts: string[] = [];
  if (status.branch) {
    const branchDisplay = status.isDefaultBranch
      ? `\x1b[33m${status.branch}\x1b[0m (default)`
      : `\x1b[36m${status.branch}\x1b[0m`;
    parts.push(branchDisplay);
  }
  if (status.ahead > 0) parts.push(`\x1b[32m↑${status.ahead}\x1b[0m`);
  if (status.behind > 0) parts.push(`\x1b[31m↓${status.behind}\x1b[0m`);

  const title = parts.length > 0 ? parts.join(" ") : "\x1b[2mnot a git repo\x1b[0m";
  const desc = status.hasChanges
    ? `${formatCount(status.staged.length + status.unstaged.length, "file", "files")} changed`
    : "\x1b[2mworking tree clean\x1b[0m";

  return { title, description: desc, details };
}

export default function (pi: ExtensionAPI) {
  // ─── /git status ─────────────────────────────────────────────────
  async function showGitStatus(ctx: ExtensionCommandContext) {
    const cwd = ctx.cwd;
    const status = await getGitStatus(cwd);

    if (!status.isRepo) {
      const init = await ctx.ui.confirm("Not a git repo", "Initialize a git repository here?");
      if (init) {
        ctx.ui.notify("Initializing git repository...", "info");
        try {
          await cmdAsync(cwd, "git", "init");
          ctx.ui.notify("Git repository initialized", "success");
        } catch (err) {
          ctx.ui.notify(`Failed: ${String(err)}`, "error");
        }
      }
      return;
    }

    const summary = formatSummary(status);
    ctx.ui.notify(
      `${summary.title}\n${summary.description}`,
      status.hasChanges ? "info" : "success",
    );
    ctx.ui.setWidget("git-status", summary.details, { placement: "editor" });
    setTimeout(() => ctx.ui.setWidget("git-status", undefined), 30000);
  }

  // ─── /git commit ──────────────────────────────────────────────────
  async function doCommit(ctx: ExtensionCommandContext, messageArg?: string) {
    const cwd = ctx.cwd;
    const status = await getGitStatus(cwd);

    if (!status.isRepo) {
      ctx.ui.notify("Not a git repository. Initialize with /git status.", "error");
      return;
    }

    if (!status.hasChanges) {
      ctx.ui.notify("No changes to commit", "warning");
      return;
    }

    // Show current state
    if (status.staged.length > 0) {
      ctx.ui.notify(
        `\x1b[1m${status.staged.length} staged file${status.staged.length !== 1 ? "s" : ""}\x1b[0m`,
        "info",
      );
    }
    const unstagedCount = status.unstaged.length + status.untracked.length;
    if (unstagedCount > 0) {
      ctx.ui.notify(
        `\x1b[33m${unstagedCount} unstaged/untracked file${unstagedCount !== 1 ? "s" : ""}\x1b[0m`,
        "warning",
      );
    }

    // Ask to stage unstaged/untracked
    if (unstagedCount > 0) {
      const stageAll = await ctx.ui.confirm(
        "Stage all changes?",
        `${status.unstaged.length} unstaged, ${status.untracked.length} untracked`,
      );
      if (stageAll) {
        ctx.ui.notify("Staging all changes...", "info");
        await cmdAsync(cwd, "git", "add", "-A");
      }
    }

    // Get commit message
    let subject = messageArg?.trim() || "";
    let body = "";

    if (!subject) {
      // Show diff stats
      const updated = await getGitStatus(cwd);
      ctx.ui.setWidget("git-commit", [
        "\x1b[1mChanges to commit:\x1b[0m",
        ...formatSummary(updated).details,
        "",
        "\x1b[2mType a commit message, or leave empty to use /commit template\x1b[0m",
      ]);

      const input = await ctx.ui.input(
        "Commit message",
        "Leave empty to auto-generate with /commit",
      );
      ctx.ui.setWidget("git-commit", undefined);

      if (input === undefined) {
        ctx.ui.notify("Commit cancelled", "info");
        return;
      }
      subject = input?.trim() || "";
    }

    // Execute commit
    try {
      if (!subject) {
        ctx.ui.notify(
          'No message provided. Use /commit template to generate one, then /git commit "your message"',
          "info",
        );
        return;
      }

      const parts = subject.split("\n");
      subject = parts[0].trim();
      body = parts.slice(1).join("\n").trim();

      ctx.ui.setWidget("git-progress", ["\x1b[36mCommitting...\x1b[0m"], { placement: "editor" });
      const msg = body ? `${subject}\n\n${body}` : subject;
      await cmdAsync(cwd, "git", "commit", "-m", msg, "--no-verify");
      const sha = await cmdAsync(cwd, "git", "rev-parse", "--short", "HEAD");
      ctx.ui.setWidget("git-progress", undefined);

      ctx.ui.notify(
        `\x1b[32m✓\x1b[0m Committed ${sha}: ${truncate(subject, TOAST_DESCRIPTION_MAX)}`,
        "success",
      );

      // Offer push
      const updated = await getGitStatus(cwd);
      if (updated.ahead > 0) {
        const shouldPush = await ctx.ui.confirm(
          "Push?",
          `${updated.ahead} commit${updated.ahead !== 1 ? "s" : ""} ahead`,
        );
        if (shouldPush) {
          await doPushInternal(ctx, updated);
        }
      }
    } catch (err) {
      ctx.ui.setWidget("git-progress", undefined);
      ctx.ui.notify(`\x1b[31m✗\x1b[0m Commit failed: ${String(err)}`, "error");
    }
  }

  // ─── /git push (internal) ─────────────────────────────────────────
  async function doPushInternal(ctx: ExtensionCommandContext, status: GitStatus): Promise<boolean> {
    const cwd = ctx.cwd;
    if (!status.branch) return false;

    ctx.ui.setWidget("git-progress", ["\x1b[36mPushing...\x1b[0m"], { placement: "editor" });

    try {
      await cmdAsync(cwd, "git", "push", "origin", status.branch);
    } catch {
      // Try with --set-upstream
      try {
        await cmdAsync(cwd, "git", "push", "--set-upstream", "origin", status.branch);
      } catch (err) {
        ctx.ui.setWidget("git-progress", undefined);
        ctx.ui.notify(`\x1b[31m✗\x1b[0m Push failed: ${String(err)}`, "error");
        return false;
      }
    }

    ctx.ui.setWidget("git-progress", undefined);
    ctx.ui.notify(`\x1b[32m✓\x1b[0m Pushed to \x1b[36m${status.branch}\x1b[0m`, "success");
    return true;
  }

  // ─── /git push ────────────────────────────────────────────────────
  async function doPush(ctx: ExtensionCommandContext) {
    const cwd = ctx.cwd;
    const status = await getGitStatus(cwd);

    if (!status.isRepo || !status.branch) {
      ctx.ui.notify("Cannot push: not on a branch or not a git repo", "error");
      return;
    }

    if (status.behind > 0) {
      ctx.ui.notify(
        `Branch is ${status.behind} commit${status.behind !== 1 ? "s" : ""} behind. Pull/rebase first.`,
        "warning",
      );
      const shouldPull = await ctx.ui.confirm("Pull first?", "Pull/rebase before pushing?");
      if (shouldPull) {
        try {
          ctx.ui.setWidget("git-progress", ["\x1b[36mPulling latest changes...\x1b[0m"], { placement: "editor" });
          await cmdAsync(cwd, "git", "pull", "--rebase");
          ctx.ui.setWidget("git-progress", undefined);
          ctx.ui.notify("\x1b[32m✓\x1b[0m Pulled latest changes", "success");
        } catch (err) {
          ctx.ui.setWidget("git-progress", undefined);
          ctx.ui.notify(`Pull failed: ${String(err)}`, "error");
          return;
        }
      } else {
        return;
      }
    }

    await doPushInternal(ctx, status);
  }

  // ─── /git (main command) ──────────────────────────────────────────
  pi.registerCommand("git", {
    description: "Git workflow: commit, push, status. Uses current model for message generation.",
    handler: async (args, ctx) => {
      const subcommand = args.trim().split(/\s+/)[0]?.toLowerCase() || "";
      const rest = args.trim().slice(subcommand.length).trim();

      switch (subcommand) {
        case "commit":
          await doCommit(ctx, rest);
          break;
        case "push":
          await doPush(ctx);
          break;
        case "status":
        case "st":
          await showGitStatus(ctx);
          break;
        default: {
          // Show menu
          const cwd = ctx.cwd;
          const status = await getGitStatus(cwd);
          const summary = formatSummary(status);

          ctx.ui.setWidget("git-overview", [
            `\x1b[1mGit Status\x1b[0m`,
            `Branch: ${summary.title}`,
            `Status: ${summary.description}`,
            ...summary.details,
            "",
            "\x1b[2mCommands:\x1b[0m",
            "  \x1b[36m/git commit\x1b[0m  \x1b[2m- Stage & commit changes\x1b[0m",
            "  \x1b[36m/git push\x1b[0m    \x1b[2m- Push to remote\x1b[0m",
            "  \x1b[36m/git status\x1b[0m  \x1b[2m- Show status\x1b[0m",
            "  \x1b[36m/commit\x1b[0m      \x1b[2m- Auto-generate commit message (uses current model)\x1b[0m",
            "  \x1b[36m/gacp\x1b[0m        \x1b[2m- Stage all, generate message, commit & push (one shot)\x1b[0m",
          ], { placement: "editor" });

          setTimeout(() => ctx.ui.setWidget("git-overview", undefined), 60000);

          if (!status.isRepo) {
            ctx.ui.notify("Not a git repository", "warning");
            return;
          }

          const actions = [
            { label: "Commit changes", value: "commit", disabled: !status.hasChanges },
            { label: "Push to remote", value: "push", disabled: !status.branch || status.ahead === 0 },
            { label: "Show status", value: "status" },
          ];

          const selection = await ctx.ui.select("Git action:", actions);
          if (!selection) return;

          switch (selection) {
            case "commit": await doCommit(ctx); break;
            case "push": await doPush(ctx); break;
            case "status": await showGitStatus(ctx); break;
          }
        }
      }
    },
  });

  // ─── /gacp (git add, commit, push) ─────────────────────────────────
  //
  // One-shot command modeled after t3code's commit+push action:
  //   1. Stage all changes
  //   2. Spawn a sub `pi -p` process with ONLY the commit message prompt
  //      (no thread context — token-efficient, clean model call)
  //   3. Parse the JSON commit message from stdout
  //   4. Programmatically commit and push
  //
  // Model selection: reads defaultModel from settings, or pass --model <id>
  //   /gacp                          — uses default model
  //   /gacp --model crofai/kimi-k2.5 — uses specific model
  //
  // NOTE: Pi's readPipedStdin() blocks when spawned from Node (stdin is a
  // pipe, not a TTY). Using @file to pass the prompt causes a hang because
  // the pipe never closes. Instead, we pipe the prompt to stdin and close
  // it, and do NOT use @file at all.
  //
  function resolveModel(args: string): string | null {
    const modelMatch = args.match(/--model\s+(\S+)/);
    if (modelMatch) return modelMatch[1];

    // Read default model from settings
    try {
      const { readFileSync } = require("node:fs");
      const settingsPath = require("node:path").join(
        require("node:os").homedir(),
        ".pi",
        "agent",
        "settings.json",
      );
      const settings = JSON.parse(readFileSync(settingsPath, "utf-8"));
      const provider = settings.defaultProvider;
      const model = settings.defaultModel;
      if (provider && model) {
        return `${provider}/${model}`;
      }
      if (model) return model;
    } catch {}
    return null;
  }

  function parseCommitJson(text: string): { subject: string; body: string } | null {
    // Try to find { ... } JSON in the output (handle thinking blocks, markdown, etc.)
    const jsonMatch = text.match(/\{[^]*?\}/);
    if (!jsonMatch) return null;
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      if (parsed.subject && typeof parsed.subject === "string") {
        return {
          subject: parsed.subject.trim(),
          body: (parsed.body || "").trim(),
        };
      }
    } catch {}
    return null;
  }

  pi.registerCommand("gacp", {
    description:
      "Stage all changes, generate commit message (fresh model call via sub-pi), commit, and push",
    handler: async (args, ctx) => {
      const cwd = ctx.cwd;
      const status = await getGitStatus(cwd);

      if (!status.isRepo) {
        ctx.ui.notify("Not a git repository", "error");
        return;
      }

      if (!status.hasChanges) {
        ctx.ui.notify("No changes to stage or commit", "warning");
        return;
      }

      if (!status.branch) {
        ctx.ui.notify("Cannot commit from detached HEAD. Checkout a branch first.", "error");
        return;
      }

      // 1. Stage everything — fast, but we show the widget anyway for async consistency
      ctx.ui.setWidget("gacp-progress", ["\x1b[36mStaging all changes...\x1b[0m"], {
        placement: "editor",
      });
      await cmdAsync(cwd, "git", "add", "-A");

      // 2. Get staged diff context
      ctx.ui.setWidget("gacp-progress", ["\x1b[36mGathering diff context...\x1b[0m"], {
        placement: "editor",
      });
      const stagedStat = await cmdAsync(cwd, "git", "diff", "--cached", "--stat");
      const stagedPatch = (await cmdAsync(cwd, "git", "diff", "--cached")).slice(0, 8000);

      // 3. Build prompt
      const prompt = [
        "You write concise git commit messages.",
        "Return a JSON object with keys: subject, body.",
        "Do NOT include any markdown, explanation, or other text. Only raw JSON.",
        "Rules:",
        "- subject must be imperative, <= 72 chars, and no trailing period",
        "- body can be empty string or short bullet points",
        "- capture the primary user-visible or developer-visible change",
        "",
        `Branch: ${status.branch}`,
        "",
        "Staged files:",
        stagedStat,
        "",
        "Staged patch:",
        stagedPatch,
      ].join("\n");

      // 4. Resolve model
      const modelArg = resolveModel(args);
      const modelFlags = modelArg ? ["--model", modelArg] : [];

      ctx.ui.notify(
        `\x1b[36m⟳\x1b[0m Generating commit message${modelArg ? ` (${modelArg})` : ""}...`,
        "info",
      );

      // 5. Spawn sub-pi in print mode, piping prompt to stdin
      //    (NOT using @file — see note above about stdin pipe hang)
      ctx.ui.setWidget("gacp-progress", ["\x1b[36mCalling model for commit message...\x1b[0m"], {
        placement: "editor",
      });

      let piOutput: string;
      try {
        const piArgs = [
          "pi",
          "-p",
          "--no-extensions",
          "--no-skills",
          "--no-prompt-templates",
          "--no-themes",
          "--no-context-files",
          "--no-session",
          ...modelFlags,
        ];
        // Use spawn so we can pipe the prompt to stdin and close it.
        // execAsync uses exec() which inherits the parent's stdin pipe,
        // causing readPipedStdin() in pi to hang waiting for EOF.
        piOutput = await spawnWithStdin(piArgs, prompt, cwd);
      } catch (err: unknown) {
        ctx.ui.setWidget("gacp-progress", undefined);
        const errMsg = err instanceof Error ? err.message : String(err);
        ctx.ui.notify(`\x1b[31m✗\x1b[0m Model call failed: ${truncate(errMsg, 200)}`, "error");
        return;
      }

      ctx.ui.setWidget("gacp-progress", undefined);

      // 6. Parse JSON from output
      const commitMsg = parseCommitJson(piOutput);
      if (!commitMsg) {
        ctx.ui.notify(
          `\x1b[31m✗\x1b[0m Could not parse commit message from model output. Raw output:\n${truncate(piOutput, 500)}`,
          "error",
        );
        return;
      }

      const { subject, body } = commitMsg;

      // 7. Commit
      ctx.ui.setWidget("gacp-progress", ["\x1b[36mCommitting...\x1b[0m"], {
        placement: "editor",
      });
      try {
        const msg = body ? `${subject}\n\n${body}` : subject;
        await cmdAsync(cwd, "git", "commit", "-m", msg, "--no-verify");
        const sha = await cmdAsync(cwd, "git", "rev-parse", "--short", "HEAD");
        ctx.ui.setWidget("gacp-progress", undefined);
        ctx.ui.notify(
          `\x1b[32m✓\x1b[0m Committed ${sha}: ${truncate(subject, TOAST_DESCRIPTION_MAX)}`,
          "success",
        );
      } catch (err) {
        ctx.ui.setWidget("gacp-progress", undefined);
        ctx.ui.notify(`\x1b[31m✗\x1b[0m Commit failed: ${String(err)}`, "error");
        return;
      }

      // 8. Push
      ctx.ui.setWidget("gacp-progress", ["\x1b[36mPushing...\x1b[0m"], { placement: "editor" });
      try {
        await cmdAsync(cwd, "git", "push", "origin", status.branch!);
      } catch {
        // Try with --set-upstream
        try {
          await cmdAsync(cwd, "git", "push", "--set-upstream", "origin", status.branch!);
        } catch (err) {
          ctx.ui.setWidget("gacp-progress", undefined);
          ctx.ui.notify(
            `\x1b[33m⚠\x1b[0m Commit succeeded but push failed: ${truncate(String(err), 200)}`,
            "warning",
          );
          return;
        }
      }
      ctx.ui.setWidget("gacp-progress", undefined);
      ctx.ui.notify(`\x1b[32m✓\x1b[0m Pushed to \x1b[36m${status.branch}\x1b[0m`, "success");
    },
  });

  // ─── Session start: notify about git status ──────────────────────
  pi.on("session_start", async (_event, ctx) => {
    try {
      const status = await getGitStatus(ctx.cwd);
      if (status.isRepo && status.hasChanges) {
        const stagedCount = status.staged.length;
        const unstagedCount = status.unstaged.length + status.untracked.length;
        const parts: string[] = [];
        if (stagedCount > 0) parts.push(`\x1b[32m${stagedCount} staged\x1b[0m`);
        if (unstagedCount > 0) parts.push(`\x1b[33m${unstagedCount} unstaged\x1b[0m`);
        const branch = status.branch ? `\x1b[36m${status.branch}\x1b[0m` : "";
        ctx.ui.notify(`[git] ${branch} ${parts.join(", ")}`, "info");
      }
    } catch {
      // Not all dirs are git repos
    }
  });
}
