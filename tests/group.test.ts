import { describe, expect, it } from "vitest";
import { DayRecommendation, DecisionResult } from "../src/engine/decision.ts";
import { GroupMember, combineGroupDays, groupVerdictLine, rankGroupDays } from "../src/engine/group.ts";

/** Minimal day stub — the group layer only reads score/reject/clash/reasons. */
function day(iso: string, score: number, over: Partial<DayRecommendation> = {}): DayRecommendation {
  const [year, month, d] = iso.split("-").map(Number);
  return {
    isoDate: iso,
    civil: { year, month, day: d },
    weekday: "Mon",
    recommendationScore: score,
    hardReject: false,
    clashCeiling: null,
    topReasons: [`reason for ${iso}`],
    ...over,
  } as DayRecommendation;
}

function member(id: string, label: string, days: DayRecommendation[]): GroupMember {
  return { id, label, result: { allDays: days } as DecisionResult };
}

describe("combineGroupDays", () => {
  it("binds the group score to the worst member, not the average", () => {
    // The whole point of the feature: a day that badly clashes one principal
    // must not be rescued by everyone else's enthusiasm.
    const g = combineGroupDays([
      member("a", "Ana", [day("2026-08-01", 90)]),
      member("b", "Ben", [day("2026-08-01", 30)]),
      member("c", "Cal", [day("2026-08-01", 88)]),
    ]);
    expect(g[0].groupScore).toBe(30);
    // Aggregates keep the engine's one-decimal precision: (90+30+88)/3 = 69.3.
    expect(g[0].meanScore).toBe(69.3);
    expect(g[0].consensus).toBe("poor");
    expect(g[0].concerns).toEqual(["Ben"]);
  });

  it("rules out a day hard-rejected for any single member", () => {
    const g = combineGroupDays([
      member("a", "Ana", [day("2026-08-01", 95)]),
      member("b", "Ben", [day("2026-08-01", 95, { hardReject: true })]),
    ]);
    expect(g[0].ruledOut).toBe(true);
    expect(g[0].consensus).toBe("ruled_out");
    expect(groupVerdictLine(g[0])).toMatch(/vetoed for Ben/);
  });

  it("only considers dates every member was evaluated for", () => {
    const g = combineGroupDays([
      member("a", "Ana", [day("2026-08-01", 70), day("2026-08-02", 70)]),
      member("b", "Ben", [day("2026-08-01", 70)]),
    ]);
    expect(g.map((d) => d.isoDate)).toEqual(["2026-08-01"]);
  });

  it("flags a wide disagreement as split rather than strong", () => {
    const g = combineGroupDays([
      member("a", "Ana", [day("2026-08-01", 88)]),
      member("b", "Ben", [day("2026-08-01", 50)]),
    ]);
    expect(g[0].spread).toBe(38);
    expect(g[0].consensus).toBe("split");
    expect(groupVerdictLine(g[0])).toMatch(/Split/);
  });

  it("calls a uniformly good day strong", () => {
    const g = combineGroupDays([
      member("a", "Ana", [day("2026-08-01", 74)]),
      member("b", "Ben", [day("2026-08-01", 68)]),
    ]);
    expect(g[0].consensus).toBe("strong");
    expect(groupVerdictLine(g[0])).toMatch(/works for everyone/i);
  });

  it("handles a single member and an empty party", () => {
    expect(combineGroupDays([])).toEqual([]);
    const solo = combineGroupDays([member("a", "Ana", [day("2026-08-01", 61)])]);
    expect(solo[0].groupScore).toBe(61);
    expect(solo[0].spread).toBe(0);
  });
});

describe("rankGroupDays", () => {
  const party = (a: number[], b: number[]) => {
    const isos = ["2026-08-01", "2026-08-02", "2026-08-03"];
    return combineGroupDays([
      member("a", "Ana", isos.map((iso, i) => day(iso, a[i]))),
      member("b", "Ben", isos.map((iso, i) => day(iso, b[i]))),
    ]);
  };

  it("ranks by the floor, then the mean", () => {
    // Day 2 has the best floor (60) even though day 1 has a higher average.
    const ranked = rankGroupDays(party([95, 62, 60], [40, 60, 55]));
    expect(ranked[0].isoDate).toBe("2026-08-02");
    expect(ranked[0].groupScore).toBe(60);
  });

  it("breaks a tied floor with the mean", () => {
    const ranked = rankGroupDays(party([70, 90, 70], [60, 60, 60]));
    expect(ranked[0].isoDate).toBe("2026-08-02");
  });

  it("never recommends a day ruled out for someone", () => {
    const days = combineGroupDays([
      member("a", "Ana", [day("2026-08-01", 99), day("2026-08-02", 55)]),
      member("b", "Ben", [day("2026-08-01", 99, { hardReject: true }), day("2026-08-02", 55)]),
    ]);
    const ranked = rankGroupDays(days);
    expect(ranked.map((d) => d.isoDate)).toEqual(["2026-08-02"]);
  });

  it("is deterministic — equal days keep calendar order", () => {
    const ranked = rankGroupDays(party([70, 70, 70], [70, 70, 70]));
    expect(ranked.map((d) => d.isoDate)).toEqual(["2026-08-01", "2026-08-02", "2026-08-03"]);
  });
});
