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

const BASE_URL = "https://crof.ai/v2";
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
      // Fix follow-up crashes when assistant messages mix thinking and text
      // See: https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/CHANGELOG.md
      compat.requiresThinkingAsText = true;
    }

    const reasoning = hasCustomReasoning || supportsReasoningEffort;

    // Only Kimi and Qwen models support images
    const supportsImages = model.id.startsWith("kimi") || model.id.startsWith("qwen");

    return {
      id: model.id,
      name: model.name ?? model.id,
      reasoning,
      // CrofAI advertises reasoning_effort for Kimi Lightning, but the API
      // currently returns a 500 for reasoning_effort: "none". Hide thinking-off
      // levels in pi and clamp them in before_provider_request as a fallback.
      ...(supportsReasoningEffort
        ? {
            thinkingLevelMap: {
              off: null,
              minimal: null,
              low: "low",
              medium: "medium",
              high: "high",
              xhigh: "high",
            },
          }
        : {}),
      input: supportsImages ? (["text", "image"] as ("text" | "image")[]) : (["text"] as ("text" | "image")[]),
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
      supportsReasoningEffort: true,
      supportsUsageInStreaming: false,
      requiresThinkingAsText: true,
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

  // ── Fix: flatten assistant message content to plain strings ───
  pi.on("before_provider_request", (event, _ctx) => {
    if (event.payload.model?.includes("kimi")) {
      // CrofAI's web UI sends plain string message content. Pi/OpenAI can
      // produce text content arrays (and, with requiresThinkingAsText, replay
      // assistant thinking as the first text part). Normalize text-only arrays
      // to strings and keep only the assistant's final visible text.
      for (const msg of event.payload.messages || []) {
        if (Array.isArray(msg.content)) {
          const textParts = msg.content
            .filter((c: any) => c.type === "text" && typeof c.text === "string")
            .map((c: any) => c.text);

          if (textParts.length === msg.content.length) {
            msg.content = msg.role === "assistant"
              ? (textParts[textParts.length - 1] ?? "")
              : textParts.join("");
          }
        }
      }
      // CrofAI Kimi Lightning currently returns an empty SSE response when the
      // request includes a tools field and prior assistant history. The web UI
      // does not send tools, and omitting tools makes follow-up turns work.
      if (
        event.payload.model === "kimi-k2.5-lightning" &&
        (event.payload.messages || []).some((msg: any) => msg.role === "assistant")
      ) {
        delete event.payload.tools;
        delete event.payload.tool_choice;
      }

      // CrofAI Kimi currently 500s when reasoning_effort is "none".
      // pi can emit "none" when thinking is disabled, so clamp unsupported
      // off/minimal values to the lowest value CrofAI accepts.
      if (
        !event.payload.reasoning_effort ||
        event.payload.reasoning_effort === "none" ||
        event.payload.reasoning_effort === "minimal"
      ) {
        event.payload.reasoning_effort = "low";
      }
    }
  });

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
