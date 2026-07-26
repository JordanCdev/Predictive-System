import { describe, expect, it } from "vitest";
import { dayHexagram, meihuaCast } from "../src/engine/index.ts";
import {
  CAST_HOUR_BRANCH_INDEX,
  composedNameZh,
  formatWindow,
  windowCivilDays,
} from "../src/ui/HexagramCard.tsx";
import { buildMeihuaLunarDate } from "../src/engine/verification/meihuaLunar.ts";

/**
 * The DISPLAY layer of the hexagram card — the pure helpers only (there is no
 * DOM test harness in this repo). Everything here is presentation: none of it
 * touches a score, and the card is mounted purely as a fact about the day.
 */

describe("composed 卦名 (上卦象 + 下卦象 + 卦名)", () => {
  it("composes the standard four-character name", () => {
    expect(composedNameZh(dayHexagram({ year: 2026, month: 7, day: 25 }).hexagram)).toBe("天澤履");
  });

  it("uses the 「乾為天」 form for the eight doubled trigrams", () => {
    // 2026-06-01 sits in 乾 (index 26 of the rotation, the 辟 hexagram of 小滿).
    const doubled = dayHexagram({ year: 2026, month: 6, day: 1 });
    expect(doubled.hexagram.nameZh).toBe("乾");
    expect(composedNameZh(doubled.hexagram)).toBe("乾為天");
  });
});

describe("the governed window, as civil days", () => {
  it("renders the anchor window as the six days the noon rule assigns", () => {
    const day = dayHexagram({ year: 2026, month: 7, day: 25 });
    const span = windowCivilDays(day.windowStartIso, day.windowEndIso);
    expect(span).not.toBeNull();
    // 履 opens 2026-07-23 00:30 CST and closes 07-29 02:36 CST → 23rd..28th.
    expect(span!.first.toISOString().slice(0, 10)).toBe("2026-07-23");
    expect(span!.last.toISOString().slice(0, 10)).toBe("2026-07-28");
    expect(formatWindow(span!.first, span!.last)).toBe("23–28 July");
  });

  it("the queried date always falls inside the window it renders", () => {
    for (const day of [1, 9, 17, 25]) {
      for (const month of [1, 4, 7, 10]) {
        const r = dayHexagram({ year: 2026, month, day });
        const span = windowCivilDays(r.windowStartIso, r.windowEndIso)!;
        const asked = Date.UTC(2026, month - 1, day);
        expect(asked).toBeGreaterThanOrEqual(span.first.getTime());
        expect(asked).toBeLessThanOrEqual(span.last.getTime());
      }
    }
  });

  it("spells out both months when a window straddles one", () => {
    const first = new Date(Date.UTC(2026, 6, 29));
    const last = new Date(Date.UTC(2026, 7, 3));
    expect(formatWindow(first, last)).toBe("29 July – 3 August");
  });

  it("spells out both years when a window straddles one", () => {
    const first = new Date(Date.UTC(2025, 11, 28));
    const last = new Date(Date.UTC(2026, 0, 2));
    expect(formatWindow(first, last)).toBe("28 December 2025 – 2 January 2026");
  });
});

describe("the secondary 梅花 cast the card renders", () => {
  it("derives the lunisolar date the cast is fed", () => {
    const lunar = buildMeihuaLunarDate({ year: 2026, month: 7, day: 25 });
    expect(lunar).not.toBeNull();
    expect(lunar!.yearGanZhi).toBe("丙午");
    expect(lunar!.yearBranchIndex).toBe(6); // 午
    expect(lunar!.month).toBe(6);
    expect(lunar!.day).toBe(12);
    expect(lunar!.isLeapMonth).toBe(false);
  });

  it("casts at 子時 and marks a moving line", () => {
    const lunar = buildMeihuaLunarDate({ year: 2026, month: 7, day: 25 })!;
    const cast = meihuaCast(lunar, CAST_HOUR_BRANCH_INDEX);
    // 午(7) + 6月 + 12日 = 25 → 25 mod 8 = 1 = 乾 上卦
    // + 子時(1) = 26 → 26 mod 8 = 2 = 兌 下卦 ; 26 mod 6 = 2 = 動爻 2
    expect(composedNameZh(cast.hexagram)).toBe("天澤履");
    expect(cast.movingLine).toBe(2);
    expect(cast.movingLine).toBeGreaterThanOrEqual(1);
    expect(cast.movingLine).toBeLessThanOrEqual(6);
    // The 變卦 must differ from the 本卦 by exactly the moving line.
    const flipped = cast.hexagram.lines.map((v, i) => (i === cast.movingLine - 1 ? !v : v));
    expect(cast.changedHexagram.lines).toEqual(flipped);
  });

  it("is a cast, not the calendar — it disagrees with 卦氣 on most days", () => {
    let agree = 0;
    let total = 0;
    for (let d = 0; d < 60; d++) {
      const t = new Date(Date.UTC(2026, 0, 1) + d * 6 * 86_400_000);
      const civil = { year: t.getUTCFullYear(), month: t.getUTCMonth() + 1, day: t.getUTCDate() };
      const lunar = buildMeihuaLunarDate(civil);
      if (!lunar) continue;
      total++;
      if (meihuaCast(lunar, CAST_HOUR_BRANCH_INDEX).hexagram.kingWen === dayHexagram(civil).hexagram.kingWen) {
        agree++;
      }
    }
    expect(total).toBeGreaterThan(50);
    // If these ever coincided often, presenting them as two different things
    // would be misleading. They don't.
    expect(agree / total).toBeLessThan(0.15);
  });
});

describe("glyph line data (what the drawn bars encode)", () => {
  it("履 is yang-yang-yin under yang-yang-yang, bottom to top", () => {
    const h = dayHexagram({ year: 2026, month: 7, day: 25 }).hexagram;
    expect(h.lines).toEqual([true, true, false, true, true, true]);
    expect(h.lines.length).toBe(6);
  });
});
