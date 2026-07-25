/**
 * Regression tests for the birth-input accuracy fixes (Agent A):
 *
 *  1. Device-offset seeding bug: the birth tz offset must be resolved FOR THE
 *     BIRTH DATE from an IANA zone, never inherited from the device's current
 *     offset. (A London January birth typed during BST used to get +60 and flip
 *     the year/month pillars across 立春.)
 *  2. Stored-profile healing: `healBirthTimezone` corrects stale offsets and
 *     adopts a fallback (device) zone for legacy zone-less profiles, and never
 *     touches manual overrides.
 *  3. Convention comparison: the golden chart holds under BOTH the app-default
 *     true-solar convention and the mainstream civil-clock preset, and the
 *     comparison helper surfaces a genuine school difference where one exists.
 */
import { describe, expect, it } from "vitest";
import { buildFourPillars } from "../src/engine/sexagenary.ts";
import { ZIPING_DEFAULT, ZIPING_TRUE_SOLAR } from "../src/engine/conventions.ts";
import { resolveOffset } from "../src/engine/timezone.ts";
import { deviceTimeZone, healBirthTimezone } from "../src/ui/birthZoneDefaults.ts";
import { isKnownTimeZone } from "../src/engine/timezone.ts";
import { pillarsUnderConvention } from "../src/ui/ConventionCompare.tsx";
import type { Person } from "../src/ui/PersonalizeCard.tsx";

const pillars = (tzOffsetMinutes: number, civil: { year: number; month: number; day: number; hour: number; minute: number }) => {
  const p = buildFourPillars({ ...civil, tzOffsetMinutes, timeCertainty: "exact" }, ZIPING_DEFAULT);
  return { year: p.year.hanzi, month: p.month.hanzi, day: p.day.hanzi, hour: p.hour.hanzi };
};

describe("device-zone default resolution (the seeding bug)", () => {
  // A birth ENTERED while the device is on summer time must still resolve the
  // WINTER offset for a winter birth date. We simulate the fixed path by
  // resolving from an explicit zone, exactly as the form now does via the
  // seeded device zone.
  const janBirth = { year: 1998, month: 2, day: 4, hour: 1, minute: 30 };

  it("resolves GMT (not the device's summer offset) for a January London birth", () => {
    const r = resolveOffset("Europe/London", janBirth);
    expect(r.offsetMinutes).toBe(0);
    expect(r.certainty).toBe("exact");
    expect(r.daylightSaving).toBe(false);
  });

  it("shows the exact corruption the old +60 seed caused: year AND month pillars flip across 立春", () => {
    const correct = pillars(0, janBirth); // what the resolver now produces
    const corrupted = pillars(60, janBirth); // what the device-offset seed produced during BST
    expect(correct.year).toBe("戊寅");
    expect(correct.month).toBe("甲寅");
    expect(corrupted.year).toBe("丁丑");
    expect(corrupted.month).toBe("癸丑");
  });

  it("deviceTimeZone() returns null or a zone the resolver can actually use", () => {
    const zone = deviceTimeZone();
    if (zone !== null) expect(isKnownTimeZone(zone)).toBe(true);
  });
});

describe("healBirthTimezone (stored-profile healing)", () => {
  const base: Person = {
    birthDate: "1998-02-04",
    birthTime: "01:30",
    sex: "male",
    timeCertainty: "exact",
    tzOffset: 60, // stale — the corrupted seed
    conventionId: "ziping_true_solar_v1",
    birthZone: "Europe/London",
  };

  it("re-resolves a stale offset when the person has a birthZone and no manual override", () => {
    const healed = healBirthTimezone(base, null);
    expect(healed.tzOffset).toBe(0);
    expect(healed.birthZone).toBe("Europe/London");
  });

  it("adopts the fallback (device) zone for a legacy zone-less profile — the corrupted population", () => {
    const legacy: Person = { ...base, birthZone: undefined };
    const healed = healBirthTimezone(legacy, "Europe/London");
    expect(healed.birthZone).toBe("Europe/London");
    expect(healed.tzOffset).toBe(0);
  });

  it("heals in the other direction too: a summer birth stuck on the winter offset gains BST", () => {
    const summer: Person = { ...base, birthDate: "1990-07-14", birthTime: "15:30", tzOffset: 0 };
    expect(healBirthTimezone(summer, null).tzOffset).toBe(60);
  });

  it("resolves at noon for hour-unknown births (DST rules only differ in the small hours)", () => {
    const unknown: Person = { ...base, timeCertainty: "hour_unknown", birthTime: "" };
    expect(healBirthTimezone(unknown, null).tzOffset).toBe(0);
  });

  it("NEVER touches a manual override, even a stale-looking one", () => {
    const manual: Person = { ...base, tzManual: true };
    expect(healBirthTimezone(manual, null)).toBe(manual); // same object, not just same values
  });

  it("returns the identical object when there is nothing to heal (cheap change detection)", () => {
    const alreadyRight: Person = { ...base, tzOffset: 0 };
    expect(healBirthTimezone(alreadyRight, null)).toBe(alreadyRight);
  });

  it("degrades safely: no zone + no fallback, unknown zone, or an unparseable date", () => {
    const noZone: Person = { ...base, birthZone: undefined };
    expect(healBirthTimezone(noZone, null)).toBe(noZone);
    const badZone: Person = { ...base, birthZone: "Nowhere/Nothing" };
    expect(healBirthTimezone(badZone, null)).toBe(badZone);
    const badDate: Person = { ...base, birthDate: "not-a-date" };
    expect(healBirthTimezone(badDate, null)).toBe(badDate);
  });

  // ── review-hardened cases: the fallback zone must never clobber better data ──

  it("a legacy CITY profile heals to the CITY's zone, never the device fallback", () => {
    // Beijing profile stored before birthZone existed, opened on a London device:
    // adopting Europe/London would silently shift the chart by 8 hours.
    const beijing: Person = {
      ...base,
      birthZone: undefined,
      birthCity: "Beijing",
      longitudeEast: 116.41,
      tzOffset: 480,
    };
    const healed = healBirthTimezone(beijing, "Europe/London");
    expect(healed.birthZone).toBe("Asia/Shanghai");
    expect(healed.tzOffset).toBe(480);
  });

  it("an UNKNOWN city is left untouched entirely rather than guessed at", () => {
    const mystery: Person = { ...base, birthZone: undefined, birthCity: "Atlantis", tzOffset: 180 };
    expect(healBirthTimezone(mystery, "Europe/London")).toBe(mystery);
  });

  it("a zone-less offset the device zone could NOT have seeded is left alone (pre-tzManual manual entries)", () => {
    // +480 is not an offset Europe/London has used this app's lifetime, so it
    // cannot be the seed bug — it was almost certainly deliberate.
    const deliberate: Person = { ...base, birthZone: undefined, tzOffset: 480 };
    expect(healBirthTimezone(deliberate, "Europe/London")).toBe(deliberate);
  });

  it("still heals the genuinely seedable offsets: both London seasonal offsets qualify", () => {
    const gmtSeeded: Person = { ...base, birthZone: undefined, tzOffset: 0, birthDate: "1990-07-14", birthTime: "15:30" };
    expect(healBirthTimezone(gmtSeeded, "Europe/London").tzOffset).toBe(60); // summer birth → BST
    const bstSeeded: Person = { ...base, birthZone: undefined, tzOffset: 60 }; // winter birth seeded in summer
    expect(healBirthTimezone(bstSeeded, "Europe/London").tzOffset).toBe(0);
  });
});

describe("convention comparison (perceived-inaccuracy panel)", () => {
  const jordan: Person = {
    birthDate: "1998-03-23",
    birthTime: "19:47",
    sex: "male",
    timeCertainty: "exact",
    tzOffset: resolveOffset("Europe/London", { year: 1998, month: 3, day: 23, hour: 19, minute: 47 }).offsetMinutes,
    conventionId: "ziping_true_solar_v1",
    birthCity: "London",
    birthZone: "Europe/London",
    longitudeEast: -0.1276,
  };

  it("golden chart holds under the app default (true solar): 戊寅/乙卯/己巳/甲戌", () => {
    const r = pillarsUnderConvention(jordan, ZIPING_TRUE_SOLAR);
    expect(r?.pillars).toEqual(["戊寅", "乙卯", "己巳", "甲戌"]);
    expect(r?.effectiveHourBasis).toBe("true_solar");
  });

  it("golden chart under the civil-clock preset: identical here — the panel must say so honestly", () => {
    const r = pillarsUnderConvention(jordan, ZIPING_DEFAULT);
    expect(r?.pillars).toEqual(["戊寅", "乙卯", "己巳", "甲戌"]);
    expect(r?.effectiveHourBasis).toBe("civil_clock");
  });

  it("surfaces a genuine school difference where one exists (1990 BST birth: hour 癸未 vs 甲申)", () => {
    const p: Person = { ...jordan, birthDate: "1990-07-14", birthTime: "15:30", tzOffset: 60 };
    const solar = pillarsUnderConvention(p, ZIPING_TRUE_SOLAR)!;
    const civil = pillarsUnderConvention(p, ZIPING_DEFAULT)!;
    expect(solar.pillars).toEqual(["庚午", "癸未", "庚辰", "癸未"]);
    expect(civil.pillars).toEqual(["庚午", "癸未", "庚辰", "甲申"]);
  });

  it("downgrades honestly without a longitude: both readings use the civil clock and match", () => {
    const noLon: Person = { ...jordan, longitudeEast: undefined, birthCity: undefined };
    const solar = pillarsUnderConvention(noLon, ZIPING_TRUE_SOLAR)!;
    const civil = pillarsUnderConvention(noLon, ZIPING_DEFAULT)!;
    expect(solar.effectiveHourBasis).toBe("civil_clock");
    expect(solar.pillars).toEqual(civil.pillars);
  });

  it("returns null rather than a bogus chart for an invalid date", () => {
    expect(pillarsUnderConvention({ ...jordan, birthDate: "garbage" }, ZIPING_DEFAULT)).toBeNull();
  });
});
