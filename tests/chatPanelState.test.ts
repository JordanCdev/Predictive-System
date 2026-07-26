/**
 * The chat panel's decisions, as pure functions.
 *
 * Everything here is about the three ways a saved conversation can be corrupted
 * by things happening AROUND it: the user deleting it while its reply is in
 * flight, a failed send trying to undo itself with a stale snapshot, and the
 * panel switching to a different person's chart. None of that needs a DOM — the
 * decisions are pure, which is why they live outside the component body.
 */
import { describe, expect, it } from "vitest";
import type { BaziChart } from "../src/engine/index.ts";
import {
  baseForNewTurn,
  belongsToSubject,
  resumeThreadId,
  rollbackSend,
  subjectKeyOf,
  subjectOf,
  unsavedNote,
  visibleOmitted,
  withSubject,
} from "../src/ui/ChatPanel.tsx";
import { aiTurn, appendTurn, createThread, offlineTurn } from "../src/ui/chat/threadStore.ts";
import type { ChatThread, ChatTurn } from "../src/ui/chat/threadStore.ts";

// ── fixtures ─────────────────────────────────────────────────────────────────

const chartOf = (indices: number[]): BaziChart =>
  ({ pillars: indices.map((index) => ({ ganzhi: { index } })) }) as unknown as BaziChart;

const BIRTH_A = { year: 1990, month: 4, day: 12 };
const BIRTH_B = { year: 1987, month: 11, day: 2 };
const CHART_A = chartOf([1, 2, 3, 4]);
const CHART_B = chartOf([11, 22, 33, 44]);

const KEY_A = subjectKeyOf(CHART_A, BIRTH_A);
const KEY_B = subjectKeyOf(CHART_B, BIRTH_B);

/** A saved conversation with one question in it. */
function threadWith(id: string, text: string, at: number, title = ""): ChatThread {
  return appendTurn({ ...createThread(at, { id }), title }, aiTurn("user", text), at);
}

// ── which chart a conversation belongs to (finding 14) ───────────────────────

describe("subject identity", () => {
  it("is stable for the same chart and birth date, and differs across people", () => {
    expect(subjectKeyOf(CHART_A, BIRTH_A)).toBe(subjectKeyOf(chartOf([1, 2, 3, 4]), { ...BIRTH_A }));
    expect(KEY_A).not.toBe(KEY_B);
    // Same pillars, different birth date — still a different person.
    expect(subjectKeyOf(CHART_A, BIRTH_A)).not.toBe(subjectKeyOf(CHART_A, BIRTH_B));
  });

  it("round-trips through a thread id without ever double-stamping", () => {
    const id = withSubject("t123_abc", KEY_A);
    expect(subjectOf(id)).toBe(KEY_A);
    expect(subjectOf(withSubject(id, KEY_B))).toBe(KEY_B);
    expect(withSubject(withSubject(id, KEY_B), KEY_B)).toBe(withSubject("t123_abc", KEY_B));
  });

  it("reads a conversation saved before scoping as unscoped, not as someone's", () => {
    expect(subjectOf("t123_abc")).toBeNull();
    expect(belongsToSubject("t123_abc", KEY_A)).toBe(true); // listed, not hidden
    expect(belongsToSubject(withSubject("t1_a", KEY_A), KEY_A)).toBe(true);
    expect(belongsToSubject(withSubject("t1_a", KEY_B), KEY_A)).toBe(false); // someone else's
  });
});

describe("resumeThreadId", () => {
  const mineOld = threadWith(withSubject("t1_a", KEY_A), "mine, older", 1_000);
  const mineNew = threadWith(withSubject("t2_a", KEY_A), "mine, newer", 2_000);
  const theirs = threadWith(withSubject("t3_b", KEY_B), "someone else's", 3_000);
  const legacy = threadWith("t4_legacy", "from before scoping", 4_000);
  const all = [mineOld, mineNew, theirs, legacy];

  it("resumes the remembered conversation when it is this chart's", () => {
    expect(resumeThreadId(all, KEY_A, mineOld.id)).toBe(mineOld.id);
  });

  it("never resumes another person's conversation, even if the pointer names it", () => {
    expect(resumeThreadId(all, KEY_A, theirs.id)).toBe(mineNew.id);
  });

  it("never auto-resumes an unscoped conversation — it may be another chart's", () => {
    expect(resumeThreadId(all, KEY_A, legacy.id)).toBe(mineNew.id);
    // A chart with no history of its own starts a new conversation rather than
    // inheriting whatever was open.
    expect(resumeThreadId([legacy, theirs], KEY_A, legacy.id)).toBeNull();
  });

  it("falls back to this chart's most recent conversation", () => {
    expect(resumeThreadId(all, KEY_A, null)).toBe(mineNew.id);
    expect(resumeThreadId(all, KEY_B, null)).toBe(theirs.id);
  });
});

describe("baseForNewTurn", () => {
  const mine = threadWith(withSubject("t1_a", KEY_A), "mine", 1_000);
  const theirs = threadWith(withSubject("t3_b", KEY_B), "theirs", 3_000);
  const legacy = threadWith("t4_legacy", "from before scoping", 4_000);

  it("carries on in the open conversation when it is this chart's", () => {
    const { base, replaces } = baseForNewTurn([mine], mine.id, KEY_A, 9_000);
    expect(base).toBe(mine);
    expect(replaces).toBeNull();
  });

  it("opens a new conversation stamped with this chart when there is none", () => {
    const { base, replaces } = baseForNewTurn([mine], null, KEY_A, 9_000, () => 0.5);
    expect(subjectOf(base.id)).toBe(KEY_A);
    expect(base.turns).toEqual([]);
    expect(replaces).toBeNull();
  });

  it("adopts an unscoped conversation into this chart, keeping what was said", () => {
    const { base, replaces } = baseForNewTurn([legacy], legacy.id, KEY_A, 9_000);
    expect(replaces).toBe(legacy.id);
    expect(subjectOf(base.id)).toBe(KEY_A);
    expect(base.turns).toEqual(legacy.turns);
  });

  it("refuses to adopt another person's conversation — it starts a fresh one", () => {
    const { base, replaces } = baseForNewTurn([theirs], theirs.id, KEY_A, 9_000, () => 0.5);
    expect(replaces).toBeNull();
    expect(base.id).not.toBe(theirs.id);
    expect(base.turns).toEqual([]);
    expect(subjectOf(base.id)).toBe(KEY_A);
  });
});

// ── undoing a failed send (findings 11, 12, 8/13) ────────────────────────────

describe("rollbackSend", () => {
  const other = threadWith(withSubject("other", KEY_A), "another conversation", 5_000);
  const prior = threadWith(withSubject("sent", KEY_A), "what I asked before", 1_000);
  const inFlight = appendTurn(prior, aiTurn("user", "the question that failed"), 2_000);

  it("leaves a conversation deleted if the user deleted it mid-flight", () => {
    const live = [other];
    const roll = rollbackSend(live, inFlight.id, prior);
    expect(roll.changed).toBe(false);
    expect(roll.threads).toBe(live);
    expect(roll.push).toBeNull();
    expect(roll.remove).toEqual([]);
  });

  it("reverts only the conversation it sent — concurrent changes survive", () => {
    // A rename landed on `other`, and a whole new conversation appeared, while
    // the request was in flight. A snapshot rollback would erase both.
    const renamed = { ...other, title: "renamed while in flight", updatedAt: 6_000 };
    const brandNew = threadWith(withSubject("new", KEY_A), "asked in another tab", 7_000);
    const roll = rollbackSend([renamed, inFlight, brandNew], inFlight.id, prior);

    expect(roll.changed).toBe(true);
    expect(roll.threads.find((t) => t.id === renamed.id)).toBe(renamed);
    expect(roll.threads.find((t) => t.id === brandNew.id)).toBe(brandNew);
    // The unanswered question is gone; what came before it is intact.
    expect(roll.threads.find((t) => t.id === inFlight.id)?.turns).toEqual(prior.turns);
    // …and the account is told, so the question can't return at the next sign-in.
    expect(roll.push).toBe(prior);
    expect(roll.remove).toEqual([]);
  });

  it("removes a conversation the failed question created — locally and in the account", () => {
    const created = threadWith(withSubject("created", KEY_A), "the only question", 2_000);
    const roll = rollbackSend([other, created], created.id, null);

    expect(roll.threads.map((t) => t.id)).toEqual([other.id]);
    expect(roll.push).toBeNull();
    expect(roll.remove).toEqual([created.id]);
  });

  it("undoes an adoption: the new id goes, the original comes back", () => {
    const legacy = threadWith("legacy", "said before scoping", 1_000);
    const adopted = appendTurn({ ...legacy, id: withSubject(legacy.id, KEY_A) }, aiTurn("user", "failed"), 2_000);
    const roll = rollbackSend([other, adopted], adopted.id, legacy);

    expect(roll.threads.map((t) => t.id).sort()).toEqual([legacy.id, other.id].sort());
    expect(roll.threads.find((t) => t.id === legacy.id)?.turns).toEqual(legacy.turns);
    expect(roll.push).toBe(legacy);
    expect(roll.remove).toEqual([adopted.id]);
  });
});

// ── the replay boundary counts what can be read (finding 16) ─────────────────

describe("visibleOmitted", () => {
  const toolResult: ChatTurn = {
    kind: "ai",
    id: "tr",
    role: "user",
    content: [{ type: "tool_result", tool_use_id: "u1", content: "{}" }],
    at: 1,
  };
  const question: ChatTurn = { kind: "ai", id: "q", role: "user", content: "when should I sign?", at: 2 };
  const answer: ChatTurn = { kind: "ai", id: "a", role: "assistant", content: "on the 3rd", model: "m", at: 3 };

  it("counts only turns a person can actually see", () => {
    expect(visibleOmitted([question, toolResult, answer], 3)).toBe(2);
  });

  it("is zero when everything omitted was tool plumbing — no marker to show", () => {
    expect(visibleOmitted([toolResult, toolResult, question], 2)).toBe(0);
  });

  it("never counts past the end, or below zero", () => {
    expect(visibleOmitted([question], 99)).toBe(1);
    expect(visibleOmitted([question], -3)).toBe(0);
    expect(visibleOmitted([], 4)).toBe(0);
  });

  it("counts an offline exchange — it is on screen like anything else", () => {
    const offline = appendTurn(createThread(0), offlineTurn("q", { title: "t", paragraphs: ["p"] }), 0).turns[0];
    expect(visibleOmitted([offline], 1)).toBe(1);
  });
});

// ── a save that didn't land (finding 7) ──────────────────────────────────────

describe("unsavedNote", () => {
  it("says nothing when the write landed", () => {
    expect(unsavedNote(null, false)).toBeNull();
  });

  it("names the reason, and says so plainly", () => {
    expect(unsavedNote("quota", false)).toContain("storage is full");
    expect(unsavedNote("unavailable", false)).toContain("isn't allowing storage");
    expect(unsavedNote("quota", false)).toContain("gone if you reload");
  });

  it("adds the one mitigating fact only when the account really has a copy", () => {
    expect(unsavedNote("quota", true)).toContain("still being saved to your account");
    expect(unsavedNote("quota", false)).not.toContain("account");
  });

  it("carries no tier or upsell language", () => {
    for (const reason of ["quota", "unavailable"] as const) {
      expect(unsavedNote(reason, true)).not.toMatch(/upgrade|plan|tier|premium|pro\b/i);
    }
  });
});
