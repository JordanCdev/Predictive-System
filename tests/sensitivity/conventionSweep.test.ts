import { describe, expect, it } from "vitest";
import { evaluateDecision, DecisionRequest } from "../../src/engine/decision.ts";
import { ZIPING_DEFAULT } from "../../src/engine/conventions.ts";
import { objectiveById } from "../../src/engine/objectives.ts";
import { conventionSweepToScore } from "../../src/engine/sensitivity/conventionSweep.ts";

function request(birthHour: number, birthMinute: number): DecisionRequest {
  return {
    birth: { year: 2026, month: 3, day: 10, hour: birthHour, minute: birthMinute, tzOffsetMinutes: 480, timeCertainty: "exact" },
    sex: "male",
    convention: ZIPING_DEFAULT,
    objective: objectiveById("contract_signing"),
    window: { start: { year: 2026, month: 9, day: 1 }, days: 31, tzOffsetMinutes: 480 },
  };
}

describe("convention sweep", () => {
  it("flags a 23:30 birth as high sensitivity — the day pillar flips under zi-rollover", () => {
    const res = evaluateDecision(request(23, 30));
    const sweep = res.meta.sensitivity!.convention;
    expect(sweep.comparedConventions).toContain("ziping_zi23_v1");
    // 2026-03-10 23:30 is 癸未 under civil-midnight but 甲申 under 23:00 rollover.
    expect(sweep.pillarDifferences.some((d) => d.startsWith("day pillar"))).toBe(true);
    expect(sweep.severity).toBe("high");
    expect(conventionSweepToScore(sweep)).toBe(35);
    // ...and the day-level confidence must carry that instability.
    expect(res.recommendations[0].confidence.components.conventionStability).toBe(35);
  });

  it("reports a mid-afternoon birth as stable (no pillar flips)", () => {
    const res = evaluateDecision(request(14, 30));
    const sweep = res.meta.sensitivity!.convention;
    expect(sweep.pillarDifferences.filter((d) => !d.startsWith("hour pillar"))).toEqual([]);
    expect(["low", "medium"]).toContain(sweep.severity);
  });

  it("almanac-only requests are convention-stable by construction", () => {
    const { birth, sex, ...rest } = request(14, 30);
    void birth;
    void sex;
    const res = evaluateDecision(rest);
    const sweep = res.meta.sensitivity!.convention;
    expect(sweep.topDayStable).toBe(true);
    expect(sweep.pillarDifferences).toEqual([]);
    expect(sweep.severity).toBe("low");
  });

  it("stability is reported per convention with the baseline top day's rank", () => {
    const res = evaluateDecision(request(14, 30));
    const sweep = res.meta.sensitivity!.convention;
    const topIso = res.recommendations[0].isoDate;
    for (const conv of sweep.comparedConventions) {
      const rank = sweep.topRankByConvention[conv];
      expect(rank === -1 || rank >= 1, `${conv} rank for ${topIso}: ${rank}`).toBe(true);
    }
  });
});
