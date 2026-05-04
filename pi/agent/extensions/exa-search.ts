/**
 * Exa Web Search Extension
 *
 * Adds a `web_search` tool that lets the LLM search the web via Exa's
 * public MCP endpoint (no API key required).
 *
 * If you have an Exa API key, you can set it for a richer search experience
 * (structured results with titles/URLs/snippets) via:
 *   /exa-key YOUR_KEY   (persisted to ~/.pi/agent/exa-key)
 *   or set EXA_API_KEY env var
 *
 * Without a key, it uses the free public MCP endpoint (returns raw text).
 *
 * Commands:
 *   /exa-key <key>    Set or show your Exa API key
 *   /exa-key          Show current key status (obfuscated)
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "typebox";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { existsSync } from "node:fs";

const KEY_FILE = join(homedir(), ".pi", "agent", "exa-key");
const EXA_MCP_URL = "https://mcp.exa.ai/mcp";
const EXA_API_URL = "https://api.exa.ai";

// ---------------------------------------------------------------------------
// Key management
// ---------------------------------------------------------------------------

async function loadKey(): Promise<string | null> {
  const envKey = process.env.EXA_API_KEY;
  if (envKey) return envKey;
  try {
    if (existsSync(KEY_FILE)) {
      return (await readFile(KEY_FILE, "utf-8")).trim() || null;
    }
  } catch {
    /* ignore */
  }
  return null;
}

async function saveKey(key: string): Promise<void> {
  const dir = join(homedir(), ".pi", "agent");
  if (!existsSync(dir)) await mkdir(dir, { recursive: true });
  await writeFile(KEY_FILE, key.trim(), "utf-8");
}

// ---------------------------------------------------------------------------
// Exa MCP (free, no key needed)
// ---------------------------------------------------------------------------

interface McpSearchArgs {
  query: string;
  type: "keyword" | "neural" | "auto";
  numResults: number;
  livecrawl: "always" | "fallback" | "never";
  contextMaxCharacters: number;
}

async function mcpSearch(
  args: McpSearchArgs,
  signal?: AbortSignal,
): Promise<{ text: string; results: Array<{ title: string; url: string }> }> {
  const response = await fetch(EXA_MCP_URL, {
    method: "POST",
    headers: {
      accept: "application/json, text/event-stream",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name: "web_search_exa",
        arguments: args,
      },
    }),
    signal,
  });

  if (!response.ok) {
    throw new Error(`Exa MCP error (HTTP ${response.status})`);
  }

  const body = await response.text();
  const results: Array<{ title: string; url: string }> = [];
  let fullText = "";

  for (const line of body.split("\n")) {
    if (!line.startsWith("data: ")) continue;
    const payload = JSON.parse(line.slice(6));
    const content = payload?.result?.content ?? [];

    for (const item of content) {
      if (item.type === "text" && item.text?.trim()) {
        fullText += item.text + "\n\n";
      }
      // Some MCP responses include resource references with metadata
      if (item.type === "resource" && item.resource) {
        const r = item.resource;
        if (r.title || r.uri) {
          results.push({ title: r.title ?? "", url: r.uri ?? "" });
        }
      }
    }
  }

  // Parse source links from text like "Source 1\nhttps://..."
  const sourceRegex = /Source \d+\n(https?:\/\/[^\s\n]+)/g;
  let match;
  while ((match = sourceRegex.exec(fullText)) !== null) {
    const url = match[1].trim();
    if (url && !results.some((r) => r.url === url)) {
      results.push({ title: extractTitleFromText(fullText, url), url });
    }
  }

  return { text: fullText.trim(), results };
}

function extractTitleFromText(text: string, url: string): string {
  // Try to find a title near the URL mention
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(url) && i > 0) {
      return lines[i - 1].replace(/^Source \d+\n?/, "").trim();
    }
  }
  return "";
}

// ---------------------------------------------------------------------------
// Exa REST API (requires key)
// ---------------------------------------------------------------------------

interface ExaResult {
  title: string;
  url: string;
  text?: string;
  score?: number;
  publishedDate?: string;
  author?: string;
}

async function apiSearch(
  query: string,
  numResults: number,
  type: "keyword" | "neural" | "auto",
  apiKey: string,
  signal?: AbortSignal,
): Promise<{ text: string; results: ExaResult[] }> {
  const res = await fetch(`${EXA_API_URL}/search`, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, numResults: Math.min(numResults, 20), type }),
    signal,
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Exa API error (${res.status}): ${body}`);
  }

  const data = (await res.json()) as {
    results: ExaResult[];
    autopromptString?: string;
  };

  // Fetch full contents for more detail
  const urls = data.results.map((r) => r.url).filter(Boolean);
  let contentsMap = new Map<string, string>();

  if (urls.length > 0) {
    try {
      const contentsRes = await fetch(`${EXA_API_URL}/contents`, {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ urls, text: true }),
        signal,
      });
      if (contentsRes.ok) {
        const contentsData = (await contentsRes.json()) as {
          results: Array<{ url: string; text: string }>;
        };
        for (const r of contentsData.results) {
          contentsMap.set(r.url, r.text);
        }
      }
    } catch {
      // contents fetch is optional; fall back to snippets
    }
  }

  const formatted = data.results.map((r, i) => {
    const full = r.text ?? contentsMap.get(r.url) ?? "";
    const snippet = full.slice(0, 3000);
    const parts = [
      `## ${i + 1}. [${r.title}](${r.url})`,
      r.publishedDate ? `Published: ${r.publishedDate}` : "",
      r.author ? `Author: ${r.author}` : "",
      "",
      snippet,
    ];
    return parts.filter(Boolean).join("\n");
  });

  return {
    text: [
      `Found ${data.results.length} result(s)`,
      data.autopromptString
        ? `\nRefined query: "${data.autopromptString}"\n`
        : "",
      "",
      ...formatted,
    ].join("\n"),
    results: data.results,
  };
}

// ---------------------------------------------------------------------------
// Extension
// ---------------------------------------------------------------------------

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "web_search",
    label: "Web Search",
    description:
      "Search the internet using Exa. Returns relevant information from the web " +
      "with source URLs. Use when you need current or external information.",
    promptSnippet: "Search the web for recent or specific information",
    promptGuidelines: [
      "Use web_search when you need current events, docs, or info outside your training data.",
      'Set getFullText=true when you want full page content (slower but more complete). With an API key set, getFullText fetches full page contents. Without a key, the MCP endpoint always returns some text for each result.',
    ],
    parameters: Type.Object({
      query: Type.String({
        description:
          "Search query. Use natural language questions or keywords for best results.",
      }),
      numResults: Type.Optional(
        Type.Number({
          description: "Number of results to return (1-20, default: 5)",
        }),
      ),
      type: Type.Optional(
        Type.String({
          description: "Search type: 'keyword', 'neural', or 'auto' (default: 'auto')",
        }),
      ),
    }),
    async execute(_toolCallId, params, signal, _onUpdate, _ctx) {
      const query = params.query;
      const numResults = Math.min(Math.max(1, params.numResults ?? 5), 20);
      const type = (params.type ?? "auto") as "keyword" | "neural" | "auto";
      const apiKey = await loadKey();

      try {
        if (apiKey) {
          const result = await apiSearch(query, numResults, type, apiKey, signal);
          return {
            content: [{ type: "text", text: result.text }],
            details: { query, count: result.results.length, mode: "api" },
          };
        }

        // Free MCP endpoint — no key needed
        const result = await mcpSearch(
          {
            query,
            type,
            numResults,
            livecrawl: "fallback",
            contextMaxCharacters: 3500,
          },
          signal,
        );

        return {
          content: [{ type: "text", text: result.text }],
          details: { query, count: result.results.length, mode: "mcp" },
        };
      } catch (err) {
        return {
          content: [
            {
              type: "text",
              text: `Search failed: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
          isError: true,
          details: { error: String(err) },
        };
      }
    },
  });

  // /exa-key command
  pi.registerCommand("exa-key", {
    description: "Set or show your Exa API key (optional — free MCP works without it)",
    handler: async (args, ctx) => {
      if (args && args.trim()) {
        await saveKey(args.trim());
        ctx.ui.notify("Exa API key saved to ~/.pi/agent/exa-key", "success");
      } else {
        const key = await loadKey();
        if (key) {
          ctx.ui.notify(
            `Exa API key: ${key.slice(0, 4)}…${key.slice(-4)}`,
            "info",
          );
        } else {
          ctx.ui.notify(
            "No Exa API key set. Free MCP search is active. " +
              "Set a key with /exa-key <key> for richer results (get one at https://dashboard.exa.ai)",
            "info",
          );
        }
      }
    },
  });
}
