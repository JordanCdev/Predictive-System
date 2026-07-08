/**
 * The chat client — a client-orchestrated tool loop over the Claude Messages API.
 *
 * The deterministic engine runs in the browser, so the tool loop is orchestrated
 * here: we stream a turn from Claude; if it asks for a tool we execute that tool
 * LOCALLY against the engine and stream the next turn with the result appended;
 * we repeat until Claude stops asking (ROADMAP §C2). The model narrates; it never
 * computes.
 *
 * Two transports, same body:
 *   - proxy   — POST to a serverless relay that holds ANTHROPIC_API_KEY server-side
 *               (nothing but chat text + engine tool-results transits the network).
 *   - BYOK    — POST straight to api.anthropic.com with the user's own key.
 *
 * This module is dynamically imported the first time chat is used, so none of the
 * AI code (or its prompt/tool tables) touches the base bundle or the offline path.
 */

import { AI_TOOLS, AiToolContext, executeTool } from "./tools.ts";
import { AI_SYSTEM_PROMPT, subjectContextBlock } from "./systemPrompt.ts";

export const DEFAULT_MODEL = "claude-sonnet-5";
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const MAX_TOOL_ROUNDS = 8;

export type ContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: unknown }
  | { type: "tool_result"; tool_use_id: string; content: string };

export interface ChatMessage {
  role: "user" | "assistant";
  content: string | ContentBlock[];
}

export interface ChatSettings {
  model: string;
  /** BYOK — the user's own Anthropic key (stored only in their browser). */
  apiKey?: string;
  /** Serverless relay URL; when set, the key lives server-side and no apiKey is needed. */
  proxyUrl?: string;
  maxTokens?: number;
}

export interface ChatEvents {
  onTextDelta?(text: string): void;
  onToolStart?(name: string, input: unknown): void;
  onToolDone?(name: string, result: unknown): void;
}

export function chatConfigured(s: ChatSettings): boolean {
  return Boolean(s.proxyUrl || s.apiKey);
}

/** Run one user turn to completion (through any number of tool round-trips) and
 *  return the full updated message history including the assistant's reply. */
export async function runChat(
  prior: ChatMessage[],
  userText: string,
  settings: ChatSettings,
  ctx: AiToolContext,
  events: ChatEvents = {},
  signal?: AbortSignal,
): Promise<ChatMessage[]> {
  if (!chatConfigured(settings)) throw new Error("Chat is not configured. Add an Anthropic key or a proxy URL.");

  const dm = ctx.chart.dayMaster;
  const system =
    AI_SYSTEM_PROMPT +
    "\n\n" +
    subjectContextBlock({
      dayMaster: `${dm.dayMaster.hanzi} (${dm.dayMaster.phase})`,
      strength: dm.strength,
      favourableElements: dm.favorableElements,
      unfavourableElements: dm.unfavorableElements,
      todayIso: ctx.todayIso,
    });

  const messages: ChatMessage[] = [...prior, { role: "user", content: userText }];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const assistant = await streamOnce(
      { model: settings.model, max_tokens: settings.maxTokens ?? 1024, system, tools: AI_TOOLS, messages, stream: true },
      settings,
      events,
      signal,
    );
    messages.push({ role: "assistant", content: assistant.content });

    if (assistant.stopReason !== "tool_use") {
      if (assistant.stopReason === "refusal" && !assistant.content.some((b) => b.type === "text" && b.text)) {
        events.onTextDelta?.("I can't help with that one — I only explain this chart-and-almanac timing engine. Ask me about your best days, your chart, or a year's outlook.");
      }
      break;
    }

    const toolResults: ContentBlock[] = [];
    for (const block of assistant.content) {
      if (block.type !== "tool_use") continue;
      events.onToolStart?.(block.name, block.input);
      const result = executeTool(block.name, block.input, ctx);
      events.onToolDone?.(block.name, result);
      toolResults.push({ type: "tool_result", tool_use_id: block.id, content: JSON.stringify(result) });
    }
    messages.push({ role: "user", content: toolResults });
  }

  return messages;
}

// ── one streamed assistant turn ──────────────────────────────────────────────

interface StreamedTurn {
  content: ContentBlock[];
  stopReason: string | null;
}

async function streamOnce(body: unknown, settings: ChatSettings, events: ChatEvents, signal?: AbortSignal): Promise<StreamedTurn> {
  const url = settings.proxyUrl || ANTHROPIC_URL;
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (!settings.proxyUrl) {
    if (!settings.apiKey) throw new Error("No Anthropic key configured.");
    headers["x-api-key"] = settings.apiKey;
    headers["anthropic-version"] = ANTHROPIC_VERSION;
    headers["anthropic-dangerous-direct-browser-access"] = "true";
  }

  const res = await fetch(url, { method: "POST", headers, body: JSON.stringify(body), signal });
  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => "");
    throw new Error(friendlyHttpError(res.status, detail));
  }

  // Accumulate content blocks by index as SSE events arrive.
  const blocks: ContentBlock[] = [];
  const toolJson: Record<number, string> = {};
  let stopReason: string | null = null;

  await readSse(res.body, (event, data) => {
    if (event === "content_block_start") {
      const cb = data.content_block;
      if (cb.type === "text") blocks[data.index] = { type: "text", text: "" };
      else if (cb.type === "tool_use") {
        blocks[data.index] = { type: "tool_use", id: cb.id, name: cb.name, input: {} };
        toolJson[data.index] = "";
      }
    } else if (event === "content_block_delta") {
      const d = data.delta;
      const b = blocks[data.index];
      if (d.type === "text_delta" && b && b.type === "text") {
        b.text += d.text;
        events.onTextDelta?.(d.text);
      } else if (d.type === "input_json_delta") {
        toolJson[data.index] = (toolJson[data.index] ?? "") + d.partial_json;
      }
    } else if (event === "content_block_stop") {
      const b = blocks[data.index];
      if (b && b.type === "tool_use") {
        const raw = toolJson[data.index] ?? "";
        try {
          b.input = raw ? JSON.parse(raw) : {};
        } catch {
          b.input = {};
        }
      }
    } else if (event === "message_delta") {
      if (data.delta?.stop_reason) stopReason = data.delta.stop_reason;
    } else if (event === "error") {
      throw new Error(data.error?.message || "The chat service returned an error.");
    }
  });

  return { content: blocks.filter(Boolean), stopReason };
}

/** Parse an SSE stream, invoking `onEvent(eventName, jsonData)` per event. */
async function readSse(stream: ReadableStream<Uint8Array>, onEvent: (event: string, data: any) => void): Promise<void> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let sep: number;
    // SSE events are separated by a blank line.
    while ((sep = buffer.indexOf("\n\n")) !== -1) {
      const chunk = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      let event = "message";
      const dataLines: string[] = [];
      for (const line of chunk.split("\n")) {
        if (line.startsWith("event:")) event = line.slice(6).trim();
        else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
      }
      if (dataLines.length === 0) continue;
      const dataStr = dataLines.join("\n");
      if (dataStr === "[DONE]") continue;
      try {
        onEvent(event, JSON.parse(dataStr));
      } catch {
        /* ignore keep-alives / unparseable pings */
      }
    }
  }
}

function friendlyHttpError(status: number, detail: string): string {
  if (status === 401) return "Your Anthropic key was rejected (401). Check the key and try again.";
  if (status === 403) return "Access denied (403). This key can't use the Messages API.";
  if (status === 429) return "Rate limited by Anthropic (429). Wait a moment and retry.";
  if (status === 529) return "Anthropic is overloaded (529). Please retry shortly.";
  let msg = "";
  try {
    msg = JSON.parse(detail)?.error?.message ?? "";
  } catch {
    /* detail wasn't JSON */
  }
  return `Chat request failed (${status})${msg ? `: ${msg}` : ""}.`;
}
