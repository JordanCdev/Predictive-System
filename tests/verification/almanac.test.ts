import { describe, expect, it } from "vitest";
import { buildAlmanacData } from "../../src/engine/verification/lunarAlmanac.ts";
import { evaluateDecision, DecisionRequest } from "../../src/engine/decision.ts";
import { ZIPING_DEFAULT } from "../../src/engine/conventions.ts";
import { objectiveById } from "../../src/engine/objectives.ts";

describe("lunar-javascript almanac adapter", () => {
  const window = { start: { year: 2026, month: 9, day: 1 }, days: 31, tzOffsetMinutes: 480 };

  it("builds simplified 宜/忌 lists for every civil day in the window", () => {
    const data = buildAlmanacData(window);
    expect(Object.keys(data)).toHaveLength(31);
    const day = data["2026-09-01"];
    expect(Array.isArray(day.yi)).toBe(true);
    expect(Array.isArray(day.ji)).toBe(true);
    // lunar-javascript emits simplified Chinese; no traditional 諸事不宜 variant.
    const all = Object.values(data).flatMap((d) => [...d.yi, ...d.ji]);
    expect(all.some((s) => s.includes("諸事不宜"))).toBe(false);
  });

  it("is deterministic", () => {
    expect(JSON.stringify(buildAlmanacData(window))).toBe(JSON.stringify(buildAlmanacData(window)));
  });

  it("feeds a real agreement measure into the engine", () => {
    const req: DecisionRequest = {
      convention: ZIPING_DEFAULT,
      objective: objectiveById("contract_signing"),
      window,
      options: { sweeps: false },
    };
    const almanac = buildAlmanacData(window);
    const withA = evaluateDecision({ ...req, almanac });
    // Every accepted day now has a concrete almanac verdict (not "unavailable").
    for (const r of withA.recommendations) {
      expect(["favourable", "unfavourable", "neutral"]).toContain(r.almanacVerdict);
    }
    // Agreement is a real percentage (there will be comparable days across a month).
    expect(withA.meta.almanacAgreement).not.toBeNull();
    expect(withA.meta.almanacAgreement!).toBeGreaterThanOrEqual(0);
    expect(withA.meta.almanacAgreement!).toBeLessThanOrEqual(100);
  });

  it("real 诸事不宜 days are treated as unfavourable for any activity", () => {
    // 2026-01-09 was observed to carry 诸事不宜 in the 忌 list (probe in research).
    const janWindow = { start: { year: 2026, month: 1, day: 9 }, days: 1, tzOffsetMinutes: 480 };
    const data = buildAlmanacData(janWindow);
    const day = data["2026-01-09"];
    const forbidsAll = day.yi.includes("诸事不宜") || day.ji.includes("诸事不宜");
    if (forbidsAll) {
      const req: DecisionRequest = {
        convention: ZIPING_DEFAULT,
        objective: objectiveById("wedding_marriage"),
        window: janWindow,
        options: { sweeps: false },
      };
      const withA = evaluateDecision({ ...req, almanac: data });
      expect(withA.allDays[0].almanacVerdict).toBe("unfavourable");
    }
  });
});
