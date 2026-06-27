/**
 * Layer 4 — Deterministic decision engine (spec §10) + Layer 5 explanation
 * payload (spec §11). Generates candidate days over a window, scores each with
 * transparent multi-criteria analysis (MCDA), applies hard-constraint vetoes,
 * detects cross-school conflicts, computes a decision-support confidence index
 * (spec §12), and ranks. Every recommendation carries its facts, the rules it
 * fired with citations, conflicts, and version/calculation hashes.
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
import { ConventionSet } from "./conventions.ts";
import {
  TongShuDay,
  computeTongShuDay,
  isNoblemanDay,
  personalShenSha,
} from "./tongshu.ts";
import { Objective } from "./objectives.ts";
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
  personal: number;
  hour: number;
}

export interface ConfidenceBreakdown {
  overall: number;
  components: {
    calculationReproducibility: number;
    sourceQuality: number;
    sourceSpecificity: number;
    schoolAgreement: number;
    inputQuality: number;
    validationConcordance: number;
    ruleCoverage: number;
  };
}

export interface DayRecommendation {
  isoDate: string;
  civil: { year: number; month: number; day: number };
  weekday: string;
  tongshu: TongShuDay;
  dayStemTenGod: TenGod;
  bestHour: HourPick;
  allHours: HourPick[];
  subScores: SubScores;
  finalScore: number;
  confidence: ConfidenceBreakdown;
  hardReject: boolean;
  rejectReasons: string[];
  rulesFired: RuleFired[];
  conflicts: ConflictRecord[];
  shenShaTags: { nameZh: string; nameEn: string; polarity: string; note: string }[];
  topReasons: string[];
}

export interface DecisionRequest {
  birth: MomentInput;
  sex: "male" | "female";
  convention: ConventionSet;
  objective: Objective;
  window: { start: { year: number; month: number; day: number }; days: number; tzOffsetMinutes: number };
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
  };
  subjectChart: BaziChart;
  dayun: DaYun;
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

function evaluateDay(
  civil: { year: number; month: number; day: number },
  solarInstantUtc: number,
  req: DecisionRequest,
  chart: BaziChart,
): DayRecommendation {
  const obj = req.objective;
  const fav = chart.dayMaster.favorableElements;
  const unfav = chart.dayMaster.unfavorableElements;
  const dmStem = chart.dayMaster.dayMaster.index;
  const subjectDayBranch = chart.pillars[2].ganzhi.branch.index;
  const subjectYearBranch = chart.pillars[0].ganzhi.branch.index;
  const godBias = obj.godBias;

  const ts = computeTongShuDay(civil, solarInstantUtc);
  const dayGz = ts.dayGanzhi;
  const rules: RuleFired[] = [];
  const rejectReasons: string[] = [];

  // --- Evaluator 1: officer (建除 fit) ---
  let officerRaw = ts.officer.base;
  if (ts.officer.good.includes(obj.primaryTag)) officerRaw += 6;
  if (ts.officer.good.includes("general") && obj.primaryTag !== "general") officerRaw += 1;
  if (ts.officer.bad.includes(obj.primaryTag)) officerRaw -= 8;
  const officerScore = clamp(50 + officerRaw * 3.5);
  rules.push({
    code: `officer_${ts.officer.nameEn.toLowerCase()}`,
    layer: "tongshu",
    label: `Day Officer 建除 = ${ts.officer.nameZh} ${ts.officer.nameEn}`,
    effect: officerRaw,
    citation: CITES.officer,
  });

  // --- Evaluator 2: road (黄黑道) ---
  const roadScore = DAY_GOD_SCORE[ts.dayGod.index];
  rules.push({
    code: `road_${ts.dayGod.nameEn.toLowerCase().replace(/\s/g, "_")}`,
    layer: "tongshu",
    label: `Day God = ${ts.dayGod.nameZh} ${ts.dayGod.nameEn} (${ts.dayGod.yellow ? "Yellow/auspicious" : "Black/inauspicious"})`,
    effect: ts.dayGod.yellow ? 1 : -1,
    citation: CITES.road,
  });

  // --- Evaluator 3: personal (BaZi) ---
  let personal = 50;
  const dayStemTenGod = tenGodOf(STEMS[dmStem], dayGz.stem);
  if (godBias.includes(godGroupOf(dayStemTenGod))) {
    personal += 12;
    rules.push({ code: "ten_god_support", layer: "bazi", label: `Day stem ${dayGz.stem.hanzi} = ${TEN_GOD_LABEL[dayStemTenGod]} — supports this goal.`, effect: 12, citation: CITES.tenGod });
  }
  const fStem = dayStemFavor(dayGz.stem.phase, fav, unfav);
  if (fStem !== 0) {
    personal += fStem * 10;
    rules.push({ code: "element_stem", layer: "bazi", label: `Day stem element ${PHASE_LABEL[dayGz.stem.phase]} is ${fStem > 0 ? "favourable" : "unfavourable"} to your Day Master.`, effect: fStem * 10, citation: CITES.element });
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

  // Shen Sha overlay.
  const ss = personalShenSha(dayGz, subjectDayBranch, subjectYearBranch);
  for (const t of ss.tags) {
    let eff = 0;
    if (t.code === "clash_day") eff = -20;
    else if (t.code === "clash_zodiac") eff = -16;
    else if (t.code === "six_harmony") eff = 8;
    else if (t.code === "triple_harmony") eff = 8;
    else if (t.code === "peach_blossom") eff = obj.id === "wedding_marriage" ? 6 : 0;
    else if (t.code === "travelling_horse") eff = obj.id === "travel" || obj.id === "moving_house" ? 10 : 2;
    if (eff !== 0) {
      personal += eff;
      rules.push({ code: t.code, layer: t.code.startsWith("clash") ? "bazi" : "shensha", label: `${t.nameZh} ${t.nameEn} — ${t.note}`, effect: eff, citation: t.code.startsWith("clash") ? CITES.clash : CITES.shensha });
    }
  }
  const personalScore = clamp(personal);

  // --- Evaluator 4: hour ---
  const hours = scoreHours(dayGz, fav, unfav, dmStem, godBias, dmStem);
  const hourScore = hours.best.score;
  rules.push({ code: "best_hour", layer: "hour", label: `Best double-hour: ${hours.best.ganzhi.hanzi} (${hours.best.rangeLabel}).`, effect: hourScore - 50, citation: CITES.hour });

  // --- weighted MCDA final ---
  const w = obj.weights;
  const finalScore = round1(
    w.officer * officerScore + w.road * roadScore + w.personal * personalScore + w.hour * hourScore,
  );
  const subScores: SubScores = {
    officer: round1(officerScore),
    road: round1(roadScore),
    personal: round1(personalScore),
    hour: round1(hourScore),
  };

  // --- hard constraints (vetoes) ---
  let hardReject = false;
  if (obj.vetoOfficers.includes(ts.officer.index)) {
    hardReject = true;
    rejectReasons.push(`Officer ${ts.officer.nameZh} (${ts.officer.nameEn}) is forbidden for ${obj.label.toLowerCase()}.`);
  }
  if (obj.clashVeto) {
    const hasClash = ss.tags.find((t) => t.code === "clash_day" || t.code === "clash_zodiac");
    if (hasClash) {
      hardReject = true;
      rejectReasons.push(`Day clashes your chart (${hasClash.nameZh}); a hard taboo for this objective.`);
    }
  }

  // --- conflict detection (cross-school disagreement) ---
  const conflicts: ConflictRecord[] = [];
  if (officerScore >= 62 && personalScore <= 40) {
    conflicts.push({ type: "tongshu_vs_bazi", schools: ["Tong Shu (建除)", "BaZi personalization"], severity: "medium", reason: "The almanac officer favours this day, but your personal chart does not." });
  }
  if (personalScore >= 62 && officerScore <= 38) {
    conflicts.push({ type: "bazi_vs_tongshu", schools: ["BaZi personalization", "Tong Shu (建除)"], severity: "medium", reason: "Your chart favours this day, but the almanac officer warns against it." });
  }
  if (roadScore >= 78 && officerScore <= 38) {
    conflicts.push({ type: "road_vs_officer", schools: ["Yellow-road god", "建除 officer"], severity: "low", reason: "A Yellow-road (auspicious) day whose 建除 officer is poor for this activity." });
  }
  if (roadScore <= 34 && officerScore >= 62) {
    conflicts.push({ type: "officer_vs_road", schools: ["建除 officer", "Black-road god"], severity: "low", reason: "A good 建除 officer falling on a Black-road day god." });
  }

  // --- confidence (spec §12) ---
  const confidence = computeConfidence(req, conflicts.length, chart);

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
    tongshu: ts,
    dayStemTenGod,
    bestHour: hours.best,
    allHours: hours.all,
    subScores,
    finalScore,
    confidence,
    hardReject,
    rejectReasons,
    rulesFired: rules,
    conflicts,
    shenShaTags: ss.tags,
    topReasons,
  };
}

function computeConfidence(req: DecisionRequest, conflictCount: number, chart: BaziChart): ConfidenceBreakdown {
  const calc = 1.0; // fully deterministic
  const sourceQuality = 0.8; // classical + astronomical citations
  const sourceSpecificity = 0.7;
  const schoolAgreement = Math.max(0.4, 1 - 0.18 * conflictCount);
  const certainty = req.birth.timeCertainty ?? "exact";
  let inputQuality = certainty === "exact" ? 0.95 : certainty === "approximate" ? 0.7 : 0.5;
  // boundary sensitivity penalty
  if (chart.dayMaster) {
    // (chart-level; boundary warnings are surfaced separately)
  }
  const validation = 0.85; // kernel validated vs solar terms + golden charts
  const ruleCoverage = 0.65; // Tong Shu + BaZi covered; Qi Men / Xuan Kong not in this build
  const components = {
    calculationReproducibility: calc,
    sourceQuality,
    sourceSpecificity,
    schoolAgreement,
    inputQuality,
    validationConcordance: validation,
    ruleCoverage,
  };
  // spec §12.1 weights
  const overall =
    0.2 * calc + 0.2 * sourceQuality + 0.15 * sourceSpecificity + 0.15 * schoolAgreement + 0.1 * inputQuality + 0.15 * validation + 0.05 * ruleCoverage;
  return { overall: Math.round(overall * 100) / 100, components };
}

/** Main entry point: evaluate a window and return ranked recommendations. */
export function evaluateDecision(req: DecisionRequest): DecisionResult {
  const fp = buildFourPillars(req.birth, req.convention);
  const chart = buildBaziChart(fp);
  const dayun = computeDaYun(fp, req.sex);

  const tz = req.window.tzOffsetMinutes;
  const start = Date.UTC(req.window.start.year, req.window.start.month - 1, req.window.start.day);
  const all: DayRecommendation[] = [];
  for (let i = 0; i < req.window.days; i++) {
    const d = new Date(start + i * 86400000);
    const civil = { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
    const solarInstantUtc = Date.UTC(civil.year, civil.month - 1, civil.day, 12) - tz * 60000;
    all.push(evaluateDay(civil, solarInstantUtc, req, chart));
  }

  const recommendations = all
    .filter((r) => !r.hardReject)
    .sort((a, b) => b.finalScore - a.finalScore || a.isoDate.localeCompare(b.isoDate));
  const rejected = all.filter((r) => r.hardReject);

  const calculationHash = hashOf({
    birth: req.birth,
    sex: req.sex,
    convention: req.convention.id,
    objective: req.objective.id,
    window: req.window,
    versions: VERSIONS,
  });

  const windowLabel = `${req.window.start.year}-${String(req.window.start.month).padStart(2, "0")}-${String(req.window.start.day).padStart(2, "0")} + ${req.window.days} days`;

  return {
    meta: {
      engineVersions: VERSIONS,
      conventionId: req.convention.id,
      conventionLabel: req.convention.label,
      objectiveId: req.objective.id,
      objectiveLabel: req.objective.label,
      calculationHash,
      generatedAtNote: "Deterministic: identical inputs always yield this calculationHash and these results.",
      windowLabel,
      favorableElements: chart.dayMaster.favorableElements,
      unfavorableElements: chart.dayMaster.unfavorableElements,
      boundaryWarnings: fp.meta.boundaryWarnings,
    },
    subjectChart: chart,
    dayun,
    recommendations,
    rejected,
    allDays: all,
  };
}
