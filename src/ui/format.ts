/** Shared UI colour helpers. Score thresholds + labels live in the engine
 *  (`plainEnglish.verdictBand`); this module only maps them to colours so the
 *  UI never re-buckets a score. */
import { BandKey, FivePhase, PeriodValence, verdictBand } from "../engine/index.ts";

export const PHASE_COLOR: Record<FivePhase, string> = {
  wood: "#4f9e6c",
  fire: "#cf6a64",
  earth: "#c79a4f",
  metal: "#8d93a6",
  water: "#4f86cf",
};

// Bright hues — for dots, rings and fill swatches (not as text on light surfaces).
export const BAND_COLOR: Record<BandKey, string> = {
  excellent: "#4f9e6c",
  favourable: "#7faf56",
  neutral: "#c79a4f",
  caution: "#cf8444",
  avoid: "#cf6a64",
};

/**
 * TEXT variants, as CSS custom properties rather than literals.
 *
 * These are applied through inline `style={{ color }}`, which no
 * `@media (prefers-color-scheme: dark)` rule can override — so hard-coded hex
 * tuned for the light rice-paper measured ~3:1 on the dark surfaces and failed
 * WCAG AA there. Going through variables lets the dark theme restate them (see
 * styles.css), which is the only way an inline colour can be theme-aware.
 */
export const BAND_TEXT_COLOR: Record<BandKey, string> = {
  excellent: "var(--band-text-excellent)",
  favourable: "var(--band-text-favourable)",
  neutral: "var(--band-text-neutral)",
  caution: "var(--band-text-caution)",
  avoid: "var(--band-text-avoid)",
};

/** Colour for a 0..100 score, via the engine's canonical band — for dots/rings/fills. */
export function scoreColor(score: number): string {
  return BAND_COLOR[verdictBand(score).key];
}

/** Legible text colour for a 0..100 score — use whenever the score is shown AS text. */
export function scoreTextColor(score: number): string {
  return BAND_TEXT_COLOR[verdictBand(score).key];
}

// ── Period valence (大運 / 流年 / 流月 / life-area gauges) ──────────────────────
// One colour + label scale shared across every zoom level (luck decade, year,
// month, day) and the life-area gauges, so "supportive / mixed / challenging"
// reads identically everywhere (ROADMAP §A4). Bright hues for dots/rings/fills.

export const VALENCE_COLOR: Record<PeriodValence, string> = {
  supportive: "#1d9e75",
  mixed: "#c99a2e",
  challenging: "#c0442e",
  neutral: "var(--muted)",
};

// AA-legible text variants; theme-aware for the same reason as BAND_TEXT_COLOR.
export const VALENCE_TEXT_COLOR: Record<PeriodValence, string> = {
  supportive: "var(--valence-text-supportive)",
  mixed: "var(--valence-text-mixed)",
  challenging: "var(--valence-text-challenging)",
  neutral: "var(--muted)",
};

export const VALENCE_LABEL: Record<PeriodValence, string> = {
  supportive: "Supportive",
  mixed: "Mixed",
  challenging: "Demanding",
  neutral: "Quiet",
};

export function valenceColor(v: PeriodValence): string {
  return VALENCE_COLOR[v];
}
export function valenceTextColor(v: PeriodValence): string {
  return VALENCE_TEXT_COLOR[v];
}
export function valenceLabel(v: PeriodValence): string {
  return VALENCE_LABEL[v];
}

/** Map a 0..100 life-area / period gauge to the shared valence bucket. */
export function valenceOfScore(score: number): PeriodValence {
  if (score >= 62) return "supportive";
  if (score >= 45) return "mixed";
  if (score >= 1) return "challenging";
  return "neutral";
}
