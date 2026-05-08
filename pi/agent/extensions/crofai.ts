/**
 * CrofAI Provider Extension
 *
 * Discovers models from CrofAI and registers them as a provider.
 *
 * Startup performance:
 *   - First launch: fetches from API (network latency), caches result to disk
 *   - Subsequent launches: loads from cache instantly (sync file read, ~microseconds)
 *   - Background refresh: fetches fresh models on session_start (does NOT block startup)
 *
 * Cache TTL: 1 hour. Stale cache still serves instantly; refresh happens in background.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { getAgentDir } from "@mariozechner/pi-coding-agent";

type CrofModel = {
  id: string;
  name?: string;
  context_length?: number;
  max_completion_tokens?: number;
  custom_reasoning?: boolean;
  reasoning_effort?: boolean;
  pricing?: {
    prompt?: string;
    completion?: string;
    cache_prompt?: string;
  };
};

interface CrofCache {
  timestamp: number;
  models: CrofModel[];
}

const BASE_URL = "https://crof.ai/v1";
const CACHE_FILE = join(getAgentDir(), "crofai-models.json");
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

// ---------------------------------------------------------------------------
// Model conversion helpers
// ---------------------------------------------------------------------------

function getThinkingFormat(id: string): string | undefined {
  if (id.startsWith("deepseek")) return "deepseek";
  if (id.startsWith("qwen")) return "qwen";
  if (id.startsWith("glm")) return "zai";
  return undefined; // Kimi, Gemma, MiniMax, etc. use default
}

function convertModels(modelsData: CrofModel[]) {
  return modelsData.map((model) => {
    const thinkingFormat = getThinkingFormat(model.id);
    const hasCustomReasoning = model.custom_reasoning === true;
    const supportsReasoningEffort = model.reasoning_effort === true;

    const cost = {
      input: model.pricing?.prompt ? parseFloat(model.pricing.prompt) : 0,
      output: model.pricing?.completion ? parseFloat(model.pricing.completion) : 0,
      cacheRead: model.pricing?.cache_prompt ? parseFloat(model.pricing.cache_prompt) : 0,
      cacheWrite: 0,
    };

    const compat: Record<string, unknown> = {};

    if (thinkingFormat) {
      compat.thinkingFormat = thinkingFormat;
      compat.supportsReasoningEffort = false;
    } else if (supportsReasoningEffort) {
      compat.supportsReasoningEffort = true;
    }

    return {
      id: model.id,
      name: model.name ?? model.id,
      reasoning: hasCustomReasoning || supportsReasoningEffort,
      input: ["text"] as ("text" | "image")[],
      contextWindow: model.context_length ?? 128000,
      maxTokens: model.max_completion_tokens ?? 16384,
      cost,
      ...(Object.keys(compat).length > 0 ? { compat } : {}),
    };
  });
}

function registerProvider(pi: ExtensionAPI, modelsData: CrofModel[]) {
  const models = convertModels(modelsData);

  pi.registerProvider("crofai", {
    name: "CrofAI",
    baseUrl: BASE_URL,
    apiKey: "CROF_API_KEY",
    api: "openai-completions",
    compat: {
      supportsDeveloperRole: false,
      supportsReasoningEffort: false,
    },
    models,
  });
}

// ---------------------------------------------------------------------------
// Disk cache
// ---------------------------------------------------------------------------

function loadCache(): { models: CrofModel[]; needsRefresh: boolean } {
  try {
    if (existsSync(CACHE_FILE)) {
      const cached: CrofCache = JSON.parse(readFileSync(CACHE_FILE, "utf-8"));
      const needsRefresh = Date.now() - cached.timestamp > CACHE_TTL_MS;
      if (cached.models.length > 0) {
        return { models: cached.models, needsRefresh };
      }
    }
  } catch {
    // Corrupted or missing cache
  }
  return { models: [], needsRefresh: true };
}

function saveCache(models: CrofModel[]): void {
  try {
    const dir = getAgentDir();
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(CACHE_FILE, JSON.stringify({ timestamp: Date.now(), models }), "utf-8");
  } catch {
    // Best-effort cache
  }
}

// ---------------------------------------------------------------------------
// Network fetch
// ---------------------------------------------------------------------------

async function fetchModels(): Promise<CrofModel[] | null> {
  try {
    const response = await fetch(`${BASE_URL}/models`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = (await response.json()) as { data: CrofModel[] };
    return payload.data.length > 0 ? payload.data : null;
  } catch (err) {
    console.error(`[crofai] Failed to fetch models: ${err}`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Extension
// ---------------------------------------------------------------------------

export default function (pi: ExtensionAPI) {
  // ── Load from cache instantly ──────────────────────────────────
  const { models: cachedModels, needsRefresh } = loadCache();
  let currentModels = cachedModels;

  if (currentModels.length > 0) {
    registerProvider(pi, currentModels);
  }

  // ── Background refresh on session start ────────────────────────
  pi.on("session_start", async (_event, ctx) => {
    // First launch with no cache: we have to fetch (no models to register otherwise)
    if (currentModels.length === 0) {
      const fresh = await fetchModels();
      if (fresh && fresh.length > 0) {
        saveCache(fresh);
        registerProvider(pi, fresh);
        currentModels = fresh;
        ctx.ui.notify(`CrofAI: ${fresh.length} models loaded`, "info");
      } else {
        console.error("[crofai] No cached or fetched models — provider not registered");
      }
      return;
    }

    // Cache exists but stale: refresh in background
    if (needsRefresh) {
      const fresh = await fetchModels();
      if (fresh && fresh.length > 0) {
        saveCache(fresh);
        currentModels = fresh;
      }
    }
  });
}
