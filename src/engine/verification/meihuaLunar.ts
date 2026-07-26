/**
 * The lunisolar numbers 梅花易數 needs, for one civil day.
 *
 * `meihuaCast` in src/engine/hexagram.ts deliberately does NOT compute a lunar
 * date: the only legal home for lunar-javascript in this codebase is
 * src/engine/verification/**, so the caller supplies it. This module is that
 * caller's supplier, and it is loaded lazily by the UI exactly as
 * lunarAlmanac.ts is — the library never enters the main bundle.
 *
 * The date is read at 12:00 CST, the same instant buildAlmanacDayDetail uses,
 * so the 宜/忌 lists, the 廿八宿 and this cast all describe the same day under
 * one convention rather than three.
 */

import { Solar } from "lunar-javascript";
import { BRANCHES } from "../symbols.ts";
import type { MeihuaLunarDate } from "../hexagram.ts";

/** The numeric accessors lunar-javascript ships but its local .d.ts omits.
 *  Probed on the installed build: getMonth() returns a NEGATIVE number for a
 *  leap month (-6 = 閏六月); getDay() is 1..30. */
interface NumericLunar {
  getMonth(): number;
  getDay(): number;
  getYearInGanZhi(): string;
}

export interface MeihuaLunarDateDetail extends MeihuaLunarDate {
  /** The lunar year pillar as printed in the almanac, e.g. "丙午". */
  yearGanZhi: string;
  /** Single hanzi of the lunar year branch, e.g. "午". */
  yearBranchZh: string;
  /** True when the civil day falls in a leap month (閏月). By the convention
   *  this app follows — the one lunar-javascript and the printed almanacs use —
   *  a 閏月 carries the same number as the month it follows, so `month` is
   *  unaffected and the flag exists so the UI can say which of the two it
   *  means. Not checked against a primary text; other numbering schemes for
   *  intercalary months exist. */
  isLeapMonth: boolean;
  /** 29 (小月) or 30 (大月) — how many days this lunar month actually has.
   *  Undefined only if the installed library cannot supply it. Consumers that
   *  print a list of lunar days (烏兔 太陽日, for one) need it: without it there
   *  is no way to tell a real 三十 from a day the month does not contain. */
  daysInMonth?: 29 | 30;
}

/**
 * Lunar year branch + lunar month + lunar day for a civil date, or null when
 * the installed library cannot supply them. Never throws: like the rest of the
 * verification layer, a missing capability means the dependent UI simply does
 * not render.
 *
 * The YEAR is the lunar year as the almanac prints it (`getYearInGanZhi`), not
 * the 立春-exact BaZi year pillar. That is the doctrinally correct input — the
 * 梅花 rule counts 「子年一數…亥年十二數」 off the printed lunisolar year — and
 * the two differ for the ~2 weeks between 立春 and lunar new year.
 */
const DAY_MS = 86_400_000;

/** The lunar day number of a civil date, read at noon CST like every other
 *  lunisolar read here, or null if the library will not give a usable one. */
function lunarDayNumberAt(utcMs: number): number | null {
  const d = new Date(utcMs);
  const lunar = Solar.fromYmdHms(
    d.getUTCFullYear(),
    d.getUTCMonth() + 1,
    d.getUTCDate(),
    12,
    0,
    0,
  ).getLunar() as unknown as NumericLunar;
  const day = lunar.getDay();
  return Number.isInteger(day) && day >= 1 && day <= 30 ? day : null;
}

/**
 * How many days this lunar month holds — 29 (小月) or 30 (大月) — or undefined
 * if it cannot be established.
 *
 * Walks to the next 朔 rather than asking for a month record: the installed
 * build does expose `LunarMonth.fromYm(...).getDayCount()`, but the typed
 * surface this codebase keeps for lunar-javascript declares neither, and the
 * walk needs only accessors already in use here. Step 29 days on from 初一 and
 * look: a 30th day means a 大月, and landing back on 初一 means the month ended
 * at 廿九. Checked against `getDayCount()` for every day from 1995 to 2055 —
 * 21,900 days, no disagreement.
 *
 * `Date` is used purely as calendar arithmetic on explicit UTC values (this is
 * the verification layer, and there is no clock read anywhere in it).
 *
 * Anything ambiguous returns undefined rather than a guess: a caller truncating
 * a day list needs a real month length or an honest absence.
 */
function lunarMonthDayCount(
  civil: { year: number; month: number; day: number },
  lunarDay: number,
): 29 | 30 | undefined {
  const firstDayMs = Date.UTC(civil.year, civil.month - 1, civil.day) - (lunarDay - 1) * DAY_MS;
  // Self-check: if walking back by the day number does not land on 初一, the
  // two numbers disagree and the length derived from them would be fiction.
  if (lunarDayNumberAt(firstDayMs) !== 1) return undefined;
  const twentyNinthDayOn = lunarDayNumberAt(firstDayMs + 29 * DAY_MS);
  if (twentyNinthDayOn === 30) return 30;
  if (twentyNinthDayOn === 1) return 29;
  return undefined;
}

export function buildMeihuaLunarDate(civil: {
  year: number;
  month: number;
  day: number;
}): MeihuaLunarDateDetail | null {
  try {
    const lunar = Solar.fromYmdHms(civil.year, civil.month, civil.day, 12, 0, 0)
      .getLunar() as unknown as NumericLunar;

    const rawMonth = lunar.getMonth();
    const month = Math.abs(rawMonth);
    const day = lunar.getDay();
    const yearGanZhi = lunar.getYearInGanZhi();
    const yearBranchZh = yearGanZhi.slice(1);
    const yearBranchIndex = BRANCHES.findIndex((b) => b.hanzi === yearBranchZh);

    if (yearBranchIndex < 0) return null;
    if (!Number.isInteger(month) || month < 1 || month > 12) return null;
    if (!Number.isInteger(day) || day < 1 || day > 30) return null;

    return {
      yearBranchIndex,
      month,
      day,
      yearGanZhi,
      yearBranchZh,
      isLeapMonth: rawMonth < 0,
      daysInMonth: lunarMonthDayCount(civil, day),
    };
  } catch {
    return null;
  }
}
