import { describe, expect, it } from "vitest";
import { buildFourPillars } from "../../src/engine/sexagenary.ts";
import { buildBaziChart } from "../../src/engine/bazi.ts";
import { ZIPING_DEFAULT, ZIPING_TRUE_SOLAR, ZIPING_ZI_ROLLOVER } from "../../src/engine/conventions.ts";
import { evaluateDecision, DecisionRequest } from "../../src/engine/decision.ts";
import { objectiveById } from "../../src/engine/objectives.ts";

/**
 * Boundary-instability coverage (report §H): the engine must FLAG fragile
 * classifications, not just compute them. 立春 2026 = 2026-02-03T20:02:08Z
 * (04:02 HKT Feb 4) — verified against HKO and JPL fixtures.
 */

describe("立春 (year-boundary) births within two hours", () => {
  const before = { year: 2026, month: 2, day: 4, hour: 3, minute: 30, tzOffsetMinutes: 480 } as const;
  const after = { year: 2026, month: 2, day: 4, hour: 5, minute: 0, tzOffsetMinutes: 480 } as const;

  it("assigns the year pillar by the exact instant (乙巳 before, 丙午 after)", () => {
    expect(buildFourPillars(before, ZIPING_DEFAULT).year.hanzi).toBe("乙巳");
    expect(buildFourPillars(after, ZIPING_DEFAULT).year.hanzi).toBe("丙午");
  });

  it("warns about year-boundary sensitivity on both sides", () => {
    for (const birth of [before, after]) {
      const fp = buildFourPillars(birth, ZIPING_DEFAULT);
      expect(fp.meta.boundaryWarnings.join(" ")).toMatch(/立春/);
    }
  });

  it("raises boundaryRisk in the decision confidence for a boundary birth", () => {
    const req: DecisionRequest = {
      birth: before,
      sex: "female",
      convention: ZIPING_DEFAULT,
      objective: objectiveById("contract_signing"),
      window: { start: { year: 2026, month: 9, day: 1 }, days: 14, tzOffsetMinutes: 480 },
      options: { sweeps: false },
    };
    const risky = evaluateDecision(req);
    const stable = evaluateDecision({
      ...req,
      birth: { year: 1990, month: 6, day: 15, hour: 14, minute: 30, tzOffsetMinutes: 480 },
    });
    expect(risky.recommendations[0].confidence.components.boundaryRisk).toBeGreaterThan(
      stable.recommendations[0].confidence.components.boundaryRisk,
    );
  });
});

describe("子-hour (23:00–00:59) births", () => {
  const lateZi = { year: 2026, month: 3, day: 10, hour: 23, minute: 30, tzOffsetMinutes: 480 } as const;

  it("day pillar depends on the day-boundary convention (癸未 civil vs 甲申 zi-rollover)", () => {
    expect(buildFourPillars(lateZi, ZIPING_DEFAULT).day.hanzi).toBe("癸未");
    expect(buildFourPillars(lateZi, ZIPING_ZI_ROLLOVER).day.hanzi).toBe("甲申");
  });

  it("always warns that the day pillar is convention-sensitive", () => {
    for (const conv of [ZIPING_DEFAULT, ZIPING_ZI_ROLLOVER]) {
      expect(buildFourPillars(lateZi, conv).meta.boundaryWarnings.join(" ")).toMatch(/子|Zi/);
    }
  });
});

describe("true-solar mode without a longitude", () => {
  const birth = { year: 1990, month: 6, day: 15, hour: 14, minute: 30, tzOffsetMinutes: 480 } as const;

  it("degrades gracefully: equation of time only, with an explicit warning", () => {
    const fp = buildFourPillars(birth, ZIPING_TRUE_SOLAR);
    expect(fp.meta.boundaryWarnings.join(" ")).toMatch(/longitude/i);
    // EoT alone is still applied (date-dependent, ±16 min).
    expect(Math.abs(fp.meta.normalized.solarCorrectionMinutes)).toBeGreaterThan(0);
    expect(Math.abs(fp.meta.normalized.solarCorrectionMinutes)).toBeLessThan(17);
  });

  it("does not warn when the longitude is supplied", () => {
    const fp = buildFourPillars({ ...birth, longitudeEast: 114.17 }, ZIPING_TRUE_SOLAR);
    expect(fp.meta.boundaryWarnings.join(" ")).not.toMatch(/longitude/i);
  });
});

describe("near-threshold Day-Master strength (0.34 / 0.45 / 0.52 cut-points)", () => {
  it("flags a chart sitting near the strong-with-command cut (1981-05-25 → 0.443)", () => {
    const fp = buildFourPillars({ year: 1981, month: 5, day: 25, hour: 10, minute: 0, tzOffsetMinutes: 480 }, ZIPING_DEFAULT);
    const chart = buildBaziChart(fp);
    const sb = chart.dayMaster.strengthBreakdown;
    expect(sb.adjusted).toBeCloseTo(0.443, 3);
    expect(chart.dayMaster.hasMonthCommand).toBe(true);
    expect(sb.nearThreshold).toBe(true);
    expect(sb.nearThresholdNote).toMatch(/0\.45/);
  });

  it("flags a chart near the weak cut (1981-01-25 → 0.332)", () => {
    const fp = buildFourPillars({ year: 1981, month: 1, day: 25, hour: 10, minute: 0, tzOffsetMinutes: 480 }, ZIPING_DEFAULT);
    const chart = buildBaziChart(fp);
    const sb = chart.dayMaster.strengthBreakdown;
    expect(sb.adjusted).toBeCloseTo(0.332, 3);
    expect(sb.nearThreshold).toBe(true);
    expect(sb.nearThresholdNote).toMatch(/0\.34/);
  });

  it("a solidly classified chart carries no near-threshold flag and full arithmetic", () => {
    const fp = buildFourPillars({ year: 1990, month: 6, day: 15, hour: 14, minute: 30, tzOffsetMinutes: 480 }, ZIPING_DEFAULT);
    const sb = buildBaziChart(fp).dayMaster.strengthBreakdown;
    expect(sb.nearThreshold).toBe(false);
    expect(sb.nearThresholdNote).toBeNull();
    // The breakdown must reconstruct the classification input exactly.
    expect(sb.adjusted).toBeCloseTo(
      Math.max(0, Math.min(1, sb.supportRatio + sb.seasonalAdjustment + sb.rootingAdjustment)),
      2,
    );
    expect(sb.thresholds).toEqual({ weakMax: 0.34, strongWithCommandMin: 0.45, strongMin: 0.52 });
  });

  it("near-threshold strength feeds boundaryRisk in decision confidence", () => {
    const req: DecisionRequest = {
      birth: { year: 1981, month: 5, day: 25, hour: 10, minute: 0, tzOffsetMinutes: 480 },
      sex: "male",
      convention: ZIPING_DEFAULT,
      objective: objectiveById("contract_signing"),
      window: { start: { year: 2026, month: 9, day: 1 }, days: 14, tzOffsetMinutes: 480 },
      options: { sweeps: false },
    };
    const res = evaluateDecision(req);
    const top = res.recommendations[0];
    expect(top.confidence.components.boundaryRisk).toBeGreaterThanOrEqual(30);
    expect(top.confidence.notes.join(" ")).toMatch(/cut-point/);
  });
});
