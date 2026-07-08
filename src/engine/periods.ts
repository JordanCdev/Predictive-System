/**
 * Layer 4c — Period summaries (大運 / 流年 / 流月) tied to the natal chart.
 *
 * Deterministic, explanatory-only (no network, no LLM, no wall clock beyond
 * explicit inputs). Reads the active luck decade, a selected year, and that
 * year's twelve solar months against the natal chart using the traditional
 * three-layer model (natal → 大運 → 流年 → 流月): a Ten-God THEME (what the
 * period is about) × 用神/忌神 favourability (how it goes) × branch INTERACTIONS
 * (合/沖/刑/害 via interactions.ts) routed to LIFE AREAS, plus 太歲 for the year.
 *
 * It does NOT claim what will happen — every output is a tendency paired with an
 * actionable posture, and carries the not-fate disclaimer. See docs/ROADMAP.md §B.
 */

import {
  BRANCHES,
  FivePhase,
  GanZhi,
  GodGroup,
  TEN_GOD_LABEL,
  TenGod,
  ganZhiFromIndex,
  godGroupOf,
  mod,
  tenGodOf,
} from "./symbols.ts";
import { BaziChart, DaYun, LuckPillar } from "./bazi.ts";
import { combineStemBranch } from "./sexagenary.ts";
import { JIE_TERMS, findSolarLongitudeCrossing, lichunMillis } from "./astronomy.ts";
import { elementPlain } from "./plainEnglish.ts";
import {
  BranchHit,
  INTERACTION_LABEL,
  NatalBranch,
  branchAgainstNatal,
  interactionPolarity,
  resolveBranchHits,
} from "./interactions.ts";

// ── Annual & monthly pillars (deterministic calendar identities) ─────────────

/** The 流年 (annual) 干支 for a BaZi solar year (立春-bounded). 1984 = 甲子. */
export function annualPillar(baziYear: number): GanZhi {
  return ganZhiFromIndex(mod(baziYear - 1984, 60));
}

export interface MonthPillar {
  ganzhi: GanZhi;
  branchIndex: number;
  /** The opening 節 (jie) term of this solar month. */
  jieNameZh: string;
  jieNameEn: string;
  longitude: number;
  startIso: string;
  endIso: string;
}

const dayMs = 86400000;
const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/**
 * The twelve 流月 (solar-month) pillars of a BaZi year, each with the exact
 * 節 span computed from solar longitude. Month 0 = 寅 (opens at 立春); the stem
 * comes from the year stem via 五虎遁, advancing one per month.
 */
export function monthPillarsOfYear(baziYear: number): MonthPillar[] {
  const yearStemIndex = annualPillar(baziYear).stem.index;
  const yinMonthStem = mod(yearStemIndex * 2 + 2, 10); // 寅-month stem (五虎遁)
  const lichun = lichunMillis(baziYear);
  const nextLichun = lichunMillis(baziYear + 1);

  const starts: number[] = [];
  for (let m = 0; m < 12; m++) {
    const longitude = mod(315 + 30 * m, 360);
    const seed = lichun + m * 30.44 * dayMs;
    starts.push(findSolarLongitudeCrossing(longitude, seed));
  }

  const out: MonthPillar[] = [];
  for (let m = 0; m < 12; m++) {
    const branchIndex = mod(2 + m, 12);
    const stemIndex = mod(yinMonthStem + m, 10);
    const jie = JIE_TERMS[m];
    out.push({
      ganzhi: combineStemBranch(stemIndex, branchIndex),
      branchIndex,
      jieNameZh: jie.nameZh,
      jieNameEn: jie.nameEn,
      longitude: mod(315 + 30 * m, 360),
      startIso: isoDay(starts[m]),
      endIso: isoDay(m < 11 ? starts[m + 1] : nextLichun),
    });
  }
  return out;
}

// ── Ten-God macro-theme table (what a period is ABOUT) ───────────────────────

export interface TenGodTheme {
  domain: string;
  supportive: string;
  cautionary: string;
}

/** Macro life-theme per functional Ten-God group. Which side (supportive vs
 *  cautionary) applies is decided by 用神/忌神 favourability, not by the group
 *  being "good" or "bad" in itself (docs/ROADMAP.md §B2). */
export const GROUP_THEME: Record<GodGroup, TenGodTheme> = {
  companion: {
    domain: "peers, partnership and self-reliance",
    supportive: "a year to build alliances, act independently, and lean on peers",
    cautionary: "a competitive stretch — watch cashflow, rivalry and partnership friction",
  },
  output: {
    domain: "creativity, expression and output",
    supportive: "a productive, expressive window — good for launching, teaching or performing",
    cautionary: "restlessness and over-commitment; guard your words and your reputation",
  },
  wealth: {
    domain: "money, effort-and-reward, and (often) relationships",
    supportive: "an opportunity-and-effort window — income, deals and connections tend to open",
    cautionary: "risk of over-extension or financial pressure — commit within your means",
  },
  officer: {
    domain: "career, authority and structure",
    supportive: "a career-and-responsibility window — recognition and taking on structure",
    cautionary: "pressure, conflict or feeling controlled — pace yourself and mind health",
  },
  resource: {
    domain: "study, support, health and consolidation",
    supportive: "a learning-and-consolidation window — study, mentorship, property, recovery",
    cautionary: "delay or over-dependence — avoid drifting; keep momentum",
  },
};

// ── Life-area routing ────────────────────────────────────────────────────────

export type LifeArea = "elders/roots" | "career" | "relationship" | "children/legacy";

const POSITION_LIFE_AREA: Record<NatalBranch["position"], LifeArea> = {
  year: "elders/roots",
  month: "career",
  day: "relationship", // the Day branch is the spouse palace (夫妻宮)
  hour: "children/legacy",
};

// ── 太歲 (annual Grand Duke) ─────────────────────────────────────────────────

export type TaiSuiRelation = "none" | "zhi" | "chong" | "xing" | "hai" | "po";

export interface TaiSui {
  /** Relationship of the year branch to the BIRTH-YEAR branch (folk/zodiac 太歲). */
  relation: TaiSuiRelation;
  /** 犯太歲 — offending Tai Sui (值/沖/刑/害; 破 excluded by default). */
  fanTaiSui: boolean;
  label: string;
  /** Relationship of the year branch to the DAY branch (deeper-BaZi view), labelled distinctly. */
  dayBranchRelation: TaiSuiRelation;
}

/** Strongest Tai-Sui-style relation of a year branch to a target branch. */
function taiSuiRelation(yearBranch: number, target: number): TaiSuiRelation {
  if (mod(yearBranch, 12) === mod(target, 12)) return "zhi";
  const hits = branchAgainstNatal(yearBranch, [{ index: target, position: "year" }]);
  if (hits.some((h) => h.type === "six_clash")) return "chong";
  if (hits.some((h) => h.type === "punishment")) return "xing";
  if (hits.some((h) => h.type === "six_harm")) return "hai";
  if (hits.some((h) => h.type === "destruction")) return "po";
  return "none";
}

const TAI_SUI_LABEL: Record<TaiSuiRelation, string> = {
  none: "no direct 太歲 relationship",
  zhi: "值太歲 / 本命年 — your zodiac year; a notable, handle-with-care year",
  chong: "沖太歲 — your zodiac clashes the year; a high-change, movement year",
  xing: "刑太歲 — a punishment relationship with the year; friction to manage",
  hai: "害太歲 — a harm relationship with the year; subtle persistent friction",
  po: "破太歲 — a minor destruction relationship with the year",
};

function computeTaiSui(chart: BaziChart, yearBranch: number): TaiSui {
  const birthYearBranch = chart.pillars[0].ganzhi.branch.index;
  const dayBranch = chart.pillars[2].ganzhi.branch.index;
  const relation = taiSuiRelation(yearBranch, birthYearBranch);
  return {
    relation,
    fanTaiSui: relation === "zhi" || relation === "chong" || relation === "xing" || relation === "hai",
    label: TAI_SUI_LABEL[relation],
    dayBranchRelation: taiSuiRelation(yearBranch, dayBranch),
  };
}

// ── Influence of one external pillar on the natal chart ──────────────────────

export type PeriodValence = "supportive" | "mixed" | "challenging" | "neutral";

export interface PillarInfluence {
  ganzhi: string;
  stemTenGod: TenGod;
  stemGroup: GodGroup;
  stemElement: FivePhase;
  stemValence: 1 | 0 | -1; // to the Day Master's favourable/unfavourable set
  branchElement: FivePhase;
  branchValence: 1 | 0 | -1;
  /** Resolved branch interactions vs the natal chart (interactions.ts vocabulary). */
  hits: BranchHit[];
}

function valenceOf(phase: FivePhase, fav: FivePhase[], unfav: FivePhase[]): 1 | 0 | -1 {
  if (fav.includes(phase)) return 1;
  if (unfav.includes(phase)) return -1;
  return 0;
}

/** Natal branches locked in the chart's OWN 三合/三會/六合 (for 合解沖). */
function lockedNatalBranches(chart: BaziChart): Set<number> {
  const locked = new Set<number>();
  for (const it of chart.elements.interactions) {
    if (it.type === "three_harmony" || it.type === "three_meeting" || it.type === "six_harmony") {
      it.branches.forEach((b) => locked.add(b));
    }
  }
  return locked;
}

export function pillarInfluence(chart: BaziChart, gz: GanZhi): PillarInfluence {
  const dm = chart.dayMaster.dayMaster;
  const fav = chart.dayMaster.favorableElements;
  const unfav = chart.dayMaster.unfavorableElements;
  const stemTenGod = tenGodOf(dm, gz.stem);
  const natal: NatalBranch[] = chart.pillars.map((p, i) => ({
    index: p.ganzhi.branch.index,
    position: (["year", "month", "day", "hour"] as const)[i],
  }));
  const hits = resolveBranchHits(branchAgainstNatal(gz.branch.index, natal), lockedNatalBranches(chart));
  return {
    ganzhi: gz.hanzi,
    stemTenGod,
    stemGroup: godGroupOf(stemTenGod),
    stemElement: gz.stem.phase,
    stemValence: valenceOf(gz.stem.phase, fav, unfav),
    branchElement: gz.branch.phase,
    branchValence: valenceOf(gz.branch.phase, fav, unfav),
    hits,
  };
}

// ── Period summary (one luck decade / year / month) ──────────────────────────

export type PeriodKind = "luck" | "year" | "month";

export interface PeriodSummary {
  kind: PeriodKind;
  /** Stable key: label for the row (ganzhi + age range / year / jie term). */
  label: string;
  ganzhi: string;
  span: { startIso: string; endIso: string } | null;
  influence: PillarInfluence;
  /** The Ten-God macro theme (what the period is about). */
  theme: { group: GodGroup; domain: string };
  valence: PeriodValence;
  /** Natal life areas the period's interactions touch. */
  lifeAreas: LifeArea[];
  /** Present on the year summary only. */
  taiSui: TaiSui | null;
  headline: string;
  tailwinds: string[];
  headwinds: string[];
  cautions: string[];
}

const VALENCE_LEAD: Record<PeriodValence, string> = {
  supportive: "A broadly supportive",
  mixed: "A mixed",
  challenging: "A demanding",
  neutral: "A quiet",
};

/** Element favourability of the interaction's pooled element (for harmonies). */
function hitElementValence(hit: BranchHit, fav: FivePhase[], unfav: FivePhase[]): 1 | 0 | -1 {
  return hit.element ? valenceOf(hit.element, fav, unfav) : 0;
}

function scoreInfluence(inf: PillarInfluence, fav: FivePhase[], unfav: FivePhase[]): number {
  let s = inf.stemValence * 2 + inf.branchValence;
  for (const h of inf.hits) {
    if (interactionPolarity(h.type) > 0) {
      const ev = hitElementValence(h, fav, unfav);
      s += ev > 0 ? 2 : ev < 0 ? -1 : 1; // a harmony pooling a 忌神 element is not a win
    } else if (h.type === "six_clash") {
      s += h.attenuated ? -1 : -2;
    } else if (h.type === "punishment") {
      s -= 2;
    } else if (h.type === "six_harm" || h.type === "self_punishment") {
      s -= 1;
    } // destruction: negligible, no score contribution
  }
  return s;
}

function valenceFrom(score: number, hasHits: boolean): PeriodValence {
  if (score >= 2) return "supportive";
  if (score <= -2) return "challenging";
  if (score !== 0 || hasHits) return "mixed";
  return "neutral";
}

function areaLabel(positions: NatalBranch["position"][]): string {
  return [...new Set(positions.map((p) => POSITION_LIFE_AREA[p]))].join(" & ");
}

function summarize(
  kind: PeriodKind,
  label: string,
  gz: GanZhi,
  span: PeriodSummary["span"],
  chart: BaziChart,
  taiSui: TaiSui | null,
): PeriodSummary {
  const inf = pillarInfluence(chart, gz);
  const fav = chart.dayMaster.favorableElements;
  const unfav = chart.dayMaster.unfavorableElements;
  const valence = valenceFrom(scoreInfluence(inf, fav, unfav), inf.hits.length > 0);
  const theme = GROUP_THEME[inf.stemGroup];
  const noun = kind === "luck" ? "luck decade" : kind === "year" ? "year" : "month";

  // Life areas touched by any non-attenuated interaction.
  const lifeAreas = [
    ...new Set(
      inf.hits
        .filter((h) => !(h.type === "six_clash" && h.attenuated))
        .flatMap((h) => h.natalPositions.map((p) => POSITION_LIFE_AREA[p])),
    ),
  ];

  const tailwinds: string[] = [];
  const headwinds: string[] = [];
  const cautions: string[] = [];

  // Theme framing follows the overall valence.
  if (valence === "supportive" || (valence === "mixed" && inf.stemValence >= 0)) tailwinds.push(theme.supportive + ".");
  if (valence === "challenging" || (valence === "mixed" && inf.stemValence < 0)) headwinds.push(theme.cautionary + ".");

  if (inf.stemValence > 0) tailwinds.push(`Its ${elementPlain(inf.stemElement)} stem is favourable to your chart.`);
  if (inf.branchValence > 0) tailwinds.push(`Its ${elementPlain(inf.branchElement)} branch is favourable to your chart.`);
  if (inf.stemValence < 0) headwinds.push(`Its ${elementPlain(inf.stemElement)} stem runs against your chart.`);
  if (inf.branchValence < 0) headwinds.push(`Its ${elementPlain(inf.branchElement)} branch runs against your chart.`);

  for (const h of inf.hits) {
    const area = areaLabel(h.natalPositions);
    const branches = h.natalBranches.map((b) => BRANCHES[b].hanzi).join("");
    if (interactionPolarity(h.type) > 0) {
      const ev = hitElementValence(h, fav, unfav);
      const line = `${INTERACTION_LABEL[h.type]} with your ${area} (${branches})${h.element ? ` → pooled ${elementPlain(h.element)}` : ""}`;
      if (ev >= 0) tailwinds.push(`${line} — cooperative energy.`);
      else headwinds.push(`${line}, but it pools an element that strains you.`);
    } else if (h.type === "destruction") {
      // lowest-priority; omit from cautions to avoid noise
    } else {
      const emphasis =
        h.natalPositions.includes("day")
          ? " — the Day/spouse palace, felt personally"
          : h.natalPositions.includes("year")
            ? " — your year branch (生肖)"
            : "";
      const soft = h.attenuated ? " (softened — bound in a harmony frame)" : "";
      cautions.push(`${INTERACTION_LABEL[h.type]} on your ${area} (${branches})${emphasis}${soft}: a period of change or friction on that axis.`);
    }
  }

  if (taiSui && taiSui.relation !== "none") {
    cautions.push(`${taiSui.label}.`);
  }

  const headline = `${VALENCE_LEAD[valence]} ${noun} — ${theme.domain} (${gz.hanzi}, ${TEN_GOD_LABEL[inf.stemTenGod]}).`;

  return {
    kind,
    label,
    ganzhi: gz.hanzi,
    span,
    influence: inf,
    theme: { group: inf.stemGroup, domain: theme.domain },
    valence,
    lifeAreas,
    taiSui,
    headline,
    tailwinds,
    headwinds,
    cautions,
  };
}

// ── Full report ──────────────────────────────────────────────────────────────

export interface PeriodsReport {
  targetYear: number;
  disclaimer: string;
  /** The luck decade active during the target year (null if none covers it). */
  activeLuck: PeriodSummary | null;
  /** All luck decades, for a life-arc scrubber. */
  luckPillars: PeriodSummary[];
  year: PeriodSummary;
  months: PeriodSummary[];
  /** One sentence weaving natal ↔ luck ↔ year together. */
  interaction: string;
}

const PERIODS_DISCLAIMER =
  "These are tendencies projected from your chart's favourable elements under this school — where conditions support or strain you, not forecasts of what will happen.";

function ageAtYearMidpoint(birth: { year: number; month: number; day: number }, year: number): number {
  return (Date.UTC(year, 6, 1) - Date.UTC(birth.year, birth.month - 1, birth.day)) / (365.25 * dayMs);
}

/** The luck pillar covering a given decimal age. */
export function activeLuckPillar(dayun: DaYun | null, age: number): LuckPillar | null {
  if (!dayun) return null;
  return dayun.pillars.find((p) => age >= p.startAge && age < p.endAge) ?? null;
}

export interface PeriodsInput {
  chart: BaziChart;
  dayun: DaYun | null;
  birth: { year: number; month: number; day: number };
  targetYear: number;
}

export function buildPeriodsReport({ chart, dayun, birth, targetYear }: PeriodsInput): PeriodsReport {
  const age = ageAtYearMidpoint(birth, targetYear);
  const luck = activeLuckPillar(dayun, age);

  const activeLuck = luck
    ? summarize("luck", `${luck.ganzhi.hanzi} (ages ${Math.round(luck.startAge)}–${Math.round(luck.endAge)})`, luck.ganzhi, null, chart, null)
    : null;

  const luckPillars = (dayun?.pillars ?? []).map((p) => {
    const active = luck !== null && p.index === luck.index;
    const label = `${active ? "now · " : ""}${p.ganzhi.hanzi} (ages ${Math.round(p.startAge)}–${Math.round(p.endAge)})`;
    return summarize("luck", label, p.ganzhi, null, chart, null);
  });

  const yearGz = annualPillar(targetYear);
  const taiSui = computeTaiSui(chart, yearGz.branch.index);
  const year = summarize("year", String(targetYear), yearGz, null, chart, taiSui);

  const months = monthPillarsOfYear(targetYear).map((mp) =>
    summarize("month", `${mp.jieNameEn} (${mp.jieNameZh})`, mp.ganzhi, { startIso: mp.startIso, endIso: mp.endIso }, chart, null),
  );

  // Weave the three scales into one honest sentence.
  const parts: string[] = [];
  if (activeLuck) parts.push(`your ${activeLuck.ganzhi} luck decade (${activeLuck.theme.domain}) is ${activeLuck.valence}`);
  parts.push(`${targetYear} (${year.ganzhi}, ${year.theme.domain}) is ${year.valence}`);
  const taiSuiBit = taiSui.fanTaiSui ? ` This is a 犯太歲 year (${year.taiSui!.relation}) — handle change with care.` : "";
  const interaction = `Overall, ${parts.join(", while ")}.${taiSuiBit}`;

  return {
    targetYear,
    disclaimer: PERIODS_DISCLAIMER,
    activeLuck,
    luckPillars,
    year,
    months,
    interaction,
  };
}
