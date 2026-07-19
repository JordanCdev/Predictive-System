import { describe, expect, it } from "vitest";
import { isKnownTimeZone, labelFor, offsetAtInstant, resolveOffset, standardOffset } from "../src/engine/timezone.ts";
import { CITIES } from "../src/ui/cities.ts";
import { ZIPING_TRUE_SOLAR, buildFourPillars, canonicalizeBirth } from "../src/engine/index.ts";

/**
 * These cases are the real-world errors the resolver exists to prevent. Each one
 * is a birth where using the zone's *present-day standard* offset gives the wrong
 * local time — and therefore, potentially, the wrong hour pillar.
 *
 * Every expectation below is a documented historical fact in the IANA database,
 * not an artefact of this implementation.
 */

const civil = (year: number, month: number, day: number, hour: number, minute = 0) => ({ year, month, day, hour, minute });

describe("offsetAtInstant", () => {
  it("reads a fixed, DST-free zone", () => {
    expect(offsetAtInstant("Asia/Shanghai", Date.UTC(2020, 0, 1))).toBe(480);
    expect(offsetAtInstant("Asia/Tokyo", Date.UTC(2020, 0, 1))).toBe(540);
  });

  it("reads half-hour and quarter-hour zones", () => {
    expect(offsetAtInstant("Asia/Kolkata", Date.UTC(2020, 0, 1))).toBe(330);
    expect(offsetAtInstant("Asia/Kathmandu", Date.UTC(2020, 0, 1))).toBe(345);
  });

  it("returns null for a zone the runtime doesn't know", () => {
    expect(offsetAtInstant("Mars/Olympus_Mons", Date.UTC(2020, 0, 1))).toBeNull();
    expect(isKnownTimeZone("Europe/London")).toBe(true);
    expect(isKnownTimeZone("Nowhere/Nothing")).toBe(false);
  });
});

describe("resolveOffset — the errors this prevents", () => {
  it("puts a British summer birth on BST, not GMT", () => {
    // The bug: London's standard offset is 0, so a July birth naively lands an
    // hour early — enough to cross into the previous double-hour.
    const r = resolveOffset("Europe/London", civil(1990, 7, 14, 15, 30));
    expect(r.offsetMinutes).toBe(60);
    expect(r.daylightSaving).toBe(true);
    expect(r.certainty).toBe("exact");
    expect(r.note).toMatch(/summer time/i);
  });

  it("keeps a British winter birth on GMT", () => {
    const r = resolveOffset("Europe/London", civil(1990, 1, 14, 15, 30));
    expect(r.offsetMinutes).toBe(0);
    expect(r.daylightSaving).toBe(false);
  });

  it("catches China's 1986-1991 summer time, which modern tools miss", () => {
    // China has no DST today, so every tool that hard-codes UTC+8 is an hour out
    // for these five summers.
    const dst = resolveOffset("Asia/Shanghai", civil(1988, 7, 10, 12, 0));
    expect(dst.offsetMinutes).toBe(540);
    expect(dst.daylightSaving).toBe(true);

    const winter = resolveOffset("Asia/Shanghai", civil(1988, 12, 10, 12, 0));
    expect(winter.offsetMinutes).toBe(480);
    expect(winter.daylightSaving).toBe(false);
  });

  it("handles a southern-hemisphere zone, where January IS summer time", () => {
    const jan = resolveOffset("Australia/Sydney", civil(1995, 1, 15, 12, 0));
    const jul = resolveOffset("Australia/Sydney", civil(1995, 7, 15, 12, 0));
    expect(jan.offsetMinutes).toBe(660);
    expect(jul.offsetMinutes).toBe(600);
    // Standard time must be the WINTER offset, not simply January's.
    expect(standardOffset("Australia/Sydney", 1995)).toBe(600);
    expect(jan.daylightSaving).toBe(true);
    expect(jul.daylightSaving).toBe(false);
  });

  it("respects a historical zone change, not just DST", () => {
    // Spain ran on UTC+0 (WET) before the civil-war-era switch to CET, and has
    // been UTC+1 ever since — a permanent zone move, not a seasonal one. Both
    // years are midwinter, so neither is summer time.
    expect(resolveOffset("Europe/Madrid", civil(1936, 1, 15, 12, 0)).offsetMinutes).toBe(0);
    expect(resolveOffset("Europe/Madrid", civil(1941, 1, 15, 12, 0)).offsetMinutes).toBe(60);
  });

  it("handles US DST under the pre-2007 rules", () => {
    // DST began in April before 2007, so early March was still standard time.
    const march2005 = resolveOffset("America/New_York", civil(2005, 3, 20, 12, 0));
    expect(march2005.offsetMinutes).toBe(-300);
    // Under the current rules the same date IS daylight time.
    const march2020 = resolveOffset("America/New_York", civil(2020, 3, 20, 12, 0));
    expect(march2020.offsetMinutes).toBe(-240);
  });
});

describe("resolveOffset — transition edge cases", () => {
  it("flags a wall-clock time that occurred twice, and takes the earlier", () => {
    // US Eastern, 3 Nov 2019: 01:30 happened at both -0400 and -0500.
    const r = resolveOffset("America/New_York", civil(2019, 11, 3, 1, 30));
    expect(r.certainty).toBe("ambiguous");
    expect(r.offsetMinutes).toBe(-240); // the earlier (daylight) occurrence
    expect(r.note).toMatch(/twice/i);
  });

  it("flags a wall-clock time that never existed", () => {
    // US Eastern, 10 Mar 2019: clocks jumped 02:00 → 03:00, so 02:30 never was.
    const r = resolveOffset("America/New_York", civil(2019, 3, 10, 2, 30));
    expect(r.certainty).toBe("nonexistent");
    expect(r.note).toMatch(/didn't occur/i);
    // Still returns a usable offset so a chart can be drawn, flagged.
    expect(Number.isFinite(r.offsetMinutes)).toBe(true);
  });

  it("degrades safely for an unknown zone rather than throwing", () => {
    const r = resolveOffset("Nowhere/Nothing", civil(1990, 7, 14, 15, 30));
    expect(r.certainty).toBe("unavailable");
    expect(r.note).toMatch(/manually/i);
  });

  it("is deterministic — the same input always resolves identically", () => {
    const once = resolveOffset("Europe/London", civil(1990, 7, 14, 15, 30));
    const twice = resolveOffset("Europe/London", civil(1990, 7, 14, 15, 30));
    expect(once).toEqual(twice);
  });
});

describe("why this matters — the pillar actually moves", () => {
  it("changes the hour pillar for a British summer birth", () => {
    // 15:30 on the wall in London, July 1990. On BST that is 14:30 UTC; if a tool
    // assumes GMT it reads 15:30 UTC — an hour later in real time, which lands in
    // a different double-hour. This is the concrete cost of getting DST wrong.
    const birth = { year: 1990, month: 7, day: 14, hour: 15, minute: 30 };
    const resolved = resolveOffset("Europe/London", birth);
    expect(resolved.offsetMinutes).toBe(60);

    const moment = (tzOffsetMinutes: number) => ({
      dateOfBirth: "1990-07-14",
      localBirthTime: "15:30",
      tzOffsetMinutes,
      longitudeEast: -0.13,
      timeAccuracy: "exact" as const,
      sex: "female" as const,
    });

    const correct = canonicalizeBirth(moment(resolved.offsetMinutes), ZIPING_TRUE_SOLAR);
    const naive = canonicalizeBirth(moment(0), ZIPING_TRUE_SOLAR);
    expect(correct.valid && naive.valid).toBe(true);

    const correctHour = buildFourPillars(correct.moment!, ZIPING_TRUE_SOLAR).hour.hanzi;
    const naiveHour = buildFourPillars(naive.moment!, ZIPING_TRUE_SOLAR).hour.hanzi;
    expect(correctHour).not.toBe(naiveHour);
  });
});

describe("the city table", () => {
  it("gives every city a zone this runtime can resolve", () => {
    // A typo here wouldn't throw — it would silently fall back to standard time
    // and quietly reintroduce the exact DST error this module exists to fix.
    const broken = CITIES.filter((c) => !isKnownTimeZone(c.zone));
    expect(broken.map((c) => `${c.name} → ${c.zone}`)).toEqual([]);
  });

  it("agrees with each city's recorded standard offset", () => {
    // `tz` is the no-ICU fallback. If it disagrees with the zone's actual winter
    // offset, one of the two is wrong and charts would differ by environment.
    const mismatched = CITIES.filter((c) => standardOffset(c.zone, 2020) !== c.tz).map(
      (c) => `${c.name}: table ${c.tz}, zone ${standardOffset(c.zone, 2020)}`,
    );
    expect(mismatched).toEqual([]);
  });
});

describe("labelFor", () => {
  it("formats offsets the way a birth record would show them", () => {
    expect(labelFor(0)).toBe("UTC");
    expect(labelFor(480)).toBe("UTC+08:00");
    expect(labelFor(-300)).toBe("UTC-05:00");
    expect(labelFor(345)).toBe("UTC+05:45");
  });
});
