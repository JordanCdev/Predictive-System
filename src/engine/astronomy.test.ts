import { describe, it, expect } from "vitest";
import {
  deltaTSeconds,
  equationOfTimeMinutes,
  findSolarLongitudeCrossing,
} from "./astronomy.ts";
import { buildFourPillars } from "./sexagenary.ts";
import { ZIPING_DEFAULT, ZIPING_TRUE_SOLAR } from "./conventions.ts";

/** Crossing near a UTC guess, asserted within ±tol seconds of a published instant. */
function crossingDiffSec(deg: number, seedUtc: number, publishedIso: string): number {
  const got = findSolarLongitudeCrossing(deg, seedUtc);
  return Math.abs(got - Date.parse(publishedIso)) / 1000;
}

describe("astronomy precision (VSOP87 abridged)", () => {
  // Published solar-term instants (Purple Mountain Obs / Xinhua, converted to UTC;
  // solstices/equinoxes cross-checked against USNO Earth's Seasons).
  const TERMS: [string, number, number, string][] = [
    ["立春 2024", 315, Date.UTC(2024, 1, 4, 8), "2024-02-04T08:27:08Z"],
    ["春分 2024", 0, Date.UTC(2024, 2, 20, 3), "2024-03-20T03:06:24Z"],
    ["清明 2024", 15, Date.UTC(2024, 3, 4, 7), "2024-04-04T07:02:18Z"],
    ["夏至 2024", 90, Date.UTC(2024, 5, 20, 20), "2024-06-20T20:51:00Z"],
    ["秋分 2024", 180, Date.UTC(2024, 8, 22, 12), "2024-09-22T12:44:00Z"],
    ["大雪 2024", 255, Date.UTC(2024, 11, 6, 15), "2024-12-06T15:16:47Z"],
    ["冬至 2024", 270, Date.UTC(2024, 11, 21, 9), "2024-12-21T09:20:00Z"],
  ];

  it("hits published solar-term instants within 90 seconds (was 3–8 min early)", () => {
    for (const [name, deg, seed, pub] of TERMS) {
      const diff = crossingDiffSec(deg, seed, pub);
      expect(diff, `${name} off by ${diff}s`).toBeLessThan(90);
    }
  });

  it("ΔT is refit to observed values and stays continuous across branch boundaries", () => {
    expect(deltaTSeconds(2024)).toBeCloseTo(69.2, 0); // observed ~69.2 (was 73.9)
    expect(deltaTSeconds(2000)).toBeCloseTo(63.86, 0);
    expect(deltaTSeconds(1850)).toBeCloseTo(6.8, 0); // Espenak-Meeus 1800–1860 branch (was -17)
    // No discontinuity at the 2050 / 1900 / 1860 branch seams.
    for (const yr of [2050, 1900, 1860]) {
      expect(Math.abs(deltaTSeconds(yr) - deltaTSeconds(yr - 1)), `ΔT jump at ${yr}`).toBeLessThan(2);
    }
  });

  it("equation of time matches known extremes", () => {
    expect(equationOfTimeMinutes(Date.UTC(2024, 1, 11, 12))).toBeCloseTo(-14.2, 0);
    expect(equationOfTimeMinutes(Date.UTC(2024, 10, 3, 12))).toBeCloseTo(16.4, 0);
    expect(Math.abs(equationOfTimeMinutes(Date.UTC(2024, 3, 15, 12)))).toBeLessThan(1); // near zero mid-Apr
  });

  it("true-solar convention shifts the hour pillar by the equation of time", () => {
    // A birth ~12 min before a double-hour boundary; EoT in early Nov is ~+16 min,
    // which is enough to roll the hour branch forward under true-solar time.
    const m = { year: 2024, month: 11, day: 3, hour: 12, minute: 52, tzOffsetMinutes: 0 };
    const civil = buildFourPillars(m, ZIPING_DEFAULT);
    const solar = buildFourPillars(m, ZIPING_TRUE_SOLAR);
    expect(civil.hour.branch.hanzi).not.toBe(solar.hour.branch.hanzi);
  });
});
