/**
 * THE SEAM TEST — stored thread → replay window → wire.
 *
 * Why this file exists (read before changing anything in it):
 *
 * The chat-memory feature is owned by two modules that were each well tested in
 * isolation and NEVER tested together:
 *
 *   `src/ui/chat/threadStore.ts`  — stores turns and projects a bounded
 *                                   `replayWindow(...)` of `ChatMessage`s.
 *   `src/ai/chatClient.ts`        — turns a `ChatMessage[]` into a legal
 *                                   Messages API body (`prepareHistory`), and
 *                                   composes the system block from it.
 *
 * `tests/aiChatClient.test.ts` fed the client HAND-BUILT `prior` arrays complete
 * with `at` and `model`, so every marker, date and model-switch assertion passed
 * against data the app never actually produced. `tests/chatThreads.test.ts`
 * asserted plenty about `replayWindow(...)`, but never once about `at` on the
 * messages it returns. Both suites were green while the real path — the only one
 * a user ever exercises — carried no dates and no models at all.
 *
 * So: NOTHING in this file may hand-build a `ChatMessage[]` and feed it to the
 * client. Every wire assertion here starts from `createThread` / `appendTurn` /
 * `appendMessages`, goes through the real `saveThreads` / `loadThreads`, and only
 * then through `replayWindow(...).messages`. If a helper works but the app does
 * not, this file is what fails.
 *
 * It covers the three blockers that seam produced:
 *   1. dates and models lost between store and client (staleness + model switch
 *      signals silently absent from every real request);
 *   2. `balanceTail` deleting live turns to resolve an orphaned `tool_use`;
 *   3. a reading computed on an earlier date replayed with nothing to mark it as
 *      belonging to that date.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { buildFourPillars, MomentInput } from "../src/engine/sexagenary.ts";
import { buildBaziChart, computeDaYun } from "../src/engine/bazi.ts";
import { ZIPING_DEFAULT } from "../src/engine/conventions.ts";
import { evaluateDecision } from "../src/engine/decision.ts";
import { objectiveById } from "../src/engine/objectives.ts";
import { AiToolContext, executeTool } from "../src/ai/tools.ts";
import { ChatMessage, ContentBlock, isoDay, prepareHistory, runChat } from "../src/ai/chatClient.ts";
import {
  DEFAULT_REPLAY_BUDGET_TOKENS,
  aiTurn,
  appendMessages,
  appendTurn,
  createThread,
  estimateTokens,
  loadThreads,
  replayWindow,
  saveThreads,
  type ChatThread,
} from "../src/ui/chat/threadStore.ts";

// ── the environment: real storage semantics, no real clock ───────────────────

/** The test env is `node`; this is the same in-memory stub `chatThreads.test.ts`
 *  uses, so `saveThreads`/`loadThreads` are exercised for real (JSON round-trip
 *  and all) rather than mocked away. */
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

beforeEach(() => {
  g.localStorage = new MemoryStorage() as unknown as Storage;
});
afterEach(() => {
  delete g.localStorage;
  delete g.window;
  delete g.StorageEvent;
  vi.unstubAllGlobals();
});

// Three dates: two in the past, one "today". Midday UTC so the day part of the
// stamp is unambiguous in any test-runner timezone.
const JUN12 = "2026-06-12";
const JUL02 = "2026-07-02";
const TODAY = "2026-07-08";
const at = (iso: string, minute = 0) => Date.parse(`${iso}T12:00:00.000Z`) + minute * 60_000;

// ── a real tool context (the engine is untouched; we only read it) ───────────

const birth: MomentInput = { year: 1990, month: 6, day: 15, hour: 14, minute: 30, tzOffsetMinutes: 480 };
const fp = buildFourPillars(birth, ZIPING_DEFAULT);
const chart = buildBaziChart(fp);
const dayun = computeDaYun(fp, "male");

const mkReq = (id: string, days: number, start: { year: number; month: number; day: number }) => ({
  birth,
  sex: "male" as const,
  convention: ZIPING_DEFAULT,
  objective: objectiveById(id),
  window: { start, days, tzOffsetMinutes: 480 },
  options: { sweeps: false },
});

/** A tool context pinned to a given "today" — so a tool result can be produced
 *  as it genuinely was on an earlier date, `computedOn` and all. */
function ctxOn(todayIso: string): AiToolContext {
  const [y, m, d] = todayIso.split("-").map(Number);
  return {
    chart,
    dayun,
    birth: { year: 1990, month: 6, day: 15 },
    todayIso,
    evaluate: (id, win) => evaluateDecision(mkReq(id, win, { year: y, month: m, day: d })),
    evaluateDay: (id, iso) => {
      const [yy, mm, dd] = iso.split("-").map(Number);
      return evaluateDecision(mkReq(id, 1, { year: yy, month: mm, day: dd }));
    },
  };
}

const ctx = ctxOn(TODAY);

// ── the API's rules, asserted on the actual request body ─────────────────────

type WireMessage = { role: string; content: unknown };

/**
 * Everything the Messages API enforces, checked on what we would really POST.
 * An unmatched `tool_use`/`tool_result` is a 400, so "never emit one" is a hard
 * invariant, not a preference.
 */
function expectValidWire(messages: WireMessage[]): void {
  if (messages.length > 0) expect(messages[0].role).toBe("user");
  for (let i = 1; i < messages.length; i++) expect(messages[i].role).not.toBe(messages[i - 1].role);

  for (const m of messages) {
    // Local bookkeeping (`at`, `model`) must never reach the wire, and no
    // message may be empty.
    expect(Object.keys(m as object).sort()).toEqual(["content", "role"]);
    if (Array.isArray(m.content)) expect(m.content.length).toBeGreaterThan(0);
    else expect(String(m.content).length).toBeGreaterThan(0);
  }

  for (let i = 0; i < messages.length; i++) {
    const content = messages[i].content;
    if (!Array.isArray(content)) continue;
    const calls = (content as ContentBlock[]).filter((b) => b.type === "tool_use").map((b) => (b as { id: string }).id);
    const next = messages[i + 1];
    const answers = Array.isArray(next?.content)
      ? (next!.content as ContentBlock[]).filter((b) => b.type === "tool_result").map((b) => (b as { tool_use_id: string }).tool_use_id)
      : [];
    // Every tool_use is answered by the VERY NEXT message, and by nothing else.
    expect([...answers].sort()).toEqual([...calls].sort());

    const results = (content as ContentBlock[]).filter((b) => b.type === "tool_result");
    if (results.length === 0) continue;
    // tool_results lead their message, carry a body, and answer the message before.
    expect((content as ContentBlock[]).slice(0, results.length).every((b) => b.type === "tool_result")).toBe(true);
    for (const r of results) expect(String((r as { content: string }).content).length).toBeGreaterThan(0);
    const prior = messages[i - 1];
    const priorCalls = Array.isArray(prior?.content)
      ? (prior!.content as ContentBlock[]).filter((b) => b.type === "tool_use").map((b) => (b as { id: string }).id)
      : [];
    for (const r of results) expect(priorCalls).toContain((r as { tool_use_id: string }).tool_use_id);
  }
}

/** Structural invariants that hold on the replay window itself, whatever
 *  strategy is used to repair an orphaned tool_use downstream. */
function expectReplayableWindow(messages: ChatMessage[]): void {
  if (messages.length > 0) expect(messages[0].role).toBe("user");
  for (let i = 1; i < messages.length; i++) expect(messages[i].role).not.toBe(messages[i - 1].role);
  // A tool_result may never lead the window or answer something that isn't
  // immediately before it — that one is unrepairable, the block would have to
  // be dropped and the transcript would lose a real turn.
  for (let i = 0; i < messages.length; i++) {
    const content = messages[i].content;
    if (!Array.isArray(content)) continue;
    const results = content.filter((b) => b.type === "tool_result");
    if (results.length === 0) continue;
    const prev = messages[i - 1];
    const priorCalls = Array.isArray(prev?.content)
      ? (prev!.content as ContentBlock[]).filter((b) => b.type === "tool_use").map((b) => (b as { id: string }).id)
      : [];
    for (const r of results) expect(priorCalls).toContain((r as { tool_use_id: string }).tool_use_id);
  }
}

/** Capture the request bodies `runChat` posts, answering with a trivial turn. */
function captureRequests(): any[] {
  const bodies: any[] = [];
  const enc = new TextEncoder();
  const reply = () =>
    ({
      ok: true,
      status: 200,
      body: new ReadableStream<Uint8Array>({
        start(c) {
          const events = [
            { event: "content_block_start", data: { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } } },
            { event: "content_block_delta", data: { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "ok" } } },
            { event: "content_block_stop", data: { type: "content_block_stop", index: 0 } },
            { event: "message_delta", data: { type: "message_delta", delta: { stop_reason: "end_turn" } } },
          ];
          for (const e of events) c.enqueue(enc.encode(`event: ${e.event}\ndata: ${JSON.stringify(e.data)}\n\n`));
          c.close();
        },
      }),
    }) as unknown as Response;
  vi.stubGlobal(
    "fetch",
    vi.fn((_url: string, init: RequestInit) => {
      bodies.push(JSON.parse(init.body as string));
      return Promise.resolve(reply());
    }),
  );
  return bodies;
}

// ── builders — the REAL store API only ───────────────────────────────────────

const useBlock = (id: string, name = "find_best_days"): ContentBlock => ({ type: "tool_use", id, name, input: { objectiveId: "contract" } });
const resultBlock = (id: string, payload: unknown): ContentBlock => ({ type: "tool_result", tool_use_id: id, content: JSON.stringify(payload) });

/** One complete exchange appended through `appendMessages`, exactly as the panel
 *  appends the tail of a `runChat` result. */
function exchange(thread: ChatThread, n: number, model: string, when: number, payload: unknown = { best: "2026-06-20" }): ChatThread {
  const id = `toolu_${n}`;
  const msgs: ChatMessage[] = [
    { role: "assistant", content: [useBlock(id)] },
    { role: "user", content: [resultBlock(id, payload)] },
    { role: "assistant", content: [{ type: "text", text: `answer ${n}` }] },
  ];
  const withQ = appendTurn(thread, aiTurn("user", `question ${n}`), when);
  return appendMessages(withQ, msgs, model, when);
}

/** An exchange whose tool call never got a result — the real "user pressed Stop"
 *  / max_tokens-truncation case, persisted mid-loop. */
function orphanedExchange(thread: ChatThread, n: number, model: string, when: number): ChatThread {
  const withQ = appendTurn(thread, aiTurn("user", `question ${n}`), when);
  return appendMessages(
    withQ,
    [{ role: "assistant", content: [{ type: "text", text: `checking ${n}` }, useBlock(`toolu_orphan_${n}`)] }],
    model,
    when,
  );
}

/** Save and reload through the real persistence layer. Every test does this:
 *  the JSON round-trip is part of the path, and a field that doesn't survive it
 *  is a field the app doesn't have. */
function roundTrip(thread: ChatThread): ChatThread {
  saveThreads([thread]);
  const back = loadThreads();
  expect(back).toHaveLength(1);
  return back[0];
}

// ═════════════════════════════════════════════════════════════════════════════
// 1. The seam: what a REAL stored thread actually puts on the wire.
// ═════════════════════════════════════════════════════════════════════════════

describe("chat memory end-to-end — store output on the wire", () => {
  /** Two days apart, two different models — the shape a resumed thread has. */
  function twoDayThread(): ChatThread {
    let t = createThread(at(JUN12), { id: "e2e_two_day" });
    t = exchange(t, 1, "claude-haiku-4-5", at(JUN12));
    t = exchange(t, 2, "claude-sonnet-5", at(JUL02));
    return roundTrip(t);
  }

  it("carries a date on every replayed message and the model on every assistant one", () => {
    const thread = twoDayThread();
    expect(thread.turns).toHaveLength(8);

    const w = replayWindow(thread, DEFAULT_REPLAY_BUDGET_TOKENS);
    expect(w.omittedTurns).toBe(0);
    expect(w.messages.length).toBeGreaterThan(0);

    // THE BUG THIS FILE EXISTS FOR: `replayWindow` used to hand the client bare
    // {role, content} pairs. Every date and model marker downstream then had
    // nothing to work from, while the client's own tests passed on fixtures that
    // supplied both by hand.
    const days = w.messages.map((m) => isoDay(m.at));
    expect(days.filter((d) => d === null), "replayed messages arrived with no date").toEqual([]);
    for (const d of days) expect(d).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(days).toContain(JUN12);
    expect(days).toContain(JUL02);

    const assistantModels = w.messages.filter((m) => m.role === "assistant").map((m) => m.model);
    expect(assistantModels).toContain("claude-haiku-4-5");
    expect(assistantModels).toContain("claude-sonnet-5");
    expect(assistantModels.every((m) => typeof m === "string" && m.length > 0)).toBe(true);

    expectReplayableWindow(w.messages);
  });

  it("prefixes past user turns with (sent YYYY-MM-DD) on the wire, and never marks tool plumbing", () => {
    const w = replayWindow(twoDayThread(), DEFAULT_REPLAY_BUDGET_TOKENS);
    const wire = prepareHistory(w.messages, TODAY);
    expectValidWire(wire);

    const asText = JSON.stringify(wire);
    expect(asText).toContain(`(sent ${JUN12}) `);
    expect(asText).toContain(`(sent ${JUL02}) `);
    // The marker belongs to what the USER said, never to tool plumbing.
    expect(wire[0].content).toBe(`(sent ${JUN12}) question 1`);
    for (const m of wire) {
      if (!Array.isArray(m.content)) continue;
      if (m.content.some((b) => b.type === "tool_result")) expect(JSON.stringify(m)).not.toContain("(sent ");
    }
    // Nothing in this thread was sent today, so no marker may claim it was.
    expect(asText).not.toContain(`(sent ${TODAY})`);
    // A turn is marked at most once, however many times the thread is replayed.
    expect(asText.match(/\(sent /g) ?? []).toHaveLength(2);
  });

  it("puts the transcript's reach and the earlier models into the composed system block", async () => {
    const w = replayWindow(twoDayThread(), DEFAULT_REPLAY_BUDGET_TOKENS);
    const bodies = captureRequests();

    // A third model picks the thread up — the mid-thread switch the whole
    // app-owns-the-memory design is for.
    await runChat(w.messages, "is that still the best day?", { model: "claude-opus-4-8", apiKey: "sk" }, ctx, {}, undefined, {
      prunedTurns: w.omittedTurns,
    });

    const system: string = bodies[0].system;
    // These two lines are emitted ONLY when the earliest-transcript date is
    // non-null and the earlier-models list is non-empty. Asserting them here is
    // asserting that real store output produced both — which is exactly what it
    // did not do before.
    expect(system).toContain("About this conversation:");
    expect(system).toContain(`The replayed transcript starts on ${JUN12}`);
    expect(system).toContain(`today is ${TODAY}`);
    expect(system).toMatch(/written by a different model \([^)]*claude-haiku-4-5[^)]*\)/);
    expect(system).toContain("claude-sonnet-5");
    // The current model is not an "earlier" model.
    expect(system).not.toMatch(/different model \([^)]*claude-opus-4-8/);
    expect(system).toContain(`Today is ${TODAY}`);

    // …and the same request's messages carry the per-turn dates.
    expectValidWire(bodies[0].messages);
    expect(JSON.stringify(bodies[0].messages)).toContain(`(sent ${JUN12}) `);
  });

  it("keeps the date markers out of what we store, so they cannot accumulate", async () => {
    const thread = twoDayThread();
    const w = replayWindow(thread, DEFAULT_REPLAY_BUDGET_TOKENS);
    const bodies = captureRequests();
    const updated = await runChat(w.messages, "and now?", { model: "claude-opus-4-8", apiKey: "sk" }, ctx, {});

    expect(JSON.stringify(bodies[0].messages)).toContain("(sent ");
    // The canonical transcript stays clean, and the next round-trip proves it.
    expect(JSON.stringify(updated)).not.toContain("(sent ");
    const reStored = roundTrip(appendMessages(thread, updated.slice(w.messages.length + 1), "claude-opus-4-8", at(TODAY)));
    expect(JSON.stringify(reStored)).not.toContain("(sent ");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 2. Tool-pair integrity from real store output, at every budget.
// ═════════════════════════════════════════════════════════════════════════════

describe("chat memory end-to-end — tool pairing at every replay budget", () => {
  /** Orphaned tool_use FIRST, and again in the MIDDLE, with live exchanges after
   *  both. `balanceTail` resolved an orphan by popping from the end, so a single
   *  interrupted turn near the top deleted every later turn in the thread. */
  function orphanThread(): ChatThread {
    let t = createThread(at(JUN12), { id: "e2e_orphans" });
    t = orphanedExchange(t, 1, "claude-haiku-4-5", at(JUN12, 1)); // orphan at the START
    t = exchange(t, 2, "claude-haiku-4-5", at(JUN12, 2));
    t = orphanedExchange(t, 3, "claude-sonnet-5", at(JUL02, 1)); // orphan in the MIDDLE
    t = exchange(t, 4, "claude-sonnet-5", at(JUL02, 2));
    t = exchange(t, 5, "claude-sonnet-5", at(JUL02, 3));
    return roundTrip(t);
  }

  /** A thread whose very first turn is an assistant tool call — what a trimmed
   *  or partially-synced thread can look like on load. */
  function headlessThread(): ChatThread {
    let t = createThread(at(JUN12), { id: "e2e_headless" });
    t = appendMessages(t, [{ role: "assistant", content: [useBlock("toolu_headless")] }], "claude-haiku-4-5", at(JUN12));
    t = exchange(t, 4, "claude-sonnet-5", at(JUL02, 1));
    t = exchange(t, 5, "claude-sonnet-5", at(JUL02, 2));
    return roundTrip(t);
  }

  const budgets = (thread: ChatThread) => {
    const full = estimateTokens(replayWindow(thread, 1e9).messages);
    expect(full).toBeGreaterThan(0);
    return Array.from({ length: full + 20 }, (_, i) => i + 1);
  };

  it("never emits an unmatched tool_use/tool_result — orphans at the start and middle, every budget", () => {
    const thread = orphanThread();
    for (const budget of budgets(thread)) {
      const w = replayWindow(thread, budget);
      expectReplayableWindow(w.messages);
      const wire = prepareHistory(w.messages, TODAY);
      expectValidWire(wire);
      // Something is always sent: an empty window means the user's question
      // arrives with no context at all.
      expect(wire.length, `budget ${budget} produced an empty window`).toBeGreaterThan(0);
    }
  });

  it("keeps the newest exchange at EVERY budget, however early the orphan is", () => {
    const thread = orphanThread();
    for (const budget of budgets(thread)) {
      const wire = prepareHistory(replayWindow(thread, budget).messages, TODAY);
      // The regression: an orphan at turn 2 made `balanceTail` pop the whole
      // list, so the most recent exchange — the one the question follows on
      // from — vanished from the request.
      expect(JSON.stringify(wire), `budget ${budget} dropped the newest exchange`).toContain("question 5");
    }
  });

  it("replays the whole thread at the default budget — an orphan costs one tool result, not the turns after it", () => {
    const thread = orphanThread();
    const w = replayWindow(thread, DEFAULT_REPLAY_BUDGET_TOKENS);
    expect(w.omittedTurns).toBe(0);

    const wire = prepareHistory(w.messages, TODAY);
    expectValidWire(wire);
    const asText = JSON.stringify(wire);

    // Every later turn is still there — that is the blocker. An interrupted turn
    // near the top of a thread used to take everything after it with it.
    for (const n of [1, 2, 3, 4, 5]) expect(asText, `question ${n} was dropped`).toContain(`question ${n}`);
    for (const n of [2, 4, 5]) expect(asText, `answer ${n} was dropped`).toContain(`answer ${n}`);
    // Including what the assistant actually said before it was cut off.
    for (const n of [1, 3]) expect(asText, `the interrupted turn ${n} lost its text`).toContain(`checking ${n}`);

    // The interrupted call itself may be resolved either way — dropped from the
    // replayed projection, or answered with the client's "no result was
    // recorded" marker. What is NOT allowed is an unmatched tool_use on the wire
    // (a 400) or a fabricated result standing in for a reading nobody computed.
    for (const id of ["toolu_orphan_1", "toolu_orphan_3"]) {
      const carrier = wire.find(
        (m) => Array.isArray(m.content) && m.content.some((b) => b.type === "tool_result" && b.tool_use_id === id),
      );
      if (!carrier) {
        expect(asText, `${id} reached the wire without a result`).not.toContain(id);
        continue;
      }
      const block = (carrier.content as ContentBlock[]).find(
        (b) => b.type === "tool_result" && (b as { tool_use_id: string }).tool_use_id === id,
      ) as { content: string };
      expect(JSON.parse(block.content).error, `${id} was answered with something other than an error marker`).toMatch(
        /interrupted|Call the tool again/i,
      );
    }
  });

  it("survives a thread that opens on an assistant tool call, at every budget", () => {
    const thread = headlessThread();
    for (const budget of budgets(thread)) {
      const w = replayWindow(thread, budget);
      expectReplayableWindow(w.messages);
      const wire = prepareHistory(w.messages, TODAY);
      expectValidWire(wire);
      expect(JSON.stringify(wire), `budget ${budget} dropped the newest exchange`).toContain("question 5");
      expect(JSON.stringify(wire)).not.toContain("toolu_headless");
    }
  });

  it("posts a valid body for a real thread with orphans, through runChat itself", async () => {
    const w = replayWindow(orphanThread(), DEFAULT_REPLAY_BUDGET_TOKENS);
    const bodies = captureRequests();
    await runChat(w.messages, "so which day is it now?", { model: "claude-opus-4-8", apiKey: "sk" }, ctx, {}, undefined, {
      prunedTurns: w.omittedTurns,
    });
    expect(bodies).toHaveLength(1);
    expectValidWire(bodies[0].messages);
    const last = bodies[0].messages[bodies[0].messages.length - 1];
    expect(JSON.stringify(last)).toContain("so which day is it now?");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 3. Staleness: a reading computed on an earlier date, replayed today.
// ═════════════════════════════════════════════════════════════════════════════

describe("chat memory end-to-end — a stale reading is replayed as dated evidence", () => {
  /** A June question answered with a genuine engine result produced by the real
   *  tool bridge on the June context — `computedOn` and all. Nothing here is a
   *  hand-written payload. */
  function staleThread(): { thread: ChatThread; result: Record<string, unknown> } {
    const result = executeTool("find_best_days", { objectiveId: "contract", windowDays: 30 }, ctxOn(JUN12)) as Record<string, unknown>;
    expect(result.computedOn).toBe(JUN12);

    let t = createThread(at(JUN12), { id: "e2e_stale" });
    t = appendTurn(t, aiTurn("user", "when should I sign the lease?"), at(JUN12));
    t = appendMessages(
      t,
      [
        { role: "assistant", content: [useBlock("toolu_stale")] },
        { role: "user", content: [resultBlock("toolu_stale", result)] },
        { role: "assistant", content: [{ type: "text", text: "The engine rates that window's top day highest." }] },
      ],
      "claude-haiku-4-5",
      at(JUN12),
    );
    return { thread: roundTrip(t), result };
  }

  it("makes the computation date visible on the wire — in the result, on the question, and in the system block", async () => {
    const { thread } = staleThread();
    const w = replayWindow(thread, DEFAULT_REPLAY_BUDGET_TOKENS);
    const bodies = captureRequests();
    await runChat(w.messages, "is that still my best day?", { model: "claude-opus-4-8", apiKey: "sk" }, ctx, {}, undefined, {
      prunedTurns: w.omittedTurns,
    });

    const wire = bodies[0].messages as WireMessage[];
    expectValidWire(wire);

    // (a) the tool result still says when it was computed — it survives storage,
    //     the JSON round-trip and the replay window intact.
    const carrier = wire.find((m) => Array.isArray(m.content) && (m.content as ContentBlock[]).some((b) => b.type === "tool_result"));
    expect(carrier).toBeTruthy();
    const block = (carrier!.content as ContentBlock[]).find((b) => b.type === "tool_result") as { content: string };
    expect(JSON.parse(block.content).computedOn).toBe(JUN12);

    // (b) the question that produced it is marked with the day it was asked, so
    //     the model can see which stretch of transcript belongs to June.
    expect(wire[0].content).toBe(`(sent ${JUN12}) when should I sign the lease?`);

    // (c) the system block names the reach of the transcript and today, and says
    //     plainly that anything in there was computed on its own date.
    const system: string = bodies[0].system;
    expect(system).toContain(`The replayed transcript starts on ${JUN12}`);
    expect(system).toContain(`today is ${TODAY}`);
    expect(system).toContain(`Today is ${TODAY}`);
    // Dated evidence has to be re-derived, not restated.
    expect(system).toMatch(/re-call the tool/i);

    // (d) and the standing guardrail is present, not just the per-request facts.
    expect(system).toMatch(/computedOn/);
    expect(system).toMatch(/never (restate|reuse|present) an? (earlier|old|stale)/i);

    // The question asked NOW carries no marker: the app marks a turn only when
    // it knows the turn is from an earlier date. (An absent marker is not a
    // claim that a turn is current — the prompt owns that distinction.)
    const lastMsg = wire[wire.length - 1];
    expect(lastMsg.content).toBe("is that still my best day?");
  });

  it("does not let a stale exchange be replayed date-free just because the window was tight", () => {
    const { thread } = staleThread();
    const full = estimateTokens(replayWindow(thread, 1e9).messages);
    for (let budget = 1; budget <= full + 20; budget++) {
      const w = replayWindow(thread, budget);
      if (w.messages.length === 0) continue;
      // Whatever survives the budget is still dated: a trimmed window must not
      // be the way a June reading arrives looking like today's.
      for (const m of w.messages) expect(isoDay(m.at)).toBe(JUN12);
      const wire = prepareHistory(w.messages, TODAY);
      expectValidWire(wire);
      expect(JSON.stringify(wire)).toContain(`(sent ${JUN12}) `);
    }
  });
});
