import { describe, expect, test } from "vitest";
import {
  analyzeProfile,
  buildBaziChart,
  buildFourPillars,
  composeProfileAnswer,
  composeTimingAnswer,
  composeUnknownAnswer,
  evaluateDecision,
  matchObjective,
  objectiveById,
  parseAdvisorQuery,
  parseTimeframe,
  ZIPING_DEFAULT,
} from "./index.ts";

const BIRTH = { year: 1990, month: 6, day: 15, hour: 14, minute: 30, tzOffsetMinutes: 480, timeCertainty: "exact" as const };

describe("matchObjective", () => {
  test("maps natural phrasings to the right objective", () => {
    expect(matchObjective("when should I sign the contract?")?.objective.id).toBe("contract_signing");
    expect(matchObjective("best day to get married")?.objective.id).toBe("wedding_marriage");
    expect(matchObjective("I want to open a coffee shop")?.objective.id).toBe("open_business");
    expect(matchObjective("thinking of buying a house")?.objective.id).toBe("investment_purchase");
    expect(matchObjective("we're moving house next month")?.objective.id).toBe("moving_house");
    expect(matchObjective("starting a new job")?.objective.id).toBe("career_move");
    expect(matchObjective("booking surgery")?.objective.id).toBe("medical_procedure");
    expect(matchObjective("planning a trip abroad")?.objective.id).toBe("travel");
    expect(matchObjective("sitting my final exam")?.objective.id).toBe("study_exam");
  });

  test("disambiguates buy-house vs move-house by verb", () => {
    expect(matchObjective("buy a house")?.objective.id).toBe("investment_purchase");
    expect(matchObjective("move house")?.objective.id).toBe("moving_house");
  });

  test("returns null for unrelated text", () => {
    expect(matchObjective("the weather is nice today")).toBeNull();
    expect(matchObjective("")).toBeNull();
  });

  test("is deterministic", () => {
    const a = matchObjective("good day to launch my business");
    const b = matchObjective("good day to launch my business");
    expect(a).toEqual(b);
  });
});

describe("parseTimeframe", () => {
  test("reads idioms and explicit spans", () => {
    expect(parseTimeframe("this week")).toBe(14);
    expect(parseTimeframe("in the next month")).toBe(31);
    expect(parseTimeframe("this year")).toBe(365);
    expect(parseTimeframe("over the next 2 years")).toBe(730);
    expect(parseTimeframe("within five years")).toBe(1826);
    expect(parseTimeframe("in 3 months")).toBe(92);
    // arbitrary spans snap to the nearest supported window
    expect(parseTimeframe("the next 6 weeks")).toBe(31);
  });
  test("clamps to the supported horizon", () => {
    expect(parseTimeframe("in 20 years")).toBe(1826);
  });
  test("null when no timeframe is implied", () => {
    expect(parseTimeframe("sign the contract")).toBeNull();
  });
});

describe("analyzeProfile", () => {
  const chart = buildBaziChart(buildFourPillars(BIRTH, ZIPING_DEFAULT));

  test("ranks all objectives with a top list and plain reasons", () => {
    const p = analyzeProfile(chart);
    expect(p.fits).toHaveLength(11);
    expect(p.top.length).toBeGreaterThan(0);
    expect(p.top.length).toBeLessThanOrEqual(4);
    // sorted best-first
    for (let i = 1; i < p.fits.length; i++) expect(p.fits[i - 1].fit).toBeGreaterThanOrEqual(p.fits[i].fit);
    expect(p.headline).toMatch(/core element/i);
    for (const f of p.fits) {
      expect(f.fit).toBeGreaterThanOrEqual(0);
      expect(f.fit).toBeLessThanOrEqual(100);
      expect(f.reason.length).toBeGreaterThan(0);
    }
  });

  test("is deterministic", () => {
    expect(analyzeProfile(chart)).toEqual(analyzeProfile(chart));
  });
});

describe("parseAdvisorQuery", () => {
  test("classifies timing, profile and unknown intents", () => {
    const t = parseAdvisorQuery("when's a good day to sign the contract this year?");
    expect(t.kind).toBe("timing");
    expect(t.objectiveId).toBe("contract_signing");
    expect(t.windowDays).toBe(365);

    expect(parseAdvisorQuery("what does my chart say I'm good at?").kind).toBe("profile");
    expect(parseAdvisorQuery("hello there").kind).toBe("unknown");
  });
});

describe("compose answers", () => {
  const req = {
    birth: BIRTH,
    sex: "male" as const,
    convention: ZIPING_DEFAULT,
    objective: objectiveById("contract_signing"),
    window: { start: { year: 2026, month: 6, day: 28 }, days: 365, tzOffsetMinutes: 480 },
  };
  const result = evaluateDecision(req);

  test("timing answer points at the best day and carries an action", () => {
    const ans = composeTimingAnswer(objectiveById("contract_signing"), result, "2026-06-28", 365);
    expect(ans.title).toMatch(/best day/i);
    expect(ans.paragraphs[0]).toMatch(/\d{4}/);
    expect(ans.action?.objectiveId).toBe("contract_signing");
    expect(ans.action?.pickIso).toBe(result.recommendations[0].isoDate);
  });

  test("profile and unknown answers are non-empty and deterministic", () => {
    const chart = buildBaziChart(buildFourPillars(BIRTH, ZIPING_DEFAULT));
    const profile = analyzeProfile(chart);
    const a1 = composeProfileAnswer(profile);
    const a2 = composeProfileAnswer(profile);
    expect(a1).toEqual(a2);
    expect(a1.paragraphs.length).toBeGreaterThan(0);
    expect(composeUnknownAnswer(profile).paragraphs.length).toBeGreaterThan(0);
    expect(composeUnknownAnswer(null).paragraphs.length).toBeGreaterThan(0);
  });
});
