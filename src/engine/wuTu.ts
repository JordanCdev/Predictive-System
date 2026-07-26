/**
 * 烏兔 — 天元烏兔經 / 烏兔太陽擇日法, the nine-star day method attributed to
 * 楊筠松 (Yang Yun-song, 唐).
 *
 * ─── WHAT 烏兔 MEANS (the thing everyone gets wrong) ─────────────────────────
 *
 * 烏兔 is 日月 — sun and moon. 烏 is 金烏, the three-legged golden crow that
 * lives in the sun; 兔 is 玉兔, the jade rabbit that lives in the moon; the
 * pair is the standard classical kenning for the two luminaries. 烏 also
 * literally means "black", so a word-by-word English gloss of 烏兔 comes out
 * as "Black Rabbit" — which is where that odd English label in other almanacs
 * comes from. It is NOT an animal sign, it is NOT the day pillar's branch, and
 * it has nothing to do with 卯 the Rabbit. (The day pillar of 2026-07-25, the
 * date this module was verified against, is 庚子 — a Rat.)
 *
 * The method assigns each LUNAR day one of nine stars by flying the 洛書 nine
 * palaces. 太陽 sits in 艮8 and is the prize; practitioners hunt 太陽日 for
 * 修造 / 動土 / 安葬 / 開張, which is why the whole method is usually called
 * 烏兔太陽擇日法 rather than anything to do with rabbits.
 *
 * ─── WHAT THIS MODULE IS AND IS NOT ─────────────────────────────────────────
 *
 * DISPLAY ONLY. Nothing here reaches `recommendationScore`, the decision
 * kernel, or `calculationHash`. It is an almanac column shown beside the
 * reading, and it is labelled as one lineage's interpretation, not as fact
 * about the day.
 *
 * ENGINE PURITY. No network, no LLM, no `Date.now()`, no `Math.random()`, and
 * `lunar-javascript` is NOT imported — the two lunisolar numbers the method
 * needs (the sexagenary pillar of the lunar month's 朔日/初一, and the lunar
 * day number) are supplied by the CALLER, exactly as `meihuaCast` in
 * ./hexagram.ts takes its lunar date. That is also why leap months need no
 * special handling here: a 閏月 has its own 朔日 and is passed in like any
 * other month; this module never sees a month NUMBER, so it cannot mis-handle
 * one.
 *
 * ─── THE TWO 起日 LINEAGES (they disagree; we ship one and say so) ──────────
 *
 *   (a) 月朔-anchored — the 楊公 line as printed in 楊筠松擇日正宗（天元烏兔經）
 *       (霍斐然 preface). Anchor on the 卯 day preceding each lunar month's
 *       朔日. THIS IS WHAT THIS MODULE IMPLEMENTS. It needs no 節氣 data at
 *       all.
 *
 *   (b) 節氣-anchored — 「冬至坎宮起甲子，立春艮上震春分，立夏巽四順甲子，
 *       離宮夏至定逆輪」: count 甲子 from the 八節, 冬至→坎1 立春→艮8 春分→震3
 *       立夏→巽4 順行, 夏至→離9 立秋→坤2 秋分→兌7 立冬→乾6 逆行. It is a real,
 *       circulating lineage and it returns a DIFFERENT star for the same day
 *       (for 2026-07-25 it gives 火星 or 太陰 depending on whether you count
 *       from the 甲子 day or the 節氣 day — not 太陽). Not implemented; named
 *       in the UI so nobody mistakes lineage (a) for a universal answer.
 *
 * ─── THE ALGORITHM (口訣 and source) ────────────────────────────────────────
 *
 * 「昔日楊公造命法，斗勺七政侯天星。先看朔前是何卯，攜來加入子宮乘」
 *
 *   1. 朔前第一卯日 — walk back from 初一 to the first 卯 day. It is always one
 *      of 乙卯 丁卯 己卯 辛卯 癸卯; the sources call these 「六卯」 although the
 *      sexagenary cycle contains five 卯 pillars, not six (卯 is a 陰 branch
 *      and pairs only with the five 陰 stems). Call it A, n days before 初一.
 *   2. 截法圖 — put A on 子 and advance ONE BRANCH PER DAY, 陽干順行 / 陰干逆行
 *      by A's OWN stem, arriving after n days at the branch 初一 occupies.
 *      That branch maps to a palace through the 後天八卦 24-mountain map.
 *   3. 排山圖 — from that palace, fly the nine palaces ONE PALACE PER DAY,
 *      順 or 逆 by 初一's OWN stem. 太陽 therefore recurs every 9 days.
 *
 * 陽 (順行) = 甲 己 丁 壬 戊 癸;  陰 (逆行) = 乙 庚 丙 辛.
 * 「甲己丁壬戊癸陽，排山順布大吉祥；乙庚丙辛陰乾位，逆布排來用太陽。」
 * NB this is NOT the ordinary 陽干/陰干 split (甲丙戊庚壬) — do not "fix" it.
 *
 * ─── AN AMBIGUITY THAT WAS RESOLVED, AND ONE THAT WAS NOT ───────────────────
 *
 * RESOLVED — which stem sets which direction. Secondary sources split: one
 * reading takes BOTH directions from the 卯 day's stem; the other (sohu
 * 588740512, stated explicitly) takes step 2 from the 卯 day's stem and step 3
 * from 初一's OWN stem. Only the second reproduces the published 太陽值日
 * table's 12-member row with exact set equality; the first splits that row
 * 6/6. This module uses the second. Both agree on 2026-07-25, so the anchor
 * date alone would not have settled it.
 *
 * NOT FULLY PINNED — the branch→palace map is the ordinary 後天八卦
 * 24-mountain assignment, and the published table rows directly validate
 * 卯→震3, 辰/巳→巽4, 丑/寅→艮8, while the 2026-07-25 anchor validates 戌→乾6.
 * The remaining four (子→坎1, 午→離9, 未/申→坤2, 酉→兌7) are uncontroversial
 * and are entailed by the 9-group partition matching, but no single worked
 * example in the sources pins them individually. Flagged rather than glossed —
 * and exported as `WU_TU_BRANCH_PALACE_CAVEAT` so the card discloses it to the
 * reader instead of the admission living only in this comment.
 *
 * NOT SHIPPED — 烏兔時 (the hour layer) and 太陽到山到向 (the 24-mountain
 * directional layer). The hour 起例 「甲己起坎丁壬離，戊癸中宮起子時，
 * 丙辛起震乙庚兌」 is well attested but its DIRECTION is contradictory across
 * sources and no worked example with an explicit hour was found. Absent rather
 * than guessed.
 *
 * SOURCES: 楊筠松擇日正宗《天元烏兔經》 (霍斐然 preface; 誠易堂 copy carrying the
 * 太陽值日 table), 玄龍子《烏兔擇日推算過程》, 《烏兔太陽擇日法》 (the 壬寅年五月
 * worked example), 《什麼是烏兔擇日》 (sohu 588740512, the direction rule).
 */

import { BRANCHES, GanZhi, ganZhiFromIndex, mod, STEMS } from "./symbols.ts";

// ── the nine stars ──────────────────────────────────────────────────────────

export type WuTuStarId =
  | "mercury" // 坎1 水星
  | "moon" // 坤2 太陰
  | "jupiter" // 震3 木星
  | "ketu" // 巽4 計都
  | "saturn" // 中5 土星
  | "rahu" // 乾6 羅睺
  | "venus" // 兌7 金星
  | "sun" // 艮8 太陽
  | "mars"; // 離9 火星

export interface WuTuStar {
  /** 洛書 palace, 1..9. */
  palace: number;
  /** The palace's trigram name — 坎 坤 震 巽 中 乾 兌 艮 離. */
  palaceZh: string;
  id: WuTuStarId;
  nameZh: string;
  /** The star's own name, not a reading: 太陽 = Sun, 計都 = Ketu, … */
  nameEn: string;
  /** 吉 in this lineage: 太陽 太陰 金星 木星 水星. 凶: 土星 火星 羅睺 計都. */
  auspicious: boolean;
  /** 1 = 太陽 (the sought one) … 5 = 水星; null for the four 凶 stars. */
  rank: number | null;
}

/** 九星譜, palace order 1..9. Agreed verbatim by every source consulted. */
export const WU_TU_STARS: readonly WuTuStar[] = [
  { palace: 1, palaceZh: "坎", id: "mercury", nameZh: "水星", nameEn: "Mercury", auspicious: true, rank: 5 },
  { palace: 2, palaceZh: "坤", id: "moon", nameZh: "太陰", nameEn: "Moon", auspicious: true, rank: 2 },
  { palace: 3, palaceZh: "震", id: "jupiter", nameZh: "木星", nameEn: "Jupiter", auspicious: true, rank: 4 },
  { palace: 4, palaceZh: "巽", id: "ketu", nameZh: "計都", nameEn: "Ketu", auspicious: false, rank: null },
  { palace: 5, palaceZh: "中", id: "saturn", nameZh: "土星", nameEn: "Saturn", auspicious: false, rank: null },
  { palace: 6, palaceZh: "乾", id: "rahu", nameZh: "羅睺", nameEn: "Rahu", auspicious: false, rank: null },
  { palace: 7, palaceZh: "兌", id: "venus", nameZh: "金星", nameEn: "Venus", auspicious: true, rank: 3 },
  { palace: 8, palaceZh: "艮", id: "sun", nameZh: "太陽", nameEn: "Sun", auspicious: true, rank: 1 },
  { palace: 9, palaceZh: "離", id: "mars", nameZh: "火星", nameEn: "Mars", auspicious: false, rank: null },
];

export const SUN_PALACE = 8; // 艮八太陽星吉
export const MOON_PALACE = 2; // 坤二太陰星吉

export function wuTuStarOfPalace(palace: number): WuTuStar {
  const s = WU_TU_STARS[palace - 1];
  if (!s) throw new RangeError(`洛書 palace out of range (1..9): ${palace}`);
  return s;
}

// ── the two directional rules ───────────────────────────────────────────────

/** 陽 stems for this method: 甲 己 丁 壬 戊 癸 → 順行. Everything else (乙 庚
 *  丙 辛) is 陰 → 逆行. Deliberately NOT the ordinary 陽干 set. */
const WU_TU_YANG_STEMS = new Set(["甲", "己", "丁", "壬", "戊", "癸"]);

function flightSign(stemHanzi: string): 1 | -1 {
  return WU_TU_YANG_STEMS.has(stemHanzi) ? 1 : -1;
}

/** 後天八卦 24-mountain branch → palace. See the "NOT FULLY PINNED" note. */
const BRANCH_PALACE: readonly number[] = [
  1, // 子 → 坎1
  8, // 丑 → 艮8
  8, // 寅 → 艮8
  3, // 卯 → 震3
  4, // 辰 → 巽4
  4, // 巳 → 巽4
  9, // 午 → 離9
  2, // 未 → 坤2
  2, // 申 → 坤2
  7, // 酉 → 兌7
  6, // 戌 → 乾6
  6, // 亥 → 乾6
];

const MAO_BRANCH_INDEX = 3; // 卯

// ── the month ───────────────────────────────────────────────────────────────

export interface WuTuMonth {
  /** 朔日 — the sexagenary pillar of the lunar month's 初一. */
  shuo: GanZhi;
  /** 朔前第一卯日 — the anchor, one of the 六卯. */
  anchorMao: GanZhi;
  /** How many days before 初一 the anchor falls (1..12). */
  anchorDaysBefore: number;
  /** 截法圖 direction, from the ANCHOR's stem: 1 = 順, -1 = 逆. */
  countDirection: 1 | -1;
  /** The 24-mountain branch 初一 lands on after the 12-branch count. */
  firstDayBranchIndex: number;
  /** The palace 初一 occupies — the seed of the 9-palace flight. */
  firstDayPalace: number;
  /** 排山圖 direction, from 初一's OWN stem: 1 = 順, -1 = 逆. */
  flightDirection: 1 | -1;
  /** Palace per lunar day; index 0 = 初一 … index 29 = 三十. */
  palaces: readonly number[];
  /** 太陽日 (艮8) as lunar day numbers, ascending. */
  sunDays: readonly number[];
  /** 太陰日 (坤2) as lunar day numbers, ascending. */
  moonDays: readonly number[];
}

/**
 * The whole lunar month's star flight, from its 朔日 pillar alone.
 *
 * `daysInMonth` (29 for a 小月, 30 for a 大月) only truncates the output: in a
 * 29-day month there is no 三十, so a day-30 太陽 entry must be dropped rather
 * than displayed. It defaults to 30 because the derivation itself is
 * independent of month length.
 *
 * CALLERS THAT DISPLAY `sunDays` OR `moonDays` MUST PASS THE REAL LENGTH. Both
 * lists are truncated by this parameter and by nothing else, so taking the
 * default in a 小月 prints 三十 — a day that does not exist in that month. If
 * the length is genuinely unknown, drop day 30 from the displayed list rather
 * than assert it.
 */
export function wuTuMonth(shuoGanzhiIndex: number, daysInMonth = 30): WuTuMonth {
  if (!Number.isInteger(shuoGanzhiIndex)) {
    throw new RangeError(`朔日 ganzhi index must be an integer: ${shuoGanzhiIndex}`);
  }
  if (daysInMonth !== 29 && daysInMonth !== 30) {
    throw new RangeError(`a lunar month has 29 or 30 days, got ${daysInMonth}`);
  }

  const shuo = ganZhiFromIndex(shuoGanzhiIndex);

  // STEP 1 — 「先看朔前是何卯」. n = 12 when 初一 is itself a 卯 day; walking a
  // full 12 back lands on the previous 卯, and a 12-branch count returns to 子
  // either way, so the two readings coincide.
  let anchorDaysBefore = mod(shuo.branch.index - MAO_BRANCH_INDEX, 12);
  if (anchorDaysBefore === 0) anchorDaysBefore = 12;
  const anchorMao = ganZhiFromIndex(shuo.index - anchorDaysBefore);

  // STEP 2 — 截法圖: the anchor sits on 子; one BRANCH per day to 初一.
  const countDirection = flightSign(anchorMao.stem.hanzi);
  const firstDayBranchIndex = mod(countDirection * anchorDaysBefore, 12);
  const firstDayPalace = BRANCH_PALACE[firstDayBranchIndex];

  // STEP 3 — 排山圖: one PALACE per day from 初一, direction by 初一's own stem.
  const flightDirection = flightSign(shuo.stem.hanzi);
  const palaces: number[] = [];
  for (let d = 1; d <= daysInMonth; d += 1) {
    palaces.push(mod(firstDayPalace - 1 + (d - 1) * flightDirection, 9) + 1);
  }

  const daysWith = (palace: number) =>
    palaces.map((p, i) => (p === palace ? i + 1 : 0)).filter((d) => d > 0);

  return {
    shuo,
    anchorMao,
    anchorDaysBefore,
    countDirection,
    firstDayBranchIndex,
    firstDayPalace,
    flightDirection,
    palaces,
    sunDays: daysWith(SUN_PALACE),
    moonDays: daysWith(MOON_PALACE),
  };
}

// ── the day ─────────────────────────────────────────────────────────────────

export interface WuTuDayStar {
  id: WuTuStarId;
  /** The star itself, for callers that want the whole record. */
  star: WuTuStar;
  nameZh: string;
  nameEn: string;
  /** 洛書 palace 1..9. */
  palace: number;
  palaceZh: string;
  auspicious: boolean;
  rank: number | null;
  /** 太陽日 — the day the method exists to find. */
  isSunDay: boolean;
  /** 太陰日 — second best. */
  isMoonDay: boolean;
  /** Echoed back so a caller rendering a row cannot mismatch its label. */
  lunarDayNumber: number;
}

/**
 * The 烏兔 star of one lunar day.
 *
 * @param lunarMonthFirstDayGanzhiIndex 0..59 sexagenary index of the lunar
 *   month's 初一 (朔日) — the caller reads it from the lunisolar calendar. It
 *   must use the same 子時 day boundary as the rest of the app, so that "初一's
 *   ganzhi" and "today's ganzhi" are the same kind of thing.
 * @param lunarDayNumber 1..30, the lunar day within that same month (a leap
 *   month counts its own days from its own 朔日).
 */
export function wuTuDayStar(
  lunarMonthFirstDayGanzhiIndex: number,
  lunarDayNumber: number,
): WuTuDayStar {
  if (!Number.isInteger(lunarDayNumber) || lunarDayNumber < 1 || lunarDayNumber > 30) {
    throw new RangeError(`lunar day out of range (1..30): ${lunarDayNumber}`);
  }
  const month = wuTuMonth(lunarMonthFirstDayGanzhiIndex, 30);
  const palace = month.palaces[lunarDayNumber - 1];
  const star = wuTuStarOfPalace(palace);
  return {
    id: star.id,
    star,
    nameZh: star.nameZh,
    nameEn: star.nameEn,
    palace: star.palace,
    palaceZh: star.palaceZh,
    auspicious: star.auspicious,
    rank: star.rank,
    isSunDay: palace === SUN_PALACE,
    isMoonDay: palace === MOON_PALACE,
    lunarDayNumber,
  };
}

/**
 * The 朔日 pillar of the month a day belongs to, from that DAY's own pillar and
 * its lunar day number: the sexagenary cycle is continuous, so 初一 is simply
 * `lunarDayNumber - 1` days back. Saves the caller a second calendar lookup —
 * and keeps the two inputs consistent by construction, since both come from
 * the same day.
 */
export function shuoIndexFromDay(dayGanzhiIndex: number, lunarDayNumber: number): number {
  if (!Number.isInteger(lunarDayNumber) || lunarDayNumber < 1 || lunarDayNumber > 30) {
    throw new RangeError(`lunar day out of range (1..30): ${lunarDayNumber}`);
  }
  return mod(dayGanzhiIndex - (lunarDayNumber - 1), 60);
}

// ── the published 太陽值日 table, kept as a golden fixture ───────────────────

/**
 * The 太陽值日 / 太陰值日 table as printed in the 天元烏兔經 text, keyed by the
 * 朔日 pillar. Sixty rows; day 30 applies only in a 大月.
 *
 * It is transcribed here rather than computed BECAUSE it is the evidence: the
 * test suite regenerates all sixty rows from `wuTuMonth` and asserts exact
 * equality, so a refactor that breaks the 卯 anchor, the 陽 stem set
 * {甲己丁壬戊癸}, or the "step 3 uses 初一's own stem" rule fails immediately
 * against the source rather than silently changing the almanac.
 *
 * Two of these rows are directly attested in the printed table with exact set
 * equality — the 12-member 初五/十四/廿三 group and the 10-member
 * 初一/初十/十九/廿八 group — and the derivation partitions the 60 朔 pillars
 * into exactly 9 groups, matching the source's 「9组」.
 */
export interface WuTuTableRow {
  /** 朔日 pillar, e.g. "己丑". */
  shuo: string;
  sunDays: readonly number[];
  moonDays: readonly number[];
}

export const WU_TU_PUBLISHED_TABLE: readonly WuTuTableRow[] = [
  { shuo: "甲子", sunDays: [6, 15, 24], moonDays: [9, 18, 27] },
  { shuo: "乙丑", sunDays: [1, 10, 19, 28], moonDays: [7, 16, 25] },
  { shuo: "丙寅", sunDays: [1, 10, 19, 28], moonDays: [7, 16, 25] },
  { shuo: "丁卯", sunDays: [8, 17, 26], moonDays: [2, 11, 20, 29] },
  { shuo: "戊辰", sunDays: [1, 10, 19, 28], moonDays: [4, 13, 22] },
  { shuo: "己巳", sunDays: [1, 10, 19, 28], moonDays: [4, 13, 22] },
  { shuo: "庚午", sunDays: [5, 14, 23], moonDays: [2, 11, 20, 29] },
  { shuo: "辛未", sunDays: [6, 15, 24], moonDays: [3, 12, 21, 30] },
  { shuo: "壬申", sunDays: [5, 14, 23], moonDays: [8, 17, 26] },
  { shuo: "癸酉", sunDays: [9, 18, 27], moonDays: [3, 12, 21, 30] },
  { shuo: "甲戌", sunDays: [7, 16, 25], moonDays: [1, 10, 19, 28] },
  { shuo: "乙亥", sunDays: [4, 13, 22], moonDays: [1, 10, 19, 28] },
  { shuo: "丙子", sunDays: [9, 18, 27], moonDays: [6, 15, 24] },
  { shuo: "丁丑", sunDays: [3, 12, 21, 30], moonDays: [6, 15, 24] },
  { shuo: "戊寅", sunDays: [3, 12, 21, 30], moonDays: [6, 15, 24] },
  { shuo: "己卯", sunDays: [8, 17, 26], moonDays: [2, 11, 20, 29] },
  { shuo: "庚辰", sunDays: [1, 10, 19, 28], moonDays: [7, 16, 25] },
  { shuo: "辛巳", sunDays: [1, 10, 19, 28], moonDays: [7, 16, 25] },
  { shuo: "壬午", sunDays: [6, 15, 24], moonDays: [9, 18, 27] },
  { shuo: "癸未", sunDays: [5, 14, 23], moonDays: [8, 17, 26] },
  { shuo: "甲申", sunDays: [5, 14, 23], moonDays: [8, 17, 26] },
  { shuo: "乙酉", sunDays: [2, 11, 20, 29], moonDays: [8, 17, 26] },
  { shuo: "丙戌", sunDays: [4, 13, 22], moonDays: [1, 10, 19, 28] },
  { shuo: "丁亥", sunDays: [7, 16, 25], moonDays: [1, 10, 19, 28] },
  { shuo: "戊子", sunDays: [2, 11, 20, 29], moonDays: [5, 14, 23] },
  { shuo: "己丑", sunDays: [3, 12, 21, 30], moonDays: [6, 15, 24] }, // 丙午年六月
  { shuo: "庚寅", sunDays: [8, 17, 26], moonDays: [5, 14, 23] },
  { shuo: "辛卯", sunDays: [3, 12, 21, 30], moonDays: [9, 18, 27] },
  { shuo: "壬辰", sunDays: [3, 12, 21, 30], moonDays: [6, 15, 24] },
  { shuo: "癸巳", sunDays: [3, 12, 21, 30], moonDays: [6, 15, 24] },
  { shuo: "甲午", sunDays: [2, 11, 20, 29], moonDays: [5, 14, 23] },
  { shuo: "乙未", sunDays: [4, 13, 22], moonDays: [1, 10, 19, 28] },
  { shuo: "丙申", sunDays: [4, 13, 22], moonDays: [1, 10, 19, 28] },
  { shuo: "丁酉", sunDays: [9, 18, 27], moonDays: [3, 12, 21, 30] },
  { shuo: "戊戌", sunDays: [5, 14, 23], moonDays: [8, 17, 26] },
  { shuo: "己亥", sunDays: [5, 14, 23], moonDays: [8, 17, 26] },
  { shuo: "庚子", sunDays: [5, 14, 23], moonDays: [2, 11, 20, 29] },
  { shuo: "辛丑", sunDays: [1, 10, 19, 28], moonDays: [7, 16, 25] },
  { shuo: "壬寅", sunDays: [1, 10, 19, 28], moonDays: [4, 13, 22] },
  { shuo: "癸卯", sunDays: [8, 17, 26], moonDays: [2, 11, 20, 29] },
  { shuo: "甲辰", sunDays: [1, 10, 19, 28], moonDays: [4, 13, 22] },
  { shuo: "乙巳", sunDays: [1, 10, 19, 28], moonDays: [7, 16, 25] },
  { shuo: "丙午", sunDays: [5, 14, 23], moonDays: [2, 11, 20, 29] },
  { shuo: "丁未", sunDays: [5, 14, 23], moonDays: [8, 17, 26] },
  { shuo: "戊申", sunDays: [5, 14, 23], moonDays: [8, 17, 26] },
  { shuo: "己酉", sunDays: [9, 18, 27], moonDays: [3, 12, 21, 30] },
  { shuo: "庚戌", sunDays: [4, 13, 22], moonDays: [1, 10, 19, 28] },
  { shuo: "辛亥", sunDays: [4, 13, 22], moonDays: [1, 10, 19, 28] },
  { shuo: "壬子", sunDays: [2, 11, 20, 29], moonDays: [5, 14, 23] },
  { shuo: "癸丑", sunDays: [3, 12, 21, 30], moonDays: [6, 15, 24] },
  { shuo: "甲寅", sunDays: [3, 12, 21, 30], moonDays: [6, 15, 24] },
  { shuo: "乙卯", sunDays: [3, 12, 21, 30], moonDays: [9, 18, 27] },
  { shuo: "丙辰", sunDays: [8, 17, 26], moonDays: [5, 14, 23] },
  { shuo: "丁巳", sunDays: [3, 12, 21, 30], moonDays: [6, 15, 24] },
  { shuo: "戊午", sunDays: [2, 11, 20, 29], moonDays: [5, 14, 23] },
  { shuo: "己未", sunDays: [7, 16, 25], moonDays: [1, 10, 19, 28] },
  { shuo: "庚申", sunDays: [4, 13, 22], moonDays: [1, 10, 19, 28] },
  { shuo: "辛酉", sunDays: [2, 11, 20, 29], moonDays: [8, 17, 26] },
  { shuo: "壬戌", sunDays: [5, 14, 23], moonDays: [8, 17, 26] },
  { shuo: "癸亥", sunDays: [5, 14, 23], moonDays: [8, 17, 26] },
];

// ── the honesty payload the UI renders ──────────────────────────────────────

/** The alternative 起日 lineage, named so the shipped one is never mistaken
 *  for the only one. Data, not prose, so the UI cannot drift from the module. */
export const WU_TU_ALTERNATE_LINEAGE = {
  shippedNameZh: "月朔起例",
  shippedNameEn: "new-moon anchored",
  shippedSource: "楊筠松擇日正宗《天元烏兔經》",
  alternateNameZh: "節氣起例",
  alternateNameEn: "solar-term anchored",
  alternateMnemonic: "冬至坎宮起甲子，立春艮上震春分，立夏巽四順甲子，離宮夏至定逆輪",
  /** Stated plainly: the fork changes the answer, it is not a notation detail. */
  disagrees: true,
} as const;

/**
 * How well the 24-mountain branch→palace map above is actually evidenced — the
 * "NOT FULLY PINNED" admission at the top of this module, as data the card can
 * render. Four of the nine palace assignments are entailed by the published
 * table rather than shown by a worked example in the sources read; saying so is
 * the difference between a documented gap and a hidden one.
 *
 * `attested` and `entailed` together cover all twelve branches exactly once.
 */
export interface WuTuBranchPalaceGroup {
  branchesZh: readonly string[];
  palace: number;
  palaceZh: string;
}

export const WU_TU_BRANCH_PALACE_CAVEAT = {
  mapNameZh: "後天八卦二十四山",
  /** Pinned by a published 太陽值日 row or by the 2026-07-25 anchor directly. */
  attested: [
    { branchesZh: ["丑", "寅"], palace: 8, palaceZh: "艮" },
    { branchesZh: ["卯"], palace: 3, palaceZh: "震" },
    { branchesZh: ["辰", "巳"], palace: 4, palaceZh: "巽" },
    { branchesZh: ["戌", "亥"], palace: 6, palaceZh: "乾" },
  ],
  /** Uncontroversial, and forced by the 9-group partition matching the source's
   *  「9组」 — but no single worked example in the sources read pins them. */
  entailed: [
    { branchesZh: ["子"], palace: 1, palaceZh: "坎" },
    { branchesZh: ["午"], palace: 9, palaceZh: "離" },
    { branchesZh: ["未", "申"], palace: 2, palaceZh: "坤" },
    { branchesZh: ["酉"], palace: 7, palaceZh: "兌" },
  ],
  /** False: this app has NOT checked these four against a primary text. */
  entailedVerifiedAgainstPrimarySource: false,
} as const satisfies {
  mapNameZh: string;
  attested: readonly WuTuBranchPalaceGroup[];
  entailed: readonly WuTuBranchPalaceGroup[];
  entailedVerifiedAgainstPrimarySource: boolean;
};

/** The literal gloss, for the copy that explains the odd English name. */
export const WU_TU_NAME_GLOSS = {
  zh: "烏兔",
  crow: { zh: "烏", meaning: "the golden crow in the sun — and literally 'black'" },
  rabbit: { zh: "兔", meaning: "the jade rabbit in the moon" },
  together: "sun and moon",
} as const;

/** Stems in this method's 陽 set, exported for the test that pins them. */
export const WU_TU_YANG_STEM_HANZI: readonly string[] = STEMS.map((s) => s.hanzi).filter((h) =>
  WU_TU_YANG_STEMS.has(h),
);

/** The only pillars a 朔前第一卯日 can be: 乙卯 丁卯 己卯 辛卯 癸卯. The sources
 *  call them 「六卯」, but there are five — 卯 is a 陰 branch and pairs only with
 *  the five 陰 stems. Kept as five; the name in the texts is not evidence for a
 *  sixth. */
export const MAO_PILLARS: readonly string[] = STEMS.filter((s) => s.yinYang === "yin").map(
  (s) => s.hanzi + BRANCHES[MAO_BRANCH_INDEX].hanzi,
);
