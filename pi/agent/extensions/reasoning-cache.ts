/**
 * Reasoning Level Cache Extension
 *
 * Caches the last used thinking (reasoning) level per model and restores it
 * automatically when you switch back to that model.
 *
 * Why: You always want "high" on DeepSeek V4 Pro, but "low" on GPT 5.5.
 * This extension remembers that so you don't have to manually switch every time.
 *
 * How it works:
 * - Listens to model changes and thinking level changes
 * - Saves the last thinking level for each model to ~/.pi/agent/reasoning-cache.json
 * - On model switch, restores the cached level if one exists
 * - On thinking level change (via Shift+Tab, /settings, etc.), updates the cache
 *
 * Cache format (JSON):
 *   { "deepseek/deepseek-v4-pro": "high", "openai/gpt-5.5": "low" }
 *
 * No config needed — drop it in ~/.pi/agent/extensions/ and it works.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { getAgentDir } from "@mariozechner/pi-coding-agent";

type ThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh";

interface ReasoningCache {
	[modelKey: string]: ThinkingLevel;
}

export default function (pi: ExtensionAPI) {
	const cachePath = join(getAgentDir(), "reasoning-cache.json");

	// ── In-memory state ──────────────────────────────────────
	let cache: ReasoningCache = {};
	let currentModelKey: string | undefined;
	// Initialized lazily inside event handlers — can't call pi methods during loading.
	let currentLevel: ThinkingLevel = "off";
	/** Prevents re-saving the level when we're the ones who changed it (during restore). */
	let skipNextSave = false;

	// ── Cache I/O ────────────────────────────────────────────
	function loadCache() {
		try {
			if (existsSync(cachePath)) {
				cache = JSON.parse(readFileSync(cachePath, "utf-8"));
			}
		} catch {
			// Corrupted file? Start fresh.
			cache = {};
		}
	}

	function saveCache() {
		try {
			const dir = getAgentDir();
			if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
			writeFileSync(cachePath, JSON.stringify(cache, null, 2), "utf-8");
		} catch {
			// Best-effort persistence
		}
	}

	function modelKey(model: { provider: string; id: string }): string {
		return `${model.provider}/${model.id}`;
	}

	// ── Events ───────────────────────────────────────────────

	// Load cache at startup (filesystem I/O is fine during loading).
	loadCache();

	// Session start: capture current model and restore cached level
	pi.on("session_start", async (_event, ctx) => {
		currentLevel = pi.getThinkingLevel();

		if (ctx.model) {
			currentModelKey = modelKey(ctx.model);

			// Restore cached level for the current model on startup / resume / fork
			const cachedLevel = cache[currentModelKey];
			if (cachedLevel && cachedLevel !== currentLevel) {
				skipNextSave = true;
				pi.setThinkingLevel(cachedLevel);
				currentLevel = cachedLevel;
				ctx.ui.notify(
					`${cachedLevel} reasoning restored for ${ctx.model.provider}/${ctx.model.id}`,
					"info",
				);
			}
		}
	});

	// Model change: save previous model's level, restore cached level for new model
	pi.on("model_select", async (event, ctx) => {
		// Save previous model's thinking level before switching away
		if (event.previousModel) {
			const prevKey = modelKey(event.previousModel);
			cache[prevKey] = currentLevel;
		}

		// Update tracking for the new model
		currentModelKey = modelKey(event.model);
		currentLevel = pi.getThinkingLevel();

		// Restore cached level for the new model if one exists
		const cachedLevel = cache[currentModelKey];
		if (cachedLevel && cachedLevel !== currentLevel) {
			skipNextSave = true;
			pi.setThinkingLevel(cachedLevel);
			currentLevel = cachedLevel;
			ctx.ui.notify(
				`${cachedLevel} reasoning restored for ${event.model.provider}/${event.model.id}`,
				"info",
			);
		}

		saveCache();
	});

	// Thinking level change: cache it for the current model
	pi.on("thinking_level_select", async (event) => {
		currentLevel = event.level;

		// If this change was triggered by our own restore, don't re-save the same value
		if (skipNextSave) {
			skipNextSave = false;
			return;
		}

		// If no model is tracked yet (early startup edge case), skip
		if (!currentModelKey) return;

		// Only save if the level actually changed from what's cached
		if (cache[currentModelKey] !== event.level) {
			cache[currentModelKey] = event.level;
			saveCache();
		}
	});
}
