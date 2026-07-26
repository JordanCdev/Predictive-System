import { describe, it, expect } from "vitest";
import {
  DEFAULT_REPLAY_BUDGET_TOKENS,
  aiTurn,
  appendTurn,
  createThread,
  offlineTurn,
  parseThreads,
  replayWindow,
  titleFor,
} from "./threadStore.ts";
import type { ChatThread } from "./threadStore.ts";
import { buildTranscriptRows } from "./transcript.ts";
import type { TranscriptRow } from "./transcript.ts";
import { forTranscript, isVisible, toolLabel, toolLabels } from "./turnView.ts";

const T0 = Date.UTC(2026, 6, 20, 9, 0, 0);
const LABEL = (id: string) =>
  ({ "claude-sonnet-5": "Sonnet 5", "claude-opus-4-8": "Opus 4.8", "claude-haiku-4-5": "Haiku 4.5" })[id] ?? id;

/** A conversation built exactly the way the panel builds one. */
function thread(): ChatThread {
  let t = createThread(T0, { id: "t1" });
  t = appendTurn(t, aiTurn("user", "When should I sign?"), T0);
  t = appendTurn(
    t,
    aiTurn("assistant", [{ type: "tool_use", id: "tu1", name: "find_best_days", input: { objectiveId: "contract_signing" } }], "claude-sonnet-5"),
    T0 + 1000,
  );
  t = appendTurn(t, aiTurn("user", [{ type: "tool_result", tool_use_id: "tu1", content: '{"best":"2026-08-14"}' }]), T0 + 2000);
  t = appendTurn(t, aiTurn("assistant", "The engine likes [2026-08-14].", "claude-sonnet-5"), T0 + 3000);
  return t;
}

describe("tool labels come from the stored turn, not from component state", () => {
  it("reads every tool_use block in order, in plain English", () => {
    const t = thread();
    const assistant = t.turns[1];
    expect(assistant.kind === "ai" && toolLabels(assistant.content)).toEqual(["Finding your best days"]);
  });
  it("shows an unknown tool by its raw name rather than hiding the call", () => {
    expect(toolLabel("some_new_tool")).toBe("some_new_tool");
    expect(toolLabels([{ type: "tool_use", id: "x", name: "some_new_tool", input: {} }])).toEqual(["some_new_tool"]);
  });
  it("has nothing to say about a plain text turn", () => {
    expect(toolLabels("just words")).toEqual([]);
  });
});

describe("what gets drawn", () => {
  const t = thread();
  it("hides the tool_result plumbing while keeping it in the transcript", () => {
    expect(isVisible(t.turns[2])).toBe(false);
    // …and it is still stored, because the model needs it on replay.
    expect(t.turns).toHaveLength(4);
  });
  it("shows a question, an answer, and a turn that only called tools", () => {
    expect(isVisible(t.turns[0])).toBe(true);
    expect(isVisible(t.turns[1])).toBe(true);
    expect(isVisible(t.turns[3])).toBe(true);
  });
  it("shows an offline exchange", () => {
    const o = appendTurn(createThread(T0), offlineTurn("What suits me?", { title: "Your chart", paragraphs: ["…"] }), T0);
    expect(isVisible(o.turns[0])).toBe(true);
  });
});

describe("switching model continues the conversation, visibly", () => {
  it("marks the switch once, above the turn that changed hands", () => {
    let t = thread();
    t = appendTurn(t, aiTurn("user", "And if I use Opus?"), T0 + 4000);
    t = appendTurn(t, aiTurn("assistant", "Same engine, same numbers.", "claude-opus-4-8"), T0 + 5000);

    const rows = buildTranscriptRows(t.turns.map(forTranscript), { modelLabel: LABEL });
    const marks = rows.filter((r): r is Extract<TranscriptRow, { kind: "voice" }> => r.kind === "voice");
    expect(marks.map((m) => m.label)).toEqual(["Opus 4.8"]);

    const at = rows.findIndex((r) => r.kind === "voice");
    expect(rows[at + 1]).toEqual({ kind: "turn", index: 5 });
    // Still ONE conversation — the switch did not start a new thread.
    expect(t.turns).toHaveLength(6);
    expect(titleFor(t)).toBe("When should I sign?");
  });

  it("does not mark the tool round-trip in the middle of a single model's turn", () => {
    const rows = buildTranscriptRows(thread().turns.map(forTranscript), { modelLabel: LABEL });
    expect(rows.some((r) => r.kind === "voice")).toBe(false);
  });

  it("carries one conversation across offline → AI and back", () => {
    let t = createThread(T0, { id: "t2" });
    t = appendTurn(t, offlineTurn("What suits me?", { title: "Your chart", paragraphs: ["Wood day master."] }), T0);
    t = appendTurn(t, aiTurn("user", "Say more"), T0 + 1000);
    t = appendTurn(t, aiTurn("assistant", "The engine reads…", "claude-haiku-4-5"), T0 + 2000);
    t = appendTurn(t, offlineTurn("And next month?", { title: "Next month", paragraphs: ["…"] }), T0 + 3000);

    const marks = buildTranscriptRows(t.turns.map(forTranscript), { modelLabel: LABEL }).filter(
      (r): r is Extract<TranscriptRow, { kind: "voice" }> => r.kind === "voice",
    );
    expect(marks.map((m) => [m.label, m.offline])).toEqual([
      ["Haiku 4.5", false],
      ["the offline advisor", true],
    ]);
  });
});

describe("the conversation survives being stored and read back", () => {
  it("keeps the tool blocks, the per-turn model stamp and the offline answer", () => {
    let t = thread();
    t = appendTurn(t, offlineTurn("Offline too", { title: "T", paragraphs: ["P"], action: { label: "Open", objectiveId: "contract_signing", windowDays: 30, pickIso: "2026-08-14" } }), T0 + 4000);

    // Exactly what localStorage (and the Firestore mirror) round-trip.
    const [reloaded] = parseThreads(JSON.parse(JSON.stringify([t])));
    expect(reloaded.turns).toHaveLength(5);

    const assistant = reloaded.turns[3];
    expect(assistant.kind === "ai" && assistant.model).toBe("claude-sonnet-5");
    const toolTurn = reloaded.turns[1];
    expect(toolTurn.kind === "ai" && toolLabels(toolTurn.content)).toEqual(["Finding your best days"]);
    const off = reloaded.turns[4];
    expect(off.kind === "offline" && off.answer.action?.pickIso).toBe("2026-08-14");

    // And the transcript it renders is identical to the pre-reload one.
    expect(buildTranscriptRows(reloaded.turns.map(forTranscript), { modelLabel: LABEL })).toEqual(
      buildTranscriptRows(t.turns.map(forTranscript), { modelLabel: LABEL }),
    );
  });
});

describe("the replay boundary the panel draws matches the window it sends", () => {
  /** A long conversation, so a small budget genuinely has to leave some out. */
  function longThread(): ChatThread {
    let t = createThread(T0, { id: "t3" });
    for (let i = 0; i < 12; i++) {
      t = appendTurn(t, aiTurn("user", `Question ${i} — ${"x".repeat(400)}`), T0 + i * 2000);
      t = appendTurn(t, aiTurn("assistant", `Answer ${i} — ${"y".repeat(400)}`, "claude-sonnet-5"), T0 + i * 2000 + 1000);
    }
    return t;
  }

  it("sends everything, and draws no boundary, when the whole thread fits", () => {
    const t = thread();
    const w = replayWindow(t, DEFAULT_REPLAY_BUDGET_TOKENS);
    expect(w.omittedTurns).toBe(0);
    expect(buildTranscriptRows(t.turns.map(forTranscript), { omittedTurns: w.omittedTurns }).some((r) => r.kind === "boundary")).toBe(false);
  });

  it("omits a PREFIX of the thread — so `omittedTurns` is also where the marker goes", () => {
    const t = longThread();
    const w = replayWindow(t, 600);
    expect(w.omittedTurns).toBeGreaterThan(0);
    expect(w.omittedTurns).toBeLessThan(t.turns.length);

    // The panel places the marker at index `omittedTurns`. That is only honest if
    // what the window dropped really is the oldest run of turns.
    const kept = t.turns.slice(w.omittedTurns);
    const keptText = kept.filter((x) => x.kind === "ai" && typeof x.content === "string").map((x) => (x as { content: string }).content);
    const sent = w.messages.map((m) => (typeof m.content === "string" ? m.content : "")).join("\n");
    for (const line of keptText) expect(sent).toContain(line);
    // Nothing from before the boundary leaked into the request.
    const dropped = t.turns.slice(0, w.omittedTurns);
    for (const d of dropped) {
      if (d.kind === "ai" && typeof d.content === "string") expect(sent).not.toContain(d.content);
    }
  });

  it("puts exactly one boundary, with the omitted turns above it and the sent ones below", () => {
    const t = longThread();
    const w = replayWindow(t, 600);
    const rows = buildTranscriptRows(t.turns.map(forTranscript), { omittedTurns: w.omittedTurns });
    const bounds = rows.filter((r) => r.kind === "boundary");
    expect(bounds).toHaveLength(1);

    const at = rows.findIndex((r) => r.kind === "boundary");
    expect(rows.slice(0, at).filter((r) => r.kind === "turn")).toHaveLength(w.omittedTurns);
    expect(rows.slice(at + 1).filter((r) => r.kind === "turn")).toHaveLength(t.turns.length - w.omittedTurns);
  });
});
