import { describe, expect, it } from "vitest";
import {
  CONTESTED_STARS,
  LINEAGE_B_UNSOURCED_NOTE,
  LINEAGE_CHIP_LABEL,
  LINEAGE_LABEL,
  LINEAGE_NOTE,
  LINEAGE_SOURCING,
  NINE_STARS,
  RELABELLED_STARS,
  RING_PALACE_ORDER,
  dayNineStars,
  dunForCivilDate,
  nineStarsForCivilDate,
  palaceOfStar,
  placeNineStars,
  taiyiPalaceFromJiaziAnchor,
  taiyiPalaceFromSolsticeAnchor,
  valenceOf,
  verdictFor,
  type DunKind,
  type PalaceNumber,
} from "../src/engine/nineStars.ts";
import { dayGanzhiIndexFromCivilDate } from "../src/engine/sexagenary.ts";
import {
  NARROW_MEDIA_QUERY,
  WHEEL_MIN_WIDTH_PX,
  wheelDescription,
  wheelRows,
} from "../src/ui/NineStarWheel.tsx";

/**
 * 日家奇門九星 — the day's nine-star directional wheel.
 *
 * The first block is the check the research spec calls MANDATORY: the 陽遁
 * placement formula must reproduce the published 六甲 table from
 * 《遁甲演義》卷一 exactly. Any implementation that fails it is wrong regardless
 * of what else it gets right. There is no equivalent published table for 陰遁 —
 * which is precisely why 陰遁 is the weak half of this doctrine, and why the
 * anchor ambiguity below is left visible rather than resolved.
 */

const BOTH_DUN: DunKind[] = ["yang", "yin"];

describe("陽遁 anchor — the 遁甲演義 六甲 table (mandatory self-check)", () => {
  // 「甲子艮宮加太乙…甲戌加離，甲申加坎，甲午加坤，甲辰加震，甲寅以太乙加巽宮」
  const SIX_JIA: Array<{ d: number; ganzhi: string; palace: PalaceNumber; trigram: string }> = [
    { d: 0, ganzhi: "甲子", palace: 8, trigram: "艮" },
    { d: 10, ganzhi: "甲戌", palace: 9, trigram: "離" },
    { d: 20, ganzhi: "甲申", palace: 1, trigram: "坎" },
    { d: 30, ganzhi: "甲午", palace: 2, trigram: "坤" },
    { d: 40, ganzhi: "甲辰", palace: 3, trigram: "震" },
    { d: 50, ganzhi: "甲寅", palace: 4, trigram: "巽" },
  ];

  for (const row of SIX_JIA) {
    it(`${row.ganzhi} (d=${row.d}) puts 太乙 in ${row.trigram}${row.palace}`, () => {
      expect(taiyiPalaceFromJiaziAnchor(row.d, "yang")).toBe(row.palace);
      const day = dayNineStars(row.d, "yang");
      expect(day.taiyiPalace).toBe(row.palace);
      expect(day.palaces.find((p) => p.star.nameZh === "太乙")!.trigramZh).toBe(row.trigram);
    });
  }

  it("advances exactly one palace per day within a 旬, INCLUDING 中宮", () => {
    // mod 9, not mod 8 — this is what distinguishes the 九星 rule from the 八門
    // rule of the same system, which skips the centre.
    for (let d = 0; d < 59; d++) {
      const here = taiyiPalaceFromJiaziAnchor(d, "yang");
      const next = taiyiPalaceFromJiaziAnchor(d + 1, "yang");
      expect(next).toBe((here % 9) + 1);
    }
    const seen = new Set<number>();
    for (let d = 0; d < 9; d++) seen.add(taiyiPalaceFromJiaziAnchor(d, "yang"));
    expect(seen.size).toBe(9);
    expect(seen.has(5)).toBe(true); // the centre is in the cycle
  });

  it("re-anchors at every 甲子 rather than running a continuous 9-day loop", () => {
    // 「命起甲子」. 60 is not a multiple of 9, so the sequence must restart at
    // 甲子 — otherwise 甲子 would not always be 艮8 and the 六甲 table above
    // would be false. The discontinuity at the 癸亥→甲子 seam is doctrine.
    for (const dun of BOTH_DUN) {
      const jiazi = taiyiPalaceFromJiaziAnchor(0, dun);
      const guihai = taiyiPalaceFromJiaziAnchor(59, dun);
      const naiveNext = dun === "yang" ? (guihai % 9) + 1 : ((guihai + 7) % 9) + 1;
      expect(jiazi).not.toBe(naiveNext);
      expect(taiyiPalaceFromJiaziAnchor(60, dun)).toBe(jiazi);
      expect(taiyiPalaceFromJiaziAnchor(120, dun)).toBe(jiazi);
    }
  });

  it("陰遁 starts 太乙 at 坤2 on 甲子 and retreats one palace a day", () => {
    expect(taiyiPalaceFromJiaziAnchor(0, "yin")).toBe(2);
    for (let d = 0; d < 59; d++) {
      const here = taiyiPalaceFromJiaziAnchor(d, "yin");
      const next = taiyiPalaceFromJiaziAnchor(d + 1, "yin");
      expect(next).toBe(((here + 7) % 9) + 1); // one step backwards, wrapping 1→9
    }
  });
});

describe("the roster is a permutation of the nine palaces, every day", () => {
  it("has nine stars in the doctrinally fixed order", () => {
    expect(NINE_STARS.map((s) => s.nameZh)).toEqual([
      "太乙",
      "摄提",
      "轩辕",
      "招摇",
      "天符",
      "青龙",
      "咸池",
      "太阴",
      "天乙",
    ]);
    expect(NINE_STARS.map((s) => s.ordinal)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it("seats 天符 in palace 5 at home — 「五黃號天符」", () => {
    // The textual check that pins the whole ordinal→home-palace mapping.
    expect(NINE_STARS.find((s) => s.nameZh === "天符")!.homePalace).toBe(5);
    expect(NINE_STARS.find((s) => s.nameZh === "太乙")!.homePalace).toBe(1); // 貪狼 = 北斗一 = 坎1
    expect(NINE_STARS.find((s) => s.nameZh === "招摇")!.homePalace).toBe(4); // 「招摇杜木星」, 杜門 = 巽4
    expect(NINE_STARS.map((s) => s.homePalace)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it("fills all nine palaces exactly once, swept across a full 60-day cycle in both 遁", () => {
    for (const dun of BOTH_DUN) {
      for (let d = 0; d < 60; d++) {
        const day = dayNineStars(d, dun);
        expect(day.palaces).toHaveLength(9);
        const palaces = day.palaces.map((p) => p.palace).sort((a, b) => a - b);
        expect(palaces).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
        const stars = new Set(day.palaces.map((p) => p.star.nameZh));
        expect(stars.size).toBe(9);
        // exactly one directionless star, and it is the centre
        const centred = day.palaces.filter((p) => p.direction === null);
        expect(centred).toHaveLength(1);
        expect(centred[0].palace).toBe(5);
        expect(day.centre.star.nameZh).toBe(centred[0].star.nameZh);
        expect(day.centre.isCentre).toBe(true);
        // the ring is the other eight, in compass order
        expect(day.ring).toHaveLength(8);
        expect(day.ring.map((p) => p.palace)).toEqual([...RING_PALACE_ORDER]);
        expect(day.ring.map((p) => p.direction)).toEqual([
          "N",
          "NE",
          "E",
          "SE",
          "S",
          "SW",
          "W",
          "NW",
        ]);
        expect(day.ring.every((p) => p.star.nameZh !== day.centre.star.nameZh)).toBe(true);
      }
    }
  });

  it("lays the roster out 順行 from 太乙 in both 遁", () => {
    // 「摄提軒轅招摇游，天符青龍咸池繼，太陰天乙順行流」 — only 太乙's own start
    // palace runs backwards in 陰遁; the roster order around it never does.
    for (const dun of BOTH_DUN) {
      for (let d = 0; d < 60; d += 7) {
        const day = dayNineStars(d, dun);
        const byOrdinal = [...day.palaces].sort((a, b) => a.star.ordinal - b.star.ordinal);
        for (let k = 0; k < 9; k++) {
          expect(byOrdinal[k].palace).toBe(((day.taiyiPalace - 1 + k) % 9) + 1);
        }
      }
    }
  });

  it("every 9-day stretch cycles which star is centred", () => {
    for (const dun of BOTH_DUN) {
      const centred = new Set<string>();
      for (let d = 0; d < 9; d++) centred.add(dayNineStars(d, dun).centre.star.nameZh);
      expect(centred.size).toBe(9);
    }
  });
});

describe("the shipped anchor day, and the divergence we do not hide", () => {
  // 2026-07-25 is the date the competitor screenshot that prompted this widget
  // was taken on. It is a 陰遁 day, and 陰遁 is the half with no published
  // anchor table — so this test pins OUR arrangement and pins the MISMATCH,
  // rather than pretending parity we do not have.
  const civil = { year: 2026, month: 7, day: 25 };

  it("resolves to 庚子, index 36, 陰遁", () => {
    const d = dayGanzhiIndexFromCivilDate(civil.year, civil.month, civil.day);
    expect(d).toBe(36);
    const det = dunForCivilDate(civil);
    expect(det.dun).toBe("yin");
    expect(det.solsticeZh).toBe("夏至");
    expect(det.solsticeCivil).toEqual({ year: 2026, month: 6, day: 21 });
    expect(det.daysSinceSolsticeDay).toBe(34);
    // 夏至 is 2026-06-21 and the nearest 甲子 is 2026-06-19 (超神, two days
    // early), so by 25 July the two switch conventions have long since agreed.
    expect(det.conventionsDisagree).toBe(false);
    expect(dunForCivilDate(civil, "nearest_jiazi").dun).toBe("yin");
  });

  it("places the nine stars as the 甲子-anchored reading requires", () => {
    const day = nineStarsForCivilDate(civil);
    expect(day.dayGanZhiZh).toBe("庚子");
    expect(day.taiyiPalace).toBe(2); // 坤 SW
    const seat = Object.fromEntries(day.palaces.map((p) => [p.star.nameZh, p.direction]));
    expect(seat).toEqual({
      太乙: "SW",
      摄提: "E",
      轩辕: "SE",
      招摇: null, // 中宮
      天符: "NW",
      青龙: "W",
      咸池: "NE",
      太阴: "S",
      天乙: "N",
    });
    expect(day.centre.star.nameZh).toBe("招摇");
  });

  it("documents the competitor mismatch instead of retro-fitting to it", () => {
    // The screenshot's eight labels were 青龙 太乙 太阴 天乙 招摇 天符 咸池 轩辕 —
    // i.e. it omits 摄提, implying 摄提 is centred. Our sourced reading centres
    // 招摇. That disagreement is a fact about the evidence, not a bug to tune
    // away, and this test exists so nobody quietly "fixes" it later.
    const COMPETITOR_EIGHT = ["青龙", "太乙", "太阴", "天乙", "招摇", "天符", "咸池", "轩辕"];
    const day = nineStarsForCivilDate(civil);
    const ours = day.ring.map((p) => p.star.nameZh);
    expect(new Set(ours)).not.toEqual(new Set(COMPETITOR_EIGHT));
    expect(day.centre.star.nameZh).toBe("招摇");
    expect(COMPETITOR_EIGHT).toContain("招摇");
    expect(COMPETITOR_EIGHT).not.toContain("摄提");
  });

  it("reports the unsourced solstice-anchored reading rather than adopting it", () => {
    const day = nineStarsForCivilDate(civil);
    expect(day.anchor).toBe("jiazi"); // the shipped reading is (i)
    const alt = day.alternateAnchor!;
    expect(alt.sourced).toBe(false);
    expect(alt.taiyiPalace).toBe(4); // 巽 SE
    expect(alt.centreStarZh).toBe("摄提"); // which is what the competitor implies
    expect(alt.differsFromShipped).toBe(true);
    // and it must not have leaked into the shipped placement
    expect(day.taiyiPalace).toBe(2);
    expect(day.centre.star.nameZh).toBe("招摇");
  });

  it("computes the solstice-anchored reading by the same 順逆 rule", () => {
    expect(taiyiPalaceFromSolsticeAnchor(0, "yang")).toBe(8); // 艮 on 冬至
    expect(taiyiPalaceFromSolsticeAnchor(0, "yin")).toBe(2); // 坤 on 夏至
    expect(taiyiPalaceFromSolsticeAnchor(34, "yin")).toBe(4);
  });
});

describe("陽遁 / 陰遁 for a civil date", () => {
  it("runs 陽遁 冬至→夏至 and 陰遁 夏至→冬至", () => {
    expect(dunForCivilDate({ year: 2026, month: 1, day: 15 }).dun).toBe("yang");
    expect(dunForCivilDate({ year: 2026, month: 4, day: 1 }).dun).toBe("yang");
    expect(dunForCivilDate({ year: 2026, month: 6, day: 21 }).dun).toBe("yin"); // 夏至 day itself
    expect(dunForCivilDate({ year: 2026, month: 6, day: 20 }).dun).toBe("yang");
    expect(dunForCivilDate({ year: 2026, month: 10, day: 1 }).dun).toBe("yin");
    expect(dunForCivilDate({ year: 2026, month: 12, day: 22 }).dun).toBe("yang"); // 冬至 2026-12-22
    expect(dunForCivilDate({ year: 2026, month: 12, day: 21 }).dun).toBe("yin");
  });

  it("only ever disagrees between conventions inside the solstice→甲子 window", () => {
    // For 2026 the nearest 甲子 to 夏至 (06-21) is 06-19, so 超神接氣 switches two
    // days early and the two readings differ on exactly 06-19 and 06-20.
    const disagreeing: string[] = [];
    for (let day = 1; day <= 30; day++) {
      const c = { year: 2026, month: 6, day };
      if (dunForCivilDate(c).conventionsDisagree) disagreeing.push(`2026-06-${day}`);
    }
    expect(disagreeing).toEqual(["2026-06-19", "2026-06-20"]);
  });

  it("assigns a 遁 for every day of a year without gaps or throws", () => {
    const days = 365;
    const start = Date.UTC(2026, 0, 1);
    let flips = 0;
    let prev: DunKind | null = null;
    for (let i = 0; i < days; i++) {
      const t = new Date(start + i * 86_400_000);
      const det = dunForCivilDate({
        year: t.getUTCFullYear(),
        month: t.getUTCMonth() + 1,
        day: t.getUTCDate(),
      });
      expect(det.dun === "yang" || det.dun === "yin").toBe(true);
      if (prev !== null && det.dun !== prev) flips++;
      prev = det.dun;
    }
    expect(flips).toBe(2); // 夏至 in June, 冬至 in December
  });
});

describe("lineage disagreement is carried, not collapsed", () => {
  it("A and B differ in verdict BUCKET on exactly 招摇 and 天符", () => {
    expect([...CONTESTED_STARS].sort()).toEqual(["天符", "招摇"].sort());
    // 轩辕 is 中平 under A and 小吉小凶 under B — different words, same middle
    // bucket. Recorded separately so it is neither hidden nor overstated.
    expect([...RELABELLED_STARS]).toEqual(["轩辕"]);
  });

  it("agrees on the four 吉 stars under both lineages", () => {
    const jiA = NINE_STARS.filter((s) => s.verdictA === "吉").map((s) => s.nameZh);
    const jiB = NINE_STARS.filter((s) => s.verdictB === "吉").map((s) => s.nameZh);
    expect(jiA).toEqual(["太乙", "青龙", "太阴", "天乙"]);
    expect(jiB).toEqual(jiA);
  });

  it("ships lineage A's classification", () => {
    const byName = Object.fromEntries(NINE_STARS.map((s) => [s.nameZh, s.verdictA]));
    expect(byName).toEqual({
      太乙: "吉",
      摄提: "凶",
      轩辕: "中平",
      招摇: "凶",
      天符: "中平",
      青龙: "吉",
      咸池: "凶",
      太阴: "吉",
      天乙: "吉",
    });
  });

  it("exposes lineage B without mutating A", () => {
    const zhaoyao = NINE_STARS.find((s) => s.nameZh === "招摇")!;
    const tianfu = NINE_STARS.find((s) => s.nameZh === "天符")!;
    expect(verdictFor(zhaoyao, "A")).toBe("凶");
    expect(verdictFor(zhaoyao, "B")).toBe("小吉小凶");
    expect(verdictFor(tianfu, "A")).toBe("中平");
    expect(verdictFor(tianfu, "B")).toBe("凶");
    expect(valenceOf("吉")).toBe("supportive");
    expect(valenceOf("中平")).toBe("mixed");
    expect(valenceOf("小吉小凶")).toBe("mixed");
    expect(valenceOf("凶")).toBe("challenging");
  });
});

describe("lineage B is disclosed as unsourced, not offered as A's peer", () => {
  it("records the sourcing asymmetry as data, not as prose only", () => {
    expect(LINEAGE_SOURCING.A).toBe("primary-text");
    expect(LINEAGE_SOURCING.B).toBe("unsourced");
  });

  it("names A's stream and refuses to invent one for B", () => {
    // A names its texts…
    expect(LINEAGE_LABEL.A).toContain("遁甲演義");
    expect(LINEAGE_NOTE.A).toContain("元靈經");
    // …and B says plainly that we have none, rather than borrowing a name.
    expect(LINEAGE_LABEL.B).toMatch(/no primary text/i);
    expect(LINEAGE_NOTE.B).toMatch(/not traced it to a primary text/i);
    expect(LINEAGE_CHIP_LABEL.A).toMatch(/sourced/);
    expect(LINEAGE_CHIP_LABEL.B).toMatch(/unsourced/);
    // "Lineage B" bare — the wording finding 5 rejected — must not come back.
    expect(LINEAGE_LABEL.B).not.toBe("Lineage B");
  });

  it("carries an on-screen note that admits what B is and is not", () => {
    expect(LINEAGE_B_UNSOURCED_NOTE).toMatch(/practitioner summaries/i);
    expect(LINEAGE_B_UNSOURCED_NOTE).toMatch(/have not read a primary text/i);
    expect(LINEAGE_B_UNSOURCED_NOTE).toMatch(/cannot name the school/i);
    expect(LINEAGE_B_UNSOURCED_NOTE).toMatch(/not as A's equal/i);
  });

  it("does not let the disclosure change what B actually says", () => {
    // Honesty about sourcing is copy; the classification itself is untouched.
    const zhaoyao = NINE_STARS.find((s) => s.nameZh === "招摇")!;
    expect(verdictFor(zhaoyao, "B")).toBe("小吉小凶");
    expect(verdictFor(zhaoyao, "A")).toBe("凶");
  });
});

describe("the wheel's display rows — one source of truth for SVG and list", () => {
  const day = nineStarsForCivilDate({ year: 2026, month: 7, day: 25 });

  it("gives nine rows: the eight compass palaces N→NW, then 中宮 last", () => {
    const rows = wheelRows(day, "A");
    expect(rows).toHaveLength(9);
    expect(rows.slice(0, 8).map((r) => r.compass)).toEqual([
      "N",
      "NE",
      "E",
      "SE",
      "S",
      "SW",
      "W",
      "NW",
    ]);
    expect(rows.filter((r) => r.isCentre)).toHaveLength(1);
    expect(rows[8].isCentre).toBe(true);
    expect(rows[8].palace).toBe(5);
    expect(rows[8].compass).toBe("中");
    expect(rows[8].label).toContain("no direction");
    expect(rows[8].starZh).toBe(day.centre.star.nameZh);
    // every star, exactly once
    expect(new Set(rows.map((r) => r.starZh)).size).toBe(9);
  });

  it("follows the selected lineage and marks the contested stars", () => {
    const a = wheelRows(day, "A");
    const b = wheelRows(day, "B");
    const verdictOf = (rows: ReturnType<typeof wheelRows>, star: string) =>
      rows.find((r) => r.starZh === star)!.verdict;
    expect(verdictOf(a, "招摇")).toBe("凶");
    expect(verdictOf(b, "招摇")).toBe("小吉小凶");
    expect(verdictOf(a, "天符")).toBe("中平");
    expect(verdictOf(b, "天符")).toBe("凶");
    for (const rows of [a, b]) {
      for (const r of rows) {
        expect(r.contested).toBe(CONTESTED_STARS.includes(r.starZh));
        expect(r.valence).toBe(valenceOf(r.verdict));
      }
    }
  });

  it("describes the whole wheel for a screen reader, centre included", () => {
    const rows = wheelRows(day, "A");
    const text = wheelDescription(day, rows);
    expect(text).toContain(day.dayGanZhiZh);
    for (const r of rows) expect(text).toContain(r.starZh);
    expect(text).toMatch(/Centre palace, no direction/);
  });

  it("floors the wheel's width and keeps a narrow-screen breakpoint", () => {
    // finding 12: the SVG may scroll, but it may not shrink into illegibility,
    // and below the breakpoint it is replaced by real text instead.
    expect(WHEEL_MIN_WIDTH_PX).toBeGreaterThanOrEqual(320);
    expect(NARROW_MEDIA_QUERY).toBe("(max-width: 560px)");
  });
});

describe("verses and aliases", () => {
  it("gives every star its 北斗 and 奇門 alias", () => {
    expect(NINE_STARS.map((s) => s.beidouZh)).toEqual([
      "貪狼",
      "巨門",
      "祿存",
      "文曲",
      "廉貞",
      "武曲",
      "破軍",
      "左輔",
      "右弼",
    ]);
    expect(NINE_STARS.map((s) => s.qimenZh)).toEqual([
      "天蓬",
      "天芮",
      "天冲",
      "天輔",
      "天禽",
      "天心",
      "天柱",
      "天任",
      "天英",
    ]);
  });

  it("carries a verbatim verse for every star, and a travel line only where one exists", () => {
    for (const s of NINE_STARS) {
      expect(s.verseZh.length).toBeGreaterThan(10);
      expect(s.verseEn.length).toBeGreaterThan(10);
    }
    // 青龙's verse contains no travel clause; we report null rather than invent one.
    expect(NINE_STARS.find((s) => s.nameZh === "青龙")!.travelLineZh).toBeNull();
    expect(NINE_STARS.find((s) => s.nameZh === "青龙")!.travelLineSource).toBeNull();
    // A line marked "verse" must actually be a clause of the quoted verse; a
    // line marked "gloss" must NOT be, or the label is lying.
    for (const s of NINE_STARS) {
      if (s.travelLineSource === "verse") expect(s.verseZh).toContain(s.travelLineZh!);
      if (s.travelLineSource === "gloss") expect(s.verseZh).not.toContain(s.travelLineZh!);
      expect(s.travelLineSource === null).toBe(s.travelLineZh === null);
    }
    // 摄提 and 轩辕's travel verdicts circulate with the doctrine but are not in
    // the quoted verse text — flagged rather than passed off as quotation.
    expect(NINE_STARS.filter((s) => s.travelLineSource === "gloss").map((s) => s.nameZh)).toEqual([
      "摄提",
      "轩辕",
    ]);
    // 太阴 and 天乙 have general 百事 clauses, not explicit travel verdicts
    expect(NINE_STARS.filter((s) => s.travelLineIsGeneral).map((s) => s.nameZh)).toEqual([
      "太阴",
      "天乙",
    ]);
  });
});

describe("determinism and purity", () => {
  it("is a pure function of (index, 遁)", () => {
    for (let d = 0; d < 60; d++) {
      for (const dun of BOTH_DUN) {
        const a = dayNineStars(d, dun);
        const b = dayNineStars(d, dun);
        expect(JSON.stringify(a)).toBe(JSON.stringify(b));
      }
    }
  });

  it("gives the same wheel for a civil date on repeated calls", () => {
    const a = nineStarsForCivilDate({ year: 2026, month: 7, day: 25 });
    const b = nineStarsForCivilDate({ year: 2026, month: 7, day: 25 });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("normalises out-of-range day indices rather than producing a hole", () => {
    expect(dayNineStars(-1, "yang").dayGanzhiIndex).toBe(59);
    expect(dayNineStars(60, "yang").taiyiPalace).toBe(taiyiPalaceFromJiaziAnchor(0, "yang"));
  });

  it("placeNineStars and palaceOfStar agree", () => {
    for (let p = 1 as PalaceNumber; p <= 9; p = (p + 1) as PalaceNumber) {
      const placed = placeNineStars(p);
      for (const entry of placed) {
        expect(entry.palace).toBe(palaceOfStar(p, entry.star.ordinal));
      }
    }
  });

  it("keeps engine purity — no lunar-javascript, no clock, no randomness, no network", async () => {
    const src = await import("node:fs").then((fs) =>
      fs.readFileSync(new URL("../src/engine/nineStars.ts", import.meta.url), "utf8"),
    );
    expect(src).not.toMatch(/from\s+["']lunar-javascript["']/);
    expect(src).not.toMatch(/require\(\s*["']lunar-javascript["']\s*\)/);
    expect(src).not.toMatch(/Date\.now\(/);
    expect(src).not.toMatch(/Math\.random\(/);
    expect(src).not.toMatch(/\bfetch\(/);
    // display-only: it must not reach into the scoring path
    expect(src).not.toMatch(/from\s+["']\.\/decision\.ts["']/);
  });
});
