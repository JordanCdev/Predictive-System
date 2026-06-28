/**
 * Layer 2 — Symbolic kernel: canonical domain ontology.
 *
 * Static, versioned lookup tables. Every value here is a deterministic
 * constant drawn from classical Chinese metaphysics primitives
 * (cf. spec §4 "Canonical Domain Ontology"). Nothing in this file performs
 * astronomy or scoring — it is pure reference data + total functions over it.
 */

export type FivePhase = "wood" | "fire" | "earth" | "metal" | "water";
export type YinYang = "yang" | "yin";

export interface Stem {
  index: number; // 0..9
  hanzi: string;
  pinyin: string;
  phase: FivePhase;
  yinYang: YinYang;
}

export interface Branch {
  index: number; // 0..11
  hanzi: string;
  pinyin: string;
  animal: string;
  phase: FivePhase;
  yinYang: YinYang;
  /** Inclusive-exclusive local clock range for the classical double-hour. */
  hourStart: number; // hour at which this branch's double-hour begins (e.g. 子 = 23)
}

// 天干 — Heavenly Stems, canonical order 甲..癸
export const STEMS: Stem[] = [
  { index: 0, hanzi: "甲", pinyin: "Jiǎ", phase: "wood", yinYang: "yang" },
  { index: 1, hanzi: "乙", pinyin: "Yǐ", phase: "wood", yinYang: "yin" },
  { index: 2, hanzi: "丙", pinyin: "Bǐng", phase: "fire", yinYang: "yang" },
  { index: 3, hanzi: "丁", pinyin: "Dīng", phase: "fire", yinYang: "yin" },
  { index: 4, hanzi: "戊", pinyin: "Wù", phase: "earth", yinYang: "yang" },
  { index: 5, hanzi: "己", pinyin: "Jǐ", phase: "earth", yinYang: "yin" },
  { index: 6, hanzi: "庚", pinyin: "Gēng", phase: "metal", yinYang: "yang" },
  { index: 7, hanzi: "辛", pinyin: "Xīn", phase: "metal", yinYang: "yin" },
  { index: 8, hanzi: "壬", pinyin: "Rén", phase: "water", yinYang: "yang" },
  { index: 9, hanzi: "癸", pinyin: "Guǐ", phase: "water", yinYang: "yin" },
];

// 地支 — Earthly Branches, canonical order 子..亥
export const BRANCHES: Branch[] = [
  { index: 0, hanzi: "子", pinyin: "Zǐ", animal: "Rat", phase: "water", yinYang: "yang", hourStart: 23 },
  { index: 1, hanzi: "丑", pinyin: "Chǒu", animal: "Ox", phase: "earth", yinYang: "yin", hourStart: 1 },
  { index: 2, hanzi: "寅", pinyin: "Yín", animal: "Tiger", phase: "wood", yinYang: "yang", hourStart: 3 },
  { index: 3, hanzi: "卯", pinyin: "Mǎo", animal: "Rabbit", phase: "wood", yinYang: "yin", hourStart: 5 },
  { index: 4, hanzi: "辰", pinyin: "Chén", animal: "Dragon", phase: "earth", yinYang: "yang", hourStart: 7 },
  { index: 5, hanzi: "巳", pinyin: "Sì", animal: "Snake", phase: "fire", yinYang: "yin", hourStart: 9 },
  { index: 6, hanzi: "午", pinyin: "Wǔ", animal: "Horse", phase: "fire", yinYang: "yang", hourStart: 11 },
  { index: 7, hanzi: "未", pinyin: "Wèi", animal: "Goat", phase: "earth", yinYang: "yin", hourStart: 13 },
  { index: 8, hanzi: "申", pinyin: "Shēn", animal: "Monkey", phase: "metal", yinYang: "yang", hourStart: 15 },
  { index: 9, hanzi: "酉", pinyin: "Yǒu", animal: "Rooster", phase: "metal", yinYang: "yin", hourStart: 17 },
  { index: 10, hanzi: "戌", pinyin: "Xū", animal: "Dog", phase: "earth", yinYang: "yang", hourStart: 19 },
  { index: 11, hanzi: "亥", pinyin: "Hài", animal: "Pig", phase: "water", yinYang: "yin", hourStart: 21 },
];

export const PHASE_LABEL: Record<FivePhase, string> = {
  wood: "Wood 木",
  fire: "Fire 火",
  earth: "Earth 土",
  metal: "Metal 金",
  water: "Water 水",
};

/** Generating cycle 生: producer → produced. */
const GENERATES: Record<FivePhase, FivePhase> = {
  wood: "fire",
  fire: "earth",
  earth: "metal",
  metal: "water",
  water: "wood",
};

/** Controlling cycle 克: controller → controlled. */
const CONTROLS: Record<FivePhase, FivePhase> = {
  wood: "earth",
  earth: "water",
  water: "fire",
  fire: "metal",
  metal: "wood",
};

export function generates(a: FivePhase, b: FivePhase): boolean {
  return GENERATES[a] === b;
}
export function controls(a: FivePhase, b: FivePhase): boolean {
  return CONTROLS[a] === b;
}
export function phaseGeneratedBy(p: FivePhase): FivePhase {
  return (Object.keys(GENERATES) as FivePhase[]).find((k) => GENERATES[k] === p)!;
}
export function phaseControlledBy(p: FivePhase): FivePhase {
  return (Object.keys(CONTROLS) as FivePhase[]).find((k) => CONTROLS[k] === p)!;
}
export function phaseGenerates(p: FivePhase): FivePhase {
  return GENERATES[p];
}
export function phaseControls(p: FivePhase): FivePhase {
  return CONTROLS[p];
}

/**
 * 藏干 — hidden stems of each branch with relative weights used for
 * element accounting. Main qi ~0.6, middle ~0.3, residual ~0.1 (a common
 * Zi Ping convention; weights are an explicit engine convention, not a
 * universal truth). Single-stem branches carry full weight 1.0.
 */
export interface HiddenStem {
  stem: number; // stem index 0..9
  weight: number;
}
export const HIDDEN_STEMS: HiddenStem[][] = [
  /* 子 */ [{ stem: 9, weight: 1.0 }], // 癸
  /* 丑 */ [{ stem: 5, weight: 0.6 }, { stem: 9, weight: 0.3 }, { stem: 7, weight: 0.1 }], // 己癸辛
  /* 寅 */ [{ stem: 0, weight: 0.6 }, { stem: 2, weight: 0.3 }, { stem: 4, weight: 0.1 }], // 甲丙戊
  /* 卯 */ [{ stem: 1, weight: 1.0 }], // 乙
  /* 辰 */ [{ stem: 4, weight: 0.6 }, { stem: 1, weight: 0.3 }, { stem: 9, weight: 0.1 }], // 戊乙癸
  /* 巳 */ [{ stem: 2, weight: 0.6 }, { stem: 6, weight: 0.3 }, { stem: 4, weight: 0.1 }], // 丙庚戊
  /* 午 */ [{ stem: 3, weight: 0.7 }, { stem: 5, weight: 0.3 }], // 丁己
  /* 未 */ [{ stem: 5, weight: 0.6 }, { stem: 3, weight: 0.3 }, { stem: 1, weight: 0.1 }], // 己丁乙
  /* 申 */ [{ stem: 6, weight: 0.6 }, { stem: 8, weight: 0.3 }, { stem: 4, weight: 0.1 }], // 庚壬戊
  /* 酉 */ [{ stem: 7, weight: 1.0 }], // 辛
  /* 戌 */ [{ stem: 4, weight: 0.6 }, { stem: 7, weight: 0.3 }, { stem: 3, weight: 0.1 }], // 戊辛丁
  /* 亥 */ [{ stem: 8, weight: 0.7 }, { stem: 0, weight: 0.3 }], // 壬甲
];

// 十神 — Ten Gods relative to the Day Master.
export type TenGod =
  | "friend" // 比肩
  | "rob_wealth" // 劫財
  | "eating_god" // 食神
  | "hurting_officer" // 傷官
  | "indirect_wealth" // 偏財
  | "direct_wealth" // 正財
  | "seven_killings" // 七殺
  | "direct_officer" // 正官
  | "indirect_resource" // 偏印
  | "direct_resource"; // 正印

export const TEN_GOD_LABEL: Record<TenGod, string> = {
  friend: "Friend 比肩",
  rob_wealth: "Rob Wealth 劫財",
  eating_god: "Eating God 食神",
  hurting_officer: "Hurting Officer 傷官",
  indirect_wealth: "Indirect Wealth 偏財",
  direct_wealth: "Direct Wealth 正財",
  seven_killings: "Seven Killings 七殺",
  direct_officer: "Direct Officer 正官",
  indirect_resource: "Indirect Resource 偏印",
  direct_resource: "Direct Resource 正印",
};

/**
 * Deterministic Ten God mapping (spec §6.1). The relation depends only on
 * the day-master phase/polarity vs. the other stem's phase/polarity.
 */
export function tenGodOf(dayMaster: Stem, other: Stem): TenGod {
  const sameYin = dayMaster.yinYang === other.yinYang;
  if (other.phase === dayMaster.phase) return sameYin ? "friend" : "rob_wealth";
  if (generates(dayMaster.phase, other.phase)) return sameYin ? "eating_god" : "hurting_officer";
  if (controls(dayMaster.phase, other.phase)) return sameYin ? "indirect_wealth" : "direct_wealth";
  if (controls(other.phase, dayMaster.phase)) return sameYin ? "seven_killings" : "direct_officer";
  // remaining case: other generates dayMaster
  return sameYin ? "indirect_resource" : "direct_resource";
}

/** Which of the five "god groups" a Ten God belongs to (for objective bias). */
export type GodGroup = "companion" | "output" | "wealth" | "officer" | "resource";
export function godGroupOf(g: TenGod): GodGroup {
  switch (g) {
    case "friend":
    case "rob_wealth":
      return "companion";
    case "eating_god":
    case "hurting_officer":
      return "output";
    case "indirect_wealth":
    case "direct_wealth":
      return "wealth";
    case "seven_killings":
    case "direct_officer":
      return "officer";
    case "indirect_resource":
    case "direct_resource":
      return "resource";
  }
}

/**
 * 納音 — Na Yin: each of the 30 consecutive Gan-Zhi pairs maps to an
 * elemental "sound". Indexed by floor(ganzhiIndex / 2).
 */
export interface NaYin {
  nameZh: string;
  nameEn: string;
  phase: FivePhase;
}
export const NA_YIN: NaYin[] = [
  { nameZh: "海中金", nameEn: "Sea Metal", phase: "metal" }, // 甲子乙丑
  { nameZh: "爐中火", nameEn: "Furnace Fire", phase: "fire" }, // 丙寅丁卯
  { nameZh: "大林木", nameEn: "Forest Wood", phase: "wood" }, // 戊辰己巳
  { nameZh: "路旁土", nameEn: "Roadside Earth", phase: "earth" }, // 庚午辛未
  { nameZh: "劍鋒金", nameEn: "Sword Metal", phase: "metal" }, // 壬申癸酉
  { nameZh: "山頭火", nameEn: "Mountain Fire", phase: "fire" }, // 甲戌乙亥
  { nameZh: "澗下水", nameEn: "Stream Water", phase: "water" }, // 丙子丁丑
  { nameZh: "城頭土", nameEn: "City-Wall Earth", phase: "earth" }, // 戊寅己卯
  { nameZh: "白蠟金", nameEn: "Wax Metal", phase: "metal" }, // 庚辰辛巳
  { nameZh: "楊柳木", nameEn: "Willow Wood", phase: "wood" }, // 壬午癸未
  { nameZh: "泉中水", nameEn: "Spring Water", phase: "water" }, // 甲申乙酉
  { nameZh: "屋上土", nameEn: "Rooftop Earth", phase: "earth" }, // 丙戌丁亥
  { nameZh: "霹靂火", nameEn: "Lightning Fire", phase: "fire" }, // 戊子己丑
  { nameZh: "松柏木", nameEn: "Pine Wood", phase: "wood" }, // 庚寅辛卯
  { nameZh: "長流水", nameEn: "Flowing Water", phase: "water" }, // 壬辰癸巳
  { nameZh: "沙中金", nameEn: "Sand Metal", phase: "metal" }, // 甲午乙未
  { nameZh: "山下火", nameEn: "Foothill Fire", phase: "fire" }, // 丙申丁酉
  { nameZh: "平地木", nameEn: "Plain Wood", phase: "wood" }, // 戊戌己亥
  { nameZh: "壁上土", nameEn: "Wall Earth", phase: "earth" }, // 庚子辛丑
  { nameZh: "金箔金", nameEn: "Gold-Foil Metal", phase: "metal" }, // 壬寅癸卯
  { nameZh: "覆燈火", nameEn: "Lamp Fire", phase: "fire" }, // 甲辰乙巳
  { nameZh: "天河水", nameEn: "Sky-River Water", phase: "water" }, // 丙午丁未
  { nameZh: "大驛土", nameEn: "Post-Station Earth", phase: "earth" }, // 戊申己酉
  { nameZh: "釵釧金", nameEn: "Hairpin Metal", phase: "metal" }, // 庚戌辛亥
  { nameZh: "桑柘木", nameEn: "Mulberry Wood", phase: "wood" }, // 壬子癸丑
  { nameZh: "大溪水", nameEn: "Great-Stream Water", phase: "water" }, // 甲寅乙卯
  { nameZh: "沙中土", nameEn: "Sand Earth", phase: "earth" }, // 丙辰丁巳
  { nameZh: "天上火", nameEn: "Heaven Fire", phase: "fire" }, // 戊午己未
  { nameZh: "石榴木", nameEn: "Pomegranate Wood", phase: "wood" }, // 庚申辛酉
  { nameZh: "大海水", nameEn: "Great-Sea Water", phase: "water" }, // 壬戌癸亥
];

export function naYinOf(ganzhiIndex: number): NaYin {
  return NA_YIN[Math.floor(mod(ganzhiIndex, 60) / 2)];
}

// --- small numeric helpers shared across the engine -------------------------

export function mod(n: number, m: number): number {
  return ((n % m) + m) % m;
}

export interface GanZhi {
  index: number; // 0..59 (甲子 = 0)
  stem: Stem;
  branch: Branch;
  hanzi: string;
  pinyin: string;
}

export function ganZhiFromIndex(index: number): GanZhi {
  const i = mod(index, 60);
  const stem = STEMS[i % 10];
  const branch = BRANCHES[i % 12];
  return {
    index: i,
    stem,
    branch,
    hanzi: stem.hanzi + branch.hanzi,
    pinyin: `${stem.pinyin}${branch.pinyin}`,
  };
}

/**
 * 三合 (Three-Harmony) frames → the element they pool into. The middle branch
 * (index 1) is the cardinal/旺 branch (子午卯酉); a half-frame (2 of 3) only
 * counts when it includes that cardinal.
 */
export const THREE_HARMONY: { branches: number[]; element: FivePhase }[] = [
  { branches: [8, 0, 4], element: "water" }, // 申子辰
  { branches: [2, 6, 10], element: "fire" }, // 寅午戌
  { branches: [5, 9, 1], element: "metal" }, // 巳酉丑
  { branches: [11, 3, 7], element: "wood" }, // 亥卯未
];

/** 三會 (Three-Meeting, directional/seasonal) frames → element. */
export const THREE_MEETING: { branches: number[]; element: FivePhase }[] = [
  { branches: [2, 3, 4], element: "wood" }, // 寅卯辰 (spring/east)
  { branches: [5, 6, 7], element: "fire" }, // 巳午未 (summer/south)
  { branches: [8, 9, 10], element: "metal" }, // 申酉戌 (autumn/west)
  { branches: [11, 0, 1], element: "water" }, // 亥子丑 (winter/north)
];

/** 六合 (Six-Harmony) pairs → the element commonly assigned to the union. */
export const SIX_HARMONY_PAIRS: { branches: number[]; element: FivePhase }[] = [
  { branches: [0, 1], element: "earth" }, // 子丑
  { branches: [2, 11], element: "wood" }, // 寅亥
  { branches: [3, 10], element: "fire" }, // 卯戌
  { branches: [4, 9], element: "metal" }, // 辰酉
  { branches: [5, 8], element: "water" }, // 巳申
  { branches: [6, 7], element: "fire" }, // 午未
];

/** Two branches clash (相沖) when they sit opposite on the 12-branch ring. */
export function branchesClash(a: number, b: number): boolean {
  return mod(a - b, 12) === 6;
}

/** The branch that clashes a given branch (its zodiac "opposite"). */
export function clashBranch(branchIndex: number): number {
  return mod(branchIndex + 6, 12);
}
