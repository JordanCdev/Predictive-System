/**
 * Priority fit — a UI-LAYER read, never a scoring input.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE ARCHITECTURAL RULE THIS MODULE EXISTS TO HONOUR
 *
 * A user's stated priorities must NEVER alter the classical day score.
 * `recommendationScore` stays a strict function of chart + date + objective +
 * doctrine. What a person says they care about this year is a modern product
 * preference; the almanac has no opinion about it. Blending the two would
 * quietly corrupt the one number the product claims is doctrinal.
 *
 * So instead of touching the score, we compute a SEPARATE, visibly-labelled
 * axis from data the engine has ALREADY produced (`lifeAreaScores(...).areas`)
 * and show it alongside: "Classical score 74 · Priority fit +8".
 *
 * Consequences, enforced by review and by tests/priorityFit.test.ts:
 *   • Nothing under src/engine/** may import this module. It is one-way.
 *   • This module never sees, reads or returns a recommendationScore.
 *   • It is pure: no wall clock, no randomness, no I/O, no storage access.
 *     (The caller loads the user's priorities and passes them in.)
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE FORMULA (documented here because a number on screen owes an explanation)
 *
 * Inputs: the user's ranked life areas (most important first) and the day's
 * four life-area gauges, each 0–100.
 *
 *   1. Keep the ranked areas that actually have a gauge today, in rank order,
 *      first occurrence wins (a duplicated area is not counted twice).
 *      No survivors → null (the caller renders nothing at all — never a nag).
 *   2. Rank weights are harmonic: w_i = 1 / (i + 1) for i = 0, 1, 2, …
 *      → 1, 1/2, 1/3, 1/4. Normalised to sum to 1. Rank 1 therefore carries
 *      ~48% of the read when four areas are ranked, ~55% when three are.
 *      Harmonic (rather than linear) weighting keeps the first choice clearly
 *      dominant while still letting a badly-served second choice pull back.
 *   3. weighted  = Σ wᵢ · score(areaᵢ)   — the day as your priorities see it.
 *      baseline  = plain mean of ALL gauges for the day — the day as an
 *                  unprioritised reader sees it.
 *   4. delta = round(weighted − baseline), half away from zero.
 *
 * delta is therefore a COMPARISON, not a score: "this day serves the areas you
 * named better (+) or worse (−) than it serves life in general". A day that is
 * brilliant across the board scores delta ≈ 0, correctly — it is not
 * *especially* yours. A day strong only in an area you did not rank pushes the
 * baseline up and the delta negative, which is the honest read.
 *
 * Ties, missing areas, zero priorities and an all-equal day are all total:
 * delta 0 is a legitimate answer and is worded as such.
 */

import { AREA_META } from "../engine/index.ts";
import type { LifeAreaKey } from "../engine/index.ts";

/** The shape this module needs from `lifeAreaScores(chart, dayGz).areas`. */
export interface PriorityFitArea {
  key: LifeAreaKey;
  score: number;
  /** Present on the engine's LifeAreaScore; falls back to a local label. */
  label?: string;
}

export interface PriorityFit {
  /** Rank-weighted read minus the day's plain mean. Positive = tilts your way. */
  delta: number;
  /** The highest-ranked priority that has a gauge today. */
  leadArea: LifeAreaKey;
  /** Human label for `leadArea` ("Career", "Wellbeing", …). */
  leadLabel: string;
  /** Honest one-liner. Never predictive, never doctrinal. */
  plain: string;
  /** Rank-weighted mean of the ranked areas (0–100), for transparency. */
  weighted: number;
  /** Unweighted mean of every area gauge that day (0–100), for transparency. */
  baseline: number;
  /** The ranked areas actually used, in rank order. */
  used: LifeAreaKey[];
  /**
   * `used`, spelled the way the daily gauges spell it ("Career", "Wellbeing").
   * Parallel to `used` index-for-index. Every surface that shows which areas went
   * into the number must render THIS, never the raw keys — the keys are internal
   * and "health" on screen where the gauge says "Wellbeing" reads as a bug.
   */
  usedLabels: string[];
}

/**
 * Fallback labels, used only when the caller passes gauges without labels.
 * Sourced from the engine's AREA_META — the single definition the daily gauges
 * themselves render — so a fit disclosure can never name an area differently
 * from the gauge it was computed from.
 */
const areaLabelFor = (key: LifeAreaKey): string => AREA_META[key]?.label ?? key;

/** Round half away from zero, and never return -0 (which stringifies as "-0"). */
function roundAway(n: number): number {
  const r = n < 0 ? -Math.round(-n) : Math.round(n);
  return r === 0 ? 0 : r;
}

function one(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * How well this day serves the areas the user said they care about, relative to
 * how it serves life in general. Returns null when there is nothing to say —
 * no priorities set, or none of them has a gauge today.
 *
 * Pure and total. Independent of the classical score by construction: it never
 * receives one.
 */
export function priorityFit(
  rankedAreas: readonly LifeAreaKey[] | null | undefined,
  areaScores: readonly PriorityFitArea[] | null | undefined,
): PriorityFit | null {
  if (!rankedAreas || !areaScores || rankedAreas.length === 0 || areaScores.length === 0) return null;

  // First gauge per key wins, so a malformed duplicate can't double-count.
  const byKey = new Map<LifeAreaKey, PriorityFitArea>();
  for (const a of areaScores) {
    if (a && typeof a.score === "number" && Number.isFinite(a.score) && !byKey.has(a.key)) byKey.set(a.key, a);
  }
  if (byKey.size === 0) return null;

  const used: LifeAreaKey[] = [];
  for (const k of rankedAreas) {
    if (byKey.has(k) && !used.includes(k)) used.push(k);
  }
  if (used.length === 0) return null;

  const weights = used.map((_, i) => 1 / (i + 1));
  const wSum = weights.reduce((s, w) => s + w, 0);
  const weighted = used.reduce((s, k, i) => s + (weights[i] / wSum) * byKey.get(k)!.score, 0);

  let total = 0;
  for (const a of byKey.values()) total += a.score;
  const baseline = total / byKey.size;

  const delta = roundAway(weighted - baseline);
  const leadArea = used[0];
  const usedLabels = used.map((k) => byKey.get(k)!.label ?? areaLabelFor(k));
  const leadLabel = usedLabels[0];

  return {
    delta,
    leadArea,
    leadLabel,
    plain: plainFor(delta, leadLabel),
    weighted: one(weighted),
    baseline: one(baseline),
    used,
    usedLabels,
  };
}

/** Honest wording — a tilt in emphasis, never a claim about what will happen. */
function plainFor(delta: number, leadLabel: string): string {
  const area = leadLabel.toLowerCase();
  if (delta >= 6) return `This day leans toward your ${area} focus more than it leans anywhere else.`;
  if (delta >= 2) return `A mild tilt toward the areas you ranked, ${area} first.`;
  if (delta > -2) return `This day sits about evenly across your priorities and everything else.`;
  if (delta > -6) return `A mild tilt away from the areas you ranked — its emphasis sits elsewhere.`;
  return `This day's emphasis sits away from your stated priorities, ${area} included.`;
}

/** "+8" / "−3" / "0" — a signed, typographically correct label for the chip. */
export function formatFitDelta(delta: number): string {
  if (delta > 0) return `+${delta}`;
  if (delta < 0) return `−${Math.abs(delta)}`;
  return "0";
}

/** The disclosure every surface of this number must carry, verbatim. */
export const PRIORITY_FIT_NOTE =
  "Priority fit is a modern product feature, not classical doctrine: it re-reads this day's own life-area gauges through the priorities you set, and compares that against the day's overall average. It never changes the day's classical score, which is calculated from your chart and the almanac alone.";
