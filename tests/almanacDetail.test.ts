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
  extractDayStars,
  extractPerHour,
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

  it("returns the day-star (神煞) lists, normalised, for the anchor day", () => {
    // Probed live on lunar-javascript@1.7.7 for 2026-07-25.
    const d = buildAlmanacDayDetail({ year: 2026, month: 7, day: 25 });
    expect(d.jiShen.length).toBeGreaterThan(0);
    expect(d.xiongSha.length).toBeGreaterThan(0);
    expect(d.jiShen).toContain("月空");
    expect(d.jiShen).toContain("金堂");
    expect(d.jiShen).toContain("解神");
    expect(d.xiongSha).toContain("咸池");
    expect(d.xiongSha).toContain("天刑");
    // Normalised: no traditional-variant leakage the adapter is pinned to fix.
    expect([...d.jiShen, ...d.xiongSha].join()).not.toMatch(/諸事不宜|馀/);
  });

  it("returns 12 per-hour rows in 子…亥 order with valid lucks", () => {
    const d = buildAlmanacDayDetail({ year: 2026, month: 7, day: 25 });
    expect(d.perHour).toHaveLength(12);
    // One row per branch, ascending 子(0)…亥(11); the library's trailing
    // late-子 duplicate is dropped in favour of the civil day's early 子.
    expect(d.perHour.map((h) => h.branchIndex)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    for (const h of d.perHour) {
      expect(["吉", "凶"]).toContain(h.tianShenLuck);
      expect(h.ganzhi).toMatch(/^..$/);
      expect(h.tianShen.length).toBeGreaterThan(0);
    }
    // Probed anchors: 子 hour is 丙子/金匮(吉); 辰 hour is 庚辰/天牢(凶), 诸事不宜.
    const zi = d.perHour[0];
    expect(zi.ganzhi).toBe("丙子");
    expect(zi.tianShen).toBe("金匮");
    expect(zi.tianShenLuck).toBe("吉");
    const chen = d.perHour[4];
    expect(chen.ganzhi).toBe("庚辰");
    expect(chen.tianShen).toBe("天牢");
    expect(chen.tianShenLuck).toBe("凶");
    expect(chen.ji).toContain("诸事不宜");
    expect(chen.ji.join()).not.toMatch(/諸事不宜/); // normalised to simplified
  });

  it("is deterministic", () => {
    const a = buildAlmanacDayDetail({ year: 2026, month: 2, day: 17 });
    const b = buildAlmanacDayDetail({ year: 2026, month: 2, day: 17 });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe("probe-guarded extraction (graceful absence)", () => {
  it("yields empty star lists when the APIs are missing", () => {
    expect(extractDayStars({})).toEqual({ jiShen: [], xiongSha: [] });
  });

  it("yields empty star lists when an API throws", () => {
    const throwing = {
      getDayJiShen: () => {
        throw new Error("boom");
      },
      getDayXiongSha: () => ["天刑"],
    };
    expect(extractDayStars(throwing)).toEqual({ jiShen: [], xiongSha: ["天刑"] });
  });

  it("yields no per-hour rows when getTimes is missing, throws, or returns bad entries", () => {
    expect(extractPerHour({})).toEqual([]);
    expect(
      extractPerHour({
        getTimes: () => {
          throw new Error("boom");
        },
      }),
    ).toEqual([]);
    // Entries lacking the probed methods are skipped, not crashed on.
    expect(extractPerHour({ getTimes: () => [{}, null] })).toEqual([]);
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
