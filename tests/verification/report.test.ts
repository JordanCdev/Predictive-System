import { describe, expect, it } from "vitest";
import {
  aggregateAgreement,
  applyVerificationReport,
} from "../../src/engine/verification/verificationReport.ts";
import { verifyDecisionResult } from "../../src/engine/verification/runVerification.ts";
import { verifyCandidateDay } from "../../src/engine/verification/verifyLunarJavascript.ts";
import { verifyTermsAround } from "../../src/engine/verification/verifySolarTerms.ts";
import { computeTongShuDay } from "../../src/engine/tongshu.ts";
import { evaluateDecision, DecisionRequest } from "../../src/engine/decision.ts";
import { ZIPING_DEFAULT } from "../../src/engine/conventions.ts";
import { objectiveById } from "../../src/engine/objectives.ts";
import { FieldAgreement } from "../../src/engine/verification/types.ts";

const CHECKED_AT = "2026-07-08T00:00:00Z";

const field = (over: Partial<FieldAgreement>): FieldAgreement => ({
  field: "dayPillar",
  status: "pass",
  source: "lunar-javascript",
  blocking: true,
  ...over,
});

describe("aggregateAgreement (review regressions)", () => {
  it("a warn on a BLOCKING field is visible in nonBlockingDisagreements, not hidden", () => {
    const agg = aggregateAgreement([
      field({ field: "monthPillar", status: "warn", blocking: true, notes: ["boundary frame"] }),
      field({ field: "dayPillar", status: "pass" }),
    ]);
    expect(agg.nonBlockingDisagreements).toContain("monthPillar");
    expect(agg.blockingDisagreements).toEqual([]);
  });

  it("repeated field names are deduplicated in the disagreement lists", () => {
    const agg = aggregateAgreement([
      field({ field: "solarLongitude", status: "warn", blocking: false, source: "hko" }),
      field({ field: "solarLongitude", status: "warn", blocking: false, source: "hko" }),
    ]);
    expect(agg.nonBlockingDisagreements).toEqual(["solarLongitude"]);
  });

  it("unsupported-only reports stay neutral at 50 with a warning", () => {
    const agg = aggregateAgreement([field({ status: "unsupported", source: "hko" })]);
    expect(agg.overallAgreementScore).toBe(50);
    expect(agg.warnings.join(" ")).toMatch(/No comparable fields/);
  });
});

describe("verification outside fixture coverage (review regressions)", () => {
  it("a day past the last fixture year gets NO false HKO bracket (小寒 2028 is absent)", () => {
    // 2028-01-10 sits between 小寒 2028-01-06 (not in fixtures) and 大寒 2028-01-20;
    // the nearest FIXTURE terms (冬至 2027-12-22 / —) do not bracket it.
    const fields = verifyTermsAround(Date.UTC(2028, 0, 10, 12));
    expect(fields).toHaveLength(1);
    expect(fields[0].status).toBe("unsupported");
  });

  it("a 2028 window report stays self-consistent: sources resolvable, coverage honest, note truthful", async () => {
    const req: DecisionRequest = {
      convention: ZIPING_DEFAULT,
      objective: objectiveById("contract_signing"),
      window: { start: { year: 2028, month: 6, day: 1 }, days: 7, tzOffsetMinutes: 480 },
      options: { sweeps: false },
    };
    const result = evaluateDecision(req);
    const report = await verifyDecisionResult(req, result, CHECKED_AT);
    // Every field's source id must resolve against report.sources.
    const sourceIds = new Set(report.sources.map((s) => s.id));
    for (const f of report.fields) {
      expect(sourceIds.has(f.source), `${f.field} references unlisted source ${f.source}`).toBe(true);
    }
    // HKO produced no comparable field → it must not raise coverage or be
    // claimed in the confidence note (lunar-javascript still is).
    const verified = applyVerificationReport(result, report);
    const top = verified.recommendations[0];
    expect(top.confidence.components.sourceCoverage).toBe(75); // 40 + lunar 35, no HKO
    expect(top.confidence.notes.join(" ")).not.toMatch(/Hong Kong Observatory/);
  });

  it("no-candidate-window fallback keeps dateIso a real ISO date", async () => {
    const req: DecisionRequest = {
      convention: ZIPING_DEFAULT,
      objective: objectiveById("contract_signing"),
      window: { start: { year: 2026, month: 9, day: 1 }, days: 0, tzOffsetMinutes: 480 },
      options: { sweeps: false },
    };
    const result = evaluateDecision(req);
    const report = await verifyDecisionResult(req, result, CHECKED_AT);
    expect(report.dateIso).toBe("2026-09-01");
    expect(Number.isNaN(Date.parse(report.dateIso))).toBe(false);
  });
});

describe("applyVerificationReport idempotency (review regression)", () => {
  it("re-applying a report replaces its notes instead of accumulating them", async () => {
    const req: DecisionRequest = {
      birth: { year: 1990, month: 6, day: 15, hour: 14, minute: 30, tzOffsetMinutes: 480 },
      sex: "male",
      convention: ZIPING_DEFAULT,
      objective: objectiveById("contract_signing"),
      window: { start: { year: 2026, month: 9, day: 10 }, days: 5, tzOffsetMinutes: 480 },
      options: { sweeps: false },
    };
    const result = evaluateDecision(req);
    const report = await verifyDecisionResult(req, result, CHECKED_AT);
    const once = applyVerificationReport(result, report);
    const twice = applyVerificationReport(once, report);
    const notesOnce = once.recommendations[0].confidence.notes;
    const notesTwice = twice.recommendations[0].confidence.notes;
    expect(notesTwice).toEqual(notesOnce);
    expect(notesTwice.filter((n) => n.startsWith("Cross-checked against"))).toHaveLength(1);
  });
});

describe("诸事不宜 in the YI list (review regression)", () => {
  it("2026-05-02 (诸事不宜 published under 宜) is warned, not passed", () => {
    const civil = { year: 2026, month: 5, day: 2 };
    const ts = computeTongShuDay(civil, Date.UTC(2026, 4, 2, 4));
    const fields = verifyCandidateDay({
      civil,
      tongshu: ts,
      tzOffsetMinutes: 480,
      primaryTag: "ground",
      nearJieBoundary: false,
    });
    const yi = fields.find((f) => f.field === "yi")!;
    expect(yi.status).toBe("warn");
    expect(yi.notes?.join(" ")).toMatch(/诸事不宜/);
  });
});
