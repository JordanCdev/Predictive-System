/**
 * Almanac 宜忌 adapter (Phase 1 of the accuracy work).
 *
 * Builds the day-by-day 宜/忌 (通勝/almanac) lists for a window from
 * lunar-javascript, as plain data the deterministic engine can blend in. This
 * module (and only this module family) imports lunar-javascript, so it stays in
 * the lazy verification chunk — the core engine never depends on the library.
 *
 * 宜忌 are civil-date facts; per the pinned comparator semantics
 * (docs/VERIFICATION.md) they are read at local civil noon, which is
 * host-timezone independent under Solar.fromYmdHms.
 */

import { Solar } from "lunar-javascript";
import { AlmanacData } from "../decision.ts";
import { BRANCHES } from "../symbols.ts";

/** Normalise the odd variant characters lunar-javascript can emit so the
 *  engine's simplified-Chinese term matching is reliable. */
function norm(s: string): string {
  return s.replace(/諸事不宜/g, "诸事不宜").replace(/馀/g, "余");
}

export interface AlmanacWindow {
  start: { year: number; month: number; day: number };
  days: number;
}

/** The extra almanac methods this adapter consumes beyond the pinned d.ts
 *  surface. Probed against lunar-javascript@1.7.7 (all present); accessed via
 *  a local cast so the shared declaration file stays minimal. */
interface RichLunar {
  getMonthInChinese(): string; // "六" (leap months prefixed 闰)
  getDayInChinese(): string; // "十二", "初一", …
  getDayYi(): string[];
  getDayJi(): string[];
  getXiu(): string; // 28-mansion name, e.g. "氐"
  getXiuLuck(): string; // "吉" | "凶"
  getZheng(): string; // the mansion's element, e.g. "土"
  getAnimal(): string; // the mansion's animal, e.g. "貉"
  getGong(): string; // quadrant, e.g. "东"
  getShou(): string; // palace beast, e.g. "青龙"
  getDayJiShen(): string[]; // 吉神, e.g. ['月空','金堂','解神','鸣吠对']
  getDayXiongSha(): string[]; // 凶煞, e.g. ['月害','大时','咸池',…]
  getTimes(): RichLunarTime[]; // 13 entries: early 子 … 亥, then late 子
}

/** The per-double-hour surface of lunar-javascript's LunarTime (probed on
 *  1.7.7: getTimes()[i] carries the hour pillar plus the hour's 天神 and its
 *  own 宜/忌 lists — all simplified Chinese). */
interface RichLunarTime {
  getGanZhi(): string; // "丙子"
  getZhi(): string; // "子"
  getTianShen(): string; // 黄黑道 hour god, e.g. "金匮"
  getTianShenLuck(): string; // "吉" | "凶"
  getYi(): string[];
  getJi(): string[];
}

/** 廿八宿 — the day's lunar mansion, as reported by the third-party almanac. */
export interface AlmanacMansion {
  /** Mansion name (hanzi), e.g. 氐. */
  xiu: string;
  /** The mansion's associated element, e.g. 土. */
  zheng: string;
  /** The mansion's animal, e.g. 貉. */
  animal: string;
  /** The traditional verdict: 吉 (auspicious) or 凶 (inauspicious). */
  luck: string;
  /** Sky quadrant (东/南/西/北) and its palace beast (青龙/朱雀/白虎/玄武). */
  gong: string;
  shou: string;
}

/** One double-hour's read from the third-party almanac. */
export interface AlmanacHour {
  /** Branch index 0 (子) … 11 (亥) — same indexing as the engine's BRANCHES. */
  branchIndex: number;
  /** Hour pillar, e.g. "丙子". */
  ganzhi: string;
  /** 黄黑道 hour god (simplified), e.g. "金匮". */
  tianShen: string;
  /** The traditional verdict for that god: "吉" or "凶". */
  tianShenLuck: string;
  /** This hour's own 宜/忌 activity terms (normalised simplified). */
  yi: string[];
  ji: string[];
}

/** One day's full 通勝 read from the third-party almanac: the lunar date in
 *  Chinese, the complete 宜/忌 term lists, the day-star lists, the 28-mansion,
 *  and the per-double-hour breakdown. */
export interface AlmanacDayDetail {
  iso: string;
  /** Lunar month in Chinese, e.g. "六月" (leap: "闰六月"). */
  lunarMonthZh: string;
  /** Lunar day in Chinese, e.g. "十二". */
  lunarDayZh: string;
  /** The full lunar date, e.g. "六月十二". */
  lunarDateZh: string;
  yi: string[];
  ji: string[];
  /** 吉神 — the day's auspicious stars per this almanac (empty if the API is absent). */
  jiShen: string[];
  /** 凶煞 — the day's inauspicious stars per this almanac (empty if the API is absent). */
  xiongSha: string[];
  /** 12 double-hours in 子…亥 order (empty if the per-hour API is absent). */
  perHour: AlmanacHour[];
  /** null if this lunar-javascript build lacks the mansion API. */
  mansion: AlmanacMansion | null;
}

/** The day-star (神煞) lists, probe-guarded: builds that lack the APIs — or
 *  throw inside them — yield empty lists rather than breaking the panel. */
export function extractDayStars(lunarObj: unknown): { jiShen: string[]; xiongSha: string[] } {
  const lunar = lunarObj as RichLunar;
  let jiShen: string[] = [];
  let xiongSha: string[] = [];
  try {
    if (typeof lunar.getDayJiShen === "function") jiShen = lunar.getDayJiShen().map(norm);
  } catch {
    jiShen = [];
  }
  try {
    if (typeof lunar.getDayXiongSha === "function") xiongSha = lunar.getDayXiongSha().map(norm);
  } catch {
    xiongSha = [];
  }
  return { jiShen, xiongSha };
}

/** The 12 double-hours' almanac read, probe-guarded like extractDayStars.
 *  lunar-javascript emits 13 entries (early and late 子); the civil-day early
 *  子 (00:00–01:00) is kept and the trailing late-子 duplicate dropped, so the
 *  result is one row per branch, 子…亥. */
export function extractPerHour(lunarObj: unknown): AlmanacHour[] {
  const lunar = lunarObj as RichLunar;
  try {
    if (typeof lunar.getTimes !== "function") return [];
    const out: AlmanacHour[] = [];
    const seen = new Set<number>();
    for (const t of lunar.getTimes()) {
      if (
        !t ||
        typeof t.getGanZhi !== "function" ||
        typeof t.getZhi !== "function" ||
        typeof t.getTianShen !== "function" ||
        typeof t.getTianShenLuck !== "function"
      ) {
        continue;
      }
      const zhi = t.getZhi();
      const branchIndex = BRANCHES.findIndex((b) => b.hanzi === zhi);
      if (branchIndex < 0 || seen.has(branchIndex)) continue;
      seen.add(branchIndex);
      out.push({
        branchIndex,
        ganzhi: t.getGanZhi(),
        tianShen: norm(t.getTianShen()),
        tianShenLuck: t.getTianShenLuck(),
        yi: (typeof t.getYi === "function" ? t.getYi() : []).map(norm),
        ji: (typeof t.getJi === "function" ? t.getJi() : []).map(norm),
      });
    }
    return out;
  } catch {
    return [];
  }
}

/** Full 通勝 detail for one civil day (lazy chunk only — imports the library). */
export function buildAlmanacDayDetail(civil: { year: number; month: number; day: number }): AlmanacDayDetail {
  const iso = `${civil.year}-${String(civil.month).padStart(2, "0")}-${String(civil.day).padStart(2, "0")}`;
  const lunar = Solar.fromYmdHms(civil.year, civil.month, civil.day, 12, 0, 0).getLunar() as unknown as RichLunar;
  const lunarMonthZh = `${lunar.getMonthInChinese()}月`;
  const lunarDayZh = lunar.getDayInChinese();
  let mansion: AlmanacMansion | null = null;
  try {
    if (typeof lunar.getXiu === "function" && typeof lunar.getXiuLuck === "function") {
      mansion = {
        xiu: lunar.getXiu(),
        zheng: typeof lunar.getZheng === "function" ? lunar.getZheng() : "",
        animal: typeof lunar.getAnimal === "function" ? lunar.getAnimal() : "",
        luck: lunar.getXiuLuck(),
        gong: typeof lunar.getGong === "function" ? lunar.getGong() : "",
        shou: typeof lunar.getShou === "function" ? lunar.getShou() : "",
      };
    }
  } catch {
    mansion = null;
  }
  const { jiShen, xiongSha } = extractDayStars(lunar);
  return {
    iso,
    lunarMonthZh,
    lunarDayZh,
    lunarDateZh: `${lunarMonthZh}${lunarDayZh}`,
    yi: lunar.getDayYi().map(norm),
    ji: lunar.getDayJi().map(norm),
    jiShen,
    xiongSha,
    perHour: extractPerHour(lunar),
    mansion,
  };
}

/** Compact lunar-day labels for calendar cells, keyed by ISO date. The first
 *  day of a lunar month is labelled with the month name (the printed Tong Shu
 *  convention); other days carry the day name (初二…三十). */
export function buildLunarDayLabels(window: AlmanacWindow): Record<string, string> {
  const startUtc = Date.UTC(window.start.year, window.start.month - 1, window.start.day);
  const out: Record<string, string> = {};
  for (let i = 0; i < window.days; i++) {
    const d = new Date(startUtc + i * 86400000);
    const year = d.getUTCFullYear();
    const month = d.getUTCMonth() + 1;
    const day = d.getUTCDate();
    const iso = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const lunar = Solar.fromYmdHms(year, month, day, 12, 0, 0).getLunar() as unknown as RichLunar;
    const dayZh = lunar.getDayInChinese();
    out[iso] = dayZh === "初一" ? `${lunar.getMonthInChinese()}月` : dayZh;
  }
  return out;
}

/** 宜/忌 for every civil day in the window, keyed by ISO date. */
export function buildAlmanacData(window: AlmanacWindow): AlmanacData {
  const startUtc = Date.UTC(window.start.year, window.start.month - 1, window.start.day);
  const out: AlmanacData = {};
  for (let i = 0; i < window.days; i++) {
    const d = new Date(startUtc + i * 86400000);
    const year = d.getUTCFullYear();
    const month = d.getUTCMonth() + 1;
    const day = d.getUTCDate();
    const iso = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const lunar = Solar.fromYmdHms(year, month, day, 12, 0, 0).getLunar();
    out[iso] = {
      yi: lunar.getDayYi().map(norm),
      ji: lunar.getDayJi().map(norm),
    };
  }
  return out;
}
