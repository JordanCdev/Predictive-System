/**
 * Canonical birth-input model + normaliser (Phase Delta of the audit plan).
 *
 * A first-class request object rather than a loose bag of front-end fields:
 * it preserves the original input, derives the engine `MomentInput`, records
 * which fields are missing, and applies the location-precision policy for solar
 * hour bases. Pure — no network, no wall clock.
 *
 * Policy for true/mean-solar time without a longitude: DOWNGRADE to civil-clock
 * with an explicit warning rather than silently applying an equation-of-time-
 * only approximation. (The engine keeps its own defence-in-depth guard; this is
 * the request layer stating the choice up front.)
 */

import { MomentInput } from "./sexagenary.ts";
import { ConventionSet, ZIPING_DEFAULT } from "./conventions.ts";

export type TimeAccuracy = "exact" | "approximate" | "hour_unknown";

export interface RawBirthInput {
  /** "YYYY-MM-DD". */
  dateOfBirth: string;
  /** "HH:MM" local civil time; omit when unknown. */
  localBirthTime?: string;
  /** Minutes east of UTC (e.g. +480 for UTC+8). */
  tzOffsetMinutes: number;
  /** Free-text birthplace, for provenance/display. */
  birthplace?: string;
  longitudeEast?: number;
  latitude?: number;
  timeAccuracy?: TimeAccuracy;
  sex?: "male" | "female";
}

export interface CanonicalBirth {
  original: RawBirthInput;
  /** The engine input, or null when the date could not be parsed. */
  moment: MomentInput | null;
  /** The convention to actually use — possibly downgraded from the request. */
  convention: ConventionSet;
  requestedConventionId: string;
  /** True when a solar hour basis was downgraded to civil-clock (no longitude). */
  downgraded: boolean;
  /** Fields the user did not supply (affects input completeness / confidence). */
  missingFields: string[];
  warnings: string[];
  valid: boolean;
}

function parseYmd(s: string): [number, number, number] | null {
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s.trim());
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return [y, mo, d];
}

function parseHm(s: string | undefined): [number, number] | null {
  if (!s) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const [h, min] = [Number(m[1]), Number(m[2])];
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return [h, min];
}

/**
 * Normalise a raw birth input against a requested convention. Never throws:
 * an unparseable date yields `valid: false` with `moment: null`.
 */
export function canonicalizeBirth(raw: RawBirthInput, requested: ConventionSet): CanonicalBirth {
  const missingFields: string[] = [];
  const warnings: string[] = [];

  const ymd = parseYmd(raw.dateOfBirth);
  if (!ymd) {
    return {
      original: raw,
      moment: null,
      convention: requested,
      requestedConventionId: requested.id,
      downgraded: false,
      missingFields: ["dateOfBirth"],
      warnings: ["Birth date could not be read — falling back to the general almanac read."],
      valid: false,
    };
  }

  const accuracy: TimeAccuracy = raw.timeAccuracy ?? (raw.localBirthTime ? "exact" : "hour_unknown");
  const hm = parseHm(raw.localBirthTime);
  if (accuracy !== "hour_unknown" && !hm) {
    warnings.push("Birth time was not readable — using noon and treating the hour as unknown.");
  }
  const timeKnown = accuracy !== "hour_unknown" && hm !== null;
  if (!timeKnown) missingFields.push("localBirthTime");
  if (raw.longitudeEast === undefined) missingFields.push("longitude");
  if (!raw.birthplace) missingFields.push("birthplace");

  // Location-precision policy for solar hour bases.
  let convention = requested;
  let downgraded = false;
  if (requested.hourBasis !== "civil_clock" && raw.longitudeEast === undefined) {
    convention = {
      ...requested,
      hourBasis: "civil_clock",
      id: `${requested.id}__civil_fallback`,
      label: `${requested.label} — civil-clock fallback (no birthplace longitude)`,
    };
    downgraded = true;
    warnings.push(
      "Solar time needs a birthplace longitude, which is missing — using civil clock time instead. Add your birth city for a true 真太陽時 hour pillar.",
    );
  }

  const [year, month, day] = ymd;
  const [hour, minute] = timeKnown ? hm! : [12, 0];
  const moment: MomentInput = {
    year,
    month,
    day,
    hour,
    minute,
    tzOffsetMinutes: raw.tzOffsetMinutes,
    longitudeEast: raw.longitudeEast,
    timeCertainty: timeKnown ? accuracy : "hour_unknown",
  };

  return {
    original: raw,
    moment,
    convention,
    requestedConventionId: requested.id,
    downgraded,
    missingFields,
    warnings,
    valid: true,
  };
}

export { ZIPING_DEFAULT };
