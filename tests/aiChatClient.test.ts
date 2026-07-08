import { afterEach, describe, expect, it, vi } from "vitest";
import { buildFourPillars, MomentInput } from "../src/engine/sexagenary.ts";
import { buildBaziChart, computeDaYun } from "../src/engine/bazi.ts";
import { ZIPING_DEFAULT } from "../src/engine/conventions.ts";
import { evaluateDecision } from "../src/engine/decision.ts";
import { objectiveById } from "../src/engine/objectives.ts";
import { AiToolContext } from "../src/ai/tools.ts";
import { runChat } from "../src/ai/chatClient.ts";

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
