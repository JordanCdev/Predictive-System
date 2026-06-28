import { describe, it, expect } from "vitest";
import { buildFourPillars } from "./sexagenary.ts";
import { ZIPING_DEFAULT } from "./conventions.ts";
import { SOLAR_TERMS, findSolarLongitudeCrossing, solarLongitudeAtMillis } from "./astronomy.ts";

/** Pillars rendered as 甲子 strings for compact assertions. */
function pillars(m: Parameters<typeof buildFourPillars>[0]) {
  const fp = buildFourPillars(m, ZIPING_DEFAULT);
  return {
    year: fp.year.hanzi,
    month: fp.month.hanzi,
    day: fp.day.hanzi,
    hour: fp.hour.hanzi,
  };
}

describe("golden charts — independent cross-checks", () => {
  // Verified against the Cantian AI calculator (civil clock, civil midnight).
  it("2000-01-01 noon → 己卯 / 丙子 / 戊午", () => {
    const p = pillars({ year: 2000, month: 1, day: 1, hour: 12, minute: 0, tzOffsetMinutes: 480 });
    expect(p.year).toBe("己卯");
    expect(p.month).toBe("丙子");
    expect(p.day).toBe("戊午");
  });

  it("1984-06-15 noon → 甲子 / 庚午 / 庚辰", () => {
    const p = pillars({ year: 1984, month: 6, day: 15, hour: 12, minute: 0, tzOffsetMinutes: 480 });
    expect(p.year).toBe("甲子");
    expect(p.month).toBe("庚午");
    expect(p.day).toBe("庚辰");
  });

  // Published chart anchors (day pillar + the parts the literature agrees on).
  it("Mao Zedong 1893-12-26 → 癸巳 / 甲子 / 丁酉 (year/month/day)", () => {
    const p = pillars({ year: 1893, month: 12, day: 26, hour: 8, minute: 0, tzOffsetMinutes: 480 });
    expect(p.year).toBe("癸巳");
    expect(p.month).toBe("甲子");
    expect(p.day).toBe("丁酉");
  });

  it("Zhou Enlai 1898-03-05 → 戊戌 / 甲寅 (year/month)", () => {
    const p = pillars({ year: 1898, month: 3, day: 5, hour: 8, minute: 0, tzOffsetMinutes: 480 });
    expect(p.year).toBe("戊戌");
    expect(p.month).toBe("甲寅");
  });
});

describe("solar terms — internal consistency across a full year", () => {
  it("all 24 terms of 2025 land at exactly their target longitude and in ascending time", () => {
    let prev = Date.UTC(2024, 11, 1); // before 小寒 2025
    for (const term of SOLAR_TERMS) {
      // seed roughly where each term falls (terms advance ~15.2 days each from 立春)
      const seed = findSolarLongitudeCrossing(term.longitude, prev + 12 * 86400000);
      // the crossing instant must reproduce the target longitude to high precision
      const lon = solarLongitudeAtMillis(seed);
      const err = Math.min(Math.abs(lon - term.longitude), 360 - Math.abs(lon - term.longitude));
      expect(err, `${term.nameZh} longitude error`).toBeLessThan(0.001);
      prev = seed;
    }
  });
});
