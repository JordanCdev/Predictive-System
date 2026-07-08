import { describe, expect, it } from "vitest";
import { evaluateDecision, DecisionRequest } from "../../src/engine/decision.ts";
import { ZIPING_DEFAULT, ZIPING_ZI_ROLLOVER } from "../../src/engine/conventions.ts";
import { objectiveById } from "../../src/engine/objectives.ts";
import { buildFourPillars } from "../../src/engine/sexagenary.ts";
import { computeTongShuDay } from "../../src/engine/tongshu.ts";
import { jieWindowAround } from "../../src/engine/astronomy.ts";
import { verifyCandidateDay, verifyNatalChart } from "../../src/engine/verification/verifyLunarJavascript.ts";
import { verifyDecisionResult, applyVerificationReport } from "../../src/engine/verification/runVerification.ts";
import { VerificationReport } from "../../src/engine/verification/types.ts";

const CHECKED_AT = "2026-07-08T00:00:00Z"; // fixed: tests stay deterministic

function findField(report: VerificationReport, field: string, nth = 0) {
  return report.fields.filter((f) => f.field === field)[nth];
}

describe("lunar-javascript cross-check — full result verification", () => {
  const req: DecisionRequest = {
    birth: { year: 1990, month: 6, day: 15, hour: 14, minute: 30, tzOffsetMinutes: 480, timeCertainty: "exact" },
    sex: "male",
    convention: ZIPING_DEFAULT,
    // A window well clear of 節 boundaries (白露 Sep 7, 秋分 Sep 23).
    window: { start: { year: 2026, month: 9, day: 10 }, days: 5, tzOffsetMinutes: 480 },
    objective: objectiveById("contract_signing"),
    options: { sweeps: false },
  };

  it("agrees on all blocking calendar facts for a stable non-boundary window", async () => {
    const result = evaluateDecision(req);
    const report = await verifyDecisionResult(req, result, CHECKED_AT);

    expect(findField(report, "dayPillar")?.status).toBe("pass");
    expect(findField(report, "monthPillar")?.status).toBe("pass");
    expect(findField(report, "yearPillar")?.status).toBe("pass");
    expect(findField(report, "clash")?.status).toBe("pass");
    expect(report.blockingDisagreements).toEqual([]);
    expect(report.overallAgreementScore).toBeGreaterThanOrEqual(90);
    expect(report.sources.map((s) => s.id)).toContain("lunar-javascript");
    expect(report.sources.map((s) => s.id)).toContain("hko");
  });

  it("applyVerificationReport upgrades confidence with the measured agreement", async () => {
    const result = evaluateDecision(req);
    const report = await verifyDecisionResult(req, result, CHECKED_AT);
    const verified = applyVerificationReport(result, report);

    expect(verified.meta.verification).toBe(report);
    const top = verified.recommendations[0];
    expect(top.confidence.verified).toBe(true);
    expect(top.confidence.components.thirdPartyAgreement).toBe(report.overallAgreementScore);
    expect(top.confidence.components.sourceCoverage).toBeGreaterThan(40);
    // The unverified original is untouched (pure function).
    expect(result.recommendations[0].confidence.verified).toBe(false);
    // With high agreement the verified confidence must not be lower.
    expect(top.confidence.overall).toBeGreaterThanOrEqual(result.recommendations[0].confidence.overall);
  });

  it("verification is deterministic for identical inputs", async () => {
    const result = evaluateDecision(req);
    const a = await verifyDecisionResult(req, result, CHECKED_AT);
    const b = await verifyDecisionResult(req, result, CHECKED_AT);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe("lunar-javascript cross-check — day-fact sweep across 2026", () => {
  it("matches day pillar, officer, day god and clash on non-boundary days", () => {
    // Every 13 days through 2026 — 28 dates, cycling through officers/gods.
    for (let i = 0; i < 28; i++) {
      const utc = Date.UTC(2026, 0, 5 + i * 13, 12) - 480 * 60000;
      const d = new Date(utc + 480 * 60000);
      const civil = { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
      const ts = computeTongShuDay(civil, utc);
      const jw = jieWindowAround(utc);
      const nearJie = Math.min(Math.abs(utc - jw.prev.millis), Math.abs(jw.next.millis - utc)) < 36 * 3600000;
      const fields = verifyCandidateDay({
        civil,
        tongshu: ts,
        tzOffsetMinutes: 480,
        primaryTag: "general",
        nearJieBoundary: nearJie,
      });
      for (const f of fields) {
        expect(
          f.status,
          `${civil.year}-${civil.month}-${civil.day} ${f.field}: expected=${String(f.expected)} actual=${String(f.actual)} nearJie=${nearJie}`,
        ).not.toBe("fail");
        if (!nearJie && ["dayPillar", "officer12", "dayGod12", "clash"].includes(f.field)) {
          expect(f.status, `${civil.year}-${civil.month}-${civil.day} ${f.field}`).toBe("pass");
        }
      }
    }
  });
});

describe("lunar-javascript cross-check — natal charts", () => {
  it("confirms the published anchor chart 2000-01-01 (己卯/丙子/戊午)", () => {
    const birth = { year: 2000, month: 1, day: 1, hour: 12, minute: 0, tzOffsetMinutes: 480 } as const;
    const fp = buildFourPillars(birth, ZIPING_DEFAULT);
    expect(fp.year.hanzi).toBe("己卯");
    expect(fp.month.hanzi).toBe("丙子");
    expect(fp.day.hanzi).toBe("戊午");
    const fields = verifyNatalChart(birth, ZIPING_DEFAULT, {
      year: fp.year.hanzi,
      month: fp.month.hanzi,
      day: fp.day.hanzi,
      hour: fp.hour.hanzi,
    });
    for (const f of fields) {
      expect(f.status, `${f.field}: expected=${String(f.expected)} actual=${String(f.actual)}`).toBe("pass");
    }
  });

  it("confirms the baseline test chart 1990-06-15 14:30 across all four pillars", () => {
    const birth = { year: 1990, month: 6, day: 15, hour: 14, minute: 30, tzOffsetMinutes: 480 } as const;
    const fp = buildFourPillars(birth, ZIPING_DEFAULT);
    const fields = verifyNatalChart(birth, ZIPING_DEFAULT, {
      year: fp.year.hanzi,
      month: fp.month.hanzi,
      day: fp.day.hanzi,
      hour: fp.hour.hanzi,
    });
    for (const f of fields) {
      expect(f.status, `${f.field}: expected=${String(f.expected)} actual=${String(f.actual)}`).toBe("pass");
    }
  });

  it("agrees on the 23:00 day rollover under the zi_23 convention (sect 1)", () => {
    const birth = { year: 2026, month: 3, day: 10, hour: 23, minute: 30, tzOffsetMinutes: 480 } as const;
    const fp = buildFourPillars(birth, ZIPING_ZI_ROLLOVER);
    expect(fp.day.hanzi).toBe("甲申"); // rolled to the next day
    const fields = verifyNatalChart(birth, ZIPING_ZI_ROLLOVER, {
      year: fp.year.hanzi,
      month: fp.month.hanzi,
      day: fp.day.hanzi,
      hour: fp.hour.hanzi,
    });
    expect(fields.find((f) => f.field === "dayPillar")?.status).toBe("pass");
    expect(fields.find((f) => f.field === "hourPillar")?.status).toBe("pass"); // both give 甲子
  });

  it("flags the 23:00 hour-stem school split under civil-midnight as warn, not fail", () => {
    const birth = { year: 2026, month: 3, day: 10, hour: 23, minute: 30, tzOffsetMinutes: 480 } as const;
    const fp = buildFourPillars(birth, ZIPING_DEFAULT);
    expect(fp.day.hanzi).toBe("癸未"); // civil date keeps the day
    const fields = verifyNatalChart(birth, ZIPING_DEFAULT, {
      year: fp.year.hanzi,
      month: fp.month.hanzi,
      day: fp.day.hanzi,
      hour: fp.hour.hanzi,
    });
    expect(fields.find((f) => f.field === "dayPillar")?.status).toBe("pass"); // sect 2 matches
    const hour = fields.find((f) => f.field === "hourPillar")!;
    expect(hour.status).toBe("warn"); // 晚子時 school split — documented, non-blocking
    expect(hour.blocking).toBe(false);
  });
});
