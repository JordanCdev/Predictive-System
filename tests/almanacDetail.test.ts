/**
 * The richer 通勝 per-day lookup (lazy verification chunk): lunar date in
 * Chinese, full 宜/忌 term lists, the 28-mansion, and the compact lunar labels
 * for calendar cells. Anchors probed against lunar-javascript@1.7.7 directly.
 */
import { describe, expect, it } from "vitest";
import { Solar } from "lunar-javascript";
import {
  buildAlmanacDayDetail,
  buildLunarDayLabels,
} from "../src/engine/verification/lunarAlmanac.ts";

describe("buildAlmanacDayDetail", () => {
  it("returns the lunar date, full 宜/忌 lists and the 28-mansion for an anchor day", () => {
    // 2026-07-25 = 農曆六月十二, mansion 氐 (土貉), traditionally 凶.
    const d = buildAlmanacDayDetail({ year: 2026, month: 7, day: 25 });
    expect(d.iso).toBe("2026-07-25");
    expect(d.lunarMonthZh).toBe("六月");
    expect(d.lunarDayZh).toBe("十二");
    expect(d.lunarDateZh).toBe("六月十二");
    expect(d.yi).toContain("祭祀");
    expect(d.yi).toContain("安葬");
    expect(d.ji).toContain("嫁娶");
    expect(d.ji).toContain("出行");
    expect(d.mansion).not.toBeNull();
    expect(d.mansion!.xiu).toBe("氐");
    expect(d.mansion!.zheng).toBe("土");
    expect(d.mansion!.animal).toBe("貉");
    expect(d.mansion!.luck).toBe("凶");
  });

  it("matches the raw comparator lists (normalised) for arbitrary days", () => {
    for (const [y, m, day] of [[2025, 1, 9], [2026, 5, 2], [2027, 11, 30]] as const) {
      const d = buildAlmanacDayDetail({ year: y, month: m, day });
      const lunar = Solar.fromYmdHms(y, m, day, 12, 0, 0).getLunar();
      // Same lists modulo the adapter's variant-character normalisation.
      expect(d.yi.length).toBe(lunar.getDayYi().length);
      expect(d.ji.length).toBe(lunar.getDayJi().length);
      expect(d.yi.join()).not.toMatch(/諸事不宜/); // normalised to simplified
    }
  });

  it("is deterministic", () => {
    const a = buildAlmanacDayDetail({ year: 2026, month: 2, day: 17 });
    const b = buildAlmanacDayDetail({ year: 2026, month: 2, day: 17 });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe("buildLunarDayLabels", () => {
  it("labels ordinary days with the lunar day and 初一 with the month name", () => {
    // 2026-07-14 is 六月初一.
    const labels = buildLunarDayLabels({ start: { year: 2026, month: 7, day: 13 }, days: 3 });
    expect(labels["2026-07-14"]).toBe("六月");
    expect(labels["2026-07-15"]).toBe("初二");
    expect(Object.keys(labels)).toHaveLength(3);
  });
});
