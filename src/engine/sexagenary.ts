/**
 * Layer 1→2 bridge: time normalization + four-pillar (四柱) construction
 * (spec §5.3–5.4). Pure functions, parameterized by an explicit ConventionSet.
 */

import {
  GanZhi,
  ganZhiFromIndex,
  mod,
  Stem,
  STEMS,
} from "./symbols.ts";
import {
  equationOfTimeMinutes,
  gregorianToJDN,
  jieWindowAround,
  lichunMillis,
  monthBranchIndexFromLongitude,
  solarLongitudeAtMillis,
} from "./astronomy.ts";
import { ConventionSet } from "./conventions.ts";
import type { BoundaryFlag } from "./boundary.ts";

export interface MomentInput {
  year: number;
  month: number; // 1..12
  day: number;
  hour: number; // 0..23
  minute: number; // 0..59
  /** Offset of the birth/event place from UTC, in minutes (e.g. +480 = UTC+8). */
  tzOffsetMinutes: number;
  /** Longitude in degrees east (optional, only used for local-mean-solar). */
  longitudeEast?: number;
  /** Caller's confidence in the supplied time — affects input-quality score. */
  timeCertainty?: "exact" | "approximate" | "hour_unknown";
}

// Sexagenary day anchor: Mao Zedong's civil birth date 1893-12-26, whose
// published day pillar is 丁酉 (index 33). Pinning one verified anchor fixes
// the entire continuous day cycle (spec §5.4 "versioned sexagenary-day epoch").
const DAY_ANCHOR_JDN = gregorianToJDN(1893, 12, 26);
const DAY_ANCHOR_INDEX = 33; // 丁酉

export function dayGanzhiIndexFromCivilDate(year: number, month: number, day: number): number {
  const jdn = gregorianToJDN(year, month, day);
  return mod(jdn - DAY_ANCHOR_JDN + DAY_ANCHOR_INDEX, 60);
}

export interface NormalizedMoment {
  input: MomentInput;
  utcMillis: number;
  solarCorrectionMinutes: number;
  /** Effective local wall fields after any solar-time correction. */
  effective: { year: number; month: number; day: number; hour: number; minute: number };
  /** Civil date feeding the day pillar (after day-rollover policy). */
  dayCivil: { year: number; month: number; day: number };
  /** Hour (0..23) feeding the hour branch. */
  hourForBranch: number;
}

export function normalizeMoment(m: MomentInput, conv: ConventionSet): NormalizedMoment {
  const utcMillis = Date.UTC(m.year, m.month - 1, m.day, m.hour, m.minute) - m.tzOffsetMinutes * 60000;

  // Solar-time correction. Mean-solar: 4 minutes per degree from the zone
  // meridian (needs the birth longitude). True-solar (真太陽時): additionally
  // applies the equation of time (apparent − mean Sun, ±~16 min, date-only).
  let solarCorrectionMinutes = 0;
  const usesSolar = conv.hourBasis === "local_mean_solar" || conv.hourBasis === "true_solar";
  if (usesSolar && m.longitudeEast !== undefined) {
    const zoneMeridian = (m.tzOffsetMinutes / 60) * 15;
    solarCorrectionMinutes += (m.longitudeEast - zoneMeridian) * 4;
  }
  if (conv.hourBasis === "true_solar") {
    solarCorrectionMinutes += equationOfTimeMinutes(utcMillis);
  }

  // Work in a "local frame" treated as UTC for date arithmetic.
  const localFrameMillis =
    Date.UTC(m.year, m.month - 1, m.day, m.hour, m.minute) +
    Math.round(solarCorrectionMinutes) * 60000;
  const eff = new Date(localFrameMillis);
  const effective = {
    year: eff.getUTCFullYear(),
    month: eff.getUTCMonth() + 1,
    day: eff.getUTCDate(),
    hour: eff.getUTCHours(),
    minute: eff.getUTCMinutes(),
  };

  // Day rollover policy.
  let dayCivil = { year: effective.year, month: effective.month, day: effective.day };
  if (conv.dayBoundary === "zi_23" && effective.hour >= 23) {
    const next = new Date(Date.UTC(effective.year, effective.month - 1, effective.day + 1));
    dayCivil = { year: next.getUTCFullYear(), month: next.getUTCMonth() + 1, day: next.getUTCDate() };
  }

  return {
    input: m,
    utcMillis,
    solarCorrectionMinutes,
    effective,
    dayCivil,
    hourForBranch: effective.hour,
  };
}

export interface FourPillars {
  year: GanZhi;
  month: GanZhi;
  day: GanZhi;
  hour: GanZhi;
  dayMaster: Stem;
  meta: {
    baziYear: number;
    solarLongitude: number;
    monthBranchIndex: number;
    dayJDN: number;
    normalized: NormalizedMoment;
    boundaryWarnings: string[];
    /** Structured form of the above: which pillar is in doubt, and how near. */
    boundaryFlags: BoundaryFlag[];
  };
}

/** 五虎遁: stem of the 寅 month given a year stem. */
function yinMonthStem(yearStemIndex: number): number {
  return mod(yearStemIndex * 2 + 2, 10);
}

/** 五鼠遁: stem of the 子 hour given a day stem. */
function ziHourStem(dayStemIndex: number): number {
  return mod(dayStemIndex * 2, 10);
}

export function hourBranchIndexFromHour(hour: number): number {
  return mod(Math.floor((hour + 1) / 2), 12);
}

export function buildFourPillars(m: MomentInput, conv: ConventionSet): FourPillars {
  const n = normalizeMoment(m, conv);
  const warnings: string[] = [];
  // Structured companions to `warnings`. The strings are kept for existing
  // consumers; the flags carry the machine-readable facts (which pillar is at
  // stake, how far the boundary is) that a string forces callers to regex back out.
  const flags: BoundaryFlag[] = [];

  // A solar hour-basis is location-dependent. Without a longitude the engine can
  // only apply the date-only equation of time (true-solar) or nothing at all
  // (mean-solar) — say so instead of implying a precision the inputs can't support.
  if (conv.hourBasis !== "civil_clock" && m.longitudeEast === undefined) {
    warnings.push(
      conv.hourBasis === "true_solar"
        ? "True solar time was requested without a birth longitude — only the equation of time (±16 min) was applied. Add a birth place/longitude for the full 真太陽時 correction."
        : "Local-mean-solar time was requested without a birth longitude — no correction could be applied; the hour was read as zone time.",
    );
  }

  // --- Year pillar (立春 boundary) ---
  const gregYear = n.effective.year;
  const lichun = lichunMillis(gregYear);
  const baziYear = n.utcMillis < lichun ? gregYear - 1 : gregYear;
  const yearIndex = mod(baziYear - 1984, 60); // 1984 = 甲子
  const year = ganZhiFromIndex(yearIndex);

  // Boundary sensitivity near 立春.
  const minutesToLichun = Math.abs(n.utcMillis - lichun) / 60000;
  if (minutesToLichun < conv.boundaryWarnMinutes) {
    const msg = `Birth is within ${Math.round(minutesToLichun)} min of 立春 (year boundary); year pillar is sensitive to time accuracy.`;
    warnings.push(msg);
    flags.push({ kind: "lichun", minutesAway: minutesToLichun, affects: "year", message: msg });
  }

  // --- Month pillar (節 boundary from solar longitude) ---
  const solarLongitude = solarLongitudeAtMillis(n.utcMillis);
  const monthBranchIndex = monthBranchIndexFromLongitude(solarLongitude);
  const monthStemIndex = mod(yinMonthStem(year.stem.index) + mod(monthBranchIndex - 2, 12), 10);
  const monthGz = combineStemBranch(monthStemIndex, monthBranchIndex);

  // jie proximity warning
  const jw = jieWindowAround(n.utcMillis);
  const minsToPrevJie = (n.utcMillis - jw.prev.millis) / 60000;
  const minsToNextJie = (jw.next.millis - n.utcMillis) / 60000;
  const nearestJieMin = Math.min(Math.abs(minsToPrevJie), Math.abs(minsToNextJie));
  if (nearestJieMin < conv.boundaryWarnMinutes) {
    const msg = `Birth is within ${Math.round(nearestJieMin)} min of a 節 (month boundary); month pillar is sensitive to time accuracy.`;
    warnings.push(msg);
    flags.push({ kind: "jie", minutesAway: nearestJieMin, affects: "month", message: msg });
  }

  // --- Day pillar ---
  const dayIndex = dayGanzhiIndexFromCivilDate(n.dayCivil.year, n.dayCivil.month, n.dayCivil.day);
  const day = ganZhiFromIndex(dayIndex);
  const dayJDN = gregorianToJDN(n.dayCivil.year, n.dayCivil.month, n.dayCivil.day);

  // Zi-hour ambiguity. ONLY 23:00-23:59 is ambiguous: that is the window where
  // the two day-boundary conventions actually disagree. The 00:00-00:59 half of
  // the 子 hour is also 子, but both conventions assign it the same civil day, so
  // warning there was a false alarm on a chart that is not in doubt.
  if (n.effective.hour === 23) {
    const msg =
      "Birth falls in the late 子 (Zi) hour, 23:00–24:00 — the two day-boundary schools disagree here, which moves the day pillar AND (via 五鼠遁) the hour stem.";
    warnings.push(msg);
    flags.push({ kind: "zi_hour", minutesAway: null, affects: "day", message: msg });
  }

  // --- Hour pillar ---
  const hourBranchIndex = hourBranchIndexFromHour(n.hourForBranch);
  const hourStemIndex = mod(ziHourStem(day.stem.index) + hourBranchIndex, 10);
  const hour = combineStemBranch(hourStemIndex, hourBranchIndex);

  return {
    year,
    month: monthGz,
    day,
    hour,
    dayMaster: day.stem,
    meta: {
      baziYear,
      solarLongitude,
      monthBranchIndex,
      dayJDN,
      normalized: n,
      boundaryWarnings: warnings,
      boundaryFlags: flags,
    },
  };
}

/** Build a GanZhi from an explicit stem index and branch index. */
export function combineStemBranch(stemIndex: number, branchIndex: number): GanZhi {
  // Solve for the 0..59 index with the given stem (mod 10) and branch (mod 12).
  for (let i = 0; i < 60; i++) {
    if (i % 10 === mod(stemIndex, 10) && i % 12 === mod(branchIndex, 12)) {
      return ganZhiFromIndex(i);
    }
  }
  // Unreachable for valid stem/branch pairs.
  return ganZhiFromIndex(0);
}

/** Stem object from index (re-export convenience). */
export function stemAt(index: number): Stem {
  return STEMS[mod(index, 10)];
}
