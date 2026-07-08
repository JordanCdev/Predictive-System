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
    // sorted descending by recommendationScore
    for (let i = 1; i < res.recommendations.length; i++) {
      expect(res.recommendations[i - 1].recommendationScore).toBeGreaterThanOrEqual(res.recommendations[i].recommendationScore);
    }
  });

  it("is deterministic — same input → same calculationHash and same top day", () => {
    const a = evaluateDecision(baseRequest());
    const b = evaluateDecision(baseRequest());
    expect(a.meta.calculationHash).toBe(b.meta.calculationHash);
    expect(a.recommendations[0].isoDate).toBe(b.recommendations[0].isoDate);
    expect(a.recommendations[0].recommendationScore).toBe(b.recommendations[0].recommendationScore);
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
    expect(top.confidence.overall).toBeLessThanOrEqual(100);
    // confidence must carry its evidence trail
    expect(top.confidence.components.calculationReproducibility).toBe(100);
    expect(top.confidence.verified).toBe(false); // no third-party report applied yet
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
    expect(top.recommendationScore).toBeGreaterThan(0);
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

  it("hard-vetoes 歲破/四離/四絕 days for high-stakes objectives (wedding)", () => {
    // A full year guarantees 歲破 (≈monthly) and 四離/四絕 (8/year) days occur.
    const req = { ...baseRequest(), objective: objectiveById("wedding_marriage") };
    req.window = { ...req.window, days: 365 };
    const res = evaluateDecision(req);
    // No accepted wedding day may carry a hard calendar taboo.
    for (const r of res.recommendations) {
      expect(r.tongshu.yearBreak, `${r.isoDate} is 歲破 but was recommended`).toBe(false);
      expect(r.tongshu.fourBoundary, `${r.isoDate} is 四離/四絕 but was recommended`).toBeNull();
    }
    // And such days DO exist in the window, rejected with a plain reason.
    const tabooRejected = res.rejected.filter((r) => r.tongshu.yearBreak || r.tongshu.fourBoundary !== null);
    expect(tabooRejected.length).toBeGreaterThan(0);
  });

  it("keeps 歲破 as a soft penalty for low-stakes objectives (career move)", () => {
    const req = { ...baseRequest(), objective: objectiveById("career_move") };
    req.window = { ...req.window, days: 365 };
    const res = evaluateDecision(req);
    // career_move has no hard calendar taboos — 歲破 days may appear, penalized.
    const yearBreakDays = res.allDays.filter((d) => d.tongshu.yearBreak);
    expect(yearBreakDays.length).toBeGreaterThan(0);
    for (const d of yearBreakDays) {
      expect(d.rulesFired.some((r) => r.code === "year_break" && r.effect < 0)).toBe(true);
      // rejected only if some OTHER veto applies (破 officer), never for 歲破 itself
      if (d.hardReject) {
        expect(d.rejectReasons.join(" ")).not.toMatch(/歲破/);
      }
    }
  });

  it("runs sensitivity sweeps by default and folds them into confidence", () => {
    const res = evaluateDecision(baseRequest());
    expect(res.meta.sensitivity).not.toBeNull();
    const s = res.meta.sensitivity!;
    expect(s.convention.comparedConventions.length).toBeGreaterThan(0);
    expect(s.weights.perturbations).toBe(8); // 4 weights × ±10%
    const top = res.recommendations[0];
    // Sweep-derived components must be the mapped scores, not the neutral defaults.
    expect([35, 65, 95]).toContain(top.confidence.components.conventionStability);
    expect([10, 45, 80]).toContain(top.confidence.components.heuristicSensitivity);
  });

  it("options.sweeps=false skips sweeps (bulk mode) and says so", () => {
    const res = evaluateDecision({ ...baseRequest(), options: { sweeps: false } });
    expect(res.meta.sensitivity).toBeNull();
    // Neutral defaults remain — and confidence is still bounded and present.
    const top = res.recommendations[0];
    expect(top.confidence.components.conventionStability).toBe(70);
    expect(top.confidence.overall).toBeGreaterThan(0);
  });

  it("solar hour-basis without longitude lowers input completeness and warns", () => {
    const base = baseRequest();
    const trueSolar = {
      ...base,
      convention: { ...base.convention, id: "ziping_true_solar_v1", hourBasis: "true_solar" as const },
    };
    const res = evaluateDecision(trueSolar);
    expect(res.meta.boundaryWarnings.join(" ")).toMatch(/longitude/i);
    const withCivil = evaluateDecision(base);
    expect(res.recommendations[0].confidence.components.inputCompleteness).toBeLessThan(
      withCivil.recommendations[0].confidence.components.inputCompleteness,
    );
  });
});
