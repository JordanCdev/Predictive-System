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
  STEMS,
  Stem,
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

export interface ElementProfile {
  weights: Record<FivePhase, number>;
  percent: Record<FivePhase, number>;
  dominant: FivePhase;
  weakest: FivePhase;
}

export type Strength = "strong" | "balanced" | "weak";

export interface DayMasterAnalysis {
  dayMaster: Stem;
  strength: Strength;
  supportRatio: number; // 0..1
  hasMonthCommand: boolean;
  favorableElements: FivePhase[];
  unfavorableElements: FivePhase[];
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
  const total = Object.values(weights).reduce((a, b) => a + b, 0) || 1;
  const percent = {} as Record<FivePhase, number>;
  (Object.keys(weights) as FivePhase[]).forEach((p) => {
    percent[p] = Math.round((weights[p] / total) * 1000) / 10;
  });
  const sorted = (Object.keys(weights) as FivePhase[]).sort((a, b) => weights[b] - weights[a]);
  return { weights, percent, dominant: sorted[0], weakest: sorted[sorted.length - 1] };
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

  let strength: Strength;
  if (supportRatio >= 0.55 || (supportRatio >= 0.45 && hasMonthCommand)) strength = "strong";
  else if (supportRatio <= 0.32) strength = "weak";
  else strength = "balanced";

  let favorableElements: FivePhase[];
  let unfavorableElements: FivePhase[];
  if (strength === "strong") {
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

  const rationale =
    `Day Master ${dm.hanzi} (${dm.phase}); support (印+比劫) vs drain (食傷+財+官殺) ratio ` +
    `${(supportRatio * 100).toFixed(0)}%. ${hasMonthCommand ? "Holds month command (得令)." : "Lacks month command (失令)."} ` +
    `Classified ${strength}. Favourable elements support a balanced chart and are MEDIUM confidence (school-dependent).`;

  return {
    dayMaster: dm,
    strength,
    supportRatio,
    hasMonthCommand,
    favorableElements: dedupe(favorableElements),
    unfavorableElements: dedupe(unfavorableElements),
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
