/**
 * Convention sets (spec §5.3, and the "Convention key" table). Most disputes
 * between calculators live here, so every calculation binds to an EXPLICIT
 * convention set rather than an implicit default.
 */

export type YearBoundary = "lichun_exact";
export type DayBoundary = "civil_midnight" | "zi_23";
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

export const CONVENTION_PRESETS: ConventionSet[] = [
  ZIPING_DEFAULT,
  ZIPING_ZI_ROLLOVER,
  ZIPING_TRUE_SOLAR,
];
