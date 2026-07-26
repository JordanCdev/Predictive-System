import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatMessage, ContentBlock } from "../src/ai/chatClient.ts";
import { prepareHistory, runChat } from "../src/ai/chatClient.ts";
import type { AiToolContext } from "../src/ai/tools.ts";
import {
  CHARS_PER_TOKEN,
  ChatThread,
  ChatTurn,
  DEFAULT_REPLAY_BUDGET_TOKENS,
  DEFAULT_THREAD_LIMITS,
  MAX_TITLE_CHARS,
  THREADS_STORE_KEY,
  UNTITLED,
  aiTurn,
  appendMessages,
  appendTurn,
  createThread,
  deleteThread,
  estimateTokens,
  firstUserText,
  loadThreads,
  mergeThreads,
  newThreadId,
  offlineTurn,
  parseThread,
  parseThreads,
  pruneNote,
  pruneThreads,
  renameThread,
  replayWindow,
  saveThreads,
  setPinned,
  sortThreads,
  titleFor,
  titleFromFirstMessage,
  turnText,
  upsertThread,
} from "../src/ui/chat/threadStore.ts";

/** The test env is `node`, so localStorage doesn't exist. A tiny in-memory stub
 *  lets the two persistence wrappers be exercised for real rather than mocked. */
class MemoryStorage {
  map = new Map<string, string>();
  get length() {
    return this.map.size;
  }
  getItem(k: string) {
    return this.map.has(k) ? this.map.get(k)! : null;
  }
  setItem(k: string, v: string) {
    this.map.set(k, String(v));
  }
  removeItem(k: string) {
    this.map.delete(k);
  }
  clear() {
    this.map.clear();
  }
  key(i: number) {
    return Array.from(this.map.keys())[i] ?? null;
  }
}

const g = globalThis as { localStorage?: unknown; window?: unknown; StorageEvent?: unknown };
let store: MemoryStorage;

beforeEach(() => {
  store = new MemoryStorage();
  g.localStorage = store as unknown as Storage;
});
afterEach(() => {
  delete g.localStorage;
  delete g.window;
  delete g.StorageEvent;
  vi.unstubAllGlobals();
});

const NOW = Date.UTC(2026, 6, 26); // fixed clock — never Date.now()
const MIN = 60_000;
const DAY = 86_400_000;

/** The stamp a replayed message must carry: the turn's epoch ms as the ISO
 *  STRING `ChatMessage.at` is typed as — `chatClient.isoDay` reads it with
 *  `.slice(0, 10)`, so a raw number would silently date nothing. */
const iso = (at: number) => new Date(at).toISOString();

// ── builders ─────────────────────────────────────────────────────────────────

const ANSWER = {
  title: "Thursday 30 July is your best day to sign",
  paragraphs: ["It scores 74 — a Success (成) day with no clash to your Day Master."],
};

/** A complete AI exchange: question → assistant(tool_use) → user(tool_result) → assistant(text). */
function toolExchange(n: number): ChatTurn[] {
  const useId = `toolu_${n}`;
  return [
    { kind: "ai", id: `q${n}`, role: "user", content: `question ${n}`, at: NOW + n * MIN },
    {
      kind: "ai",
      id: `a${n}`,
      role: "assistant",
      content: [{ type: "tool_use", id: useId, name: "best_days", input: { objectiveId: "contract" } }],
      model: "claude-sonnet-5",
      at: NOW + n * MIN + 1,
    },
    {
      kind: "ai",
      id: `r${n}`,
      role: "user",
      content: [{ type: "tool_result", tool_use_id: useId, content: JSON.stringify({ best: "2026-07-30" }) }],
      at: NOW + n * MIN + 2,
    },
    {
      kind: "ai",
      id: `t${n}`,
      role: "assistant",
      content: [{ type: "text", text: `answer ${n}` }],
      model: "claude-sonnet-5",
      at: NOW + n * MIN + 3,
    },
  ];
}

function threadWith(turns: ChatTurn[], over: Partial<ChatThread> = {}): ChatThread {
  return {
    id: "t1",
    title: "A thread",
    createdAt: NOW,
    updatedAt: turns.length ? turns[turns.length - 1].at : NOW,
    turns,
    ...over,
  };
}

/**
 * Just enough `AiToolContext` for `runChat` to build its system prompt. No tool
 * is ever executed here (the stubbed stream never asks for one) — these tests
 * are about what the STORE hands the client, not about the engine, which this
 * module must never touch.
 */
function stubCtx(todayIso: string): AiToolContext {
  return {
    chart: {
      dayMaster: {
        dayMaster: { hanzi: "庚", phase: "Metal" },
        strength: "weak",
        favorableElements: ["Earth"],
        unfavorableElements: ["Fire"],
      },
    },
    todayIso,
    evaluate: () => {
      throw new Error("no tool call was expected");
    },
    evaluateDay: () => {
      throw new Error("no tool call was expected");
    },
  } as unknown as AiToolContext;
}

/** One text-only assistant turn as a Messages-API SSE stream. */
function textTurn(text: string): Response {
  const events = [
    { event: "content_block_start", data: { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } } },
    { event: "content_block_delta", data: { type: "content_block_delta", index: 0, delta: { type: "text_delta", text } } },
    { event: "content_block_stop", data: { type: "content_block_stop", index: 0 } },
    { event: "message_delta", data: { type: "message_delta", delta: { stop_reason: "end_turn" } } },
    { event: "message_stop", data: { type: "message_stop" } },
  ];
  const enc = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      for (const e of events) c.enqueue(enc.encode(`event: ${e.event}\ndata: ${JSON.stringify(e.data)}\n\n`));
      c.close();
    },
  });
  return { ok: true, status: 200, body } as unknown as Response;
}

/** The invariant the Messages API enforces: every tool_use is answered by a
 *  LATER tool_result, and every tool_result answers an EARLIER tool_use. */
function toolPairsIntact(messages: ChatMessage[]): boolean {
  const uses = new Map<string, number>();
  const results = new Map<string, number>();
  messages.forEach((m, i) => {
    if (!Array.isArray(m.content)) return;
    for (const b of m.content as ContentBlock[]) {
      if (b.type === "tool_use") uses.set(b.id, i);
      else if (b.type === "tool_result") results.set(b.tool_use_id, i);
    }
  });
  for (const [id, i] of uses) {
    const j = results.get(id);
    if (j === undefined || j <= i) return false;
  }
  for (const [id, i] of results) {
    const j = uses.get(id);
    if (j === undefined || j >= i) return false;
  }
  return true;
}

// ── round-trip & storage ─────────────────────────────────────────────────────

describe("persistence", () => {
  it("round-trips a thread including tool blocks and the per-turn model", () => {
    const thread = threadWith([...toolExchange(1), { kind: "offline", id: "o1", question: "when?", answer: ANSWER, at: NOW + 9 * MIN }]);
    saveThreads([thread]);
    const [back] = loadThreads();

    expect(back).toEqual(thread);
    // The raw blocks survive byte-for-byte — that is what makes a replayed
    // transcript a legal API request.
    expect(back.turns[1]).toMatchObject({ role: "assistant", model: "claude-sonnet-5" });
    expect((back.turns[1] as { content: ContentBlock[] }).content[0]).toEqual({
      type: "tool_use",
      id: "toolu_1",
      name: "best_days",
      input: { objectiveId: "contract" },
    });
  });

  it("reads absent, unreadable and corrupt storage as an empty list", () => {
    expect(loadThreads()).toEqual([]);

    store.setItem(THREADS_STORE_KEY, "{not json");
    expect(loadThreads()).toEqual([]);

    store.setItem(THREADS_STORE_KEY, JSON.stringify({ notAnArray: true }));
    expect(loadThreads()).toEqual([]);
    expect(parseThreads({ notAnArray: true })).toEqual([]);
    expect(parseThreads(null)).toEqual([]);

    delete g.localStorage;
    expect(loadThreads()).toEqual([]);
  });

  it("drops corrupt rows rather than throwing on them", () => {
    const good = threadWith(toolExchange(1));
    store.setItem(
      THREADS_STORE_KEY,
      JSON.stringify([null, 42, { title: "no id" }, good, { id: "t1", title: "dup id" }]),
    );
    const list = loadThreads();
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe("t1");
    expect(list[0].turns).toHaveLength(4);
  });

  it("drops unusable turns but keeps the rest of the thread", () => {
    const raw = {
      id: "t9",
      title: "",
      createdAt: NOW,
      updatedAt: NOW,
      turns: [
        { kind: "ai", role: "user", content: "keep me", at: NOW },
        { kind: "ai", role: "wizard", content: "bad role", at: NOW },
        { kind: "ai", role: "assistant", content: [{ type: "tool_use", name: "no id" }], at: NOW },
        { kind: "offline", question: "q", answer: null, at: NOW },
        { kind: "ai", role: "assistant", content: [{ type: "text", text: "kept" }], model: "claude-opus-5", at: NOW },
      ],
    };
    const thread = parseThread(raw)!;
    expect(thread.turns.map((t) => turnText(t))).toEqual(["keep me", "kept"]);
    // Ids are filled in deterministically, so a re-save doesn't churn them.
    expect(parseThread(raw)!.turns.map((t) => t.id)).toEqual(thread.turns.map((t) => t.id));
  });

  it("saving an empty list clears the key rather than storing []", () => {
    saveThreads([threadWith([])]);
    expect(store.getItem(THREADS_STORE_KEY)).not.toBeNull();
    saveThreads([]);
    expect(store.getItem(THREADS_STORE_KEY)).toBeNull();
  });

  it("survives a storage that throws on write — and SAYS the transcript wasn't saved", () => {
    g.localStorage = {
      getItem: () => null,
      setItem: () => {
        const e = new Error("The quota has been exceeded.");
        e.name = "QuotaExceededError";
        throw e;
      },
      removeItem: () => {},
    } as unknown as Storage;

    let outcome!: ReturnType<typeof saveThreads>;
    expect(() => (outcome = saveThreads([threadWith(toolExchange(1))]))).not.toThrow();
    // The conversation now exists only in this tab. Swallowing that is how a
    // transcript disappears without anyone being told.
    expect(outcome.persisted).toBe(false);
    expect(outcome.reason).toBe("quota");
    expect(outcome.threads).toHaveLength(1);
  });

  it("distinguishes 'storage is switched off' from 'storage is full'", () => {
    delete g.localStorage;
    expect(saveThreads([threadWith(toolExchange(1))])).toMatchObject({ persisted: false, reason: "unavailable" });

    g.localStorage = {
      getItem: () => null,
      setItem: () => {
        throw new Error("SecurityError: access denied");
      },
      removeItem: () => {},
    } as unknown as Storage;
    expect(saveThreads([threadWith(toolExchange(1))])).toMatchObject({ persisted: false, reason: "unavailable" });
  });

  it("reports a successful save as persisted, with no reason to explain", () => {
    const outcome = saveThreads([threadWith(toolExchange(1))]);
    expect(outcome.persisted).toBe(true);
    expect(outcome.reason).toBeUndefined();
    expect(loadThreads()).toHaveLength(1);
    // Clearing counts as persisted too — the store really is empty afterwards.
    expect(saveThreads([]).persisted).toBe(true);
  });
});

// ── titles ───────────────────────────────────────────────────────────────────

describe("titleFromFirstMessage", () => {
  it("keeps a short message as-is and collapses whitespace", () => {
    expect(titleFromFirstMessage("  when should I   sign?\n")).toBe("when should I sign?");
  });

  it("falls back to the untitled placeholder for empty or non-string input", () => {
    expect(titleFromFirstMessage("")).toBe(UNTITLED);
    expect(titleFromFirstMessage("   \n\t ")).toBe(UNTITLED);
    expect(titleFromFirstMessage(undefined as unknown as string)).toBe(UNTITLED);
  });

  it("truncates a very long message at a word boundary", () => {
    const long =
      "I have been offered a new job in another city and I need to work out when to hand in my notice and when to sign the new contract";
    const title = titleFromFirstMessage(long);
    expect(Array.from(title).length).toBeLessThanOrEqual(MAX_TITLE_CHARS + 1); // +1 for the ellipsis
    expect(title.endsWith("…")).toBe(true);
    expect(title).not.toMatch(/\s…$/); // no dangling space before the ellipsis
    expect(long.startsWith(title.slice(0, -1))).toBe(true);
  });

  it("truncates non-Latin text by code point, never mid-character", () => {
    const chinese = "我想知道什麼時候是簽合約的好日子".repeat(6); // no spaces at all
    const title = titleFromFirstMessage(chinese);
    expect(Array.from(title).length).toBe(MAX_TITLE_CHARS + 1);
    expect(title.endsWith("…")).toBe(true);
    expect(chinese.startsWith(title.slice(0, -1))).toBe(true);
    // A surrogate pair must never be split down the middle.
    const emoji = "🎯".repeat(80);
    const emojiTitle = titleFromFirstMessage(emoji);
    expect(emojiTitle.slice(0, -1)).toBe("🎯".repeat(MAX_TITLE_CHARS));
    expect(emojiTitle).not.toContain("�");
  });

  it("strips control characters instead of embedding them in the title", () => {
    expect(titleFromFirstMessage("sign\u0000the\u0007contract")).toBe("sign the contract");
  });

  it("is deterministic — no clock, no randomness", () => {
    const text = "when is a good day to launch the shop?";
    expect(titleFromFirstMessage(text)).toBe(titleFromFirstMessage(text));
  });
});

describe("titleFor / firstUserText", () => {
  it("prefers the thread's own title, then a derived one, then the placeholder", () => {
    expect(titleFor(threadWith(toolExchange(1), { title: "Signing day" }))).toBe("Signing day");
    expect(titleFor(threadWith(toolExchange(1), { title: "" }))).toBe("question 1");
    expect(titleFor(threadWith([], { title: "" }))).toBe(UNTITLED);
    expect(titleFor(threadWith([], { title: UNTITLED }))).toBe(UNTITLED);
  });

  it("skips a tool_result-only user message when looking for the question", () => {
    const orphan = toolExchange(1).slice(2); // starts with the tool_result user message
    expect(firstUserText(threadWith(orphan))).toBe("");
    expect(firstUserText(threadWith([{ kind: "offline", id: "o", question: "offline q", answer: ANSWER, at: NOW }]))).toBe(
      "offline q",
    );
  });
});

// ── thread + list operations ─────────────────────────────────────────────────

describe("createThread / appendTurn", () => {
  it("creates an empty, stamped thread with an injectable id source", () => {
    const t = createThread(NOW, { rand: () => 0.5 });
    expect(t).toEqual({ id: newThreadId(NOW, () => 0.5), title: "", createdAt: NOW, updatedAt: NOW, turns: [] });
    expect(newThreadId(NOW, () => 0.5)).toBe(newThreadId(NOW, () => 0.5)); // deterministic under a fixed rand
  });

  it("stamps time, assigns unique ids and titles from the first user message", () => {
    let t = createThread(NOW, { rand: () => 0.5 });
    t = appendTurn(t, aiTurn("user", "when should I sign the lease?"), NOW);
    t = appendTurn(t, aiTurn("assistant", [{ type: "text", text: "Thursday." }], "claude-opus-5"), NOW + 1);

    expect(t.title).toBe("when should I sign the lease?");
    expect(t.updatedAt).toBe(NOW + 1);
    expect(new Set(t.turns.map((x) => x.id)).size).toBe(2);
    expect((t.turns[1] as { model?: string }).model).toBe("claude-opus-5");
    expect((t.turns[0] as { model?: string }).model).toBeUndefined();
  });

  it("does not re-title a thread the user has named", () => {
    let t = createThread(NOW, { id: "x", title: "My lease" });
    t = appendTurn(t, aiTurn("user", "a totally different question"), NOW);
    expect(t.title).toBe("My lease");
  });

  it("records offline exchanges in the same thread as AI turns", () => {
    let t = createThread(NOW, { id: "x" });
    t = appendTurn(t, offlineTurn("when should I sign?", ANSWER), NOW);
    t = appendTurn(t, aiTurn("user", "why that day?"), NOW + MIN);
    expect(t.turns.map((x) => x.kind)).toEqual(["offline", "ai"]);
    expect(t.title).toBe("when should I sign?");
  });

  it("appendMessages stamps every assistant turn with the model that produced it", () => {
    let t = createThread(NOW, { id: "x" });
    t = appendMessages(t, [{ role: "user", content: "hi" }, { role: "assistant", content: "hello" }], "claude-sonnet-5", NOW);
    t = appendMessages(t, [{ role: "user", content: "again" }, { role: "assistant", content: "still here" }], "claude-haiku-4-5", NOW + MIN);

    const models = t.turns.map((x) => (x.kind === "ai" ? x.model : undefined));
    expect(models).toEqual([undefined, "claude-sonnet-5", undefined, "claude-haiku-4-5"]);
    // Switching model CONTINUES the thread — one conversation, two models.
    expect(t.turns).toHaveLength(4);
  });
});

describe("list operations", () => {
  const a = threadWith([], { id: "a", title: "A", updatedAt: NOW });
  const b = threadWith([], { id: "b", title: "B", updatedAt: NOW + MIN });
  const c = threadWith([], { id: "c", title: "C", updatedAt: NOW + 2 * MIN, pinned: true });

  it("renames, deletes, pins and upserts without mutating the input", () => {
    const list = [a, b];
    expect(renameThread(list, "a", "  Renamed  ", NOW + 5)[0]).toMatchObject({ title: "Renamed", updatedAt: NOW + 5 });
    expect(deleteThread(list, "a").map((t) => t.id)).toEqual(["b"]);
    expect(setPinned(list, "b", true, NOW + 5)[1].pinned).toBe(true);
    expect(setPinned([{ ...b, pinned: true }], "b", false, NOW + 5)[0].pinned).toBeUndefined();
    expect(upsertThread(list, { ...a, title: "A2" })[0].title).toBe("A2");
    expect(upsertThread(list, threadWith([], { id: "z" })).map((t) => t.id)).toEqual(["z", "a", "b"]);
    expect(list).toEqual([a, b]); // untouched
  });

  it("sorts pinned first, then most recently updated", () => {
    expect(sortThreads([a, b, c]).map((t) => t.id)).toEqual(["c", "b", "a"]);
  });

  it("merges local and cloud copies, newest updatedAt winning", () => {
    const local = [{ ...a, title: "local" }, b];
    const cloud = [{ ...a, title: "cloud", updatedAt: NOW + 10 * MIN }, threadWith([], { id: "d", updatedAt: NOW })];
    const merged = mergeThreads(local, cloud);
    expect(merged.map((t) => t.id).sort()).toEqual(["a", "b", "d"]);
    expect(merged.find((t) => t.id === "a")!.title).toBe("cloud");
  });
});

// ── replay window ────────────────────────────────────────────────────────────

describe("replayWindow", () => {
  it("replays the whole conversation when it fits the budget", () => {
    const thread = threadWith([...toolExchange(1), ...toolExchange(2)]);
    const w = replayWindow(thread);
    expect(w.messages).toHaveLength(8);
    expect(w.omittedTurns).toBe(0);
    expect(w.omittedFrom).toBeNull();
    expect(w.omittedThrough).toBeNull();
    expect(w.overBudget).toBe(false);
    expect(toolPairsIntact(w.messages)).toBe(true);
  });

  // ── provenance ─────────────────────────────────────────────────────────────
  //
  // Every staleness defence downstream reads `at` and `model` off the replayed
  // messages: the `(sent YYYY-MM-DD)` prefix, the earliest-turn line in the
  // system prompt, and the "another model wrote this" line. A projection that
  // emits a bare `{ role, content }` turns all three off silently — and the
  // prompt goes on describing markers that are never added.

  it("carries each turn's date and model onto the replayed message", () => {
    const thread = threadWith(toolExchange(1));
    const w = replayWindow(thread);

    expect(w.messages.map((m) => m.at)).toEqual([
      iso(NOW + MIN),
      iso(NOW + MIN + 1),
      iso(NOW + MIN + 2),
      iso(NOW + MIN + 3),
    ]);
    // `at` is a STRING, not the raw epoch ms of the stored turn: chatClient
    // reads the day with `.slice(0, 10)`.
    for (const m of w.messages) {
      expect(typeof m.at).toBe("string");
      expect(m.at!.slice(0, 10)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
    // The model that wrote a turn travels with it; user turns claim no model.
    expect(w.messages.map((m) => m.model)).toEqual([undefined, "claude-sonnet-5", undefined, "claude-sonnet-5"]);
  });

  it("dates an offline exchange, and keeps that date through a merge", () => {
    const thread = threadWith([
      { kind: "offline", id: "o1", question: "q1", answer: ANSWER, at: NOW - 3 * DAY },
      { kind: "offline", id: "o2", question: "q2", answer: ANSWER, at: NOW - 1 * DAY },
    ]);
    const w = replayWindow(thread);
    expect(w.messages).toHaveLength(1);
    // The merged message keeps the EARLIER stamp — it opens with the older text,
    // and the date marker lands on what it opens with.
    expect(w.messages[0].at).toBe(iso(NOW - 3 * DAY));
  });

  it("leaves an unstamped turn undated rather than inventing 1970", () => {
    const w = replayWindow(threadWith([{ kind: "ai", id: "u", role: "user", content: "no stamp", at: 0 }]));
    expect(w.messages).toHaveLength(1);
    expect(w.messages[0].at).toBeUndefined();
  });

  it("keeps tool_use and tool_result paired at EVERY possible budget boundary", () => {
    const thread = threadWith([...toolExchange(1), ...toolExchange(2), ...toolExchange(3), ...toolExchange(4)]);
    const full = estimateTokens(replayWindow(thread, 1e9).messages);

    for (let budget = 1; budget <= full + 20; budget++) {
      const w = replayWindow(thread, budget);
      expect(toolPairsIntact(w.messages), `budget ${budget} split a tool pair`).toBe(true);
      // A window may never open on an assistant message or an orphan result.
      if (w.messages.length > 0) {
        expect(w.messages[0].role, `budget ${budget} started with a non-user message`).toBe("user");
        expect(
          Array.isArray(w.messages[0].content) &&
            (w.messages[0].content as ContentBlock[]).some((b) => b.type === "tool_result"),
          `budget ${budget} started on an orphaned tool_result`,
        ).toBe(false);
      }
      // Roles strictly alternate, so the API can never see two user turns in a row.
      for (let i = 1; i < w.messages.length; i++) {
        expect(w.messages[i].role, `budget ${budget} repeated a role`).not.toBe(w.messages[i - 1].role);
      }
      // Nothing kept is silently unaccounted for.
      expect(w.omittedTurns).toBe(thread.turns.length - countTurnsIn(w));
    }

    function countTurnsIn(w: ReturnType<typeof replayWindow>): number {
      return thread.turns.length - w.omittedTurns;
    }
  });

  it("respects the budget, and reports the one case where it cannot", () => {
    const thread = threadWith([...toolExchange(1), ...toolExchange(2), ...toolExchange(3)]);
    const oneExchange = estimateTokens(replayWindow(threadWith(toolExchange(3)), 1e9).messages);

    const w = replayWindow(thread, oneExchange + 5);
    expect(w.estimatedTokens).toBeLessThanOrEqual(oneExchange + 5);
    expect(w.overBudget).toBe(false);
    expect(w.omittedTurns).toBe(8);

    // A single exchange bigger than the whole budget is sent whole — splitting
    // it would break tool pairing — and `overBudget` says so.
    const tiny = replayWindow(thread, 1);
    expect(tiny.overBudget).toBe(true);
    expect(tiny.messages).toHaveLength(4);
    expect(toolPairsIntact(tiny.messages)).toBe(true);
  });

  it("reports exactly what was left out, as data for the panel to phrase", () => {
    const thread = threadWith([...toolExchange(1), ...toolExchange(2), ...toolExchange(3)]);
    const w = replayWindow(thread, estimateTokens(replayWindow(threadWith(toolExchange(3)), 1e9).messages) + 5);
    // The wording lives with the marker that shows it (transcript.boundaryNote);
    // this module owns the counts and the dates it is drawn from.
    expect(w.omittedTurns).toBe(8);
    expect(w.omittedFrom).toBe(thread.turns[0].at);
    expect(w.omittedThrough).toBe(thread.turns[7].at);
  });

  it("never replays an offline answer as an assistant message", () => {
    const thread = threadWith([
      { kind: "offline", id: "o1", question: "when should I sign?", answer: ANSWER, at: NOW },
      { kind: "ai", id: "q", role: "user", content: "why that day?", at: NOW + MIN },
      { kind: "ai", id: "a", role: "assistant", content: [{ type: "text", text: "Because…" }], model: "claude-opus-5", at: NOW + MIN + 1 },
    ]);
    const w = replayWindow(thread);

    const assistantText = w.messages
      .filter((m) => m.role === "assistant")
      .map((m) => (typeof m.content === "string" ? m.content : JSON.stringify(m.content)))
      .join(" ");
    expect(assistantText).not.toContain(ANSWER.title);
    expect(assistantText).not.toContain(ANSWER.paragraphs[0]);

    // It IS carried over — the conversation survives offline → AI — but as a
    // dated, clearly attributed user message.
    const userText = w.messages
      .filter((m) => m.role === "user")
      .map((m) => (typeof m.content === "string" ? m.content : ""))
      .join(" ");
    expect(userText).toContain(ANSWER.title);
    expect(userText).toContain("Offline advisor");
    expect(userText).toContain("2026-07-26");
  });

  it("merges consecutive offline exchanges so roles still alternate", () => {
    const thread = threadWith([
      { kind: "offline", id: "o1", question: "q1", answer: ANSWER, at: NOW },
      { kind: "offline", id: "o2", question: "q2", answer: ANSWER, at: NOW + MIN },
      { kind: "offline", id: "o3", question: "q3", answer: ANSWER, at: NOW + 2 * MIN },
    ]);
    const w = replayWindow(thread);
    expect(w.messages).toHaveLength(1);
    expect(w.messages[0].role).toBe("user");
    expect(w.messages[0].content).toContain("q1");
    expect(w.messages[0].content).toContain("q3");
    expect(w.omittedTurns).toBe(0);
  });

  it("drops an unresolved trailing tool call rather than sending an illegal request", () => {
    const aborted = toolExchange(2).slice(0, 2); // question + assistant(tool_use), no result
    const thread = threadWith([...toolExchange(1), ...aborted]);
    const w = replayWindow(thread);

    expect(toolPairsIntact(w.messages)).toBe(true);
    // The unanswered assistant tool_use is gone (the API requires its result to
    // follow); the question that provoked it is kept — it is real context, and
    // it keeps the date it was asked on.
    expect(w.messages[w.messages.length - 1]).toEqual({
      role: "user",
      content: "question 2",
      at: iso(NOW + 2 * MIN),
    });
    expect(w.omittedTurns).toBe(1);
  });

  // ── an orphan is repaired WHERE IT IS ──────────────────────────────────────
  //
  // Pairing used to be recomputed over the whole window but repaired by popping
  // the tail, so an orphaned tool_use near the start could only be reached by
  // deleting every later turn: one interrupted call silently erased the rest of
  // the conversation from the replay. Where the fault sits must not decide how
  // much survives.

  /** A question + an assistant turn that says something and then calls a tool
   *  whose result never arrived (a max_tokens truncation, or Stop). */
  const orphanPair = (n: number, at: number): ChatTurn[] => [
    { kind: "ai", id: `oq${n}`, role: "user", content: `orphan question ${n}`, at },
    {
      kind: "ai",
      id: `oa${n}`,
      role: "assistant",
      content: [
        { type: "text", text: `let me check ${n}` },
        { type: "tool_use", id: `toolu_orphan_${n}`, name: "best_days", input: {} },
      ],
      model: "claude-sonnet-5",
      at: at + 1,
    },
  ];

  const textOf = (w: ReturnType<typeof replayWindow>) =>
    w.messages.map((m) => (typeof m.content === "string" ? m.content : JSON.stringify(m.content))).join("\n");

  it.each([
    ["START", (o: ChatTurn[]) => [...o, ...toolExchange(1), ...toolExchange(2), ...toolExchange(3)]],
    ["MIDDLE", (o: ChatTurn[]) => [...toolExchange(1), ...o, ...toolExchange(2), ...toolExchange(3)]],
    ["END", (o: ChatTurn[]) => [...toolExchange(1), ...toolExchange(2), ...toolExchange(3), ...o]],
  ])("an orphaned tool_use at the %s costs one block, not the rest of the thread", (_where, build) => {
    const thread = threadWith(build(orphanPair(9, NOW - 10 * MIN)));
    const w = replayWindow(thread);

    expect(toolPairsIntact(w.messages)).toBe(true);
    // Every complete exchange still travels, wherever the orphan was.
    const sent = textOf(w);
    for (const n of [1, 2, 3]) {
      expect(sent, `exchange ${n} was deleted by an unrelated orphan`).toContain(`question ${n}`);
      expect(sent).toContain(`answer ${n}`);
    }
    // The orphan's own question and text survive — they are real context; only
    // the unanswerable call is removed.
    expect(sent).toContain("orphan question 9");
    expect(sent).toContain("let me check 9");
    expect(sent).not.toContain("toolu_orphan_9");
    // Nothing was quietly dropped: the only unrepresented turn is none at all,
    // since the orphan's message kept its text block.
    expect(w.omittedTurns).toBe(0);
  });

  it("drops only the message that was nothing but an orphan, keeping later turns", () => {
    const orphanOnly: ChatTurn[] = [
      { kind: "ai", id: "oq", role: "user", content: "orphan question", at: NOW - 10 * MIN },
      {
        kind: "ai",
        id: "oa",
        role: "assistant",
        content: [{ type: "tool_use", id: "toolu_lonely", name: "best_days", input: {} }],
        model: "claude-sonnet-5",
        at: NOW - 10 * MIN + 1,
      },
    ];
    const thread = threadWith([...orphanOnly, ...toolExchange(1), ...toolExchange(2)]);
    const w = replayWindow(thread);

    expect(toolPairsIntact(w.messages)).toBe(true);
    expect(w.omittedTurns).toBe(1); // the assistant message, and only it
    const sent = textOf(w);
    expect(sent).toContain("orphan question");
    expect(sent).toContain("answer 1");
    expect(sent).toContain("answer 2");
    // Roles still alternate after the removal in the middle.
    for (let i = 1; i < w.messages.length; i++) expect(w.messages[i].role).not.toBe(w.messages[i - 1].role);
  });

  it("drops a tool_result whose call is gone, wherever it sits", () => {
    const stray: ChatTurn = {
      kind: "ai",
      id: "stray",
      role: "user",
      content: [{ type: "tool_result", tool_use_id: "toolu_missing", content: "{}" }],
      at: NOW + 30 * MIN,
    };
    const thread = threadWith([...toolExchange(1), stray, ...toolExchange(2)]);
    const w = replayWindow(thread);
    expect(toolPairsIntact(w.messages)).toBe(true);
    expect(textOf(w)).not.toContain("toolu_missing");
    expect(textOf(w)).toContain("answer 2");
  });

  it("returns an empty window for an empty thread, and for one that is only an orphan fragment", () => {
    expect(replayWindow(threadWith([])).messages).toEqual([]);
    const orphan = threadWith(toolExchange(1).slice(2)); // tool_result first
    const w = replayWindow(orphan);
    expect(w.messages).toEqual([]);
    expect(w.omittedTurns).toBe(2);
  });

  it("is deterministic and does not mutate the thread", () => {
    const thread = threadWith([...toolExchange(1), ...toolExchange(2)]);
    const snapshot = JSON.parse(JSON.stringify(thread));
    const a = replayWindow(thread, 500);
    const b = replayWindow(thread, 500);
    expect(a).toEqual(b);
    expect(thread).toEqual(snapshot);
  });

  it("estimates tokens at roughly characters/4 and has a documented default", () => {
    expect(CHARS_PER_TOKEN).toBe(4);
    expect(DEFAULT_REPLAY_BUDGET_TOKENS).toBeGreaterThan(1000);
    const msgs: ChatMessage[] = [{ role: "user", content: "x".repeat(400) }];
    expect(estimateTokens(msgs)).toBe(104); // 400/4 + one message envelope
    expect(replayWindow(threadWith(toolExchange(1))).estimatedTokens).toBe(
      estimateTokens(replayWindow(threadWith(toolExchange(1))).messages),
    );
  });

  it("a window ending on a user turn needs no folding — the wire stays alternating", () => {
    // An offline-only thread replays as a single user message; so does a
    // question whose answer never arrived. `runChat` then appends today's
    // question, and `prepareHistory` merges the pair.
    const offlineOnly = replayWindow(
      threadWith([{ kind: "offline", id: "o1", question: "when should I sign?", answer: ANSWER, at: NOW - 6 * DAY }]),
    );
    const asRunChatBuildsIt: ChatMessage[] = [
      ...offlineOnly.messages,
      { role: "user", content: "why that day?", at: "2026-07-26" },
    ];
    const wire = prepareHistory(asRunChatBuildsIt, "2026-07-26");

    expect(wire).toHaveLength(1);
    expect(wire[0].role).toBe("user");
    // The OLD half is dated and today's question is not — the merge keeps the
    // marker on the first block, which is the older text. Folding them into one
    // string (what the deleted `withUserMessage` did) would have stamped the old
    // words with today's date instead.
    const blocks = wire[0].content as ContentBlock[];
    expect(blocks[0]).toMatchObject({ type: "text" });
    expect((blocks[0] as { text: string }).text).toContain("(sent 2026-07-20)");
    expect((blocks[blocks.length - 1] as { text: string }).text).toBe("why that day?");
  });
});

// ── the seam: what the store projects is what the wire carries ───────────────
//
// The store can hold provenance perfectly and still lose it at the projection,
// which is exactly where it was lost before: `replayWindow` emitted bare
// `{ role, content }` messages, so no replayed turn was ever dated, `(sent …)`
// was never added, and the system prompt went on telling the model that marked
// turns exist. Everything below crosses replayWindow → prepareHistory / runChat
// on a thread whose turns are genuinely days apart.

describe("replayWindow → the request body", () => {
  /** A conversation spread over three weeks, answered by two different models. */
  function oldThread(): ChatThread {
    return threadWith(
      [
        { kind: "ai", id: "q1", role: "user", content: "when should I sign the lease?", at: NOW - 21 * DAY },
        {
          kind: "ai",
          id: "a1",
          role: "assistant",
          content: [{ type: "text", text: "The engine likes [2026-07-09]." }],
          model: "claude-sonnet-5",
          at: NOW - 21 * DAY + MIN,
        },
        { kind: "ai", id: "q2", role: "user", content: "and the hour?", at: NOW - 7 * DAY },
        {
          kind: "ai",
          id: "a2",
          role: "assistant",
          content: [{ type: "text", text: "Mid-morning." }],
          model: "claude-haiku-4-5",
          at: NOW - 7 * DAY + MIN,
        },
      ],
      { updatedAt: NOW - 7 * DAY + MIN },
    );
  }

  const TODAY = "2026-07-26";

  it("marks every replayed user turn with the day it was actually sent", () => {
    const w = replayWindow(oldThread());
    const wire = prepareHistory(w.messages, TODAY);

    expect(wire[0].content).toContain("(sent 2026-07-05)"); // three weeks ago
    expect(wire[2].content).toContain("(sent 2026-07-19)"); // last week
    // …and nothing but role/content reaches the API.
    for (const m of wire) expect(Object.keys(m).sort()).toEqual(["content", "role"]);
    // The stored thread is untouched: the markers exist only on the wire.
    expect(turnText(oldThread().turns[0])).toBe("when should I sign the lease?");
  });

  it("a turn sent TODAY carries no marker, so the marker means what it says", () => {
    const t = threadWith([{ kind: "ai", id: "q", role: "user", content: "how is today?", at: NOW }]);
    const wire = prepareHistory(replayWindow(t).messages, TODAY);
    expect(wire[0].content).toBe("how is today?");
  });

  it("tells the model how far back the transcript reaches and who else wrote it", async () => {
    const w = replayWindow(oldThread());
    const bodies: { system: string; messages: { role: string; content: unknown }[] }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string, init: RequestInit) => {
        bodies.push(JSON.parse(init.body as string));
        return Promise.resolve(textTurn("Let me check that again."));
      }),
    );

    await runChat(w.messages, "is that still right?", { model: "claude-opus-5", apiKey: "sk-test" }, stubCtx(TODAY), {}, undefined, {
      prunedTurns: w.omittedTurns,
    });

    const body = bodies[0];
    // earliestTurnDay(prior) — non-null, and the real date of the oldest turn.
    expect(body.system).toContain("The replayed transcript starts on 2026-07-05");
    // earlierModels(prior, current) — non-empty, naming both earlier models.
    expect(body.system).toContain("claude-sonnet-5");
    expect(body.system).toContain("claude-haiku-4-5");
    expect(body.system).not.toContain("(claude-opus-5"); // the current model isn't "earlier"
    // The markers really are on the wire, not just in the prompt's description.
    expect(JSON.stringify(body.messages)).toContain("(sent 2026-07-05)");
    // Today's question is the only undated turn.
    expect(body.messages[body.messages.length - 1].content).toBe("is that still right?");
  });

  it("without provenance none of that can be said — which is the bug this guards", async () => {
    // The old projection, reproduced exactly: role + content, nothing else.
    const stripped: ChatMessage[] = replayWindow(oldThread()).messages.map((m) => ({ role: m.role, content: m.content }));
    const bodies: { system: string; messages: { role: string; content: unknown }[] }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string, init: RequestInit) => {
        bodies.push(JSON.parse(init.body as string));
        return Promise.resolve(textTurn("ok"));
      }),
    );

    await runChat(stripped, "is that still right?", { model: "claude-opus-5", apiKey: "sk-test" }, stubCtx(TODAY), {});

    expect(bodies[0].system).not.toContain("The replayed transcript starts on");
    expect(JSON.stringify(bodies[0].messages)).not.toContain("(sent ");
  });
});

// ── pruning ──────────────────────────────────────────────────────────────────

describe("pruneThreads", () => {
  const many = (n: number, over: (i: number) => Partial<ChatThread> = () => ({})) =>
    Array.from({ length: n }, (_, i) =>
      threadWith([{ kind: "ai", id: `x${i}`, role: "user", content: `q${i}`, at: NOW + i }], {
        id: `t${i}`,
        title: `T${i}`,
        updatedAt: NOW + i * MIN,
        ...over(i),
      }),
    );

  it("keeps the newest threads, drops the oldest, and reports what went", () => {
    const result = pruneThreads(many(6), { maxThreads: 4, maxTurnsPerThread: 100 }, NOW);
    expect(result.threads.map((t) => t.id)).toEqual(["t2", "t3", "t4", "t5"]);
    expect(result.removedThreads.map((t) => t.id)).toEqual(["t0", "t1"]);
    expect(result.removedThreads[0]).toMatchObject({ title: "T0", turns: 1 });
    expect(result.prunedAt).toBe(NOW);
  });

  it("never destroys a pinned thread, however old", () => {
    const threads = many(6, (i) => (i < 2 ? { pinned: true } : {}));
    const result = pruneThreads(threads, { maxThreads: 3, maxTurnsPerThread: 100 }, NOW);
    expect(result.threads.map((t) => t.id)).toContain("t0");
    expect(result.threads.map((t) => t.id)).toContain("t1");
    expect(result.removedThreads.every((t) => t.id !== "t0" && t.id !== "t1")).toBe(true);
  });

  it("always leaves at least one unpinned thread, even when pinned threads fill the cap", () => {
    const threads = many(4, (i) => (i < 3 ? { pinned: true } : {}));
    const result = pruneThreads(threads, { maxThreads: 2, maxTurnsPerThread: 100 }, NOW);
    expect(result.threads.map((t) => t.id)).toEqual(["t0", "t1", "t2", "t3"]);
    expect(result.removedThreads).toEqual([]);
  });

  it("preserves the caller's list order for what survives", () => {
    const shuffled = [many(4)[3], many(4)[0], many(4)[2], many(4)[1]];
    const result = pruneThreads(shuffled, { maxThreads: 3, maxTurnsPerThread: 100 }, NOW);
    expect(result.threads.map((t) => t.id)).toEqual(["t3", "t2", "t1"]);
  });

  it("trims the oldest turns at an exchange boundary and reports the count", () => {
    const thread = threadWith([...toolExchange(1), ...toolExchange(2), ...toolExchange(3)], { id: "long" });
    const result = pruneThreads([thread], { maxThreads: 10, maxTurnsPerThread: 6 }, NOW);
    const trimmed = result.threads[0];

    expect(result.trimmedTurns).toEqual([{ id: "long", title: "A thread", removed: 8 }]);
    expect(trimmed.turns).toHaveLength(4);
    // Cut at a question, so the survivor is still a coherent transcript.
    expect(trimmed.turns[0].id).toBe("q3");
    expect(toolPairsIntact(replayWindow(trimmed).messages)).toBe(true);
  });

  it("does nothing when everything is within the bounds", () => {
    const threads = many(3);
    const result = pruneThreads(threads, DEFAULT_THREAD_LIMITS, NOW);
    expect(result.threads).toEqual(threads);
    expect(result.removedThreads).toEqual([]);
    expect(result.trimmedTurns).toEqual([]);
    expect(pruneNote(result)).toBe("");
  });

  it("is deterministic and does not mutate its input", () => {
    const threads = many(6);
    const snapshot = JSON.parse(JSON.stringify(threads));
    const a = pruneThreads(threads, { maxThreads: 3, maxTurnsPerThread: 2 }, NOW);
    const b = pruneThreads(threads, { maxThreads: 3, maxTurnsPerThread: 2 }, NOW);
    expect(a).toEqual(b);
    expect(threads).toEqual(snapshot);
  });

  it("explains pruning honestly, with no tier or upsell wording", () => {
    const result = pruneThreads(many(6), { maxThreads: 4, maxTurnsPerThread: 100 }, NOW);
    const note = pruneNote(result);
    expect(note).toContain("removed 2 older conversations");
    expect(note).toContain("Pinned conversations are never removed.");
    expect(note.toLowerCase()).not.toMatch(/upgrade|plan|tier|premium|pro\b|subscribe/);
  });

  it("the default bounds are high enough to be an abuse bound, not a product limit", () => {
    expect(DEFAULT_THREAD_LIMITS.maxThreads).toBeGreaterThanOrEqual(50);
    expect(DEFAULT_THREAD_LIMITS.maxTurnsPerThread).toBeGreaterThanOrEqual(200);
  });
});

// ── the whole point ──────────────────────────────────────────────────────────

describe("memory is ours, not the provider's", () => {
  it("a reload continues the conversation, and a model switch does not break it", () => {
    let t = createThread(NOW, { id: "conv" });
    t = appendMessages(t, [{ role: "user", content: "when should I sign?" }, { role: "assistant", content: "Thursday." }], "claude-sonnet-5", NOW);
    saveThreads([t]);

    // …reload, different model…
    const reloaded = loadThreads()[0];
    const w = replayWindow(reloaded);
    // Provenance survives the round-trip through storage: the replay says WHEN
    // each turn was said and WHICH model said it, which is what lets the next
    // request date the transcript and name the model that wrote it.
    expect(w.messages).toEqual([
      { role: "user", content: "when should I sign?", at: iso(NOW) },
      { role: "assistant", content: "Thursday.", at: iso(NOW), model: "claude-sonnet-5" },
    ]);

    // Exactly what the panel does: hand `runChat` the replayed window, then
    // append only the tail it returns.
    const returnedByRunChat: ChatMessage[] = [
      ...w.messages,
      { role: "user", content: "and the hour?" },
      { role: "assistant", content: "Mid-morning." },
    ];
    const continued = appendMessages(reloaded, returnedByRunChat.slice(w.messages.length), "claude-opus-5", NOW + MIN);
    expect(continued.turns).toHaveLength(4);
    expect(continued.turns.map((x) => (x.kind === "ai" ? x.model : null))).toEqual([
      undefined,
      "claude-sonnet-5",
      undefined,
      "claude-opus-5",
    ]);
    // One conversation, two models, full context replayed from our own store.
    expect(replayWindow(continued).messages).toHaveLength(4);
    expect(replayWindow(continued).omittedTurns).toBe(0);
  });
});
