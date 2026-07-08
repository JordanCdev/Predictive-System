import { describe, expect, it } from "vitest";
import { buildFourPillars } from "../src/engine/sexagenary.ts";
import { buildBaziChart, computeDaYun } from "../src/engine/bazi.ts";
import { ZIPING_DEFAULT } from "../src/engine/conventions.ts";
import {
  annualPillar,
  buildPeriodsReport,
  monthPillarsOfYear,
  pillarInfluence,
} from "../src/engine/periods.ts";
import { ganZhiFromIndex } from "../src/engine/symbols.ts";

describe("annual pillar (流年)", () => {
  it("anchors 1984 = 甲子 and derives 2026 = 丙午", () => {
    expect(annualPillar(1984).hanzi).toBe("甲子");
    expect(annualPillar(2026).hanzi).toBe("丙午");
    expect(annualPillar(2027).hanzi).toBe("丁未");
  });
});

describe("month pillars (流月) of a year", () => {
  it("yields 12 solar months opening at 寅, with 五虎遁 stems", () => {
    const months = monthPillarsOfYear(2026);
    expect(months).toHaveLength(12);
    // 2026 is 丙午; 寅 month stem via 五虎遁 = 庚 → 庚寅, then advance one per month.
    expect(months[0].ganzhi.hanzi).toBe("庚寅");
    expect(months[0].branchIndex).toBe(2);
    expect(months[0].jieNameZh).toBe("立春");
    expect(months[11].ganzhi.hanzi).toBe("辛丑");
  });

  it("spans are chronological and start near 立春", () => {
    const months = monthPillarsOfYear(2026);
    for (let i = 1; i < months.length; i++) {
      expect(months[i].startIso.localeCompare(months[i - 1].startIso)).toBeGreaterThan(0);
    }
    // 立春 2026 ≈ 2026-02-03/04 (UTC), verified against HKO/JPL fixtures elsewhere.
    expect(months[0].startIso.startsWith("2026-02-0")).toBe(true);
    // The 丑 month runs into the following year's 立春.
    expect(months[11].endIso.startsWith("2027-02-0")).toBe(true);
  });

  it("is deterministic", () => {
    expect(JSON.stringify(monthPillarsOfYear(2026))).toBe(JSON.stringify(monthPillarsOfYear(2026)));
  });
});

describe("pillar influence on the natal chart", () => {
  const fp = buildFourPillars({ year: 1990, month: 6, day: 15, hour: 14, minute: 30, tzOffsetMinutes: 480 }, ZIPING_DEFAULT);
  const chart = buildBaziChart(fp);

  it("marks a favourable-element stem as a tailwind and an unfavourable one as a headwind", () => {
    const fav = chart.dayMaster.favorableElements;
    // Find a ganzhi whose stem phase is favourable.
    const favGz = Array.from({ length: 60 }, (_, i) => ganZhiFromIndex(i)).find((g) => fav.includes(g.stem.phase))!;
    expect(pillarInfluence(chart, favGz).stemValence).toBe(1);
    const unfav = chart.dayMaster.unfavorableElements;
    if (unfav.length) {
      const unfavGz = Array.from({ length: 60 }, (_, i) => ganZhiFromIndex(i)).find((g) => unfav.includes(g.stem.phase))!;
      expect(pillarInfluence(chart, unfavGz).stemValence).toBe(-1);
    }
  });

  it("detects a clash between an external branch and a natal branch", () => {
    // The day branch's opposite must register as a clash relation.
    const dayBranch = chart.pillars[2].ganzhi.branch.index;
    const oppIndex = (dayBranch + 6) % 12;
    const clashGz = Array.from({ length: 60 }, (_, i) => ganZhiFromIndex(i)).find((g) => g.branch.index === oppIndex)!;
    const rels = pillarInfluence(chart, clashGz).relations;
    expect(rels.some((r) => r.type === "clash" && r.withPosition === "day")).toBe(true);
  });
});

describe("full periods report", () => {
  const fp = buildFourPillars({ year: 1990, month: 6, day: 15, hour: 14, minute: 30, tzOffsetMinutes: 480 }, ZIPING_DEFAULT);
  const chart = buildBaziChart(fp);
  const dayun = computeDaYun(fp, "male");

  it("assembles luck + year + 12 months with an interaction sentence", () => {
    const report = buildPeriodsReport({ chart, dayun, birth: { year: 1990, month: 6, day: 15 }, targetYear: 2026 });
    expect(report.targetYear).toBe(2026);
    expect(report.year.ganzhi).toBe("丙午");
    expect(report.months).toHaveLength(12);
    expect(report.activeLuck).not.toBeNull(); // a 36-year-old is inside the luck sequence
    expect(["supportive", "mixed", "challenging", "neutral"]).toContain(report.year.valence);
    expect(report.interaction).toMatch(/2026/);
    expect(report.disclaimer).toMatch(/not forecasts/);
  });

  it("never claims outcomes — headlines use tendency language", () => {
    const report = buildPeriodsReport({ chart, dayun, birth: { year: 1990, month: 6, day: 15 }, targetYear: 2026 });
    const allText = [report.year.headline, report.interaction, ...report.months.map((m) => m.headline)].join(" ");
    expect(allText).not.toMatch(/will happen|guaranteed|certain to/i);
  });

  it("is deterministic for identical inputs", () => {
    const a = buildPeriodsReport({ chart, dayun, birth: { year: 1990, month: 6, day: 15 }, targetYear: 2026 });
    const b = buildPeriodsReport({ chart, dayun, birth: { year: 1990, month: 6, day: 15 }, targetYear: 2026 });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
