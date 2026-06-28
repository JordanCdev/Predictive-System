/**
 * Layer 3 — Tong Shu / almanac rule pack (spec §6.7). Deterministic, cited,
 * table-driven day-selection facts for any candidate day:
 *   - 建除十二神 (12 Day Officers)
 *   - 黄道黑道十二神 (Yellow/Black-road day gods)
 *   - 日沖 (day clash) and 三煞 (three-killings direction)
 *   - personal Shen Sha overlay (Nobleman / Peach Blossom / Travelling Horse /
 *     harmonies / clash) keyed to the subject's chart.
 *
 * Interpretive WEIGHT of these overlays belongs to the decision policy; the
 * classics demote Shen Sha beneath structural logic (spec §6.4), so the engine
 * exposes them as weightable evidence, never hidden defaults.
 */

import {
  BRANCHES,
  GanZhi,
  STEMS,
  clashBranch,
  ganZhiFromIndex,
  mod,
} from "./symbols.ts";
import { dayGanzhiIndexFromCivilDate } from "./sexagenary.ts";
import { monthBranchIndexFromLongitude, solarLongitudeAtMillis } from "./astronomy.ts";

export type ActivityTag =
  | "open"
  | "marry"
  | "move"
  | "travel"
  | "contract"
  | "ground"
  | "medical"
  | "study"
  | "litigation"
  | "burial"
  | "capture"
  | "general";

export interface OfficerDef {
  nameZh: string;
  nameEn: string;
  good: ActivityTag[];
  bad: ActivityTag[];
  /** Baseline auspiciousness for general use, −10..+10. */
  base: number;
}

// 建除十二神, indexed 0..11 where 0 = 建 (Establish).
export const OFFICERS: OfficerDef[] = [
  { nameZh: "建", nameEn: "Establish", good: ["travel", "study", "contract", "open", "general"], bad: ["ground", "move", "medical"], base: 3 },
  { nameZh: "除", nameEn: "Remove", good: ["medical", "general"], bad: ["marry", "move"], base: 2 },
  { nameZh: "滿", nameEn: "Full", good: ["open", "contract", "travel"], bad: ["marry", "medical", "burial"], base: 2 },
  { nameZh: "平", nameEn: "Balance", good: ["general", "ground"], bad: [], base: 1 },
  { nameZh: "定", nameEn: "Stable", good: ["marry", "contract", "study", "open"], bad: ["travel", "litigation", "medical"], base: 4 },
  { nameZh: "執", nameEn: "Initiate", good: ["marry", "ground", "capture"], bad: ["open", "move", "contract"], base: 0 },
  { nameZh: "破", nameEn: "Destruction", good: ["medical"], bad: ["marry", "open", "move", "contract", "travel", "study", "general", "ground"], base: -10 },
  { nameZh: "危", nameEn: "Danger", good: [], bad: ["travel", "general"], base: -3 },
  { nameZh: "成", nameEn: "Success", good: ["open", "marry", "move", "travel", "study", "contract", "general"], bad: ["litigation"], base: 5 },
  { nameZh: "收", nameEn: "Receive", good: ["contract", "open", "study"], bad: ["burial", "medical"], base: 3 },
  { nameZh: "開", nameEn: "Open", good: ["open", "marry", "move", "travel", "study", "contract", "general"], bad: ["burial", "ground"], base: 5 },
  { nameZh: "閉", nameEn: "Close", good: ["burial", "ground"], bad: ["marry", "open", "travel", "medical"], base: -2 },
];

// 黄道黑道十二神 from 青龍 (index 0). Yellow = auspicious.
export const DAY_GODS: { nameZh: string; nameEn: string; yellow: boolean }[] = [
  { nameZh: "青龍", nameEn: "Green Dragon", yellow: true },
  { nameZh: "明堂", nameEn: "Bright Hall", yellow: true },
  { nameZh: "天刑", nameEn: "Heaven's Punishment", yellow: false },
  { nameZh: "朱雀", nameEn: "Vermilion Bird", yellow: false },
  { nameZh: "金匱", nameEn: "Golden Coffer", yellow: true },
  { nameZh: "天德", nameEn: "Heaven's Virtue", yellow: true },
  { nameZh: "白虎", nameEn: "White Tiger", yellow: false },
  { nameZh: "玉堂", nameEn: "Jade Hall", yellow: true },
  { nameZh: "天牢", nameEn: "Heaven's Jail", yellow: false },
  { nameZh: "玄武", nameEn: "Black Tortoise", yellow: false },
  { nameZh: "司命", nameEn: "Director of Fate", yellow: true },
  { nameZh: "勾陳", nameEn: "Hooked Array", yellow: false },
];

const SANSHA_DIRECTION: Record<string, string> = {
  "8,0,4": "South (巳午未)", // 申子辰 day → 煞南
  "2,6,10": "North (亥子丑)", // 寅午戌 → 煞北
  "5,9,1": "East (寅卯辰)", // 巳酉丑 → 煞東
  "11,3,7": "West (申酉戌)", // 亥卯未 → 煞西
};

function branchGroupKey(branchIndex: number): string {
  for (const key of Object.keys(SANSHA_DIRECTION)) {
    if (key.split(",").map(Number).includes(branchIndex)) return key;
  }
  return "";
}

export interface TongShuDay {
  civil: { year: number; month: number; day: number };
  dayGanzhi: GanZhi;
  monthBranchIndex: number;
  officer: OfficerDef & { index: number };
  dayGod: { nameZh: string; nameEn: string; yellow: boolean; index: number };
  clashAnimal: string; // animal of the branch this day clashes
  clashBranchIndex: number;
  sanShaDirection: string;
  /** 四離 (day before a 二分二至) / 四絕 (day before a 四立) — "大事勿用". */
  fourBoundary: "si_li" | "si_jue" | null;
}

/**
 * 四離/四絕: the day immediately before one of the 8 season-pivot terms (the
 * four 立 = 四絕, the two 分 + two 至 = 四離). Those 8 terms sit at the 45°
 * multiples of solar longitude. A candidate day is a 四離/四絕 day when one of
 * those crossings falls on the NEXT civil day.
 * `solarInstantUtc` is local noon of the candidate day.
 */
export function fourBoundaryOfNextDay(solarInstantUtc: number): "si_li" | "si_jue" | null {
  const startNext = solarInstantUtc + 12 * 3600000; // local midnight starting the next day
  const endNext = solarInstantUtc + 36 * 3600000; // local midnight ending the next day
  const a = solarLongitudeAtMillis(startNext);
  const b = solarLongitudeAtMillis(endNext);
  const span = mod(b - a, 360); // Sun moves ~1°/day → at most one 45° boundary
  for (let k = 0; k < 8; k++) {
    const tgt = k * 45;
    const d = mod(tgt - a, 360);
    if (d >= 0 && d < span) {
      return tgt % 90 === 0 ? "si_li" : "si_jue"; // 0/90/180/270 = 二分二至; 45/135/225/315 = 四立
    }
  }
  return null;
}

/**
 * Compute the intrinsic almanac facts for a civil day. `solarInstantUtc`
 * should be a representative instant within the day (local noon) so the month
 * branch (節氣月) is correct.
 */
export function computeTongShuDay(
  civil: { year: number; month: number; day: number },
  solarInstantUtc: number,
): TongShuDay {
  const dayIndex = dayGanzhiIndexFromCivilDate(civil.year, civil.month, civil.day);
  const dayGanzhi = ganZhiFromIndex(dayIndex);
  const monthBranchIndex = monthBranchIndexFromLongitude(solarLongitudeAtMillis(solarInstantUtc));

  const officerIndex = mod(dayGanzhi.branch.index - monthBranchIndex, 12);
  const qinglong = mod(monthBranchIndex * 2 + 8, 12);
  const dayGodIndex = mod(dayGanzhi.branch.index - qinglong, 12);

  const clashIdx = clashBranch(dayGanzhi.branch.index);

  return {
    civil,
    dayGanzhi,
    monthBranchIndex,
    officer: { ...OFFICERS[officerIndex], index: officerIndex },
    dayGod: { ...DAY_GODS[dayGodIndex], index: dayGodIndex },
    clashAnimal: BRANCHES[clashIdx].animal,
    clashBranchIndex: clashIdx,
    sanShaDirection: SANSHA_DIRECTION[branchGroupKey(dayGanzhi.branch.index)] ?? "—",
    fourBoundary: fourBoundaryOfNextDay(solarInstantUtc),
  };
}

// --- Personal Shen Sha overlay ---------------------------------------------

const SIX_HARMONY: Record<number, number> = { 0: 1, 1: 0, 2: 11, 11: 2, 3: 10, 10: 3, 4: 9, 9: 4, 5: 8, 8: 5, 6: 7, 7: 6 };
const TRIPLE_GROUPS: number[][] = [
  [8, 0, 4], // 申子辰 water
  [2, 6, 10], // 寅午戌 fire
  [5, 9, 1], // 巳酉丑 metal
  [11, 3, 7], // 亥卯未 wood
];
const PEACH_BLOSSOM: Record<string, number> = { "8,0,4": 9, "2,6,10": 3, "5,9,1": 6, "11,3,7": 0 };
const TRAVEL_HORSE: Record<string, number> = { "8,0,4": 2, "2,6,10": 8, "5,9,1": 11, "11,3,7": 5 };
// 天乙貴人 nobleman branches keyed by stem index.
const NOBLEMAN: Record<number, number[]> = {
  0: [1, 7], 4: [1, 7], 6: [1, 7], // 甲戊庚 → 丑未
  1: [0, 8], 5: [0, 8], // 乙己 → 子申
  2: [11, 9], 3: [11, 9], // 丙丁 → 亥酉
  8: [3, 5], 9: [3, 5], // 壬癸 → 卯巳
  7: [2, 6], // 辛 → 寅午
};

function groupKeyOf(branchIndex: number): string {
  return (TRIPLE_GROUPS.find((g) => g.includes(branchIndex)) ?? []).join(",");
}

export interface PersonalShenSha {
  tags: { code: string; nameZh: string; nameEn: string; polarity: "good" | "bad" | "neutral"; note: string }[];
}

/**
 * Relationship of a candidate day branch (+ stem) to the subject's chart.
 * Uses the subject's day branch and year branch (zodiac) as references.
 */
export function personalShenSha(
  candidate: GanZhi,
  subjectDayBranch: number,
  subjectYearBranch: number,
): PersonalShenSha {
  const tags: PersonalShenSha["tags"] = [];
  const cb = candidate.branch.index;

  // Clashes (沖) — significant negatives.
  if (cb === clashBranch(subjectDayBranch)) {
    tags.push({ code: "clash_day", nameZh: "沖日柱", nameEn: "Clashes your Day Pillar", polarity: "bad", note: "Day branch directly clashes your Day Master branch." });
  }
  if (cb === clashBranch(subjectYearBranch)) {
    tags.push({ code: "clash_zodiac", nameZh: "沖生肖", nameEn: "Clashes your zodiac", polarity: "bad", note: "Day branch clashes your birth-year animal (犯沖)." });
  }

  // Harmonies (合).
  if (SIX_HARMONY[subjectDayBranch] === cb) {
    tags.push({ code: "six_harmony", nameZh: "六合日", nameEn: "Six Harmony with you", polarity: "good", note: "Day branch forms a Six Harmony with your Day Pillar (cooperative)." });
  }
  const subjGroup = groupKeyOf(subjectDayBranch);
  if (subjGroup && groupKeyOf(cb) === subjGroup && cb !== subjectDayBranch) {
    tags.push({ code: "triple_harmony", nameZh: "三合日", nameEn: "Triple Harmony with you", polarity: "good", note: "Day branch joins your Day Pillar's Three-Harmony group (supportive)." });
  }

  // Nobleman (天乙貴人) by subject day stem — here we pass via stem in candidate? No:
  // nobleman is the subject's, checked against candidate branch.
  // (subject stem handled by caller-supplied set below.)

  // Peach Blossom / Travelling Horse keyed to subject groups.
  if (subjGroup && PEACH_BLOSSOM[subjGroup] === cb) {
    tags.push({ code: "peach_blossom", nameZh: "桃花日", nameEn: "Peach Blossom day", polarity: "neutral", note: "Romance/charisma star active — good for social, caution for discretion." });
  }
  if (subjGroup && TRAVEL_HORSE[subjGroup] === cb) {
    tags.push({ code: "travelling_horse", nameZh: "驛馬日", nameEn: "Travelling Horse day", polarity: "neutral", note: "Movement star — favours travel, relocation, momentum." });
  }

  return { tags };
}

/** Nobleman check needs the subject's day stem. */
export function isNoblemanDay(candidateBranch: number, subjectDayStem: number): boolean {
  return (NOBLEMAN[subjectDayStem] ?? []).includes(candidateBranch);
}

export { STEMS };
