import { describe, expect, it } from "vitest";
import { JournalEntry, feedbackSummary } from "../src/ui/journalStore.ts";

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
