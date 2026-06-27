/** Shared UI formatting helpers + the five-phase colour system. */
import { FivePhase } from "../engine/index.ts";

export const PHASE_COLOR: Record<FivePhase, string> = {
  wood: "#5fae7a",
  fire: "#d96a6a",
  earth: "#cda35a",
  metal: "#c2c6d6",
  water: "#5b8def",
};

export const PHASE_NAME: Record<FivePhase, string> = {
  wood: "Wood 木",
  fire: "Fire 火",
  earth: "Earth 土",
  metal: "Metal 金",
  water: "Water 水",
};

/** Map a 0..100 score to a traffic-light-ish colour. */
export function scoreColor(score: number): string {
  if (score >= 72) return "#5fae7a"; // strong
  if (score >= 58) return "#9bbf5a"; // good
  if (score >= 45) return "#cda35a"; // neutral
  if (score >= 32) return "#d98a4a"; // weak
  return "#d96a6a"; // poor
}

export function scoreLabel(score: number): string {
  if (score >= 72) return "Excellent";
  if (score >= 58) return "Favourable";
  if (score >= 45) return "Neutral";
  if (score >= 32) return "Caution";
  return "Avoid";
}

export function confidenceLabel(c: number): string {
  if (c >= 0.8) return "High";
  if (c >= 0.65) return "Medium-High";
  if (c >= 0.5) return "Medium";
  return "Low";
}

const WEEKDAY_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function prettyDate(civil: { year: number; month: number; day: number }): string {
  const wd = WEEKDAY_LONG[new Date(Date.UTC(civil.year, civil.month - 1, civil.day)).getUTCDay()];
  return `${wd}, ${civil.day} ${MONTHS[civil.month - 1]} ${civil.year}`;
}
