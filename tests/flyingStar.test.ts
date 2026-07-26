/**
 * 日家紫白 — the day's flying star, both schools.
 *
 * What these tests pin, and why each one exists:
 *
 *  1. The sexagenary chain the whole widget hangs off (2026-07-25 = 庚子 = 37).
 *     A one-index slip here silently moves every star.
 *  2. The 通書 anchor on the calibration date (2026-07-25 → 6 六白) AND the
 *     negative form of the same test (it must not be 9, which is what a silent
 *     fallback to the nearest-甲子 rule would produce).
 *  3. FORK LIVENESS — 超神接氣 on that date MUST be 9 九紫, the reading mainland
 *     黃曆 publish. Both branches have to be genuinely reachable, or "we show
 *     both schools" is a claim the code does not honour.
 *  4. The back-test against Joey Yap's own printed Tong Shu Diary 2008 —
 *     "5/5" on 2008-06-21 and "2/8" on 2008-12-21, as outgoing/incoming pairs.
 *     This is CALIBRATION, evidence about that publisher's implementation, not
 *     an authority on doctrine; the module says the same in its header.
 *  5. The date-level solstice trap (2025-12-21, 冬至 at 23:03 UTC+8, on a day
 *     that is itself 甲子). Instant-level comparison shifts a whole half-year
 *     by 3, so it must fail loudly.
 *  6. Continuity across a 甲子 boundary — the only discontinuity in the year is
 *     at the solstice, never at the anchor.
 *  7. Determinism, and injectability of the solstice resolver.
 *  8. Sweeps asserting the two schools genuinely diverge on a large fraction of
 *     days, and that every divergence is ±3 (mod 9) with anchors exactly one 元
 *     apart. The direction of the finding is pinned; the exact count is not.
 *     Note the divergence comes in multi-year BLOCKS (2021–2025 agree on every
 *     day, 2027–2030 differ on every day), so a single year proves little — the
 *     long-run rate is what the bounds are set from.
 *  9. DISPLAY-ONLY guard — no module in the scoring path may import this one.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  FLYING_STAR_NAMES,
  FLYING_STAR_SCHOOLS,
  civilDaysBetween,
  dayFlyingStar,
  defaultSolsticeResolver,
  flyingStarAgreementRun,
  flyingStarSeries,
  jdnToGregorian,
  sexagenaryDayIndex,
  starName,
  type SolsticeResolver,
} from "../src/engine/flyingStar.ts";
import { buildFourPillars } from "../src/engine/sexagenary.ts";
import { ZIPING_DEFAULT } from "../src/engine/conventions.ts";
import { gregorianToJDN } from "../src/engine/astronomy.ts";

const engineFile = (name: string) =>
  readFileSync(fileURLToPath(new URL(`../src/engine/${name}`, import.meta.url)), "utf8");

// ─────────────────────────────────────────────────────────────────────────────

describe("the table itself", () => {
  it("is the nine stars, in order, with colour glosses and no readings", () => {
    expect(FLYING_STAR_NAMES).toHaveLength(9);
    expect(FLYING_STAR_NAMES.map((n) => n.nameZh)).toEqual([
      "一白", "二黑", "三碧", "四綠", "五黃", "六白", "七赤", "八白", "九紫",
    ]);
    FLYING_STAR_NAMES.forEach((n, i) => expect(n.star).toBe(i + 1));
    expect(starName(6).nameZh).toBe("六白");
    expect(starName(9).colourEn).toBe("Purple");
    expect(() => starName(0)).toThrow();
    expect(() => starName(10)).toThrow();
  });

  it("carries no auspicious/inauspicious wording anywhere in the module", () => {
    // We have sourced the ARITHMETIC, not the meanings. 五黃煞 and friends are a
    // large literature we have not read into this repo; if a future edit smuggles
    // a reading in, this fails.
    const src = engineFile("flyingStar.ts")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    for (const banned of [
      "auspicious",
      "inauspicious",
      "lucky",
      "unlucky",
      "misfortune",
      "calamity",
      "favourable",
    ]) {
      expect(src.toLowerCase()).not.toContain(banned);
    }
  });
});

describe("the sexagenary chain the widget hangs off", () => {
  it("2026-07-25 is 庚子, 1-based index 37", () => {
    expect(sexagenaryDayIndex({ year: 2026, month: 7, day: 25 })).toBe(37);
    const pillars = buildFourPillars(
      { year: 2026, month: 7, day: 25, hour: 12, minute: 0, tzOffsetMinutes: 480 },
      ZIPING_DEFAULT,
    );
    expect(pillars.day.hanzi).toBe("庚子");
    expect(pillars.day.index + 1).toBe(37); // GanZhi.index is 0-based; ours is 1-based
    expect(dayFlyingStar({ year: 2026, month: 7, day: 25 }).sexagenaryIndex).toBe(37);
  });

  it("甲子 is 1 and the cycle is 60 long", () => {
    // 2026-08-18 is the 甲子 the 通書 run for that half is numbered from.
    expect(sexagenaryDayIndex({ year: 2026, month: 8, day: 18 })).toBe(1);
    expect(sexagenaryDayIndex({ year: 2026, month: 10, day: 17 })).toBe(1);
    expect(civilDaysBetween({ year: 2026, month: 8, day: 18 }, { year: 2026, month: 10, day: 17 })).toBe(60);
  });
});

describe("the anchor date, both schools", () => {
  const d = dayFlyingStar({ year: 2026, month: 7, day: 25 });

  it("通書 gives 6 六白", () => {
    // Calibration, not authority: 6 is what Joey Yap's software prints for this
    // date. It agrees with the 通書 first-甲子-on-or-after rule.
    expect(d.tongShu.star).toBe(6);
    expect(d.tongShu.name).toBe("六白");
    expect(d.tongShu.colourEn).toBe("White");
  });

  it("通書 must NOT be 9 — a 9 means it fell back to the nearest-甲子 rule", () => {
    expect(d.tongShu.star).not.toBe(9);
    expect(d.tongShu.anchorIso).toBe("2026-08-18"); // the 甲子 AFTER 夏至
    expect(d.tongShu.offsetDays).toBe(-24); // back-extrapolated; negative is correct
  });

  it("超神接氣 gives 9 九紫 — the fork is live, not decorative", () => {
    // Mainland 黃曆 (huangli999.com) publish 值日九星 九紫火 for this date.
    expect(d.chaoShen.star).toBe(9);
    expect(d.chaoShen.name).toBe("九紫");
    expect(d.chaoShen.anchorIso).toBe("2026-06-19"); // the 甲子 two days BEFORE 夏至
    expect(d.chaoShen.offsetDays).toBe(36);
  });

  it("reports the disagreement rather than picking a winner", () => {
    expect(d.agree).toBe(false);
    expect(Math.abs(d.tongShu.star - d.chaoShen.star) % 9).toBe(3);
  });

  it("is in the yin half, descending from 夏至", () => {
    expect(d.tongShu.half).toBe("yin");
    expect(d.tongShu.direction).toBe("reverse");
    expect(d.tongShu.governingSolstice.kind).toBe("summer");
    expect(d.tongShu.governingSolstice.nameZh).toBe("夏至");
    expect(d.tongShu.governingSolstice.dateIso).toBe("2026-06-21");
    expect(d.outgoing).toBeNull(); // not a solstice date
  });
});

describe("back-test against Joey Yap's printed Tong Shu Diary 2008", () => {
  // SOURCE: a reader question on joeyyap.com quoting the printed diary. These
  // are the publisher's numbers; the test proves our arithmetic reproduces that
  // implementation, NOT that the 通書 lineage is doctrinally correct.
  it("2008-06-21 prints 5/5 — and the algorithm PREDICTS the coincidence", () => {
    const d = dayFlyingStar({ year: 2008, month: 6, day: 21 });
    expect(d.tongShu.governingSolstice.kind).toBe("summer");
    expect(d.outgoing).not.toBeNull();
    expect(d.outgoing!.tongShu.star).toBe(5); // outgoing 陽遁 run, anchored 2008-01-25
    expect(d.tongShu.star).toBe(5); // incoming 陰遁 run, anchored 2008-07-23
    expect(d.outgoing!.tongShu.anchorIso).toBe("2008-01-25");
    expect(d.tongShu.anchorIso).toBe("2008-07-23");
    expect(d.outgoing!.tongShu.offsetDays).toBe(148);
    expect(d.tongShu.offsetDays).toBe(-32);
  });

  it("2008-12-21 prints 2/8 — the 8 only exists by back-extrapolation", () => {
    const d = dayFlyingStar({ year: 2008, month: 12, day: 21 });
    expect(d.tongShu.governingSolstice.kind).toBe("winter");
    expect(d.outgoing).not.toBeNull();
    expect(d.outgoing!.tongShu.star).toBe(2); // outgoing 陰遁 run, anchored 2008-07-23
    expect(d.tongShu.star).toBe(8); // incoming 陽遁 run, anchored 2009-01-19
    expect(d.outgoing!.tongShu.offsetDays).toBe(151);
    expect(d.tongShu.anchorIso).toBe("2009-01-19");
    expect(d.tongShu.offsetDays).toBe(-29); // negative — the whole point
  });

  it("outgoing is offered only on a solstice date", () => {
    expect(dayFlyingStar({ year: 2008, month: 6, day: 20 }).outgoing).toBeNull();
    expect(dayFlyingStar({ year: 2008, month: 6, day: 22 }).outgoing).toBeNull();
  });
});

describe("the date-level solstice comparison (load-bearing, not a rounding convenience)", () => {
  it("2025-12-21 — 冬至 at 23:03 UTC+8 on a day that is itself 甲子", () => {
    const solsticeMs = defaultSolsticeResolver("winter", 2025);
    const inCst = new Date(solsticeMs + 480 * 60_000);
    expect(inCst.toISOString().slice(0, 10)).toBe("2025-12-21");
    expect(inCst.getUTCHours()).toBeGreaterThanOrEqual(22); // late in the day — the trap
    expect(sexagenaryDayIndex({ year: 2025, month: 12, day: 21 })).toBe(1); // 甲子

    const d = dayFlyingStar({ year: 2025, month: 12, day: 21 });
    expect(d.tongShu.anchorIso).toBe("2025-12-21"); // NOT 2026-02-19
    expect(d.tongShu.offsetDays).toBe(0);
    expect(d.tongShu.star).toBe(1); // 一白 — 冬至甲子起一白, the mnemonic's first word
    // Both schools coincide here: nearest and first-on-or-after are the same day.
    expect(d.chaoShen.anchorIso).toBe("2025-12-21");
    expect(d.agree).toBe(true);
  });

  it("2026-01-15 is 八白 — an instant-level regression would make it 二黑", () => {
    const d = dayFlyingStar({ year: 2026, month: 1, day: 15 });
    expect(d.tongShu.anchorIso).toBe("2025-12-21");
    expect(d.tongShu.offsetDays).toBe(25);
    expect(d.tongShu.star).toBe(8);
    // The failure mode being guarded: rejecting the 23:03 solstice day would push
    // the anchor 60 days on to 2026-02-19, giving fmod(25 − 60, 9) + 1 = 2 — the
    // whole half-year off by 3, silently and for every date in it.
    const wrongAnchorStar = ((((25 - 60) % 9) + 9) % 9) + 1;
    expect(wrongAnchorStar).toBe(2);
    expect(d.tongShu.star).not.toBe(wrongAnchorStar);
    expect(sexagenaryDayIndex({ year: 2026, month: 2, day: 19 })).toBe(1); // the wrong 甲子
  });
});

describe("continuity", () => {
  it("steps by exactly −1 (mod 9) every day across the 甲子 of 2026-08-18", () => {
    // 2026-07-20 → 2026-08-20: yin half throughout (夏至 2026-06-21, 冬至 2026-12-21),
    // and it straddles the 通書 anchor. There must be NO discontinuity at the anchor.
    const series = flyingStarSeries({ year: 2026, month: 7, day: 20 }, 32);
    expect(series).toHaveLength(32);
    expect(series.some((d) => d.civilIso === "2026-08-18")).toBe(true);
    for (let i = 1; i < series.length; i++) {
      const prev = series[i - 1].tongShu.star;
      const cur = series[i].tongShu.star;
      expect(((prev - cur) % 9 + 9) % 9).toBe(1);
    }
    expect(series[0].tongShu.star).toBe(2); // 2026-07-20
    expect(series[5].tongShu.star).toBe(6); // 2026-07-25 — the anchor date
    // The 甲子 itself carries 九紫 in the yin half — the mnemonic's 夏至九宮.
    expect(series.find((d) => d.civilIso === "2026-08-18")!.tongShu.star).toBe(9);
  });

  it("ascends by +1 (mod 9) in the yang half", () => {
    const series = flyingStarSeries({ year: 2026, month: 3, day: 1 }, 20);
    for (let i = 1; i < series.length; i++) {
      const prev = series[i - 1].tongShu.star;
      const cur = series[i].tongShu.star;
      expect(((cur - prev) % 9 + 9) % 9).toBe(1);
      expect(series[i].tongShu.half).toBe("yang");
    }
  });

  it("the only discontinuity in a year is at a solstice", () => {
    const series = flyingStarSeries({ year: 2026, month: 1, day: 1 }, 365);
    const breaks: string[] = [];
    for (let i = 1; i < series.length; i++) {
      const step = ((series[i].tongShu.star - series[i - 1].tongShu.star) % 9 + 9) % 9;
      const expected = series[i].tongShu.half === "yang" ? 1 : 8; // +1 or −1 (mod 9)
      if (step !== expected || series[i].tongShu.half !== series[i - 1].tongShu.half) {
        breaks.push(series[i].civilIso);
      }
    }
    // 2026 has exactly one solstice-crossing inside the year that changes half:
    // 夏至 2026-06-21 (冬至 2026-12-21 also falls inside, so two).
    expect(breaks.length).toBeLessThanOrEqual(2);
    for (const iso of breaks) {
      const d = series.find((s) => s.civilIso === iso)!;
      expect(d.tongShu.governingSolstice.dateIso).toBe(iso);
    }
  });
});

describe("the two schools genuinely diverge", () => {
  /**
   * HOW THE DIVERGENCE IS DISTRIBUTED — worth knowing before reading the bounds
   * below. Consecutive half-years put their 甲子 anchor only 2–3 days further
   * along (182 or 183 ≡ 2 or 3 mod 60), so whether the nearest 甲子 falls before
   * or after the solstice changes slowly and then stays changed: the two schools
   * agree for a run of years and then differ for a run of years (2021–2025 agree
   * on every single day; 2027–2030 differ on every single day). A one-year
   * sample is therefore NOT representative of the long-run rate, and neither
   * bound below is derived from one.
   */
  it("disagree on a large fraction of 2026, always by ±3 (mod 9)", () => {
    const series = flyingStarSeries({ year: 2026, month: 1, day: 1 }, 365);
    const disagreements = series.filter((d) => !d.agree);
    const fraction = disagreements.length / series.length;
    // 2026 sits astride the flip: the schools agree up to 夏至 and differ after.
    expect(fraction).toBeGreaterThan(0.2);
    expect(fraction).toBeLessThan(0.8);
    for (const d of disagreements) {
      const delta = ((d.tongShu.star - d.chaoShen.star) % 9 + 9) % 9;
      expect([3, 6]).toContain(delta); // ±3 (mod 9)
      // The anchors are exactly one 元 apart when they differ.
      expect(
        Math.abs(
          gregorianToJDN(...isoParts(d.tongShu.anchorIso)) -
            gregorianToJDN(...isoParts(d.chaoShen.anchorIso)),
        ),
      ).toBe(60);
    }
  });

  it("differ on 2182 of the 5844 days of 2020–2035 — the figure the copy is written against", () => {
    const count = (fromY: number, toYExclusive: number) => {
      let differ = 0;
      let total = 0;
      for (let jdn = gregorianToJDN(fromY, 1, 1); jdn < gregorianToJDN(toYExclusive, 1, 1); jdn++) {
        total++;
        if (!dayFlyingStar(jdnToGregorian(jdn)).agree) differ++;
      }
      return { differ, total, fraction: differ / total };
    };

    // 2020–2035 means 2020-01-01 → 2035-12-31: 5844 days, not the 5479 of
    // 2020-01-01 → 2034-12-31. The header used to carry the second denominator
    // under the first label, which turned 37% into "roughly 40%" and then into
    // "two days in five" on screen. Both numbers are pinned here so the label
    // and the denominator can never drift apart again.
    const span = count(2020, 2036);
    expect(span.total).toBe(5844);
    expect(span.differ).toBe(2182);
    expect(span.fraction).toBeCloseTo(0.3734, 4); // NOT 0.4, and nowhere near 2-in-5
    expect(count(2020, 2036).differ).toBe(2182); // determinism

    // The old, wrongly-labelled span, kept so the arithmetic behind the fix is
    // legible: same 2182 differing days, fewer total days, a bigger fraction.
    // (2035 falls wholly inside an agreeing block, so the numerator is unmoved.)
    const shortSpan = count(2020, 2035);
    expect(shortSpan.total).toBe(5479);
    expect(shortSpan.differ).toBe(2182);

    // Over a full sweep of the beat, it settles near half.
    const long = count(1990, 2051);
    expect(long.fraction).toBeGreaterThan(0.3);
    expect(long.fraction).toBeLessThan(0.7);
  });

  it("the engine header quotes the corrected denominator and no per-day frequency", () => {
    // Unwrap the comment box first — the banned phrases are short enough to be
    // split across two lines, which would make a raw substring check pass for
    // the wrong reason.
    const header = engineFile("flyingStar.ts")
      .slice(0, 8000)
      .replace(/\n\s*\*\s?/g, " ")
      .replace(/\s+/g, " ")
      .toLowerCase();
    expect(header).toContain("2182 of the 5844 days");
    expect(header).not.toContain("2182 of 5479");
    expect(header).not.toContain("two days in five");
    expect(header).not.toContain("days in five");
    expect(header).not.toContain("~40%");
    // ...and it says what the shape of the divergence actually is.
    expect(header).toContain("block");
    expect(header).toContain("2026-06-20");
  });

  it("names both schools, and neither is called correct", () => {
    expect(FLYING_STAR_SCHOOLS.tongShu.nameZh).toBe("通書／曆書");
    expect(FLYING_STAR_SCHOOLS.chaoShen.nameZh).toBe("超神接氣");
    for (const s of Object.values(FLYING_STAR_SCHOOLS)) {
      const blob = `${s.nameEn} ${s.anchorRuleEn} ${s.seenInEn}`.toLowerCase();
      expect(blob).not.toContain("correct");
      expect(blob).not.toContain("accurate");
      expect(blob).not.toContain("true ");
    }
  });
});

describe("the agreement RUN — the bounds the card's copy states", () => {
  /**
   * The card used to say the schools "agree today", which framed a five-year
   * structural fact as a coincidence of dates. `flyingStarAgreementRun` gives
   * the real bounds, and these tests pin them against an independent day-by-day
   * sweep so the copy can never quote a boundary the arithmetic disowns.
   */
  it("2026-01-15 sits in an agreeing block running 2020-06-21 → 2026-06-20", () => {
    const run = flyingStarAgreementRun({ year: 2026, month: 1, day: 15 });
    expect(run.agree).toBe(true);
    expect(run.startIso).toBe("2020-06-21"); // 夏至 2020 — a solstice, always
    expect(run.endIso).toBe("2026-06-20"); // the day before 夏至 2026
    expect(run.startExact).toBe(true);
    expect(run.endExact).toBe(true);
    expect(run.halves).toBe(12);
    expect(run.days).toBe(2191);
    expect(run.sharedAnchorIso).toBe("2025-12-21"); // the one 甲子 both schools use
  });

  it("2026-07-25 sits in a DIFFERING block running 2026-06-21 → 2031-12-21", () => {
    const run = flyingStarAgreementRun({ year: 2026, month: 7, day: 25 });
    expect(run.agree).toBe(false);
    expect(run.startIso).toBe("2026-06-21");
    expect(run.endIso).toBe("2031-12-21");
    expect(run.halves).toBe(11);
    expect(run.sharedAnchorIso).toBeNull(); // there is no shared anchor to name
  });

  it("the stated bounds survive a brute-force day sweep, ends included", () => {
    for (const seed of [
      { year: 2026, month: 1, day: 15 },
      { year: 2026, month: 7, day: 25 },
      { year: 2008, month: 12, day: 21 },
      { year: 2032, month: 3, day: 1 },
    ]) {
      const run = flyingStarAgreementRun(seed);
      const startJdn = gregorianToJDN(...isoParts(run.startIso));
      const endJdn = gregorianToJDN(...isoParts(run.endIso));
      expect(endJdn - startJdn + 1).toBe(run.days);
      expect(gregorianToJDN(seed.year, seed.month, seed.day)).toBeGreaterThanOrEqual(startJdn);
      expect(gregorianToJDN(seed.year, seed.month, seed.day)).toBeLessThanOrEqual(endJdn);
      // EVERY day inside holds the claimed verdict...
      for (let jdn = startJdn; jdn <= endJdn; jdn++) {
        expect(dayFlyingStar(jdnToGregorian(jdn)).agree).toBe(run.agree);
      }
      // ...and the days just outside flip it, which is what makes it maximal.
      expect(dayFlyingStar(jdnToGregorian(startJdn - 1)).agree).toBe(!run.agree);
      expect(dayFlyingStar(jdnToGregorian(endJdn + 1)).agree).toBe(!run.agree);
    }
  });

  it("every day of a run reports the same run — it is a block, not a per-date fact", () => {
    const run = flyingStarAgreementRun({ year: 2026, month: 7, day: 25 });
    for (const probe of [
      { year: 2026, month: 6, day: 21 },
      { year: 2027, month: 3, day: 3 },
      { year: 2029, month: 11, day: 30 },
      { year: 2031, month: 12, day: 21 },
    ]) {
      expect(flyingStarAgreementRun(probe)).toEqual(run);
    }
  });

  it("a run always opens on a solstice date and closes the day before one", () => {
    const run = flyingStarAgreementRun({ year: 2026, month: 1, day: 15 });
    const first = dayFlyingStar(jdnToGregorian(gregorianToJDN(...isoParts(run.startIso))));
    expect(first.tongShu.governingSolstice.dateIso).toBe(run.startIso);
    expect(first.outgoing).not.toBeNull(); // it IS the solstice date
    const afterEnd = dayFlyingStar(jdnToGregorian(gregorianToJDN(...isoParts(run.endIso)) + 1));
    expect(afterEnd.tongShu.governingSolstice.dateIso).toBe(afterEnd.civilIso);
  });

  it("a solstice date can agree on the incoming pair and differ on the outgoing one", () => {
    // A block boundary always falls ON a solstice, so the two runs meeting on
    // that date can carry different verdicts. The card's solstice paragraph has
    // to handle all three shapes; these pin that all three occur.
    const boundary = dayFlyingStar({ year: 2008, month: 12, day: 21 });
    expect(boundary.agree).toBe(true); // incoming half agrees
    expect(boundary.outgoing!.agree).toBe(false); // the closing half did not

    const inside = dayFlyingStar({ year: 2027, month: 6, day: 21 });
    expect(inside.agree).toBe(false); // deep inside a differing block: both halves differ
    expect(inside.outgoing!.agree).toBe(false);

    const both = dayFlyingStar({ year: 2023, month: 12, day: 22 });
    expect(both.agree).toBe(true);
    expect(both.outgoing!.agree).toBe(true);
  });

  it("moves with an injected solstice resolver, like every other reading here", () => {
    const shifted: SolsticeResolver = (kind, year) =>
      defaultSolsticeResolver(kind, year) - (kind === "summer" && year === 2026 ? 3 * 86_400_000 : 0);
    const run = flyingStarAgreementRun({ year: 2026, month: 7, day: 25 }, shifted);
    // 2026-06-19 (甲子) now falls on-or-after the shifted 夏至, so both schools
    // take it — and this half joins the agreeing block that preceded it rather
    // than starting one, which is precisely why the bounds are computed and not
    // assumed to begin at the current solstice.
    expect(run.agree).toBe(true);
    expect(run.startIso).toBe("2020-06-21");
    expect(run.endIso).toBe("2026-12-21"); // the day before 冬至 2026, whose half is unshifted and differs
    expect(flyingStarAgreementRun({ year: 2026, month: 7, day: 25 }).agree).toBe(false);
  });

  it("reports a floor rather than a boundary when the walk is bounded", () => {
    // Deep inside the 2026–2031 differing block, so a 1-half walk cannot reach
    // either end of it.
    const seed = { year: 2029, month: 1, day: 1 };
    const bounded = flyingStarAgreementRun(seed, defaultSolsticeResolver, 1);
    expect(bounded.agree).toBe(false);
    expect(bounded.startExact).toBe(false);
    expect(bounded.endExact).toBe(false);
    // A floor is still a run the sweep agrees with — it is just not maximal.
    const startJdn = gregorianToJDN(...isoParts(bounded.startIso));
    const endJdn = gregorianToJDN(...isoParts(bounded.endIso));
    for (let jdn = startJdn; jdn <= endJdn; jdn++) {
      expect(dayFlyingStar(jdnToGregorian(jdn)).agree).toBe(false);
    }
    const full = flyingStarAgreementRun(seed);
    expect(bounded.days).toBeLessThan(full.days);
    expect(full.startExact && full.endExact).toBe(true);
  });
});

describe("determinism and purity", () => {
  it("returns identical results on repeated calls", () => {
    const a = dayFlyingStar({ year: 2026, month: 7, day: 25 });
    const b = dayFlyingStar({ year: 2026, month: 7, day: 25 });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("does not read the wall clock, the network, or a random source", () => {
    const src = engineFile("flyingStar.ts");
    // Comments legitimately mention these, so strip them before checking.
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    expect(code).not.toContain("Date.now");
    expect(code).not.toContain("Math.random");
    expect(code).not.toContain("fetch(");
    expect(code).not.toContain("lunar-javascript");
  });

  it("accepts an injected solstice resolver, and the result moves with it", () => {
    // Shifting 夏至 2026 two days earlier puts 2026-06-19 (甲子) on-or-after it,
    // so the 通書 anchor becomes that day and the star shifts by 3.
    const shifted: SolsticeResolver = (kind, year) =>
      defaultSolsticeResolver(kind, year) - (kind === "summer" && year === 2026 ? 3 * 86_400_000 : 0);
    const d = dayFlyingStar({ year: 2026, month: 7, day: 25 }, shifted);
    expect(d.tongShu.anchorIso).toBe("2026-06-19");
    expect(d.tongShu.star).toBe(9);
    // ...which is exactly why the date-level rule and the UTC+8 pin are stated
    // as load-bearing rather than as tidy-up.
    expect(dayFlyingStar({ year: 2026, month: 7, day: 25 }).tongShu.star).toBe(6);
  });

  it("round-trips JDN ↔ civil date", () => {
    for (let jdn = gregorianToJDN(2020, 1, 1); jdn < gregorianToJDN(2030, 1, 1); jdn += 37) {
      const c = jdnToGregorian(jdn);
      expect(gregorianToJDN(c.year, c.month, c.day)).toBe(jdn);
    }
  });
});

describe("DISPLAY ONLY — the star must never reach the scoring path", () => {
  it("no scoring-path module imports flyingStar", () => {
    for (const f of [
      "decision.ts",
      "objectives.ts",
      "interactions.ts",
      "periods.ts",
      "hash.ts",
      "lifeAreas.ts",
      "tongshu.ts",
      "bazi.ts",
      "sexagenary.ts",
    ]) {
      expect(engineFile(f)).not.toContain("flyingStar");
    }
  });

  it("the engine barrel may only RE-EXPORT it, never consume it", () => {
    // index.ts is a barrel, not a scoring module: `export * from "./flyingStar.ts"`
    // is fine (and is how integration wires the card up), but any other mention
    // would mean a kernel module reaching for the star.
    const barrel = engineFile("index.ts");
    const stripped = barrel.replace(/export\s+\*\s+from\s+"\.\/flyingStar\.ts";?/g, "");
    expect(stripped).not.toContain("flyingStar");
  });

  it("flyingStar imports nothing that could pull the kernel in behind it", () => {
    const imports = [...engineFile("flyingStar.ts").matchAll(/from\s+"([^"]+)"/g)].map((m) => m[1]);
    expect(imports.sort()).toEqual(["./astronomy.ts", "./sexagenary.ts"]);
  });
});

describe("the card's copy honours the lineage rule", () => {
  const cardSource = readFileSync(
    fileURLToPath(new URL("../src/ui/FlyingStarCard.tsx", import.meta.url)),
    "utf8",
  );
  /** Comments legitimately discuss what the copy may not say. */
  const cardCopy = cardSource
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
  /**
   * The same copy with every whitespace run collapsed. JSX prose wraps wherever
   * the line width says so, and a banned phrase split across two lines would
   * sail through a raw substring check — this is what the phrase bans test.
   */
  const cardProse = cardCopy.replace(/\s+/g, " ");

  it("names BOTH schools and cites the method", () => {
    expect(cardCopy).toContain("三元紫白擇日法");
    expect(cardCopy).toContain("超神接氣");
    expect(cardCopy).toContain("通書");
    // The two-column branch must render both readings, not one with a footnote.
    expect(cardCopy).toContain("reading={day.tongShu}");
    expect(cardCopy).toContain("reading={day.chaoShen}");
  });

  it("states the UTC+8 convention and the sourcing limit on screen", () => {
    expect(cardCopy).toContain("REFERENCE_ZONE_LABEL");
    expect(cardCopy).toContain("協紀辨方書"); // the primary text we have NOT read
    expect(cardCopy.toLowerCase()).toContain("have not read");
  });

  it("opens with the shared card heading — <h3 className=\"section-title\">, English · 漢字", () => {
    // The four divination cards share one heading element and class so they read
    // as siblings. A subordinate section inside a card must NOT reuse the class.
    expect(cardCopy).toContain('<h3 className="section-title"');
    expect(cardCopy).toContain("Daily flying star");
    expect(cardCopy).toContain("日家紫白");
    expect(cardCopy.match(/section-title/g) ?? []).toHaveLength(1);
    expect(cardCopy).not.toContain('<div className="section-title"');
  });

  it("states the run's real bounds instead of a per-day frequency", () => {
    // The measured divergence is 2182 of 5844 days AND it arrives in multi-year
    // blocks, so "two days in five" was wrong twice: the rate and the shape.
    const lower = cardProse.toLowerCase();
    expect(lower).not.toContain("two days in five");
    expect(lower).not.toContain("days in five");
    expect(lower).not.toContain("40%");
    expect(lower).not.toContain("roughly two days");
    expect(cardCopy).toContain("flyingStarAgreementRun");
    expect(cardCopy).toContain("runSpan(run)"); // the computed bounds, in both branches
    expect(cardCopy.match(/runSpan\(run\)/g) ?? []).toHaveLength(2);
    expect(cardCopy).toContain("this half-year"); // the scope of the shared anchor, named
  });

  it("on a solstice date, names the school each outgoing/incoming pair belongs to", () => {
    // Two numbers are above on a divergent solstice date, so "the number above"
    // has no referent, and one school's pair is not the whole story.
    expect(cardProse).not.toContain("the number above");
    expect(cardProse).not.toContain("number above is");
    expect(cardCopy).toContain("day.outgoing.chaoShen.star"); // the second school's pair renders
    expect(cardCopy).toContain("day.outgoing.tongShu.star");
    expect(cardProse).toContain("column above"); // the referent, when there are columns
    expect(cardProse).toContain("top of this card"); // the referent, when there is one number
  });

  it("declares no winner, prices nothing, and reads nothing into the star", () => {
    const lower = cardCopy.toLowerCase();
    for (const banned of [
      "auspicious",
      "inauspicious",
      "lucky",
      "unlucky",
      "misfortune",
      "calamity",
      "the correct",
      "more accurate",
      "joey",
      "upgrade",
      "premium",
      "pro plan",
    ]) {
      expect(lower).not.toContain(banned);
    }
  });
});

/** "2026-08-18" → [2026, 8, 18], for gregorianToJDN. */
function isoParts(iso: string): [number, number, number] {
  const [y, m, d] = iso.split("-").map(Number);
  return [y, m, d];
}

