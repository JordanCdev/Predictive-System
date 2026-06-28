import { describe, it, expect } from "vitest";
import { evaluateDecision } from "./decision.ts";
import { ZIPING_DEFAULT } from "./conventions.ts";
import { objectiveById } from "./objectives.ts";
import {
  confidencePlain,
  headlineVerdict,
  humanDate,
  humanHourRange,
  relativeDay,
  subScoreNarrative,
  verdictBand,
  whyThisDay,
} from "./plainEnglish.ts";

const objective = objectiveById("contract_signing");

function personalReq() {
  return {
    birth: { year: 1990, month: 6, day: 15, hour: 14, minute: 30, tzOffsetMinutes: 480, timeCertainty: "exact" as const },
    sex: "male" as const,
    convention: ZIPING_DEFAULT,
    objective,
    window: { start: { year: 2026, month: 7, day: 1 }, days: 20, tzOffsetMinutes: 480 },
  };
}

describe("plainEnglish (deterministic explanation layer)", () => {
  it("verdictBand thresholds match the classical bands", () => {
    expect(verdictBand(80).key).toBe("excellent");
    expect(verdictBand(60).key).toBe("favourable");
    expect(verdictBand(50).key).toBe("neutral");
    expect(verdictBand(40).key).toBe("caution");
    expect(verdictBand(20).key).toBe("avoid");
  });

  it("verdictBand key↔label pairing is stable (guards UI colour-map drift)", () => {
    const pairs: Record<string, string> = {
      excellent: "Excellent",
      favourable: "Good",
      neutral: "Neutral",
      caution: "Weak",
      avoid: "Avoid",
    };
    for (const score of [90, 72, 65, 58, 50, 45, 38, 32, 10]) {
      const b = verdictBand(score);
      expect(pairs[b.key]).toBe(b.label);
    }
  });

  it("formats hours into a human clock", () => {
    expect(humanHourRange("寅 03:00–05:00")).toBe("3–5am");
    expect(humanHourRange("午 11:00–13:00")).toBe("11am–1pm");
    expect(humanHourRange("酉 17:00–19:00")).toBe("5–7pm");
  });

  it("relativeDay handles today / tomorrow / weeks", () => {
    expect(relativeDay("2026-07-01", "2026-07-01")).toBe("today");
    expect(relativeDay("2026-07-02", "2026-07-01")).toBe("tomorrow");
    expect(relativeDay("2026-07-10", "2026-07-01")).toBe("in 9 days");
    expect(relativeDay("2026-07-22", "2026-07-01")).toBe("in 3 weeks");
  });

  it("humanDate is stable", () => {
    expect(humanDate({ year: 2026, month: 7, day: 14 })).toBe("Tuesday, 14 July 2026");
  });

  it("produces identical strings for identical inputs (determinism)", () => {
    const a = evaluateDecision(personalReq());
    const b = evaluateDecision(personalReq());
    const ra = a.recommendations[0];
    const rb = b.recommendations[0];
    expect(headlineVerdict(ra, objective)).toBe(headlineVerdict(rb, objective));
    expect(whyThisDay(ra).join("|")).toBe(whyThisDay(rb).join("|"));
    expect(JSON.stringify(confidencePlain(ra.confidence, true))).toBe(JSON.stringify(confidencePlain(rb.confidence, true)));
  });

  it("personalized day narrates all four sub-scores; almanac narrates two", () => {
    const personal = evaluateDecision(personalReq());
    expect(subScoreNarrative(personal.recommendations[0], objective.weights)).toHaveLength(4);

    const { birth, sex, ...rest } = personalReq();
    void birth;
    void sex;
    const almanac = evaluateDecision(rest);
    const sub = subScoreNarrative(almanac.recommendations[0], objective.weights);
    expect(sub).toHaveLength(2);
    // renormalized weights sum to 100%
    expect(sub[0].weightPct + sub[1].weightPct).toBe(100);
  });

  it("headlineVerdict reads as plain English", () => {
    const res = evaluateDecision(personalReq());
    const h = headlineVerdict(res.recommendations[0], objective);
    expect(h).toMatch(/day to sign and close deals|avoid/i);
    expect(h).not.toMatch(/[一-鿿]/); // no raw hanzi in the headline
  });
});
