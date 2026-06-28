import { describe, it, expect } from "vitest";
import { buildFourPillars } from "./sexagenary.ts";
import { ZIPING_DEFAULT } from "./conventions.ts";
import { buildBaziChart, detectInteractions, seasonalStateOf } from "./bazi.ts";

describe("BaZi doctrine — 旺相休囚死, 通根, branch interactions", () => {
  it("seasonalStateOf follows 旺相休囚死", () => {
    expect(seasonalStateOf("wood", "wood")).toBe("prosperous"); // 旺 (spring)
    expect(seasonalStateOf("wood", "water")).toBe("strong"); // 相 (winter feeds wood)
    expect(seasonalStateOf("wood", "fire")).toBe("resting"); // 休 (summer, wood feeds fire)
    expect(seasonalStateOf("wood", "earth")).toBe("trapped"); // 囚 (wood fights earth)
    expect(seasonalStateOf("wood", "metal")).toBe("dead"); // 死 (autumn metal cuts wood)
  });

  it("detects a full 三合 frame and a 六沖 clash among natal branches", () => {
    const fire = detectInteractions([2, 6, 10, 0]); // 寅午戌 + 子
    expect(fire.some((i) => i.type === "three_harmony" && i.element === "fire" && i.complete)).toBe(true);
    expect(fire.some((i) => i.type === "clash")).toBe(true); // 子午 clash

    const half = detectInteractions([6, 10, 1, 3]); // 午戌 (half fire, includes cardinal 午)
    expect(half.some((i) => i.type === "three_harmony_half" && i.element === "fire")).toBe(true);
  });

  it("調候: winter births want Fire, summer births want Water, mild seasons are null", () => {
    const winter = buildBaziChart(buildFourPillars({ year: 2024, month: 12, day: 10, hour: 12, minute: 0, tzOffsetMinutes: 480 }, ZIPING_DEFAULT));
    expect(winter.dayMaster.climatic?.needed).toContain("fire");
    const summer = buildBaziChart(buildFourPillars({ year: 2024, month: 6, day: 25, hour: 12, minute: 0, tzOffsetMinutes: 480 }, ZIPING_DEFAULT));
    expect(summer.dayMaster.climatic?.needed).toContain("water");
    const mild = buildBaziChart(buildFourPillars({ year: 2024, month: 4, day: 15, hour: 12, minute: 0, tzOffsetMinutes: 480 }, ZIPING_DEFAULT));
    expect(mild.dayMaster.climatic).toBeNull();
  });

  it("the chart's reported seasonalState is consistent with its DM and month, with rooting + interactions present", () => {
    for (const m of [
      { year: 1974, month: 3, day: 5, hour: 4, minute: 0, tzOffsetMinutes: 480 },
      { year: 1980, month: 9, day: 15, hour: 14, minute: 30, tzOffsetMinutes: 480 },
      { year: 1990, month: 6, day: 15, hour: 14, minute: 30, tzOffsetMinutes: 60 },
    ]) {
      const fp = buildFourPillars(m, ZIPING_DEFAULT);
      const chart = buildBaziChart(fp);
      const dm = chart.dayMaster;
      // seasonalState must equal the pure function of (DM phase, month phase).
      expect(dm.seasonalState).toBe(seasonalStateOf(fp.dayMaster.phase, fp.month.branch.phase));
      // rooting + interactions are always reported and well-formed.
      expect(typeof dm.rooting.hasRoot).toBe("boolean");
      expect(dm.rooting.mainQiRoot ? dm.rooting.hasRoot : true).toBe(true);
      expect(Array.isArray(chart.elements.interactions)).toBe(true);
    }
  });
});
