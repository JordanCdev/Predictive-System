/**
 * 烏兔 (天元烏兔經 / 烏兔太陽擇日法) — the three independent anchors, plus the
 * derivation-vs-published-table agreement.
 *
 * The three anchors are deliberately of different kinds, so that no single
 * mistake could satisfy all three:
 *
 *   1. A date whose value is known from an independent almanac
 *      (2026-07-25 → 太陽). One in nine by chance.
 *   2. The classical text's OWN worked example (壬寅年五月, 朔 = 癸未 → 太陽 on
 *      丁亥 丙申 乙巳 = 初五 十四 廿三), which the almanac had no part in.
 *   3. The published 太陽值日 lookup table: the two rows attested with exact
 *      set equality, the 9-group partition, and — the real regression guard —
 *      all sixty rows regenerated from the derivation.
 *
 * The lunisolar inputs (which day is 初一, and its pillar) are cross-checked
 * against lunar-javascript here rather than assumed. Tests may import that
 * library directly; the app bundle may not, which is why the engine module
 * takes the lunar numbers as parameters.
 */
import { describe, expect, it } from "vitest";
import { Solar } from "lunar-javascript";
import { BRANCHES, ganZhiFromIndex, mod } from "../src/engine/symbols.ts";
import { dayGanzhiIndexFromCivilDate } from "../src/engine/sexagenary.ts";
import {
  MAO_PILLARS,
  MOON_PALACE,
  SUN_PALACE,
  WU_TU_ALTERNATE_LINEAGE,
  WU_TU_BRANCH_PALACE_CAVEAT,
  WU_TU_PUBLISHED_TABLE,
  WU_TU_STARS,
  WU_TU_YANG_STEM_HANZI,
  shuoIndexFromDay,
  wuTuDayStar,
  wuTuMonth,
  wuTuStarOfPalace,
} from "../src/engine/wuTu.ts";
import { buildMeihuaLunarDate } from "../src/engine/verification/meihuaLunar.ts";
import { displayableDays, lunarDayZh } from "../src/ui/WuTuCard.tsx";

/** Sexagenary index of a pillar written in hanzi, e.g. "己丑" → 25. */
function indexOfPillar(hanzi: string): number {
  for (let i = 0; i < 60; i += 1) {
    if (ganZhiFromIndex(i).hanzi === hanzi) return i;
  }
  throw new Error(`not a sexagenary pillar: ${hanzi}`);
}

/** What lunar-javascript says about a civil date, read at noon CST like the
 *  rest of the app's lunisolar reads. Negative month = 閏月. */
function lunarOf(y: number, m: number, d: number) {
  const l = Solar.fromYmdHms(y, m, d, 12, 0, 0).getLunar() as unknown as {
    getMonth(): number;
    getDay(): number;
    getDayInGanZhi(): string;
  };
  return { month: l.getMonth(), day: l.getDay(), dayGanZhi: l.getDayInGanZhi() };
}

describe("烏兔 — the nine-star table itself", () => {
  it("is the 九星譜 in palace order, with 太陽 in 艮8 and 太陰 in 坤2", () => {
    expect(WU_TU_STARS.map((s) => s.nameZh)).toEqual([
      "水星", "太陰", "木星", "計都", "土星", "羅睺", "金星", "太陽", "火星",
    ]);
    expect(WU_TU_STARS.map((s) => s.palaceZh)).toEqual([
      "坎", "坤", "震", "巽", "中", "乾", "兌", "艮", "離",
    ]);
    expect(wuTuStarOfPalace(SUN_PALACE).nameZh).toBe("太陽");
    expect(wuTuStarOfPalace(MOON_PALACE).nameZh).toBe("太陰");
  });

  it("marks 太陽 太陰 金星 木星 水星 吉 and 土星 火星 羅睺 計都 凶", () => {
    const auspicious = WU_TU_STARS.filter((s) => s.auspicious).map((s) => s.nameZh).sort();
    expect(auspicious).toEqual(["太陰", "太陽", "木星", "水星", "金星"].sort());
    const inauspicious = WU_TU_STARS.filter((s) => !s.auspicious).map((s) => s.nameZh).sort();
    expect(inauspicious).toEqual(["土星", "火星", "羅睺", "計都"].sort());
    // 太陽 first, 太陰 second — the ranking the method is named after.
    expect(WU_TU_STARS.find((s) => s.rank === 1)?.nameZh).toBe("太陽");
    expect(WU_TU_STARS.find((s) => s.rank === 2)?.nameZh).toBe("太陰");
  });

  it("uses the method's own 陽 stem set 甲己丁壬戊癸, not the ordinary one", () => {
    expect([...WU_TU_YANG_STEM_HANZI].sort()).toEqual(["甲", "丁", "戊", "己", "壬", "癸"].sort());
    // The ordinary 陽干 set would be 甲丙戊庚壬 — a classic "helpful fix" that
    // would silently break every row of the published table.
    expect(WU_TU_YANG_STEM_HANZI).not.toContain("丙");
    expect(WU_TU_YANG_STEM_HANZI).not.toContain("庚");
  });

  it("has five 卯 pillars despite the texts' 「六卯」", () => {
    expect(MAO_PILLARS).toEqual(["乙卯", "丁卯", "己卯", "辛卯", "癸卯"]);
  });
});

describe("ANCHOR 1 — 2026-07-25 is a 太陽日", () => {
  // 丙午年六月十二. The lunar month's 初一 is 2026-07-14 = 己丑.
  const SHUO_CIVIL = { y: 2026, m: 7, d: 14 };
  const DATE_CIVIL = { y: 2026, m: 7, d: 25 };

  it("agrees with the lunisolar calendar about which day is 初一 and its pillar", () => {
    const shuo = lunarOf(SHUO_CIVIL.y, SHUO_CIVIL.m, SHUO_CIVIL.d);
    expect(shuo).toMatchObject({ month: 6, day: 1, dayGanZhi: "己丑" });
    const target = lunarOf(DATE_CIVIL.y, DATE_CIVIL.m, DATE_CIVIL.d);
    expect(target).toMatchObject({ month: 6, day: 12, dayGanZhi: "庚子" });

    // …and the app's own day-pillar engine says the same, so the ganzhi index
    // fed to wuTuDayStar is the one the rest of the app would compute.
    expect(ganZhiFromIndex(dayGanzhiIndexFromCivilDate(2026, 7, 14)).hanzi).toBe("己丑");
  });

  it("returns 太陽 (艮8) — a 1-in-9 coincidence if the identification were wrong", () => {
    const shuoIndex = dayGanzhiIndexFromCivilDate(2026, 7, 14);
    const star = wuTuDayStar(shuoIndex, 12);
    expect(star.nameZh).toBe("太陽");
    expect(star.nameEn).toBe("Sun");
    expect(star.id).toBe("sun");
    expect(star.palace).toBe(8);
    expect(star.palaceZh).toBe("艮");
    expect(star.auspicious).toBe(true);
    expect(star.isSunDay).toBe(true);
  });

  it("recovers the 朔日 pillar from the day's own pillar and its lunar day number", () => {
    // 2026-07-25 is 庚子, the 12th day; 11 days back is 己丑 = 2026-07-14's pillar.
    const dayIndex = dayGanzhiIndexFromCivilDate(2026, 7, 25);
    expect(ganZhiFromIndex(dayIndex).hanzi).toBe("庚子");
    const shuoIndex = shuoIndexFromDay(dayIndex, 12);
    expect(shuoIndex).toBe(dayGanzhiIndexFromCivilDate(2026, 7, 14));
    expect(ganZhiFromIndex(shuoIndex).hanzi).toBe("己丑");
    expect(wuTuDayStar(shuoIndex, 12).nameZh).toBe("太陽");
    // …and it agrees with the calendar for every day of that lunar month.
    for (let d = 1; d <= 30; d += 1) {
      const civil = new Date(Date.UTC(2026, 6, 13 + d)); // 初一 = 2026-07-14
      const idx = dayGanzhiIndexFromCivilDate(
        civil.getUTCFullYear(),
        civil.getUTCMonth() + 1,
        civil.getUTCDate(),
      );
      expect(shuoIndexFromDay(idx, d), `day ${d}`).toBe(shuoIndex);
    }
    expect(() => shuoIndexFromDay(0, 0)).toThrow(RangeError);
  });

  it("derives it the way the 口訣 does: 己卯 anchor → 戌 → 乾6 → fly 順 to 艮8", () => {
    const month = wuTuMonth(indexOfPillar("己丑"));
    expect(month.anchorMao.hanzi).toBe("己卯"); // 朔前第一卯日
    expect(month.anchorDaysBefore).toBe(10);
    // …and that anchor really is 2026-07-04, ten days before 初一.
    expect(ganZhiFromIndex(dayGanzhiIndexFromCivilDate(2026, 7, 4)).hanzi).toBe("己卯");
    expect(month.countDirection).toBe(1); // 己 is 陽 in this method → 順
    expect(month.firstDayBranchIndex).toBe(10); // 戌
    expect(month.firstDayPalace).toBe(6); // 乾6
    expect(month.flightDirection).toBe(1); // 初一's own stem 己 → 順
    expect(month.palaces[11]).toBe(8); // 十二 → 艮8
  });

  it("puts that month's 太陽日 on 初三 十二 廿一 三十 and 太陰日 on 初六 十五 廿四", () => {
    const month = wuTuMonth(indexOfPillar("己丑"));
    expect(month.sunDays).toEqual([3, 12, 21, 30]);
    expect(month.moonDays).toEqual([6, 15, 24]);
  });

  it("drops 三十 in a 29-day month, because there is no such day", () => {
    const big = wuTuMonth(indexOfPillar("己丑"), 30);
    const small = wuTuMonth(indexOfPillar("己丑"), 29);
    expect(big.sunDays).toEqual([3, 12, 21, 30]);
    expect(small.sunDays).toEqual([3, 12, 21]);
    // The derivation is unchanged; only the output is truncated.
    expect(small.palaces).toEqual(big.palaces.slice(0, 29));
  });
});

describe("ANCHOR 2 — the classical text's own worked example (壬寅年五月)", () => {
  // 「壬寅年五月朔日初一為癸未，歸屬朔前第一己卯日管，把己卯加子，順排，
  //   癸未落在辰宮/巽」 — and the text names the month's 太陽日 as 丁亥, 丙申, 乙巳.
  const month = wuTuMonth(indexOfPillar("癸未"));

  it("finds 己卯 four days before 初一 and lands 初一 in 辰宮/巽4", () => {
    expect(month.anchorMao.hanzi).toBe("己卯");
    expect(month.anchorDaysBefore).toBe(4);
    expect(month.countDirection).toBe(1);
    expect(month.firstDayBranchIndex).toBe(4); // 辰
    expect(month.firstDayPalace).toBe(4); // 巽4
  });

  it("names 初五 十四 廿三 as the 太陽日 — i.e. 丁亥 丙申 乙巳, exactly the text's three", () => {
    expect(month.sunDays).toEqual([5, 14, 23]);
    const pillars = month.sunDays.map((d) => ganZhiFromIndex(indexOfPillar("癸未") + d - 1).hanzi);
    expect(pillars).toEqual(["丁亥", "丙申", "乙巳"]);
  });
});

describe("ANCHOR 3 — the published 太陽值日 lookup table", () => {
  it("reproduces the 12-member group → 太陽 on 初五 十四 廿三 with exact set equality", () => {
    const printed = [
      "庚子", "丙午", "庚午", "丁未", "癸未", "甲申",
      "壬申", "戊申", "壬戌", "戊戌", "己亥", "癸亥",
    ];
    const derived = Array.from({ length: 60 }, (_, i) => i)
      .filter((i) => {
        const s = wuTuMonth(i).sunDays;
        return s.length === 3 && s[0] === 5 && s[1] === 14 && s[2] === 23;
      })
      .map((i) => ganZhiFromIndex(i).hanzi);
    expect(new Set(derived)).toEqual(new Set(printed));
    expect(derived).toHaveLength(12);
  });

  it("reproduces the 10-member group → 太陽 on 初一 初十 十九 廿八 with exact set equality", () => {
    const printed = [
      "乙丑", "辛丑", "壬寅", "丙寅", "甲辰", "戊辰", "庚辰", "乙巳", "己巳", "辛巳",
    ];
    const derived = Array.from({ length: 60 }, (_, i) => i)
      .filter((i) => wuTuMonth(i).sunDays.join(",") === "1,10,19,28")
      .map((i) => ganZhiFromIndex(i).hanzi);
    expect(new Set(derived)).toEqual(new Set(printed));
    expect(derived).toHaveLength(10);
  });

  it("partitions the 60 朔 pillars into exactly 9 太陽日 groups, as the source's 「9组」", () => {
    const groups = new Set(
      Array.from({ length: 60 }, (_, i) => wuTuMonth(i).sunDays.join(",")),
    );
    expect(groups.size).toBe(9);
  });

  it("regenerates all sixty printed rows from the derivation — table and rule agree", () => {
    expect(WU_TU_PUBLISHED_TABLE).toHaveLength(60);
    for (let i = 0; i < 60; i += 1) {
      const row = WU_TU_PUBLISHED_TABLE[i];
      const pillar = ganZhiFromIndex(i).hanzi;
      // The table is stored in sexagenary order, so row i must be pillar i.
      expect(row.shuo, `row ${i}`).toBe(pillar);
      const month = wuTuMonth(i);
      expect(month.sunDays, `太陽日 for 朔 ${pillar}`).toEqual([...row.sunDays]);
      expect(month.moonDays, `太陰日 for 朔 ${pillar}`).toEqual([...row.moonDays]);
    }
  });

  it("keeps 太陽 and 太陰 nine days apart within a month, as a 1-palace-per-day flight must", () => {
    for (let i = 0; i < 60; i += 1) {
      const { sunDays, moonDays } = wuTuMonth(i);
      for (const days of [sunDays, moonDays]) {
        expect(days.length).toBeGreaterThanOrEqual(3);
        for (let k = 1; k < days.length; k += 1) {
          expect(days[k] - days[k - 1]).toBe(9);
        }
      }
    }
  });
});

describe("烏兔 — leap months", () => {
  // 乙巳年 has a 閏六月. The ordinary 六月 begins 2025-06-25 (乙丑) and the leap
  // 六月 begins 2025-07-25 (乙未). A leap month has its OWN 朔日, so it gets its
  // own flight — it does not inherit the month it follows.
  it("treats 閏六月 as a month in its own right, keyed on its own 朔日", () => {
    const ordinary = lunarOf(2025, 6, 25);
    const leap = lunarOf(2025, 7, 25);
    expect(ordinary).toMatchObject({ month: 6, day: 1, dayGanZhi: "乙丑" });
    expect(leap).toMatchObject({ month: -6, day: 1, dayGanZhi: "乙未" }); // negative = 閏

    const ordinaryMonth = wuTuMonth(dayGanzhiIndexFromCivilDate(2025, 6, 25));
    const leapMonth = wuTuMonth(dayGanzhiIndexFromCivilDate(2025, 7, 25));
    expect(ordinaryMonth.sunDays).toEqual([1, 10, 19, 28]);
    expect(leapMonth.sunDays).toEqual([4, 13, 22]);
    expect(leapMonth.sunDays).not.toEqual(ordinaryMonth.sunDays);
  });

  it("cannot mis-handle a leap month, because it never sees a month number", () => {
    // Same 朔 pillar and same day number ⇒ same star, whether the month is 閏 or
    // not. The distinction lives entirely in which 朔日 the caller passes.
    for (let d = 1; d <= 30; d += 1) {
      expect(wuTuDayStar(indexOfPillar("乙未"), d)).toEqual(wuTuDayStar(indexOfPillar("乙未"), d));
    }
    const eighthOfLeapSix = wuTuDayStar(dayGanzhiIndexFromCivilDate(2025, 7, 25), 8);
    expect(eighthOfLeapSix.nameZh).toBe(wuTuStarOfPalace(eighthOfLeapSix.palace).nameZh);
  });
});

describe("烏兔 — determinism and bounds", () => {
  it("is a pure function of (朔 pillar, lunar day) and repeats exactly", () => {
    for (let i = 0; i < 60; i += 1) {
      for (let d = 1; d <= 30; d += 1) {
        expect(wuTuDayStar(i, d)).toEqual(wuTuDayStar(i, d));
      }
    }
  });

  it("wraps the 朔 index modulo 60, like ganZhiFromIndex", () => {
    expect(wuTuDayStar(25, 12)).toEqual(wuTuDayStar(25 + 60, 12));
    expect(wuTuDayStar(25, 12)).toEqual(wuTuDayStar(25 - 60, 12));
    expect(mod(-35, 60)).toBe(25);
  });

  it("rejects impossible lunar days rather than inventing a star", () => {
    expect(() => wuTuDayStar(25, 0)).toThrow(RangeError);
    expect(() => wuTuDayStar(25, 31)).toThrow(RangeError);
    expect(() => wuTuDayStar(25, 12.5)).toThrow(RangeError);
    expect(() => wuTuMonth(25, 28)).toThrow(RangeError);
    expect(() => wuTuMonth(2.5)).toThrow(RangeError);
    expect(() => wuTuStarOfPalace(10)).toThrow(RangeError);
  });

  it("assigns every one of the 30 days a star in 1..9", () => {
    for (let i = 0; i < 60; i += 1) {
      const { palaces } = wuTuMonth(i);
      expect(palaces).toHaveLength(30);
      for (const p of palaces) expect(p).toBeGreaterThanOrEqual(1);
      for (const p of palaces) expect(p).toBeLessThanOrEqual(9);
    }
  });
});

describe("烏兔 — the card's day numerals (display layer, pure helper only)", () => {
  it("writes lunar days the way an almanac does — 初一, 十二, 廿一, 三十", () => {
    expect([1, 10, 11, 12, 19, 20, 21, 29, 30].map(lunarDayZh)).toEqual([
      "初一", "初十", "十一", "十二", "十九", "二十", "廿一", "廿九", "三十",
    ]);
  });

  it("labels the 2026-07-25 month's 太陽日 as 初三、十二、廿一、三十", () => {
    const shuoIndex = shuoIndexFromDay(dayGanzhiIndexFromCivilDate(2026, 7, 25), 12);
    expect(wuTuMonth(shuoIndex).sunDays.map(lunarDayZh)).toEqual(["初三", "十二", "廿一", "三十"]);
  });
});

describe("烏兔 — the card never prints a day its month does not contain", () => {
  /**
   * The regression this suite exists for: `wuTuMonth`'s `daysInMonth` defaults
   * to 30, so a caller that omits it prints 三十 in a 29-day month — a date that
   * does not exist. The card used to omit it. This reproduces the card's whole
   * derivation chain, starting from the same lunisolar supplier it uses, so the
   * bug cannot come back through either end.
   */
  function cardDays(civil: { year: number; month: number; day: number }) {
    const lunar = buildMeihuaLunarDate(civil);
    if (!lunar) throw new Error(`no lunar date for ${JSON.stringify(civil)}`);
    const dayIndex = dayGanzhiIndexFromCivilDate(civil.year, civil.month, civil.day);
    const shuoIndex = shuoIndexFromDay(dayIndex, lunar.day);
    const month = wuTuMonth(shuoIndex, lunar.daysInMonth ?? 30);
    return {
      lunar,
      sunDays: displayableDays(month.sunDays, lunar.daysInMonth).map(lunarDayZh),
      moonDays: displayableDays(month.moonDays, lunar.daysInMonth).map(lunarDayZh),
    };
  }

  it("supplies the lunar month's real length, 29 or 30, from the lunisolar calendar", () => {
    // 大月 and 小月, checked against the calendar rather than assumed.
    expect(buildMeihuaLunarDate({ year: 2026, month: 7, day: 25 })?.daysInMonth).toBe(30);
    expect(buildMeihuaLunarDate({ year: 2026, month: 1, day: 19 })?.daysInMonth).toBe(29);
    // A 閏月 has its own length, addressed by its own (negative) month number:
    // 乙巳年閏六月 is a 小月 while the ordinary 六月 before it is a 大月.
    expect(buildMeihuaLunarDate({ year: 2025, month: 6, day: 25 })?.daysInMonth).toBe(30);
    const leap = buildMeihuaLunarDate({ year: 2025, month: 7, day: 25 });
    expect(leap?.isLeapMonth).toBe(true);
    expect(leap?.daysInMonth).toBe(29);
  });

  // The three 2026 months the review probed. Each derives 太陽日 3/12/21/30, and
  // each is a 29-day month — so each printed a phantom 三十 before the fix.
  const PHANTOM_三十 = [
    { label: "乙巳年十二月 (初一 2026-01-19)", civil: { year: 2026, month: 1, day: 19 } },
    { label: "丙午年二月 (初一 2026-03-19)", civil: { year: 2026, month: 3, day: 19 } },
    { label: "丙午年四月 (初一 2026-05-17)", civil: { year: 2026, month: 5, day: 17 } },
  ];

  for (const { label, civil } of PHANTOM_三十) {
    it(`drops 三十 in ${label} — a 29-day month`, () => {
      const { lunar, sunDays } = cardDays(civil);
      expect(lunar.day).toBe(1);
      expect(lunar.daysInMonth).toBe(29);
      // The underivable part: the flight really does land 太陽 on day 30.
      const shuoIndex = shuoIndexFromDay(
        dayGanzhiIndexFromCivilDate(civil.year, civil.month, civil.day),
        1,
      );
      expect(wuTuMonth(shuoIndex, 30).sunDays).toEqual([3, 12, 21, 30]);
      // …and the card must not print it.
      expect(sunDays).toEqual(["初三", "十二", "廿一"]);
      expect(sunDays).not.toContain("三十");
    });
  }

  it("still prints 三十 when the month really has one (丙午年六月, 30 days)", () => {
    const { lunar, sunDays } = cardDays({ year: 2026, month: 7, day: 25 });
    expect(lunar.daysInMonth).toBe(30);
    expect(sunDays).toEqual(["初三", "十二", "廿一", "三十"]);
  });

  it("truncates 太陰日 too — 甲辰年六月 (初一 2024-07-06) is a 29-day month", () => {
    const { lunar, moonDays } = cardDays({ year: 2024, month: 7, day: 6 });
    expect(lunar.daysInMonth).toBe(29);
    const shuoIndex = shuoIndexFromDay(dayGanzhiIndexFromCivilDate(2024, 7, 6), 1);
    expect(ganZhiFromIndex(shuoIndex).hanzi).toBe("辛未");
    expect(wuTuMonth(shuoIndex, 30).moonDays).toEqual([3, 12, 21, 30]);
    expect(moonDays).toEqual(["初三", "十二", "廿一"]);
  });

  it("never lists a day beyond the month's length, across every lunar month of 2024–2030", () => {
    for (let offset = 0; offset < 366 * 7; offset += 1) {
      const d = new Date(Date.UTC(2024, 0, 1 + offset));
      const civil = {
        year: d.getUTCFullYear(),
        month: d.getUTCMonth() + 1,
        day: d.getUTCDate(),
      };
      const { lunar, sunDays, moonDays } = cardDays(civil);
      const length = lunar.daysInMonth ?? 29;
      // Every printed day is a day that month contains…
      for (const label of [...sunDays, ...moonDays]) {
        const day = [...Array(30).keys()].map((i) => i + 1).find((n) => lunarDayZh(n) === label);
        expect(day, `${civil.year}-${civil.month}-${civil.day} → ${label}`).toBeDefined();
        expect(day!, `${civil.year}-${civil.month}-${civil.day} → ${label}`).toBeLessThanOrEqual(
          length,
        );
      }
      // …and today itself is one, which is what makes the length trustworthy.
      expect(lunar.day).toBeLessThanOrEqual(length);
    }
  });

  it("assumes nothing when the month's length is unknown: no 三十, everything else kept", () => {
    expect(displayableDays([3, 12, 21, 30], undefined)).toEqual([3, 12, 21]);
    expect(displayableDays([3, 12, 21, 30], 30)).toEqual([3, 12, 21, 30]);
    expect(displayableDays([3, 12, 21], 29)).toEqual([3, 12, 21]);
    // Omitting a real 三十 understates the almanac; printing one in a 小月 would
    // state a day that does not exist. The safe direction is the quiet one.
    expect(displayableDays([1, 10, 19, 28], undefined)).toEqual([1, 10, 19, 28]);
  });
});

describe("烏兔 — the unverified branch→palace assignments are disclosed as data", () => {
  it("splits the twelve branches into attested and merely-entailed, covering each once", () => {
    const all = [
      ...WU_TU_BRANCH_PALACE_CAVEAT.attested,
      ...WU_TU_BRANCH_PALACE_CAVEAT.entailed,
    ].flatMap((g) => g.branchesZh);
    expect(new Set(all).size).toBe(12);
    expect([...all].sort()).toEqual([...BRANCHES.map((b) => b.hanzi)].sort());
  });

  it("names the four palaces no worked example pins, and says they are unverified", () => {
    expect(WU_TU_BRANCH_PALACE_CAVEAT.entailed).toHaveLength(4);
    expect(WU_TU_BRANCH_PALACE_CAVEAT.entailed.flatMap((g) => g.branchesZh)).toEqual([
      "子", "午", "未", "申", "酉",
    ]);
    expect(WU_TU_BRANCH_PALACE_CAVEAT.entailed.map((g) => g.palace)).toEqual([1, 9, 2, 7]);
    expect(WU_TU_BRANCH_PALACE_CAVEAT.entailedVerifiedAgainstPrimarySource).toBe(false);
  });

  it("matches the map the engine actually flies — the caveat cannot drift from the code", () => {
    // Every claim in the caveat is checked against a real derivation: a month
    // whose 初一 lands on that branch must land in that palace.
    for (const group of [
      ...WU_TU_BRANCH_PALACE_CAVEAT.attested,
      ...WU_TU_BRANCH_PALACE_CAVEAT.entailed,
    ]) {
      for (const branchZh of group.branchesZh) {
        const branchIndex = BRANCHES.findIndex((b) => b.hanzi === branchZh);
        const found = Array.from({ length: 60 }, (_, i) => wuTuMonth(i)).filter(
          (m) => m.firstDayBranchIndex === branchIndex,
        );
        expect(found.length, `no month puts 初一 on ${branchZh}`).toBeGreaterThan(0);
        for (const m of found) {
          expect(m.firstDayPalace, `${branchZh} → palace`).toBe(group.palace);
          expect(wuTuStarOfPalace(m.firstDayPalace).palaceZh).toBe(group.palaceZh);
        }
      }
    }
  });
});

describe("烏兔 — the lineage fork is carried in the data, not just the prose", () => {
  it("names the 節氣-anchored lineage and states that it disagrees", () => {
    expect(WU_TU_ALTERNATE_LINEAGE.shippedNameZh).toBe("月朔起例");
    expect(WU_TU_ALTERNATE_LINEAGE.alternateNameZh).toBe("節氣起例");
    expect(WU_TU_ALTERNATE_LINEAGE.disagrees).toBe(true);
    expect(WU_TU_ALTERNATE_LINEAGE.alternateMnemonic).toContain("冬至坎宮起甲子");
  });
});
