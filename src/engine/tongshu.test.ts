import { describe, it, expect } from "vitest";
import { computeTongShuDay } from "./tongshu.ts";
import { evaluateDecision } from "./decision.ts";
import { ZIPING_DEFAULT } from "./conventions.ts";
import { objectiveById } from "./objectives.ts";

const TZ = 480; // CST
const noonUtc = (y: number, m: number, d: number) => Date.UTC(y, m - 1, d, 12) - TZ * 60000;

describe("四離/四絕 calendar taboo", () => {
  it("flags the day before a season pivot", () => {
    // 立春 2024-02-04 → 四絕日 = 2024-02-03; 春分 2024-03-20 → 四離日 = 2024-03-19.
    expect(computeTongShuDay({ year: 2024, month: 2, day: 3 }, noonUtc(2024, 2, 3)).fourBoundary).toBe("si_jue");
    expect(computeTongShuDay({ year: 2024, month: 3, day: 19 }, noonUtc(2024, 3, 19)).fourBoundary).toBe("si_li");
    // 夏至 2024-06-21 → 四離 = 2024-06-20.
    expect(computeTongShuDay({ year: 2024, month: 6, day: 20 }, noonUtc(2024, 6, 20)).fourBoundary).toBe("si_li");
    // An ordinary day is not flagged.
    expect(computeTongShuDay({ year: 2024, month: 2, day: 15 }, noonUtc(2024, 2, 15)).fourBoundary).toBeNull();
  });

  it("flags 歲破 (year-break) days — a 子 day clashes the 2026 太歲 (午)", () => {
    let found = false;
    for (let d = 1; d <= 31; d++) {
      const ts = computeTongShuDay({ year: 2026, month: 7, day: d }, noonUtc(2026, 7, d));
      const isZi = ts.dayGanzhi.branch.hanzi === "子";
      expect(ts.yearBreak).toBe(isZi); // 太歲 午 → 歲破 is exactly the 子 days
      if (isZi) found = true;
    }
    expect(found).toBe(true);
  });

  it("penalizes a 四絕 day for a wedding (大事勿用) but spares medical", () => {
    const base = {
      convention: ZIPING_DEFAULT,
      window: { start: { year: 2024, month: 2, day: 3 }, days: 1, tzOffsetMinutes: TZ },
    };
    const wedding = evaluateDecision({ ...base, objective: objectiveById("wedding_marriage") });
    const day = wedding.allDays[0];
    expect(day.rulesFired.some((r) => r.code === "four_severance")).toBe(true);
    expect(day.rulesFired.find((r) => r.code === "four_severance")!.effect).toBeLessThan(0);

    const medical = evaluateDecision({ ...base, objective: objectiveById("medical_procedure") });
    expect(medical.allDays[0].rulesFired.some((r) => r.code === "four_severance")).toBe(false);
  });
});
