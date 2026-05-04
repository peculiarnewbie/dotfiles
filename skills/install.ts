#!/usr/bin/env npx tsx
/**
 * install.ts — Install all skills from manifest.json
 *
 * Reads ~/git/dotfiles/skills/manifest.json and runs `npx skills add`
 * for each skill that isn't already installed.
 *
 * Usage:
 *   npx tsx install.ts            # install all missing skills
 *   npx tsx install.ts --force    # reinstall everything
 */

import { execSync } from "child_process";
import { readFileSync } from "fs";
import { homedir } from "os";
import { join, resolve } from "path";

// Resolve manifest relative to this script's location
const manifestPath = resolve(import.meta.dirname!, "manifest.json");

interface Manifest {
  skills: string[];
}

interface InstalledSkill {
  name: string;
  path: string;
  scope: "global" | "project";
  agents: string[];
}

function getInstalledSkills(): InstalledSkill[] {
  try {
    const output = execSync("npx skills list --json", {
      encoding: "utf-8",
      timeout: 15_000,
    });
    return JSON.parse(output);
  } catch {
    console.warn("⚠️  Could not get installed skills list");
    return [];
  }
}

function installSkill(source: string): void {
  console.log(`  📦 Installing: ${source}`);
  try {
    execSync(`npx skills add "${source}" -g -y`, {
      stdio: "inherit",
      timeout: 60_000,
    });
    console.log(`  ✅ Installed: ${source}`);
  } catch (err) {
    console.error(`  ❌ Failed: ${source}`, (err as Error).message);
  }
}

// ── Main ────────────────────────────────────────────────────────
const manifest: Manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
const installed = getInstalledSkills();
const installedNames = new Set(installed.map((s) => s.name.toLowerCase()));
const force = process.argv.includes("--force");

console.log(`📋 Manifest: ${manifestPath}`);
console.log(`📦 ${manifest.skills.length} skills in manifest\n`);

let installedCount = 0;
let skippedCount = 0;
let failedCount = 0;

for (const source of manifest.skills) {
  // Extract skill name from the source path
  const name = source.split("/").pop()?.toLowerCase() ?? source;

  if (!force && installedNames.has(name)) {
    console.log(`  ⏭️  ${name} — already installed`);
    skippedCount++;
    continue;
  }

  installSkill(source);
  installedCount++;
}

console.log(
  `\n✨ Done: ${installedCount} installed, ${skippedCount} skipped, ${failedCount} failed`
);
