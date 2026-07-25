/**
 * 黃道黑道 hour gods (時辰吉凶) — doctrine + third-party cross-check.
 *
 * The engine seeds the 12-god hour cycle from the DAY branch via the classical
 * mnemonic 「子午青龍起於申…」 (seed = day-branch × 2 + 8, mod 12). This file
 * pins that seed table verbatim, then cross-checks the full mapping against
 * lunar-javascript's independently implemented per-hour 天神 across a spread
 * of days. Tests may import lunar-javascript directly (they are not the app
 * bundle; the app keeps the library inside the lazy verification chunk).
 */
import { describe, expect, it } from "vitest";
import { Solar } from "lunar-javascript";
import { BRANCHES, clashBranch, ganZhiFromIndex } from "../src/engine/symbols.ts";
import { classicalHoursOfDay, hourGodOf } from "../src/engine/tongshu.ts";

const BR_HZ = BRANCHES.map((b) => b.hanzi);

// Our god names are traditional; lunar-javascript emits simplified.
const GOD_T2S: Record<string, string> = {
  青龍: "青龙", 明堂: "明堂", 天刑: "天刑", 朱雀: "朱雀", 金匱: "金匮", 天德: "天德",
  白虎: "白虎", 玉堂: "玉堂", 天牢: "天牢", 玄武: "玄武", 司命: "司命", 勾陳: "勾陈",
};

describe("hour gods — classical seed table (子午青龍起於申…)", () => {
  // day-branch pair → the hour branch that carries 青龍.
  const SEED: [number[], number][] = [
    [[0, 6], 8], // 子/午 → 申
    [[3, 9], 2], // 卯/酉 → 寅
    [[2, 8], 0], // 寅/申 → 子
    [[5, 11], 6], // 巳/亥 → 午
    [[4, 10], 4], // 辰/戌 → 辰
    [[1, 7], 10], // 丑/未 → 戌
  ];

  it("places 青龍 on the mnemonic's hour branch for every day branch", () => {
    for (const [dayBranches, qinglongHour] of SEED) {
      for (const db of dayBranches) {
        const god = hourGodOf(db, qinglongHour);
        expect(god.nameZh, `day ${BR_HZ[db]} hour ${BR_HZ[qinglongHour]}`).toBe("青龍");
        expect(god.index).toBe(0);
        expect(god.yellow).toBe(true);
      }
    }
  });

  it("cycles the 12 gods in order from the seed", () => {
    // 子 day: 青龍 at 申(8) → 明堂 at 酉(9) → … → 勾陳 at 未(7).
    expect(hourGodOf(0, 9).nameZh).toBe("明堂");
    expect(hourGodOf(0, 7).nameZh).toBe("勾陳");
  });
});

describe("classicalHoursOfDay — impersonal Tong Shu hour read", () => {
  const jiaZi = ganZhiFromIndex(0); // 甲子 day

  it("derives hour stems by the five-rats rule and covers all 12 branches", () => {
    const hours = classicalHoursOfDay(jiaZi);
    expect(hours).toHaveLength(12);
    expect(new Set(hours.map((h) => h.branchIndex)).size).toBe(12);
    const zi = hours.find((h) => h.branchIndex === 0)!;
    expect(zi.ganzhi.hanzi).toBe("甲子"); // 甲 day → 甲子 hour (甲己還加甲)
    const chou = hours.find((h) => h.branchIndex === 1)!;
    expect(chou.ganzhi.hanzi).toBe("乙丑");
  });

  it("caps the 日破 hour below every favourable band, whatever its hour god", () => {
    // The doctrine the code cites (時沖日大凶) makes the clash override the hour
    // god — so the invariant is the BAND, not an exact arithmetic delta: on
    // every one of the 12 possible day branches, the clash hour must sit in
    // caution-or-worse (<45) and below every non-clash Yellow-road hour.
    for (let dayIdx = 0; dayIdx < 12; dayIdx++) {
      const hours = classicalHoursOfDay(ganZhiFromIndex(dayIdx * 5)); // cycles all 12 branches
      const dayBranch = ganZhiFromIndex(dayIdx * 5).branch.index;
      const po = hours.find((h) => h.branchIndex === clashBranch(dayBranch))!;
      expect(po.clashesDay).toBe(true);
      expect(po.reasons.join(" ")).toMatch(/日破/);
      expect(po.score).toBeLessThan(45); // never "Neutral"/"Good"/"Excellent"
      const bestYellowNonClash = Math.max(...hours.filter((h) => !h.clashesDay && h.god.yellow).map((h) => h.score));
      expect(po.score).toBeLessThan(bestYellowNonClash);
    }
  });

  it("scores Yellow-road hours above Black-road hours", () => {
    const hours = classicalHoursOfDay(jiaZi).filter((h) => !h.clashesDay);
    const worstYellow = Math.min(...hours.filter((h) => h.god.yellow).map((h) => h.score));
    const bestBlack = Math.max(...hours.filter((h) => !h.god.yellow).map((h) => h.score));
    expect(worstYellow).toBeGreaterThan(bestBlack);
  });

  it("is display-ordered by clock start (丑 01:00 first, 子 23:00 last)", () => {
    const hours = classicalHoursOfDay(jiaZi);
    expect(hours[0].branchIndex).toBe(1);
    expect(hours[11].branchIndex).toBe(0);
  });
});

describe("hour gods — lunar-javascript cross-check", () => {
  it("matches the comparator's per-hour 天神 (name and 黄道/黑道) across a spread of days", () => {
    // 36 dates spanning 2024–2027 (step 37 days cycles day branches & months);
    // hours probed at HH:30 for 01:00–22:59. The 23:00–23:59 half of the 子
    // hour is excluded: the comparator reads it against the NEXT day (晚子時),
    // a documented school split (see the 子-hour note in classicalHoursOfDay).
    for (let i = 0; i < 36; i++) {
      const d = new Date(Date.UTC(2024, 0, 3 + i * 37, 12));
      const y = d.getUTCFullYear();
      const mo = d.getUTCMonth() + 1;
      const dd = d.getUTCDate();
      for (let h = 0; h < 23; h += 2) {
        const lunar = Solar.fromYmdHms(y, mo, dd, h, 30, 0).getLunar();
        const dayBranch = BR_HZ.indexOf(lunar.getDayInGanZhi()[1]);
        const hourBranch = (lunar as unknown as { getTimeZhiIndex(): number }).getTimeZhiIndex();
        const rich = lunar as unknown as { getTimeTianShen(): string; getTimeTianShenType(): string };
        const god = hourGodOf(dayBranch, hourBranch);
        const label = `${y}-${mo}-${dd} ${h}:30 (day ${BR_HZ[dayBranch]}, hour ${BR_HZ[hourBranch]})`;
        expect(GOD_T2S[god.nameZh], label).toBe(rich.getTimeTianShen());
        expect(god.yellow, label).toBe(rich.getTimeTianShenType() === "黄道");
      }
    }
  });

  it("documents the 23:00 school split: the comparator seeds late-子 from the next day", () => {
    // 2026-03-10 is a 未 day (癸未); our civil-day read of its 子 hour seeds from
    // 未. The comparator at 23:30 rolls to the next day's 申 seed → 青龙.
    const lateZi = Solar.fromYmdHms(2026, 3, 10, 23, 30, 0).getLunar() as unknown as {
      getTimeTianShen(): string;
    };
    expect(lateZi.getTimeTianShen()).toBe(GOD_T2S[hourGodOf(8, 0).nameZh]); // seeded from 申 (next day)
    // The EARLY half (00:30 the same civil day) agrees with our civil-day seed.
    const earlyZi = Solar.fromYmdHms(2026, 3, 10, 0, 30, 0).getLunar() as unknown as {
      getTimeTianShen(): string;
    };
    const ourZi = hourGodOf(BR_HZ.indexOf("未"), 0);
    expect(earlyZi.getTimeTianShen()).toBe(GOD_T2S[ourZi.nameZh]);
  });
});
