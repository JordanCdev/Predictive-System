/**
 * Deterministic canonical-JSON + hashing (spec §1.1: outputs must be
 * reproducible bit-for-bit; §1.2 requires a calculationHash on every result).
 *
 * No crypto/Node dependency — a stable FNV-1a over a canonical serialization
 * is enough to prove "same input → same hash" in the browser, offline.
 */

/** Stable stringify: object keys sorted recursively, arrays preserved. */
export function canonicalJSON(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      out[key] = sortKeys((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  return value;
}

/** 32-bit FNV-1a, returned as 8-char hex. */
export function fnv1a(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return ("0000000" + h.toString(16)).slice(-8);
}

export function hashOf(value: unknown): string {
  return fnv1a(canonicalJSON(value));
}
