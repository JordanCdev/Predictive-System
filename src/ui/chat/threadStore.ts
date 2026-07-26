/**
 * Chat threads — OUR memory, not the provider's.
 *
 * The owner's requirement: "the AI advisor chats should retain previous
 * conversations and context, like memory, should be functional across the
 * different claude models/independent of that."
 *
 * That is a storage problem, not an API feature. Everything a conversation is
 * lives HERE, in the browser (and, when signed in, mirrored to Firestore
 * `ai_threads` by the sync layer). Every request replays a transcript we own,
 * so switching model mid-thread — Sonnet 5 → Opus → Haiku — CONTINUES the same
 * conversation with the same context. Nothing in this module, or anything built
 * on it, may depend on server-side or provider-side conversation state.
 *
 * DESIGN RULES (the same discipline as journalStore/prioritiesStore):
 *  - Pure and clock-free. Every decision function takes `nowMs`; only the two
 *    localStorage wrappers touch the outside world.
 *  - Defensive reads. Corrupt rows are DROPPED, never thrown on — a bad thread
 *    must not take the chat panel down.
 *  - Nothing here computes a reading. The AI layer narrates engine output; this
 *    module only stores what was said. `src/engine/**` never imports it.
 *  - List mutators are pure transforms over a `ChatThread[]`. Callers persist
 *    explicitly with `saveThreads` — so a caller can batch edits, and tests
 *    never need storage at all.
 *
 * The only import is a TYPE import from the chat client, so this module pulls
 * none of the AI bundle into the offline path.
 */

import type { ChatMessage, ContentBlock } from "../../ai/chatClient.ts";

export const THREADS_STORE_KEY = "wei_ai_threads_v1";

// ── the turn model ───────────────────────────────────────────────────────────

/**
 * The composed answer of the deterministic offline advisor. Structurally the
 * same shape as the engine's `AdvisorAnswer`, restated here rather than
 * imported so this module stays dependency-free and JSON-round-trippable. A
 * caller can pass an `AdvisorAnswer` straight in.
 */
export interface OfflineAnswer {
  title: string;
  paragraphs: string[];
  action?: { label: string; objectiveId: string; windowDays: number; pickIso?: string };
}

/**
 * One AI turn — a `ChatMessage` with provenance.
 *
 * `content` is the RAW content-block array (or plain string) exactly as the
 * chat client produced it, so `tool_use`/`tool_result` blocks round-trip byte
 * for byte and a replayed transcript is a legal Messages API request.
 *
 * `model` is stamped PER ASSISTANT TURN — that is what makes "which model said
 * what" answerable in the UI, and what makes a mid-thread model switch a
 * non-event rather than a new conversation.
 */
export interface AiTurn {
  kind: "ai";
  /** Unique within its thread. Assigned by `appendTurn`. */
  id: string;
  role: "user" | "assistant";
  content: string | ContentBlock[];
  /** Which model produced this turn. Assistant turns only; absent on user turns. */
  model?: string;
  /** Epoch ms, UI wall-clock. Never an engine input. */
  at: number;
}

/**
 * One deterministic offline turn — the question and the engine-composed answer
 * together, as a single record.
 *
 * WHY A SEPARATE VARIANT rather than storing the composed answer as an
 * assistant `ChatMessage`:
 *  1. It was never said by a model. Replaying it in the `assistant` role would
 *     be putting words in the model's mouth — the model would then treat that
 *     wording as its own prior commitment.
 *  2. The UI has to label it ("Offline advisor — deterministic, no AI"), which
 *     needs a type-level distinction, not a heuristic on the text.
 *  3. Question and answer are produced atomically by the engine, so they are
 *     one record; there is no intermediate state where one exists without the
 *     other.
 * `replayWindow` therefore renders it as a dated, clearly-attributed USER
 * message — the conversation survives switching between offline and AI (and
 * back) without ever misattributing an authored turn.
 */
export interface OfflineTurn {
  kind: "offline";
  id: string;
  question: string;
  answer: OfflineAnswer;
  at: number;
}

export type ChatTurn = AiTurn | OfflineTurn;

/** A turn as handed to `appendTurn`: no id (the store assigns one) and `at`
 *  optional (it defaults to the caller's `nowMs`). */
export type NewTurn =
  | { kind: "ai"; role: "user" | "assistant"; content: string | ContentBlock[]; model?: string; at?: number }
  | { kind: "offline"; question: string; answer: OfflineAnswer; at?: number };

export interface ChatThread {
  id: string;
  /** Short human label. Derived from the first user message when not set. */
  title: string;
  createdAt: number;
  updatedAt: number;
  /** Chronological. The FULL transcript is kept — the replay window is a
   *  separate, bounded projection (see `replayWindow`). */
  turns: ChatTurn[];
  /** Pinned threads survive pruning. Only ever set by the user. */
  pinned?: boolean;
}

export const UNTITLED = "New conversation";

// ── small helpers ────────────────────────────────────────────────────────────

export const aiTurn = (
  role: "user" | "assistant",
  content: string | ContentBlock[],
  model?: string,
): NewTurn => (model ? { kind: "ai", role, content, model } : { kind: "ai", role, content });

export const offlineTurn = (question: string, answer: OfflineAnswer): NewTurn => ({
  kind: "offline",
  question,
  answer,
});

/** Concatenated text of a turn — what the UI shows in a preview, and what
 *  `titleFromFirstMessage` reads. Tool blocks contribute nothing. */
export function turnText(turn: ChatTurn): string {
  if (turn.kind === "offline") return turn.question;
  return messageText(turn.content);
}

export function messageText(content: string | ContentBlock[]): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((b): b is Extract<ContentBlock, { type: "text" }> => !!b && b.type === "text")
    .map((b) => b.text)
    .join("");
}

function hasToolResult(m: ChatMessage): boolean {
  return Array.isArray(m.content) && m.content.some((b) => b?.type === "tool_result");
}

/** Largest instant `new Date(...).toISOString()` can represent. Beyond it the
 *  Date is Invalid and `toISOString` throws. */
const MAX_TIME = 8.64e15;

/** `YYYY-MM-DD` in UTC. Used only to DATE a replayed offline answer so the
 *  model can see it was computed then, not now. */
function isoDay(at: number): string {
  return Number.isFinite(at) && Math.abs(at) <= MAX_TIME ? new Date(at).toISOString().slice(0, 10) : "an earlier date";
}

/**
 * A turn's `at` (epoch ms) as the ISO STRING `ChatMessage.at` is typed as.
 *
 * The two clocks are deliberately different types and confusing them is a
 * silent, dangerous bug: `chatClient.isoDay` reads a message stamp with
 * `at.slice(0, 10)`, so handing it a number yields no date at all and every
 * staleness defence downstream (`(sent YYYY-MM-DD)` markers, the earliest-turn
 * fact in the system prompt) quietly switches off.
 *
 * Returns undefined rather than a fake date when the stamp is missing or
 * unusable — an unstamped turn is UNDATED, and "1970-01-01" would be a
 * fabricated date claim about the user's words.
 */
function isoStamp(at: number): string | undefined {
  if (!Number.isFinite(at) || at <= 0 || Math.abs(at) > MAX_TIME) return undefined;
  return new Date(at).toISOString();
}

// ── titles ───────────────────────────────────────────────────────────────────

export const MAX_TITLE_CHARS = 48;

/**
 * Derive a short thread title from the first user message. Pure, deterministic
 * and offline — no model is asked to name a conversation.
 *
 * Truncation counts CODE POINTS (via `Array.from`), so a Chinese question or an
 * emoji is never cut through the middle of a character. Latin text is cut at
 * the last word boundary when one falls in the back half of the budget;
 * scripts without spaces fall through to a clean code-point cut. Multi-code-point
 * grapheme clusters (flag pairs, ZWJ sequences) can still split — acceptable
 * for a title, and documented rather than silently assumed.
 */
export function titleFromFirstMessage(text: string, maxChars: number = MAX_TITLE_CHARS): string {
  if (typeof text !== "string") return UNTITLED;
  const clean = text
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!clean) return UNTITLED;

  const chars = Array.from(clean);
  if (chars.length <= maxChars) return clean;

  const cut = chars.slice(0, maxChars).join("");
  const lastSpace = cut.lastIndexOf(" ");
  const body = lastSpace > Math.floor(maxChars / 2) ? cut.slice(0, lastSpace) : cut;
  return `${body.trimEnd()}…`;
}

/** The thread's display title: its own if set, else derived from the first
 *  user-side turn, else the untitled placeholder. */
export function titleFor(thread: ChatThread): string {
  const own = typeof thread.title === "string" ? thread.title.trim() : "";
  if (own && own !== UNTITLED) return own;
  const first = firstUserText(thread);
  return first ? titleFromFirstMessage(first) : UNTITLED;
}

/** Text of the first user-side turn (an AI user turn, or an offline question). */
export function firstUserText(thread: ChatThread): string {
  for (const t of thread.turns) {
    if (t.kind === "offline") return t.question;
    if (t.role === "user") {
      const text = messageText(t.content).trim();
      // A tool_result-only user message carries no question — keep looking.
      if (text) return text;
    }
  }
  return "";
}

// ── ids ──────────────────────────────────────────────────────────────────────

/** `rand` is injectable so tests get deterministic ids. */
export function newThreadId(nowMs: number, rand: () => number = Math.random): string {
  const stamp = Math.max(0, Math.floor(nowMs)).toString(36);
  const suffix = Math.floor(rand() * 0xffffff)
    .toString(36)
    .padStart(4, "0");
  return `t${stamp}_${suffix}`;
}

/** Turn ids are derived from (timestamp, position), so they are unique within a
 *  thread and stable across a save/load round-trip without any randomness. */
function turnId(at: number, index: number): string {
  return `${Math.max(0, Math.floor(at)).toString(36)}-${index}`;
}

// ── parsing (defensive; corrupt rows are dropped, never thrown on) ───────────

function finite(v: unknown, fallback = 0): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

function parseBlock(v: unknown): ContentBlock | null {
  const b = v as Partial<ContentBlock> & { type?: string } | null;
  if (!b || typeof b !== "object") return null;
  if (b.type === "text") {
    const t = (b as { text?: unknown }).text;
    return typeof t === "string" ? { type: "text", text: t } : null;
  }
  if (b.type === "tool_use") {
    const { id, name, input } = b as { id?: unknown; name?: unknown; input?: unknown };
    if (typeof id !== "string" || !id || typeof name !== "string" || !name) return null;
    return { type: "tool_use", id, name, input: input ?? {} };
  }
  if (b.type === "tool_result") {
    const { tool_use_id, content } = b as { tool_use_id?: unknown; content?: unknown };
    if (typeof tool_use_id !== "string" || !tool_use_id) return null;
    return { type: "tool_result", tool_use_id, content: typeof content === "string" ? content : JSON.stringify(content ?? null) };
  }
  return null;
}

function parseContent(v: unknown): string | ContentBlock[] | null {
  if (typeof v === "string") return v;
  if (!Array.isArray(v)) return null;
  const blocks = v.map(parseBlock).filter((b): b is ContentBlock => b !== null);
  // A message with no usable blocks is not sendable and carries nothing to
  // show — drop the whole turn rather than persist an unsendable message.
  return blocks.length > 0 ? blocks : null;
}

function parseOfflineAnswer(v: unknown): OfflineAnswer | null {
  const a = v as Partial<OfflineAnswer> | null;
  if (!a || typeof a !== "object") return null;
  const title = typeof a.title === "string" ? a.title : "";
  const paragraphs = Array.isArray(a.paragraphs) ? a.paragraphs.filter((p): p is string => typeof p === "string") : [];
  if (!title && paragraphs.length === 0) return null;
  const out: OfflineAnswer = { title, paragraphs };
  const act = a.action as OfflineAnswer["action"] | undefined;
  if (act && typeof act === "object" && typeof act.objectiveId === "string") {
    out.action = {
      label: typeof act.label === "string" ? act.label : "",
      objectiveId: act.objectiveId,
      windowDays: finite(act.windowDays, 0),
      ...(typeof act.pickIso === "string" ? { pickIso: act.pickIso } : {}),
    };
  }
  return out;
}

/** The loose shape of a stored turn before validation. Deliberately not
 *  `Partial<AiTurn & OfflineTurn>` — the two `kind` literals conflict, so that
 *  intersection collapses to `never`. */
type RawTurn = {
  kind?: unknown;
  id?: unknown;
  at?: unknown;
  role?: unknown;
  content?: unknown;
  model?: unknown;
  question?: unknown;
  answer?: unknown;
};

export function parseTurn(v: unknown, index: number): ChatTurn | null {
  const t = v as RawTurn | null;
  if (!t || typeof t !== "object") return null;
  const at = finite(t.at, 0);
  const id = typeof t.id === "string" && t.id ? t.id : turnId(at, index);

  if (t.kind === "offline") {
    const question = typeof t.question === "string" ? t.question : "";
    const answer = parseOfflineAnswer(t.answer);
    if (!answer) return null;
    return { kind: "offline", id, question, answer, at };
  }
  // Anything not explicitly offline is read as an AI turn (older records, and
  // records written before `kind` existed, are AI turns by construction).
  const role = t.role === "assistant" ? "assistant" : t.role === "user" ? "user" : null;
  if (!role) return null;
  const content = parseContent(t.content);
  if (content === null) return null;
  const turn: AiTurn = { kind: "ai", id, role, content, at };
  if (role === "assistant" && typeof t.model === "string" && t.model) turn.model = t.model;
  return turn;
}

/** Build a valid thread from whatever was persisted — a well-formed record, a
 *  partial one from an older build, a Firestore document, or nonsense. Returns
 *  null only when there is no usable identity. */
export function parseThread(v: unknown): ChatThread | null {
  const r = v as Partial<ChatThread> | null;
  if (!r || typeof r !== "object" || Array.isArray(r)) return null;
  if (typeof r.id !== "string" || !r.id) return null;

  const turns: ChatTurn[] = [];
  if (Array.isArray(r.turns)) {
    for (const raw of r.turns) {
      const turn = parseTurn(raw, turns.length);
      if (turn) turns.push(turn);
    }
  }
  const lastAt = turns.length ? turns[turns.length - 1].at : 0;
  const createdAt = finite(r.createdAt, turns.length ? turns[0].at : 0);
  const updatedAt = Math.max(finite(r.updatedAt, 0), createdAt, lastAt);
  return {
    id: r.id,
    title: typeof r.title === "string" ? r.title : "",
    createdAt,
    updatedAt,
    turns,
    ...(r.pinned === true ? { pinned: true as const } : {}),
  };
}

export function parseThreads(v: unknown): ChatThread[] {
  if (!Array.isArray(v)) return [];
  const out: ChatThread[] = [];
  const seen = new Set<string>();
  for (const raw of v) {
    const thread = parseThread(raw);
    if (!thread || seen.has(thread.id)) continue;
    seen.add(thread.id);
    out.push(thread);
  }
  return out;
}

// ── persistence (the only impure part) ───────────────────────────────────────

function storage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null; // blocked by a privacy setting — behave as "nothing stored"
  }
}

/**
 * Tell the rest of this tab that threads changed. The browser only fires
 * `storage` in OTHER tabs, so panels mounted in this one need the re-emit to
 * re-hydrate. Purely a UI notification; no engine code observes it.
 */
export function notifyThreadsChanged(): void {
  try {
    if (typeof window === "undefined" || typeof StorageEvent !== "function") return;
    window.dispatchEvent(new StorageEvent("storage", { key: THREADS_STORE_KEY }));
  } catch {
    /* environments without a constructible StorageEvent simply don't get the ping */
  }
}

/** Absent, unreadable or corrupt all yield an empty list — a fully supported
 *  state (it just means "no conversations yet"). Threads persist LOCALLY
 *  ALWAYS; Firestore sync is an addition on top, never a prerequisite. */
export function loadThreads(): ChatThread[] {
  const ls = storage();
  if (!ls) return [];
  try {
    const raw = ls.getItem(THREADS_STORE_KEY);
    return raw ? parseThreads(JSON.parse(raw)) : [];
  } catch {
    return [];
  }
}

/** What a save actually achieved. Returned rather than swallowed: a transcript
 *  that outgrew localStorage, or a browser refusing storage entirely, means the
 *  conversation exists only in this tab's memory and dies with it. The user is
 *  entitled to know that BEFORE they close the tab, so the caller gets a fact it
 *  can put on screen instead of a silent catch. */
export interface SaveOutcome {
  /** The list as passed in — unchanged; saving never edits it. */
  threads: ChatThread[];
  /** True when the transcript is on disk. */
  persisted: boolean;
  /** Why it isn't, when it isn't:
   *  - `quota` — localStorage is full (or the write exceeded its limit);
   *  - `unavailable` — storage is blocked or absent (private mode, embedded view). */
  reason?: "quota" | "unavailable";
}

/** A quota failure and a "storage is switched off" failure are different things
 *  to say to someone, so we distinguish them rather than reporting both as an
 *  unspecified error. */
function saveFailure(err: unknown): "quota" | "unavailable" {
  const e = err as { name?: unknown; code?: unknown } | null;
  const name = typeof e?.name === "string" ? e.name : "";
  return /quota|exceeded/i.test(name) || e?.code === 22 || e?.code === 1014 ? "quota" : "unavailable";
}

export function saveThreads(threads: ChatThread[]): SaveOutcome {
  const ls = storage();
  if (!ls) {
    notifyThreadsChanged();
    return { threads, persisted: false, reason: "unavailable" };
  }
  let reason: SaveOutcome["reason"];
  try {
    if (threads.length === 0) ls.removeItem(THREADS_STORE_KEY);
    else ls.setItem(THREADS_STORE_KEY, JSON.stringify(threads));
  } catch (err) {
    // The in-memory list still works this session — but it is now the ONLY copy.
    reason = saveFailure(err);
  }
  notifyThreadsChanged();
  return reason ? { threads, persisted: false, reason } : { threads, persisted: true };
}

// ── pure thread + list operations ────────────────────────────────────────────

export function createThread(nowMs: number, opts: { id?: string; title?: string; rand?: () => number } = {}): ChatThread {
  return {
    id: opts.id ?? newThreadId(nowMs, opts.rand),
    title: opts.title ?? "",
    createdAt: nowMs,
    updatedAt: nowMs,
    turns: [],
  };
}

/**
 * Append a turn. Stamps `at` (unless the caller supplied one), assigns a
 * thread-unique id, bumps `updatedAt`, and — if the thread is still untitled and
 * this is the first user-side turn — derives a title from it.
 */
export function appendTurn(thread: ChatThread, turn: NewTurn, nowMs: number): ChatThread {
  const at = typeof turn.at === "number" && Number.isFinite(turn.at) ? turn.at : nowMs;
  const id = turnId(at, thread.turns.length);
  const stamped: ChatTurn =
    turn.kind === "offline"
      ? { kind: "offline", id, question: turn.question, answer: turn.answer, at }
      : {
          kind: "ai",
          id,
          role: turn.role,
          content: turn.content,
          at,
          ...(turn.role === "assistant" && turn.model ? { model: turn.model } : {}),
        };

  const turns = [...thread.turns, stamped];
  const next: ChatThread = { ...thread, turns, updatedAt: Math.max(nowMs, at) };
  const own = thread.title.trim();
  if (!own || own === UNTITLED) {
    const first = firstUserText(next);
    if (first) next.title = titleFromFirstMessage(first);
  }
  return next;
}

/**
 * Append the tail of a `runChat` result. `runChat` returns the FULL updated
 * message list, so callers pass the slice after the prior length. Assistant
 * messages are stamped with the model that produced them — that stamp is what
 * makes a mid-thread model switch legible rather than invisible.
 */
export function appendMessages(thread: ChatThread, messages: ChatMessage[], model: string, nowMs: number): ChatThread {
  let next = thread;
  for (const m of messages) {
    next = appendTurn(next, { kind: "ai", role: m.role, content: m.content, ...(m.role === "assistant" ? { model } : {}) }, nowMs);
  }
  return next;
}

export function renameThread(threads: ChatThread[], id: string, title: string, nowMs: number): ChatThread[] {
  const clean = title.trim().slice(0, 120);
  return threads.map((t) => (t.id === id ? { ...t, title: clean, updatedAt: nowMs } : t));
}

export function deleteThread(threads: ChatThread[], id: string): ChatThread[] {
  return threads.filter((t) => t.id !== id);
}

export function setPinned(threads: ChatThread[], id: string, pinned: boolean, nowMs: number): ChatThread[] {
  return threads.map((t) => (t.id === id ? { ...t, pinned: pinned ? true : undefined, updatedAt: nowMs } : t));
}

/** Insert or replace a thread, keeping list order stable for an existing id. */
export function upsertThread(threads: ChatThread[], thread: ChatThread): ChatThread[] {
  const i = threads.findIndex((t) => t.id === thread.id);
  if (i < 0) return [thread, ...threads];
  const next = threads.slice();
  next[i] = thread;
  return next;
}

/** List order for the UI: pinned first, then most-recently-updated. */
export function sortThreads(threads: ChatThread[]): ChatThread[] {
  return [...threads].sort((a, b) => {
    const pin = Number(b.pinned === true) - Number(a.pinned === true);
    return pin !== 0 ? pin : b.updatedAt - a.updatedAt;
  });
}

/**
 * Merge two lists of threads by id, newest `updatedAt` winning. Used by the
 * Firestore sync layer (local vs cloud) — last-write-wins per thread, so a
 * device that was offline never silently loses the newer copy.
 */
export function mergeThreads(a: ChatThread[], b: ChatThread[]): ChatThread[] {
  const byId = new Map<string, ChatThread>();
  for (const t of [...a, ...b]) {
    const existing = byId.get(t.id);
    if (!existing || t.updatedAt > existing.updatedAt) byId.set(t.id, t);
  }
  return sortThreads([...byId.values()]);
}

// ── the replay window ────────────────────────────────────────────────────────

/**
 * Approximate tokens per character. A deliberate ESTIMATE, not a measurement:
 * we never call the token-counting endpoint just to decide how much history to
 * send. Four characters per token is the usual English rule of thumb; the
 * budget below is set with enough slack that the estimate being off by a third
 * still cannot produce an over-long request.
 */
export const CHARS_PER_TOKEN = 4;
/** Rough per-message envelope overhead, in estimated tokens. */
const MESSAGE_OVERHEAD_TOKENS = 4;

/**
 * Default replay budget, in ESTIMATED tokens. Generous enough that ordinary
 * conversations replay whole (this is a chat about one person's chart, not a
 * document corpus), small enough that a very long thread can't turn one
 * question into a huge request. It is a cost/abuse bound — never a product
 * tier; there are no tiers in this app.
 */
export const DEFAULT_REPLAY_BUDGET_TOKENS = 12_000;

export function estimateTokens(messages: ChatMessage[]): number {
  let total = 0;
  for (const m of messages) {
    const text = typeof m.content === "string" ? m.content : JSON.stringify(m.content);
    total += Math.ceil(text.length / CHARS_PER_TOKEN) + MESSAGE_OVERHEAD_TOKENS;
  }
  return total;
}

/**
 * WHERE THE STALENESS CONTRACT LIVES — deliberately NOT here.
 *
 * A reading computed last week must never be replayed as today's, and the model
 * is told so in `src/ai/systemPrompt.ts` (`AI_SYSTEM_PROMPT`, "Tool results in
 * the transcript are dated evidence" + `historyContextBlock`). This module used
 * to carry a second copy of that wording that nothing imported; two texts for
 * one contract is how they drift apart, so there is now exactly one.
 *
 * What this module owes that contract is not words but FACTS: every replayed
 * message carries the `at` (and, for assistant turns, the `model`) of the turn it
 * came from. Those stamps are what `chatClient` turns into the `(sent
 * YYYY-MM-DD)` marker, the earliest-turn line and the "another model wrote
 * this" line. Drop them here — as an earlier revision of `toUnits` did, by
 * projecting each turn to a bare `{ role, content }` — and the prompt keeps
 * making promises about dates while every replayed turn arrives undated.
 */

export interface ReplayWindow {
  /** Prior history to hand `runChat`. Strictly alternating, user-first, with
   *  every tool_use/tool_result pair intact. May be empty. */
  messages: ChatMessage[];
  /** How many stored turns are NOT represented in `messages`. The UI must say
   *  so — never silently drop context the user can still see on screen. */
  omittedTurns: number;
  /** `at` of the OLDEST omitted turn (null when nothing was omitted). */
  omittedFrom: number | null;
  /** `at` of the NEWEST omitted turn — "everything up to here was left out". */
  omittedThrough: number | null;
  /** Estimated tokens in `messages` (same estimator as `estimateTokens`). */
  estimatedTokens: number;
  /** True when the most recent exchange alone exceeds the budget and was sent
   *  whole anyway — splitting it would break a tool_use/tool_result pair. A fact
   *  about this window, reported so a caller CAN say so; the panel does not
   *  currently show it. */
  overBudget: boolean;
}

interface ReplayEntry {
  turn: ChatTurn;
  message: ChatMessage;
}

/** An atomic replay unit: one user question and everything that followed it up
 *  to the next question. Cutting only at unit boundaries is what guarantees a
 *  tool_use is never separated from its tool_result. */
interface ReplayUnit {
  entries: ReplayEntry[];
  tokens: number;
  /** False for a leading fragment that does not start with a user message
   *  (e.g. a thread trimmed mid tool-loop). Never replayable: a window may not
   *  begin with an assistant message or an orphaned tool_result. */
  anchored: boolean;
}

function offlineMessage(turn: OfflineTurn): ChatMessage {
  const lines = [
    `[Offline advisor — deterministic engine output, computed on ${isoDay(turn.at)} (UTC). Not written by an assistant.]`,
    `I asked: ${turn.question}`,
    `The app showed me:`,
    turn.answer.title,
    ...turn.answer.paragraphs,
  ];
  const stamp = isoStamp(turn.at);
  // Dated twice, and on purpose: in the prose (this text is a record of what the
  // app showed, whenever that was) and in `at` (so the request marks the turn as
  // sent on that day like any other).
  return { role: "user", content: lines.filter(Boolean).join("\n"), ...(stamp ? { at: stamp } : {}) };
}

/** Project a stored turn onto the message that will be sent, PROVENANCE AND ALL.
 *  `at`/`model` are local bookkeeping — `chatClient.prepareHistory` strips them
 *  before the body is built — but they are the only evidence downstream has for
 *  when a turn was said and who said it. */
function aiMessage(turn: AiTurn): ChatMessage {
  const stamp = isoStamp(turn.at);
  return {
    role: turn.role,
    content: turn.content,
    ...(stamp ? { at: stamp } : {}),
    ...(turn.role === "assistant" && turn.model ? { model: turn.model } : {}),
  };
}

function toUnits(turns: ChatTurn[]): ReplayUnit[] {
  const units: ReplayUnit[] = [];
  let current: ReplayUnit | null = null;

  const push = (entry: ReplayEntry, startsUnit: boolean) => {
    if (startsUnit || !current) {
      current = { entries: [], tokens: 0, anchored: startsUnit };
      units.push(current);
    }
    current.entries.push(entry);
    current.tokens += estimateTokens([entry.message]);
  };

  for (const turn of turns) {
    if (turn.kind === "offline") {
      push({ turn, message: offlineMessage(turn) }, true);
      // An offline exchange is complete in itself — the next turn starts fresh.
      current = null;
      continue;
    }
    const message = aiMessage(turn);
    // A user message carrying tool_result blocks CONTINUES the current unit;
    // any other user message opens a new one.
    const startsUnit = turn.role === "user" && !hasToolResult(message);
    push({ turn, message }, startsUnit);
  }
  return units;
}

/**
 * Remove the blocks the Messages API would reject — a `tool_use` with no later
 * matching `tool_result`, or a `tool_result` answering no earlier `tool_use` —
 * AT THE POSITION THEY OCCUR.
 *
 * This repairs in place; it never truncates. An earlier version recomputed the
 * pairing over the whole list but repaired with `out.pop()`, so an orphan at
 * index 1 could only be reached by popping everything after it: one interrupted
 * tool call near the start silently deleted the entire rest of the conversation
 * from the replay, and the omitted count reported it as if the budget had done
 * it. Position of the fault must not decide how much survives.
 *
 * Only the offending BLOCK goes; a message keeps its other blocks, and is
 * dropped only when the orphan was all it contained. Final pairing (a lost
 * result gets an explicit "the turn was interrupted" marker, results hoisted to
 * the front, roles merged) belongs to `chatClient.sanitizeHistory`, which sees
 * the new question too — this is only about not handing it a window whose
 * orphans it would have to guess at.
 *
 * One pass suffices: removing an orphan cannot orphan anything else (nothing was
 * paired to it), and dropping an emptied message preserves the order of the rest.
 */
function balancePairs(entries: ReplayEntry[]): ReplayEntry[] {
  const useAt = new Map<string, number>();
  const resultAt = new Map<string, number>();
  entries.forEach((e, i) => {
    if (!Array.isArray(e.message.content)) return;
    for (const b of e.message.content) {
      if (b.type === "tool_use") {
        if (!useAt.has(b.id)) useAt.set(b.id, i);
      } else if (b.type === "tool_result") {
        if (!resultAt.has(b.tool_use_id)) resultAt.set(b.tool_use_id, i);
      }
    }
  });

  // A result must come strictly AFTER the call it answers; a call must be
  // answered strictly LATER. Anything else is an orphan wherever it sits.
  const keepBlock = (b: ContentBlock, i: number): boolean => {
    if (b.type === "tool_use") {
      const j = resultAt.get(b.id);
      return j !== undefined && j > i;
    }
    if (b.type === "tool_result") {
      const j = useAt.get(b.tool_use_id);
      return j !== undefined && j < i;
    }
    return true;
  };

  const out: ReplayEntry[] = [];
  entries.forEach((e, i) => {
    const content = e.message.content;
    if (!Array.isArray(content)) {
      out.push(e);
      return;
    }
    const kept = content.filter((b) => keepBlock(b, i));
    if (kept.length === content.length) out.push(e);
    else if (kept.length > 0) out.push({ turn: e.turn, message: { ...e.message, content: kept } });
    // kept.length === 0: the message was nothing but the orphan — that one
    // message goes, and everything around it stays.
  });
  return out;
}

/** Merge adjacent same-role messages into one. Offline turns replay as user
 *  messages, so two of them in a row would otherwise send consecutive user
 *  messages; the Messages API documents "first message must be user" and
 *  errors on non-alternating roles, so we hand it a strictly alternating list.
 *
 *  Merging must not launder provenance. The merged message keeps the EARLIER
 *  `at` — it opens with the older text, and `chatClient.dateTurn` marks a
 *  message by its first text block, so the older words keep their true date
 *  rather than being presented as newer — and keeps a `model` stamp if either
 *  side had one, so "a different model wrote part of this" stays visible. */
function mergeAdjacent(messages: ChatMessage[]): ChatMessage[] {
  const out: ChatMessage[] = [];
  for (const m of messages) {
    const prev = out[out.length - 1];
    if (!prev || prev.role !== m.role) {
      out.push({ ...m });
      continue;
    }
    // Entries are chronological, so `prev.at` is the earlier of the two.
    if (!prev.at && m.at) prev.at = m.at;
    if (!prev.model && m.model) prev.model = m.model;
    if (typeof prev.content === "string" && typeof m.content === "string") {
      prev.content = `${prev.content}\n\n${m.content}`;
      continue;
    }
    const asBlocks = (c: string | ContentBlock[]): ContentBlock[] =>
      typeof c === "string" ? [{ type: "text", text: c }] : c;
    prev.content = [...asBlocks(prev.content), ...asBlocks(m.content)];
  }
  return out;
}

/**
 * The bounded transcript to replay to the model, plus exactly what was left out.
 *
 * Selection walks BACKWARDS from the newest exchange, taking whole exchanges
 * while the estimated budget allows. A window boundary therefore always falls
 * between a user question and the previous exchange — never between a `tool_use`
 * and its matching `tool_result` (which the API rejects), and never leaving an
 * assistant message first (a window must start with a user message).
 *
 * The most recent exchange is always included even if it alone exceeds the
 * budget: sending nothing would be worse, and splitting it would break tool
 * pairing. `overBudget` reports that.
 *
 * The FULL transcript stays on screen; this is only what is sent. Whatever is
 * omitted here must be surfaced to the user — that is the point of the
 * `omitted*` fields (the panel draws them with `transcript.boundaryNote`).
 *
 * Every message carries the `at` of the turn it came from, and every assistant
 * message its `model`. `runChat` reads both to date the transcript and to name
 * the models that wrote earlier turns; `prepareHistory` strips them from the
 * body. A window may legitimately END on a user message (an offline-only thread,
 * or a question whose answer never arrived). That needs no special handling
 * here: `runChat` appends the new question, and `sanitizeHistory` merges the two
 * user turns — which also dates them correctly, since the marker lands on the
 * first text block, i.e. the older words, leaving today's question unmarked.
 */
export function replayWindow(thread: ChatThread, budget: number = DEFAULT_REPLAY_BUDGET_TOKENS): ReplayWindow {
  const units = toUnits(thread.turns);
  const limit = Number.isFinite(budget) && budget > 0 ? budget : DEFAULT_REPLAY_BUDGET_TOKENS;

  const chosen: ReplayUnit[] = [];
  let tokens = 0;
  let overBudget = false;
  for (let i = units.length - 1; i >= 0; i--) {
    const unit = units[i];
    if (!unit.anchored) break; // a leading fragment; nothing before it is replayable either
    if (tokens + unit.tokens > limit) {
      if (chosen.length === 0) {
        chosen.unshift(unit);
        tokens += unit.tokens;
        overBudget = true;
      }
      break;
    }
    chosen.unshift(unit);
    tokens += unit.tokens;
  }

  const entries = balancePairs(chosen.flatMap((u) => u.entries));
  const kept = new Set(entries.map((e) => e.turn.id));
  const omitted = thread.turns.filter((t) => !kept.has(t.id));
  const messages = mergeAdjacent(entries.map((e) => e.message));

  return {
    messages,
    omittedTurns: omitted.length,
    omittedFrom: omitted.length ? omitted[0].at : null,
    omittedThrough: omitted.length ? omitted[omitted.length - 1].at : null,
    estimatedTokens: estimateTokens(messages),
    overBudget,
  };
}

// TWO THINGS THAT USED TO LIVE HERE, and where their jobs went:
//
//  - `withUserMessage(messages, userText)` folded a window ending on a user
//    message into the new question. Nothing called it, and it was the wrong
//    place: folding merges old words into today's question, so the whole thing
//    is dated today and a week-old question is replayed as if just asked.
//    `sanitizeHistory` already merges the pair and dates the older half — see
//    the note on `replayWindow`.
//  - `omittedNote(window)` phrased the replay boundary for the UI. The panel
//    renders `transcript.boundaryNote(omittedTurns)` at the exact point in the
//    transcript where the boundary falls; two sentences for one event only
//    diverge. The `omitted*` fields above are the data; that function is the
//    wording.

// ── pruning (an abuse/storage bound, never a product tier) ───────────────────

export interface ThreadLimits {
  /** How many conversations are kept on this device. */
  maxThreads: number;
  /** How many turns are kept within one conversation. */
  maxTurnsPerThread: number;
}

/**
 * Deliberately high. These exist to keep localStorage and the sync payload from
 * growing without bound — they are NOT a plan, a tier, or an upsell. Nothing in
 * this app is gated; there are no tiers to gate with.
 */
export const DEFAULT_THREAD_LIMITS: ThreadLimits = { maxThreads: 50, maxTurnsPerThread: 400 };

export interface PruneResult {
  threads: ChatThread[];
  /** Whole conversations removed, oldest and unpinned first. */
  removedThreads: { id: string; title: string; turns: number }[];
  /** Conversations whose oldest turns were trimmed. */
  trimmedTurns: { id: string; title: string; removed: number }[];
  /** Caller's clock, so the UI can say when this happened. */
  prunedAt: number;
}

/** Where a turn list may be cut without leaving a leading orphan: at a user
 *  question or an offline exchange. */
function isAnchor(turn: ChatTurn): boolean {
  if (turn.kind === "offline") return true;
  return turn.role === "user" && !hasToolResult({ role: "user", content: turn.content });
}

/**
 * Enforce the storage bounds, and REPORT what it removed.
 *
 * Guarantees:
 *  - A pinned thread is never removed. Pinning is the user saying "keep this".
 *  - At least one unpinned thread always survives, so the conversation someone
 *    is in the middle of can't be deleted out from under them by a cap they
 *    are already over.
 *  - Turn trimming cuts at an exchange boundary, so a trimmed thread stays a
 *    coherent transcript rather than starting on an orphaned tool result.
 *  - Input order is preserved (minus removals), so the caller's own ordering
 *    is not silently rearranged.
 *
 * Nothing is destroyed quietly: `removedThreads`/`trimmedTurns` exist so the UI
 * can say plainly what went.
 */
export function pruneThreads(
  threads: ChatThread[],
  limits: ThreadLimits = DEFAULT_THREAD_LIMITS,
  nowMs: number = 0,
): PruneResult {
  const maxThreads = Math.max(1, Math.floor(limits.maxThreads));
  const maxTurns = Math.max(1, Math.floor(limits.maxTurnsPerThread));

  const pinned = threads.filter((t) => t.pinned === true);
  const unpinned = threads.filter((t) => t.pinned !== true);
  const capacity = Math.max(1, maxThreads - pinned.length);
  const keepUnpinned = new Set(
    [...unpinned].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, capacity).map((t) => t.id),
  );

  const removedThreads: PruneResult["removedThreads"] = [];
  const trimmedTurns: PruneResult["trimmedTurns"] = [];
  const out: ChatThread[] = [];

  for (const thread of threads) {
    if (thread.pinned !== true && !keepUnpinned.has(thread.id)) {
      removedThreads.push({ id: thread.id, title: titleFor(thread), turns: thread.turns.length });
      continue;
    }
    const excess = thread.turns.length - maxTurns;
    if (excess <= 0) {
      out.push(thread);
      continue;
    }
    let cut = excess;
    for (let i = excess; i < thread.turns.length; i++) {
      if (isAnchor(thread.turns[i])) {
        cut = i;
        break;
      }
    }
    trimmedTurns.push({ id: thread.id, title: titleFor(thread), removed: cut });
    out.push({ ...thread, turns: thread.turns.slice(cut) });
  }

  return { threads: out, removedThreads, trimmedTurns, prunedAt: nowMs };
}

/** One honest sentence about what pruning did. Empty when it did nothing.
 *  Storage housekeeping — no tier language, because there are no tiers.
 *
 *  The closing "Pinned conversations are never removed" is a true statement
 *  about `pruneThreads`, and it is only USEFUL advice while the user can
 *  actually pin one (`setPinned`, exposed by the conversation list). If that
 *  control ever goes away, this clause must go with it — telling someone their
 *  pinned conversations are safe when they cannot pin anything is a promise
 *  about a button that does not exist. */
export function pruneNote(result: PruneResult): string {
  const parts: string[] = [];
  if (result.removedThreads.length > 0) {
    const n = result.removedThreads.length;
    const names = result.removedThreads.slice(0, 3).map((t) => `“${t.title}”`).join(", ");
    parts.push(`removed ${n} older ${n === 1 ? "conversation" : "conversations"} (${names}${n > 3 ? ", …" : ""})`);
  }
  if (result.trimmedTurns.length > 0) {
    const total = result.trimmedTurns.reduce((a, t) => a + t.removed, 0);
    const n = result.trimmedTurns.length;
    parts.push(`trimmed ${total} of the oldest messages from ${n} ${n === 1 ? "conversation" : "conversations"}`);
  }
  if (parts.length === 0) return "";
  return `To keep this device's chat history a manageable size, we ${parts.join(" and ")}. Pinned conversations are never removed.`;
}
