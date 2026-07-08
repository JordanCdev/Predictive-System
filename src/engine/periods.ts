/**
 * Layer 4c — Period summaries (大運 / 流年 / 流月) tied to the natal chart.
 *
 * Deterministic, explanatory-only (no network, no LLM, no wall clock beyond
 * explicit inputs). Produces structured "tendency" summaries for the active
 * luck decade, a selected year, and that year's twelve solar months, plus the
 * interaction between natal structure, the active luck pillar, the annual
 * pillar and each month pillar.
 *
 * This layer does NOT claim what will happen. It reports element climate,
 * favourable-element tailwind/headwind, branch clashes/combinations against the
 * natal chart, Ten-God themes, and caution flags — the same doctrine the natal
 * engine already uses (扶抑用神), projected forward. Wording stays in the
 * register of "supports / strains / caution", never prophecy.
 */

import {
  BRANCHES,
  FivePhase,
  GanZhi,
  GodGroup,
  SIX_HARMONY_PAIRS,
  THREE_HARMONY,
  TEN_GOD_LABEL,
  TenGod,
  branchesClash,
  ganZhiFromIndex,
  godGroupOf,
  mod,
  tenGodOf,
} from "./symbols.ts";
import { BaziChart, DaYun, LuckPillar } from "./bazi.ts";
import { combineStemBranch } from "./sexagenary.ts";
import { JIE_TERMS, findSolarLongitudeCrossing, lichunMillis } from "./astronomy.ts";
import { elementPlain } from "./plainEnglish.ts";
import { GOD_GROUP_THEME } from "./advisor.ts";

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

// ── Influence of one external pillar on the natal chart ──────────────────────

export type PeriodValence = "supportive" | "mixed" | "challenging" | "neutral";

export interface BranchRelation {
  type: "clash" | "six_harmony" | "three_harmony";
  withBranch: string; // hanzi of the natal branch involved
  withPosition: "year" | "month" | "day" | "hour";
  element?: FivePhase;
}

export interface PillarInfluence {
  ganzhi: string;
  stemTenGod: TenGod;
  stemGroup: GodGroup;
  stemElement: FivePhase;
  stemValence: 1 | 0 | -1; // to the Day Master's favourable/unfavourable set
  branchElement: FivePhase;
  branchValence: 1 | 0 | -1;
  relations: BranchRelation[];
}

const NATAL_POSITIONS = ["year", "month", "day", "hour"] as const;

function valenceOf(phase: FivePhase, fav: FivePhase[], unfav: FivePhase[]): 1 | 0 | -1 {
  if (fav.includes(phase)) return 1;
  if (unfav.includes(phase)) return -1;
  return 0;
}

/** Relations of an external branch to each natal branch (clash / 六合 / 三合). */
function relationsToNatal(extBranch: number, natalBranches: number[]): BranchRelation[] {
  const rels: BranchRelation[] = [];
  natalBranches.forEach((nb, i) => {
    const pos = NATAL_POSITIONS[i];
    if (branchesClash(extBranch, nb)) {
      rels.push({ type: "clash", withBranch: BRANCHES[nb].hanzi, withPosition: pos });
    }
    for (const p of SIX_HARMONY_PAIRS) {
      if (p.branches.includes(extBranch) && p.branches.includes(nb) && extBranch !== nb) {
        rels.push({ type: "six_harmony", withBranch: BRANCHES[nb].hanzi, withPosition: pos, element: p.element });
      }
    }
    for (const g of THREE_HARMONY) {
      if (g.branches.includes(extBranch) && g.branches.includes(nb) && extBranch !== nb) {
        rels.push({ type: "three_harmony", withBranch: BRANCHES[nb].hanzi, withPosition: pos, element: g.element });
      }
    }
  });
  return rels;
}

export function pillarInfluence(chart: BaziChart, gz: GanZhi): PillarInfluence {
  const dm = chart.dayMaster.dayMaster;
  const fav = chart.dayMaster.favorableElements;
  const unfav = chart.dayMaster.unfavorableElements;
  const stemTenGod = tenGodOf(dm, gz.stem);
  const natalBranches = chart.pillars.map((p) => p.ganzhi.branch.index);
  return {
    ganzhi: gz.hanzi,
    stemTenGod,
    stemGroup: godGroupOf(stemTenGod),
    stemElement: gz.stem.phase,
    stemValence: valenceOf(gz.stem.phase, fav, unfav),
    branchElement: gz.branch.phase,
    branchValence: valenceOf(gz.branch.phase, fav, unfav),
    relations: relationsToNatal(gz.branch.index, natalBranches),
  };
}

// ── Period summary (one luck decade / year / month) ──────────────────────────

export type PeriodKind = "luck" | "year" | "month";

export interface PeriodSummary {
  kind: PeriodKind;
  /** Stable key: the ganzhi for luck, the year for 流年, "YYYY-祭" jie for a month. */
  label: string;
  ganzhi: string;
  span: { startIso: string; endIso: string } | null;
  influence: PillarInfluence;
  valence: PeriodValence;
  headline: string;
  tailwinds: string[];
  headwinds: string[];
  cautions: string[];
}

const HARMONY_WORD: Record<BranchRelation["type"], string> = {
  clash: "clash 沖",
  six_harmony: "Six-Harmony 六合",
  three_harmony: "Three-Harmony 三合",
};

function scoreInfluence(inf: PillarInfluence): number {
  let s = inf.stemValence * 2 + inf.branchValence;
  for (const r of inf.relations) {
    if (r.type === "clash") s -= 2;
    else s += 1;
  }
  return s;
}

function valenceFrom(score: number, hasRelations: boolean): PeriodValence {
  if (score >= 2) return "supportive";
  if (score <= -2) return "challenging";
  if (score !== 0 || hasRelations) return "mixed";
  return "neutral";
}

function buildTailwinds(inf: PillarInfluence): string[] {
  const out: string[] = [];
  if (inf.stemValence > 0) out.push(`Reinforces your ${GOD_GROUP_THEME[inf.stemGroup]} (favourable ${elementPlain(inf.stemElement)}).`);
  if (inf.branchValence > 0) out.push(`Its ${elementPlain(inf.branchElement)} branch is favourable to your chart.`);
  for (const r of inf.relations) {
    if (r.type !== "clash") {
      out.push(`${HARMONY_WORD[r.type]} with your ${r.withPosition} branch (${r.withBranch})${r.element ? ` → pooled ${elementPlain(r.element)}` : ""} — cooperative energy.`);
    }
  }
  return out;
}

function buildHeadwinds(inf: PillarInfluence): string[] {
  const out: string[] = [];
  if (inf.stemValence < 0) out.push(`Feeds your ${GOD_GROUP_THEME[inf.stemGroup]} (straining ${elementPlain(inf.stemElement)}).`);
  if (inf.branchValence < 0) out.push(`Its ${elementPlain(inf.branchElement)} branch runs against your chart.`);
  return out;
}

function buildCautions(inf: PillarInfluence): string[] {
  return inf.relations
    .filter((r) => r.type === "clash")
    .map((r) => {
      const emphasis = r.withPosition === "day" ? " — your Day Pillar, so felt personally" : r.withPosition === "year" ? " — your year branch (生肖)" : "";
      return `Clashes your ${r.withPosition} branch (${r.withBranch})${emphasis}: a year/period of change, friction or movement on that axis.`;
    });
}

const VALENCE_LEAD: Record<PeriodValence, string> = {
  supportive: "A broadly supportive",
  mixed: "A mixed",
  challenging: "A demanding",
  neutral: "A quiet",
};

function summarize(kind: PeriodKind, label: string, gz: GanZhi, span: PeriodSummary["span"], chart: BaziChart): PeriodSummary {
  const influence = pillarInfluence(chart, gz);
  const valence = valenceFrom(scoreInfluence(influence), influence.relations.length > 0);
  const noun = kind === "luck" ? "luck decade" : kind === "year" ? "year" : "month";
  const tailwinds = buildTailwinds(influence);
  const headwinds = buildHeadwinds(influence);
  const cautions = buildCautions(influence);
  const themeBits: string[] = [];
  if (tailwinds.length) themeBits.push("supports where your chart is already favoured");
  if (cautions.length) themeBits.push("with a clash to watch");
  else if (headwinds.length) themeBits.push("with some elemental headwind");
  const headline =
    `${VALENCE_LEAD[valence]} ${noun} (${gz.hanzi}, ${TEN_GOD_LABEL[influence.stemTenGod]})` +
    (themeBits.length ? ` — ${themeBits.join(", ")}.` : ".");
  return { kind, label, ganzhi: gz.hanzi, span, influence, valence, headline, tailwinds, headwinds, cautions };
}

// ── Full report ──────────────────────────────────────────────────────────────

export interface PeriodsReport {
  targetYear: number;
  disclaimer: string;
  /** The luck decade active during the target year (null if none covers it). */
  activeLuck: PeriodSummary | null;
  /** All luck decades, lightweight (for a life-arc strip). */
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
    ? summarize(
        "luck",
        `${luck.ganzhi.hanzi} (ages ${Math.round(luck.startAge)}–${Math.round(luck.endAge)})`,
        luck.ganzhi,
        null,
        chart,
      )
    : null;

  const luckPillars = (dayun?.pillars ?? []).map((p) => {
    const active = luck !== null && p.index === luck.index;
    const label = `${active ? "now · " : ""}${p.ganzhi.hanzi} (ages ${Math.round(p.startAge)}–${Math.round(p.endAge)})`;
    return summarize("luck", label, p.ganzhi, null, chart);
  });

  const yearGz = annualPillar(targetYear);
  const year = summarize("year", String(targetYear), yearGz, null, chart);

  const months = monthPillarsOfYear(targetYear).map((mp) =>
    summarize("month", `${mp.jieNameEn} (${mp.jieNameZh})`, mp.ganzhi, { startIso: mp.startIso, endIso: mp.endIso }, chart),
  );

  // Weave the three scales into one honest sentence.
  const parts: string[] = [];
  if (activeLuck) parts.push(`your ${activeLuck.ganzhi} luck decade is ${activeLuck.valence}`);
  parts.push(`${targetYear} (${year.ganzhi}) is ${year.valence}`);
  const clashCount = year.influence.relations.filter((r) => r.type === "clash").length + (activeLuck?.influence.relations.filter((r) => r.type === "clash").length ?? 0);
  const interaction =
    `Overall, ${parts.join(" and ")}` +
    (clashCount > 0
      ? ` — with ${clashCount} branch clash${clashCount > 1 ? "es" : ""} against your natal chart, so expect some movement or friction on those axes.`
      : ` — no major clash against your natal chart this year.`);

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
