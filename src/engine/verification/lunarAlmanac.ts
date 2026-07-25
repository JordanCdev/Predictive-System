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

/** One day's full 通勝 read from the third-party almanac: the lunar date in
 *  Chinese, the complete 宜/忌 term lists, and the 28-mansion. */
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
  /** null if this lunar-javascript build lacks the mansion API. */
  mansion: AlmanacMansion | null;
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
  return {
    iso,
    lunarMonthZh,
    lunarDayZh,
    lunarDateZh: `${lunarMonthZh}${lunarDayZh}`,
    yi: lunar.getDayYi().map(norm),
    ji: lunar.getDayJi().map(norm),
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
