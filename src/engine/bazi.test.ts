import { describe, it, expect } from "vitest";
import { buildFourPillars } from "./sexagenary.ts";
import { ZIPING_DEFAULT } from "./conventions.ts";
import { TEN_GOD_ORDER, buildBaziChart, detectInteractions, seasonalStateOf, tenGodDayActivation } from "./bazi.ts";
import { HIDDEN_STEMS, ganZhiFromIndex, tenGodOf } from "./symbols.ts";

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

describe("tenGodDayActivation — display-only Ten-God day read", () => {
  // Golden chart: 1998-03-23 19:47 Europe/London (GMT in March) → 戊寅/乙卯/己巳/甲戌.
  const golden = buildBaziChart(
    buildFourPillars({ year: 1998, month: 3, day: 23, hour: 19, minute: 47, tzOffsetMinutes: 0 }, ZIPING_DEFAULT),
  );

  it("always returns all 10 gods in the stable canonical order", () => {
    for (let i = 0; i < 60; i++) {
      const rows = tenGodDayActivation(golden, ganZhiFromIndex(i));
      expect(rows.map((r) => r.tenGod)).toEqual(TEN_GOD_ORDER);
    }
  });

  it("raw weights sum to day-stem 1.0 + the day branch's hidden-stem weights; activations stay in [-2, 2]", () => {
    for (let i = 0; i < 60; i++) {
      const gz = ganZhiFromIndex(i);
      const rows = tenGodDayActivation(golden, gz);
      const hiddenSum = HIDDEN_STEMS[gz.branch.index].reduce((a, h) => a + h.weight, 0);
      const weightSum = rows.reduce((a, r) => a + r.weight, 0);
      expect(weightSum).toBeCloseTo(1.0 + hiddenSum, 6);
      for (const r of rows) {
        expect(Math.abs(r.activation)).toBeLessThanOrEqual(2);
        expect(r.present).toBe(r.weight > 0);
      }
    }
  });

  it("is deterministic: identical inputs give deep-equal output", () => {
    const gz = ganZhiFromIndex(36); // 庚子
    expect(tenGodDayActivation(golden, gz)).toEqual(tenGodDayActivation(golden, gz));
  });

  it("the day stem's own god is always present with the single largest raw contribution", () => {
    const dm = golden.dayMaster.dayMaster;
    for (let i = 0; i < 60; i++) {
      const gz = ganZhiFromIndex(i);
      const rows = tenGodDayActivation(golden, gz);
      const stemGod = tenGodOf(dm, gz.stem);
      const stemRow = rows.find((r) => r.tenGod === stemGod)!;
      expect(stemRow.present).toBe(true);
      expect(stemRow.weight).toBeGreaterThanOrEqual(1.0);
      // No other god can exceed it: a single hidden stem carries at most 1.0
      // (single-qi branch), so ties are possible but never an overtake.
      for (const r of rows) {
        if (r.tenGod !== stemGod) expect(r.weight).toBeLessThanOrEqual(stemRow.weight);
      }
    }
  });

  it("signs follow the chart's useful-element read: favourable > 0, unfavourable < 0, neutral small positive", () => {
    // A STRONG chart (1974-03-05 04:00 UTC+8): its favourable AND unfavourable
    // sets are both non-empty, so both sign branches are genuinely exercised by
    // the 60-pillar sweep (the golden chart is balanced → no unfavourables).
    const strong = buildBaziChart(
      buildFourPillars({ year: 1974, month: 3, day: 5, hour: 4, minute: 0, tzOffsetMinutes: 480 }, ZIPING_DEFAULT),
    );
    expect(strong.dayMaster.favorableElements.length).toBeGreaterThan(0);
    expect(strong.dayMaster.unfavorableElements.length).toBeGreaterThan(0);
    let sawFavourable = 0;
    let sawUnfavourable = 0;
    for (let i = 0; i < 60; i++) {
      const rows = tenGodDayActivation(strong, ganZhiFromIndex(i));
      for (const r of rows.filter((x) => x.present)) {
        if (r.valence === "favourable") {
          sawFavourable++;
          expect(r.activation).toBeCloseTo(r.weight, 6);
          expect(r.activation).toBeGreaterThan(0);
        } else if (r.valence === "unfavourable") {
          sawUnfavourable++;
          expect(r.activation).toBeCloseTo(-r.weight, 6);
          expect(r.activation).toBeLessThan(0);
        } else {
          expect(r.activation).toBeGreaterThan(0);
          expect(r.activation).toBeLessThan(r.weight); // damped, never full strength
        }
        // Valence must agree with the chart's sets for the carrier stem's element.
        const inFav = strong.dayMaster.favorableElements.includes(r.stem.phase);
        const inUnfav = strong.dayMaster.unfavorableElements.includes(r.stem.phase);
        expect(r.valence).toBe(inFav ? "favourable" : inUnfav ? "unfavourable" : "neutral");
      }
    }
    expect(sawFavourable).toBeGreaterThan(0);
    expect(sawUnfavourable).toBeGreaterThan(0);
  });
});
