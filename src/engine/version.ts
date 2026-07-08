/**
 * Multi-layered version registry (spec §18). Each layer is versioned
 * independently; every engine result embeds these so any output can be
 * reproduced and diffed against another build.
 */
export const VERSIONS = {
  engine: "0.3.0",
  calendarKernel: "calendar-1.0.0",
  solarModel: "vsop87-abridged-1.1.0",
  symbolTables: "symbols-1.0.0",
  baziAlgorithm: "bazi-ziping-1.2.0", // + 從格/專旺 structures, 調候 reconciliation
  tongshuRulePack: "tongshu-jianchu-1.0.0",
  decisionPolicy: "mcda-3.0.0", // + almanac 宜忌 blend, periods, three-way output
  sensitivity: "sweeps-1.0.0",
  verification: "verify-1.1.0", // + almanac adapter
  tzdb: "host-Intl-runtime",
} as const;

export type Versions = typeof VERSIONS;
