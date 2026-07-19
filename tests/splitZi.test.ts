import { describe, expect, it } from "vitest";
import {
  MomentInput,
  ZIPING_DEFAULT,
  ZIPING_SPLIT_ZI,
  ZIPING_ZI_ROLLOVER,
  buildFourPillars,
} from "../src/engine/index.ts";

/**
 * 早子時 / 晚子時 — where does the BaZi day begin?
 *
 * Three defensible positions, and 23:00–23:59 is the only window where they can
 * disagree at all. Until now the engine could express only the two extremes, so
 * the middle position (the one this project's OWN third-party comparator,
 * lunar-javascript, implements) was structurally unreachable and its
 * disagreement could only be downgraded to a warning.
 */

const lateZi: MomentInput = {
  year: 1990,
  month: 6,
  day: 15,
  hour: 23,
  minute: 30,
  tzOffsetMinutes: 0,
  timeCertainty: "exact",
};

const pillars = (conv: typeof ZIPING_DEFAULT, m: MomentInput = lateZi) => {
  const fp = buildFourPillars(m, conv);
  return { day: fp.day.hanzi, hour: fp.hour.hanzi, year: fp.year.hanzi, month: fp.month.hanzi };
};

describe("the three day-boundary schools at 23:30", () => {
  it("civil_midnight keeps today's day AND today's hour stem", () => {
    const a = pillars(ZIPING_DEFAULT);
    const b = pillars(ZIPING_ZI_ROLLOVER);
    expect(a.day).not.toBe(b.day);
    expect(a.hour).not.toBe(b.hour);
  });

  it("split_zi takes the MIDDLE position: today's day, tomorrow's hour stem", () => {
    const midnight = pillars(ZIPING_DEFAULT);
    const rollover = pillars(ZIPING_ZI_ROLLOVER);
    const split = pillars(ZIPING_SPLIT_ZI);

    // Day pillar follows the civil-midnight school…
    expect(split.day).toBe(midnight.day);
    // …while the hour pillar follows the 23:00-rollover school.
    expect(split.hour).toBe(rollover.hour);

    // Which makes it a genuinely distinct third reading, not a duplicate.
    expect(split).not.toEqual(midnight);
    expect(split).not.toEqual(rollover);
  });

  it("keeps the 子 branch in every school — only the stem is in dispute", () => {
    for (const conv of [ZIPING_DEFAULT, ZIPING_ZI_ROLLOVER, ZIPING_SPLIT_ZI]) {
      expect(pillars(conv).hour.slice(-1)).toBe("子");
    }
  });

  it("leaves the year and month pillars alone", () => {
    const midnight = pillars(ZIPING_DEFAULT);
    const split = pillars(ZIPING_SPLIT_ZI);
    expect(split.year).toBe(midnight.year);
    expect(split.month).toBe(midnight.month);
  });
});

describe("outside the late-Zi window the schools must agree exactly", () => {
  const cases: [string, MomentInput][] = [
    ["00:30 — 子 hour but already the new civil day", { ...lateZi, hour: 0, minute: 30 }],
    ["22:59 — one minute before the seam", { ...lateZi, hour: 22, minute: 59 }],
    ["midday", { ...lateZi, hour: 12, minute: 0 }],
  ];

  for (const [label, m] of cases) {
    it(label, () => {
      const midnight = pillars(ZIPING_DEFAULT, m);
      expect(pillars(ZIPING_SPLIT_ZI, m)).toEqual(midnight);
      expect(pillars(ZIPING_ZI_ROLLOVER, m)).toEqual(midnight);
    });
  }
});

describe("determinism", () => {
  it("returns the same pillars for the same inputs", () => {
    expect(pillars(ZIPING_SPLIT_ZI)).toEqual(pillars(ZIPING_SPLIT_ZI));
  });
});
