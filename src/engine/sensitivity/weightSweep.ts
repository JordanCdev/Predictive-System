/**
 * Weight-sensitivity sweep (docs/VERIFICATION.md).
 *
 * The MCDA weights are authorial calibration, not doctrine (docs/DECISIONS.md
 * §6.2), so a trustworthy recommendation should survive small perturbations of
 * them. Each of the four weights is scaled ×0.9 and ×1.1 (then renormalised),
 * the already-computed sub-scores are re-combined, and the ranking is rebuilt.
 * No day is re-evaluated — sub-scores are facts of the day under the chosen
 * convention — so the sweep is cheap and exactly reproducible.
 */

import type { DayRecommendation } from "../decision.ts";
import type { McdaWeights } from "../objectives.ts";

export interface WeightSweepResult {
  /** Number of perturbed rankings computed (4 weights × ±10%). */
  perturbations: number;
  /** Fraction of perturbations that kept the baseline top day at rank 1. */
  topDayStableRatio: number;
  /** Worst rank the baseline top day fell to across perturbations (1 = never moved). */
  worstTopRank: number;
  /** Baseline score gap between rank 1 and rank 2 (recommendation points). */
  scoreGapTop2: number;
  /** Days within 2 points of the baseline top score (excluding the top itself). */
  nearTieCount: number;
  severity: "low" | "medium" | "high";
}

const WEIGHT_KEYS: (keyof McdaWeights)[] = ["officer", "road", "personal", "hour"];

/** Re-combine a day's fixed sub-scores under alternative weights — mirrors the
 *  MCDA combine in decision.ts (personalized 4-way; almanac renormalised 2-way). */
function combined(day: DayRecommendation, w: McdaWeights): number {
  const s = day.subScores;
  const raw =
    day.personalized && s.personal !== null && s.hour !== null
      ? w.officer * s.officer + w.road * s.road + w.personal * s.personal + w.hour * s.hour
      : (w.officer * s.officer + w.road * s.road) / (w.officer + w.road || 1);
  // Respect the personal-clash ceiling so a capped clash day can't out-rank
  // under perturbation (mirrors the cap applied to recommendationScore).
  return typeof day.clashCeiling === "number" ? Math.min(raw, day.clashCeiling) : raw;
}

export function runWeightSweep(days: DayRecommendation[], weights: McdaWeights): WeightSweepResult {
  const accepted = days.filter((d) => !d.hardReject);
  if (accepted.length < 2) {
    return { perturbations: 0, topDayStableRatio: 1, worstTopRank: 1, scoreGapTop2: 100, nearTieCount: 0, severity: "low" };
  }
  const baseline = [...accepted].sort(
    (a, b) => b.recommendationScore - a.recommendationScore || a.isoDate.localeCompare(b.isoDate),
  );
  const topIso = baseline[0].isoDate;
  const scoreGapTop2 = Math.round((baseline[0].recommendationScore - baseline[1].recommendationScore) * 10) / 10;
  const nearTieCount = baseline.filter(
    (d, i) => i > 0 && baseline[0].recommendationScore - d.recommendationScore <= 2,
  ).length;

  let stable = 0;
  let worstTopRank = 1;
  let perturbations = 0;
  for (const key of WEIGHT_KEYS) {
    for (const factor of [0.9, 1.1]) {
      const w = { ...weights, [key]: weights[key] * factor };
      const sum = w.officer + w.road + w.personal + w.hour;
      const norm: McdaWeights = {
        officer: w.officer / sum,
        road: w.road / sum,
        personal: w.personal / sum,
        hour: w.hour / sum,
      };
      const reranked = [...accepted].sort(
        (a, b) => combined(b, norm) - combined(a, norm) || a.isoDate.localeCompare(b.isoDate),
      );
      const rank = reranked.findIndex((d) => d.isoDate === topIso) + 1;
      if (rank === 1) stable++;
      worstTopRank = Math.max(worstTopRank, rank);
      perturbations++;
    }
  }

  const topDayStableRatio = Math.round((stable / perturbations) * 100) / 100;
  const severity: WeightSweepResult["severity"] =
    topDayStableRatio < 0.75 || worstTopRank > 3
      ? "high"
      : topDayStableRatio < 1 || scoreGapTop2 < 1 || nearTieCount >= 3
        ? "medium"
        : "low";
  return { perturbations, topDayStableRatio, worstTopRank, scoreGapTop2, nearTieCount, severity };
}

/** Confidence input mapping: 0 (robust ranking) .. 100 (fragile ranking). */
export function weightSweepToPenalty(r: WeightSweepResult): number {
  return r.severity === "high" ? 80 : r.severity === "medium" ? 45 : 10;
}
