/**
 * Layer 4b — the deterministic "advisor".
 *
 * Three jobs, all pure and reproducible (no network, no LLM, no wall clock
 * beyond explicit inputs):
 *   1. Free-text → objective matching (so the user can describe what they're
 *      timing in their own words instead of picking a tile).
 *   2. Free-text → timeframe parsing (so a question like "in the next 2 years"
 *      sets the search horizon).
 *   3. Static BaZi-profile analysis → ranked, plain-language recommendations of
 *      which life moves a chart most supports, plus a small Q&A interpreter that
 *      turns a typed question into an intent the app can act on.
 *
 * Determinism contract: identical inputs → identical outputs (asserted in
 * advisor.test.ts). All prose here is templated from computed facts; it reuses
 * the plain-English vocabulary in plainEnglish.ts and never re-buckets a score.
 */

import { BaziChart, DaYun } from "./bazi.ts";
import { DayRecommendation, DecisionResult } from "./decision.ts";
import { OBJECTIVES, Objective, objectiveById } from "./objectives.ts";
import { FivePhase, GodGroup } from "./symbols.ts";
import {
  elementPlain,
  headlineVerdict,
  humanDate,
  humanHourRange,
  objectivePlain,
  practicalBestHour,
  relativeDay,
  verdictBand,
  windowPlain,
} from "./plainEnglish.ts";

// ── 1. Free-text → objective ────────────────────────────────────────────────
// Each objective owns a small bag of weighted phrases. Multi-word phrases score
// higher than bare words so "buy a house" lands on Purchase while "move house"
// lands on Moving even though both contain "house".

interface Keyword {
  text: string;
  weight: number;
}
const kw = (text: string, weight = 2): Keyword => ({ text, weight });

const OBJECTIVE_KEYWORDS: Record<string, Keyword[]> = {
  contract_signing: [
    kw("sign a contract", 5), kw("sign the contract", 5), kw("close the deal", 5), kw("close a deal", 5),
    kw("contract", 3), kw("signing", 3), kw("sign", 2), kw("deal", 2), kw("agreement", 3), kw("paperwork", 2),
    kw("lease", 2), kw("settlement", 2), kw("close", 1), kw("commit", 1),
  ],
  open_business: [
    kw("open a business", 5), kw("start a business", 5), kw("grand opening", 5), kw("go live", 4), kw("opening day", 4),
    kw("launch", 3), kw("startup", 3), kw("business", 3), kw("open shop", 3), kw("store", 2), kw("shop", 2),
    kw("company", 2), kw("trading", 2), kw("opening", 2), kw("found", 1),
  ],
  career_move: [
    kw("new job", 5), kw("start a job", 5), kw("accept a role", 5), kw("change jobs", 5), kw("career move", 5),
    kw("promotion", 4), kw("career", 3), kw("job", 3), kw("role", 2), kw("employment", 3), kw("hired", 3),
    kw("offer", 2), kw("position", 2), kw("resign", 2), kw("quit", 1), kw("work", 1),
  ],
  negotiation_meeting: [
    kw("important meeting", 5), kw("negotiation", 5), kw("board meeting", 5), kw("job interview", 5),
    kw("negotiate", 4), kw("pitch", 3), kw("meeting", 3), kw("interview", 3), kw("mediation", 3),
    kw("presentation", 3), kw("talks", 2), kw("talk", 1), kw("discuss", 1),
  ],
  wedding_marriage: [
    kw("get married", 5), kw("tie the knot", 5), kw("marriage registration", 5), kw("wedding", 4),
    kw("marry", 4), kw("marriage", 4), kw("engagement", 3), kw("engaged", 3), kw("propose", 3),
    kw("register marriage", 4), kw("nuptials", 3), kw("bride", 2), kw("groom", 2),
  ],
  moving_house: [
    kw("move house", 5), kw("move home", 5), kw("move in", 4), kw("new home", 4), kw("relocate", 4),
    kw("relocation", 4), kw("moving", 3), kw("move", 2), kw("apartment", 2), kw("house move", 4),
    kw("change address", 4),
  ],
  travel: [
    kw("go on a trip", 5), kw("start a journey", 5), kw("travel abroad", 5), kw("set off", 4),
    kw("travel", 3), kw("trip", 3), kw("journey", 3), kw("flight", 3), kw("vacation", 3), kw("holiday", 3),
    kw("abroad", 3), kw("depart", 3), kw("fly", 2), kw("voyage", 3),
  ],
  renovation: [
    kw("break ground", 5), kw("ground breaking", 5), kw("start construction", 5), kw("renovation", 4),
    kw("renovate", 4), kw("remodel", 4), kw("construction", 3), kw("build a house", 4), kw("building work", 4),
    kw("dig", 2), kw("foundation", 2), kw("extension", 2),
  ],
  medical_procedure: [
    kw("surgery", 5), kw("operation", 4), kw("medical procedure", 5), kw("see a doctor", 4),
    kw("procedure", 3), kw("treatment", 3), kw("therapy", 3), kw("operate", 3), kw("hospital", 3),
    kw("dental", 3), kw("dentist", 3), kw("surgical", 3), kw("medical", 2), kw("health", 1),
  ],
  investment_purchase: [
    kw("buy a house", 5), kw("buy a car", 5), kw("make an investment", 5), kw("buy property", 5),
    kw("purchase", 3), kw("invest", 3), kw("investment", 3), kw("buy", 3), kw("buying", 3),
    kw("property", 2), kw("capital", 2), kw("stock", 2), kw("shares", 2), kw("acquire", 2),
  ],
  study_exam: [
    kw("sit an exam", 5), kw("start studies", 5), kw("submit my thesis", 5), kw("take a test", 5),
    kw("exam", 4), kw("study", 3), kw("studies", 3), kw("university", 3), kw("enroll", 3), kw("enrol", 3),
    kw("course", 2), kw("test", 2), kw("school", 2), kw("thesis", 3), kw("dissertation", 3), kw("learn", 1),
  ],
};

export interface ObjectiveMatch {
  objective: Objective;
  /** 0..1 — how confident the match is (top hit strength + margin over runner-up). */
  confidence: number;
  /** The phrases from the query that drove the match. */
  matched: string[];
}

function normalize(s: string): string {
  return ` ${s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim()} `;
}

/** Best-matching objective for a free-text description, or null if nothing fits. */
export function matchObjective(query: string): ObjectiveMatch | null {
  const hay = normalize(query);
  if (hay.trim().length < 2) return null;

  const scores: { id: string; score: number; matched: string[] }[] = [];
  for (const obj of OBJECTIVES) {
    let score = 0;
    const matched: string[] = [];
    for (const k of OBJECTIVE_KEYWORDS[obj.id] ?? []) {
      if (hay.includes(` ${k.text} `) || hay.includes(` ${k.text}`) || hay.includes(`${k.text} `)) {
        score += k.weight;
        matched.push(k.text);
      }
    }
    scores.push({ id: obj.id, score, matched });
  }
  // Stable: OBJECTIVES order breaks ties (deterministic).
  scores.sort((a, b) => b.score - a.score);
  const top = scores[0];
  if (!top || top.score === 0) return null;
  const runnerUp = scores[1]?.score ?? 0;
  // Confidence: a strong, unambiguous hit (high score, clear margin) → ~1.
  const strength = Math.min(1, top.score / 6);
  const margin = top.score === 0 ? 0 : (top.score - runnerUp) / top.score;
  const confidence = Math.round((0.5 * strength + 0.5 * (0.4 + 0.6 * margin)) * 100) / 100;
  // Keep only the longest matched phrases (drop sub-phrases for tidy display).
  const matched = top.matched
    .filter((m) => !top.matched.some((o) => o !== m && o.includes(m)))
    .sort((a, b) => b.length - a.length);
  return { objective: objectiveById(top.id), confidence, matched };
}

// ── 2. Free-text → timeframe (days) ─────────────────────────────────────────

const NUMBER_WORDS: Record<string, number> = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
  eight: 8, nine: 9, ten: 10, twelve: 12, eighteen: 18, couple: 2, few: 3, several: 4,
};

/** The canonical search horizons the whole app shares (chips, widen, parsing). */
export const WINDOW_DAYS = [14, 31, 92, 186, 365, 730, 1826] as const;
export const MAX_WINDOW_DAYS = 1826; // ~5 years

/** Snap an arbitrary day-count onto the nearest supported horizon so the Ask
 *  chips, the context bar and a parsed Q&A timeframe always agree. */
export function snapWindow(days: number): number {
  return WINDOW_DAYS.reduce((best, w) => (Math.abs(w - days) < Math.abs(best - days) ? w : best), WINDOW_DAYS[0]);
}

/** Pull a horizon (snapped to a supported window) out of a phrase, or null. */
export function parseTimeframe(query: string): number | null {
  const hay = normalize(query);

  // Fixed idioms first.
  if (/\b(asap|right now|immediately|this week|next week)\b/.test(hay)) return 14;
  if (/\b(this month|next month|within a month)\b/.test(hay)) return 31;
  if (/\b(this quarter|few months|couple of months|coming months)\b/.test(hay)) return 92;
  if (/\b(half a year|half year|six months|6 months)\b/.test(hay)) return 186;
  if (/\b(this year|next year|within a year|coming year|by year end|end of year)\b/.test(hay)) return 365;

  // "<n> <unit>" with digits or number-words.
  const unit = "(year|years|yr|yrs|month|months|mo|week|weeks|wk|day|days)";
  const m = hay.match(new RegExp(`\\b(\\d+|[a-z]+)\\s+${unit}\\b`));
  if (m) {
    const rawN = m[1];
    const n = /^\d+$/.test(rawN) ? Number(rawN) : NUMBER_WORDS[rawN];
    if (n && Number.isFinite(n)) {
      const u = m[2];
      let days: number;
      if (u.startsWith("year") || u === "yr" || u === "yrs") days = n * 365;
      else if (u.startsWith("month") || u === "mo") days = n * 30;
      else if (u.startsWith("week") || u === "wk") days = n * 7;
      else days = n;
      return snapWindow(Math.min(MAX_WINDOW_DAYS, days));
    }
  }
  return null;
}

// ── 3. BaZi profile analysis ────────────────────────────────────────────────
// Which life moves does this chart most support? Classical logic: the favourable
// elements (用神) define which functional energies — Wealth, Officer, Output,
// Resource, Companion — the chart can carry. Each objective is biased toward one
// or two of those; we score the objective by how favourable its energies are.

/** Plain life-theme phrasing for each functional god-group. */
const GOD_GROUP_THEME: Record<GodGroup, string> = {
  wealth: "money, deals and investments",
  officer: "career, authority and status",
  output: "creative work, launches and self-expression",
  resource: "study, learning and support from others",
  companion: "independent ventures and equal partnerships",
};

export interface ObjectiveFit {
  objectiveId: string;
  /** 0..100 static suitability of this chart for this kind of move. */
  fit: number;
  /** One plain sentence on why it scored as it did. */
  reason: string;
  /** Favourable functional energies this objective leans on. */
  supportingThemes: string[];
}

export interface ProfileAnalysis {
  /** Headline element + strength sentence. */
  headline: string;
  /** Which energies the chart carries well (favourable functional groups). */
  strengths: string[];
  /** Which energies strain the chart (unfavourable functional groups). */
  cautions: string[];
  /** All objectives, best-fit first. */
  fits: ObjectiveFit[];
  /** The strongest few, ready to surface as recommendations. */
  top: ObjectiveFit[];
}

const STRENGTH_PLAIN: Record<BaziChart["dayMaster"]["strength"], string> = {
  strong: "well-supported and able to take on demanding, outward moves",
  balanced: "balanced — flexible across most kinds of decision",
  weak: "in need of support, so steady, well-backed moves suit it best",
};

/** Score every objective against a chart and assemble plain recommendations. */
export function analyzeProfile(chart: BaziChart): ProfileAnalysis {
  const dm = chart.dayMaster;
  const fav = dm.favorableElements;
  const unfav = dm.unfavorableElements;
  const functional = dm.functional; // GodGroup → FivePhase

  const elementOf = (g: GodGroup): FivePhase => functional[g];
  const groupValence = (g: GodGroup): number => {
    const el = elementOf(g);
    if (fav.includes(el)) return 1;
    if (unfav.includes(el)) return -1;
    return 0;
  };

  const fits: ObjectiveFit[] = OBJECTIVES.map((obj) => {
    let score = 50;
    const supportingThemes: string[] = [];
    const draggingThemes: string[] = [];
    for (const g of obj.godBias) {
      const v = groupValence(g);
      if (v > 0) { score += 16; supportingThemes.push(GOD_GROUP_THEME[g]); }
      else if (v < 0) { score -= 14; draggingThemes.push(GOD_GROUP_THEME[g]); }
      else { score += 4; }
    }
    const fit = Math.max(0, Math.min(100, Math.round(score)));
    const { verb } = objectivePlain(obj.id);
    let reason: string;
    if (supportingThemes.length) {
      reason = `Your chart carries ${listJoin(unique(supportingThemes))} well, which is exactly what it takes to ${verb}.`;
    } else if (draggingThemes.length) {
      reason = `This leans on ${listJoin(unique(draggingThemes))}, which currently strains your chart — workable, but pick the day carefully.`;
    } else {
      reason = `A neutral fit for your chart — the day you choose will matter more than the move itself.`;
    }
    return { objectiveId: obj.id, fit, reason, supportingThemes: unique(supportingThemes) };
  });

  fits.sort((a, b) => b.fit - a.fit || OBJECTIVES.findIndex((o) => o.id === a.objectiveId) - OBJECTIVES.findIndex((o) => o.id === b.objectiveId));

  const strengths = (Object.keys(functional) as GodGroup[])
    .filter((g) => fav.includes(elementOf(g)))
    .map((g) => GOD_GROUP_THEME[g]);
  const cautions = (Object.keys(functional) as GodGroup[])
    .filter((g) => unfav.includes(elementOf(g)))
    .map((g) => GOD_GROUP_THEME[g]);

  const headline =
    `Your core element is ${elementPlain(dm.dayMaster.phase)}, ${STRENGTH_PLAIN[dm.strength]}.`;

  return { headline, strengths: unique(strengths), cautions: unique(cautions), fits, top: fits.slice(0, 4) };
}

// ── 4. Q&A — interpret a typed question into an actionable intent ────────────

export type AdvisorIntentKind = "timing" | "profile" | "unknown";

export interface AdvisorIntent {
  kind: AdvisorIntentKind;
  rawQuery: string;
  /** Present when an objective was recognised. */
  objectiveId?: string;
  objectiveConfidence?: number;
  matchedTerms?: string[];
  /** Present when a timeframe was recognised; else the caller's current window. */
  windowDays?: number;
}

const PROFILE_HINTS =
  /\b(my chart|about me|read me|my profile|my strength|good at|suit me|best for me|what should i|recommend|advice|advise|tell me about my|my element|my luck|my bazi)\b/;

/** Parse a free-text question into an intent the app can act on. */
export function parseAdvisorQuery(query: string): AdvisorIntent {
  const raw = query.trim();
  const om = matchObjective(query);
  const tf = parseTimeframe(query) ?? undefined;
  const profileish = PROFILE_HINTS.test(normalize(query));

  // A confident objective hit → a timing question, even if profile words appear.
  if (om && om.confidence >= 0.5) {
    return { kind: "timing", rawQuery: raw, objectiveId: om.objective.id, objectiveConfidence: om.confidence, matchedTerms: om.matched, windowDays: tf };
  }
  if (profileish) {
    return { kind: "profile", rawQuery: raw, windowDays: tf };
  }
  if (om) {
    // A weak objective hit is still more useful as a timing answer than nothing.
    return { kind: "timing", rawQuery: raw, objectiveId: om.objective.id, objectiveConfidence: om.confidence, matchedTerms: om.matched, windowDays: tf };
  }
  return { kind: "unknown", rawQuery: raw, windowDays: tf };
}

// ── 5. Compose plain-English answers from computed results ───────────────────
// These assemble conversational glue around the vocabulary in plainEnglish.ts;
// they never recompute or re-bucket a score.

export interface AdvisorAnswer {
  title: string;
  paragraphs: string[];
  /** When the answer points at a concrete reading the UI can open. */
  action?: { label: string; objectiveId: string; windowDays: number; pickIso?: string };
}

/** The soonest day at or above the "Good" band (≥58), for a "do it sooner" nudge. */
function soonestGood(recs: DayRecommendation[]): DayRecommendation | null {
  return [...recs].filter((r) => r.finalScore >= 58).sort((a, b) => a.isoDate.localeCompare(b.isoDate))[0] ?? null;
}

/** Answer a recognised timing question using an already-computed window result. */
export function composeTimingAnswer(
  objective: Objective,
  result: DecisionResult,
  todayIso: string,
  windowDays: number,
): AdvisorAnswer {
  const { verb, gerund } = objectivePlain(objective.id);
  const recs = result.recommendations;
  if (recs.length === 0) {
    return {
      title: `No clear day to ${verb} in ${windowPlain(windowDays)}`,
      paragraphs: [
        `Every day in ${windowPlain(windowDays)} hits a traditional veto for this (a 破 day, or a clash with your chart). Widening the window will usually surface a workable day.`,
      ],
    };
  }
  const best = recs[0];
  const sooner = soonestGood(recs);
  const paragraphs: string[] = [];

  paragraphs.push(
    `Your best day to ${verb} in ${windowPlain(windowDays)} is ${humanDate(best.civil)} (${relativeDay(best.isoDate, todayIso)}) — scoring ${best.finalScore}/100. ${headlineVerdict(best, objective)}`,
  );

  if (best.personalized) {
    const ph = practicalBestHour(best);
    if (ph) paragraphs.push(`Aim for the ${humanHourRange(ph.rangeLabel)} window — your strongest hours that day.`);
  }

  // If the best day is far off, point at the soonest good-enough day too.
  if (sooner && sooner.isoDate !== best.isoDate) {
    const farOff = (Date.parse(best.isoDate) - Date.parse(todayIso)) / 86400000 > 92;
    if (farOff) {
      paragraphs.push(
        `If you'd rather not wait, ${humanDate(sooner.civil)} (${relativeDay(sooner.isoDate, todayIso)}) is the soonest day that still rates ${verdictBand(sooner.finalScore).label.toLowerCase()} at ${sooner.finalScore}/100.`,
      );
    }
  }

  if (!result.personalized) {
    paragraphs.push(`This is the general almanac read — add your birth details to tailor it to your own chart and unlock your best hours.`);
  }

  return {
    title: `Best day to ${verb}`,
    paragraphs,
    action: { label: `Open the full ${gerund.toLowerCase()} reading`, objectiveId: objective.id, windowDays, pickIso: best.isoDate },
  };
}

/** Answer a "what suits me / read my chart" question from a static profile. */
export function composeProfileAnswer(profile: ProfileAnalysis): AdvisorAnswer {
  const top = profile.top.slice(0, 3);
  const paragraphs: string[] = [profile.headline];
  if (profile.strengths.length) {
    paragraphs.push(`Your chart carries ${listJoin(profile.strengths)} well.${profile.cautions.length ? ` It's more strained around ${listJoin(profile.cautions)}.` : ""}`);
  }
  if (top.length) {
    const names = top.map((t) => objectivePlain(t.objectiveId).short.toLowerCase());
    paragraphs.push(`The moves your chart most supports right now: ${listJoin(names)}. Pick one below to find its best day.`);
  }
  return { title: "Reading your chart", paragraphs };
}

/** Fallback when no objective or profile intent was recognised. */
export function composeUnknownAnswer(profile: ProfileAnalysis | null): AdvisorAnswer {
  const paragraphs = [
    `I can time specific decisions for you — try naming one, e.g. "when should I sign the contract?", "best week to launch", or "good day to get married in the next 6 months".`,
  ];
  if (profile && profile.top.length) {
    const names = profile.top.slice(0, 3).map((t) => objectivePlain(t.objectiveId).short.toLowerCase());
    paragraphs.push(`Based on your chart, you might start with ${listJoin(names)}.`);
  }
  return { title: "Ask about your timing", paragraphs };
}

// ── helpers (kept local; small, pure) ───────────────────────────────────────

function unique<T>(arr: T[]): T[] {
  return [...new Set(arr)];
}
function listJoin(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

export { GOD_GROUP_THEME };
export type { DaYun };
