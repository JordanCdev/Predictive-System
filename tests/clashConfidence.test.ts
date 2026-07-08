import { describe, expect, it } from "vitest";
import {
  DayRecommendation,
  confidenceLabel,
  evaluateDecision,
  headlineVerdict,
  objectiveById,
  ZIPING_DEFAULT,
} from "../src/engine/index.ts";
import { buildReportHTML } from "../src/ui/report.ts";

// Jordan: Day pillar 己巳 (branch 巳) → clashed by 亥; birth-year 寅 → clashed by 申.
const birth = { year: 1998, month: 3, day: 23, hour: 19, minute: 47, tzOffsetMinutes: 0, timeCertainty: "exact" as const };

function run(objectiveId: string, days = 240) {
  const objective = objectiveById(objectiveId);
  const res = evaluateDecision({
    birth,
    sex: "male",
    convention: ZIPING_DEFAULT,
    objective,
    window: { start: { year: 2026, month: 1, day: 1 }, days, tzOffsetMinutes: 0 },
  });
  return { objective, res };
}

const isClash = (d: DayRecommendation) => d.shenShaTags.some((t) => t.code === "clash_day" || t.code === "clash_zodiac");

describe("personal clash handling", () => {
  it("NO chart-clash day can read High (or even Good) recommendation confidence", () => {
    // career_move has clashVeto:false, so its clash days are real recommendations.
    const { res } = run("career_move");
    const clashDays = res.allDays.filter(isClash);
    expect(clashDays.length).toBeGreaterThan(0);
    for (const d of clashDays) {
      expect(d.confidence.recommendationConfidence, `${d.isoDate}`).toBeLessThan(65); // never Good(≥65)/High(≥80)
      expect(confidenceLabel(d.confidence.recommendationConfidence)).not.toBe("High confidence");
      expect(confidenceLabel(d.confidence.recommendationConfidence)).not.toBe("Good confidence");
    }
  });

  it("caps a clash day out of the Good/Excellent band and records the ceiling", () => {
    const { res } = run("career_move");
    for (const d of res.allDays.filter(isClash)) {
      expect(d.clashCeiling).toBe(57);
      expect(d.recommendationScore).toBeLessThanOrEqual(57);
    }
  });

  it("study_exam treats a clash as a strong headwind — capped into the Weak band", () => {
    const { res } = run("study_exam");
    const clashDays = res.allDays.filter(isClash);
    expect(clashDays.length).toBeGreaterThan(0);
    for (const d of clashDays) {
      expect(d.clashCeiling).toBe(44);
      expect(d.recommendationScore).toBeLessThanOrEqual(44);
    }
  });

  it("the four confidence axes are split — a clash dents ONLY the recommendation axis", () => {
    const { res } = run("career_move");
    const clash = res.allDays.filter(isClash)[0];
    expect(clash.confidence.recommendationConfidence).toBeLessThan(clash.confidence.calculationConfidence);
    // The calendar itself is still well-computed; only the recommendation is gated.
    expect(clash.confidence.calculationConfidence).toBeGreaterThanOrEqual(65);
    // Confidence axes are never framed as outcome probability.
    expect(res.allDays[0].confidence).toHaveProperty("thirdPartyAgreement");
    expect(res.allDays[0].confidence).toHaveProperty("chartFitConfidence");
  });

  it("surfaces 'good almanac, poor personal fit' and the report never says High confidence", () => {
    const { objective, res } = run("career_move");
    // A pure personal clash (not also a stronger calendar taboo like 歲破/四離,
    // which legitimately take headline precedence).
    const taboo = new Set(["year_break", "four_departure", "four_severance"]);
    const clash = res.allDays.filter((d) => isClash(d) && !d.rulesFired.some((r) => taboo.has(r.code)))[0];
    expect(clash).toBeTruthy();
    expect(headlineVerdict(clash, objective)).toMatch(/clashes your own chart|poor personal fit/i);
    const html = buildReportHTML({
      rec: clash,
      objective,
      meta: { ...res.meta, personalized: res.personalized },
      chart: res.subjectChart,
      yearOutlook: null,
      generatedNote: "test",
    });
    expect(html).not.toContain("High confidence");
    expect(html).toMatch(/not a prediction/i);
  });
});
