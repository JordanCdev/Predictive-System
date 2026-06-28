import { describe, it, expect } from "vitest";
import { evaluateDecision, DecisionRequest } from "./decision.ts";
import { ZIPING_DEFAULT } from "./conventions.ts";
import { objectiveById } from "./objectives.ts";

function baseRequest(): DecisionRequest {
  return {
    birth: { year: 1990, month: 6, day: 15, hour: 14, minute: 30, tzOffsetMinutes: 480, timeCertainty: "exact" },
    sex: "male",
    convention: ZIPING_DEFAULT,
    objective: objectiveById("contract_signing"),
    window: { start: { year: 2026, month: 7, day: 1 }, days: 31, tzOffsetMinutes: 480 },
  };
}

describe("decision engine", () => {
  it("produces ranked recommendations over the window", () => {
    const res = evaluateDecision(baseRequest());
    expect(res.recommendations.length + res.rejected.length).toBe(31);
    // sorted descending by finalScore
    for (let i = 1; i < res.recommendations.length; i++) {
      expect(res.recommendations[i - 1].finalScore).toBeGreaterThanOrEqual(res.recommendations[i].finalScore);
    }
  });

  it("is deterministic — same input → same calculationHash and same top day", () => {
    const a = evaluateDecision(baseRequest());
    const b = evaluateDecision(baseRequest());
    expect(a.meta.calculationHash).toBe(b.meta.calculationHash);
    expect(a.recommendations[0].isoDate).toBe(b.recommendations[0].isoDate);
    expect(a.recommendations[0].finalScore).toBe(b.recommendations[0].finalScore);
  });

  it("hard-rejects 破 (Destruction) days for contract signing", () => {
    const res = evaluateDecision(baseRequest());
    for (const r of res.rejected) {
      expect(r.rejectReasons.length).toBeGreaterThan(0);
    }
    // no accepted day is a 破 officer
    for (const r of res.recommendations) {
      expect(r.tongshu.officer.nameZh).not.toBe("破");
    }
  });

  it("every recommendation carries facts, fired rules, and citations", () => {
    const res = evaluateDecision(baseRequest());
    const top = res.recommendations[0];
    expect(top.rulesFired.length).toBeGreaterThan(0);
    for (const rule of top.rulesFired) {
      expect(rule.citation.length).toBeGreaterThan(0);
    }
    expect(top.confidence.overall).toBeGreaterThan(0);
    expect(top.confidence.overall).toBeLessThanOrEqual(1);
    expect(top.bestHour).not.toBeNull();
    expect(top.bestHour!.rangeLabel).toMatch(/\d\d:00/);
  });

  it("works without birth — the general almanac read (not personalized)", () => {
    const { birth, sex, ...rest } = baseRequest();
    void birth;
    void sex;
    const res = evaluateDecision(rest);
    expect(res.personalized).toBe(false);
    expect(res.subjectChart).toBeNull();
    expect(res.dayun).toBeNull();
    expect(res.recommendations.length + res.rejected.length).toBe(31);
    const top = res.recommendations[0];
    expect(top.subScores.personal).toBeNull();
    expect(top.subScores.hour).toBeNull();
    expect(top.bestHour).toBeNull();
    // officer + road still produce real evidence + citations
    expect(top.rulesFired.length).toBeGreaterThan(0);
    expect(top.finalScore).toBeGreaterThan(0);
  });

  it("almanac mode is deterministic", () => {
    const { birth, sex, ...rest } = baseRequest();
    void birth;
    void sex;
    const a = evaluateDecision(rest);
    const b = evaluateDecision(rest);
    expect(a.meta.calculationHash).toBe(b.meta.calculationHash);
    expect(a.recommendations[0].isoDate).toBe(b.recommendations[0].isoDate);
  });

  it("different objectives can rank days differently", () => {
    const contract = evaluateDecision({ ...baseRequest(), objective: objectiveById("contract_signing") });
    const wedding = evaluateDecision({ ...baseRequest(), objective: objectiveById("wedding_marriage") });
    // The two policies should not produce identical full orderings in general.
    const c = contract.recommendations.map((r) => r.isoDate).join();
    const w = wedding.recommendations.map((r) => r.isoDate).join();
    expect(c === w && contract.recommendations.length > 5).toBe(false);
  });

  it("flags 沖大運 exactly on days that clash the subject's active luck pillar", () => {
    const res = evaluateDecision(baseRequest());
    expect(res.dayun).not.toBeNull();
    let found = false;
    for (const day of res.allDays) {
      const age =
        (Date.UTC(day.civil.year, day.civil.month - 1, day.civil.day) - Date.UTC(1990, 5, 15)) /
        (365.25 * 86400000);
      const lp = res.dayun!.pillars.find((p) => age >= p.startAge && age < p.endAge);
      const clashesLuck = lp ? (((day.tongshu.dayGanzhi.branch.index - lp.ganzhi.branch.index) % 12) + 12) % 12 === 6 : false;
      const hasRule = day.rulesFired.some((r) => r.code === "luck_clash");
      expect(hasRule).toBe(clashesLuck);
      if (clashesLuck) found = true;
    }
    expect(found).toBe(true);
  });

  it("medical objective tolerates 破 days (no officer veto)", () => {
    const med = evaluateDecision({ ...baseRequest(), objective: objectiveById("medical_procedure") });
    // medical should reject far fewer (only clash vetoes are off too) — expect 0 rejects
    expect(med.rejected.length).toBe(0);
  });
});
