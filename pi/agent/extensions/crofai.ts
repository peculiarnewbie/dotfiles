import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

export default async function (pi: ExtensionAPI) {
  const baseUrl = "https://crof.ai/v1";

  // Fetch available models from CrofAI
  const response = await fetch(`${baseUrl}/models`);
  const payload = (await response.json()) as {
    data: Array<{
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
    }>;
  };

  // Determine thinking format from model family
  const getThinkingFormat = (id: string): string | undefined => {
    if (id.startsWith("deepseek")) return "deepseek";
    if (id.startsWith("qwen")) return "qwen";
    if (id.startsWith("glm")) return "zai";
    return undefined; // Kimi, Gemma, MiniMax, etc. use default
  };

  const models = payload.data.map((model) => {
    const thinkingFormat = getThinkingFormat(model.id);
    const hasCustomReasoning = model.custom_reasoning === true;
    const supportsReasoningEffort = model.reasoning_effort === true;

    // Convert per-token pricing strings to per-million-tokens numbers
    const cost = {
      input: model.pricing?.prompt ? parseFloat(model.pricing.prompt) * 1_000_000 : 0,
      output: model.pricing?.completion ? parseFloat(model.pricing.completion) * 1_000_000 : 0,
      cacheRead: model.pricing?.cache_prompt ? parseFloat(model.pricing.cache_prompt) * 1_000_000 : 0,
      cacheWrite: 0,
    };

    // Model-level compat: determine reasoning support
    const compat: Record<string, unknown> = {};

    if (thinkingFormat) {
      // Model uses a non-standard reasoning format (DeepSeek, Qwen, Z.AI)
      compat.thinkingFormat = thinkingFormat;
      compat.supportsReasoningEffort = false;
    } else if (supportsReasoningEffort) {
      // Model uses standard OpenAI reasoning_effort
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

  pi.registerProvider("crofai", {
    name: "CrofAI",
    baseUrl,
    apiKey: "CROF_API_KEY",
    api: "openai-completions",
    compat: {
      supportsDeveloperRole: false,
      supportsReasoningEffort: false,
    },
    models,
  });
}
