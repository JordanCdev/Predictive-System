/** Shared, framework-light helpers used across the router pages: the captured
 *  "today", and the pure request-building / birth-canonicalisation utilities that
 *  turn a UI Person into a deterministic engine request. */
import {
  CanonicalBirth,
  CONVENTION_PRESETS,
  DecisionRequest,
  ZIPING_DEFAULT,
  canonicalizeBirth,
  objectiveById,
} from "../engine/index.ts";
import { Person } from "./PersonalizeCard.tsx";

// Captured once at load. The engine still receives explicit values → stays deterministic.
const NOW = new Date();
const pad = (n: number) => String(n).padStart(2, "0");
export const TODAY_CIVIL = { year: NOW.getFullYear(), month: NOW.getMonth() + 1, day: NOW.getDate() };
export const TODAY_ISO = `${TODAY_CIVIL.year}-${pad(TODAY_CIVIL.month)}-${pad(TODAY_CIVIL.day)}`;
export const DEFAULT_TZ = -NOW.getTimezoneOffset();

export const isoOf = (c: { year: number; month: number; day: number }) => `${c.year}-${pad(c.month)}-${pad(c.day)}`;
export const civilOfIso = (iso: string) => {
  const [year, month, day] = iso.split("-").map(Number);
  return { year, month, day };
};
/** Add (or subtract) whole days to an ISO date, in UTC (calendar-safe). */
export function addDaysIso(iso: string, delta: number): string {
  const c = civilOfIso(iso);
  const d = new Date(Date.UTC(c.year, c.month - 1, c.day + delta));
  return isoOf({ year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() });
}
/** True when `iso` looks like a valid YYYY-MM-DD calendar date. */
export function isValidIso(iso: string | undefined): iso is string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const c = civilOfIso(iso);
  const d = new Date(Date.UTC(c.year, c.month - 1, c.day));
  return d.getUTCFullYear() === c.year && d.getUTCMonth() + 1 === c.month && d.getUTCDate() === c.day;
}

/** Canonicalise a UI person into the engine's normalised birth object, applying
 *  the location-precision policy (solar hour basis without longitude → civil clock
 *  + warning). Returns null when there is no person or the date is bad. */
export function canonicalFor(person: Person | null): CanonicalBirth | null {
  if (!person) return null;
  const requested = CONVENTION_PRESETS.find((c) => c.id === person.conventionId) ?? ZIPING_DEFAULT;
  const canonical = canonicalizeBirth(
    {
      dateOfBirth: person.birthDate,
      localBirthTime: person.timeCertainty === "hour_unknown" ? undefined : person.birthTime,
      tzOffsetMinutes: person.tzOffset,
      birthplace: person.birthCity,
      longitudeEast: person.longitudeEast,
      timeAccuracy: person.timeCertainty,
      sex: person.sex,
    },
    requested,
  );
  return canonical.valid ? canonical : null;
}

export function buildRequest(
  objectiveId: string,
  windowDays: number,
  person: Person | null,
  options?: DecisionRequest["options"],
  start: { year: number; month: number; day: number } = TODAY_CIVIL,
): DecisionRequest {
  const objective = objectiveById(objectiveId);
  const tz = person ? person.tzOffset : DEFAULT_TZ;
  const window = { start, days: windowDays, tzOffsetMinutes: tz };
  const canonical = canonicalFor(person);
  if (!person || !canonical || !canonical.moment) {
    return { convention: ZIPING_DEFAULT, objective, window, options };
  }
  return { birth: canonical.moment, sex: person.sex, convention: canonical.convention, objective, window, options };
}

export function ageOn(birthDate: string): number | null {
  const [y, m, d] = birthDate.split("-").map(Number);
  if (!y) return null;
  const ms = Date.UTC(TODAY_CIVIL.year, TODAY_CIVIL.month - 1, TODAY_CIVIL.day) - Date.UTC(y, m - 1, d);
  return ms / (365.25 * 86400000);
}

export function birthCivilOf(birthDate: string): { year: number; month: number; day: number } | null {
  const [y, m, d] = birthDate.split("-").map(Number);
  if (![y, m, d].every(Number.isFinite)) return null;
  return { year: y, month: m, day: d };
}
