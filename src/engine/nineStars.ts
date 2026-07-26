/**
 * 日家奇門 九星 — the Day Qi Men Nine Stars (also circulated as 太乙九星).
 *
 * ─── WHAT THIS MODULE IS ─────────────────────────────────────────────────────
 *
 * A DIRECTIONAL day-selection layer: nine named stars rotate through the nine
 * 洛書 palaces, one palace per day, and each palace's star carries a 吉/中平/凶
 * verdict for travelling or moving in that direction today. Eight of the nine
 * palaces are compass directions; the ninth is 中宮, the centre, which has no
 * direction — so exactly one star each day is directionless. Any wheel that
 * shows eight stars is showing eight of NINE.
 *
 * Roster, in the doctrinally fixed order (this order must never be permuted):
 *   太乙 摄提 轩辕 招摇 天符 青龙 咸池 太阴 天乙
 *
 * ─── WHAT THIS MODULE IS NOT ─────────────────────────────────────────────────
 *
 * - NOT 太乙神數. That system numbers its palaces differently (乾1 離2 艮3 震4
 *   中5 兌6 坤7 坎8 巽9) and its personnel are 文昌/始擊/主客大將/參將/定目/計神.
 *   The name 太乙 collides; nothing else does. Call this 日家奇門九星, never
 *   just "Tai Yi".
 * - NOT the 奇門 八神 (值符 螣蛇 太陰 六合 白虎 玄武 九地 九天).
 * - NOT the 時家 hour chart. The 天蓬…天英 aliases below are the same nine
 *   stars under their 奇門 names, but this placement rule is the DAY rule.
 * - NOT the other system that also goes by the name 日家奇門 — a full
 *   時家-style chart (地盤 六儀三奇 / 天盤 / 八門 / 八神, 拆補法) cast on the day
 *   pillar. Same name, different animal. Do not let the two bleed together.
 *
 * ─── SOURCES ─────────────────────────────────────────────────────────────────
 *
 * - 《奇門遁甲元靈經》 (reproduced in 欽定古今圖書集成·博物彙編·藝術典·卷713,
 *   so Qing-imperial provenance) — the nine 「門中見X」 verses verbatim, each
 *   naming the star's 北斗 alias, plus the 吉凶 classification. The line
 *   「五黃號天符」 pins 天符 to palace 5 and thereby fixes the whole
 *   ordinal→home-palace mapping.
 * - 《遁甲演義》卷一·日家奇門 — the placement 歌訣 「更有太乙九星位，冬至艮宮夏
 *   坤地，命起甲子順逆行，本日住宮太乙立」 and the 六甲 anchor table
 *   「甲子加艮，甲戌加離，甲申加坎，甲午加坤，甲辰加震，甲寅加巽」, which the
 *   陽遁 formula here reproduces exactly (pinned in tests/nineStars.test.ts).
 *
 * ─── TRUNCATION WE ARE OPEN ABOUT ────────────────────────────────────────────
 *
 * The classical verses are phrased 「門中見X」 — "when X is SEEN IN THE [Door's]
 * palace". The full doctrine reads the 九星 layer together with the 八門 layer
 * in the same palace. This module ships the star ring alone, which is half the
 * doctrine, not the doctrine. The UI says so; do not quietly drop that.
 *
 * ─── TWO NAMED AMBIGUITIES, NEITHER RESOLVED SILENTLY ────────────────────────
 *
 * 1. 吉凶 of 招摇 and 天符. Lineage A (遁甲演義 / 元靈經 stream) vs lineage B.
 *    Both are carried per star; A is the shipped default. The two are NOT
 *    peers: A is read from named texts, B is practitioner circulation we could
 *    neither trace to a primary text nor attribute to a school. That asymmetry
 *    is carried in `LINEAGE_SOURCING` and stated on screen next to the toggle.
 * 2. The anchor of the day count. Reading (i) counts from the 甲子 DAY; reading
 *    (ii) counts from the SOLSTICE DAY. (i) is shipped — it is the only one
 *    found stated in a source, and it is internally consistent with the 八門
 *    rule of the same system, which anchors 休門 at 坎1 on 甲子日. (ii) is
 *    computed alongside and returned as `alternateAnchor`, flagged
 *    `sourced: false`, so the UI can say the fork exists without pretending it
 *    is doctrine.
 * There is also a minor 遁-switch convention fork (正授 at the exact solstice vs
 * 超神接氣 at the nearest 甲子), exposed as `DunSwitchConvention`.
 *
 * ─── DISPLAY ONLY ────────────────────────────────────────────────────────────
 *
 * Nothing here reaches `recommendationScore`, the decision kernel, or
 * `calculationHash`. This module must never be imported by decision.ts.
 *
 * ─── DETERMINISM ─────────────────────────────────────────────────────────────
 *
 * No network, no LLM, no wall clock, no randomness. The lunar-calendar library
 * is NOT imported (it stays confined to src/engine/verification/**) — this
 * layer needs no lunar-calendar data at all. Solstice instants come from the
 * repo's own solar solver in ./astronomy.ts; no term table is hardcoded.
 */

import { ganZhiFromIndex, mod } from "./symbols.ts";
import { findSolarLongitudeCrossing, gregorianToJDN } from "./astronomy.ts";
import { dayGanzhiIndexFromCivilDate } from "./sexagenary.ts";

// ─────────────────────────────────────────────────────────────────────────────
// 1. PALACES (洛書 / 後天八卦)
// ─────────────────────────────────────────────────────────────────────────────

export type PalaceNumber = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

export type Direction8 = "N" | "NE" | "E" | "SE" | "S" | "SW" | "W" | "NW";

export interface PalaceDef {
  palace: PalaceNumber;
  /** 後天八卦 trigram seated in the palace; 中 for palace 5. */
  trigramZh: string;
  /** null for 中宮 — the centre is not a direction. */
  direction: Direction8 | null;
  directionEn: string | null;
  /** Compass bearing in degrees, N = 0, clockwise. null for 中宮. */
  bearingDeg: number | null;
}

/** Indexed 1..9 by palace number; index 0 is unused. */
export const PALACES: readonly PalaceDef[] = [
  { palace: 1, trigramZh: "—", direction: null, directionEn: null, bearingDeg: null }, // placeholder, never read
  { palace: 1, trigramZh: "坎", direction: "N", directionEn: "North", bearingDeg: 0 },
  { palace: 2, trigramZh: "坤", direction: "SW", directionEn: "Southwest", bearingDeg: 225 },
  { palace: 3, trigramZh: "震", direction: "E", directionEn: "East", bearingDeg: 90 },
  { palace: 4, trigramZh: "巽", direction: "SE", directionEn: "Southeast", bearingDeg: 135 },
  { palace: 5, trigramZh: "中", direction: null, directionEn: null, bearingDeg: null },
  { palace: 6, trigramZh: "乾", direction: "NW", directionEn: "Northwest", bearingDeg: 315 },
  { palace: 7, trigramZh: "兌", direction: "W", directionEn: "West", bearingDeg: 270 },
  { palace: 8, trigramZh: "艮", direction: "NE", directionEn: "Northeast", bearingDeg: 45 },
  { palace: 9, trigramZh: "離", direction: "S", directionEn: "South", bearingDeg: 180 },
] as const;

export function palaceDef(p: PalaceNumber): PalaceDef {
  return PALACES[p];
}

/** The eight directional palaces in compass order, N first, clockwise. */
export const RING_PALACE_ORDER: readonly PalaceNumber[] = [1, 8, 3, 4, 9, 2, 7, 6] as const;

// ─────────────────────────────────────────────────────────────────────────────
// 2. THE NINE STARS
// ─────────────────────────────────────────────────────────────────────────────

/** 吉 auspicious · 中平 neutral · 小吉小凶 slightly-of-both · 凶 inauspicious. */
export type VerdictZh = "吉" | "中平" | "小吉小凶" | "凶";

/** Colour/severity bucket, matching the app's existing valence vocabulary. */
export type Valence = "supportive" | "mixed" | "challenging";

export type LineageId = "A" | "B";

export function valenceOf(v: VerdictZh): Valence {
  if (v === "吉") return "supportive";
  if (v === "凶") return "challenging";
  return "mixed";
}

export const VERDICT_EN: Record<VerdictZh, string> = {
  吉: "auspicious",
  中平: "neutral",
  小吉小凶: "slightly good, slightly ill",
  凶: "inauspicious",
};

export interface NineStarDef {
  /** 1..9 in the fixed roster order. Doctrinally fixed — never re-sort. */
  ordinal: number;
  nameZh: string;
  /** Literal English rendering of the Chinese name. A label, not a reading. */
  nameEn: string;
  pinyin: string;
  /**
   * The palace this star is seated in when 太乙 is home in palace 1 — i.e. the
   * ordinal→palace mapping the 元靈經 fixes via 「五黃號天符」. These are HOME
   * palaces, NOT the day's positions; the whole roster rotates daily.
   */
  homePalace: PalaceNumber;
  /** 北斗 alias, given by the 元靈經 verse itself. */
  beidouZh: string;
  beidouEn: string;
  /** The same star's 奇門九星 name. */
  qimenZh: string;
  qimenEn: string;
  /** Lineage A (遁甲演義 / 元靈經 stream) — the shipped default. */
  verdictA: VerdictZh;
  /** Lineage B — differs from A on 招摇 and 天符 only. */
  verdictB: VerdictZh;
  /** The 「門中見X」 verse, verbatim from 《奇門遁甲元靈經》. */
  verseZh: string;
  /** Our translation of the verse. Interpretation, not doctrine — say so. */
  verseEn: string;
  /**
   * The line that speaks to travel/movement. `null` where there is none —
   * 青龙's verse has no travel clause and we do not invent one for it.
   */
  travelLineZh: string | null;
  /**
   * Where the travel line comes from. `"verse"` = it is a clause of `verseZh`
   * above, quoted verbatim. `"gloss"` = it circulates alongside the verse in
   * the 日家奇門 summaries but is not in the quoted verse text. The distinction
   * matters and the UI shows it.
   */
  travelLineSource: "verse" | "gloss" | null;
  /**
   * true when the "travel line" is really a general 百事 (all-affairs) clause
   * rather than an explicit 遠行/出行/行人 one. Surfaced so the wheel does not
   * pass a general blessing off as a travel verdict.
   */
  travelLineIsGeneral: boolean;
}

/**
 * The roster. Order is 太乙 摄提 轩辕 招摇 天符 青龙 咸池 太阴 天乙 and is fixed
 * by the 歌訣 「甲子艮宮加太乙，摄提軒轅招摇游，天符青龍咸池繼，太陰天乙順行流」.
 *
 * Note the verses are transcribed exactly as the source gives them, so they mix
 * traditional forms (軒轅, 青龍, 太陰) with the simplified roster headings the
 * app displays (轩辕, 青龙, 太阴). That inconsistency is the source's, and
 * normalising it would be silently editing a quotation.
 */
export const NINE_STARS: readonly NineStarDef[] = [
  {
    ordinal: 1,
    nameZh: "太乙",
    nameEn: "Supreme Unity",
    pinyin: "Tài Yǐ",
    homePalace: 1,
    beidouZh: "貪狼",
    beidouEn: "Greedy Wolf",
    qimenZh: "天蓬",
    qimenEn: "Heavenly Canopy",
    verdictA: "吉",
    verdictB: "吉",
    verseZh: "門中見太乙，星曜號貪狼。賭博錢財盛，婚姻大吉昌。遠行無阻滯，參謁見賢良。",
    verseEn:
      "Tai Yi seen in the gate — the star is called Greedy Wolf. Gambling and money thrive; marriage is greatly auspicious. Distant travel meets no obstruction; those you call on prove worthy.",
    travelLineZh: "遠行無阻滯",
    travelLineSource: "verse",
    travelLineIsGeneral: false,
  },
  {
    ordinal: 2,
    nameZh: "摄提",
    nameEn: "Steward",
    pinyin: "Shè Tí",
    homePalace: 2,
    beidouZh: "巨門",
    beidouEn: "Great Gate",
    qimenZh: "天芮",
    qimenEn: "Heavenly Rush",
    verdictA: "凶",
    verdictB: "凶",
    verseZh: "門中見摄提，百事必遲疑。相生猶自可，相克有災危。",
    verseEn:
      "She Ti seen in the gate — a hundred affairs must hesitate. Where the elements generate it may yet do; where they overcome there is calamity and danger.",
    travelLineZh: "遠行多不利",
    travelLineSource: "gloss",
    travelLineIsGeneral: false,
  },
  {
    ordinal: 3,
    nameZh: "轩辕",
    nameEn: "Yellow Emperor",
    pinyin: "Xuān Yuán",
    homePalace: 3,
    beidouZh: "祿存",
    beidouEn: "Rewards Preserved",
    qimenZh: "天冲",
    qimenEn: "Heavenly Surge",
    verdictA: "中平",
    verdictB: "小吉小凶",
    verseZh: "門中見軒轅，作事必牽連。相生能救助，相克受憂煎。",
    verseEn:
      "Xuan Yuan seen in the gate — whatever you undertake gets entangled. Where the elements generate, help can come; where they overcome, you are worn by worry.",
    travelLineZh: "遠行逢阻滯",
    travelLineSource: "gloss",
    travelLineIsGeneral: false,
  },
  {
    ordinal: 4,
    nameZh: "招摇",
    nameEn: "Beckoning Sway",
    pinyin: "Zhāo Yáo",
    homePalace: 4,
    beidouZh: "文曲",
    beidouEn: "Literary Song",
    qimenZh: "天輔",
    qimenEn: "Heavenly Support",
    verdictA: "凶",
    verdictB: "小吉小凶",
    verseZh: "招摇杜木星，當門事不成。出門三五里，陰人口舌迎。",
    verseEn:
      "Zhao Yao, the Wood star of the Du gate — facing the gate, matters do not come off. Go out three or five li and gossip from a 陰人 (conventionally read as a woman) meets you.",
    travelLineZh: "出門三五里，陰人口舌迎",
    travelLineSource: "verse",
    travelLineIsGeneral: false,
  },
  {
    ordinal: 5,
    nameZh: "天符",
    nameEn: "Heaven's Tally",
    pinyin: "Tiān Fú",
    homePalace: 5,
    beidouZh: "廉貞",
    beidouEn: "Pure Rectitude",
    qimenZh: "天禽",
    qimenEn: "Heavenly Bird",
    verdictA: "中平",
    verdictB: "凶",
    verseZh: "五黃號天符，當門婦女誣。相逢無佳事，行人住道途。",
    verseEn:
      "The Five Yellow is called Tian Fu — facing the gate, women bring false accusation. Encounters yield nothing good; the traveller is halted on the road.",
    travelLineZh: "行人住道途",
    travelLineSource: "verse",
    travelLineIsGeneral: false,
  },
  {
    ordinal: 6,
    nameZh: "青龙",
    nameEn: "Azure Dragon",
    pinyin: "Qīng Lóng",
    homePalace: 6,
    beidouZh: "武曲",
    beidouEn: "Martial Song",
    qimenZh: "天心",
    qimenEn: "Heavenly Heart",
    verdictA: "吉",
    verdictB: "吉",
    verseZh: "門中見青龍，謀事喜沖沖。投人逢酒食，賭博見興隆。",
    verseEn:
      "Qing Long seen in the gate — schemes go gladly forward. Call on people and you meet food and wine; gambling prospers.",
    travelLineZh: null, // the verse gives no travel clause; we do not supply one
    travelLineSource: null,
    travelLineIsGeneral: false,
  },
  {
    ordinal: 7,
    nameZh: "咸池",
    nameEn: "Bathing Pool",
    pinyin: "Xián Chí",
    homePalace: 7,
    beidouZh: "破軍",
    beidouEn: "Army Breaker",
    qimenZh: "天柱",
    qimenEn: "Heavenly Pillar",
    verdictA: "凶",
    verdictB: "凶",
    verseZh: "星曜號咸池，當門並不宜。出行多不利，相克有災危。",
    verseEn:
      "The star is called Xian Chi — facing the gate, nothing is suitable. Setting out is mostly unfavourable; where the elements overcome there is calamity and danger.",
    travelLineZh: "出行多不利",
    travelLineSource: "verse",
    travelLineIsGeneral: false,
  },
  {
    ordinal: 8,
    nameZh: "太阴",
    nameEn: "Great Yin",
    pinyin: "Tài Yīn",
    homePalace: 8,
    beidouZh: "左輔",
    beidouEn: "Left Assistant",
    qimenZh: "天任",
    qimenEn: "Heavenly Burden",
    verdictA: "吉",
    verdictB: "吉",
    verseZh: "門中見太陰，百事喜相尋。財祿求皆盛，知交可是親。",
    verseEn:
      "Tai Yin seen in the gate — a hundred affairs gladly seek one another. Wealth and emolument sought are abundant; acquaintances may become close.",
    travelLineZh: "百事喜相尋",
    travelLineSource: "verse",
    travelLineIsGeneral: true,
  },
  {
    ordinal: 9,
    nameZh: "天乙",
    nameEn: "Heavenly Yi",
    pinyin: "Tiān Yǐ",
    homePalace: 9,
    beidouZh: "右弼",
    beidouEn: "Right Support",
    qimenZh: "天英",
    qimenEn: "Heavenly Blossom",
    verdictA: "吉",
    verdictB: "吉",
    verseZh: "門中見天乙，百事喜相生。求財皆順利，茶酒盡來迎。",
    verseEn:
      "Tian Yi seen in the gate — a hundred affairs gladly generate one another. Seeking wealth goes smoothly; tea and wine come out to greet you.",
    travelLineZh: "百事喜相生",
    travelLineSource: "verse",
    travelLineIsGeneral: true,
  },
] as const;

/**
 * The stars whose VERDICT BUCKET the two lineages disagree on — exactly 招摇
 * (A: 凶 / B: 小吉小凶) and 天符 (A: 中平 / B: 凶). 轩辕 is labelled 中平 by A and
 * 小吉小凶 by B, which is a wording difference inside the same middle bucket,
 * so it is not counted as contested.
 */
export const CONTESTED_STARS: readonly string[] = NINE_STARS.filter(
  (s) => valenceOf(s.verdictA) !== valenceOf(s.verdictB),
).map((s) => s.nameZh);

/** Stars where A and B use different WORDS for the same bucket. */
export const RELABELLED_STARS: readonly string[] = NINE_STARS.filter(
  (s) => s.verdictA !== s.verdictB && valenceOf(s.verdictA) === valenceOf(s.verdictB),
).map((s) => s.nameZh);

export function verdictFor(star: NineStarDef, lineage: LineageId): VerdictZh {
  return lineage === "B" ? star.verdictB : star.verdictA;
}

/**
 * How well each lineage is sourced. `"primary-text"` means we can name the text
 * the classification is read from; `"unsourced"` means we cannot — we have not
 * read a primary text stating it and could not identify the school behind it.
 * The UI must not present the two as peers, and this field is what stops that
 * drifting back to parity.
 */
export type LineageSourcing = "primary-text" | "unsourced";

export const LINEAGE_SOURCING: Record<LineageId, LineageSourcing> = {
  A: "primary-text",
  B: "unsourced",
};

export const LINEAGE_LABEL: Record<LineageId, string> = {
  A: "Lineage A · 遁甲演義 / 元靈經 stream",
  B: "Lineage B · no primary text we have read, and no school we can name",
};

/** Short enough to sit on the toggle itself, honest enough to stand alone. */
export const LINEAGE_CHIP_LABEL: Record<LineageId, string> = {
  A: "Lineage A · sourced",
  B: "Lineage B · unsourced",
};

export const LINEAGE_NOTE: Record<LineageId, string> = {
  A: "吉 = 太乙、青龍、太陰、天乙; 中平 = 天符、軒轅; 凶 = 摄提、招摇、咸池. Read from 《遁甲演義》 and 《奇門遁甲元靈經》, and the one shown by default.",
  B: "吉 = the same four; 小吉小凶 = 軒轅、招摇; 凶 = 摄提、咸池、天符 — it differs from A on 招摇 and 天符 only. We have not traced it to a primary text and cannot name the school it belongs to, so it is called only “B”.",
};

/**
 * Shown on screen beside the lineage toggle, under BOTH selections — never
 * folded into a collapsed disclosure. A reader must not have to switch to B to
 * find out that B is unsourced.
 */
export const LINEAGE_B_UNSOURCED_NOTE =
  "About lineage B: it circulates in modern 日家奇門 practitioner summaries and almanac software, " +
  "which do not cite a source. We have not read a primary text that states it and we cannot name the " +
  "school it comes from — so it is shown to make the disagreement visible, not as A's equal.";

// ─────────────────────────────────────────────────────────────────────────────
// 3. PLACEMENT
// ─────────────────────────────────────────────────────────────────────────────

export type DunKind = "yang" | "yin";

export const DUN_ZH: Record<DunKind, string> = { yang: "陽遁", yin: "陰遁" };

/**
 * 太乙's palace for a day, counting from the 甲子 DAY — reading (i), the
 * shipped one.
 *
 *   歌訣: 「更有太乙九星位，冬至艮宮夏坤地，命起甲子順逆行，本日住宮太乙立。」
 *   陽遁 (冬至→夏至): 太乙 sits in 艮8 on 甲子日 and advances one palace a day.
 *   陰遁 (夏至→冬至): 太乙 sits in 坤2 on 甲子日 and retreats one palace a day.
 *
 * The cycle is mod 9 — it INCLUDES 中宮. That is what distinguishes the 九星
 * rule from the 八門 rule of the same system, which skips the centre.
 *
 * The count RE-ANCHORS at every 甲子 day. 60 is not a multiple of 9, so the
 * palace sequence is not a continuous 9-day loop: it restarts at each 甲子.
 * That is exactly what 「命起甲子」 asks for, and it is forced — if the count ran
 * continuously, 甲子 days would land on different palaces each 60-day cycle and
 * 「甲子艮宮加太乙」 would be false half the time. So the day index is reduced
 * mod 60 first, and the visible discontinuity at the 癸亥→甲子 seam is doctrine,
 * not a wrap-around bug.
 *
 * Self-verifying against the 遁甲演義 六甲 table for 陽遁 (see the test file):
 * 甲子→艮8, 甲戌→離9, 甲申→坎1, 甲午→坤2, 甲辰→震3, 甲寅→巽4.
 */
export function taiyiPalaceFromJiaziAnchor(dayGanzhiIndex: number, dun: DunKind): PalaceNumber {
  const d = mod(Math.trunc(dayGanzhiIndex), 60);
  const p = dun === "yang" ? mod(7 + d, 9) + 1 : mod(1 - d, 9) + 1;
  return p as PalaceNumber;
}

/**
 * 太乙's palace counting from the SOLSTICE DAY — reading (ii).
 *
 * UNSOURCED. It circulates, and it is the reading that happens to reproduce one
 * competitor's wheel on 2026-07-25, but no text stating it was found. It is
 * computed here purely so the UI can show that the fork exists and what it
 * would change. Never present it as doctrine, and never let it become the
 * default because it matches a screenshot.
 */
export function taiyiPalaceFromSolsticeAnchor(daysSinceSolsticeDay: number, dun: DunKind): PalaceNumber {
  const n = Math.trunc(daysSinceSolsticeDay);
  const p = dun === "yang" ? mod(7 + n, 9) + 1 : mod(1 - n, 9) + 1;
  return p as PalaceNumber;
}

/**
 * Lay the roster out from 太乙's palace, 順行 (ascending palace number, wrapping
 * 9→1) — always, in BOTH 遁. Only 太乙's own starting palace runs backwards in
 * 陰遁; the roster order around it does not.
 *   「摄提軒轅招摇游，天符青龍咸池繼，太陰天乙順行流」
 */
export function palaceOfStar(taiyiPalace: PalaceNumber, ordinal: number): PalaceNumber {
  return (mod(taiyiPalace - 1 + (ordinal - 1), 9) + 1) as PalaceNumber;
}

export interface NineStarPalace {
  palace: PalaceNumber;
  trigramZh: string;
  direction: Direction8 | null;
  directionEn: string | null;
  bearingDeg: number | null;
  isCentre: boolean;
  star: NineStarDef;
}

function buildPalace(palace: PalaceNumber, star: NineStarDef): NineStarPalace {
  const def = palaceDef(palace);
  return {
    palace,
    trigramZh: def.trigramZh,
    direction: def.direction,
    directionEn: def.directionEn,
    bearingDeg: def.bearingDeg,
    isCentre: palace === 5,
    star,
  };
}

/** All nine palaces for a given 太乙 palace, indexed by palace number 1..9. */
export function placeNineStars(taiyiPalace: PalaceNumber): NineStarPalace[] {
  const out: NineStarPalace[] = [];
  for (const star of NINE_STARS) {
    out.push(buildPalace(palaceOfStar(taiyiPalace, star.ordinal), star));
  }
  // Sort into palace order 1..9 so callers can index by palace.
  return out.sort((a, b) => a.palace - b.palace);
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. 陽遁 / 陰遁 FOR A CIVIL DATE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 正授 (`solstice`) switches 遁 on the solstice day itself. 超神接氣
 * (`nearest_jiazi`) switches on the 甲子 day nearest the solstice, which can be
 * up to a month either side. The two agree on most days and differ only in the
 * window between the solstice and its nearest 甲子.
 *
 * `nearest_jiazi` here uses the nearest 甲子 DAY only; full 超神接氣 tracks the
 * 符頭 (甲/己 days every 15) and is more involved. Flagged, not faked.
 */
export type DunSwitchConvention = "solstice" | "nearest_jiazi";

/** The tables' reference zone. Solstice instants are assigned to a civil day in
 *  UTC+8, the same convention hexagram.ts uses. */
const REFERENCE_OFFSET_MS = 8 * 60 * 60_000;

export interface CivilDate {
  year: number;
  month: number; // 1..12
  day: number;
}

function civilInRefZone(utcMillis: number): CivilDate {
  const t = new Date(utcMillis + REFERENCE_OFFSET_MS);
  return { year: t.getUTCFullYear(), month: t.getUTCMonth() + 1, day: t.getUTCDate() };
}

function jdnOf(c: CivilDate): number {
  return gregorianToJDN(c.year, c.month, c.day);
}

function winterSolsticeMillis(gregYear: number): number {
  return findSolarLongitudeCrossing(270, Date.UTC(gregYear, 11, 21));
}

function summerSolsticeMillis(gregYear: number): number {
  return findSolarLongitudeCrossing(90, Date.UTC(gregYear, 5, 21));
}

/** The 甲子 day nearest the given day; ties (exactly 30 either way) resolve
 *  EARLIER, which is the 超神 ("arriving early") side the convention is named
 *  for. The day index comes from the engine's own continuous day cycle. */
function nearestJiaziJdn(jdn: number, civil: CivilDate): number {
  const idx = dayGanzhiIndexFromCivilDate(civil.year, civil.month, civil.day);
  return idx <= 30 ? jdn - idx : jdn + (60 - idx);
}

export interface DunDetermination {
  dun: DunKind;
  dunZh: string;
  convention: DunSwitchConvention;
  /** Which solstice opened the current 遁. */
  solsticeKind: "winter" | "summer";
  solsticeZh: string;
  /** The solstice's civil day in the reference zone (UTC+8). */
  solsticeCivil: CivilDate;
  solsticeUtcIso: string;
  /** Civil day on which the current 遁 actually began under `convention`. */
  switchCivil: CivilDate;
  /** Civil days elapsed since the SOLSTICE DAY. Feeds the unsourced reading (ii). */
  daysSinceSolsticeDay: number;
  /** true when `solstice` and `nearest_jiazi` would give different 遁 today. */
  conventionsDisagree: boolean;
}

interface SolsticeCandidate {
  kind: "winter" | "summer";
  millis: number;
  solsticeCivil: CivilDate;
  solsticeJdn: number;
}

function candidatesFor(year: number): SolsticeCandidate[] {
  const raw: Array<{ kind: "winter" | "summer"; millis: number }> = [
    { kind: "summer", millis: summerSolsticeMillis(year - 1) },
    { kind: "winter", millis: winterSolsticeMillis(year - 1) },
    { kind: "summer", millis: summerSolsticeMillis(year) },
    { kind: "winter", millis: winterSolsticeMillis(year) },
  ];
  return raw.map((r) => {
    const solsticeCivil = civilInRefZone(r.millis);
    return { ...r, solsticeCivil, solsticeJdn: jdnOf(solsticeCivil) };
  });
}

function switchJdnFor(c: SolsticeCandidate, convention: DunSwitchConvention): number {
  return convention === "nearest_jiazi"
    ? nearestJiaziJdn(c.solsticeJdn, c.solsticeCivil)
    : c.solsticeJdn;
}

function resolve(
  jdn: number,
  cands: SolsticeCandidate[],
  convention: DunSwitchConvention,
): { chosen: SolsticeCandidate; switchJdn: number } {
  let best: { chosen: SolsticeCandidate; switchJdn: number } | null = null;
  for (const c of cands) {
    const s = switchJdnFor(c, convention);
    if (s <= jdn && (best === null || s > best.switchJdn)) best = { chosen: c, switchJdn: s };
  }
  // Cannot happen: the earliest candidate is ~13–19 months back and the switch
  // shifts by at most 30 days. Fall back rather than throw.
  return best ?? { chosen: cands[0], switchJdn: switchJdnFor(cands[0], convention) };
}

/**
 * 陽遁 runs 冬至 → 夏至, 陰遁 runs 夏至 → 冬至. Derived from the repo's own solar
 * solver, not a hardcoded term table.
 */
export function dunForCivilDate(
  civil: CivilDate,
  convention: DunSwitchConvention = "solstice",
): DunDetermination {
  const jdn = jdnOf(civil);
  const cands = candidatesFor(civil.year);
  const { chosen, switchJdn } = resolve(jdn, cands, convention);
  const other = resolve(jdn, cands, convention === "solstice" ? "nearest_jiazi" : "solstice");

  const dun: DunKind = chosen.kind === "winter" ? "yang" : "yin";
  const otherDun: DunKind = other.chosen.kind === "winter" ? "yang" : "yin";
  const solsticeCivil = chosen.solsticeCivil;
  const switchCivil = civilFromJdn(switchJdn, solsticeCivil);

  return {
    dun,
    dunZh: DUN_ZH[dun],
    convention,
    solsticeKind: chosen.kind,
    solsticeZh: chosen.kind === "winter" ? "冬至" : "夏至",
    solsticeCivil,
    solsticeUtcIso: new Date(Math.round(chosen.millis)).toISOString(),
    switchCivil,
    daysSinceSolsticeDay: jdn - chosen.solsticeJdn,
    conventionsDisagree: dun !== otherDun,
  };
}

/** JDN → civil date, by walking from a nearby known date. Cheap and exact for
 *  the ≤ ~40-day offsets this module produces. */
function civilFromJdn(jdn: number, near: CivilDate): CivilDate {
  const delta = jdn - jdnOf(near);
  const t = new Date(Date.UTC(near.year, near.month - 1, near.day) + delta * 86_400_000);
  return { year: t.getUTCFullYear(), month: t.getUTCMonth() + 1, day: t.getUTCDate() };
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. THE DAY'S WHEEL
// ─────────────────────────────────────────────────────────────────────────────

export interface AlternateAnchorReading {
  anchor: "solstice";
  /** Always false. No source stating this reading was found. */
  sourced: false;
  taiyiPalace: PalaceNumber;
  /** The star this reading would put in 中宮 instead. */
  centreStarZh: string;
  differsFromShipped: boolean;
  note: string;
}

export interface NineStarDay {
  dayGanzhiIndex: number;
  dayGanZhiZh: string;
  dun: DunKind;
  dunZh: string;
  /** The shipped anchor. Always "jiazi" — reading (i). */
  anchor: "jiazi";
  taiyiPalace: PalaceNumber;
  /** All nine, in palace order 1..9. */
  palaces: NineStarPalace[];
  /** The eight directional ones, in compass order starting N, clockwise. */
  ring: NineStarPalace[];
  /** The one in 中宮 — no direction. Exactly one, every day. */
  centre: NineStarPalace;
  /** Present only when the caller supplied enough to compute it. */
  alternateAnchor: AlternateAnchorReading | null;
  /** Present only via `nineStarsForCivilDate`. */
  dunDetermination: DunDetermination | null;
}

export interface DayNineStarsOptions {
  /**
   * Civil days since the solstice day. Supply it to have the unsourced
   * solstice-anchored reading computed alongside for disclosure; omit it and
   * `alternateAnchor` is null.
   */
  daysSinceSolsticeDay?: number;
  dunDetermination?: DunDetermination | null;
}

/**
 * The day's nine-star arrangement.
 *
 * `dayGanzhiIndex` is the day pillar's sexagenary index (甲子 = 0 … 癸亥 = 59) —
 * take it from the app's existing day-pillar engine. `dun` is 陽遁/陰遁; use
 * `dunForCivilDate` or supply it yourself.
 */
export function dayNineStars(
  dayGanzhiIndex: number,
  dun: DunKind,
  options: DayNineStarsOptions = {},
): NineStarDay {
  const d = mod(Math.trunc(dayGanzhiIndex), 60);
  const taiyiPalace = taiyiPalaceFromJiaziAnchor(d, dun);
  const palaces = placeNineStars(taiyiPalace);
  const byPalace = new Map(palaces.map((p) => [p.palace, p]));
  const centre = byPalace.get(5)!;
  const ring = RING_PALACE_ORDER.map((p) => byPalace.get(p)!);

  let alternateAnchor: AlternateAnchorReading | null = null;
  if (options.daysSinceSolsticeDay !== undefined) {
    const altPalace = taiyiPalaceFromSolsticeAnchor(options.daysSinceSolsticeDay, dun);
    const altCentre = NINE_STARS.find((s) => palaceOfStar(altPalace, s.ordinal) === 5)!;
    alternateAnchor = {
      anchor: "solstice",
      sourced: false,
      taiyiPalace: altPalace,
      centreStarZh: altCentre.nameZh,
      differsFromShipped: altPalace !== taiyiPalace,
      note:
        "A second reading of 「命起甲子順逆行」 counts the days from the solstice day rather than from the 甲子 day. " +
        "No text stating it was found, so it is not what this wheel shows — it is reported here only so the fork is visible.",
    };
  }

  return {
    dayGanzhiIndex: d,
    dayGanZhiZh: ganZhiFromIndex(d).hanzi,
    dun,
    dunZh: DUN_ZH[dun],
    anchor: "jiazi",
    taiyiPalace,
    palaces,
    ring,
    centre,
    alternateAnchor,
    dunDetermination: options.dunDetermination ?? null,
  };
}

/**
 * Convenience: the whole wheel from a civil date. Computes the day pillar index
 * and the 遁 internally, and always fills `alternateAnchor` so the UI can
 * disclose the fork.
 */
export function nineStarsForCivilDate(
  civil: CivilDate,
  opts: { dunSwitch?: DunSwitchConvention; dayGanzhiIndex?: number } = {},
): NineStarDay {
  const det = dunForCivilDate(civil, opts.dunSwitch ?? "solstice");
  const idx =
    opts.dayGanzhiIndex !== undefined
      ? opts.dayGanzhiIndex
      : dayGanzhiIndexFromCivilDate(civil.year, civil.month, civil.day);
  return dayNineStars(idx, det.dun, {
    daysSinceSolsticeDay: det.daysSinceSolsticeDay,
    dunDetermination: det,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. COPY THE UI NEEDS (kept here so wording and doctrine stay together)
// ─────────────────────────────────────────────────────────────────────────────

export const NINE_STAR_SOURCE_NOTE =
  "日家奇門九星 (Day Qi Men Nine Stars). Roster, verses and 吉凶 from 《奇門遁甲元靈經》 " +
  "(carried in 欽定古今圖書集成·藝術典·卷713); placement from the 歌訣 and 六甲 table in " +
  "《遁甲演義》卷一·日家奇門. Nine stars rotate through the nine palaces, one palace a day; " +
  "eight sit at compass directions and one sits in 中宮, which has no direction.";

export const NINE_STAR_TRUNCATION_NOTE =
  "The classical verses read 「門中見X」 — “when X is seen in the Door's palace”. The full doctrine " +
  "reads this star ring together with the 八門 ring in the same palace. This wheel shows the stars only, " +
  "which is half of it.";

export const NINE_STAR_NOT_A_PREDICTION_NOTE =
  "A directional reading, not a prediction: classical material shown as classical material. " +
  "It feeds nothing this app scores, ranks or hashes.";
