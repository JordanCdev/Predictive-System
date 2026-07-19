/**
 * Convention sets (spec §5.3, and the "Convention key" table). Most disputes
 * between calculators live here, so every calculation binds to an EXPLICIT
 * convention set rather than an implicit default.
 */

export type YearBoundary = "lichun_exact";
/**
 * Where the BaZi day begins — the 早子時/晚子時 question, and a genuinely
 * contested one with classical support on more than one side.
 *
 *  - `civil_midnight` — the day pillar turns at 00:00. A 23:30 birth keeps the
 *    current day, and (via 五鼠遁) the current day's hour stem.
 *  - `zi_23` — the whole day turns at 23:00 (早子時 school). A 23:30 birth takes
 *    tomorrow's day pillar and tomorrow's hour stem.
 *  - `split_zi` — the middle position (晚子時): the DAY pillar turns at midnight,
 *    but the 23:00–24:00 hour is already tomorrow's 子 hour, so the hour stem is
 *    derived from the NEXT day's stem while the day pillar stays put.
 *
 * `split_zi` is what lunar-javascript (this engine's own third-party comparator)
 * implements. Before it existed here, that disagreement could only be reported
 * as a warning the engine was structurally unable to resolve.
 */
export type DayBoundary = "civil_midnight" | "zi_23" | "split_zi";
export type HourBasis = "civil_clock" | "local_mean_solar" | "true_solar";
export type DayunStartRule = "three_days_one_year";

export interface ConventionSet {
  id: string;
  label: string;
  yearBoundary: YearBoundary;
  monthBoundary: "jie_terms"; // only the classical jie model is implemented
  dayBoundary: DayBoundary;
  hourBasis: HourBasis;
  dayunStartRule: DayunStartRule;
  /** Minutes within a solar-term boundary that trigger a sensitivity warning. */
  boundaryWarnMinutes: number;
}

export const ZIPING_DEFAULT: ConventionSet = {
  id: "ziping_default_v1",
  label: "Classical Zi Ping (default)",
  yearBoundary: "lichun_exact",
  monthBoundary: "jie_terms",
  dayBoundary: "civil_midnight",
  hourBasis: "civil_clock",
  dayunStartRule: "three_days_one_year",
  boundaryWarnMinutes: 120,
};

export const ZIPING_ZI_ROLLOVER: ConventionSet = {
  ...ZIPING_DEFAULT,
  id: "ziping_zi23_v1",
  label: "Zi Ping with 23:00 Zi-hour day rollover",
  dayBoundary: "zi_23",
};

export const ZIPING_TRUE_SOLAR: ConventionSet = {
  ...ZIPING_DEFAULT,
  id: "ziping_true_solar_v1",
  label: "Zi Ping with true solar time (真太陽時)",
  // true_solar = mean-solar longitude correction + equation of time (apparent Sun),
  // the basis many practitioners require for the hour pillar.
  hourBasis: "true_solar",
};

export const ZIPING_SPLIT_ZI: ConventionSet = {
  ...ZIPING_DEFAULT,
  id: "ziping_split_zi_v1",
  label: "Zi Ping with 晚子時 (day at midnight, hour stem rolls at 23:00)",
  dayBoundary: "split_zi",
};

export const CONVENTION_PRESETS: ConventionSet[] = [
  ZIPING_DEFAULT,
  ZIPING_ZI_ROLLOVER,
  ZIPING_SPLIT_ZI,
  ZIPING_TRUE_SOLAR,
];
