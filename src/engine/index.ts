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
export { VERSIONS } from "./version.ts";
export { hashOf, canonicalJSON } from "./hash.ts";
