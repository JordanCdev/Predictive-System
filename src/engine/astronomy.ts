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
    // The Espenak–Meeus 2005–2050 polynomial was a ~2006 *prediction* that now
    // overshoots: it gives ΔT(2024)=73.9s vs the observed ~69.2s. Refit on observed
    // values (2005≈64.7s, 2024≈69.2s, IERS/USNO) with a gentle forward slope.
    return 64.7 + 0.2368 * (year - 2005);
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
  if (year >= 1860 && year < 1900) {
    const t = year - 1860;
    return (
      7.62 +
      0.5737 * t -
      0.251754 * t * t +
      0.01680668 * t ** 3 -
      0.0004473624 * t ** 4 +
      (t ** 5) / 233174
    );
  }
  if (year >= 1800 && year < 1860) {
    const t = year - 1800;
    return (
      13.72 -
      0.332447 * t +
      0.0068612 * t * t +
      0.0041116 * t ** 3 -
      0.00037436 * t ** 4 +
      0.0000121272 * t ** 5 -
      0.0000001699 * t ** 6 +
      0.000000000875 * t ** 7
    );
  }
  if (year >= 2050) {
    // Continue the refit at 2050 (≈75.36s) with a tidal-trend slope (~1.5 s/yr,
    // the local gradient of the long-term parabola) so ΔT stays continuous there
    // rather than jumping ~74s onto the millennial parabola.
    return 75.36 + 1.5 * (year - 2050);
  }
  // pre-1800 fallback (millennial parabola; fine for boundary classification).
  u = (year - 1820) / 100;
  return -20 + 32 * u * u;
}

// --- Abridged VSOP87 (Earth heliocentric) -----------------------------------
// Terms are [A, B, C]: each contributes A·cos(B + C·τ). Amplitudes are in
// 1e-8 rad (L) / 1e-8 AU (R). Truncated to the largest terms → solar longitude
// good to ~0.0005° (~3 s of time), i.e. ~1000× tighter than the old series.
// Source: Meeus, Astronomical Algorithms (2nd ed.), Appendix III (VSOP87D).

type VsopTerm = [number, number, number];
const EARTH_L: VsopTerm[][] = [
  [ // L0
    [175347046, 0, 0], [3341656, 4.6692568, 6283.07585], [34894, 4.6261, 12566.1517],
    [3497, 2.7441, 5753.3849], [3418, 2.8289, 3.5231], [3136, 3.6277, 77713.7715],
    [2676, 4.4181, 7860.4194], [2343, 6.1352, 3930.2097], [1324, 0.7425, 11506.7698],
    [1273, 2.0371, 529.691], [1199, 1.1096, 1577.3435], [990, 5.233, 5884.927],
    [902, 2.045, 26.298], [857, 3.508, 398.149], [780, 1.179, 5223.694],
    [753, 2.533, 5507.553], [505, 4.583, 18849.228], [492, 4.205, 775.523],
    [357, 2.92, 0.067], [317, 5.849, 11790.629], [284, 1.899, 796.298],
    [271, 0.315, 10977.079], [243, 0.345, 5486.778], [206, 4.806, 2544.314],
    [205, 1.869, 5573.143], [202, 2.458, 6069.777], [156, 0.833, 213.299],
    [132, 3.411, 2942.463], [126, 1.083, 20.775], [115, 0.645, 0.98],
    [103, 0.636, 4694.003], [102, 0.976, 15720.839], [102, 4.267, 7.114],
    [99, 6.21, 2146.17], [98, 0.68, 155.42], [86, 5.98, 161000.69],
    [85, 1.3, 6275.96], [85, 3.67, 71430.7],
  ],
  [ // L1
    [628331966747, 0, 0], [206059, 2.678235, 6283.07585], [4303, 2.6351, 12566.1517],
    [425, 1.59, 3.523], [119, 5.796, 26.298], [109, 2.966, 1577.344],
    [93, 2.59, 18849.23], [72, 1.14, 529.69], [68, 1.87, 398.15],
    [67, 4.41, 5507.55], [59, 2.89, 5223.69], [56, 2.17, 155.42],
    [45, 0.4, 796.3], [36, 0.47, 775.52], [29, 2.65, 7.11],
    [21, 5.34, 0.98], [19, 1.85, 5486.78], [19, 4.97, 213.3],
    [17, 2.99, 6275.96], [16, 0.03, 2544.31],
  ],
  [ // L2
    [52919, 0, 0], [8720, 1.0721, 6283.0758], [309, 0.867, 12566.152],
    [27, 0.05, 3.52], [16, 5.19, 26.3], [16, 3.68, 155.42],
    [10, 0.76, 18849.23], [9, 2.06, 77713.77], [7, 0.83, 775.52], [5, 4.66, 1577.34],
  ],
  [ // L3
    [289, 5.844, 6283.076], [35, 0, 0], [17, 5.49, 12566.15], [3, 5.2, 155.42], [1, 4.72, 3.52],
  ],
  [ /* L4 */ [114, 3.142, 0], [8, 4.13, 6283.08], [1, 3.84, 12566.15] ],
  [ /* L5 */ [1, 3.14, 0] ],
];
const EARTH_R: VsopTerm[][] = [
  [ // R0
    [100013989, 0, 0], [1670700, 3.0984635, 6283.07585], [13956, 3.05525, 12566.1517],
    [3084, 5.1985, 77713.7715], [1628, 1.1739, 5753.3849], [1576, 2.8469, 7860.4194],
    [925, 5.453, 11506.77], [542, 4.564, 3930.21], [472, 3.661, 5884.927],
    [346, 0.964, 5507.553], [329, 5.9, 5223.694], [307, 0.299, 5573.143],
    [243, 4.273, 11790.629], [212, 5.847, 1577.344], [186, 5.022, 10977.079],
    [175, 3.012, 18849.228], [110, 5.055, 5486.778], [98, 0.89, 6069.78],
    [86, 5.69, 15720.84], [86, 1.27, 161000.69], [65, 0.27, 17260.15],
    [63, 0.92, 529.69], [57, 2.01, 83996.85], [56, 5.24, 71430.7], [49, 3.25, 2544.31],
  ],
  [ // R1
    [103019, 1.10749, 6283.07585], [1721, 1.0644, 12566.1517], [702, 3.142, 0],
    [32, 1.02, 18849.23], [31, 2.84, 5507.55], [25, 1.32, 5223.69],
    [18, 1.42, 1577.34], [10, 5.91, 10977.08], [9, 1.42, 6275.96], [9, 0.27, 5486.78],
  ],
  [ // R2
    [4359, 5.7846, 6283.0758], [124, 5.579, 12566.152], [12, 3.14, 0],
    [9, 3.63, 77713.77], [6, 1.87, 5573.14], [3, 5.47, 18849.23],
  ],
];

function vsopSum(series: VsopTerm[][], tau: number): number {
  let total = 0;
  for (let i = 0; i < series.length; i++) {
    let s = 0;
    for (const [a, b, c] of series[i]) s += a * Math.cos(b + c * tau);
    total += s * Math.pow(tau, i);
  }
  return total / 1e8;
}

/** Mean obliquity of the ecliptic (deg), Meeus 22.2 (abridged). */
function meanObliquity(T: number): number {
  return 23.4392911 - 0.0130041667 * T - 1.638889e-7 * T * T + 5.036111e-7 * T ** 3;
}

/**
 * Sun's apparent ecliptic longitude in degrees [0,360), for a Julian Ephemeris
 * Day (TT). Abridged VSOP87 → FK5 → nutation + aberration. Accuracy ~0.0005°.
 */
export function sunApparentLongitude(jde: number): number {
  const tau = (jde - J2000) / 365250; // Julian millennia
  const T = tau * 10; // Julian centuries
  const Lhel = vsopSum(EARTH_L, tau); // Earth heliocentric longitude (rad)
  const R = vsopSum(EARTH_R, tau); // Earth–Sun distance (AU)
  let theta = mod((Lhel * 180) / Math.PI + 180, 360); // geocentric solar longitude (deg)
  // VSOP87 (dynamical equinox of date) → FK5
  const lambdaP = theta - 1.397 * T - 0.00031 * T * T;
  const dLambda = -0.09033 / 3600 + (0.03916 / 3600) * (Math.cos(lambdaP * DEG) + Math.sin(lambdaP * DEG));
  theta += dLambda;
  // nutation in longitude (main term) + aberration (distance-aware)
  const omega = 125.04452 - 1934.136261 * T;
  const dPsi = -0.00478 * Math.sin(omega * DEG);
  const aberration = -20.4898 / 3600 / R;
  return mod(theta + dPsi + aberration, 360);
}

/**
 * Equation of time in MINUTES (apparent solar − mean solar). Needed for a
 * genuine 真太陽時 (true solar time) hour pillar. Range ≈ −14.2 .. +16.5 min.
 * Meeus 28.3; uses the same VSOP machinery. Pure, no wall-clock.
 */
export function equationOfTimeMinutes(utcMillis: number): number {
  const jd = julianDayFromMillis(utcMillis);
  const year = new Date(utcMillis).getUTCFullYear();
  const jde = jd + deltaTSeconds(year) / 86400;
  const tau = (jde - J2000) / 365250;
  const T = tau * 10;
  const L0 = mod(280.4664567 + 360007.6982779 * tau + 0.03032028 * tau * tau, 360);
  const lambda = sunApparentLongitude(jde);
  const omega = 125.04452 - 1934.136261 * T;
  const eps = meanObliquity(T) + 0.00256 * Math.cos(omega * DEG); // + nutation in obliquity
  const alpha = mod(
    Math.atan2(Math.cos(eps * DEG) * Math.sin(lambda * DEG), Math.cos(lambda * DEG)) / DEG,
    360,
  );
  let e = L0 - 0.0057183 - alpha + -0.00478 * Math.sin(omega * DEG) * Math.cos(eps * DEG);
  e = ((e + 180) % 360) - 180; // shortest signed angle
  return e * 4; // degrees → minutes of time
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
