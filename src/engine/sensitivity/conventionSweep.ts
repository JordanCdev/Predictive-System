/**
 * Convention-sensitivity sweep (docs/VERIFICATION.md).
 *
 * School conventions (Zi-hour day rollover, true-solar hour basis…) are real
 * upstream variables, not implementation details (docs/DECISIONS.md §4). This
 * sweep re-runs the same request under every other supported convention preset
 * and reports whether the top pick — and the subject's pillars — survive. The
 * evaluator is injected to keep this module free of a runtime dependency on
 * decision.ts (types only).
 */

import type { ConventionSet } from "../conventions.ts";
import type { DecisionRequest, DecisionResult } from "../decision.ts";

export interface ConventionSweepResult {
  baselineConvention: string;
  comparedConventions: string[];
  /** Rank (1-based) of the baseline top day under each compared convention; -1 = vetoed there. */
  topRankByConvention: Record<string, number>;
  /** True when the baseline top day stays rank 1 under every compared convention. */
  topDayStable: boolean;
  /** Subject pillars that change, e.g. "hour pillar: 丙午 → 丁未 (ziping_zi23_v1)". */
  pillarDifferences: string[];
  /** Best-hour changes on the baseline top day, e.g. "best hour 午 → 未 (ziping_true_solar_v1)". */
  bestHourDifferences: string[];
  severity: "low" | "medium" | "high";
}

const POSITION_LABEL = ["year", "month", "day", "hour"] as const;

export function runConventionSweep(
  req: DecisionRequest,
  baseline: DecisionResult,
  conventions: ConventionSet[],
  evaluate: (req: DecisionRequest) => DecisionResult,
): ConventionSweepResult {
  const others = conventions.filter((c) => c.id !== req.convention.id);
  const topIso = baseline.recommendations[0]?.isoDate ?? null;
  const basePillars = baseline.subjectChart?.pillars.map((p) => p.ganzhi.hanzi) ?? null;
  const baseBestHour = topIso
    ? baseline.allDays.find((d) => d.isoDate === topIso)?.bestHour?.ganzhi.branch.hanzi ?? null
    : null;

  const topRankByConvention: Record<string, number> = {};
  const pillarDifferences: string[] = [];
  const bestHourDifferences: string[] = [];

  for (const conv of others) {
    const res = evaluate({ ...req, convention: conv, options: { ...req.options, sweeps: false } });
    if (topIso) {
      const rank = res.recommendations.findIndex((r) => r.isoDate === topIso) + 1;
      topRankByConvention[conv.id] = rank === 0 ? -1 : rank;
    }
    if (basePillars && res.subjectChart) {
      const pillars = res.subjectChart.pillars.map((p) => p.ganzhi.hanzi);
      pillars.forEach((hanzi, i) => {
        if (hanzi !== basePillars[i]) {
          pillarDifferences.push(`${POSITION_LABEL[i]} pillar: ${basePillars[i]} → ${hanzi} (${conv.id})`);
        }
      });
    }
    if (topIso && baseBestHour) {
      const altHour = res.allDays.find((d) => d.isoDate === topIso)?.bestHour?.ganzhi.branch.hanzi ?? null;
      if (altHour && altHour !== baseBestHour) {
        bestHourDifferences.push(`best hour ${baseBestHour} → ${altHour} (${conv.id})`);
      }
    }
  }

  const ranks = Object.values(topRankByConvention);
  const topDayStable = ranks.every((r) => r === 1);
  const leftTop3 = ranks.some((r) => r === -1 || r > 3);
  // A year/month/day pillar flip inverts the whole personal read; an hour flip is milder.
  const structuralPillarFlip = pillarDifferences.some((d) => !d.startsWith("hour pillar"));

  const severity: ConventionSweepResult["severity"] =
    leftTop3 || structuralPillarFlip
      ? "high"
      : !topDayStable || pillarDifferences.length > 0 || bestHourDifferences.length > 0
        ? "medium"
        : "low";

  return {
    baselineConvention: req.convention.id,
    comparedConventions: others.map((c) => c.id),
    topRankByConvention,
    topDayStable,
    pillarDifferences,
    bestHourDifferences,
    severity,
  };
}

/** Confidence input mapping: 100 = fully stable across school conventions. */
export function conventionSweepToScore(r: ConventionSweepResult): number {
  return r.severity === "high" ? 35 : r.severity === "medium" ? 65 : 95;
}
