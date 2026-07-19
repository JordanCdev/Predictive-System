import { describe, expect, it } from "vitest";
import {
  DayRecommendation,
  MomentInput,
  confidenceLabel,
  evaluateDecision,
  headlineVerdict,
  objectiveById,
  ZIPING_DEFAULT,
} from "../src/engine/index.ts";
import { buildReportHTML } from "../src/ui/report.ts";

/**
 * The classical date-selection hierarchy:
 *
 *   「日時沖命大凶不用，月沖次之權用，年沖可用」
 *
 * A candidate day clashing the subject's DAY or HOUR pillar is 大凶 — do not use.
 * A MONTH clash is second in severity and weighed rather than excluded. A YEAR
 * clash (the zodiac animal) is classically still usable.
 *
 * These tests previously asserted a FLAT model in which a year clash was treated
 * exactly like a day clash — hard-vetoing days the classical rule says are fine,
 * while month and hour clashes were not detected at all. They are rewritten here
 * to the graded rule, which is the doctrine the engine now declares.
 *
 * Test subject — every natal branch is distinct, so each tier is separable:
 *   year 寅(2) ← clashed by 申(8)   → mild
 *   month 卯(3) ← clashed by 酉(9)  → moderate
 *   day 巳(5) ← clashed by 亥(11)   → severe
 *   hour 戌(10) ← clashed by 辰(4)  → severe
 */
const birth: MomentInput = {
  year: 1998,
  month: 3,
  day: 23,
  hour: 19,
  minute: 47,
  tzOffsetMinutes: 0,
  timeCertainty: "exact",
};

function run(objectiveId: string, days = 240, over: Partial<MomentInput> = {}) {
  const objective = objectiveById(objectiveId);
  const res = evaluateDecision({
    birth: { ...birth, ...over },
    sex: "male",
    convention: ZIPING_DEFAULT,
    objective,
    window: { start: { year: 2026, month: 1, day: 1 }, days, tzOffsetMinutes: 0 },
  });
  return { objective, res };
}

const has = (d: DayRecommendation, code: string) => d.shenShaTags.some((t) => t.code === code);
/** Days carrying exactly one clash code, so a tier can be observed in isolation. */
const only = (days: DayRecommendation[], code: string) =>
  days.filter(
    (d) => has(d, code) && !["clash_day", "clash_hour", "clash_month", "clash_zodiac"].some((c) => c !== code && has(d, c)),
  );

describe("clash severity follows the classical pillar hierarchy", () => {
  it("detects a clash against each of the four natal pillars", () => {
    // The engine previously read only the day and year branches, so month and
    // hour clashes were invisible to date selection entirely.
    const { res } = run("career_move", 365);
    for (const code of ["clash_day", "clash_hour", "clash_month", "clash_zodiac"]) {
      expect(res.allDays.some((d) => has(d, code)), code).toBe(true);
    }
  });

  it("caps a Day clash out of the Good band (大凶)", () => {
    const { res } = run("career_move"); // clashVeto:false, so clash days survive to be inspected
    const days = only(res.allDays, "clash_day");
    expect(days.length).toBeGreaterThan(0);
    for (const d of days) {
      expect(d.clashCeiling).toBe(57);
      expect(d.recommendationScore).toBeLessThanOrEqual(57);
    }
  });

  it("caps an Hour clash exactly as severely as a Day clash (日時 rank together)", () => {
    const { res } = run("career_move");
    const days = only(res.allDays, "clash_hour");
    expect(days.length).toBeGreaterThan(0);
    for (const d of days) expect(d.clashCeiling).toBe(57);
  });

  it("weighs a Month clash without ruling it out (月沖次之權用)", () => {
    const { res } = run("career_move");
    const days = only(res.allDays, "clash_month");
    expect(days.length).toBeGreaterThan(0);
    for (const d of days) {
      // Kept out of "Excellent", but still able to read "Good" — unlike 日/時沖.
      expect(d.clashCeiling).toBe(68);
      expect(d.recommendationScore).toBeLessThanOrEqual(68);
    }
  });

  it("leaves a Year clash uncapped (年沖可用)", () => {
    const { res } = run("career_move");
    const days = only(res.allDays, "clash_zodiac");
    expect(days.length).toBeGreaterThan(0);
    for (const d of days) {
      // Recorded as a negative in the personal sub-score, but the classical rule
      // is explicit that a year clash does not disqualify a day.
      expect(d.clashCeiling).toBeNull();
      expect(has(d, "clash_zodiac")).toBe(true);
    }
  });
});

describe("hard vetoes", () => {
  it("hard-rejects a Day clash for an objective that vetoes clashes", () => {
    const { res } = run("wedding_marriage"); // clashVeto: true
    const rejected = res.rejected.filter((d) => has(d, "clash_day"));
    expect(rejected.length).toBeGreaterThan(0);
    expect(rejected[0].rejectReasons.join(" ")).toMatch(/日時沖命不用/);
    // …and no day-clash day survives into the recommendations.
    expect(res.recommendations.some((d) => has(d, "clash_day"))).toBe(false);
  });

  it("does NOT hard-reject a Year clash, even for a veto objective", () => {
    // The behaviour this whole change exists for. Previously a 沖生肖 day was
    // silently removed from a wedding search, contradicting 年沖可用 — and the
    // rejection message even mislabelled it as a Day clash.
    const { res } = run("wedding_marriage");
    const yearOnly = only(res.allDays, "clash_zodiac");
    expect(yearOnly.length).toBeGreaterThan(0);
    // A day may still be rejected for an UNRELATED reason (a forbidden officer,
    // 歲破/四離/四絕). What must never happen is a rejection *because of* the year
    // clash — so assert on the reason, not merely on hardReject.
    for (const d of yearOnly) {
      expect(d.rejectReasons.join(" "), d.isoDate).not.toMatch(/沖|clash/i);
    }
    expect(res.recommendations.some((d) => has(d, "clash_zodiac"))).toBe(true);
  });

  it("does NOT hard-reject a Month clash for a veto objective", () => {
    const { res } = run("wedding_marriage");
    const monthOnly = only(res.allDays, "clash_month");
    expect(monthOnly.length).toBeGreaterThan(0);
    for (const d of monthOnly) {
      expect(d.rejectReasons.join(" "), d.isoDate).not.toMatch(/沖|clash/i);
    }
    expect(res.recommendations.some((d) => has(d, "clash_month"))).toBe(true);
  });

  it("ignores the Hour pillar entirely when the birth time is unknown", () => {
    // With no birth time the engine substitutes noon, so the hour pillar is
    // fabricated. Vetoing a real decision on invented data would be far worse
    // than not checking.
    const { res } = run("wedding_marriage", 240, { timeCertainty: "hour_unknown" });
    expect(res.allDays.some((d) => has(d, "clash_hour"))).toBe(false);
  });
});

describe("confidence is capped by the same hierarchy", () => {
  it("never lets a Day or Hour clash read Good or High confidence", () => {
    const { res } = run("career_move");
    const severe = res.allDays.filter((d) => has(d, "clash_day") || has(d, "clash_hour"));
    expect(severe.length).toBeGreaterThan(0);
    for (const d of severe) {
      expect(d.confidence.recommendationConfidence, d.isoDate).toBeLessThan(65);
      expect(confidenceLabel(d.confidence.recommendationConfidence)).not.toBe("High confidence");
      expect(confidenceLabel(d.confidence.recommendationConfidence)).not.toBe("Good confidence");
    }
  });

  it("caps a Month clash below High, but less harshly than a Day clash", () => {
    const { res } = run("career_move");
    const monthOnly = only(res.allDays, "clash_month");
    expect(monthOnly.length).toBeGreaterThan(0);
    for (const d of monthOnly) expect(d.confidence.recommendationConfidence).toBeLessThan(80);
  });

  it("applies a stricter objective ceiling on top of the hierarchy", () => {
    // study_exam sets clashScoreCeiling: 44, which replaces the severe ceiling.
    const { res } = run("study_exam");
    const days = only(res.allDays, "clash_day");
    expect(days.length).toBeGreaterThan(0);
    for (const d of days) {
      expect(d.clashCeiling).toBe(44);
      expect(d.recommendationScore).toBeLessThanOrEqual(44);
    }
  });

  it("dents ONLY the recommendation axis — the calendar is still well computed", () => {
    const { res } = run("career_move");
    const clash = res.allDays.filter((d) => has(d, "clash_day"))[0];
    expect(clash.confidence.recommendationConfidence).toBeLessThan(clash.confidence.calculationConfidence);
    expect(clash.confidence.calculationConfidence).toBeGreaterThanOrEqual(65);
    expect(res.allDays[0].confidence).toHaveProperty("thirdPartyAgreement");
    expect(res.allDays[0].confidence).toHaveProperty("chartFitConfidence");
  });

  it("surfaces 'good almanac, poor personal fit' and never claims High confidence", () => {
    const { objective, res } = run("career_move");
    const taboo = new Set(["year_break", "four_departure", "four_severance"]);
    const clash = res.allDays.filter((d) => has(d, "clash_day") && !d.rulesFired.some((r) => taboo.has(r.code)))[0];
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
