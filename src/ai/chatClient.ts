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
import { AI_SYSTEM_PROMPT, historyContextBlock, subjectContextBlock, turnDateMarker } from "./systemPrompt.ts";

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
  /** When this turn happened — an ISO instant or a plain YYYY-MM-DD. LOCAL ONLY:
   *  stripped before the request body is built (the Messages API rejects unknown
   *  fields on a message). It is what makes "earlier" concrete: a user turn from
   *  another date is replayed with a `(sent YYYY-MM-DD)` marker so the model can
   *  see which day each stretch of the transcript belongs to. */
  at?: string;
  /** Which Claude model produced this assistant turn. LOCAL ONLY, same as `at`.
   *  Recorded per turn so a thread survives a model switch: we hold the
   *  transcript, so any model can pick it up, and the UI can show who said what. */
  model?: string;
}

/** Facts about a bounded replay window, for the model's context block. Supplied
 *  by the caller that did the windowing (the panel), because only it knows what
 *  it left out. */
export interface HistoryMeta {
  /** How many earlier turns are in the stored thread but not in `prior`. */
  prunedTurns?: number;
}

export interface ChatSettings {
  model: string;
  /** BYOK — the user's own Anthropic key (stored only in their browser). */
  apiKey?: string;
  /** Serverless relay URL; when set, the key lives server-side and no apiKey is needed. */
  proxyUrl?: string;
  /** Firebase ID token sent as a Bearer to a secured proxy (the Cloud Function). */
  authToken?: string;
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

// ── replaying a stored transcript ────────────────────────────────────────────
//
// Memory in this app is OURS: the thread is stored locally (and synced when the
// user is signed in), and the whole replayed window is posted on every request.
// Nothing depends on provider-side conversation state, which is exactly why
// switching model mid-thread continues the same conversation.
//
// A stored transcript is not automatically a valid request body, though. It can
// have been saved mid-tool-loop (the user pressed Stop), or sliced by the replay
// window so it starts on an assistant turn. The Messages API rejects all of that
// with a 400. Everything below exists so a resumed thread can't 400, and so the
// model can tell WHEN each stretch of it was said.

/** The day part of an `at` stamp — an ISO instant or a bare YYYY-MM-DD. */
export function isoDay(at: string | undefined | null): string | null {
  if (!at) return null;
  const day = at.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null;
}

/** Placeholder for a tool call whose result was never recorded (an interrupted
 *  turn). It is an error marker, not a fabricated reading — the model is told the
 *  result is missing, so it re-calls the tool rather than inventing one. */
const LOST_TOOL_RESULT = JSON.stringify({
  error: "No result was recorded for this tool call — the turn was interrupted before it completed. Call the tool again if you still need it.",
});

const isToolUse = (b: ContentBlock): b is Extract<ContentBlock, { type: "tool_use" }> => b.type === "tool_use";
const isToolResult = (b: ContentBlock): b is Extract<ContentBlock, { type: "tool_result" }> => b.type === "tool_result";
const blocksOf = (m: ChatMessage): ContentBlock[] | null => (Array.isArray(m.content) ? m.content : null);

/** Drop content that the API rejects outright: empty strings, empty text blocks,
 *  blocks of unknown shape, and messages left with nothing in them. */
function normalize(m: ChatMessage): ChatMessage | null {
  if (typeof m.content === "string") {
    const text = m.content.trim();
    return text ? { ...m, content: text } : null;
  }
  const kept = (m.content ?? []).flatMap<ContentBlock>((b) => {
    if (!b || typeof b !== "object") return [];
    if (b.type === "text") return b.text.trim().length > 0 ? [b] : [];
    if (isToolUse(b)) return b.id && b.name ? [b] : [];
    // An empty tool_result body is rejected too; keep the pairing, mark the gap.
    if (isToolResult(b)) return b.tool_use_id ? [{ ...b, content: b.content || LOST_TOOL_RESULT }] : [];
    return [];
  });
  return kept.length > 0 ? { ...m, content: kept } : null;
}

/** tool_result blocks must come first in a user message (API requirement). */
function resultsFirst(bs: ContentBlock[]): ContentBlock[] {
  return [...bs.filter(isToolResult), ...bs.filter((b) => !isToolResult(b))];
}

/**
 * Make a stored transcript safe to send.
 *
 * The Messages API 400s on an unmatched `tool_use` / `tool_result` pair, on
 * consecutive same-role messages, and on a history that opens on an assistant
 * turn. A persisted thread can contain all three, so we repair rather than
 * transmit-and-fail:
 *
 *  - a `tool_use` with no recorded result gets a synthesized "result was lost"
 *    marker, so the assistant's text survives and the model knows to re-call;
 *  - a `tool_result` answering nothing (its `tool_use` was pruned away) is dropped;
 *  - consecutive same-role messages are merged, tool_results hoisted to the front;
 *  - leading assistant turns are dropped so the window opens on a user turn.
 *
 * Pure — the input array is never mutated.
 */
export function sanitizeHistory(prior: ChatMessage[]): ChatMessage[] {
  const src = prior.map(normalize).filter((m): m is ChatMessage => m !== null);

  // Pass 1 — pair up tool_use with tool_result in both directions.
  const paired: ChatMessage[] = [];
  for (let i = 0; i < src.length; i++) {
    const m = src[i];
    if (m.role === "user") {
      const bs = blocksOf(m);
      if (bs && bs.some(isToolResult)) {
        // Only results answering the immediately preceding assistant's calls survive.
        const prev = src[i - 1];
        const prevBlocks = prev && prev.role === "assistant" ? blocksOf(prev) : null;
        const openIds = new Set((prevBlocks ?? []).filter(isToolUse).map((b) => b.id));
        const seen = new Set<string>();
        const kept = bs.filter((b) => {
          if (!isToolResult(b)) return true;
          if (!openIds.has(b.tool_use_id) || seen.has(b.tool_use_id)) return false;
          seen.add(b.tool_use_id);
          return true;
        });
        if (kept.length === 0) continue;
        paired.push({ ...m, content: resultsFirst(kept) });
        continue;
      }
    }
    paired.push(m);

    if (m.role !== "assistant") continue;
    const calls = (blocksOf(m) ?? []).filter(isToolUse);
    if (calls.length === 0) continue;

    // Every call this turn made needs an answer in the very next user message.
    const next = src[i + 1];
    const answered = new Set(
      next && next.role === "user" ? (blocksOf(next) ?? []).filter(isToolResult).map((b) => b.tool_use_id) : [],
    );
    const missing = calls.filter((c) => !answered.has(c.id));
    if (missing.length === 0) continue;
    paired.push({
      role: "user",
      content: missing.map((c) => ({ type: "tool_result" as const, tool_use_id: c.id, content: LOST_TOOL_RESULT })),
    });
  }

  // Pass 2 — the window can start mid-exchange; the API needs a user turn first.
  let start = 0;
  while (start < paired.length && paired[start].role === "assistant") start++;

  // Pass 3 — merge consecutive same-role turns (roles must alternate).
  const out: ChatMessage[] = [];
  for (const m of paired.slice(start)) {
    const last = out[out.length - 1];
    if (!last || last.role !== m.role) {
      out.push(m);
      continue;
    }
    const merged = [...toBlocks(last.content), ...toBlocks(m.content)];
    out[out.length - 1] = { ...last, content: m.role === "user" ? resultsFirst(merged) : merged };
  }
  return out;
}

function toBlocks(content: string | ContentBlock[]): ContentBlock[] {
  return typeof content === "string" ? [{ type: "text", text: content }] : content;
}

/** Prefix a user turn sent on another date with `(sent YYYY-MM-DD)`, so "earlier"
 *  is a concrete day rather than a vague gesture. Skipped for turns that carry
 *  tool_result blocks — those are machine plumbing, not something the user said —
 *  and for turns from today, which need no marker. */
function dateTurn(m: ChatMessage, todayIso: string): ChatMessage {
  const day = isoDay(m.at);
  if (m.role !== "user" || !day || day === todayIso) return m;
  const marker = turnDateMarker(day);
  if (typeof m.content === "string") return { ...m, content: marker + m.content };
  if (m.content.some(isToolResult)) return m;
  let done = false;
  const content = m.content.map((b) => {
    if (done || b.type !== "text") return b;
    done = true;
    return { ...b, text: marker + b.text };
  });
  return done ? { ...m, content } : m;
}

/** What actually goes on the wire: role + content only. `at` and `model` are our
 *  bookkeeping and the API rejects unknown message fields. */
function toWire(m: ChatMessage): { role: "user" | "assistant"; content: string | ContentBlock[] } {
  return { role: m.role, content: m.content };
}

/** Sanitize, date, and strip a stored transcript into a valid request body. */
export function prepareHistory(prior: ChatMessage[], todayIso: string): { role: "user" | "assistant"; content: string | ContentBlock[] }[] {
  return sanitizeHistory(prior).map((m) => toWire(dateTurn(m, todayIso)));
}

/** Run one user turn to completion (through any number of tool round-trips) and
 *  return the full updated message history including the assistant's reply.
 *
 *  `prior` is the replay window of a thread WE store — it may reach back days and
 *  may have been written by another model. It is sanitized and dated on every
 *  request (see `prepareHistory`); the returned array stays the clean canonical
 *  transcript, so the date markers are never baked into what we persist. */
export async function runChat(
  prior: ChatMessage[],
  userText: string,
  settings: ChatSettings,
  ctx: AiToolContext,
  events: ChatEvents = {},
  signal?: AbortSignal,
  meta: HistoryMeta = {},
): Promise<ChatMessage[]> {
  if (!chatConfigured(settings)) throw new Error("Chat is not configured. Add an Anthropic key or a proxy URL.");

  const dm = ctx.chart.dayMaster;
  const historyBlock = historyContextBlock({
    todayIso: ctx.todayIso,
    earliestTurnIso: earliestTurnDay(prior),
    prunedTurns: meta.prunedTurns,
    earlierModels: earlierModels(prior, settings.model),
  });
  const system =
    AI_SYSTEM_PROMPT +
    "\n\n" +
    subjectContextBlock({
      dayMaster: `${dm.dayMaster.hanzi} (${dm.dayMaster.phase})`,
      strength: dm.strength,
      favourableElements: dm.favorableElements,
      unfavourableElements: dm.unfavorableElements,
      todayIso: ctx.todayIso,
    }) +
    (historyBlock ? `\n\n${historyBlock}` : "");

  const messages: ChatMessage[] = [...prior, { role: "user", content: userText, at: ctx.todayIso }];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const assistant = await streamOnce(
      {
        model: settings.model,
        max_tokens: settings.maxTokens ?? 1024,
        system,
        tools: AI_TOOLS,
        // Rebuilt each round: the loop appends to `messages`, and only the wire
        // copy carries date markers and pairing repairs.
        messages: prepareHistory(messages, ctx.todayIso),
        stream: true,
      },
      settings,
      events,
      signal,
    );
    // The model is recorded per assistant turn, so a thread that changed models
    // can still show who said what — and so a later request can tell the model
    // that some earlier turns were not its own.
    messages.push({ role: "assistant", content: assistant.content, at: ctx.todayIso, model: settings.model });

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
    messages.push({ role: "user", content: toolResults, at: ctx.todayIso });
  }

  return messages;
}

/** Earliest dated turn in the replayed window (null if nothing is dated). */
function earliestTurnDay(prior: ChatMessage[]): string | null {
  let earliest: string | null = null;
  for (const m of prior) {
    const day = isoDay(m.at);
    if (day && (!earliest || day < earliest)) earliest = day;
  }
  return earliest;
}

/** Distinct models that wrote earlier assistant turns and are not the current
 *  one — the honest basis for telling the model it did not write all of this. */
function earlierModels(prior: ChatMessage[], current: string): string[] {
  const seen: string[] = [];
  for (const m of prior) {
    if (m.role !== "assistant" || !m.model || m.model === current) continue;
    if (!seen.includes(m.model)) seen.push(m.model);
  }
  return seen;
}

// ── one streamed assistant turn ──────────────────────────────────────────────

interface StreamedTurn {
  content: ContentBlock[];
  stopReason: string | null;
}

async function streamOnce(body: unknown, settings: ChatSettings, events: ChatEvents, signal?: AbortSignal): Promise<StreamedTurn> {
  const url = settings.proxyUrl || ANTHROPIC_URL;
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (settings.proxyUrl) {
    // A secured proxy (the Cloud Function) verifies a Firebase ID token.
    if (settings.authToken) headers["authorization"] = `Bearer ${settings.authToken}`;
  } else {
    if (!settings.apiKey) throw new Error("No Anthropic key configured.");
    headers["x-api-key"] = settings.apiKey;
    headers["anthropic-version"] = ANTHROPIC_VERSION;
    headers["anthropic-dangerous-direct-browser-access"] = "true";
  }

  const res = await fetch(url, { method: "POST", headers, body: JSON.stringify(body), signal });
  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => "");
    throw friendlyHttpError(res.status, detail);
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

/** Thrown when the proxy refuses because the caller is out of daily allowance,
 *  so the UI can say when the abuse bound resets instead of a generic "try again". */
export class QuotaError extends Error {
  readonly quota: { used: number; limit: number; plan: string } | null;
  constructor(message: string, quota: QuotaError["quota"]) {
    super(message);
    this.name = "QuotaError";
    this.quota = quota;
  }
}

interface ProxyErrorBody {
  error?: { message?: string; type?: string };
  quota?: { used: number; limit: number; plan: string };
}

function parseErrorBody(detail: string): ProxyErrorBody {
  try {
    return JSON.parse(detail) as ProxyErrorBody;
  } catch {
    return {};
  }
}

function friendlyHttpError(status: number, detail: string): Error {
  const body = parseErrorBody(detail);
  const serverMsg = body.error?.message;

  // Our own proxy sends a specific, user-ready message — prefer it over any
  // generic text, and distinguish "you're out of messages" from Anthropic's
  // upstream rate limiting, which means something entirely different to the user.
  if (status === 429) {
    if (body.error?.type === "quota_exceeded") return new QuotaError(serverMsg ?? "You've used today's advisor messages.", body.quota ?? null);
    return new Error(serverMsg ?? "Rate limited (429). Wait a moment and retry.");
  }
  if (status === 401) return new Error(serverMsg ?? "Your Anthropic key was rejected (401). Check the key and try again.");
  if (status === 403) return new Error(serverMsg ?? "Access denied (403). This key can't use the Messages API.");
  if (status === 529) return new Error("Anthropic is overloaded (529). Please retry shortly.");
  return new Error(serverMsg ? `${serverMsg}` : `Chat request failed (${status}).`);
}
