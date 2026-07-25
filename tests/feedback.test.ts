import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  JournalEntry,
  feedbackSummary,
  lastModified,
  loadJournal,
  recordOutcome,
  updateNote,
  upsertEntry,
} from "../src/ui/journalStore.ts";

const mk = (score: number, rating: JournalEntry["outcome"] extends infer O ? O extends { rating: infer R } ? R : never : never, helped: boolean): JournalEntry => ({
  id: `${score}`,
  objectiveId: "x",
  objectiveLabel: "X",
  isoDate: "2026-01-01",
  weekday: "Mon",
  score,
  band: "",
  verdict: "",
  bestHour: null,
  note: "",
  savedAt: 0,
  outcome: { actualDate: "2026-01-01", rating: rating as "great", stress: 3, helped, notes: "", recordedAt: 0 },
});

describe("feedback summary (Phase 7)", () => {
  it("reports helpful rate + a within-user correlation, and never claims proof", () => {
    const entries = [mk(90, "great", true), mk(80, "good", true), mk(40, "poor", false), mk(30, "mixed", false)];
    const s = feedbackSummary(entries);
    expect(s.withOutcome).toBe(4);
    expect(s.helpfulRate).toBe(50);
    expect(s.higherScoresFeltBetter).toBe(true); // high-scored days rated higher
    expect(s.disclaimer).toMatch(/not evidence/i);
  });

  it("withholds a correlation claim below 4 recorded outcomes", () => {
    const s = feedbackSummary([mk(90, "great", true), mk(80, "good", true)]);
    expect(s.higherScoresFeltBetter).toBeNull();
    expect(s.withOutcome).toBe(2);
  });

  it("handles an all-un-outcomed journal", () => {
    const bare: JournalEntry = { ...mk(70, "good", true), outcome: undefined };
    const s = feedbackSummary([bare]);
    expect(s.withOutcome).toBe(0);
    expect(s.helpfulRate).toBeNull();
  });
});

/**
 * `savedAt` is a creation stamp and never moves, so before `updatedAt` existed
 * an edited entry looked exactly as old as the copy sitting in a month-old
 * backup — and a restore silently reverted it. These cover the stamping; the
 * merge rule that consumes it lives in backup.test.ts.
 */
describe("edit stamps (what backup/restore compares on)", () => {
  const g = globalThis as { localStorage?: unknown };
  beforeEach(() => {
    const map = new Map<string, string>();
    g.localStorage = {
      getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
      setItem: (k: string, v: string) => void map.set(k, v),
      removeItem: (k: string) => void map.delete(k),
    } as unknown as Storage;
    upsertEntry({ ...mk(70, "good", true), id: "e1", outcome: undefined, savedAt: 1_000 });
  });
  afterEach(() => {
    delete g.localStorage;
  });

  it("stamps a note edit without disturbing the creation date", () => {
    const [e] = updateNote("e1", "second thoughts", 5_000);
    expect(e.note).toBe("second thoughts");
    expect(e.savedAt).toBe(1_000);
    expect(e.updatedAt).toBe(5_000);
    expect(lastModified(e)).toBe(5_000);
    expect(loadJournal()[0].updatedAt).toBe(5_000);
  });

  it("stamps an outcome being logged, and again when it is removed", () => {
    const outcome = { actualDate: "2026-01-02", rating: "good" as const, stress: 2, helped: true, notes: "", recordedAt: 4_000 };
    const [logged] = recordOutcome("e1", outcome, 4_000);
    expect(logged.updatedAt).toBe(4_000);
    // A removal MUST leave a stamp, or restoring an old backup resurrects it.
    const [cleared] = recordOutcome("e1", null, 8_000);
    expect(cleared.outcome).toBeUndefined();
    expect(cleared.updatedAt).toBe(8_000);
  });

  it("falls back to savedAt for entries written before the field existed", () => {
    expect(lastModified(loadJournal()[0])).toBe(1_000);
    expect(lastModified({ savedAt: NaN } as JournalEntry)).toBe(0);
  });
});
