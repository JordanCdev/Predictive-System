import { afterEach, describe, expect, it, vi } from "vitest";
import { buildFourPillars, MomentInput } from "../src/engine/sexagenary.ts";
import { buildBaziChart, computeDaYun } from "../src/engine/bazi.ts";
import { ZIPING_DEFAULT } from "../src/engine/conventions.ts";
import { evaluateDecision } from "../src/engine/decision.ts";
import { objectiveById } from "../src/engine/objectives.ts";
import { AiToolContext } from "../src/ai/tools.ts";
import { ChatMessage, prepareHistory, runChat, sanitizeHistory } from "../src/ai/chatClient.ts";
import { AI_SYSTEM_PROMPT, turnDateMarker } from "../src/ai/systemPrompt.ts";

const birth: MomentInput = { year: 1990, month: 6, day: 15, hour: 14, minute: 30, tzOffsetMinutes: 480 };
const fp = buildFourPillars(birth, ZIPING_DEFAULT);
const chart = buildBaziChart(fp);
const dayun = computeDaYun(fp, "male");

const mkReq = (id: string, days: number, start: { year: number; month: number; day: number }) => ({
  birth, sex: "male" as const, convention: ZIPING_DEFAULT, objective: objectiveById(id),
  window: { start, days, tzOffsetMinutes: 480 }, options: { sweeps: false },
});
const ctx: AiToolContext = {
  chart, dayun, birth: { year: 1990, month: 6, day: 15 }, todayIso: "2026-07-08",
  evaluate: (id, win) => evaluateDecision(mkReq(id, win, { year: 2026, month: 7, day: 8 })),
  evaluateDay: (id, iso) => { const [y, m, d] = iso.split("-").map(Number); return evaluateDecision(mkReq(id, 1, { year: y, month: m, day: d })); },
};

/** Build a fake Messages-API SSE response body from a list of events. */
function sseResponse(events: { event: string; data: unknown }[]): Response {
  const enc = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      for (const e of events) c.enqueue(enc.encode(`event: ${e.event}\ndata: ${JSON.stringify(e.data)}\n\n`));
      c.close();
    },
  });
  return { ok: true, status: 200, body } as unknown as Response;
}

const toolUseTurn = (id: string, name: string, input: unknown) => sseResponse([
  { event: "message_start", data: { type: "message_start" } },
  { event: "content_block_start", data: { type: "content_block_start", index: 0, content_block: { type: "tool_use", id, name, input: {} } } },
  { event: "content_block_delta", data: { type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: JSON.stringify(input) } } },
  { event: "content_block_stop", data: { type: "content_block_stop", index: 0 } },
  { event: "message_delta", data: { type: "message_delta", delta: { stop_reason: "tool_use" } } },
  { event: "message_stop", data: { type: "message_stop" } },
]);

const textTurn = (text: string) => sseResponse([
  { event: "content_block_start", data: { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } } },
  { event: "content_block_delta", data: { type: "content_block_delta", index: 0, delta: { type: "text_delta", text } } },
  { event: "content_block_stop", data: { type: "content_block_stop", index: 0 } },
  { event: "message_delta", data: { type: "message_delta", delta: { stop_reason: "end_turn" } } },
  { event: "message_stop", data: { type: "message_stop" } },
]);

afterEach(() => vi.unstubAllGlobals());

describe("chat client — client-orchestrated tool loop", () => {
  it("executes a requested tool locally and feeds the result back for a final answer", async () => {
    const bodies: any[] = [];
    const fetchStub = vi
      .fn()
      .mockImplementationOnce((_url: string, init: RequestInit) => { bodies.push(JSON.parse(init.body as string)); return Promise.resolve(toolUseTurn("toolu_1", "get_chart_summary", {})); })
      .mockImplementationOnce((_url: string, init: RequestInit) => { bodies.push(JSON.parse(init.body as string)); return Promise.resolve(textTurn("Your Day Master is Metal, and it needs support.")); });
    vi.stubGlobal("fetch", fetchStub);

    const tools: string[] = [];
    let streamed = "";
    const messages = await runChat([], "what does my chart suit?", { model: "test", apiKey: "sk-test" }, ctx, {
      onToolStart: (name) => tools.push(name),
      onTextDelta: (t) => (streamed += t),
    });

    // The model asked for a tool; we ran it locally (no compute by the model).
    expect(tools).toEqual(["get_chart_summary"]);
    expect(fetchStub).toHaveBeenCalledTimes(2);

    // A tool_result was threaded back into the second request.
    const secondReqMessages = bodies[1].messages;
    const toolResultMsg = secondReqMessages.find((m: any) => Array.isArray(m.content) && m.content[0]?.type === "tool_result");
    expect(toolResultMsg).toBeTruthy();
    expect(JSON.parse(toolResultMsg.content[0].content)).toHaveProperty("dayMaster");

    // The streamed + final assistant text is the model's narration.
    expect(streamed).toContain("Metal");
    const last = messages[messages.length - 1];
    expect(last.role).toBe("assistant");
    const textBlock = (last.content as any[]).find((b) => b.type === "text");
    expect(textBlock.text).toContain("Metal");
  });

  it("sends BYOK headers on the direct path and no key header via a proxy", async () => {
    // BYOK
    let capturedInit: RequestInit | undefined;
    vi.stubGlobal("fetch", vi.fn((_url: string, init: RequestInit) => { capturedInit = init; return Promise.resolve(textTurn("hi")); }));
    await runChat([], "hello", { model: "test", apiKey: "sk-byok" }, ctx, {});
    expect((capturedInit!.headers as any)["x-api-key"]).toBe("sk-byok");
    expect((capturedInit!.headers as any)["anthropic-dangerous-direct-browser-access"]).toBe("true");

    // Proxy — no key leaves the browser.
    let proxyUrl = "";
    vi.stubGlobal("fetch", vi.fn((url: string, init: RequestInit) => { proxyUrl = url; capturedInit = init; return Promise.resolve(textTurn("hi")); }));
    await runChat([], "hello", { model: "test", proxyUrl: "/api/chat" }, ctx, {});
    expect(proxyUrl).toBe("/api/chat");
    expect((capturedInit!.headers as any)["x-api-key"]).toBeUndefined();
  });

  it("surfaces a friendly error when the key is rejected", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({ ok: false, status: 401, body: null, text: () => Promise.resolve("") } as unknown as Response)));
    await expect(runChat([], "hi", { model: "test", apiKey: "bad" }, ctx, {})).rejects.toThrow(/rejected \(401\)/);
  });

  it("refuses to run unconfigured (no key, no proxy)", async () => {
    await expect(runChat([], "hi", { model: "test" }, ctx, {})).rejects.toThrow(/not configured/);
  });
});

// ── memory: replaying a transcript we store ourselves ────────────────────────
//
// The thread lives in OUR storage and is posted whole on every request, so a
// conversation survives a reload and a model switch. Two things can go wrong and
// both are tested here: a replayed body the API would 400 on, and a stale tool
// result from an old date being restated as today's reading.
//
// SCOPE — READ THIS BEFORE TRUSTING A GREEN RUN HERE.
//
// Everything below feeds `prepareHistory` / `runChat` HAND-BUILT `prior` arrays,
// with `at` and `model` filled in by the fixture. That is deliberate: these are
// UNIT tests of the client's helpers in isolation — sanitation, date marking,
// the history context block — and hand-built input is how each rule gets an
// input that isolates it.
//
// It also means a green run here proves NOTHING about the app. These fixtures
// are ideal input; the store is what actually supplies `prior` in production,
// and when `replayWindow(...)` returned bare {role, content} pairs every marker
// tested here was silently absent from every real request — with this file green
// the whole time. The bug lived in the seam these tests do not cross.
//
// The seam — real thread → save/load → `replayWindow(...)` → `prepareHistory` —
// is owned by `tests/chatMemoryE2E.test.ts`. Add a rule here by all means, but
// if the rule depends on what the store hands over, it must also be asserted
// there, starting from real store output. Never hand-build a `ChatMessage[]`
// there to make something pass.

/** Assert the invariants the Messages API enforces on a request body. */
function expectValidWire(messages: { role: string; content: unknown }[]) {
  if (messages.length > 0) expect(messages[0].role).toBe("user");
  for (let i = 1; i < messages.length; i++) expect(messages[i].role).not.toBe(messages[i - 1].role);
  for (const m of messages) {
    // No message may be empty, and our local bookkeeping must never reach the wire.
    expect(Object.keys(m as object).sort()).toEqual(["content", "role"]);
    if (Array.isArray(m.content)) expect(m.content.length).toBeGreaterThan(0);
    else expect(String(m.content).length).toBeGreaterThan(0);
  }
  // Every tool_use is answered in the very next message; every tool_result answers one.
  for (let i = 0; i < messages.length; i++) {
    const content = messages[i].content;
    if (!Array.isArray(content)) continue;
    const calls = content.filter((b: any) => b.type === "tool_use").map((b: any) => b.id);
    const next = messages[i + 1];
    const answers = Array.isArray(next?.content) ? (next!.content as any[]).filter((b) => b.type === "tool_result").map((b) => b.tool_use_id) : [];
    expect(answers.sort()).toEqual(calls.sort());
    const results = content.filter((b: any) => b.type === "tool_result");
    if (results.length > 0) {
      // tool_results must lead the message, and each must have a body.
      expect(content.slice(0, results.length).every((b: any) => b.type === "tool_result")).toBe(true);
      for (const r of results as any[]) expect(String(r.content).length).toBeGreaterThan(0);
      const prior = messages[i - 1];
      const priorCalls = Array.isArray(prior?.content) ? (prior!.content as any[]).filter((b) => b.type === "tool_use").map((b) => b.id) : [];
      for (const r of results as any[]) expect(priorCalls).toContain(r.tool_use_id);
    }
  }
}

describe("system prompt — a transcript that spans dates and models", () => {
  it("tells the model that replayed tool results are dated and must be re-called", () => {
    expect(AI_SYSTEM_PROMPT).toMatch(/may be stale/i);
    expect(AI_SYSTEM_PROMPT).toMatch(/computed on the date/i);
    expect(AI_SYSTEM_PROMPT).toMatch(/re-call the tool|RE-CALL THE TOOL/i);
    // Today's date wins over anything in the transcript.
    expect(AI_SYSTEM_PROMPT).toMatch(/authoritative/i);
    // And an old answer may never be recycled for a time-sensitive question.
    expect(AI_SYSTEM_PROMPT).toMatch(/never (restate|reuse|present) an? (earlier|old|stale)/i);
  });

  it("documents the exact date marker the client injects, and it is not the tappable-date token", () => {
    const marker = turnDateMarker("2026-07-08");
    expect(marker).toBe("(sent 2026-07-08) ");
    // The prompt must describe the same shape the client actually writes …
    expect(AI_SYSTEM_PROMPT).toContain("(sent YYYY-MM-DD)");
    // … and the model is told not to write it itself.
    expect(AI_SYSTEM_PROMPT).toMatch(/never write that marker/i);
    // It must not collide with [YYYY-MM-DD], which the UI renders as a day link.
    expect(marker).not.toMatch(/\[\d{4}-\d{2}-\d{2}\]/);
  });

  it("covers model switching and the absence of any provider-side memory", () => {
    expect(AI_SYSTEM_PROMPT).toMatch(/different Claude model|different model/i);
    expect(AI_SYSTEM_PROMPT).toMatch(/no memory beyond this transcript/i);
    expect(AI_SYSTEM_PROMPT).toMatch(/never claim to remember/i);
  });
});

describe("history replay — sanitation", () => {
  const call = (id: string): ChatMessage => ({ role: "assistant", content: [{ type: "tool_use", id, name: "get_chart_summary", input: {} }] });
  const result = (id: string): ChatMessage => ({ role: "user", content: [{ type: "tool_result", tool_use_id: id, content: "{}" }] });

  it("passes a well-formed tool exchange through untouched", () => {
    const prior: ChatMessage[] = [
      { role: "user", content: "what suits me?" },
      call("toolu_1"),
      result("toolu_1"),
      { role: "assistant", content: [{ type: "text", text: "Metal, and it needs support." }] },
    ];
    const wire = prepareHistory(prior, "2026-07-08");
    expect(wire).toHaveLength(4);
    expectValidWire(wire);
    expect((wire[1].content as any[])[0].id).toBe("toolu_1");
    expect((wire[2].content as any[])[0].tool_use_id).toBe("toolu_1");
  });

  it("repairs a tool_use left dangling by an interrupted turn instead of sending a 400", () => {
    // The real case: the user pressed Stop after the model asked for a tool, and
    // the half-finished turn was persisted.
    const prior: ChatMessage[] = [
      { role: "user", content: "best day to sign?" },
      { role: "assistant", content: [{ type: "text", text: "Let me check." }, { type: "tool_use", id: "toolu_x", name: "find_best_days", input: {} }] },
      { role: "user", content: "actually, what about October?" },
    ];
    const wire = prepareHistory(prior, "2026-07-08");
    expectValidWire(wire);
    const results = (wire[2].content as any[]).filter((b) => b.type === "tool_result");
    expect(results).toHaveLength(1);
    expect(results[0].tool_use_id).toBe("toolu_x");
    // A marker that the result is missing — never a fabricated reading.
    expect(JSON.parse(results[0].content).error).toMatch(/interrupted|Call the tool again/i);
    // The follow-up question is still there, after the results.
    expect((wire[2].content as any[]).some((b) => b.type === "text" && b.text.includes("October"))).toBe(true);
  });

  it("drops a tool_result whose tool_use was pruned away by the replay window", () => {
    const prior: ChatMessage[] = [result("toolu_gone"), { role: "user", content: "and next month?" }];
    const wire = prepareHistory(prior, "2026-07-08");
    expectValidWire(wire);
    expect(JSON.stringify(wire)).not.toContain("toolu_gone");
    expect(wire).toHaveLength(1);
  });

  it("drops leading assistant turns so a sliced window still opens on a user turn", () => {
    const prior: ChatMessage[] = [
      { role: "assistant", content: [{ type: "text", text: "…as I was saying" }] },
      { role: "user", content: "go on" },
    ];
    const wire = prepareHistory(prior, "2026-07-08");
    expect(wire).toHaveLength(1);
    expectValidWire(wire);
  });

  it("merges consecutive same-role turns and drops empty ones", () => {
    const prior: ChatMessage[] = [
      { role: "user", content: "one" },
      { role: "user", content: "two" },
      { role: "assistant", content: [{ type: "text", text: "   " }] },
      { role: "assistant", content: [] },
      { role: "user", content: "three" },
    ];
    const wire = prepareHistory(prior, "2026-07-08");
    expectValidWire(wire);
    expect(wire).toHaveLength(1);
    expect(JSON.stringify(wire[0].content)).toContain("three");
  });

  it("is pure — the stored transcript is never mutated", () => {
    const prior: ChatMessage[] = [{ role: "user", content: "hi", at: "2026-07-01" }, call("toolu_1")];
    const snapshot = JSON.stringify(prior);
    sanitizeHistory(prior);
    prepareHistory(prior, "2026-07-08");
    expect(JSON.stringify(prior)).toBe(snapshot);
  });
});

describe("history replay — turn dating", () => {
  it("marks user turns from earlier dates, leaves today's alone, and never marks tool plumbing", () => {
    const prior: ChatMessage[] = [
      { role: "user", content: "best wedding day?", at: "2026-06-30T09:12:00.000Z" },
      { role: "assistant", content: [{ type: "tool_use", id: "t1", name: "find_best_days", input: {} }], at: "2026-06-30", model: "claude-haiku-4-5" },
      { role: "user", content: [{ type: "tool_result", tool_use_id: "t1", content: '{"best":[]}' }], at: "2026-06-30" },
      { role: "assistant", content: [{ type: "text", text: "The engine rates [2026-08-14] highest." }], at: "2026-06-30", model: "claude-haiku-4-5" },
      { role: "user", content: "still true?", at: "2026-07-08" },
    ];
    const wire = prepareHistory(prior, "2026-07-08");
    expectValidWire(wire);
    // Dated: the June question carries a concrete day.
    expect(wire[0].content).toBe("(sent 2026-06-30) best wedding day?");
    // Not dated: the tool_result carrier is machine plumbing, not something said.
    expect((wire[2].content as any[])[0].type).toBe("tool_result");
    expect(JSON.stringify(wire[2])).not.toContain("(sent");
    // Not dated: today's turn needs no marker.
    expect(wire[4].content).toBe("still true?");
  });

  it("keeps date markers out of the persisted transcript", async () => {
    const bodies: any[] = [];
    vi.stubGlobal("fetch", vi.fn((_u: string, init: RequestInit) => { bodies.push(JSON.parse(init.body as string)); return Promise.resolve(textTurn("ok")); }));
    const prior: ChatMessage[] = [{ role: "user", content: "older question", at: "2026-06-01" }, { role: "assistant", content: [{ type: "text", text: "older answer" }], at: "2026-06-01", model: "claude-haiku-4-5" }];
    const updated = await runChat(prior, "and now?", { model: "claude-opus-4-8", apiKey: "sk" }, ctx, {});
    // The wire copy is dated …
    expect(bodies[0].messages[0].content).toContain("(sent 2026-06-01)");
    // … the stored copy is not, so markers can never accumulate on re-send.
    expect(updated[0].content).toBe("older question");
    expect(JSON.stringify(updated)).not.toContain("(sent ");
  });
});

describe("history replay — what the model is told about the thread", () => {
  it("dates today, names the transcript's reach, the pruned turns and the earlier model", async () => {
    const bodies: any[] = [];
    vi.stubGlobal("fetch", vi.fn((_u: string, init: RequestInit) => { bodies.push(JSON.parse(init.body as string)); return Promise.resolve(textTurn("ok")); }));
    const prior: ChatMessage[] = [
      { role: "user", content: "june question", at: "2026-06-01" },
      { role: "assistant", content: [{ type: "text", text: "june answer" }], at: "2026-06-01", model: "claude-haiku-4-5" },
    ];
    await runChat(prior, "now?", { model: "claude-opus-4-8", apiKey: "sk" }, ctx, {}, undefined, { prunedTurns: 12 });
    const system: string = bodies[0].system;
    // Date injection still works — today is authoritative and stated.
    expect(system).toContain("Today is 2026-07-08");
    expect(system).toContain("2026-06-01");
    // Pruning is disclosed, not silent.
    expect(system).toMatch(/12 earlier turns .* NOT included/);
    // And the model is told it did not write the earlier turns.
    expect(system).toContain("claude-haiku-4-5");
  });

  it("says nothing extra on a fresh thread", async () => {
    const bodies: any[] = [];
    vi.stubGlobal("fetch", vi.fn((_u: string, init: RequestInit) => { bodies.push(JSON.parse(init.body as string)); return Promise.resolve(textTurn("ok")); }));
    await runChat([], "hello", { model: "claude-sonnet-5", apiKey: "sk" }, ctx, {});
    expect(bodies[0].system).not.toContain("About this conversation:");
  });

  it("records the model on each assistant turn so a switched thread knows who said what", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(textTurn("hi"))));
    const first = await runChat([], "hello", { model: "claude-sonnet-5", apiKey: "sk" }, ctx, {});
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(textTurn("still here"))));
    const second = await runChat(first, "again", { model: "claude-opus-4-8", apiKey: "sk" }, ctx, {});
    const models = second.filter((m) => m.role === "assistant").map((m) => m.model);
    expect(models).toEqual(["claude-sonnet-5", "claude-opus-4-8"]);
    // Every turn is dated, so "earlier" stays concrete when this thread is resumed.
    expect(second.every((m) => m.at === "2026-07-08")).toBe(true);
  });

  it("sends a valid body when a live tool loop is replayed on top of an old dated thread", async () => {
    const bodies: any[] = [];
    const fetchStub = vi
      .fn()
      .mockImplementationOnce((_u: string, init: RequestInit) => { bodies.push(JSON.parse(init.body as string)); return Promise.resolve(toolUseTurn("toolu_9", "get_chart_summary", {})); })
      .mockImplementationOnce((_u: string, init: RequestInit) => { bodies.push(JSON.parse(init.body as string)); return Promise.resolve(textTurn("Metal.")); });
    vi.stubGlobal("fetch", fetchStub);
    const prior: ChatMessage[] = [
      { role: "user", content: "old question", at: "2026-05-02" },
      { role: "assistant", content: [{ type: "tool_use", id: "old_1", name: "find_best_days", input: {} }], at: "2026-05-02", model: "claude-sonnet-5" },
      // Interrupted back then: no result was ever stored for old_1.
    ];
    await runChat(prior, "what suits me?", { model: "claude-sonnet-5", apiKey: "sk" }, ctx, {});
    for (const b of bodies) expectValidWire(b.messages);
    expect(bodies[1].messages.some((m: any) => Array.isArray(m.content) && m.content.some((c: any) => c.tool_use_id === "toolu_9"))).toBe(true);
  });
});
