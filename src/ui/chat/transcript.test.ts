import { describe, it, expect } from "vitest";
import { boundaryNote, buildTranscriptRows, overBudgetNote, relativeWhen, turnVoice, voiceNote } from "./transcript.ts";
import type { TranscriptRow, TranscriptTurnLike } from "./transcript.ts";

const user = (): TranscriptTurnLike => ({ role: "user" });
const ai = (model: string): TranscriptTurnLike => ({ role: "assistant", model, source: "ai" });
const offline = (): TranscriptTurnLike => ({ role: "assistant", source: "offline" });

const kinds = (rows: TranscriptRow[]) => rows.map((r) => r.kind);
const voices = (rows: TranscriptRow[]) => rows.flatMap((r) => (r.kind === "voice" ? [r.label] : []));

describe("turnVoice", () => {
  it("ignores user turns entirely", () => {
    expect(turnVoice(user())).toBeNull();
  });
  it("keys an AI turn by its model and an offline turn by being offline", () => {
    expect(turnVoice(ai("claude-opus-4-8"))).toBe("model:claude-opus-4-8");
    expect(turnVoice(offline())).toBe("offline");
  });
  it("has no voice for an assistant turn recorded before models were stamped", () => {
    expect(turnVoice({ role: "assistant" })).toBeNull();
  });
});

describe("buildTranscriptRows — model switching", () => {
  const label = (id: string) => ({ "claude-sonnet-5": "Sonnet 5", "claude-opus-4-8": "Opus 4.8" })[id] ?? id;

  it("never marks the first assistant voice — nothing has switched yet", () => {
    const rows = buildTranscriptRows([user(), ai("claude-sonnet-5")], { modelLabel: label });
    expect(kinds(rows)).toEqual(["turn", "turn"]);
  });

  it("marks the point where the answering model changed, and nowhere else", () => {
    const rows = buildTranscriptRows(
      [user(), ai("claude-sonnet-5"), user(), ai("claude-sonnet-5"), user(), ai("claude-opus-4-8"), user(), ai("claude-opus-4-8")],
      { modelLabel: label },
    );
    expect(voices(rows)).toEqual(["Opus 4.8"]);
    // The marker sits immediately above the turn that changed hands (index 5).
    const at = rows.findIndex((r) => r.kind === "voice");
    expect(rows[at + 1]).toEqual({ kind: "turn", index: 5 });
  });

  it("switching back marks again — the conversation continues either way", () => {
    const rows = buildTranscriptRows([user(), ai("claude-sonnet-5"), ai("claude-opus-4-8"), ai("claude-sonnet-5")], {
      modelLabel: label,
    });
    expect(voices(rows)).toEqual(["Opus 4.8", "Sonnet 5"]);
  });

  it("treats the offline advisor as a voice, so offline↔AI is one conversation with a note", () => {
    const rows = buildTranscriptRows([user(), offline(), user(), ai("claude-sonnet-5")], { modelLabel: label });
    const marks = rows.flatMap((r) => (r.kind === "voice" ? [r] : []));
    expect(marks).toHaveLength(1);
    expect(marks[0].offline).toBe(false);
    expect(marks[0].label).toBe("Sonnet 5");

    const back = buildTranscriptRows([ai("claude-sonnet-5"), offline()], { modelLabel: label });
    const backMarks = back.flatMap((r) => (r.kind === "voice" ? [r] : []));
    expect(backMarks[0].offline).toBe(true);
  });

  it("falls back to the raw model id when there is no label for it", () => {
    const rows = buildTranscriptRows([ai("claude-sonnet-5"), ai("some-future-model")]);
    expect(voices(rows)).toEqual(["some-future-model"]);
  });
});

describe("buildTranscriptRows — the replay boundary", () => {
  it("adds nothing when the whole transcript is being replayed", () => {
    const rows = buildTranscriptRows([user(), ai("m"), user(), ai("m")], { omittedTurns: 0, replayFrom: 0 });
    expect(kinds(rows)).toEqual(["turn", "turn", "turn", "turn"]);
  });

  it("sits immediately above the first turn that IS being sent", () => {
    const turns = [user(), ai("m"), user(), ai("m"), user(), ai("m")];
    const rows = buildTranscriptRows(turns, { omittedTurns: 2, replayFrom: 2 });
    const at = rows.findIndex((r) => r.kind === "boundary");
    expect(rows.slice(0, at)).toEqual([{ kind: "turn", index: 0 }, { kind: "turn", index: 1 }]);
    expect(rows[at + 1]).toEqual({ kind: "turn", index: 2 });
  });

  it("still says so when every stored turn is outside the window", () => {
    const turns = [user(), ai("m")];
    const rows = buildTranscriptRows(turns, { omittedTurns: 2, replayFrom: 2 });
    expect(rows[rows.length - 1]).toEqual({ kind: "boundary", omittedTurns: 2 });
  });

  it("never puts a boundary above the very first turn — there is nothing above it", () => {
    const rows = buildTranscriptRows([user(), ai("m")], { omittedTurns: 3, replayFrom: 0 });
    expect(kinds(rows)).toEqual(["turn", "turn"]);
  });

  it("does not lose the boundary when a voice marker lands in the same place", () => {
    const turns = [user(), ai("a"), user(), ai("b")];
    const rows = buildTranscriptRows(turns, { omittedTurns: 3, replayFrom: 3 });
    expect(kinds(rows)).toEqual(["turn", "turn", "turn", "boundary", "voice", "turn"]);
  });
});

describe("copy", () => {
  it("tells the user the earlier messages are still readable, and never sells anything", () => {
    const note = boundaryNote(4);
    expect(note).toContain("4 earlier messages");
    expect(note).toContain("still here to read");
    expect(note.toLowerCase()).not.toMatch(/upgrade|plan|pro\b|premium|tier|subscri/);
  });
  it("gets the singular right", () => {
    expect(boundaryNote(1)).toContain("1 earlier message isn't being sent");
    expect(boundaryNote(1)).toContain("it's still here to read");
  });
  it("names the offline advisor as deterministic when the voice changes to it", () => {
    expect(voiceNote("the offline advisor", true)).toContain("deterministic, no AI");
    expect(voiceNote("Opus 4.8", false)).toBe("switched to Opus 4.8");
  });
});

describe("relativeWhen", () => {
  const now = Date.UTC(2026, 6, 26, 12, 0, 0);
  const ago = (ms: number) => relativeWhen(now - ms, now);
  it("reads as a person would say it", () => {
    expect(ago(5_000)).toBe("just now");
    expect(ago(12 * 60_000)).toBe("12m ago");
    expect(ago(5 * 3_600_000)).toBe("5h ago");
    expect(ago(3 * 86_400_000)).toBe("3d ago");
    expect(ago(20 * 86_400_000)).toBe("2w ago");
    expect(ago(800 * 86_400_000)).toBe("2y ago");
  });
  it("survives a clock that went backwards rather than printing a negative age", () => {
    expect(relativeWhen(now + 60_000, now)).toBe("just now");
  });
});

describe("overBudgetNote", () => {
  it("explains the bigger request without apologising or blaming the user", () => {
    const note = overBudgetNote();
    expect(note).toMatch(/exceed|bigger/i);
    // It must not imply anything was lost — nothing was; the exchange went whole.
    expect(note).not.toMatch(/lost|dropped|truncat|removed|sorry/i);
    // And it is a fact about the request, not an upsell: there are no tiers here.
    expect(note).not.toMatch(/upgrade|plan|tier|premium|pro\b/i);
  });
});
