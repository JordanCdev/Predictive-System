import { describe, expect, it } from "vitest";
import { buildFourPillars } from "../src/engine/sexagenary.ts";
import { buildBaziChart } from "../src/engine/bazi.ts";
import { ZIPING_DEFAULT } from "../src/engine/conventions.ts";
import { lifeAreaScores } from "../src/engine/lifeAreas.ts";
import { annualPillar } from "../src/engine/periods.ts";
import { ganZhiFromIndex } from "../src/engine/symbols.ts";

const fp = buildFourPillars({ year: 1990, month: 6, day: 15, hour: 14, minute: 30, tzOffsetMinutes: 480 }, ZIPING_DEFAULT);
const chart = buildBaziChart(fp);

describe("life-area gauges", () => {
  it("returns the four areas, each a 0–100 gauge with a tendency reason", () => {
    const r = lifeAreaScores(chart, annualPillar(2026));
    expect(r.areas.map((a) => a.key)).toEqual(["career", "wealth", "relationship", "health"]);
    for (const a of r.areas) {
      expect(a.score).toBeGreaterThanOrEqual(0);
      expect(a.score).toBeLessThanOrEqual(100);
      expect(a.reason.length).toBeGreaterThan(0);
      expect(a.hanzi.length).toBeGreaterThan(0);
    }
  });

  it("is deterministic for identical inputs", () => {
    const gz = annualPillar(2026);
    expect(JSON.stringify(lifeAreaScores(chart, gz))).toBe(JSON.stringify(lifeAreaScores(chart, gz)));
  });

  it("never claims outcomes — reasons stay tendency-level", () => {
    // Sweep the whole 60-cycle so every branch of the reason logic is exercised.
    // (The disclaimer legitimately says "not forecasts of what will happen"; the
    // reasons are what must never make an affirmative outcome claim.)
    const text = Array.from({ length: 60 }, (_, i) => lifeAreaScores(chart, ganZhiFromIndex(i)))
      .flatMap((r) => r.areas.map((a) => a.reason))
      .join(" ");
    expect(text).not.toMatch(/will happen|guaranteed|certain to|you will|definitely/i);
  });

  it("a favourable-element stem lifts wellbeing above an unfavourable-element stem", () => {
    const fav = chart.dayMaster.favorableElements;
    const unfav = chart.dayMaster.unfavorableElements;
    if (!fav.length || !unfav.length) return; // balanced charts may have an empty unfav set
    const cycle = Array.from({ length: 60 }, (_, i) => ganZhiFromIndex(i));
    const favGz = cycle.find((g) => fav.includes(g.stem.phase) && fav.includes(g.branch.phase));
    const unfavGz = cycle.find((g) => unfav.includes(g.stem.phase) && unfav.includes(g.branch.phase));
    if (!favGz || !unfavGz) return;
    const favHealth = lifeAreaScores(chart, favGz).areas.find((a) => a.key === "health")!.score;
    const unfavHealth = lifeAreaScores(chart, unfavGz).areas.find((a) => a.key === "health")!.score;
    expect(favHealth).toBeGreaterThan(unfavHealth);
  });

  it("routes a clash to the spouse palace (day branch) into a relationship caution", () => {
    const dayBranch = chart.pillars[2].ganzhi.branch.index;
    const oppo = (dayBranch + 6) % 12;
    const clashGz = Array.from({ length: 60 }, (_, i) => ganZhiFromIndex(i)).find((g) => g.branch.index === oppo)!;
    const rel = lifeAreaScores(chart, clashGz).areas.find((a) => a.key === "relationship")!;
    expect(rel.reason).toMatch(/spouse|partner|care|patience/i);
  });
});
