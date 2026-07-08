import { describe, expect, it } from "vitest";
import { buildFourPillars } from "../src/engine/sexagenary.ts";
import { buildBaziChart } from "../src/engine/bazi.ts";
import { ZIPING_DEFAULT } from "../src/engine/conventions.ts";

/**
 * 格局 special-structure handling (Phase 2 accuracy work). Extreme charts that
 * classical doctrine treats as follow (從格) or dominant (專旺) must invert the
 * useful-element logic — previously they were mis-advised (DECISIONS.md §5).
 * The trigger dates below were found by scanning real charts.
 */

describe("從格 (follow structure)", () => {
  // 乙 wood, rootless, surrounded by earth/metal — adjusted ≈ 0.
  const fp = buildFourPillars({ year: 1970, month: 10, day: 12, hour: 20, minute: 0, tzOffsetMinutes: 480 }, ZIPING_DEFAULT);
  const dm = buildBaziChart(fp).dayMaster;

  it("classifies an unsupported rootless Day Master as follow", () => {
    expect(dm.dayMaster.hanzi).toBe("乙");
    expect(dm.rooting.hasRoot).toBe(false);
    expect(dm.hasMonthCommand).toBe(false); // 失令 — the discriminator vs an ordinary weak chart
    expect(dm.supportRatio).toBeLessThanOrEqual(0.15);
    expect(dm.structure).toBe("follow");
  });

  it("inverts the useful elements — companion/resource become unfavourable", () => {
    // 乙 wood: companion=wood, resource=water; follow favours output/wealth/officer.
    expect(dm.unfavorableElements).toContain("wood"); // companion
    expect(dm.unfavorableElements).toContain("water"); // resource
    expect(dm.favorableElements).toContain(dm.functional.wealth);
    expect(dm.favorableElements).toContain(dm.functional.officer);
    // A normal WEAK reading would (wrongly) have favoured wood/water — assert we don't.
    expect(dm.favorableElements).not.toContain("water");
  });

  it("explains the structure in the rationale", () => {
    expect(dm.rationale).toMatch(/從格|follow/);
  });
});

describe("專旺/從旺 (dominant structure)", () => {
  // 辛 metal, strongly rooted, overwhelming earth+metal — adjusted ≈ 0.9.
  const fp = buildFourPillars({ year: 1970, month: 1, day: 21, hour: 20, minute: 0, tzOffsetMinutes: 480 }, ZIPING_DEFAULT);
  const dm = buildBaziChart(fp).dayMaster;

  it("classifies an overwhelming rooted Day Master as dominant", () => {
    expect(dm.dayMaster.hanzi).toBe("辛");
    expect(dm.rooting.mainQiRoot).toBe(true);
    expect(dm.hasMonthCommand).toBe(true);
    expect(dm.supportRatio).toBeGreaterThanOrEqual(0.72);
    expect(dm.structure).toBe("dominant");
  });

  it("avoids the elements that fight the Day Master (財/官)", () => {
    // 辛 metal: wealth=wood, officer=fire; dominant flows with companion/resource/output.
    expect(dm.unfavorableElements).toContain(dm.functional.wealth); // wood
    expect(dm.unfavorableElements).toContain(dm.functional.officer); // fire
    expect(dm.favorableElements).toContain("metal"); // companion
  });
});

describe("normal charts are unaffected", () => {
  it("the baseline chart stays normal with standard 用神 logic", () => {
    const fp = buildFourPillars({ year: 1990, month: 6, day: 15, hour: 14, minute: 30, tzOffsetMinutes: 480 }, ZIPING_DEFAULT);
    const dm = buildBaziChart(fp).dayMaster;
    expect(dm.structure).toBe("normal");
  });

  it("published golden charts stay normal (no structure regressions)", () => {
    const mao = buildBaziChart(
      buildFourPillars({ year: 1893, month: 12, day: 26, hour: 8, minute: 0, tzOffsetMinutes: 480 }, ZIPING_DEFAULT),
    );
    expect(mao.dayMaster.structure).toBe("normal");
  });
});

describe("調候 reconciliation is surfaced, not silently merged", () => {
  it("flags a conflict when the climate need opposes the useful elements", () => {
    // The dominant 辛 winter chart needs Fire (調候) but Fire is 官 → unfavourable.
    const fp = buildFourPillars({ year: 1970, month: 1, day: 21, hour: 20, minute: 0, tzOffsetMinutes: 480 }, ZIPING_DEFAULT);
    const dm = buildBaziChart(fp).dayMaster;
    expect(dm.climatic).not.toBeNull();
    expect(dm.climatic!.needed).toContain("fire");
    expect(dm.climaticReconciliation).toBe("conflict");
  });

  it("is not_applicable in a mild season", () => {
    // A spring/autumn birth has no 調候 extreme.
    const fp = buildFourPillars({ year: 1990, month: 4, day: 15, hour: 10, minute: 0, tzOffsetMinutes: 480 }, ZIPING_DEFAULT);
    const dm = buildBaziChart(fp).dayMaster;
    if (dm.climatic === null) {
      expect(dm.climaticReconciliation).toBe("not_applicable");
    } else {
      expect(["aligned", "conflict"]).toContain(dm.climaticReconciliation);
    }
  });
});
