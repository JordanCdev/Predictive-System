/**
 * Device-zone defaults and healing for the birth-input path.
 *
 * THE BUG THIS FIXES
 * The birth form used to seed `tzOffset` with the device's *current* UTC offset
 * (`-new Date().getTimezoneOffset()`), and nothing corrected it unless a birth
 * city was picked. A London user entering a January birth while their device was
 * on BST got +60 baked into the profile: the birth instant lands an hour early,
 * which can flip the year/month pillars near a solar-term instant (e.g.
 * 1998-02-04 01:30 London with +60 reads 丁丑/癸丑 instead of 戊寅/甲寅), and it
 * corrupts DaYun start ages and boundary warnings.
 *
 * THE FIX
 * When no birth city is chosen, adopt the device's IANA zone as the birth zone
 * and resolve the offset FOR THE BIRTH DATE through the same `resolveOffset`
 * path cities use — historically correct, summer time included. Stored profiles
 * that were seeded before this fix are healed on load by `healBirthTimezone`.
 *
 * Determinism note: reading the device zone is an environment read, not a clock
 * read, and it stays in the UI layer. Every engine calculation still receives an
 * explicit offset.
 */
import { isKnownTimeZone, resolveOffset } from "../engine/timezone.ts";
import { cityByName } from "./cities.ts";
import type { Person } from "./PersonalizeCard.tsx";

/** The device's IANA time zone, or null when the runtime can't provide one it
 *  can also resolve historically (no ICU data, exotic embedders). */
export function deviceTimeZone(): string | null {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return zone && isKnownTimeZone(zone) ? zone : null;
  } catch {
    return null;
  }
}

/** Captured once at load — the zone a birth is assumed to be in until a city says otherwise. */
export const DEVICE_ZONE = deviceTimeZone();

/** The person's birth reading as a civil date-time for offset resolution.
 *  Noon stands in when the hour is unknown — DST rules within a day differ only
 *  in the small hours, so noon is the safest representative reading. */
function birthCivilReading(person: Person): { year: number; month: number; day: number; hour: number; minute: number } | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(person.birthDate)) return null;
  const [year, month, day] = person.birthDate.split("-").map(Number);
  const time = person.timeCertainty === "hour_unknown" ? "12:00" : person.birthTime;
  const tm = /^(\d{2}):(\d{2})$/.exec(time || "");
  const hour = tm ? Number(tm[1]) : 12;
  const minute = tm ? Number(tm[2]) : 0;
  if (![year, month, day, hour, minute].every(Number.isFinite)) return null;
  return { year, month, day, hour, minute };
}

/** Offsets the fallback (device) zone has actually used during this app's
 *  lifetime — the ONLY values the old device-seed bug could have written. A
 *  stored offset outside this set cannot be the seed bug, so healing must not
 *  touch it: it was most likely entered deliberately before `tzManual` existed. */
function seedableOffsets(zone: string): Set<number> {
  const out = new Set<number>();
  // The bug shipped with the app (2026); probe both seasons of the era.
  for (const year of [2025, 2026]) {
    for (const month of [1, 7]) {
      const r = resolveOffset(zone, { year, month, day: 15, hour: 12, minute: 0 });
      if (r.certainty !== "unavailable") out.add(r.offsetMinutes);
    }
  }
  return out;
}

/**
 * Heal a stored person's birth tz offset.
 *
 *  - `birthZone` set, `tzManual` not: re-resolve the offset for the birth date
 *    and correct it if stale (a rule change, or a record saved before a fix).
 *  - NO `birthZone` but a `birthCity`: an older city profile — the city table is
 *    the authority for its zone. An unknown city is left untouched entirely
 *    rather than guessed at with the device zone.
 *  - NO `birthZone`, no city, `tzManual` not: a legacy default-seeded profile —
 *    exactly the population the old device-offset bug corrupted. Adopt the
 *    fallback (device) zone and resolve properly — but ONLY when the stored
 *    offset is one the device seed could actually have produced; anything else
 *    predates `tzManual` and was probably deliberate.
 *  - `tzManual` set: never touched — the user took control for a reason.
 *
 * Returns the SAME object when nothing changes, so callers can cheaply detect
 * whether anything was healed (and persist only then).
 */
export function healBirthTimezone<P extends Person>(person: P, fallbackZone: string | null = DEVICE_ZONE): P {
  if (person.tzManual) return person;
  const cityZone = !person.birthZone && person.birthCity ? cityByName(person.birthCity)?.zone ?? null : null;
  if (!person.birthZone && person.birthCity && !cityZone) return person; // unknown city — never guess
  const zone = person.birthZone ?? cityZone ?? fallbackZone;
  if (!zone) return person;
  // Device-fallback healing is reserved for offsets the seed bug could have written.
  if (!person.birthZone && !cityZone && !seedableOffsets(zone).has(person.tzOffset)) return person;
  const civil = birthCivilReading(person);
  if (!civil) return person;
  const resolved = resolveOffset(zone, civil);
  if (resolved.certainty === "unavailable") return person;
  if (person.birthZone === zone && person.tzOffset === resolved.offsetMinutes) return person;
  return { ...person, birthZone: zone, tzOffset: resolved.offsetMinutes };
}
