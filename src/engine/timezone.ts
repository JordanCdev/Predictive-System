/**
 * Historical timezone resolution — what the clock on the wall actually read.
 *
 * WHY THIS EXISTS
 * A BaZi hour pillar is computed from local time, so the UTC offset in force *at
 * the moment of birth* has to be right. Standard-time offsets are not enough:
 *
 *   - Someone born in London on 14 July 1990 was on British Summer Time (UTC+1),
 *     not GMT. Using +0 shifts the birth an hour and can move it into the
 *     neighbouring double-hour, changing the hour branch outright.
 *   - Someone born in Shanghai in July 1988 was on China's short-lived DST
 *     (UTC+9), a rule most tools miss entirely because China has no DST today.
 *   - Wartime Britain ran Double Summer Time (UTC+2).
 *   - Zones themselves have moved: pre-1949 China ran several zones; Spain
 *     switched from UTC+0 to UTC+1 in 1940.
 *
 * Asking the user to know this is asking them to know the answer before they can
 * ask the question — it's the sort of silent error practitioners check for.
 *
 * HOW
 * The browser ships the full IANA tz database. `Intl.DateTimeFormat` can report a
 * zone's offset for any instant, historical rules included, so we don't ship or
 * maintain a tz table of our own.
 *
 * The subtlety: we hold a *wall-clock* reading and need the instant. That
 * inversion is not a function — during a DST "fall back" one wall-clock time
 * happens twice, and during "spring forward" some times never happen. Both are
 * resolved explicitly below rather than silently.
 *
 * Determinism: every function takes its inputs explicitly and reads no clock, so
 * the engine's determinism contract holds.
 */

export interface CivilDateTime {
  year: number;
  month: number; // 1-12
  day: number; // 1-31
  hour: number; // 0-23
  minute: number; // 0-59
}

export type OffsetCertainty =
  | "exact" //      one unambiguous offset
  | "ambiguous" //  clock repeated (DST ended); we pick the earlier/standard one
  | "nonexistent" // clock skipped (DST began); the reading can't have occurred
  | "unavailable"; // the runtime couldn't resolve the zone at all

export interface ResolvedOffset {
  /** Minutes east of UTC, e.g. +60 for BST, -300 for US Eastern standard. */
  offsetMinutes: number;
  certainty: OffsetCertainty;
  /** True when the offset differs from the zone's winter/standard offset —
   *  i.e. some form of summer time was in force. */
  daylightSaving: boolean;
  /** Short zone label as the runtime names it ("GMT+1"), for display. */
  label: string;
  /** Human note when something needs saying; null when it's an ordinary case. */
  note: string | null;
}

/**
 * The zone's UTC offset at a given *instant*.
 *
 * `longOffset` yields strings like "GMT+05:30" / "GMT" / "GMT-8". Parsed rather
 * than assumed, because engines differ in how they abbreviate whole hours.
 */
export function offsetAtInstant(timeZone: string, utcMillis: number): number | null {
  try {
    const fmt = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "longOffset" });
    const part = fmt.formatToParts(new Date(utcMillis)).find((p) => p.type === "timeZoneName");
    if (!part) return null;
    const m = /GMT([+-])(\d{1,2})(?::(\d{2}))?/.exec(part.value);
    if (!m) return /^GMT$/.test(part.value.trim()) ? 0 : null; // bare "GMT" == +00:00
    const sign = m[1] === "-" ? -1 : 1;
    return sign * (Number(m[2]) * 60 + Number(m[3] ?? 0));
  } catch {
    return null; // unknown zone, or an environment without full ICU data
  }
}

/** Is this a zone name the runtime actually knows? */
export function isKnownTimeZone(timeZone: string): boolean {
  return offsetAtInstant(timeZone, Date.UTC(2000, 0, 1)) !== null;
}

const asUtc = (c: CivilDateTime) => Date.UTC(c.year, c.month - 1, c.day, c.hour, c.minute);

/**
 * Resolve the UTC offset in force for a wall-clock reading in a zone.
 *
 * Method: treat the reading as if it were UTC, ask the zone for its offset at
 * that instant, and use it to step to a candidate instant. Re-read the offset
 * there. If it agrees, the mapping is consistent. If not, we're at a transition
 * and both candidates are checked explicitly:
 *
 *   - both consistent  → the clock read this twice (fall back) → "ambiguous",
 *     and we take the earlier (larger) offset, i.e. still-summer-time, which is
 *     the first of the two occurrences.
 *   - neither consistent → the clock never read this (spring forward) →
 *     "nonexistent"; we report the post-transition offset so a chart can still
 *     be produced, flagged.
 */
export function resolveOffset(timeZone: string, civil: CivilDateTime): ResolvedOffset {
  const naive = asUtc(civil);

  // Probe the offsets in force on either side of the reading. A transition moves
  // the clock by at most a couple of hours, so ±12h brackets both regimes while
  // staying inside the same rule period.
  const probed = [
    offsetAtInstant(timeZone, naive - 12 * 3_600_000),
    offsetAtInstant(timeZone, naive),
    offsetAtInstant(timeZone, naive + 12 * 3_600_000),
  ];
  if (probed.every((o) => o === null)) {
    return {
      offsetMinutes: 0,
      certainty: "unavailable",
      daylightSaving: false,
      label: "UTC",
      note: "This device couldn't look up historical time zones; set the birth time zone manually.",
    };
  }
  const candidates = [...new Set(probed.filter((o): o is number => o !== null))];

  // A candidate offset is REAL only if stepping back by it lands on an instant
  // where the zone is actually running that offset. Counting the self-consistent
  // ones is what distinguishes the three cases: two means the clock struck this
  // time twice, zero means it never struck it at all.
  const valid = candidates.filter((o) => offsetAtInstant(timeZone, naive - o * 60_000) === o);

  const standard = standardOffset(timeZone, civil.year) ?? candidates[0];

  let offsetMinutes: number;
  let certainty: OffsetCertainty;
  let note: string | null = null;

  if (valid.length === 0) {
    // Spring forward: the clock jumped over this reading. Report the offset that
    // applies after the jump so a chart can still be drawn — clearly flagged.
    offsetMinutes = Math.max(...candidates);
    certainty = "nonexistent";
    note = "The clocks went forward that night, so this exact time didn't occur locally — worth checking the birth time.";
  } else if (valid.length === 1) {
    offsetMinutes = valid[0];
    certainty = "exact";
  } else {
    // Fall back: take the larger offset, i.e. the first (still-summer-time) of
    // the two occurrences.
    offsetMinutes = Math.max(...valid);
    certainty = "ambiguous";
    note = "The clocks went back that night, so this time occurred twice — the earlier one is assumed.";
  }

  const daylightSaving = offsetMinutes !== standard;
  if (daylightSaving && certainty === "exact") {
    const ahead = (offsetMinutes - standard) / 60;
    note = `Summer time was in force — ${ahead === 1 ? "an hour" : `${ahead}h`} ahead of standard time, which shifts the hour pillar.`;
  }

  return { offsetMinutes, certainty, daylightSaving, label: labelFor(offsetMinutes), note };
}

/**
 * The zone's standard (non-summer) offset for a given year.
 *
 * Sampled at midwinter in each hemisphere and the smaller offset taken: a
 * southern-hemisphere zone is on DST in January, so probing January alone would
 * report summer time as "standard" for Sydney or Auckland.
 */
export function standardOffset(timeZone: string, year: number): number | null {
  const jan = offsetAtInstant(timeZone, Date.UTC(year, 0, 15));
  const jul = offsetAtInstant(timeZone, Date.UTC(year, 6, 15));
  if (jan === null || jul === null) return jan ?? jul;
  return Math.min(jan, jul);
}

export function labelFor(offsetMinutes: number): string {
  if (offsetMinutes === 0) return "UTC";
  const sign = offsetMinutes < 0 ? "-" : "+";
  const abs = Math.abs(offsetMinutes);
  const hh = String(Math.floor(abs / 60)).padStart(2, "0");
  const mm = String(abs % 60).padStart(2, "0");
  return `UTC${sign}${hh}:${mm}`;
}
