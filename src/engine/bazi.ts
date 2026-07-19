/**
 * Layer 2/3 — BaZi chart analysis (spec §6.1–6.2).
 *
 * Deterministic facts (pillars, hidden stems, Ten Gods, Na Yin, element
 * accounting) plus a clearly-labelled MEDIUM-confidence interpretive layer
 * (day-master strength, favorable/unfavorable elements, Da Yun). Per the
 * classics, structural/month-command reasoning precedes any auxiliary overlay
 * (spec §5 doctrinal ordering).
 */

import {
  BRANCHES,
  Branch,
  FivePhase,
  GanZhi,
  HIDDEN_STEMS,
  SIX_HARMONY_PAIRS,
  STEMS,
  Stem,
  THREE_HARMONY,
  THREE_MEETING,
  TenGod,
  TEN_GOD_LABEL,
  ganZhiFromIndex,
  godGroupOf,
  mod,
  naYinOf,
  phaseControlledBy,
  phaseControls,
  phaseGeneratedBy,
  phaseGenerates,
  tenGodOf,
} from "./symbols.ts";
import { FourPillars } from "./sexagenary.ts";
import { jieWindowAround } from "./astronomy.ts";

export interface PillarReading {
  position: "year" | "month" | "day" | "hour";
  ganzhi: GanZhi;
  stemTenGod: TenGod | "day_master";
  hiddenStems: { stem: Stem; tenGod: TenGod; weight: number }[];
  naYinZh: string;
  naYinEn: string;
  naYinPhase: FivePhase;
}

/** A 三合/三會/六合/六沖 relation detected among the natal branches (MEDIUM
 *  confidence — the *weight* of these is school-dependent; we surface them as
 *  features and apply a modest, labelled adjustment rather than auto-transform). */
export interface BranchInteraction {
  type: "three_harmony" | "three_harmony_half" | "three_meeting" | "six_harmony" | "clash";
  branches: number[];
  element?: FivePhase; // the pooled element (not for clash)
  complete: boolean;
}

export interface ElementProfile {
  weights: Record<FivePhase, number>;
  percent: Record<FivePhase, number>;
  dominant: FivePhase;
  weakest: FivePhase;
  interactions: BranchInteraction[];
}

export type Strength = "strong" | "balanced" | "weak";
/** 旺相休囚死 — the Day Master's vitality in its birth season. */
export type SeasonalState = "prosperous" | "strong" | "resting" | "trapped" | "dead";

/**
 * Special-structure classification (格局). Most charts are `normal` (扶抑用神).
 * The two extremes invert the favourable-element logic:
 *  - `follow` (從格): a rootless, unsupported Day Master follows the dominant
 *    force — propping it up (印/比劫) now HARMS, so those become unfavourable.
 *  - `dominant` (專旺/從旺): an overwhelming Day Master should flow with its own
 *    element, so 官殺/財 (which fight it) become unfavourable.
 * Getting these wrong is the classic mis-advice for extreme charts (docs/DECISIONS.md §5).
 */
export type ChartStructure = "normal" | "follow" | "dominant";

/** How the climate school (調候) relates to the balance school's useful element. */
/** How the 調候 (climate) school's needed element relates to the balance school's
 *  useful element. `neutral` matters: the climate need can be simply orthogonal —
 *  neither supporting nor opposing 用神 — which is NOT a disagreement between
 *  schools and must not be reported as one. */
export type ClimaticReconciliation = "aligned" | "conflict" | "neutral" | "not_applicable";

/** Transparent strength arithmetic + near-threshold instability flags. The
 *  cut-points are engine calibration, not doctrine (docs/DECISIONS.md §6.7),
 *  so a chart within ±0.02 of one is flagged: a tiny input or convention change
 *  could flip the classification and invert the favourable-element set. */
export interface StrengthBreakdown {
  supportRatio: number;
  seasonalAdjustment: number;
  rootingAdjustment: number;
  adjusted: number;
  thresholds: { weakMax: number; strongWithCommandMin: number; strongMin: number };
  nearThreshold: boolean;
  nearThresholdNote: string | null;
}

export interface DayMasterAnalysis {
  dayMaster: Stem;
  strength: Strength;
  /** 格局 — normal vs a follow/dominant special structure (inverts 用神). */
  structure: ChartStructure;
  supportRatio: number; // 0..1
  hasMonthCommand: boolean;
  /** 旺相休囚死 from the month command. */
  seasonalState: SeasonalState;
  /** 通根 — does the Day Master have a root among the branch hidden stems? */
  rooting: { hasRoot: boolean; mainQiRoot: boolean; rootBranches: string[] };
  /** 調候 — climatic (warmth/moisture) need for temperature-extreme births. An
   *  alternative-school view (窮通寶鑑); null in mild seasons. */
  climatic: { needed: FivePhase[]; reason: string } | null;
  /** Whether the climate school's needed element aligns with, or conflicts with,
   *  the balance school's favourable set — surfaced, never silently merged. */
  climaticReconciliation: ClimaticReconciliation;
  favorableElements: FivePhase[];
  unfavorableElements: FivePhase[];
  /** How `strength` was reached, with near-cut-point instability flags. */
  strengthBreakdown: StrengthBreakdown;
  rationale: string;
  /** Functional element map relative to the Day Master. */
  functional: {
    companion: FivePhase;
    resource: FivePhase;
    output: FivePhase;
    wealth: FivePhase;
    officer: FivePhase;
  };
}

/** Detect 三合/三會/六合 frames and 六沖 clashes among the four natal branches. */
export function detectInteractions(branchIdx: number[]): BranchInteraction[] {
  const has = (b: number) => branchIdx.includes(b);
  const out: BranchInteraction[] = [];
  for (const g of THREE_MEETING) {
    if (g.branches.every(has)) out.push({ type: "three_meeting", branches: g.branches, element: g.element, complete: true });
  }
  for (const g of THREE_HARMONY) {
    const have = g.branches.filter(has);
    const cardinal = g.branches[1]; // 子午卯酉
    if (have.length === 3) out.push({ type: "three_harmony", branches: g.branches, element: g.element, complete: true });
    else if (have.length === 2 && have.includes(cardinal)) out.push({ type: "three_harmony_half", branches: have, element: g.element, complete: false });
  }
  for (const g of SIX_HARMONY_PAIRS) {
    if (g.branches.every(has)) out.push({ type: "six_harmony", branches: g.branches, element: g.element, complete: true });
  }
  const seen = new Set<string>();
  for (let i = 0; i < branchIdx.length; i++) {
    for (let j = i + 1; j < branchIdx.length; j++) {
      if (mod(branchIdx[i] - branchIdx[j], 12) === 6) {
        const key = [branchIdx[i], branchIdx[j]].sort((a, b) => a - b).join(",");
        if (!seen.has(key)) {
          seen.add(key);
          out.push({ type: "clash", branches: [branchIdx[i], branchIdx[j]], complete: true });
        }
      }
    }
  }
  return out;
}

export interface LuckPillar {
  index: number;
  ganzhi: GanZhi;
  startAge: number; // decimal years
  endAge: number;
  stemTenGod: TenGod;
}

export interface DaYun {
  direction: "forward" | "reverse";
  startAge: number;
  rule: string;
  pillars: LuckPillar[];
}

export interface BaziChart {
  pillars: PillarReading[];
  elements: ElementProfile;
  dayMaster: DayMasterAnalysis;
}

const POSITIONS = ["year", "month", "day", "hour"] as const;

function readPillar(position: PillarReading["position"], gz: GanZhi, dayMaster: Stem): PillarReading {
  const ny = naYinOf(gz.index);
  const hidden = HIDDEN_STEMS[gz.branch.index].map((h) => ({
    stem: STEMS[h.stem],
    tenGod: tenGodOf(dayMaster, STEMS[h.stem]),
    weight: h.weight,
  }));
  return {
    position,
    ganzhi: gz,
    stemTenGod: position === "day" ? "day_master" : tenGodOf(dayMaster, gz.stem),
    hiddenStems: hidden,
    naYinZh: ny.nameZh,
    naYinEn: ny.nameEn,
    naYinPhase: ny.phase,
  };
}

/**
 * Weighted element accounting. The four heaven stems count 1.0 each; branch
 * hidden stems count by their stored weight; the MONTH branch (月令) is
 * boosted ×1.6 because seasonal command dominates (a Zi Ping convention).
 */
export function elementProfile(fp: FourPillars): ElementProfile {
  const weights: Record<FivePhase, number> = { wood: 0, fire: 0, earth: 0, metal: 0, water: 0 };
  const pillars: { gz: GanZhi; isMonth: boolean }[] = [
    { gz: fp.year, isMonth: false },
    { gz: fp.month, isMonth: true },
    { gz: fp.day, isMonth: false },
    { gz: fp.hour, isMonth: false },
  ];
  for (const { gz, isMonth } of pillars) {
    const mult = isMonth ? 1.6 : 1.0;
    weights[gz.stem.phase] += 1.0 * mult;
    for (const h of HIDDEN_STEMS[gz.branch.index]) {
      weights[STEMS[h.stem].phase] += h.weight * mult;
    }
  }

  // Branch frames/clashes reshape the raw element pool (MEDIUM confidence — the
  // magnitude is a labelled convention; we do not auto-transform 化).
  const branchIdx = pillars.map((p) => p.gz.branch.index);
  const interactions = detectInteractions(branchIdx);
  for (const it of interactions) {
    if (it.type === "three_meeting" && it.element) weights[it.element] += 2.0;
    else if (it.type === "three_harmony" && it.element) weights[it.element] += 1.5;
    else if (it.type === "three_harmony_half" && it.element) weights[it.element] += 0.6;
    else if (it.type === "six_harmony" && it.element) weights[it.element] += 0.4;
    else if (it.type === "clash") {
      for (const b of it.branches) {
        const ph = BRANCHES[b].phase;
        weights[ph] = Math.max(0, weights[ph] - 0.5); // a clash destabilises both branches' qi
      }
    }
  }

  const total = Object.values(weights).reduce((a, b) => a + b, 0) || 1;
  const percent = {} as Record<FivePhase, number>;
  (Object.keys(weights) as FivePhase[]).forEach((p) => {
    percent[p] = Math.round((weights[p] / total) * 1000) / 10;
  });
  const sorted = (Object.keys(weights) as FivePhase[]).sort((a, b) => weights[b] - weights[a]);
  return { weights, percent, dominant: sorted[0], weakest: sorted[sorted.length - 1], interactions };
}

/** 旺相休囚死 of a phase given the season's ruling element (the month phase). */
export function seasonalStateOf(phase: FivePhase, seasonPhase: FivePhase): SeasonalState {
  if (phase === seasonPhase) return "prosperous"; // 旺
  if (phaseGeneratedBy(phase) === seasonPhase) return "strong"; // 相 — season feeds it
  if (phaseGenerates(phase) === seasonPhase) return "resting"; // 休 — it feeds the season
  if (phaseControls(phase) === seasonPhase) return "trapped"; // 囚 — it fights the season
  return "dead"; // 死 — the season controls it
}

const SEASONAL_STATE_ZH: Record<SeasonalState, string> = {
  prosperous: "旺",
  strong: "相",
  resting: "休",
  trapped: "囚",
  dead: "死",
};

/**
 * 調候 — the climatic regulator. Births in deep cold (亥子丑) need Fire for
 * warmth; in peak heat (巳午未) need Water to cool/moisten. This is the core
 * 窮通寶鑑 principle (an alternative school to 格局/strength); mild seasons get null.
 */
function climaticNeed(monthBranchIndex: number): DayMasterAnalysis["climatic"] {
  if ([11, 0, 1].includes(monthBranchIndex)) {
    return { needed: ["fire"], reason: "Born in the cold of winter — the chart wants Fire (調候) for warmth." };
  }
  if ([5, 6, 7].includes(monthBranchIndex)) {
    return { needed: ["water"], reason: "Born in the heat of summer — the chart wants Water (調候) to cool and moisten." };
  }
  return null;
}

export function analyzeDayMaster(fp: FourPillars, elements: ElementProfile): DayMasterAnalysis {
  const dm = fp.dayMaster;
  const functional = {
    companion: dm.phase,
    resource: phaseGeneratedBy(dm.phase), // element that produces DM (印)
    output: phaseGenerates(dm.phase), // element DM produces (食傷)
    wealth: phaseControls(dm.phase), // element DM controls (財)
    officer: phaseControlledBy(dm.phase), // element that controls DM (官殺)
  };

  const support = elements.weights[functional.companion] + elements.weights[functional.resource];
  const oppose =
    elements.weights[functional.output] +
    elements.weights[functional.wealth] +
    elements.weights[functional.officer];
  const supportRatio = support / (support + oppose || 1);

  // Does the month branch give the DM its command (月令)?
  const monthBranch = fp.month.branch;
  const monthPhases = new Set<FivePhase>([
    monthBranch.phase,
    ...HIDDEN_STEMS[monthBranch.index].map((h) => STEMS[h.stem].phase),
  ]);
  const hasMonthCommand = monthPhases.has(functional.companion) || monthPhases.has(functional.resource);

  // 旺相休囚死 — the DM's vitality relative to the month's ruling element (得令).
  const seasonalState = seasonalStateOf(dm.phase, monthBranch.phase);
  const SEASON_ADJ: Record<SeasonalState, number> = {
    prosperous: 0.12,
    strong: 0.06,
    resting: -0.02,
    trapped: -0.1,
    dead: -0.15,
  };

  // 通根 — does the DM have a root (its own phase) among the branch hidden stems? (得地)
  const rootBranches: string[] = [];
  let mainQiRoot = false;
  for (const gz of [fp.year, fp.month, fp.day, fp.hour]) {
    for (const h of HIDDEN_STEMS[gz.branch.index]) {
      if (STEMS[h.stem].phase === dm.phase) {
        rootBranches.push(gz.branch.hanzi);
        if (h.weight >= 0.6) mainQiRoot = true;
        break;
      }
    }
  }
  const rooting = { hasRoot: rootBranches.length > 0, mainQiRoot, rootBranches: [...new Set(rootBranches)] };
  const rootAdj = mainQiRoot ? 0.1 : rooting.hasRoot ? 0.04 : -0.08;

  // Combine the support ratio with the two classical axes (得令/得地).
  const adjusted = Math.max(0, Math.min(1, supportRatio + SEASON_ADJ[seasonalState] + rootAdj));

  let strength: Strength;
  if (adjusted >= 0.52 || (adjusted >= 0.45 && hasMonthCommand)) strength = "strong";
  else if (adjusted <= 0.34) strength = "weak";
  else strength = "balanced";

  // 格局 — special structures at the extremes, keyed to the RAW support ratio
  // (印+比劫 fraction) plus the structural gates, not the adjusted score. The
  // month command (得令) is the classical discriminator: a DM that holds it is
  // rooted in the season's qi and cannot "follow", so an ordinary rootless-weak
  // chart that still holds command stays `normal` rather than misfiring as 從格.
  //  - 從格 (follow): rootless AND 失令 AND negligible support (≤ 15%).
  //  - 專旺/從旺 (dominant): strongly rooted AND 得令 AND overwhelming support (≥ 72%).
  let structure: ChartStructure = "normal";
  if (!rooting.hasRoot && !hasMonthCommand && supportRatio <= 0.15) structure = "follow";
  else if (rooting.mainQiRoot && hasMonthCommand && supportRatio >= 0.72) structure = "dominant";

  // Near-threshold instability: the classification governs the entire
  // favourable-element set, so sitting within ±0.02 of a GOVERNING cut-point
  // is a real fragility the confidence layer must see. Which cut governs
  // depends on month command: with it, strong begins at 0.45 (0.52 is inert —
  // a 0.50 chart with command cannot flip); without it, at 0.52.
  const NEAR = 0.02;
  const nearWeak = Math.abs(adjusted - 0.34) < NEAR;
  const nearCommand = hasMonthCommand && Math.abs(adjusted - 0.45) < NEAR;
  const nearStrong = !hasMonthCommand && Math.abs(adjusted - 0.52) < NEAR;
  const nearThreshold = nearWeak || nearCommand || nearStrong;
  const nearWhich = nearWeak
    ? "weak/balanced (0.34)"
    : nearCommand
      ? "balanced/strong-with-month-command (0.45)"
      : "balanced/strong (0.52)";
  const strengthBreakdown: StrengthBreakdown = {
    supportRatio: Math.round(supportRatio * 1000) / 1000,
    seasonalAdjustment: SEASON_ADJ[seasonalState],
    rootingAdjustment: rootAdj,
    adjusted: Math.round(adjusted * 1000) / 1000,
    thresholds: { weakMax: 0.34, strongWithCommandMin: 0.45, strongMin: 0.52 },
    nearThreshold,
    nearThresholdNote: nearThreshold
      ? `Adjusted strength ${adjusted.toFixed(3)} sits within 0.02 of the ${nearWhich} cut-point — the classification (and the favourable elements built on it) could flip under a slightly different school or input.`
      : null,
  };

  let favorableElements: FivePhase[];
  let unfavorableElements: FivePhase[];
  if (structure === "follow") {
    // 從格 — go WITH the dominant force; reviving the DM (印/比劫) breaks it.
    favorableElements = [functional.output, functional.wealth, functional.officer];
    unfavorableElements = [functional.companion, functional.resource];
  } else if (structure === "dominant") {
    // 專旺/從旺 — flow with the overwhelming DM; 官殺/財 provoke it.
    favorableElements = [functional.companion, functional.resource, functional.output];
    unfavorableElements = [functional.wealth, functional.officer];
  } else if (strength === "strong") {
    favorableElements = [functional.output, functional.wealth, functional.officer];
    unfavorableElements = [functional.companion, functional.resource];
  } else if (strength === "weak") {
    favorableElements = [functional.resource, functional.companion];
    unfavorableElements = [functional.output, functional.wealth, functional.officer];
  } else {
    // Balanced: favour whatever element is scarcest among the regulating set,
    // leaning to the classical "use what flows" — keep both sides mild.
    favorableElements = [functional.output, functional.wealth];
    unfavorableElements = [];
  }

  // 調候 reconciliation — surface (not silently merge) how the climate school
  // relates to the balance school's useful element.
  const climatic = climaticNeed(monthBranch.index);
  const climaticReconciliation: ClimaticReconciliation = !climatic
    ? "not_applicable"
    : climatic.needed.some((e) => favorableElements.includes(e))
      ? "aligned"
      : climatic.needed.some((e) => unfavorableElements.includes(e))
        ? "conflict"
        // Neither favourable nor unfavourable: the balance school simply has no
        // opinion on this element. Two identical "conflict" branches used to sit
        // here, so every such chart claimed a school disagreement that wasn't
        // there — including every 從格/專旺 chart, whose unfavourable list is
        // deliberately emptied above.
        : "neutral";

  const rootDesc = rooting.mainQiRoot
    ? `rooted (得地, strong root in ${rooting.rootBranches.join("")})`
    : rooting.hasRoot
      ? `lightly rooted (${rooting.rootBranches.join("")})`
      : "rootless (無根)";
  const structureNote =
    structure === "follow"
      ? " Special structure 從格 (follow): the rootless Day Master follows the dominant force, so the useful elements are inverted (reviving it would harm)."
      : structure === "dominant"
        ? " Special structure 專旺/從旺 (dominant): flow with the overwhelming Day Master; elements that fight it are avoided."
        : "";
  const rationale =
    `Day Master ${dm.hanzi} (${dm.phase}); support (印+比劫) vs drain (食傷+財+官殺) ratio ` +
    `${(supportRatio * 100).toFixed(0)}%. ${hasMonthCommand ? "Holds month command (得令)" : "Lacks month command (失令)"}, ` +
    `${SEASONAL_STATE_ZH[seasonalState]} (${seasonalState}) in season, ${rootDesc}. ` +
    `Classified ${strength}.${structureNote} Strength + useful-element reading is MEDIUM confidence (school-dependent).`;

  return {
    dayMaster: dm,
    strength,
    structure,
    supportRatio,
    hasMonthCommand,
    seasonalState,
    rooting,
    climatic,
    climaticReconciliation,
    favorableElements: dedupe(favorableElements),
    unfavorableElements: dedupe(unfavorableElements),
    strengthBreakdown,
    rationale,
    functional,
  };
}

function dedupe<T>(arr: T[]): T[] {
  return [...new Set(arr)];
}

export function buildBaziChart(fp: FourPillars): BaziChart {
  const dm = fp.dayMaster;
  const pillars = POSITIONS.map((pos) =>
    readPillar(pos, { year: fp.year, month: fp.month, day: fp.day, hour: fp.hour }[pos], dm),
  );
  const elements = elementProfile(fp);
  const dayMaster = analyzeDayMaster(fp, elements);
  return { pillars, elements, dayMaster };
}

/**
 * Da Yun (大運) — sequential 10-year luck pillars (spec §6.2). Direction from
 * gender + year-stem polarity; start age from days-to-jie ÷ 3 ("three days =
 * one year"). This is MEDIUM-confidence doctrine and is labelled as such.
 */
export function computeDaYun(fp: FourPillars, sex: "male" | "female", count = 9): DaYun {
  const yearStemYang = fp.year.stem.yinYang === "yang";
  const forward = (sex === "male" && yearStemYang) || (sex === "female" && !yearStemYang);
  const direction: DaYun["direction"] = forward ? "forward" : "reverse";

  const birthUtc = fp.meta.normalized.utcMillis;
  const jw = jieWindowAround(birthUtc);
  const dayMs = 86400000;
  const elapsedDays = forward
    ? (jw.next.millis - birthUtc) / dayMs
    : (birthUtc - jw.prev.millis) / dayMs;
  const startAge = Math.round((elapsedDays / 3) * 100) / 100; // 3 days = 1 year

  const monthIndex = fp.month.index;
  const pillars: LuckPillar[] = [];
  for (let i = 1; i <= count; i++) {
    const idx = mod(monthIndex + (forward ? i : -i), 60);
    const gz = ganZhiFromIndex(idx);
    pillars.push({
      index: i,
      ganzhi: gz,
      startAge: Math.round((startAge + (i - 1) * 10) * 100) / 100,
      endAge: Math.round((startAge + i * 10) * 100) / 100,
      stemTenGod: tenGodOf(fp.dayMaster, gz.stem),
    });
  }

  return {
    direction,
    startAge,
    rule:
      `Direction ${direction} (${sex}, year stem ${fp.year.stem.hanzi} ${fp.year.stem.yinYang}); ` +
      `start age = days-to-${forward ? "next" : "previous"}-節 ÷ 3 = ${startAge}y. MEDIUM confidence; lineages vary.`,
    pillars,
  };
}

// Convenience re-exports for the decision layer.
export { TEN_GOD_LABEL, godGroupOf, BRANCHES };
export type { Branch };
