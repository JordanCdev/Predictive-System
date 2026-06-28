/** Shared UI colour helpers. Score thresholds + labels live in the engine
 *  (`plainEnglish.verdictBand`); this module only maps them to colours so the
 *  UI never re-buckets a score. */
import { BandKey, FivePhase, verdictBand } from "../engine/index.ts";

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

// Darkened variants that meet WCAG AA (~4.5:1) on the rice-paper surfaces — for TEXT.
export const BAND_TEXT_COLOR: Record<BandKey, string> = {
  excellent: "#2f7d4f",
  favourable: "#577a26",
  neutral: "#8a6a1c",
  caution: "#a85a1f",
  avoid: "#b3403a",
};

/** Colour for a 0..100 score, via the engine's canonical band — for dots/rings/fills. */
export function scoreColor(score: number): string {
  return BAND_COLOR[verdictBand(score).key];
}

/** Legible text colour for a 0..100 score — use whenever the score is shown AS text. */
export function scoreTextColor(score: number): string {
  return BAND_TEXT_COLOR[verdictBand(score).key];
}
