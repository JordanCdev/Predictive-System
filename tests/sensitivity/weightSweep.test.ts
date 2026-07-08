import { describe, expect, it } from "vitest";
import { DayRecommendation } from "../../src/engine/decision.ts";
import { runWeightSweep, weightSweepToPenalty } from "../../src/engine/sensitivity/weightSweep.ts";

/** Minimal synthetic day — the sweep only reads these fields. */
function day(
  isoDate: string,
  subScores: { officer: number; road: number; personal: number | null; hour: number | null },
  recommendationScore: number,
  personalized = true,
): DayRecommendation {
  return { isoDate, subScores, recommendationScore, personalized, hardReject: false } as unknown as DayRecommendation;
}

const WEIGHTS = { officer: 0.34, road: 0.16, personal: 0.34, hour: 0.16 };

describe("weight sweep (deterministic ±10% perturbation)", () => {
  it("a clear winner survives all 8 perturbations → low severity", () => {
    const days = [
      day("2026-09-10", { officer: 90, road: 88, personal: 92, hour: 85 }, 90),
      day("2026-09-11", { officer: 60, road: 55, personal: 58, hour: 50 }, 58),
      day("2026-09-12", { officer: 40, road: 45, personal: 42, hour: 44 }, 42),
    ];
    const r = runWeightSweep(days, WEIGHTS);
    expect(r.perturbations).toBe(8);
    expect(r.topDayStableRatio).toBe(1);
    expect(r.worstTopRank).toBe(1);
    expect(r.severity).toBe("low");
    expect(weightSweepToPenalty(r)).toBe(10);
  });

  it("a knife-edge win with opposite profiles flips under perturbation → not low", () => {
    // Same combined score, opposite officer/personal profiles: any weight nudge
    // reorders them.
    const days = [
      day("2026-09-10", { officer: 90, road: 50, personal: 30, hour: 50 }, 55.6),
      day("2026-09-11", { officer: 30, road: 50, personal: 90, hour: 50 }, 55.6),
      day("2026-09-12", { officer: 40, road: 40, personal: 40, hour: 40 }, 40),
    ];
    const r = runWeightSweep(days, WEIGHTS);
    expect(r.topDayStableRatio).toBeLessThan(1);
    expect(["medium", "high"]).toContain(r.severity);
    expect(r.scoreGapTop2).toBeLessThan(1);
  });

  it("near ties are counted even when the top day is stable", () => {
    const days = [
      day("2026-09-10", { officer: 80, road: 80, personal: 80, hour: 80 }, 80),
      day("2026-09-11", { officer: 79, road: 79, personal: 79, hour: 79 }, 79),
      day("2026-09-12", { officer: 78.5, road: 78.5, personal: 78.5, hour: 78.5 }, 78.5),
      day("2026-09-13", { officer: 78.2, road: 78.2, personal: 78.2, hour: 78.2 }, 78.2),
      day("2026-09-14", { officer: 50, road: 50, personal: 50, hour: 50 }, 50),
    ];
    const r = runWeightSweep(days, WEIGHTS);
    expect(r.nearTieCount).toBe(3);
    // Uniform profiles: ranking never flips, but 3+ near-ties force medium.
    expect(r.topDayStableRatio).toBe(1);
    expect(r.severity).toBe("medium");
  });

  it("almanac-only days renormalize to officer+road — the sweep respects the same combine", () => {
    const days = [
      day("2026-09-10", { officer: 90, road: 40, personal: null, hour: null }, 74, false),
      day("2026-09-11", { officer: 40, road: 90, personal: null, hour: null }, 56, false),
    ];
    const r = runWeightSweep(days, WEIGHTS);
    // officer weight dominates road (0.34 vs 0.16) → the officer-heavy day stays top.
    expect(r.topDayStableRatio).toBe(1);
  });

  it("degenerate windows (fewer than 2 accepted days) are trivially stable", () => {
    const r = runWeightSweep([day("2026-09-10", { officer: 80, road: 80, personal: 80, hour: 80 }, 80)], WEIGHTS);
    expect(r.perturbations).toBe(0);
    expect(r.severity).toBe("low");
  });
});
