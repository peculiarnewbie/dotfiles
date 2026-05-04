#!/usr/bin/env npx tsx
/**
 * snapshot.ts — Snapshot currently installed skills to the manifest
 *
 * Reads currently installed skills via `npx skills list --json` and
 * writes them to manifest.json. This is useful after you've installed
 * some skills on one machine and want to capture them for the repo.
 *
 * Since `npx skills list` doesn't include the source URL, this outputs
 * suggestions to help you fill in the full source paths.
 *
 * Usage:
 *   npx tsx snapshot.ts                    # print current skills
 *   npx tsx snapshot.ts --write            # write a best-effort manifest
 *   npx tsx snapshot.ts --write --dry-run  # preview what would be written
 */

import { execSync } from "child_process";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { resolve } from "path";

const manifestPath = resolve(import.meta.dirname!, "manifest.json");

interface InstalledSkill {
  name: string;
  path: string;
  scope: "global" | "project";
  agents: string[];
}

interface Manifest {
  skills: string[];
}

function getInstalledSkills(): InstalledSkill[] {
  try {
    const output = execSync("npx skills list --json", {
      encoding: "utf-8",
      timeout: 15_000,
    });
    return JSON.parse(output);
  } catch {
    console.error("⚠️  Could not get installed skills (is `npx skills` available?)");
    return [];
  }
}

// ── Main ────────────────────────────────────────────────────────
const installed = getInstalledSkills();
const shouldWrite = process.argv.includes("--write");
const dryRun = process.argv.includes("--dry-run");

if (installed.length === 0) {
  console.log("📭 No skills currently installed via `npx skills`.");
  process.exit(0);
}

console.log("📦 Currently installed skills:\n");

for (const skill of installed) {
  const scope = skill.scope === "global" ? "🌍 global" : "📁 project";
  console.log(`  ${skill.name}`);
  console.log(`     Path:  ${skill.path}`);
  console.log(`     Scope: ${scope}`);
  console.log(`     Agents: ${skill.agents.join(", ")}`);
  console.log();
}

// Generate a best-effort manifest entry
const suggestedEntries = installed.map((s) => {
  // Best guess: user/repo/skills/name — the user will need to fix these
  return `"https://github.com/your-org/your-repo/tree/main/skills/${s.name}"`;
});

if (shouldWrite) {
  const existing: Manifest = existsSync(manifestPath)
    ? JSON.parse(readFileSync(manifestPath, "utf-8"))
    : { skills: [] };

  // Merge new skills with existing ones (deduplicate)
  const existingNames = new Set(
    existing.skills.map((s) => s.split("/").pop()?.toLowerCase() ?? "")
  );

  for (const skill of installed) {
    if (!existingNames.has(skill.name.toLowerCase())) {
      // Add a placeholder — user must edit the source URL
      existing.skills.push(`your-org/your-repo/skills/${skill.name}`);
    }
  }

  if (dryRun) {
    console.log("📝 Preview of updated manifest:\n");
    console.log(JSON.stringify(existing, null, 2));
  } else {
    writeFileSync(manifestPath, JSON.stringify(existing, null, 2) + "\n");
    console.log(`✅ Wrote ${installed.length} skills to ${manifestPath}`);
    console.log("⚠️  Check the manifest — source URLs are placeholders and need editing!");
  }
} else {
  console.log("💡 Run with --write to save to manifest.json");
  console.log("   (you'll need to edit the source URLs afterward)");
}
