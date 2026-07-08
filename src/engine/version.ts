/**
 * Multi-layered version registry (spec §18). Each layer is versioned
 * independently; every engine result embeds these so any output can be
 * reproduced and diffed against another build.
 */
export const VERSIONS = {
  engine: "0.2.0",
  calendarKernel: "calendar-1.0.0",
  solarModel: "vsop87-abridged-1.1.0",
  symbolTables: "symbols-1.0.0",
  baziAlgorithm: "bazi-ziping-1.1.0",
  tongshuRulePack: "tongshu-jianchu-1.0.0",
  decisionPolicy: "mcda-2.0.0", // recommendationScore/confidence split + taboo hard-vetoes
  sensitivity: "sweeps-1.0.0",
  verification: "verify-1.0.0",
  tzdb: "host-Intl-runtime",
} as const;

export type Versions = typeof VERSIONS;
