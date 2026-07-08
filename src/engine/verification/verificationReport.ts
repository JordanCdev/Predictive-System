/**
 * Report aggregation + confidence integration (docs/VERIFICATION.md).
 *
 * Pure functions: field agreements → one VerificationReport, and a report →
 * an updated DecisionResult whose per-day confidence uses the REAL third-party
 * agreement instead of the neutral default. Nothing here imports an external
 * comparator, so this module is safe to ship in the main bundle.
 */

import {
  ConfidenceBreakdown,
  DayRecommendation,
  DecisionResult,
  computeConfidence,
} from "../decision.ts";
import { FieldAgreement, VerificationReport, VerificationSource } from "./types.ts";

/** pass=1, warn=0.7, fail=0; blocking fields weigh double; unsupported excluded. */
export function aggregateAgreement(fields: FieldAgreement[]): {
  overallAgreementScore: number;
  blockingDisagreements: string[];
  nonBlockingDisagreements: string[];
  warnings: string[];
} {
  let sum = 0;
  let weightSum = 0;
  const blockingDisagreements: string[] = [];
  const nonBlockingDisagreements: string[] = [];
  const warnings: string[] = [];
  for (const f of fields) {
    if (f.status === "unsupported") {
      warnings.push(`${f.field}: not comparable (${f.notes?.[0] ?? "unsupported by the external source"})`);
      continue;
    }
    const value = f.status === "pass" ? 1 : f.status === "warn" ? 0.7 : 0;
    const weight = f.blocking ? 2 : 1;
    sum += value * weight;
    weightSum += weight;
    if (f.status === "fail") {
      (f.blocking ? blockingDisagreements : nonBlockingDisagreements).push(f.field);
    } else if (f.status === "warn") {
      if (f.notes?.length) warnings.push(`${f.field}: ${f.notes[0]}`);
      if (!f.blocking) nonBlockingDisagreements.push(f.field);
    }
  }
  const overallAgreementScore = weightSum === 0 ? 50 : Math.round((sum / weightSum) * 100);
  if (weightSum === 0) warnings.push("No comparable fields — agreement left at neutral 50.");
  return { overallAgreementScore, blockingDisagreements, nonBlockingDisagreements, warnings };
}

export interface ReportContext {
  engineVersion: string;
  calculationHash: string;
  dateIso: string;
  objectiveId: string;
  conventionId: string;
}

export function buildVerificationReport(
  ctx: ReportContext,
  sources: VerificationSource[],
  fields: FieldAgreement[],
): VerificationReport {
  return { ...ctx, sources, fields, ...aggregateAgreement(fields) };
}

/** Coverage grows with each independent source family actually consulted. */
export function sourceCoverageFromReport(report: VerificationReport): number {
  let coverage = 40; // internal engine
  const ids = new Set(report.sources.map((s) => s.id));
  if (ids.has("lunar-javascript")) coverage += 35;
  if (ids.has("hko")) coverage += 10;
  if (ids.has("jpl-horizons")) coverage += 10;
  return Math.min(95, coverage);
}

/**
 * Fold a third-party report into a computed result: meta.verification is set
 * and every day's confidence is recomputed with the measured agreement and
 * coverage. Returns a NEW result — the original is untouched.
 */
export function applyVerificationReport(result: DecisionResult, report: VerificationReport): DecisionResult {
  const agreement = report.overallAgreementScore;
  const coverage = sourceCoverageFromReport(report);
  const externalNames = report.sources.filter((s) => s.id !== "internal").map((s) => s.sourceLabel);

  const upgrade = (c: ConfidenceBreakdown): ConfidenceBreakdown => {
    const components = { ...c.components, thirdPartyAgreement: agreement, sourceCoverage: coverage };
    const notes = c.notes.filter((n) => !n.includes("not yet applied"));
    notes.push(`Cross-checked against ${externalNames.join(", ")} — agreement ${agreement}/100.`);
    if (report.blockingDisagreements.length > 0) {
      notes.push(`Blocking disagreements: ${report.blockingDisagreements.join("; ")}.`);
    } else if (report.nonBlockingDisagreements.length > 0) {
      notes.push(`Non-blocking differences: ${report.nonBlockingDisagreements.join("; ")}.`);
    }
    return { overall: computeConfidence(components), components, verified: true, notes };
  };

  const upgradeDay = (d: DayRecommendation): DayRecommendation => ({ ...d, confidence: upgrade(d.confidence) });
  const allDays = result.allDays.map(upgradeDay);
  const byIso = new Map(allDays.map((d) => [d.isoDate, d]));
  return {
    ...result,
    meta: { ...result.meta, verification: report },
    recommendations: result.recommendations.map((d) => byIso.get(d.isoDate) ?? upgradeDay(d)),
    rejected: result.rejected.map((d) => byIso.get(d.isoDate) ?? upgradeDay(d)),
    allDays,
  };
}
