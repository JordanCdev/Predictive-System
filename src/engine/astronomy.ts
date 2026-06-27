/**
 * Layer 1 — Astronomical / calendar kernel (spec §5).
 *
 * Pure, deterministic. Given an explicit instant (no wall-clock reads), it
 * computes Julian Day, the Sun's apparent ecliptic longitude (Meeus, low
 * precision ~0.01°), and the 24 solar-term crossings used for BaZi month/year
 * boundaries and Da Yun start ages.
 *
 * Precision note: the low-precision solar series yields term-crossing times
 * good to roughly a minute. That is ample for a decision-timing tool; the
 * decision layer additionally flags births/days that fall within a small
 * window of a boundary (spec §5 "boundary sensitivity", §16.2 edge cases).
 */

import { mod } from "./symbols.ts";

const J2000 = 2451545.0;
const DEG = Math.PI / 180;

/** Julian Date (days) from a UTC instant. */
export function julianDayFromMillis(utcMillis: number): number {
  return utcMillis / 86400000 + 2440587.5;
}

export function millisFromJulianDay(jd: number): number {
  return (jd - 2440587.5) * 86400000;
}

/**
 * Integer Julian Day Number for a proleptic-Gregorian calendar date
 * (Fliegel & Van Flandern). Timezone-independent — used for the sexagenary
 * day count, which depends only on which civil day it is.
 */
export function gregorianToJDN(year: number, month: number, day: number): number {
  const a = Math.floor((14 - month) / 12);
  const y = year + 4800 - a;
  const m = month + 12 * a - 3;
  return (
    day +
    Math.floor((153 * m + 2) / 5) +
    365 * y +
    Math.floor(y / 4) -
    Math.floor(y / 100) +
    Math.floor(y / 400) -
    32045
  );
}

/**
 * ΔT (TT − UT) in seconds, Espenak & Meeus polynomial approximations.
 * Needed so solar-term times come out in civil (UT-based) time.
 */
export function deltaTSeconds(year: number): number {
  let u: number;
  if (year >= 2005 && year < 2050) {
    const t = year - 2000;
    return 62.92 + 0.32217 * t + 0.005589 * t * t;
  }
  if (year >= 1986 && year < 2005) {
    const t = year - 2000;
    return (
      63.86 +
      0.3345 * t -
      0.060374 * t * t +
      0.0017275 * t * t * t +
      0.000651814 * t ** 4 +
      0.00002373599 * t ** 5
    );
  }
  if (year >= 1961 && year < 1986) {
    const t = year - 1975;
    return 45.45 + 1.067 * t - (t * t) / 260 - (t * t * t) / 718;
  }
  if (year >= 1941 && year < 1961) {
    const t = year - 1950;
    return 29.07 + 0.407 * t - (t * t) / 233 + (t * t * t) / 2547;
  }
  if (year >= 1920 && year < 1941) {
    const t = year - 1920;
    return 21.20 + 0.84493 * t - 0.076100 * t * t + 0.0020936 * t * t * t;
  }
  if (year >= 1900 && year < 1920) {
    const t = year - 1900;
    return (
      -2.79 + 1.494119 * t - 0.0598939 * t * t + 0.0061966 * t * t * t - 0.000197 * t ** 4
    );
  }
  if (year >= 2050) {
    u = (year - 1820) / 100;
    return -20 + 32 * u * u;
  }
  // pre-1900 fallback (good enough for boundary classification on old charts)
  u = (year - 1820) / 100;
  return -20 + 32 * u * u;
}

/**
 * Sun's apparent ecliptic longitude in degrees [0,360), for a given
 * Julian Ephemeris Day (TT). Meeus, Astronomical Algorithms, ch. 25 (low
 * precision). Accuracy ~0.01°.
 */
export function sunApparentLongitude(jde: number): number {
  const T = (jde - J2000) / 36525;
  const L0 = 280.46646 + 36000.76983 * T + 0.0003032 * T * T;
  const M = 357.52911 + 35999.05029 * T - 0.0001537 * T * T;
  const Mr = mod(M, 360) * DEG;
  const C =
    (1.914602 - 0.004817 * T - 0.000014 * T * T) * Math.sin(Mr) +
    (0.019993 - 0.000101 * T) * Math.sin(2 * Mr) +
    0.000289 * Math.sin(3 * Mr);
  const trueLong = L0 + C;
  const omega = 125.04 - 1934.136 * T;
  const apparent = trueLong - 0.00569 - 0.00478 * Math.sin(omega * DEG);
  return mod(apparent, 360);
}

/** Apparent solar longitude for a UTC instant (applies ΔT internally). */
export function solarLongitudeAtMillis(utcMillis: number): number {
  const jd = julianDayFromMillis(utcMillis);
  const year = new Date(utcMillis).getUTCFullYear();
  const jde = jd + deltaTSeconds(year) / 86400;
  return sunApparentLongitude(jde);
}

/**
 * Find the UTC instant (ms) at which the Sun reaches `targetDeg`, searching
 * from `guessMillis`. Iterative correction using mean solar motion
 * (~0.98565°/day). Converges in a handful of steps.
 */
export function findSolarLongitudeCrossing(targetDeg: number, guessMillis: number): number {
  let t = guessMillis;
  for (let i = 0; i < 12; i++) {
    const lon = solarLongitudeAtMillis(t);
    let diff = mod(targetDeg - lon + 180, 360) - 180; // signed shortest delta
    if (Math.abs(diff) < 1e-7) break;
    t += (diff / 0.98564736) * 86400000; // degrees → ms
  }
  return t;
}

// --- 24 Solar Terms ---------------------------------------------------------

export interface SolarTermDef {
  index: number; // 0..23
  longitude: number; // ecliptic longitude in degrees
  nameZh: string;
  nameEn: string;
  isJie: boolean; // true = 節 (month boundary); false = 中氣 (mid-term)
}

/**
 * Canonical 24 terms ordered by longitude starting at 立春 (315°), which is
 * the BaZi year/month origin. The 12 `isJie` terms are the month boundaries.
 */
export const SOLAR_TERMS: SolarTermDef[] = [
  { index: 0, longitude: 315, nameZh: "立春", nameEn: "Start of Spring", isJie: true },
  { index: 1, longitude: 330, nameZh: "雨水", nameEn: "Rain Water", isJie: false },
  { index: 2, longitude: 345, nameZh: "驚蟄", nameEn: "Awakening of Insects", isJie: true },
  { index: 3, longitude: 0, nameZh: "春分", nameEn: "Spring Equinox", isJie: false },
  { index: 4, longitude: 15, nameZh: "清明", nameEn: "Pure Brightness", isJie: true },
  { index: 5, longitude: 30, nameZh: "穀雨", nameEn: "Grain Rain", isJie: false },
  { index: 6, longitude: 45, nameZh: "立夏", nameEn: "Start of Summer", isJie: true },
  { index: 7, longitude: 60, nameZh: "小滿", nameEn: "Grain Full", isJie: false },
  { index: 8, longitude: 75, nameZh: "芒種", nameEn: "Grain in Ear", isJie: true },
  { index: 9, longitude: 90, nameZh: "夏至", nameEn: "Summer Solstice", isJie: false },
  { index: 10, longitude: 105, nameZh: "小暑", nameEn: "Minor Heat", isJie: true },
  { index: 11, longitude: 120, nameZh: "大暑", nameEn: "Major Heat", isJie: false },
  { index: 12, longitude: 135, nameZh: "立秋", nameEn: "Start of Autumn", isJie: true },
  { index: 13, longitude: 150, nameZh: "處暑", nameEn: "End of Heat", isJie: false },
  { index: 14, longitude: 165, nameZh: "白露", nameEn: "White Dew", isJie: true },
  { index: 15, longitude: 180, nameZh: "秋分", nameEn: "Autumn Equinox", isJie: false },
  { index: 16, longitude: 195, nameZh: "寒露", nameEn: "Cold Dew", isJie: true },
  { index: 17, longitude: 210, nameZh: "霜降", nameEn: "Frost Descent", isJie: false },
  { index: 18, longitude: 225, nameZh: "立冬", nameEn: "Start of Winter", isJie: true },
  { index: 19, longitude: 240, nameZh: "小雪", nameEn: "Minor Snow", isJie: false },
  { index: 20, longitude: 255, nameZh: "大雪", nameEn: "Major Snow", isJie: true },
  { index: 21, longitude: 270, nameZh: "冬至", nameEn: "Winter Solstice", isJie: false },
  { index: 22, longitude: 285, nameZh: "小寒", nameEn: "Minor Cold", isJie: true },
  { index: 23, longitude: 300, nameZh: "大寒", nameEn: "Major Cold", isJie: false },
];

/** The 12 month-boundary 節 terms in order from 立春. */
export const JIE_TERMS = SOLAR_TERMS.filter((t) => t.isJie);

/**
 * Branch index (子=0..亥=11) of the BaZi month containing solar longitude λ.
 * 立春 (315°) opens the 寅 month (branch index 2).
 */
export function monthBranchIndexFromLongitude(longitudeDeg: number): number {
  const fromLichun = mod(longitudeDeg - 315, 360);
  return mod(Math.floor(fromLichun / 30) + 2, 12);
}

/**
 * Compute the exact UTC instant of a given 節 (jie) for the boundary search.
 * `aroundMillis` should be within ~a month of the crossing.
 */
export function jieCrossingMillis(jieLongitude: number, aroundMillis: number): number {
  return findSolarLongitudeCrossing(jieLongitude, aroundMillis);
}

/**
 * Return the 節 boundary immediately at-or-before and the next 節 after a
 * given instant — used for month-pillar assignment and Da Yun start age.
 */
export interface JieWindow {
  prev: { def: SolarTermDef; millis: number };
  next: { def: SolarTermDef; millis: number };
}

export function jieWindowAround(utcMillis: number): JieWindow {
  // Find the current month's longitude band, then locate its opening jie and
  // the following one.
  const lon = solarLongitudeAtMillis(utcMillis);
  const bandStartLon = mod(Math.floor(mod(lon - 315, 360) / 30) * 30 + 315, 360);
  const prevDef = JIE_TERMS.find((t) => t.longitude === bandStartLon)!;
  const nextLon = mod(bandStartLon + 30, 360);
  const nextDef = JIE_TERMS.find((t) => t.longitude === nextLon)!;

  // Seed guesses ~15 days either side and refine.
  const prevMillis = findSolarLongitudeCrossing(prevDef.longitude, utcMillis - 16 * 86400000);
  const nextMillis = findSolarLongitudeCrossing(nextDef.longitude, utcMillis + 16 * 86400000);
  return {
    prev: { def: prevDef, millis: prevMillis },
    next: { def: nextDef, millis: nextMillis },
  };
}

/** The 立春 (Start of Spring) instant governing the BaZi year for `gregYear`. */
export function lichunMillis(gregYear: number): number {
  // 立春 falls ~Feb 3–5. Seed at Feb 4 12:00 UTC of that year.
  const guess = Date.UTC(gregYear, 1, 4, 12, 0, 0);
  return findSolarLongitudeCrossing(315, guess);
}
