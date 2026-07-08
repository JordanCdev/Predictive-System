/**
 * Layer 4 — Deterministic decision engine (spec §10) + Layer 5 explanation
 * payload (spec §11). Generates candidate days over a window, scores each with
 * transparent multi-criteria analysis (MCDA), applies hard-constraint vetoes
 * (forbidden officers, personal clashes, and 歲破/四離/四絕 calendar taboos for
 * high-stakes objectives), detects cross-school conflicts, and ranks.
 *
 * Scoring and confidence are SEPARATE outputs: `recommendationScore` is a
 * transparent heuristic ranking; `confidence` measures how reproducible,
 * externally verified, and perturbation-stable the reasoning is — never an
 * outcome probability. Confidence is driven by evidence (sensitivity sweeps
 * now; a third-party VerificationReport when one is applied), not constants.
 *
 * No randomness, no network, no LLM in this path.
 */

import {
  BRANCHES,
  FivePhase,
  GanZhi,
  STEMS,
  PHASE_LABEL,
  TEN_GOD_LABEL,
  TenGod,
  clashBranch,
  godGroupOf,
  mod,
  tenGodOf,
} from "./symbols.ts";
import { MomentInput, buildFourPillars, combineStemBranch } from "./sexagenary.ts";
import { BaziChart, DaYun, buildBaziChart, computeDaYun } from "./bazi.ts";
import { monthBranchIndexFromLongitude, solarLongitudeAtMillis } from "./astronomy.ts";
import { CONVENTION_PRESETS, ConventionSet } from "./conventions.ts";
import {
  TongShuDay,
  computeTongShuDay,
  isNoblemanDay,
  personalShenSha,
} from "./tongshu.ts";
import { CalendarTaboo, Objective } from "./objectives.ts";
import {
  ConventionSweepResult,
  conventionSweepToScore,
  runConventionSweep,
} from "./sensitivity/conventionSweep.ts";
import { WeightSweepResult, runWeightSweep, weightSweepToPenalty } from "./sensitivity/weightSweep.ts";
import type { VerificationReport } from "./verification/types.ts";
import { VERSIONS } from "./version.ts";
import { hashOf } from "./hash.ts";

// --- citations: every fired rule points to a source (spec §1.2, §11) --------
const CITES = {
  officer: "建除十二神 — Tong Shu day-officer cycle (spec §6.7; classical 通書 / 欽定協紀辨方書).",
  road: "黄道黑道十二神 — auspicious/inauspicious day gods (spec §6.7; classical 通書).",
  element: "Useful-God favourability — Day-Master balance (spec §5, §6.1; 滴天髓 / 子平真詮 doctrine).",
  tenGod: "十神 day-stem relation to Day Master (spec §6.1).",
  shensha: "神煞 overlay — weightable, demoted beneath structure (spec §6.4).",
  clash: "日沖 / 六沖 branch clash (spec §6.1 interactions).",
  hour: "時辰 selection — five-rats hour stem + clash avoidance (spec §5.4, §6.3).",
  fourBoundary: "四離四絕 — the day before a 二分二至/四立; classical 通書 marks it 大事勿用.",
  yearBreak: "歲破 (年破) — the day branch opposes the year 太歲; classical 通書 marks it 諸事不宜.",
} as const;

export interface RuleFired {
  code: string;
  layer: "tongshu" | "bazi" | "shensha" | "hour";
  label: string;
  effect: number; // signed contribution into its evaluator
  citation: string;
}

export interface ConflictRecord {
  type: string;
  schools: string[];
  severity: "low" | "medium" | "high";
  reason: string;
}

export interface HourPick {
  branchIndex: number;
  ganzhi: GanZhi;
  rangeLabel: string;
  score: number;
  reasons: string[];
}

export interface SubScores {
  officer: number;
  road: number;
  /** null when the day was evaluated without a personal chart (almanac-only). */
  personal: number | null;
  /** null when not personalized — best-hour selection needs the subject's chart. */
  hour: number | null;
}

/** Evidence-based confidence inputs, all 0–100 (spec §12, revised).
 *  `boundaryRisk` and `heuristicSensitivity` are penalties (higher = worse);
 *  `conflictPenalty` is subtracted directly (0–25 points). */
export interface ConfidenceInputs {
  /** Deterministic engine, hash-verifiable → always 100. */
  calculationReproducibility: number;
  /** Agreement with independent sources; 50 = neutral until a report is applied. */
  thirdPartyAgreement: number;
  /** From the convention sweep: does the pick survive other school conventions? */
  conventionStability: number;
  /** How fully the request pins the subject (birth, time certainty, longitude). */
  inputCompleteness: number;
  /** Proximity to solar-term boundaries and strength cut-points (penalty). */
  boundaryRisk: number;
  /** How much of this result external sources could check; 40 = internal only. */
  sourceCoverage: number;
  /** From the weight sweep: ranking fragility under ±10% weights (penalty). */
  heuristicSensitivity: number;
  /** Direct deduction for cross-school conflicts on this day (0–25). */
  conflictPenalty: number;
}

export interface ConfidenceBreakdown {
  /** 0–100. How solid, verified and stable the REASONING is — never the odds an
   *  undertaking succeeds. */
  overall: number;
  components: ConfidenceInputs;
  /** False until applyVerificationReport() has folded in a third-party check. */
  verified: boolean;
  notes: string[];
}

/** The revised §12.1 weights: verification and stability dominate; nothing is a
 *  fixed source-quality constant any more. */
export function computeConfidence(x: ConfidenceInputs): number {
  const raw =
    0.2 * x.calculationReproducibility +
    0.25 * x.thirdPartyAgreement +
    0.15 * x.conventionStability +
    0.1 * x.inputCompleteness +
    0.1 * x.sourceCoverage +
    0.1 * (100 - x.boundaryRisk) +
    0.1 * (100 - x.heuristicSensitivity) -
    x.conflictPenalty;
  return Math.max(0, Math.min(100, Math.round(raw)));
}

export interface DayRecommendation {
  isoDate: string;
  civil: { year: number; month: number; day: number };
  weekday: string;
  /** true when scored against the subject's BaZi chart; false = general almanac. */
  personalized: boolean;
  tongshu: TongShuDay;
  /** null in almanac-only mode (no Day Master to relate the day stem to). */
  dayStemTenGod: TenGod | null;
  /** null in almanac-only mode (best-hour needs the subject's chart). */
  bestHour: HourPick | null;
  allHours: HourPick[];
  subScores: SubScores;
  /** The MCDA ranking heuristic (0–100). A recommendation strength under this
   *  rule set — NOT a prediction and NOT a probability of success. */
  recommendationScore: number;
  confidence: ConfidenceBreakdown;
  hardReject: boolean;
  rejectReasons: string[];
  rulesFired: RuleFired[];
  conflicts: ConflictRecord[];
  shenShaTags: { code: string; nameZh: string; nameEn: string; polarity: string; note: string }[];
  topReasons: string[];
}

export interface DecisionRequest {
  /** Optional: when omitted, the engine returns the general almanac read (not personalized). */
  birth?: MomentInput;
  sex?: "male" | "female";
  convention: ConventionSet;
  objective: Objective;
  window: { start: { year: number; month: number; day: number }; days: number; tzOffsetMinutes: number };
  options?: {
    /** Run the convention/weight sensitivity sweeps (default true). Callers doing
     *  bulk re-evaluation (profile panel, the sweeps themselves) disable this. */
    sweeps?: boolean;
  };
}

export interface DecisionResult {
  meta: {
    engineVersions: typeof VERSIONS;
    conventionId: string;
    conventionLabel: string;
    objectiveId: string;
    objectiveLabel: string;
    calculationHash: string;
    generatedAtNote: string;
    windowLabel: string;
    favorableElements: FivePhase[];
    unfavorableElements: FivePhase[];
    boundaryWarnings: string[];
    /** Sensitivity sweeps behind the confidence index; null when options.sweeps === false. */
    sensitivity: { convention: ConventionSweepResult; weights: WeightSweepResult } | null;
    /** Third-party cross-check, once applyVerificationReport() has run; else null. */
    verification: VerificationReport | null;
  };
  /** true when a birth chart personalized the scoring; false = general almanac. */
  personalized: boolean;
  /** null in almanac-only mode. */
  subjectChart: BaziChart | null;
  dayun: DaYun | null;
  recommendations: DayRecommendation[]; // accepted, ranked best-first
  rejected: DayRecommendation[]; // hard-rejected, for transparency
  allDays: DayRecommendation[]; // every candidate, chronological (for the calendar)
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));
const round1 = (n: number) => Math.round(n * 10) / 10;

// Per-god 黄黑道 scores (0..100).
const DAY_GOD_SCORE = [88, 80, 28, 30, 82, 90, 22, 84, 30, 26, 78, 34];

function dayStemFavor(phase: FivePhase, fav: FivePhase[], unfav: FivePhase[]): number {
  if (fav.includes(phase)) return 1;
  if (unfav.includes(phase)) return -1;
  return 0;
}

/** Score the 12 double-hours of a day; return all + the best. */
function scoreHours(
  dayGz: GanZhi,
  fav: FivePhase[],
  unfav: FivePhase[],
  subjectDayStem: number,
  godBias: ReturnType<typeof godGroupOf>[],
  dmStem: number,
): { all: HourPick[]; best: HourPick } {
  const all: HourPick[] = [];
  for (let bi = 0; bi < 12; bi++) {
    const branch = BRANCHES[bi];
    const hourGz = combineStemBranch(mod(dayGz.stem.index * 2 + bi, 10), bi);
    let score = 50;
    const reasons: string[] = [];

    const tg = tenGodOf(STEMS[dmStem], hourGz.stem);
    if (godBias.includes(godGroupOf(tg))) {
      score += 10;
      reasons.push(`Hour stem ${hourGz.stem.hanzi} is ${TEN_GOD_LABEL[tg]} (supports the goal).`);
    }
    const f = dayStemFavor(branch.phase, fav, unfav);
    if (f > 0) { score += 8; reasons.push(`Hour branch element ${PHASE_LABEL[branch.phase]} is favourable to you.`); }
    if (f < 0) { score -= 8; reasons.push(`Hour branch element ${PHASE_LABEL[branch.phase]} is unfavourable to you.`); }

    if (clashBranch(dayGz.branch.index) === bi) {
      score -= 15;
      reasons.push(`Hour clashes the day branch (時沖日) — avoid.`);
    }
    if (isNoblemanDay(bi, subjectDayStem)) {
      score += 10;
      reasons.push(`Nobleman hour (天乙貴人) — helpful people.`);
    }
    const hourLabel = `${String(branch.hourStart).padStart(2, "0")}:00–${String(mod(branch.hourStart + 2, 24)).padStart(2, "0")}:00`;
    all.push({ branchIndex: bi, ganzhi: hourGz, rangeLabel: `${branch.hanzi} ${hourLabel}`, score: clamp(score), reasons });
  }
  // Order by hourStart for display, but pick best by score (stable: earliest wins ties).
  const best = [...all].sort((a, b) => b.score - a.score || a.branchIndex - b.branchIndex)[0];
  all.sort((a, b) => BRANCHES[a.branchIndex].hourStart - BRANCHES[b.branchIndex].hourStart);
  return { all, best };
}

/** Age in (decimal) years at a candidate civil date, relative to the birth date. */
function ageAtDate(birth: MomentInput, civil: { year: number; month: number; day: number }): number {
  const ms = Date.UTC(civil.year, civil.month - 1, civil.day) - Date.UTC(birth.year, birth.month - 1, birth.day);
  return ms / (365.25 * 86400000);
}

/** Plain reject lines for hard calendar taboos (surfaced by vetoExplain). */
const TABOO_REJECT_REASON: Record<CalendarTaboo, string> = {
  year_break: "歲破 day — it clashes this year's 太歲 (諸事不宜); a hard taboo for this objective.",
  four_departure: "四離 day — the eve of a solstice/equinox (大事勿用); a hard taboo for this objective.",
  four_severance: "四絕 day — the eve of a season-start 立 term (大事勿用); a hard taboo for this objective.",
};

function evaluateDay(
  civil: { year: number; month: number; day: number },
  solarInstantUtc: number,
  req: DecisionRequest,
  chart: BaziChart | null,
  dayun: DaYun | null,
  birthBoundaryWarnings: string[],
): DayRecommendation {
  const obj = req.objective;
  const personalized = chart !== null;
  const godBias = obj.godBias;

  const ts = computeTongShuDay(civil, solarInstantUtc);
  const dayGz = ts.dayGanzhi;
  const rules: RuleFired[] = [];
  const rejectReasons: string[] = [];

  // Calendar taboos present on this day. For high-stakes objectives these are
  // EXCLUSIONS (obj.hardCalendarTaboos) — 大事勿用 means don't use the day, not
  // "use it if the other numbers are nice". Elsewhere they stay penalties;
  // medical (求醫) is the classical exception and is exempt from both forms.
  const tabooCodes: CalendarTaboo[] = [];
  if (ts.fourBoundary) tabooCodes.push(ts.fourBoundary === "si_li" ? "four_departure" : "four_severance");
  if (ts.yearBreak) tabooCodes.push("year_break");
  const hardTaboos = tabooCodes.filter((t) => obj.hardCalendarTaboos.includes(t));
  const applyTabooPenalties = obj.id !== "medical_procedure";

  // --- Evaluator 1: officer (建除 fit) — almanac, no chart needed ---
  let officerRaw = ts.officer.base;
  if (ts.officer.good.includes(obj.primaryTag)) officerRaw += 6;
  if (ts.officer.good.includes("general") && obj.primaryTag !== "general") officerRaw += 1;
  if (ts.officer.bad.includes(obj.primaryTag)) officerRaw -= 8;
  let officerScore = clamp(50 + officerRaw * 3.5);
  rules.push({
    code: `officer_${ts.officer.nameEn.toLowerCase()}`,
    layer: "tongshu",
    label: `Day Officer 建除 = ${ts.officer.nameZh} ${ts.officer.nameEn}`,
    effect: officerRaw,
    citation: CITES.officer,
  });

  // 四離/四絕 — "大事勿用". A strong calendar taboo the almanac applies to major
  // undertakings (medical/求醫 is the traditional exception). Applies in both
  // almanac-only and personalized modes since it is a pure calendar property.
  // When the objective lists it as a hard taboo, the day is also VETOED below.
  if (ts.fourBoundary && applyTabooPenalties) {
    const isLi = ts.fourBoundary === "si_li";
    officerScore = clamp(officerScore - 18);
    rules.push({
      code: isLi ? "four_departure" : "four_severance",
      layer: "tongshu",
      label: isLi
        ? "四離日 — the day before a solstice/equinox (大事勿用)."
        : "四絕日 — the day before a season-start 立 term (大事勿用).",
      effect: -18,
      citation: CITES.fourBoundary,
    });
  }

  // 歲破 — clashing the year's 太歲 is one of the strongest day-level taboos.
  if (ts.yearBreak && applyTabooPenalties) {
    officerScore = clamp(officerScore - 20);
    rules.push({
      code: "year_break",
      layer: "tongshu",
      label: "歲破日 — the day clashes this year's 太歲 (諸事不宜).",
      effect: -20,
      citation: CITES.yearBreak,
    });
  }

  // --- Evaluator 2: road (黄黑道) — almanac, no chart needed ---
  const roadScore = DAY_GOD_SCORE[ts.dayGod.index];
  rules.push({
    code: `road_${ts.dayGod.nameEn.toLowerCase().replace(/\s/g, "_")}`,
    layer: "tongshu",
    label: `Day God = ${ts.dayGod.nameZh} ${ts.dayGod.nameEn} (${ts.dayGod.yellow ? "Yellow/auspicious" : "Black/inauspicious"})`,
    effect: ts.dayGod.yellow ? 1 : -1,
    citation: CITES.road,
  });

  // --- Evaluators 3 & 4: personal (BaZi) + hour — only when a chart is present ---
  let dayStemTenGod: TenGod | null = null;
  let personalScore: number | null = null;
  let hourScore: number | null = null;
  let bestHour: HourPick | null = null;
  let allHours: HourPick[] = [];
  let shenShaTags: DayRecommendation["shenShaTags"] = [];
  let clashTags: { code: string; nameZh: string }[] = [];

  if (chart) {
    const fav = chart.dayMaster.favorableElements;
    const unfav = chart.dayMaster.unfavorableElements;
    const dmStem = chart.dayMaster.dayMaster.index;
    const subjectDayBranch = chart.pillars[2].ganzhi.branch.index;
    const subjectYearBranch = chart.pillars[0].ganzhi.branch.index;

    let personal = 50;
    dayStemTenGod = tenGodOf(STEMS[dmStem], dayGz.stem);
    const tenGodHit = godBias.includes(godGroupOf(dayStemTenGod));
    const fStem = dayStemFavor(dayGz.stem.phase, fav, unfav);
    if (tenGodHit && fStem > 0) {
      // The Ten-God bias and the favourable element are the SAME fact here (the
      // day's stem reinforces a useful god) — credit once, not twice (no +22 stack).
      const eff = Math.max(12, fStem * 10);
      personal += eff;
      rules.push({ code: "ten_god_support", layer: "bazi", label: `Day stem ${dayGz.stem.hanzi} = ${TEN_GOD_LABEL[dayStemTenGod]}, favourable to you and to this goal.`, effect: eff, citation: CITES.tenGod });
    } else {
      if (tenGodHit) {
        personal += 12;
        rules.push({ code: "ten_god_support", layer: "bazi", label: `Day stem ${dayGz.stem.hanzi} = ${TEN_GOD_LABEL[dayStemTenGod]} — supports this goal.`, effect: 12, citation: CITES.tenGod });
      }
      if (fStem !== 0) {
        personal += fStem * 10;
        rules.push({ code: "element_stem", layer: "bazi", label: `Day stem element ${PHASE_LABEL[dayGz.stem.phase]} is ${fStem > 0 ? "favourable" : "unfavourable"} to your Day Master.`, effect: fStem * 10, citation: CITES.element });
      }
    }
    const fBranch = dayStemFavor(dayGz.branch.phase, fav, unfav);
    if (fBranch !== 0) {
      personal += fBranch * 5;
      rules.push({ code: "element_branch", layer: "bazi", label: `Day branch element ${PHASE_LABEL[dayGz.branch.phase]} is ${fBranch > 0 ? "favourable" : "unfavourable"} to you.`, effect: fBranch * 5, citation: CITES.element });
    }
    if (isNoblemanDay(dayGz.branch.index, dmStem)) {
      personal += 14;
      rules.push({ code: "nobleman", layer: "shensha", label: "天乙貴人 — Nobleman day (helpful people, protection).", effect: 14, citation: CITES.shensha });
    }

    const ss = personalShenSha(dayGz, subjectDayBranch, subjectYearBranch);
    shenShaTags = ss.tags;
    clashTags = ss.tags.filter((t) => t.code === "clash_day" || t.code === "clash_zodiac");
    for (const t of ss.tags) {
      let eff = 0;
      if (t.code === "clash_day") eff = -20;
      else if (t.code === "clash_zodiac") eff = -16;
      // 神煞 harmonies sit strictly below officer/element structure (spec §6.4).
      else if (t.code === "six_harmony") eff = 6;
      else if (t.code === "triple_harmony") eff = 6;
      else if (t.code === "peach_blossom") eff = obj.id === "wedding_marriage" ? 6 : 0;
      // Travelling Horse only credited where movement is the point — no blanket bonus.
      else if (t.code === "travelling_horse") eff = obj.id === "travel" || obj.id === "moving_house" ? 10 : 0;
      if (eff !== 0) {
        personal += eff;
        rules.push({ code: t.code, layer: t.code.startsWith("clash") ? "bazi" : "shensha", label: `${t.nameZh} ${t.nameEn} — ${t.note}`, effect: eff, citation: t.code.startsWith("clash") ? CITES.clash : CITES.shensha });
      }
    }

    // 沖大運 — a day that clashes the subject's active 10-year luck pillar disrupts it.
    if (dayun && req.birth) {
      const age = ageAtDate(req.birth, civil);
      const lp = dayun.pillars.find((p) => age >= p.startAge && age < p.endAge);
      if (lp && mod(dayGz.branch.index - lp.ganzhi.branch.index, 12) === 6) {
        personal -= 12;
        rules.push({ code: "luck_clash", layer: "bazi", label: `沖大運 — the day clashes your current ${lp.ganzhi.hanzi} luck pillar.`, effect: -12, citation: CITES.clash });
      }
    }
    personalScore = clamp(personal);

    const hours = scoreHours(dayGz, fav, unfav, dmStem, godBias, dmStem);
    bestHour = hours.best;
    allHours = hours.all;
    hourScore = hours.best.score;
    rules.push({ code: "best_hour", layer: "hour", label: `Best double-hour: ${hours.best.ganzhi.hanzi} (${hours.best.rangeLabel}).`, effect: hourScore - 50, citation: CITES.hour });
  }

  // --- weighted MCDA final (renormalized to officer+road when not personalized) ---
  const w = obj.weights;
  let recommendationScore: number;
  if (personalized && personalScore !== null && hourScore !== null) {
    recommendationScore = round1(
      w.officer * officerScore + w.road * roadScore + w.personal * personalScore + w.hour * hourScore,
    );
  } else {
    const denom = w.officer + w.road || 1;
    recommendationScore = round1((w.officer * officerScore + w.road * roadScore) / denom);
  }
  const subScores: SubScores = {
    officer: round1(officerScore),
    road: round1(roadScore),
    personal: personalScore === null ? null : round1(personalScore),
    hour: hourScore === null ? null : round1(hourScore),
  };

  // --- hard constraints (vetoes) ---
  let hardReject = false;
  if (obj.vetoOfficers.includes(ts.officer.index)) {
    hardReject = true;
    rejectReasons.push(`Officer ${ts.officer.nameZh} (${ts.officer.nameEn}) is forbidden for ${obj.label.toLowerCase()}.`);
  }
  // 歲破/四離/四絕 exclusions for high-stakes objectives — a strong positive fit
  // must NOT be able to lift a forbidden day back into the ranking.
  for (const t of hardTaboos) {
    hardReject = true;
    rejectReasons.push(TABOO_REJECT_REASON[t]);
  }
  if (personalized && obj.clashVeto) {
    const hasClash = clashTags[0];
    if (hasClash) {
      hardReject = true;
      rejectReasons.push(`Day clashes your chart (${hasClash.nameZh}); a hard taboo for this objective.`);
    }
  }

  // --- conflict detection (cross-school disagreement) ---
  const conflicts: ConflictRecord[] = [];
  if (personalized && personalScore !== null) {
    if (officerScore >= 62 && personalScore <= 40) {
      conflicts.push({ type: "tongshu_vs_bazi", schools: ["Tong Shu (建除)", "BaZi personalization"], severity: "medium", reason: "The almanac officer favours this day, but your personal chart does not." });
    }
    if (personalScore >= 62 && officerScore <= 38) {
      conflicts.push({ type: "bazi_vs_tongshu", schools: ["BaZi personalization", "Tong Shu (建除)"], severity: "medium", reason: "Your chart favours this day, but the almanac officer warns against it." });
    }
  }
  if (roadScore >= 78 && officerScore <= 38) {
    conflicts.push({ type: "road_vs_officer", schools: ["Yellow-road god", "建除 officer"], severity: "low", reason: "A Yellow-road (auspicious) day whose 建除 officer is poor for this activity." });
  }
  if (roadScore <= 34 && officerScore >= 62) {
    conflicts.push({ type: "officer_vs_road", schools: ["建除 officer", "Black-road god"], severity: "low", reason: "A good 建除 officer falling on a Black-road day god." });
  }

  // --- confidence (spec §12, evidence-based) ---
  // Boundary risk visible from this day + chart. A 節 crossing inside the
  // candidate day means its month facts (officer, day god) flip at the crossing
  // instant — local noon decides which side this evaluation sits on.
  const boundaryNotes: string[] = [];
  let boundaryRisk = 0;
  const monthAtStart = monthBranchIndexFromLongitude(solarLongitudeAtMillis(solarInstantUtc - 12 * 3600000));
  const monthAtEnd = monthBranchIndexFromLongitude(solarLongitudeAtMillis(solarInstantUtc + 12 * 3600000));
  if (monthAtStart !== monthAtEnd) {
    boundaryRisk += 30;
    boundaryNotes.push(
      "A solar-term (節) boundary falls within this day — the officer and month facts flip at the crossing instant.",
    );
  }
  if (chart?.dayMaster.strengthBreakdown.nearThreshold) {
    boundaryRisk += 30;
    boundaryNotes.push(chart.dayMaster.strengthBreakdown.nearThresholdNote!);
  }
  if (birthBoundaryWarnings.length > 0) {
    boundaryRisk += Math.min(30, birthBoundaryWarnings.length * 15);
    boundaryNotes.push("The birth moment sits near a pillar boundary (see chart warnings).");
  }

  const conflictPenalty = Math.min(
    25,
    conflicts.reduce((sum, c) => sum + (c.severity === "high" ? 10 : c.severity === "medium" ? 6 : 3), 0),
  );

  const components: ConfidenceInputs = {
    calculationReproducibility: 100,
    thirdPartyAgreement: 50, // neutral until applyVerificationReport() folds in a real check
    conventionStability: 70, // replaced by the convention sweep in evaluateDecision
    inputCompleteness: scoreInputCompleteness(req),
    boundaryRisk: clamp(boundaryRisk),
    sourceCoverage: 40, // internal engine only, until external sources are consulted
    heuristicSensitivity: 30, // replaced by the weight sweep in evaluateDecision
    conflictPenalty,
  };
  const confidence: ConfidenceBreakdown = {
    overall: computeConfidence(components),
    components,
    verified: false,
    notes: [...boundaryNotes, "Third-party cross-check not yet applied to this result."],
  };

  // --- top reasons (sorted positive contributions) ---
  const topReasons = rules
    .filter((r) => r.effect > 0)
    .sort((a, b) => b.effect - a.effect)
    .slice(0, 4)
    .map((r) => r.label);
  if (topReasons.length === 0) topReasons.push("Neutral day — no strong supporting factors.");

  const isoDate = `${civil.year}-${String(civil.month).padStart(2, "0")}-${String(civil.day).padStart(2, "0")}`;
  const weekday = WEEKDAYS[new Date(Date.UTC(civil.year, civil.month - 1, civil.day)).getUTCDay()];

  return {
    isoDate,
    civil,
    weekday,
    personalized,
    tongshu: ts,
    dayStemTenGod,
    bestHour,
    allHours,
    subScores,
    recommendationScore,
    confidence,
    hardReject,
    rejectReasons,
    rulesFired: rules,
    conflicts,
    shenShaTags,
    topReasons,
  };
}

/** How fully the request pins its subject. Almanac-only honestly claims less;
 *  a solar hour-basis without a longitude loses the precision it implies. */
function scoreInputCompleteness(req: DecisionRequest): number {
  if (!req.birth) return 50;
  const certainty = req.birth.timeCertainty ?? "exact";
  let v = certainty === "exact" ? 95 : certainty === "approximate" ? 70 : 45;
  if (req.convention.hourBasis !== "civil_clock" && req.birth.longitudeEast === undefined) v -= 25;
  return clamp(v);
}

/** Replace the sweep-derived components and recompute the overall index. */
function finalizeDayConfidence(
  c: ConfidenceBreakdown,
  conventionStability: number,
  heuristicSensitivity: number,
  extraNotes: string[],
): ConfidenceBreakdown {
  const components = { ...c.components, conventionStability, heuristicSensitivity };
  return {
    overall: computeConfidence(components),
    components,
    verified: c.verified,
    notes: [...c.notes, ...extraNotes],
  };
}

/** Main entry point: evaluate a window and return ranked recommendations. */
export function evaluateDecision(req: DecisionRequest): DecisionResult {
  const personalized = req.birth !== undefined;
  const fp = req.birth ? buildFourPillars(req.birth, req.convention) : null;
  const chart = fp ? buildBaziChart(fp) : null;
  const dayun = fp ? computeDaYun(fp, req.sex ?? "male") : null;

  const tz = req.window.tzOffsetMinutes;
  const start = Date.UTC(req.window.start.year, req.window.start.month - 1, req.window.start.day);
  const birthWarnings = fp ? fp.meta.boundaryWarnings : [];
  const all: DayRecommendation[] = [];
  for (let i = 0; i < req.window.days; i++) {
    const d = new Date(start + i * 86400000);
    const civil = { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
    const solarInstantUtc = Date.UTC(civil.year, civil.month - 1, civil.day, 12) - tz * 60000;
    all.push(evaluateDay(civil, solarInstantUtc, req, chart, dayun, birthWarnings));
  }

  const recommendations = all
    .filter((r) => !r.hardReject)
    .sort((a, b) => b.recommendationScore - a.recommendationScore || a.isoDate.localeCompare(b.isoDate));
  const rejected = all.filter((r) => r.hardReject);

  const calculationHash = hashOf({
    birth: req.birth,
    sex: req.sex,
    convention: req.convention.id,
    objective: req.objective.id,
    window: req.window,
    options: req.options ?? {},
    versions: VERSIONS,
  });

  const windowLabel = `${req.window.start.year}-${String(req.window.start.month).padStart(2, "0")}-${String(req.window.start.day).padStart(2, "0")} + ${req.window.days} days`;

  const result: DecisionResult = {
    meta: {
      engineVersions: VERSIONS,
      conventionId: req.convention.id,
      conventionLabel: req.convention.label,
      objectiveId: req.objective.id,
      objectiveLabel: req.objective.label,
      calculationHash,
      generatedAtNote: "Deterministic: identical inputs always yield this calculationHash and these results.",
      windowLabel,
      favorableElements: chart ? chart.dayMaster.favorableElements : [],
      unfavorableElements: chart ? chart.dayMaster.unfavorableElements : [],
      boundaryWarnings: birthWarnings,
      sensitivity: null,
      verification: null,
    },
    personalized,
    subjectChart: chart,
    dayun,
    recommendations,
    rejected,
    allDays: all,
  };

  // --- sensitivity sweeps → confidence (skipped for bulk/recursive evaluation) ---
  if (req.options?.sweeps !== false) {
    const weights = runWeightSweep(all, req.objective.weights);
    const convention = runConventionSweep(req, result, CONVENTION_PRESETS, evaluateDecision);
    result.meta.sensitivity = { convention, weights };

    const conventionStability = conventionSweepToScore(convention);
    const heuristicSensitivity = weightSweepToPenalty(weights);
    const sweepNotes: string[] = [];
    if (convention.severity !== "low") {
      sweepNotes.push(
        `Convention sensitivity ${convention.severity}: ` +
          [...convention.pillarDifferences, ...convention.bestHourDifferences].join("; ") +
          (convention.topDayStable ? "" : " — the top day changes under some school conventions."),
      );
    }
    if (weights.severity !== "low") {
      sweepNotes.push(
        `Ranking sensitivity ${weights.severity}: the top day stays first in ${Math.round(
          weights.topDayStableRatio * 100,
        )}% of ±10% weight perturbations (gap to #2: ${weights.scoreGapTop2} pts).`,
      );
    }
    for (const day of all) {
      day.confidence = finalizeDayConfidence(day.confidence, conventionStability, heuristicSensitivity, sweepNotes);
    }
  }

  return result;
}
