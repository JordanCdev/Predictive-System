import { describe, it, expect } from "vitest";
import { gregorianToJDN, lichunMillis, findSolarLongitudeCrossing, monthBranchIndexFromLongitude } from "./astronomy.ts";
import { buildFourPillars, dayGanzhiIndexFromCivilDate } from "./sexagenary.ts";
import { ZIPING_DEFAULT } from "./conventions.ts";
import { ganZhiFromIndex, naYinOf, tenGodOf, STEMS } from "./symbols.ts";

// ≤120 s against published instants (was ±30 min — far looser than both the
// engine's actual accuracy (~25 s) and the documentation's precision claim).
// Sources publish to the minute, so the tolerance absorbs ≤30 s of rounding.
const withinSeconds = (a: number, b: number, tolSec: number) => Math.abs(a - b) / 1000 <= tolSec;
const TERM_TOLERANCE_SECONDS = 120;

describe("Julian Day Number", () => {
  it("2000-01-01 noon civil = JDN 2451545", () => {
    expect(gregorianToJDN(2000, 1, 1)).toBe(2451545);
  });
});

describe("solar-term crossings (astronomical validation, ≤120 s)", () => {
  // Reference instants from published almanac/observatory data (UTC).
  it("2023 Winter Solstice (λ=270°) = 2023-12-22 03:27 UTC", () => {
    const t = findSolarLongitudeCrossing(270, Date.UTC(2023, 11, 22, 0));
    expect(withinSeconds(t, Date.UTC(2023, 11, 22, 3, 27), TERM_TOLERANCE_SECONDS)).toBe(true);
  });
  it("2024 Spring Equinox (λ=0°) = 2024-03-20 03:06:24 UTC", () => {
    const t = findSolarLongitudeCrossing(0, Date.UTC(2024, 2, 20, 0));
    expect(withinSeconds(t, Date.UTC(2024, 2, 20, 3, 6, 24), TERM_TOLERANCE_SECONDS)).toBe(true);
  });
  it("2024 Summer Solstice (λ=90°) = 2024-06-20 20:51 UTC", () => {
    const t = findSolarLongitudeCrossing(90, Date.UTC(2024, 5, 20, 18));
    expect(withinSeconds(t, Date.UTC(2024, 5, 20, 20, 51), TERM_TOLERANCE_SECONDS)).toBe(true);
  });
  it("2024 立春 (λ=315°) = 2024-02-04 08:27:08 UTC", () => {
    const t = lichunMillis(2024);
    expect(withinSeconds(t, Date.UTC(2024, 1, 4, 8, 27, 8), TERM_TOLERANCE_SECONDS)).toBe(true);
  });
  // HKO-published 2026 instants (cross-checked against JPL Horizons — see
  // src/engine/verification/fixtures/ for the full 72-term fixture suite).
  it("2026 立春 (λ=315°) = 2026-02-03 20:02 UTC (HKO)", () => {
    const t = lichunMillis(2026);
    expect(withinSeconds(t, Date.UTC(2026, 1, 3, 20, 2), TERM_TOLERANCE_SECONDS)).toBe(true);
  });
  it("2026 Winter Solstice (λ=270°) = 2026-12-21 20:50 UTC (HKO/JPL)", () => {
    const t = findSolarLongitudeCrossing(270, Date.UTC(2026, 11, 21, 12));
    expect(withinSeconds(t, Date.UTC(2026, 11, 21, 20, 50), TERM_TOLERANCE_SECONDS)).toBe(true);
  });
});

describe("month branch from longitude", () => {
  it("立春 (315°) opens 寅 month (index 2)", () => {
    expect(monthBranchIndexFromLongitude(315)).toBe(2);
    expect(monthBranchIndexFromLongitude(320)).toBe(2);
  });
  it("大雪 (255°) opens 子 month (index 0)", () => {
    expect(monthBranchIndexFromLongitude(256)).toBe(0);
  });
});

describe("day pillar cycle", () => {
  it("anchors Mao Zedong's day pillar 1893-12-26 → 丁酉 (33)", () => {
    expect(dayGanzhiIndexFromCivilDate(1893, 12, 26)).toBe(33);
    expect(ganZhiFromIndex(33).hanzi).toBe("丁酉");
  });
  it("advances by exactly one per civil day", () => {
    expect(dayGanzhiIndexFromCivilDate(1893, 12, 27)).toBe(34); // 戊戌
    expect(dayGanzhiIndexFromCivilDate(1893, 12, 25)).toBe(32); // 丙申
  });
});

describe("full chart — published golden case", () => {
  it("Mao Zedong 1893-12-26 → year 癸巳, month 甲子, day 丁酉", () => {
    const fp = buildFourPillars(
      { year: 1893, month: 12, day: 26, hour: 8, minute: 0, tzOffsetMinutes: 480 },
      ZIPING_DEFAULT,
    );
    expect(fp.year.hanzi).toBe("癸巳");
    expect(fp.month.hanzi).toBe("甲子");
    expect(fp.day.hanzi).toBe("丁酉");
    expect(fp.dayMaster.hanzi).toBe("丁");
  });

  it("Zhou Enlai 1898-03-05 → year 戊戌, month 甲寅 (independent month/year check)", () => {
    const fp = buildFourPillars(
      { year: 1898, month: 3, day: 5, hour: 6, minute: 0, tzOffsetMinutes: 480 },
      ZIPING_DEFAULT,
    );
    expect(fp.year.hanzi).toBe("戊戌");
    expect(fp.month.hanzi).toBe("甲寅");
  });
});

describe("symbol tables", () => {
  it("Na Yin of 甲子 (0) = 海中金 (metal)", () => {
    expect(naYinOf(0).nameZh).toBe("海中金");
    expect(naYinOf(0).phase).toBe("metal");
  });
  it("Na Yin of 壬戌 (58) = 大海水 (water)", () => {
    expect(naYinOf(58).nameZh).toBe("大海水");
  });
  it("Ten God: 甲 day master sees 己 → Direct Wealth (正財)", () => {
    // 甲 wood controls 己 earth, opposite polarity → 正財
    expect(tenGodOf(STEMS[0], STEMS[5])).toBe("direct_wealth");
  });
  it("Ten God: 甲 day master sees 庚 → Seven Killings (七殺)", () => {
    // 庚 metal controls 甲 wood, same polarity → 七殺
    expect(tenGodOf(STEMS[0], STEMS[6])).toBe("seven_killings");
  });
});
