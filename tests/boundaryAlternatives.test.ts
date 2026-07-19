import { describe, expect, it } from "vitest";
import {
  MomentInput,
  ZIPING_DEFAULT,
  ZIPING_SPLIT_ZI,
  ZIPING_ZI_ROLLOVER,
  boundaryAlternatives,
  buildFourPillars,
  hasStructuralAmbiguity,
  lichunMillis,
} from "../src/engine/index.ts";

/**
 * A birth near a pillar boundary is genuinely ambiguous — the uncertainty lives
 * in the birth record, not in the ephemeris. These tests pin the behaviour that
 * turns that hidden risk into a stated, checkable fact: both candidate charts,
 * and exactly which pillars differ.
 */

const at = (year: number, month: number, day: number, hour: number, minute: number): MomentInput => ({
  year,
  month,
  day,
  hour,
  minute,
  tzOffsetMinutes: 0,
  timeCertainty: "exact",
});

describe("Zi-hour seam", () => {
  it("flags 23:00–23:59, where the two day-boundary schools genuinely disagree", () => {
    const fp = buildFourPillars(at(1990, 6, 15, 23, 30), ZIPING_DEFAULT);
    const zi = fp.meta.boundaryFlags.filter((f) => f.kind === "zi_hour");
    expect(zi).toHaveLength(1);
    expect(zi[0].affects).toBe("day");
    // The message must say the hour stem moves too — 五鼠遁 derives it from the
    // day stem, so the day flip cascades. The old warning mentioned only the day.
    expect(zi[0].message).toMatch(/hour stem/i);
  });

  it("does NOT flag 00:00–00:59, where both schools agree", () => {
    // Previously warned here as well, putting a "your chart is in doubt" notice
    // on a chart that is not actually in doubt.
    const fp = buildFourPillars(at(1990, 6, 15, 0, 30), ZIPING_DEFAULT);
    expect(fp.meta.boundaryFlags.some((f) => f.kind === "zi_hour")).toBe(false);
  });

  it("does not flag an ordinary evening birth", () => {
    const fp = buildFourPillars(at(1990, 6, 15, 22, 59), ZIPING_DEFAULT);
    expect(fp.meta.boundaryFlags.some((f) => f.kind === "zi_hour")).toBe(false);
  });

  it("offers BOTH other schools, since three positions are defensible here", () => {
    const m = at(1990, 6, 15, 23, 30);
    const fp = buildFourPillars(m, ZIPING_DEFAULT);
    const alts = boundaryAlternatives(m, ZIPING_DEFAULT, fp);
    expect(alts).toHaveLength(2);

    // 早子時 — the whole day rolls, so day AND hour move.
    const early = alts.find((a) => /早子時/.test(a.scenario))!;
    expect(early.differs).toContain("day");
    expect(early.differs).toContain("hour"); // 五鼠遁 cascade
    expect(early.differs).not.toContain("year");
    const rollover = buildFourPillars(m, ZIPING_ZI_ROLLOVER);
    expect(early.pillars).toEqual([
      rollover.year.hanzi,
      rollover.month.hanzi,
      rollover.day.hanzi,
      rollover.hour.hanzi,
    ]);

    // 晚子時 — only the hour stem rolls, so the day pillar is untouched.
    const late = alts.find((a) => /晚子時/.test(a.scenario))!;
    expect(late.differs).toEqual(["hour"]);
    const split = buildFourPillars(m, ZIPING_SPLIT_ZI);
    expect(late.pillars[2]).toBe(fp.day.hanzi);
    expect(late.pillars[3]).toBe(split.hour.hanzi);
  });

  it("is symmetric — starting from the Zi-rollover convention offers the midnight reading", () => {
    const m = at(1990, 6, 15, 23, 30);
    const fp = buildFourPillars(m, ZIPING_ZI_ROLLOVER);
    const alts = boundaryAlternatives(m, ZIPING_ZI_ROLLOVER, fp);
    const midnight = alts.find((a) => /midnight/.test(a.scenario))!;
    const other = buildFourPillars(m, ZIPING_DEFAULT);
    expect(midnight.pillars[2]).toBe(other.day.hanzi);
    // …and the 晚子時 middle position is offered as well.
    expect(alts.some((a) => /晚子時/.test(a.scenario))).toBe(true);
  });
});

describe("立春 year seam", () => {
  /** The exact 立春 instant for a year, as civil UTC fields. */
  function lichunCivil(year: number) {
    const d = new Date(lichunMillis(year));
    return d;
  }

  it("flags a birth minutes before 立春 and offers the other year pillar", () => {
    const d = lichunCivil(1990);
    const justBefore = new Date(d.getTime() - 20 * 60_000);
    const m = at(
      justBefore.getUTCFullYear(),
      justBefore.getUTCMonth() + 1,
      justBefore.getUTCDate(),
      justBefore.getUTCHours(),
      justBefore.getUTCMinutes(),
    );

    const fp = buildFourPillars(m, ZIPING_DEFAULT);
    const flag = fp.meta.boundaryFlags.find((f) => f.kind === "lichun");
    expect(flag).toBeTruthy();
    expect(flag!.affects).toBe("year");
    expect(flag!.minutesAway).toBeLessThan(30);

    const alt = boundaryAlternatives(m, ZIPING_DEFAULT, fp).find((a) => a.flag.kind === "lichun");
    expect(alt).toBeTruthy();
    // Crossing 立春 changes the year pillar, and the month stem with it (五虎遁).
    expect(alt!.differs).toContain("year");
    expect(alt!.pillars[0]).not.toBe(fp.year.hanzi);
  });

  it("does not flag a birth far from any boundary", () => {
    const fp = buildFourPillars(at(1990, 6, 15, 14, 0), ZIPING_DEFAULT);
    expect(fp.meta.boundaryFlags.some((f) => f.kind === "lichun")).toBe(false);
    expect(boundaryAlternatives(at(1990, 6, 15, 14, 0), ZIPING_DEFAULT, fp)).toEqual([]);
  });
});

describe("alternatives are honest", () => {
  it("never reports an alternative that is identical to the primary", () => {
    // A flag that turns out to change nothing must not be surfaced as doubt.
    for (const hour of [23, 0, 12]) {
      const m = at(1990, 6, 15, hour, 30);
      const fp = buildFourPillars(m, ZIPING_DEFAULT);
      for (const alt of boundaryAlternatives(m, ZIPING_DEFAULT, fp)) {
        expect(alt.differs.length).toBeGreaterThan(0);
      }
    }
  });

  it("is deterministic", () => {
    const m = at(1990, 6, 15, 23, 30);
    const fp = buildFourPillars(m, ZIPING_DEFAULT);
    expect(boundaryAlternatives(m, ZIPING_DEFAULT, fp)).toEqual(boundaryAlternatives(m, ZIPING_DEFAULT, fp));
  });

  it("classifies a whole-pillar flip as structural", () => {
    const ziFlags = buildFourPillars(at(1990, 6, 15, 23, 30), ZIPING_DEFAULT).meta.boundaryFlags;
    expect(hasStructuralAmbiguity(ziFlags)).toBe(true);
    expect(hasStructuralAmbiguity([])).toBe(false);
    expect(hasStructuralAmbiguity(undefined)).toBe(false);
  });
});
