/**
 * Multi-layered version registry (spec §18). Each layer is versioned
 * independently; every engine result embeds these so any output can be
 * reproduced and diffed against another build.
 */
export const VERSIONS = {
  engine: "0.1.0",
  calendarKernel: "calendar-1.0.0",
  solarModel: "meeus-low-precision-1.0.0",
  symbolTables: "symbols-1.0.0",
  baziAlgorithm: "bazi-ziping-1.0.0",
  tongshuRulePack: "tongshu-jianchu-1.0.0",
  decisionPolicy: "mcda-1.0.0",
  tzdb: "host-Intl-runtime",
} as const;

export type Versions = typeof VERSIONS;
