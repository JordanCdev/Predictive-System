/**
 * 日家紫白 — the day's Purple-White flying star (三元紫白擇日法).
 *
 * ─── WHAT THIS MODULE IS AND IS NOT ──────────────────────────────────────────
 *
 * DISPLAY ONLY. Nothing here reaches `recommendationScore`, the decision
 * kernel, or `calculationHash`. `decision.ts` must never import this file; a
 * test in tests/flyingStar.test.ts pins that. It is a calendar fact shown
 * beside the reading, not an input to it.
 *
 * NO INTERPRETATION. The nine stars carry a large auspicious/inauspicious
 * literature (五黃煞 and friends). None of it is sourced here, so none of it is
 * emitted: this module returns a number, its Chinese name, and a colour gloss.
 * The English words below are colour names, not readings.
 *
 * ─── THE DOCTRINE (not in dispute) ───────────────────────────────────────────
 *
 * The 紫白 set runs at year / month / day / hour level. At day level the
 * tropical year is cut in two at the solstices:
 *
 *   陽遁 冬至 → 夏至   the stars ASCEND  (順行, +1 per day)
 *   陰遁 夏至 → 冬至   the stars DESCEND (逆行, −1 per day)
 *
 * Each half is three 60-day 元, and because 60 ≡ 6 (mod 9) the successive 元
 * start on 一白 → 七赤 → 四綠 (yang) and 九紫 → 三碧 → 六白 (yin) — which is
 * exactly a continuous ±1 run through the whole half, so only ONE anchor per
 * half is actually needed. Two independent classical mnemonics carry this:
 *
 *   「日家白法不難求，二十四氣六宮周，冬至、雨水及穀雨，陽順一七四中游；
 *     夏至、處暑、霜降後，九三六星逆行求」
 *   「冬至一白雨水七，谷雨四順起初一；夏至九宮處暑三，霜降六上逆同關」
 *
 * We deliberately use the 2-anchor (冬至/夏至 only) form rather than wiring the
 * four sub-terms 雨水/穀雨/處暑/霜降. The 6-anchor form is algebraically implied
 * by the 2-anchor one in most years but SELF-CONTRADICTS in ~2% of years (e.g.
 * 1911, 1934, 1968, 1991), when a 甲子 lands within a day or two of a sub-term.
 * The 2-anchor form is always well-defined.
 *
 * ─── THE ONE GENUINE FORK (which is why this module returns TWO answers) ─────
 *
 * Which 甲子 day the 60-day 元 is numbered from is contested, and the two
 * readings are named lineages, not a bug:
 *
 *   通書 / 曆書 school    the FIRST 甲子 ON OR AFTER the solar term.
 *                         (Taiwanese/Malaysian 通書 line; 2026-07-25 → 六白 6.)
 *   超神接氣 school       the NEAREST 甲子, so a 甲子 a few days BEFORE the term
 *                         already carries the new 元 (超神). Mainland 黃曆
 *                         publish this reading; 2026-07-25 → 九紫 9.
 *                         鍾義明 (Taiwan) argues the same outcome explicitly —
 *                         「冬至前約22天…甲子日已感應到北斗七星一白之氣」.
 *
 * They disagree on 2182 of the 5844 days from 2020-01-01 to 2035-12-31 (37%;
 * over a full sweep of the beat, 1990–2050, it settles near half), always by ±3
 * (mod 9), because the two anchors sit exactly 60 days apart and 60 ≡ 6 (mod 9).
 *
 * That divergence is NOT sprinkled across the calendar, and no per-day
 * frequency describes it. Consecutive half-years move their anchoring 甲子
 * only 2–3 days along (182 or 183 ≡ 2 or 3 mod 60), so whether the nearest 甲子
 * falls before or after the solstice changes rarely and then stays changed:
 * agreement is constant within a half, and the halves clump into multi-year
 * BLOCKS. Measured: the schools agree on every day from 2020-06-21 to
 * 2026-06-20, differ on every day from 2026-06-21 to 2031-12-21, agree again
 * from 2031-12-22. `flyingStarAgreementRun` computes the current block's bounds
 * so the UI can state them instead of quoting a frequency.
 *
 * Because the divergence is structural rather than occasional,
 * `dayFlyingStar` computes BOTH and the UI shows both. We have no doctrinal
 * basis to declare either wrong: the underlying doctrine is well attested, but
 * the anchor rule is attested only as a named convention in secondary sources
 * (163.com's 紫白期择日法, which is blunt that this is a live dispute) — we have
 * not read the passage in a primary Qing text such as 協紀辨方書.
 *
 * CALIBRATION FACT, recorded here and NOT shown in the UI: the 通書 rule
 * reproduces five numbers printed in Joey Yap's own Tong Shu Diary — "5/5" on
 * 2008-06-21, "2/8" on 2008-12-21 (outgoing/incoming pairs), and 6 for
 * 2026-07-25. That is strong evidence about what THAT PUBLISHER's software
 * implements. It is not evidence about which lineage is doctrinally right, and
 * it must never be used on screen as a justification for preferring a school.
 *
 * ─── LOAD-BEARING CONVENTIONS ────────────────────────────────────────────────
 *
 * 1. DATE-level, never instant-level, solstice comparison. 冬至 2025 fell at
 *    23:03 UTC+8 on 2025-12-21 — and that civil day is ITSELF 甲子. An
 *    instant-level test would reject it, push the anchor 60 days to
 *    2026-02-19, and shift an entire half-year by 3.
 * 2. UTC+8 evaluation, deliberately, for every user. The lineage's tables,
 *    almanacs and 通書 are all read in China Standard Time; a solstice near
 *    local midnight moves the anchor by up to 60 days, i.e. the star by 3. So
 *    the widget is pinned to UTC+8 rather than following the viewer's chart
 *    timezone, and the UI says so rather than hiding it.
 * 3. `offsetDays` is often NEGATIVE (the date lies between the solstice and its
 *    anchoring 甲子, and the run is back-extrapolated). That is correct and
 *    required — the "8" in Joey Yap's printed "2/8" can only arise that way.
 *    Every modulo below is a TRUE floor modulo.
 *
 * ─── NOT BUILT, ON PURPOSE ───────────────────────────────────────────────────
 *
 * The 9-palace grid (day star to 中宮, the other eight flying out). Sources
 * genuinely vary on the flight direction — many 玄空 practitioners always fly
 * 順 — and the centre number is what the sourcing supports. Also no
 * auspiciousness of any kind, and no wiring to the four sub-terms.
 *
 * ─── DETERMINISM ─────────────────────────────────────────────────────────────
 *
 * No network, no LLM, no `Date.now()`, no `Math.random()`. `lunar-javascript`
 * is NOT imported (it lives only under src/engine/verification/**). Solstices
 * come from the repo's own solar-longitude solver in ./astronomy.ts —
 * λ=270° (冬至) and λ=90° (夏至) — never from a hardcoded table. A caller may
 * substitute its own resolver (comparison, sensitivity sweeps); the default is
 * pure and memoised.
 */

import { findSolarLongitudeCrossing, gregorianToJDN } from "./astronomy.ts";
import { dayGanzhiIndexFromCivilDate } from "./sexagenary.ts";

// ─────────────────────────────────────────────────────────────────────────────
// 1. The nine stars
// ─────────────────────────────────────────────────────────────────────────────

export interface FlyingStarName {
  /** 1..9 */
  star: number;
  /** 一白, 二黑, … — the name as printed. */
  nameZh: string;
  /**
   * The COLOUR in the name, nothing more. Not a reading: 五黃 is "Yellow"
   * here, not "the yellow calamity", because we have not sourced meanings.
   */
  colourEn: string;
}

/** 一白 … 九紫, indexed 1..9 via `starName()`. */
export const FLYING_STAR_NAMES: readonly FlyingStarName[] = [
  { star: 1, nameZh: "一白", colourEn: "White" },
  { star: 2, nameZh: "二黑", colourEn: "Black" },
  { star: 3, nameZh: "三碧", colourEn: "Jade" },
  { star: 4, nameZh: "四綠", colourEn: "Green" },
  { star: 5, nameZh: "五黃", colourEn: "Yellow" },
  { star: 6, nameZh: "六白", colourEn: "White" },
  { star: 7, nameZh: "七赤", colourEn: "Red" },
  { star: 8, nameZh: "八白", colourEn: "White" },
  { star: 9, nameZh: "九紫", colourEn: "Purple" },
];

export function starName(star: number): FlyingStarName {
  const hit = FLYING_STAR_NAMES[star - 1];
  if (!hit) throw new RangeError(`flying star out of range: ${star}`);
  return hit;
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. The two schools
// ─────────────────────────────────────────────────────────────────────────────

export type FlyingStarSchool = "tongShu" | "chaoShen";

export interface FlyingStarSchoolInfo {
  id: FlyingStarSchool;
  nameZh: string;
  nameEn: string;
  /** One plain sentence, safe to print verbatim in the UI. */
  anchorRuleEn: string;
  /** Where this reading is normally met in print. */
  seenInEn: string;
}

export const FLYING_STAR_SCHOOLS: Record<FlyingStarSchool, FlyingStarSchoolInfo> = {
  tongShu: {
    id: "tongShu",
    nameZh: "通書／曆書",
    nameEn: "Tong Shu almanac school",
    anchorRuleEn: "numbers the 60-day 元 from the first 甲子 day on or after the solstice",
    seenInEn: "Taiwanese and Malaysian 通書",
  },
  chaoShen: {
    id: "chaoShen",
    nameZh: "超神接氣",
    nameEn: "Chao Shen Jie Qi school",
    anchorRuleEn:
      "numbers the 60-day 元 from the nearest 甲子 day, so a 甲子 falling shortly before the solstice already carries the new 元 (超神)",
    seenInEn: "mainland 黃曆",
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 3. Result shape
// ─────────────────────────────────────────────────────────────────────────────

export interface FlyingStarCivilDate {
  year: number;
  month: number; // 1..12
  day: number; // 1..31
}

export interface GoverningSolstice {
  kind: "winter" | "summer";
  /** 冬至 or 夏至. */
  nameZh: string;
  /** Civil date in UTC+8 — the value the anchor search actually uses. */
  dateIso: string;
  /** The solver's instant, UTC, to the minute. Shown so the date-level rule is auditable. */
  instantIso: string;
}

export interface FlyingStarReading {
  /** 1..9. */
  star: number;
  /** The name as printed — 六白. (`name` is the Chinese name; `colourEn` glosses it.) */
  name: string;
  colourEn: string;
  school: FlyingStarSchool;
  /** 陽遁 (ascending, after 冬至) or 陰遁 (descending, after 夏至). */
  half: "yang" | "yin";
  /** 順行 +1/day or 逆行 −1/day. */
  direction: "forward" | "reverse";
  governingSolstice: GoverningSolstice;
  /** Civil date (UTC+8) of the 甲子 the run is numbered from. */
  anchorIso: string;
  /** Whole days from the anchor. NEGATIVE means back-extrapolated — expected. */
  offsetDays: number;
}

export interface FlyingStarPair {
  tongShu: FlyingStarReading;
  chaoShen: FlyingStarReading;
  /**
   * True when both schools anchor this half-year on the same 甲子. Constant
   * across a whole half, and in practice across a run of halves — see
   * `flyingStarAgreementRun`. When false, the two differ by ±3 (mod 9).
   */
  agree: boolean;
}

export interface DayFlyingStar extends FlyingStarPair {
  /** The civil date asked for, ISO. */
  civilIso: string;
  /** Day pillar as a 1-based sexagenary index, 甲子 = 1 … 癸亥 = 60. */
  sexagenaryIndex: number;
  /**
   * Non-null ONLY when the civil date IS the governing solstice's own date, on
   * which both the closing and the opening run exist. 通書 print the pair as
   * "outgoing/incoming" (Joey Yap's diary prints "2/8" on 2008-12-21). The
   * top-level reading is always the INCOMING (new half) value.
   */
  outgoing: FlyingStarPair | null;
}

/**
 * Supplies the UTC instant of a solstice. Injectable so a caller can compare
 * ephemerides or run a sensitivity sweep; the default uses the repo's own
 * solver and is pure.
 */
export type SolsticeResolver = (kind: "winter" | "summer", gregorianYear: number) => number;

// ─────────────────────────────────────────────────────────────────────────────
// 4. Calendar plumbing
// ─────────────────────────────────────────────────────────────────────────────

/** UTC+8 — this lineage's reference zone. See "LOAD-BEARING CONVENTIONS" above. */
export const REFERENCE_UTC_OFFSET_MINUTES = 480;

/** TRUE floor modulo. `off` goes negative and the naive `%` would too. */
function fmod(a: number, n: number): number {
  return ((a % n) + n) % n;
}

/** Inverse of `gregorianToJDN` (Fliegel & Van Flandern). */
export function jdnToGregorian(jdn: number): FlyingStarCivilDate {
  let l = jdn + 68569;
  const n = Math.floor((4 * l) / 146097);
  l -= Math.floor((146097 * n + 3) / 4);
  const i = Math.floor((4000 * (l + 1)) / 1461001);
  l = l - Math.floor((1461 * i) / 4) + 31;
  const j = Math.floor((80 * l) / 2447);
  const day = l - Math.floor((2447 * j) / 80);
  l = Math.floor(j / 11);
  const month = j + 2 - 12 * l;
  const year = 100 * (n - 49) + i + l;
  return { year, month, day };
}

function isoDate(d: FlyingStarCivilDate): string {
  const p = (v: number) => String(v).padStart(2, "0");
  return `${String(d.year).padStart(4, "0")}-${p(d.month)}-${p(d.day)}`;
}

/** ISO to the minute, UTC — the solver's sub-minute digits are noise. */
function isoMinute(utcMillis: number): string {
  const t = new Date(Math.round(utcMillis / 60000) * 60000);
  return t.toISOString().replace(/:00\.000Z$/, "Z");
}

/** The civil date an instant falls on in UTC+8. */
function referenceCivilDate(utcMillis: number): FlyingStarCivilDate {
  const shifted = new Date(utcMillis + REFERENCE_UTC_OFFSET_MINUTES * 60_000);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  };
}

/** 1-based sexagenary index of a civil date's day pillar: 甲子 = 1 … 癸亥 = 60. */
export function sexagenaryDayIndex(d: FlyingStarCivilDate): number {
  return dayGanzhiIndexFromCivilDate(d.year, d.month, d.day) + 1;
}

/** Memoised default resolver — pure: the cache is a function of its key alone. */
const solsticeCache = new Map<string, number>();

export const defaultSolsticeResolver: SolsticeResolver = (kind, gregorianYear) => {
  const key = `${kind}:${gregorianYear}`;
  const hit = solsticeCache.get(key);
  if (hit !== undefined) return hit;
  const ms =
    kind === "winter"
      ? findSolarLongitudeCrossing(270, Date.UTC(gregorianYear, 11, 21, 12))
      : findSolarLongitudeCrossing(90, Date.UTC(gregorianYear, 5, 21, 12));
  solsticeCache.set(key, ms);
  return ms;
};

// ─────────────────────────────────────────────────────────────────────────────
// 5. The computation
// ─────────────────────────────────────────────────────────────────────────────

interface SolsticeEvent {
  kind: "winter" | "summer";
  /** The year the RESOLVER was asked for — 冬至 of year Y falls in December of Y. */
  gregorianYear: number;
  utcMillis: number;
  /** Civil date in UTC+8. */
  date: FlyingStarCivilDate;
  jdn: number;
}

function solsticeEvent(
  kind: "winter" | "summer",
  gregorianYear: number,
  resolve: SolsticeResolver,
): SolsticeEvent {
  const utcMillis = resolve(kind, gregorianYear);
  const date = referenceCivilDate(utcMillis);
  return {
    kind,
    gregorianYear,
    utcMillis,
    date,
    jdn: gregorianToJDN(date.year, date.month, date.day),
  };
}

/** The half that opens immediately after this one closes. */
function nextSolstice(s: SolsticeEvent, resolve: SolsticeResolver): SolsticeEvent {
  return s.kind === "winter"
    ? solsticeEvent("summer", s.gregorianYear + 1, resolve)
    : solsticeEvent("winter", s.gregorianYear, resolve);
}

/** The half that closes as this one opens. */
function previousSolstice(s: SolsticeEvent, resolve: SolsticeResolver): SolsticeEvent {
  return s.kind === "winter"
    ? solsticeEvent("summer", s.gregorianYear, resolve)
    : solsticeEvent("winter", s.gregorianYear - 1, resolve);
}

function describeSolstice(s: SolsticeEvent): GoverningSolstice {
  return {
    kind: s.kind,
    nameZh: s.kind === "winter" ? "冬至" : "夏至",
    dateIso: isoDate(s.date),
    instantIso: isoMinute(s.utcMillis),
  };
}

/**
 * The 甲子 that anchors a half's run, as a JDN, under one school.
 *
 *   通書:     first 甲子 ON OR AFTER the solstice DATE (0..59 days later; if the
 *             solstice date is itself 甲子, that day).
 *   超神接氣: whichever of that 甲子 and the previous one (exactly 60 days
 *             earlier) is fewer days from the solstice date. On an exact tie
 *             (both 30 days away) the EARLIER one wins — 超神, the reading the
 *             school is named for.
 */
function anchorJdn(solstice: SolsticeEvent, school: FlyingStarSchool): number {
  const sx = sexagenaryDayIndex(solstice.date);
  const after = solstice.jdn + fmod(1 - sx, 60);
  if (school === "tongShu") return after;
  const before = after - 60;
  const distAfter = after - solstice.jdn; // 0..59
  const distBefore = solstice.jdn - before; // 1..60
  return distBefore <= distAfter ? before : after;
}

function readingFor(
  dateJdn: number,
  solstice: SolsticeEvent,
  school: FlyingStarSchool,
): FlyingStarReading {
  const anchor = anchorJdn(solstice, school);
  const off = dateJdn - anchor; // may be negative — see header note 3
  const star =
    solstice.kind === "winter"
      ? fmod(off, 9) + 1 // 陽遁 順行, 甲子 = 一白
      : fmod(8 - off, 9) + 1; // 陰遁 逆行, 甲子 = 九紫
  const name = starName(star);
  return {
    star,
    name: name.nameZh,
    colourEn: name.colourEn,
    school,
    half: solstice.kind === "winter" ? "yang" : "yin",
    direction: solstice.kind === "winter" ? "forward" : "reverse",
    governingSolstice: describeSolstice(solstice),
    anchorIso: isoDate(jdnToGregorian(anchor)),
    offsetDays: off,
  };
}

function pairFor(dateJdn: number, solstice: SolsticeEvent): FlyingStarPair {
  const tongShu = readingFor(dateJdn, solstice, "tongShu");
  const chaoShen = readingFor(dateJdn, solstice, "chaoShen");
  return { tongShu, chaoShen, agree: tongShu.star === chaoShen.star };
}

/**
 * 日家紫白 for a civil date, under BOTH schools.
 *
 * Steps (all date-level, all in UTC+8):
 *   1. governing solstice S = the most recent solstice whose UTC+8 DATE is ≤ D;
 *   2. anchor 甲子 A, per school (see `anchorJdn`);
 *   3. off = D − A in whole days, sign preserved;
 *   4. star = fmod(off, 9) + 1 after 冬至, fmod(8 − off, 9) + 1 after 夏至.
 *
 * On a solstice date itself both the closing and the opening run exist; the
 * returned reading is the INCOMING one and `outgoing` carries the other.
 */
function governingSolstice(
  civil: FlyingStarCivilDate,
  dateJdn: number,
  resolve: SolsticeResolver,
): { governing: SolsticeEvent; previous: SolsticeEvent | null } {
  // Four candidates bracket any date in `civil.year`: the most recent solstice
  // is always one of them, and its predecessor is the one before it in order.
  const candidates: SolsticeEvent[] = [
    solsticeEvent("summer", civil.year - 1, resolve),
    solsticeEvent("winter", civil.year - 1, resolve),
    solsticeEvent("summer", civil.year, resolve),
    solsticeEvent("winter", civil.year, resolve),
  ];

  let governingIndex = -1;
  for (let i = 0; i < candidates.length; i++) {
    if (candidates[i].jdn <= dateJdn) governingIndex = i;
  }
  /* c8 ignore next 3 -- unreachable: candidates[0] precedes any date in civil.year */
  if (governingIndex < 0) {
    throw new RangeError(`no governing solstice found for ${isoDate(civil)}`);
  }
  return {
    governing: candidates[governingIndex],
    previous: governingIndex > 0 ? candidates[governingIndex - 1] : null,
  };
}

export function dayFlyingStar(
  civil: FlyingStarCivilDate,
  solsticeResolver: SolsticeResolver = defaultSolsticeResolver,
): DayFlyingStar {
  const dateJdn = gregorianToJDN(civil.year, civil.month, civil.day);
  const { governing, previous } = governingSolstice(civil, dateJdn, solsticeResolver);

  const incoming = pairFor(dateJdn, governing);
  const onSolsticeDate = governing.jdn === dateJdn;

  return {
    civilIso: isoDate(civil),
    sexagenaryIndex: sexagenaryDayIndex(civil),
    tongShu: incoming.tongShu,
    chaoShen: incoming.chaoShen,
    agree: incoming.agree,
    outgoing: onSolsticeDate && previous ? pairFor(dateJdn, previous) : null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. How long the schools' agreement (or disagreement) lasts
// ─────────────────────────────────────────────────────────────────────────────

export interface FlyingStarAgreementRun {
  /** What holds across the run: true = the schools coincide, false = they differ. */
  agree: boolean;
  /** First civil date (UTC+8) of the run, ISO — always a solstice date. */
  startIso: string;
  /** Last civil date of the run, ISO — always the day before a solstice. */
  endIso: string;
  /** Whole days the run covers. */
  days: number;
  /** How many consecutive half-years it spans. */
  halves: number;
  /**
   * The 甲子 both schools anchor the date's OWN half on — non-null only when
   * `agree`, since that is exactly the case where there is one anchor to name.
   */
  sharedAnchorIso: string | null;
  /** False when the walk hit `maxHalves` instead of a genuine flip; the bound is then a floor. */
  startExact: boolean;
  endExact: boolean;
}

/** Both schools land on the same 甲子 for this half — constant across the half. */
function halfAgrees(s: SolsticeEvent): boolean {
  return anchorJdn(s, "tongShu") === anchorJdn(s, "chaoShen");
}

/**
 * The maximal run of consecutive half-years over which the two schools' verdict
 * (agree, or differ) is unchanged — i.e. the BLOCK this date sits in.
 *
 * Why this exists: agreement is a property of the HALF, not of the day (both
 * schools use one anchor for the whole half), and consecutive halves shift
 * their anchoring 甲子 by only 2–3 days mod 60, so halves clump into multi-year
 * blocks. A card that said "the schools happen to agree today" would be
 * describing a five-year structural fact as a coincidence. This returns the
 * bounds so the copy can state them.
 *
 * `maxHalves` bounds the walk in each direction (default 80 ≈ 40 years, far past
 * the ~11 halves an observed block runs to); on hitting it the returned bound is
 * a floor and the matching `startExact`/`endExact` is false. Pure.
 */
export function flyingStarAgreementRun(
  civil: FlyingStarCivilDate,
  solsticeResolver: SolsticeResolver = defaultSolsticeResolver,
  maxHalves = 80,
): FlyingStarAgreementRun {
  const dateJdn = gregorianToJDN(civil.year, civil.month, civil.day);
  const { governing } = governingSolstice(civil, dateJdn, solsticeResolver);
  const agree = halfAgrees(governing);

  let halves = 1;

  // Backwards: the run starts at the opening of the earliest matching half.
  let startJdn = governing.jdn;
  let startExact = false;
  let cur = governing;
  for (let i = 0; i < maxHalves; i++) {
    const prev = previousSolstice(cur, solsticeResolver);
    if (halfAgrees(prev) !== agree) {
      startExact = true;
      break;
    }
    cur = prev;
    startJdn = prev.jdn;
    halves++;
  }

  // Forwards: the run ends the day before the first non-matching half opens.
  let endJdn = governing.jdn;
  let endExact = false;
  cur = governing;
  for (let i = 0; i < maxHalves; i++) {
    const next = nextSolstice(cur, solsticeResolver);
    endJdn = next.jdn - 1;
    if (halfAgrees(next) !== agree) {
      endExact = true;
      break;
    }
    cur = next;
    halves++;
  }
  if (!endExact) endJdn = nextSolstice(cur, solsticeResolver).jdn - 1;

  return {
    agree,
    startIso: isoDate(jdnToGregorian(startJdn)),
    endIso: isoDate(jdnToGregorian(endJdn)),
    days: endJdn - startJdn + 1,
    halves,
    sharedAnchorIso: agree ? isoDate(jdnToGregorian(anchorJdn(governing, "tongShu"))) : null,
    startExact,
    endExact,
  };
}

/**
 * Convenience for sweeps and the card's context strip: `count` consecutive days
 * from `start`. Pure; no wall clock.
 */
export function flyingStarSeries(
  start: FlyingStarCivilDate,
  count: number,
  solsticeResolver: SolsticeResolver = defaultSolsticeResolver,
): DayFlyingStar[] {
  const startJdn = gregorianToJDN(start.year, start.month, start.day);
  const out: DayFlyingStar[] = [];
  for (let i = 0; i < count; i++) {
    out.push(dayFlyingStar(jdnToGregorian(startJdn + i), solsticeResolver));
  }
  return out;
}

/** Days between two civil dates, for callers that want the raw span. */
export function civilDaysBetween(a: FlyingStarCivilDate, b: FlyingStarCivilDate): number {
  return gregorianToJDN(b.year, b.month, b.day) - gregorianToJDN(a.year, a.month, a.day);
}

/** The reference zone, as a label — the UI states it rather than hiding it. */
export const REFERENCE_ZONE_LABEL = "UTC+8";
