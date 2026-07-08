/**
 * Public engine API. The five deterministic layers (calendar → chart → school
 * rules → decision → explanation payload) are composed here. Nothing in this
 * module touches the network, the wall clock (beyond explicit inputs), or an
 * LLM — satisfying the spec's determinism constraints (§1.1).
 */

export * from "./symbols.ts";
export * from "./conventions.ts";
export * from "./astronomy.ts";
export * from "./sexagenary.ts";
export * from "./bazi.ts";
export * from "./tongshu.ts";
export * from "./objectives.ts";
export * from "./decision.ts";
export * from "./plainEnglish.ts";
export * from "./advisor.ts";
export * from "./periods.ts";
export * from "./lifeAreas.ts";
export * from "./request.ts";
export * from "./sensitivity/conventionSweep.ts";
export * from "./sensitivity/weightSweep.ts";
// Verification: types + report aggregation are bundle-safe. The comparators
// (lunar-javascript, fixtures) live behind a dynamic import of
// ./verification/runVerification.ts so they stay a lazily-loaded chunk.
export * from "./verification/types.ts";
export * from "./verification/verificationReport.ts";
export { VERSIONS } from "./version.ts";
export type { Versions } from "./version.ts";
export { hashOf, canonicalJSON } from "./hash.ts";
