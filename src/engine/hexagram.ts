/**
 * 易 hexagrams — the King Wen table, the Han 卦氣 (六日七分) day-hexagram
 * calendar, and 梅花易數 年月日時起卦.
 *
 * ─── WHAT THIS MODULE IS AND IS NOT ──────────────────────────────────────────
 *
 * This is a DISPLAY layer. Nothing here feeds `recommendationScore`, the
 * decision kernel, or `calculationHash`. It surfaces two quite different
 * things, and the distinction is the whole point:
 *
 *   1. `dayHexagram()` — 卦氣 / 六日七分. A CALENDAR FACT. The Han
 *      hexagram-qi scheme divides the tropical year among 60 of the 64
 *      hexagrams, 6 + 7/80 days each, starting from 中孚 at 冬至. Given a
 *      date, the hexagram is determined; there is no divination in it. The
 *      ordered 60 and their ranks are transcribed from the 京房卦氣直日圖
 *      橫圖 as preserved in 《新唐書‧曆志》 (the 卦議 of 一行), which is also
 *      where the arithmetic 「餘皆六日七分」 comes from. Doctrinal lineage:
 *      孟喜 → 《易緯‧稽覽圖》/《是類謀》 → 京房 → 鄭玄/孔穎達 → 李溉's
 *      六日七分圖 → 朱震《漢上易傳》.
 *
 *   2. `meihuaCast()` — 梅花易數 年月日時起卦. A DIVINATION TECHNIQUE applied
 *      to a moment, per 《梅花易數》卷一「年月日時起例」. It produces a moving
 *      line (動爻), which a calendar cannot. It is NOT "the day's hexagram" —
 *      it is a cast for a moment, and callers must label it that way.
 *
 * ─── HONESTY NOTES (do not quietly drop these) ───────────────────────────────
 *
 * - The 60-hexagram ORDER is not derivable from any stated rule. 易學網 says
 *   so outright (「六十卦的值日到底根據什麼規則來安排，不得而知」). It survives
 *   only as a transmitted table, so it is copied verbatim below rather than
 *   reconstructed. Three self-validations (60 entries; excluded set exactly
 *   {29 坎, 30 離, 51 震, 58 兌}; the twelve 辟卦 at i ≡ 1 mod 5 being the
 *   十二消息卦 in order) fall out of the table and are pinned in tests.
 *
 * - Neither method is claimed to reproduce any other product's output, and
 *   nothing here should be presented as doing so.
 *
 * - Interpretation is not in this file. The names are the standard
 *   Wilhelm-tradition English renderings; they are labels, not readings.
 *
 * ─── DETERMINISM ─────────────────────────────────────────────────────────────
 *
 * No network, no LLM, no `Date.now()`, no `Math.random()`. `lunar-javascript`
 * is NOT imported (it is confined to src/engine/verification/**) — the lunar
 * date `meihuaCast` needs is supplied by the caller. Solar longitude comes
 * from the repo's own solver in ./astronomy.ts; no solstice table is hardcoded.
 */

import { SOLAR_TERMS, findSolarLongitudeCrossing } from "./astronomy.ts";

// ─────────────────────────────────────────────────────────────────────────────
// 1. TRIGRAMS (八卦)
// ─────────────────────────────────────────────────────────────────────────────

export type TrigramNameZh = "乾" | "兌" | "離" | "震" | "巽" | "坎" | "艮" | "坤";

export interface Trigram {
  /**
   * 先天八卦數 (Fu Xi / "Earlier Heaven" number), 1..8:
   * 乾一 兌二 離三 震四 巽五 坎六 艮七 坤八 — 《梅花易數》「乾，一；兌，二；…」.
   * This is the numbering `meihuaCast` divides by 8 against.
   */
  xianTian: number;
  nameZh: TrigramNameZh;
  pinyin: string;
  /** The image (象): Heaven, Lake, Fire, … */
  nameEn: string;
  /** The attribute (德), Wilhelm's rendering: The Creative, The Joyous, … */
  attributeEn: string;
  /** The three lines BOTTOM (index 0) to TOP (index 2). true = yang (solid). */
  lines: readonly [boolean, boolean, boolean];
}

const Y = true;
const N = false;

/** The eight trigrams in 先天 order (which is also Unicode's U+2630..U+2637 order). */
export const TRIGRAMS: readonly Trigram[] = [
  { xianTian: 1, nameZh: "乾", pinyin: "Qián", nameEn: "Heaven", attributeEn: "The Creative", lines: [Y, Y, Y] },
  { xianTian: 2, nameZh: "兌", pinyin: "Duì", nameEn: "Lake", attributeEn: "The Joyous", lines: [Y, Y, N] },
  { xianTian: 3, nameZh: "離", pinyin: "Lí", nameEn: "Fire", attributeEn: "The Clinging", lines: [Y, N, Y] },
  { xianTian: 4, nameZh: "震", pinyin: "Zhèn", nameEn: "Thunder", attributeEn: "The Arousing", lines: [Y, N, N] },
  { xianTian: 5, nameZh: "巽", pinyin: "Xùn", nameEn: "Wind", attributeEn: "The Gentle", lines: [N, Y, Y] },
  { xianTian: 6, nameZh: "坎", pinyin: "Kǎn", nameEn: "Water", attributeEn: "The Abysmal", lines: [N, Y, N] },
  { xianTian: 7, nameZh: "艮", pinyin: "Gèn", nameEn: "Mountain", attributeEn: "Keeping Still", lines: [N, N, Y] },
  { xianTian: 8, nameZh: "坤", pinyin: "Kūn", nameEn: "Earth", attributeEn: "The Receptive", lines: [N, N, N] },
];

const TRIGRAM_BY_ZH = new Map<string, Trigram>(TRIGRAMS.map((t) => [t.nameZh, t]));

/** Look up a trigram by its 先天 number (1..8). Throws on anything else. */
export function trigramByXianTian(xianTian: number): Trigram {
  const t = TRIGRAMS[xianTian - 1];
  if (!t) throw new RangeError(`先天 trigram number out of range (1..8): ${xianTian}`);
  return t;
}

/** Look up a trigram by its Chinese name. Throws if unknown. */
export function trigramByNameZh(nameZh: string): Trigram {
  const t = TRIGRAM_BY_ZH.get(nameZh);
  if (!t) throw new RangeError(`unknown trigram: ${nameZh}`);
  return t;
}

/**
 * Unicode codepoint for the trigram glyph (☰..☷, U+2630..U+2637). The block is
 * laid out in 先天 order, so this is a straight offset. As with the hexagram
 * glyphs, the UI draws the lines itself rather than trusting font coverage —
 * this helper exists for copy/paste and for tests.
 */
export function trigramCodePoint(xianTian: number): number {
  trigramByXianTian(xianTian); // range check
  return 0x2630 + xianTian - 1;
}

/** The trigram glyph as a string, e.g. `trigramGlyph(1) === "☰"`. */
export function trigramGlyph(xianTian: number): string {
  return String.fromCodePoint(trigramCodePoint(xianTian));
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. THE 64 HEXAGRAMS (King Wen order)
// ─────────────────────────────────────────────────────────────────────────────

export interface Hexagram {
  /** King Wen number, 1..64. */
  kingWen: number;
  nameZh: string;
  pinyin: string;
  /** Standard Wilhelm-tradition English rendering. A label, not a reading. */
  nameEn: string;
  /**
   * The six lines BOTTOM (index 0, 初爻) to TOP (index 5, 上爻). true = yang.
   * Derived from the trigram pair — lines 0..2 are the lower trigram, 3..5 the
   * upper — never hand-typed, so the pair and the lines cannot drift apart.
   */
  lines: readonly boolean[];
  /** 上卦 — the outer/upper trigram (lines 4-6). */
  upper: Trigram;
  /** 下卦 — the inner/lower trigram (lines 1-3). */
  lower: Trigram;
}

/**
 * King Wen number → [Chinese name, pinyin, English name, 上卦, 下卦].
 *
 * The trigram pairing was transcribed independently of the line data and
 * cross-checked against a second source table keyed by the six-bit line
 * pattern; all 64 agreed. Lines are then DERIVED from the pair below.
 */
const HEXAGRAM_TABLE: readonly [number, string, string, string, TrigramNameZh, TrigramNameZh][] = [
  [1, "乾", "Qián", "The Creative", "乾", "乾"],
  [2, "坤", "Kūn", "The Receptive", "坤", "坤"],
  [3, "屯", "Zhūn", "Difficulty at the Beginning", "坎", "震"],
  [4, "蒙", "Méng", "Youthful Folly", "艮", "坎"],
  [5, "需", "Xū", "Waiting", "坎", "乾"],
  [6, "訟", "Sòng", "Conflict", "乾", "坎"],
  [7, "師", "Shī", "The Army", "坤", "坎"],
  [8, "比", "Bǐ", "Holding Together", "坎", "坤"],
  [9, "小畜", "Xiǎo Xù", "The Taming Power of the Small", "巽", "乾"],
  [10, "履", "Lǚ", "Treading", "乾", "兌"],
  [11, "泰", "Tài", "Peace", "坤", "乾"],
  [12, "否", "Pǐ", "Standstill", "乾", "坤"],
  [13, "同人", "Tóng Rén", "Fellowship with Men", "乾", "離"],
  [14, "大有", "Dà Yǒu", "Possession in Great Measure", "離", "乾"],
  [15, "謙", "Qiān", "Modesty", "坤", "艮"],
  [16, "豫", "Yù", "Enthusiasm", "震", "坤"],
  [17, "隨", "Suí", "Following", "兌", "震"],
  [18, "蠱", "Gǔ", "Work on What Has Been Spoiled", "艮", "巽"],
  [19, "臨", "Lín", "Approach", "坤", "兌"],
  [20, "觀", "Guān", "Contemplation", "巽", "坤"],
  [21, "噬嗑", "Shì Kè", "Biting Through", "離", "震"],
  [22, "賁", "Bì", "Grace", "艮", "離"],
  [23, "剝", "Bō", "Splitting Apart", "艮", "坤"],
  [24, "復", "Fù", "Return", "坤", "震"],
  [25, "无妄", "Wú Wàng", "Innocence", "乾", "震"],
  [26, "大畜", "Dà Xù", "The Taming Power of the Great", "艮", "乾"],
  [27, "頤", "Yí", "The Corners of the Mouth", "艮", "震"],
  [28, "大過", "Dà Guò", "Preponderance of the Great", "兌", "巽"],
  [29, "坎", "Kǎn", "The Abysmal", "坎", "坎"],
  [30, "離", "Lí", "The Clinging", "離", "離"],
  [31, "咸", "Xián", "Influence", "兌", "艮"],
  [32, "恆", "Héng", "Duration", "震", "巽"],
  [33, "遯", "Dùn", "Retreat", "乾", "艮"],
  [34, "大壯", "Dà Zhuàng", "The Power of the Great", "震", "乾"],
  [35, "晉", "Jìn", "Progress", "離", "坤"],
  [36, "明夷", "Míng Yí", "Darkening of the Light", "坤", "離"],
  [37, "家人", "Jiā Rén", "The Family", "巽", "離"],
  [38, "睽", "Kuí", "Opposition", "離", "兌"],
  [39, "蹇", "Jiǎn", "Obstruction", "坎", "艮"],
  [40, "解", "Xiè", "Deliverance", "震", "坎"],
  [41, "損", "Sǔn", "Decrease", "艮", "兌"],
  [42, "益", "Yì", "Increase", "巽", "震"],
  [43, "夬", "Guài", "Break-through", "兌", "乾"],
  [44, "姤", "Gòu", "Coming to Meet", "乾", "巽"],
  [45, "萃", "Cuì", "Gathering Together", "兌", "坤"],
  [46, "升", "Shēng", "Pushing Upward", "坤", "巽"],
  [47, "困", "Kùn", "Oppression", "兌", "坎"],
  [48, "井", "Jǐng", "The Well", "坎", "巽"],
  [49, "革", "Gé", "Revolution", "兌", "離"],
  [50, "鼎", "Dǐng", "The Caldron", "離", "巽"],
  [51, "震", "Zhèn", "The Arousing", "震", "震"],
  [52, "艮", "Gèn", "Keeping Still", "艮", "艮"],
  [53, "漸", "Jiàn", "Development", "巽", "艮"],
  [54, "歸妹", "Guī Mèi", "The Marrying Maiden", "震", "兌"],
  [55, "豐", "Fēng", "Abundance", "震", "離"],
  [56, "旅", "Lǚ", "The Wanderer", "離", "艮"],
  [57, "巽", "Xùn", "The Gentle", "巽", "巽"],
  [58, "兌", "Duì", "The Joyous", "兌", "兌"],
  [59, "渙", "Huàn", "Dispersion", "巽", "坎"],
  [60, "節", "Jié", "Limitation", "坎", "兌"],
  [61, "中孚", "Zhōng Fú", "Inner Truth", "巽", "兌"],
  [62, "小過", "Xiǎo Guò", "Preponderance of the Small", "震", "艮"],
  [63, "既濟", "Jì Jì", "After Completion", "坎", "離"],
  [64, "未濟", "Wèi Jì", "Before Completion", "離", "坎"],
];

/** All 64 hexagrams in King Wen order; `HEXAGRAMS[0]` is King Wen 1 (乾). */
export const HEXAGRAMS: readonly Hexagram[] = HEXAGRAM_TABLE.map(
  ([kingWen, nameZh, pinyin, nameEn, upperZh, lowerZh]) => {
    const upper = trigramByNameZh(upperZh);
    const lower = trigramByNameZh(lowerZh);
    return {
      kingWen,
      nameZh,
      pinyin,
      nameEn,
      // bottom-to-top: lower trigram first, then upper.
      lines: [...lower.lines, ...upper.lines] as readonly boolean[],
      upper,
      lower,
    };
  },
);

const HEXAGRAM_BY_TRIGRAMS = new Map<string, Hexagram>(
  HEXAGRAMS.map((h) => [`${h.upper.xianTian}/${h.lower.xianTian}`, h]),
);

/** Look up a hexagram by King Wen number (1..64). Throws on anything else. */
export function hexagramByKingWen(kingWen: number): Hexagram {
  const h = HEXAGRAMS[kingWen - 1];
  if (!h) throw new RangeError(`King Wen number out of range (1..64): ${kingWen}`);
  return h;
}

/** Look up a hexagram by its (上卦, 下卦) 先天 numbers, each 1..8. */
export function hexagramByTrigrams(upperXianTian: number, lowerXianTian: number): Hexagram {
  trigramByXianTian(upperXianTian);
  trigramByXianTian(lowerXianTian);
  const h = HEXAGRAM_BY_TRIGRAMS.get(`${upperXianTian}/${lowerXianTian}`);
  // Unreachable: all 64 pairs are present. Kept as a total-function guarantee.
  if (!h) throw new RangeError(`no hexagram for trigrams ${upperXianTian}/${lowerXianTian}`);
  return h;
}

/**
 * Look up a hexagram from its six lines, BOTTOM (index 0) to TOP (index 5).
 * true = yang. Used to resolve the 變卦 after a moving line flips.
 */
export function hexagramByLines(lines: readonly boolean[]): Hexagram {
  if (lines.length !== 6) throw new RangeError(`a hexagram has 6 lines, got ${lines.length}`);
  const bits = Array.from(lines, Boolean); // total over any truthy/falsy input
  const lower = TRIGRAMS.find((t) => t.lines.every((v, i) => v === bits[i]))!;
  const upper = TRIGRAMS.find((t) => t.lines.every((v, i) => v === bits[i + 3]))!;
  return hexagramByTrigrams(upper.xianTian, lower.xianTian);
}

/**
 * Unicode codepoint for the hexagram glyph: the Yijing Hexagram Symbols block
 * runs U+4DC0..U+4DFF in King Wen order, so ䷀ (KW 1) is 0x4DC0.
 *
 * NOTE: the UI draws the six lines itself rather than rendering this glyph —
 * font coverage for U+4DC0..U+4DFF is patchy across platforms and the drawn
 * form lets a moving line be highlighted. This helper is for tests, copy and
 * plain-text export.
 */
export function hexagramCodePoint(kingWen: number): number {
  hexagramByKingWen(kingWen); // range check
  return 0x4dc0 + kingWen - 1;
}

/** The hexagram glyph as a string, e.g. `hexagramGlyph(10) === "䷉"`. */
export function hexagramGlyph(kingWen: number): string {
  return String.fromCodePoint(hexagramCodePoint(kingWen));
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. 卦氣 — the ordered 60 (六日七分)
// ─────────────────────────────────────────────────────────────────────────────

export type GuaQiRank = "公" | "辟" | "侯" | "大夫" | "卿";

/** Rank cycle, period 5, starting at 冬至 with 公中孚. */
const RANKS: readonly GuaQiRank[] = ["公", "辟", "侯", "大夫", "卿"];
const RANK_EN: Record<GuaQiRank, string> = {
  公: "Duke",
  辟: "Sovereign",
  侯: "Marquis",
  大夫: "Great Officer",
  卿: "Minister",
};

/**
 * The 60 in order from 冬至, as [King Wen number, Chinese name].
 *
 * Transcribed verbatim from the 橫圖 of the 京房卦氣直日圖 (headed
 * 「橫圖　見《唐書‧律曆志》」). Both columns are kept so the transcription can be
 * cross-checked against the King Wen table above — tests assert they agree,
 * which catches a slipped row that a numbers-only table would hide.
 */
const GUA_QI_TABLE: readonly [number, string][] = [
  [61, "中孚"], [24, "復"], [3, "屯"], [15, "謙"], [38, "睽"],
  [46, "升"], [19, "臨"], [62, "小過"], [4, "蒙"], [42, "益"],
  [53, "漸"], [11, "泰"], [5, "需"], [17, "隨"], [35, "晉"],
  [40, "解"], [34, "大壯"], [16, "豫"], [6, "訟"], [18, "蠱"],
  [49, "革"], [43, "夬"], [56, "旅"], [7, "師"], [8, "比"],
  [9, "小畜"], [1, "乾"], [14, "大有"], [37, "家人"], [48, "井"],
  [31, "咸"], [44, "姤"], [50, "鼎"], [55, "豐"], [59, "渙"],
  [10, "履"], [33, "遯"], [32, "恆"], [60, "節"], [13, "同人"],
  [41, "損"], [12, "否"], [57, "巽"], [45, "萃"], [26, "大畜"],
  [22, "賁"], [20, "觀"], [54, "歸妹"], [25, "无妄"], [36, "明夷"],
  [47, "困"], [23, "剝"], [52, "艮"], [63, "既濟"], [21, "噬嗑"],
  [28, "大過"], [2, "坤"], [64, "未濟"], [39, "蹇"], [27, "頤"],
];

/**
 * The 中氣 that opens each block of five, in order from 冬至, with the 節 that
 * falls inside the same block. From the 橫圖: each 中氣 heads 公/辟/侯(內) and
 * the following 節 heads 侯(外)/大夫/卿 — so the 侯 hexagram straddles the two.
 */
const GUA_QI_BLOCKS: readonly [string, string][] = [
  ["冬至", "小寒"],
  ["大寒", "立春"],
  ["雨水", "驚蟄"],
  ["春分", "清明"],
  ["穀雨", "立夏"],
  ["小滿", "芒種"],
  ["夏至", "小暑"],
  ["大暑", "立秋"],
  ["處暑", "白露"],
  ["秋分", "寒露"],
  ["霜降", "立冬"],
  ["小雪", "大雪"],
];

export interface SolarTermLabel {
  nameZh: string;
  nameEn: string;
}

/** English names come from the engine's own 24-term table, never re-typed. */
function termLabel(nameZh: string): SolarTermLabel {
  const def = SOLAR_TERMS.find((t) => t.nameZh === nameZh);
  if (!def) throw new RangeError(`unknown solar term: ${nameZh}`);
  return { nameZh: def.nameZh, nameEn: def.nameEn };
}

export interface GuaQiEntry {
  /** 0..59, counting from 中孚 at 冬至. */
  index: number;
  hexagram: Hexagram;
  rank: GuaQiRank;
  rankEn: string;
  /** The 中氣 whose block of five this hexagram belongs to. */
  midQiTerm: SolarTermLabel;
  /** The 節 inside the same block. */
  jieTerm: SolarTermLabel;
  /**
   * True for the 侯 hexagram of each block: the table splits it 侯(內) under
   * the 中氣 and 侯(外) under the 節. The day-rotation treats it as one window;
   * the flag exists so attribution copy can say so.
   */
  straddlesJie: boolean;
}

/**
 * The 60 hexagrams of the day-rotation, in order from 冬至.
 *
 * 坎(29) 離(30) 震(51) 兌(58) — the 四正卦 — are absent by construction: they
 * govern the 24 qi through their six lines apiece (坎 lines 1-6 = 冬至…驚蟄,
 * 震 = 春分…芒種, 離 = 夏至…白露, 兌 = 秋分…大雪) and never take a day.
 */
export const guaQiSequence: readonly GuaQiEntry[] = GUA_QI_TABLE.map(([kingWen], index) => {
  const rank = RANKS[index % 5];
  const [midQiZh, jieZh] = GUA_QI_BLOCKS[Math.floor(index / 5)];
  return {
    index,
    hexagram: hexagramByKingWen(kingWen),
    rank,
    rankEn: RANK_EN[rank],
    midQiTerm: termLabel(midQiZh),
    jieTerm: termLabel(jieZh),
    straddlesJie: rank === "侯",
  };
});

/** The raw transcription, exposed so tests can check it against `HEXAGRAMS`. */
export const GUA_QI_TRANSCRIPTION: readonly [number, string][] = GUA_QI_TABLE;

/** The four 正卦 (King Wen numbers), excluded from the day-rotation. */
export const GUA_QI_CARDINAL_KING_WEN: readonly number[] = [29, 30, 51, 58];

// ─────────────────────────────────────────────────────────────────────────────
// 4. dayHexagram — the 卦氣 day-rotation
// ─────────────────────────────────────────────────────────────────────────────

/** 六日七分: 365.25 / 60 = 6 + 7/80 days per hexagram. */
export const GUA_QI_STEP_DAYS = 6 + 7 / 80;

const DAY_MS = 86_400_000;

/** Winter-solstice cache, keyed by Gregorian year. Pure memoisation. */
const solsticeCache = new Map<number, number>();

/** UTC millis of the 冬至 (solar longitude 270°) of a given Gregorian year. */
function winterSolsticeMillis(gregorianYear: number): number {
  const hit = solsticeCache.get(gregorianYear);
  if (hit !== undefined) return hit;
  const ms = findSolarLongitudeCrossing(270, Date.UTC(gregorianYear, 11, 21, 12));
  solsticeCache.set(gregorianYear, ms);
  return ms;
}

/** The most recent 冬至 at or before `utcMillis`. */
function priorWinterSolstice(utcMillis: number): number {
  const y = new Date(utcMillis).getUTCFullYear();
  const thisYear = winterSolsticeMillis(y);
  return thisYear <= utcMillis ? thisYear : winterSolsticeMillis(y - 1);
}

export interface HexagramCivilDate {
  year: number;
  month: number; // 1-12
  day: number; // 1-31
}

export interface DayHexagramOptions {
  /**
   * Minutes east of UTC used to place the civil date on the timeline.
   * Default +480 (UTC+8), the reference zone the classical tables are read in.
   * A viewer far from UTC+8 can pass their own offset; a window boundary can
   * then land on a different civil day for them, which is expected and should
   * be said rather than hidden.
   */
  utcOffsetMinutes?: number;
  /**
   * Local hour at which the civil day is judged. Default 12 — see the
   * convention note on `dayHexagram`. Any other value is a SENSITIVITY knob for
   * tests and comparison, not a shipping option; the product convention is noon.
   */
  judgeAtLocalHour?: number;
}

export interface DayHexagramResult {
  hexagram: Hexagram;
  rank: GuaQiRank;
  rankEn: string;
  /** The 中氣 whose block of five this hexagram opens or sits in. */
  midQiTerm: SolarTermLabel;
  /** ISO-8601 UTC instant the window opens (second precision). */
  windowStartIso: string;
  /** ISO-8601 UTC instant the window closes (second precision). */
  windowEndIso: string;
  /** 0..59 from 中孚 at 冬至. */
  index: number;
  /** The full sequence entry, for attribution copy. */
  entry: GuaQiEntry;
}

/**
 * The 卦氣 hexagram governing a civil date — 六日七分, continuous from 冬至.
 *
 * Model: the cycle restarts at every 冬至 with 公中孚; each of the 60 runs
 * 6 + 7/80 days; index = floor((t − 冬至) / step), clamped to 59.
 *
 * ── The noon rule (a documented convention, not a derived fact) ──────────────
 *
 * A hexagram window is an INSTANT-to-instant span (6 d 2 h 6 m), so its edges
 * drift ~2 h 6 m later each time and rarely align with midnight. This function
 * assigns a civil date to whichever hexagram covers 12:00 LOCAL on that date —
 * the majority-of-the-day rule. That matches the codebase's existing convention
 * for date-based almanac facts: src/engine/verification/lunarAlmanac.ts reads
 * 宜忌, 廿八宿 and the hour table at local civil noon for the same reason
 * (docs/VERIFICATION.md pins those comparator semantics).
 *
 * Two other conventions are in circulation and NO source settles the choice:
 *   - the midnight / start-of-day rule (the hexagram takes effect from 00:00 of
 *     the civil date containing its start instant) — differs from noon on
 *     32 of 365 days in 2026 (~8.8%);
 *   - the 子時 rule (the Chinese day opening at 23:00 the previous evening) —
 *     differs from noon on 34 of 365 days in 2026.
 * Pass `judgeAtLocalHour: 0` or `-1` to reproduce those for comparison.
 *
 * ── Clamping ────────────────────────────────────────────────────────────────
 *
 * 60 × 6.0875 = 365.25 d, while successive winter solstices are ≈365.2422 d
 * apart, so the 60th window (頤) overhangs the next 冬至 by ~0.1 day at most.
 * The index is clamped to 59 and the last window's end is trimmed to the next
 * 冬至, so 頤 absorbs the remainder rather than wrapping.
 */
export function dayHexagram(
  civil: HexagramCivilDate,
  opts: DayHexagramOptions = {},
): DayHexagramResult {
  const offsetMinutes = opts.utcOffsetMinutes ?? 480; // UTC+8
  const judgeHour = opts.judgeAtLocalHour ?? 12;

  const judgeMs =
    Date.UTC(civil.year, civil.month - 1, civil.day) +
    judgeHour * 3_600_000 -
    offsetMinutes * 60_000;

  const solstice = priorWinterSolstice(judgeMs);
  const elapsedDays = (judgeMs - solstice) / DAY_MS;
  const index = Math.max(0, Math.min(59, Math.floor(elapsedDays / GUA_QI_STEP_DAYS)));

  const windowStart = solstice + index * GUA_QI_STEP_DAYS * DAY_MS;
  let windowEnd = solstice + (index + 1) * GUA_QI_STEP_DAYS * DAY_MS;
  if (index === 59) {
    const nextSolstice = winterSolsticeMillis(new Date(solstice).getUTCFullYear() + 1);
    if (nextSolstice > windowStart) windowEnd = Math.min(windowEnd, nextSolstice);
  }

  const entry = guaQiSequence[index];
  return {
    hexagram: entry.hexagram,
    rank: entry.rank,
    rankEn: entry.rankEn,
    midQiTerm: entry.midQiTerm,
    windowStartIso: isoSecond(windowStart),
    windowEndIso: isoSecond(windowEnd),
    index,
    entry,
  };
}

/** ISO-8601 UTC rounded to the second — the sub-second digits are solver noise. */
function isoSecond(utcMillis: number): string {
  return new Date(Math.round(utcMillis / 1000) * 1000).toISOString().replace(/\.000Z$/, "Z");
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. meihuaCast — 梅花易數 年月日時起卦
// ─────────────────────────────────────────────────────────────────────────────

export interface MeihuaLunarDate {
  /**
   * Earthly-branch index of the LUNAR YEAR pillar in the repo's 0-based
   * ordering (子=0, 丑=1, … 亥=11 — the `BRANCHES` convention in symbols.ts).
   * Converted internally to the doctrinal 1-based numbering; see below.
   */
  yearBranchIndex: number;
  /**
   * Lunar month number 1..12 as printed in the almanac.
   *
   * 閏月 FORK — the caller decides, and this module cannot: the classical text
   * gives no rule for a leap month. Callers in this repo pass a 閏月 under its
   * OWN number (閏六月 → 6), which is what the almanac prints; other lines count
   * a 閏月 as the FOLLOWING month (閏六月 → 7), which shifts every downstream
   * term by one and casts a different hexagram. Whichever a caller picks, the
   * UI must say so rather than let the reader assume there is one answer.
   */
  month: number;
  /** Lunar day of month, 1..30. */
  day: number;
}

export interface MeihuaCastResult {
  /** 本卦 — the primary hexagram. */
  hexagram: Hexagram;
  /** 動爻 — the moving line, 1..6 counting from the BOTTOM. */
  movingLine: number;
  /** 上卦. */
  upperTrigram: Trigram;
  /** 下卦. */
  lowerTrigram: Trigram;
  /** 變卦 — the primary hexagram with the moving line flipped. */
  changedHexagram: Hexagram;
  /** 年+月+日, the sum the 上卦 is taken from. Exposed so the working can be shown. */
  upperSum: number;
  /** 年+月+日+時, the sum the 下卦 and the 動爻 are taken from. */
  totalSum: number;
}

/**
 * 梅花易數 年月日時起卦 — a CAST for a moment, not a calendar entry.
 *
 * 《梅花易數》卷一「年月日時起例」:
 * 「年月日為上卦。年月日加時總數為下卦。又以年月日時總數取爻。
 *   如子年一數，丑年二數，直至亥年十二數…以八除之，餘數作卦…以六除，餘數作動爻。」
 *
 *   上卦 = (年支 + 月 + 日) mod 8      (0 → 8)
 *   下卦 = (年支 + 月 + 日 + 時支) mod 8 (0 → 8)
 *   動爻 = (年支 + 月 + 日 + 時支) mod 6 (0 → 6)
 *
 * read against the 先天八卦數 乾1 兌2 離3 震4 巽5 坎6 艮7 坤8.
 *
 * ── Conventions that matter ─────────────────────────────────────────────────
 *
 * - Branch numbering is 子=1 … 亥=12, per the source text. This is REQUIRED:
 *   a 0-based numbering (子=0) shifts every result by one trigram and fails
 *   the reference cast. The parameters here are the repo's 0-based branch
 *   indices and +1 is applied inside, so callers keep one convention.
 * - The date is the CHINESE LUNISOLAR date — lunar year branch, lunar month,
 *   lunar day. Feeding the Gregorian month/day gives a different hexagram.
 *   The engine does not compute the lunar date (that would mean importing
 *   lunar-javascript, which belongs under verification/), so the caller
 *   supplies it.
 * - The "0 → 8" and "0 → 6" wraps are the universal modern practitioner
 *   convention, not stated in the classical text (its worked example never hits
 *   a zero remainder); they are forced arithmetically, since the divisor itself
 *   is a valid trigram/line index.
 * - This is a TECHNIQUE, not a calendar. The hour term exists precisely to
 *   individuate a moment. Calling it with a fixed hour to get a "hexagram of
 *   the day" is a convention with no classical warrant — the classics contain
 *   no day-without-hour formulation. Anything built on it must be labelled a
 *   cast, and must never be presented as the day's hexagram.
 *
 * Reference cast from the source itself (觀梅占): 辰年(5) 十二月(12) 十七日(17)
 * 申時(9) → 上兌 下離 = 澤火革 (49), moving line 1.
 */
export function meihuaCast(lunar: MeihuaLunarDate, hourBranchIndex: number): MeihuaCastResult {
  const { yearBranchIndex, month, day } = lunar;
  if (!Number.isInteger(yearBranchIndex) || yearBranchIndex < 0 || yearBranchIndex > 11) {
    throw new RangeError(`lunar year branch index out of range (0..11): ${yearBranchIndex}`);
  }
  if (!Number.isInteger(hourBranchIndex) || hourBranchIndex < 0 || hourBranchIndex > 11) {
    throw new RangeError(`hour branch index out of range (0..11): ${hourBranchIndex}`);
  }
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new RangeError(`lunar month out of range (1..12): ${month}`);
  }
  if (!Number.isInteger(day) || day < 1 || day > 30) {
    throw new RangeError(`lunar day out of range (1..30): ${day}`);
  }

  const yearNumber = yearBranchIndex + 1; // 子=1 … 亥=12
  const hourNumber = hourBranchIndex + 1; // 子=1 … 亥=12

  const upperSum = yearNumber + month + day;
  const totalSum = upperSum + hourNumber;

  const upperTrigram = trigramByXianTian(upperSum % 8 || 8);
  const lowerTrigram = trigramByXianTian(totalSum % 8 || 8);
  const movingLine = totalSum % 6 || 6;

  const hexagram = hexagramByTrigrams(upperTrigram.xianTian, lowerTrigram.xianTian);
  const changedLines = hexagram.lines.map((v, i) => (i === movingLine - 1 ? !v : v));

  return {
    hexagram,
    movingLine,
    upperTrigram,
    lowerTrigram,
    changedHexagram: hexagramByLines(changedLines),
    upperSum,
    totalSum,
  };
}
