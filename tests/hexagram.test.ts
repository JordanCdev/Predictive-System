/**
 * 易 hexagrams — King Wen table, 卦氣 六日七分 day-rotation, 梅花易數 cast.
 *
 * What this file pins:
 *  1. The King Wen table is internally consistent — every hexagram's six lines
 *     are exactly its (下卦 ⊕ 上卦) lines, all 64 trigram pairs are present and
 *     distinct, and the pair↔lines round-trip is total.
 *  2. The transmitted 60-hexagram 卦氣 sequence self-validates three ways
 *     (60 entries; excluded set exactly {29 坎, 30 離, 51 震, 58 兌}; the twelve
 *     辟卦 at i ≡ 1 mod 5 are the 十二消息卦 in order). The order is NOT derivable
 *     from any stated rule — it survives only as a transmitted table — so these
 *     three checks are the only structural evidence the transcription is intact.
 *  3. The whole 2026 cycle, as an independently transcribed boundary fixture.
 *  4. Both off-by-one phase probes FAIL — i.e. 中孚-at-冬至 is genuinely pinned
 *     and the anchor is not accidentally right.
 *  5. The noon bucketing convention, on a day where it visibly differs from the
 *     midnight and 子時 alternatives.
 *  6. 梅花易數 against the classical worked example in its own source text.
 *  7. The card's lunar-date keying: a date change shows nothing rather than the
 *     previous date's cast, which is a wrong reading and not a late one.
 *
 * The 2026-07-25 → 天澤履 (#10) case appears under both methods. It is a
 * coincidence: 卦氣 and 梅花 agree on only 8 days of 2026 and that is one of
 * them. Neither test claims either method reproduces any other product.
 *
 * Tests may import lunar-javascript directly (they are not the app bundle, and
 * the engine module under test deliberately does not).
 */
import { describe, expect, it } from "vitest";
import { Solar } from "lunar-javascript";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { BRANCHES } from "../src/engine/symbols.ts";
import {
  GUA_QI_CARDINAL_KING_WEN,
  GUA_QI_STEP_DAYS,
  GUA_QI_TRANSCRIPTION,
  HEXAGRAMS,
  TRIGRAMS,
  dayHexagram,
  guaQiSequence,
  hexagramByKingWen,
  hexagramByLines,
  hexagramByTrigrams,
  hexagramCodePoint,
  hexagramGlyph,
  meihuaCast,
  trigramByXianTian,
  trigramCodePoint,
  trigramGlyph,
} from "../src/engine/hexagram.ts";
import { meihuaLunarKey, selectMeihuaLunar } from "../src/ui/HexagramCard.tsx";

const ANCHOR = { year: 2026, month: 7, day: 25 } as const;
const DAY_MS = 86_400_000;

/** Absolute gap in minutes between an ISO instant and a "YYYY-MM-DD HH:MM" CST wall time. */
function minutesBetween(isoA: string, cstB: string): number {
  const b = Date.parse(`${cstB.replace(" ", "T")}:00+08:00`);
  return Math.abs(new Date(isoA).getTime() - b) / 60_000;
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. The King Wen table
// ═══════════════════════════════════════════════════════════════════════════

describe("八卦 — the eight trigrams", () => {
  it("are the eight 先天 numbers 1..8 in 乾兌離震巽坎艮坤 order", () => {
    expect(TRIGRAMS.map((t) => t.xianTian)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(TRIGRAMS.map((t) => t.nameZh)).toEqual(["乾", "兌", "離", "震", "巽", "坎", "艮", "坤"]);
  });

  it("carry the classical line patterns, bottom to top", () => {
    // 乾 ☰ three solid; 坤 ☷ three broken; 兌 ☱ broken TOP line; 艮 ☶ solid TOP line.
    expect(trigramByXianTian(1).lines).toEqual([true, true, true]);
    expect(trigramByXianTian(8).lines).toEqual([false, false, false]);
    expect(trigramByXianTian(2).lines).toEqual([true, true, false]);
    expect(trigramByXianTian(7).lines).toEqual([false, false, true]);
    expect(trigramByXianTian(6).lines).toEqual([false, true, false]); // 坎 ☵
    expect(trigramByXianTian(3).lines).toEqual([true, false, true]); // 離 ☲
  });

  it("have eight distinct line patterns covering all 2³ combinations", () => {
    const keys = new Set(TRIGRAMS.map((t) => t.lines.map((v) => (v ? "1" : "0")).join("")));
    expect(keys.size).toBe(8);
  });

  it("map to the Unicode trigram block, which is laid out in 先天 order", () => {
    expect(trigramCodePoint(1)).toBe(0x2630);
    expect(trigramGlyph(1)).toBe("☰");
    expect(trigramGlyph(8)).toBe("☷");
    expect(() => trigramByXianTian(0)).toThrow(RangeError);
    expect(() => trigramByXianTian(9)).toThrow(RangeError);
  });
});

describe("六十四卦 — the King Wen table", () => {
  it("has 64 entries numbered 1..64 in order", () => {
    expect(HEXAGRAMS).toHaveLength(64);
    expect(HEXAGRAMS.map((h) => h.kingWen)).toEqual(
      Array.from({ length: 64 }, (_, i) => i + 1),
    );
  });

  it("has distinct Chinese names and distinct trigram pairs covering all 64", () => {
    expect(new Set(HEXAGRAMS.map((h) => h.nameZh)).size).toBe(64);
    const pairs = new Set(HEXAGRAMS.map((h) => `${h.upper.xianTian}/${h.lower.xianTian}`));
    expect(pairs.size).toBe(64); // 8 × 8, all present
  });

  // The load-bearing consistency assertion: lines are DERIVED from the pair, so
  // this proves the derivation, and `hexagramByTrigrams` inverts it exactly.
  it("has six lines that are exactly 下卦 (1-3) then 上卦 (4-6), for all 64", () => {
    for (const h of HEXAGRAMS) {
      expect(h.lines).toHaveLength(6);
      expect(h.lines.slice(0, 3)).toEqual([...h.lower.lines]);
      expect(h.lines.slice(3, 6)).toEqual([...h.upper.lines]);
      expect(hexagramByTrigrams(h.upper.xianTian, h.lower.xianTian).kingWen).toBe(h.kingWen);
      expect(hexagramByLines(h.lines).kingWen).toBe(h.kingWen);
    }
  });

  it("agrees with the classical spot cases", () => {
    const qian = hexagramByKingWen(1);
    expect(qian.nameZh).toBe("乾");
    expect(qian.lines).toEqual([true, true, true, true, true, true]);
    const kun = hexagramByKingWen(2);
    expect(kun.lines).toEqual([false, false, false, false, false, false]);

    // 天澤履 — 上乾 下兌. Bottom to top: 兌 (yang, yang, yin) then 乾 (yang×3).
    const lu = hexagramByKingWen(10);
    expect(lu.nameZh).toBe("履");
    expect(lu.nameEn).toBe("Treading");
    expect(lu.upper.nameZh).toBe("乾");
    expect(lu.lower.nameZh).toBe("兌");
    expect(lu.lines).toEqual([true, true, false, true, true, true]);

    // 澤火革 — 上兌 下離 (the source's own worked 梅花 example).
    const ge = hexagramByKingWen(49);
    expect(ge.nameZh).toBe("革");
    expect(ge.upper.nameZh).toBe("兌");
    expect(ge.lower.nameZh).toBe("離");

    // 泰 vs 否 must not be transposed: 泰 = 上坤 下乾.
    expect(hexagramByKingWen(11).upper.nameZh).toBe("坤");
    expect(hexagramByKingWen(11).lower.nameZh).toBe("乾");
    expect(hexagramByKingWen(12).upper.nameZh).toBe("乾");
    expect(hexagramByKingWen(12).lower.nameZh).toBe("坤");
  });

  it("exposes the Unicode codepoint helper (though the UI draws the lines itself)", () => {
    expect(hexagramCodePoint(1)).toBe(0x4dc0);
    expect(hexagramCodePoint(64)).toBe(0x4dff);
    expect(hexagramCodePoint(10)).toBe(0x4dc0 + 9);
    expect(hexagramGlyph(1)).toBe("䷀");
    expect(hexagramGlyph(10)).toBe("䷉");
    expect(() => hexagramByKingWen(0)).toThrow(RangeError);
    expect(() => hexagramByKingWen(65)).toThrow(RangeError);
    expect(() => hexagramByLines([true, true, true])).toThrow(RangeError);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. The 60-hexagram 卦氣 sequence — the three self-validations
// ═══════════════════════════════════════════════════════════════════════════

describe("卦氣 sequence — self-validation of the transmitted table", () => {
  it("(1) has exactly 60 entries, all distinct", () => {
    expect(guaQiSequence).toHaveLength(60);
    expect(new Set(guaQiSequence.map((e) => e.hexagram.kingWen)).size).toBe(60);
    expect(guaQiSequence.map((e) => e.index)).toEqual(
      Array.from({ length: 60 }, (_, i) => i),
    );
  });

  it("(2) excludes exactly the four 正卦 {29 坎, 30 離, 51 震, 58 兌}", () => {
    const present = new Set(guaQiSequence.map((e) => e.hexagram.kingWen));
    const missing: number[] = [];
    for (let k = 1; k <= 64; k++) if (!present.has(k)) missing.push(k);
    expect(missing).toEqual([29, 30, 51, 58]);
    expect(missing).toEqual([...GUA_QI_CARDINAL_KING_WEN]);
  });

  it("(3) puts the twelve 辟卦 at i ≡ 1 (mod 5), and they are the 十二消息卦 in order", () => {
    const bi = guaQiSequence.filter((e) => e.rank === "辟");
    expect(bi.map((e) => e.index)).toEqual([1, 6, 11, 16, 21, 26, 31, 36, 41, 46, 51, 56]);
    expect(bi.map((e) => e.hexagram.nameZh)).toEqual([
      "復", "臨", "泰", "大壯", "夬", "乾", "姤", "遯", "否", "觀", "剝", "坤",
    ]);
  });

  it("cycles the ranks 公→辟→侯→大夫→卿 with period 5 from 公中孚 at 冬至", () => {
    expect(guaQiSequence[0].hexagram.nameZh).toBe("中孚");
    expect(guaQiSequence[0].rank).toBe("公");
    const ranks = ["公", "辟", "侯", "大夫", "卿"];
    for (const e of guaQiSequence) expect(e.rank).toBe(ranks[e.index % 5]);
    // only the 侯 hexagram is split 侯(內)/侯(外) across the 中氣 and the 節
    for (const e of guaQiSequence) expect(e.straddlesJie).toBe(e.rank === "侯");
  });

  it("keeps the raw transcription's names and numbers in agreement", () => {
    // The table was transcribed with BOTH columns precisely so a slipped row is
    // detectable; a numbers-only table would hide it.
    expect(GUA_QI_TRANSCRIPTION).toHaveLength(60);
    for (const [kingWen, nameZh] of GUA_QI_TRANSCRIPTION) {
      expect(hexagramByKingWen(kingWen).nameZh).toBe(nameZh);
    }
  });

  it("matches 《易緯稽覽圖》's own sequence, quoted independently of the source we transcribed from", () => {
    // SECOND, INDEPENDENT SOURCE. The shipped order came from the 京房卦氣直日圖
    // 橫圖 (via 《新唐書‧曆志》). This is the *other* primary witness: the 稽覽圖's
    // list as quoted in 艮宧易說《卦氣直日考·第三考六十卦次序》, reproduced at
    // ctext.org/wiki.pl?if=gb&chapter=945325 — retrieved and parsed rather than
    // taken on trust. It runs 寅→丑 with a month-branch marker after each block
    // of five, so it is rotated to the 冬至 (中孚) start the engine uses.
    //
    // Variant graphs in the ctext text normalised here: 暌→睽, 无𡚶→无妄,
    // 頥→頤, 旣→既. Nothing else was altered.
    const jiLanTu = [
      // 寅            卯            辰           巳             午
      "小過", "蒙", "益", "漸", "泰", "需", "隨", "晉", "解", "大壯",
      "豫", "訟", "蠱", "革", "夬", "旅", "師", "比", "小畜", "乾",
      "大有", "家人", "井", "咸", "姤",
      // 未            申            酉           戌             亥
      "鼎", "豐", "渙", "履", "遯", "恆", "節", "同人", "損", "否",
      "巽", "萃", "大畜", "賁", "觀", "歸妹", "无妄", "明夷", "困", "剝",
      "艮", "既濟", "噬嗑", "大過", "坤",
      // 子            丑
      "未濟", "蹇", "頤", "中孚", "復", "屯", "謙", "睽", "升", "臨",
    ];
    expect(jiLanTu).toHaveLength(60);

    const start = jiLanTu.indexOf("中孚");
    const fromWinterSolstice = [...jiLanTu.slice(start), ...jiLanTu.slice(0, start)];
    expect(guaQiSequence.map((e) => e.hexagram.nameZh)).toEqual(fromWinterSolstice);

    // The consequence that matters for the shipped reading: 履 sits at index 35,
    // which is what puts it on 2026-07-25.
    expect(fromWinterSolstice.indexOf("履")).toBe(35);
  });

  it("attributes each block of five to its 中氣, twelve blocks from 冬至", () => {
    const opens = guaQiSequence.filter((e) => e.rank === "公").map((e) => e.midQiTerm.nameZh);
    expect(opens).toEqual([
      "冬至", "大寒", "雨水", "春分", "穀雨", "小滿",
      "夏至", "大暑", "處暑", "秋分", "霜降", "小雪",
    ]);
    // 大暑 opens with 公履 — the doctrinal placement 「大暑…公履 辟遯 侯恒」
    const daShu = guaQiSequence.filter((e) => e.midQiTerm.nameZh === "大暑");
    expect(daShu.map((e) => e.hexagram.nameZh)).toEqual(["履", "遯", "恆", "節", "同人"]);
    expect(daShu[0].rank).toBe("公");
    expect(daShu.every((e) => e.jieTerm.nameZh === "立秋")).toBe(true);
    // every block has exactly five and English labels come from the engine's own
    // 24-term table, so they cannot drift
    for (const e of guaQiSequence) {
      expect(e.midQiTerm.nameEn.length).toBeGreaterThan(0);
      expect(e.jieTerm.nameEn.length).toBeGreaterThan(0);
    }
    expect(guaQiSequence[35].midQiTerm.nameEn).toBe("Major Heat");
  });

  it("uses the 六日七分 step: 365.25 / 60 = 6 + 7/80", () => {
    expect(GUA_QI_STEP_DAYS).toBeCloseTo(6.0875, 12);
    expect(GUA_QI_STEP_DAYS * 60).toBeCloseTo(365.25, 9);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. dayHexagram — the anchor, the full 2026 cycle, the phase probes
// ═══════════════════════════════════════════════════════════════════════════

describe("dayHexagram — 卦氣 六日七分", () => {
  it("gives 天澤履 (King Wen 10), 公卦 of 大暑, for 2026-07-25", () => {
    const r = dayHexagram(ANCHOR);
    expect(r.hexagram.kingWen).toBe(10);
    expect(r.hexagram.nameZh).toBe("履");
    expect(r.hexagram.nameEn).toBe("Treading");
    expect(r.rank).toBe("公");
    expect(r.rankEn).toBe("Duke");
    expect(r.midQiTerm.nameZh).toBe("大暑");
    expect(r.index).toBe(35);
    // no moving line exists in this model — it is a calendar, not a cast
    expect(r).not.toHaveProperty("movingLine");
  });

  it("places 2026-07-25 comfortably inside the 履 window, not on its edge", () => {
    const r = dayHexagram(ANCHOR);
    const noonUtc = Date.UTC(2026, 6, 25, 12) - 8 * 3_600_000;
    const start = new Date(r.windowStartIso).getTime();
    const end = new Date(r.windowEndIso).getTime();
    expect(start).toBeLessThan(noonUtc);
    expect(end).toBeGreaterThan(noonUtc);
    expect((end - start) / DAY_MS).toBeCloseTo(GUA_QI_STEP_DAYS, 6);
    // ~2.5 days in — so the match survives solstice-precision wobble
    expect((noonUtc - start) / DAY_MS).toBeGreaterThan(2);
    expect((noonUtc - start) / DAY_MS).toBeLessThan(3);
  });

  /**
   * The whole 2026 cycle, transcribed from the research adjudication (which
   * computed it from the sequence + arithmetic with an independent low-precision
   * Meeus solve). Start instants are compared with a ±10 min tolerance because
   * that solve differs from the repo's solver by ~2 minutes; the CIVIL DAY RUNS
   * are compared exactly, which is what the noon rule actually decides.
   *
   * Format: index(1-based) | name | window start, CST | first civil day | last.
   */
  const FIXTURE_2026 = `
 1|中孚 |2025-12-21 23:00|2025-12-22|2025-12-27
 2|復   |2025-12-28 01:06|2025-12-28|2026-01-02
 3|屯   |2026-01-03 03:12|2026-01-03|2026-01-08
 4|謙   |2026-01-09 05:18|2026-01-09|2026-01-14
 5|睽   |2026-01-15 07:24|2026-01-15|2026-01-20
 6|升   |2026-01-21 09:30|2026-01-21|2026-01-26
 7|臨   |2026-01-27 11:36|2026-01-27|2026-02-02
 8|小過 |2026-02-02 13:42|2026-02-03|2026-02-08
 9|蒙   |2026-02-08 15:48|2026-02-09|2026-02-14
10|益   |2026-02-14 17:54|2026-02-15|2026-02-20
11|漸   |2026-02-20 20:00|2026-02-21|2026-02-26
12|泰   |2026-02-26 22:06|2026-02-27|2026-03-04
13|需   |2026-03-05 00:12|2026-03-05|2026-03-10
14|隨   |2026-03-11 02:18|2026-03-11|2026-03-16
15|晉   |2026-03-17 04:24|2026-03-17|2026-03-22
16|解   |2026-03-23 06:30|2026-03-23|2026-03-28
17|大壯 |2026-03-29 08:36|2026-03-29|2026-04-03
18|豫   |2026-04-04 10:42|2026-04-04|2026-04-10
19|訟   |2026-04-10 12:48|2026-04-11|2026-04-16
20|蠱   |2026-04-16 14:54|2026-04-17|2026-04-22
21|革   |2026-04-22 17:00|2026-04-23|2026-04-28
22|夬   |2026-04-28 19:06|2026-04-29|2026-05-04
23|旅   |2026-05-04 21:12|2026-05-05|2026-05-10
24|師   |2026-05-10 23:18|2026-05-11|2026-05-16
25|比   |2026-05-17 01:24|2026-05-17|2026-05-22
26|小畜 |2026-05-23 03:30|2026-05-23|2026-05-28
27|乾   |2026-05-29 05:36|2026-05-29|2026-06-03
28|大有 |2026-06-04 07:42|2026-06-04|2026-06-09
29|家人 |2026-06-10 09:48|2026-06-10|2026-06-15
30|井   |2026-06-16 11:54|2026-06-16|2026-06-22
31|咸   |2026-06-22 14:00|2026-06-23|2026-06-28
32|姤   |2026-06-28 16:06|2026-06-29|2026-07-04
33|鼎   |2026-07-04 18:12|2026-07-05|2026-07-10
34|豐   |2026-07-10 20:18|2026-07-11|2026-07-16
35|渙   |2026-07-16 22:24|2026-07-17|2026-07-22
36|履   |2026-07-23 00:30|2026-07-23|2026-07-28
37|遯   |2026-07-29 02:36|2026-07-29|2026-08-03
38|恆   |2026-08-04 04:42|2026-08-04|2026-08-09
39|節   |2026-08-10 06:48|2026-08-10|2026-08-15
40|同人 |2026-08-16 08:54|2026-08-16|2026-08-21
41|損   |2026-08-22 11:00|2026-08-22|2026-08-28
42|否   |2026-08-28 13:06|2026-08-29|2026-09-03
43|巽   |2026-09-03 15:12|2026-09-04|2026-09-09
44|萃   |2026-09-09 17:18|2026-09-10|2026-09-15
45|大畜 |2026-09-15 19:24|2026-09-16|2026-09-21
46|賁   |2026-09-21 21:30|2026-09-22|2026-09-27
47|觀   |2026-09-27 23:36|2026-09-28|2026-10-03
48|歸妹 |2026-10-04 01:42|2026-10-04|2026-10-09
49|无妄 |2026-10-10 03:48|2026-10-10|2026-10-15
50|明夷 |2026-10-16 05:54|2026-10-16|2026-10-21
51|困   |2026-10-22 08:00|2026-10-22|2026-10-27
52|剝   |2026-10-28 10:06|2026-10-28|2026-11-03
53|艮   |2026-11-03 12:12|2026-11-04|2026-11-09
54|既濟 |2026-11-09 14:18|2026-11-10|2026-11-15
55|噬嗑 |2026-11-15 16:24|2026-11-16|2026-11-21
56|大過 |2026-11-21 18:30|2026-11-22|2026-11-27
57|坤   |2026-11-27 20:36|2026-11-28|2026-12-03
58|未濟 |2026-12-03 22:42|2026-12-04|2026-12-09
59|蹇   |2026-12-10 00:48|2026-12-10|2026-12-15
60|頤   |2026-12-16 02:54|2026-12-16|2026-12-21
`
    .trim()
    .split("\n")
    .map((line) => {
      const [i, name, start, first, last] = line.split("|").map((s) => s.trim());
      return { index: Number(i) - 1, name, start, first, last };
    });

  it("reproduces the whole 2026 cycle — 60 windows, names, ranks and civil-day runs", () => {
    expect(FIXTURE_2026).toHaveLength(60);
    for (const row of FIXTURE_2026) {
      const firstDay = dayHexagram(civilOf(row.first));
      const lastDay = dayHexagram(civilOf(row.last));
      const dayBefore = dayHexagram(civilOf(shift(row.first, -1)));
      const dayAfter = dayHexagram(civilOf(shift(row.last, +1)));

      // the run belongs to this hexagram end to end …
      expect([row.name, firstDay.index]).toEqual([firstDay.hexagram.nameZh, row.index]);
      expect([row.name, lastDay.index]).toEqual([lastDay.hexagram.nameZh, row.index]);
      // … and does not extend one day either side
      expect(dayBefore.index).not.toBe(row.index);
      expect(dayAfter.index).not.toBe(row.index);
      // sequence attribution comes from the same table
      expect(firstDay.rank).toBe(guaQiSequence[row.index].rank);
      // start instant agrees with the independent solve to within 10 minutes
      expect(minutesBetween(firstDay.windowStartIso, row.start)).toBeLessThan(10);
    }
  });

  it("runs six civil days per hexagram, with a seven-day run about every sixth", () => {
    const runs = FIXTURE_2026.map(
      (r) => Math.round((Date.parse(r.last) - Date.parse(r.first)) / DAY_MS) + 1,
    );
    expect(new Set(runs)).toEqual(new Set([6, 7]));
    // Each window start drifts 2 h 6 m later, so a 7-day run appears whenever the
    // start crosses back past noon — once every ~11.4 windows, i.e. 5 times a cycle.
    expect(runs.filter((n) => n === 7)).toHaveLength(5);
  });

  it("clamps the 60th window (頤) to the next 冬至 rather than overhanging it", () => {
    // 60 × 6.0875 = 365.25 d > the real solstice-to-solstice interval, so the
    // nominal end of window 59 falls past the next 冬至 by ~0.1 d.
    const last = dayHexagram({ year: 2026, month: 12, day: 21 });
    expect(last.index).toBe(59);
    expect(last.hexagram.nameZh).toBe("頤");
    const nominalEnd =
      new Date(last.windowStartIso).getTime() + GUA_QI_STEP_DAYS * DAY_MS;
    expect(new Date(last.windowEndIso).getTime()).toBeLessThan(nominalEnd);
    // and the cycle restarts at 中孚 the following day
    const restart = dayHexagram({ year: 2026, month: 12, day: 22 });
    expect(restart.index).toBe(0);
    expect(restart.hexagram.nameZh).toBe("中孚");
  });

  // ── phase probes: the anchor must not be accidentally right ────────────────
  it("fails both off-by-one phase probes (i+1 → 遯, i-1 → 渙)", () => {
    const i = dayHexagram(ANCHOR).index;
    expect(guaQiSequence[i].hexagram.kingWen).toBe(10); // 履

    // If the cycle were taken to start at 復 (辟) rather than 中孚 (公):
    const plusOne = guaQiSequence[i + 1].hexagram;
    expect(plusOne.nameZh).toBe("遯");
    expect(plusOne.kingWen).toBe(33);
    expect(plusOne.kingWen).not.toBe(10);

    // If it were taken to start one earlier (頤 leading):
    const minusOne = guaQiSequence[i - 1].hexagram;
    expect(minusOne.nameZh).toBe("渙");
    expect(minusOne.kingWen).toBe(59);
    expect(minusOne.kingWen).not.toBe(10);
  });

  it("is robust to the viewer's timezone on the anchor date", () => {
    for (const utcOffsetMinutes of [-480, -300, 0, 60, 330, 480, 600, 780]) {
      const r = dayHexagram(ANCHOR, { utcOffsetMinutes });
      expect([utcOffsetMinutes, r.hexagram.kingWen]).toEqual([utcOffsetMinutes, 10]);
    }
  });

  // ── the documented convention: noon, not midnight, not 子時 ────────────────
  it("uses the noon rule on 2026-07-23, where the alternatives disagree", () => {
    // 履 opens 2026-07-23 00:32 CST — only ~32 minutes into the civil day. The
    // noon (majority-of-day) rule therefore gives the day to 履; the midnight
    // and 子時 rules give it to the previous hexagram, 渙.
    const noon = dayHexagram({ year: 2026, month: 7, day: 23 });
    expect(noon.hexagram.nameZh).toBe("履");
    expect(noon.index).toBe(35);

    const midnight = dayHexagram({ year: 2026, month: 7, day: 23 }, { judgeAtLocalHour: 0 });
    expect(midnight.hexagram.nameZh).toBe("渙");
    expect(midnight.index).toBe(34);

    const zishi = dayHexagram({ year: 2026, month: 7, day: 23 }, { judgeAtLocalHour: -1 });
    expect(zishi.hexagram.nameZh).toBe("渙");

    // …and the mirror case at the other end of the window
    const noon29 = dayHexagram({ year: 2026, month: 7, day: 29 });
    const midnight29 = dayHexagram({ year: 2026, month: 7, day: 29 }, { judgeAtLocalHour: 0 });
    expect(noon29.hexagram.nameZh).toBe("遯");
    expect(midnight29.hexagram.nameZh).toBe("履");
  });

  it("is deterministic — repeated calls are byte-identical", () => {
    for (const d of [ANCHOR, { year: 2026, month: 1, day: 1 }, { year: 2026, month: 12, day: 20 }]) {
      const a = JSON.stringify(dayHexagram(d));
      const b = JSON.stringify(dayHexagram(d));
      expect(a).toBe(b);
    }
    // and independent of the host clock/timezone — inputs are explicit
    expect(dayHexagram(ANCHOR, { utcOffsetMinutes: 480 }).windowStartIso).toBe(
      dayHexagram(ANCHOR, { utcOffsetMinutes: 480 }).windowStartIso,
    );
  });
});

/** "2026-07-25" → { year, month, day }. */
function civilOf(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return { year: y, month: m, day: d };
}
/** Shift an ISO date string by whole days. */
function shift(iso: string, days: number): string {
  return new Date(Date.parse(iso) + days * DAY_MS).toISOString().slice(0, 10);
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. meihuaCast — 梅花易數 年月日時起卦
// ═══════════════════════════════════════════════════════════════════════════

const BRANCH_INDEX = new Map(BRANCHES.map((b) => [b.hanzi, b.index]));

/** The lunar month/day accessors, beyond the repo's pinned lunar-javascript
 *  surface. Probed on 1.7.7; reached through a local cast so the shared
 *  declaration file stays untouched (same pattern as verification/lunarAlmanac.ts). */
interface LunarDateFields {
  getYearInGanZhi(): string;
  getMonth(): number; // negative for a leap month
  getDay(): number;
}

/**
 * The lunar date a caller would supply. Derived here with lunar-javascript —
 * the engine deliberately does not, so this also proves the parameter contract
 * is satisfiable from the app's existing verification-layer dependency.
 * Read at local civil noon, matching the codebase's date-fact convention.
 */
function lunarFor(year: number, month: number, day: number) {
  const lunar = Solar.fromYmdHms(year, month, day, 12, 0, 0).getLunar() as unknown as LunarDateFields;
  const yearBranch = lunar.getYearInGanZhi().charAt(1);
  return {
    yearBranchIndex: BRANCH_INDEX.get(yearBranch)!,
    month: Math.abs(lunar.getMonth()),
    day: lunar.getDay(),
    yearGanZhi: lunar.getYearInGanZhi(),
  };
}

describe("meihuaCast — 梅花易數 年月日時起卦", () => {
  it("reproduces the source text's own worked example, 觀梅占", () => {
    // 「辰年五數，十二月十二數，十七日十七數，共三十四數，除四八三十二，餘二，屬兌，
    //   為上卦，加申時九數，總得四十三數…是為澤火革。」  43 mod 6 = 1 → bottom line.
    const cast = meihuaCast(
      { yearBranchIndex: BRANCH_INDEX.get("辰")!, month: 12, day: 17 },
      BRANCH_INDEX.get("申")!,
    );
    expect(cast.upperSum).toBe(34);
    expect(cast.totalSum).toBe(43);
    expect(cast.upperTrigram.nameZh).toBe("兌");
    expect(cast.lowerTrigram.nameZh).toBe("離");
    expect(cast.hexagram.kingWen).toBe(49); // 澤火革
    expect(cast.hexagram.nameZh).toBe("革");
    expect(cast.movingLine).toBe(1);
    expect(cast.changedHexagram.kingWen).toBe(31); // 澤山咸
  });

  it("casts 天澤履 with moving line 2 for the anchor moment (丙午年六月十二, 子時)", () => {
    const lunar = lunarFor(2026, 7, 25);
    // the lunar date the caller supplies, cross-checked against lunar-javascript
    expect(lunar.yearGanZhi).toBe("丙午");
    expect([lunar.month, lunar.day]).toEqual([6, 12]);
    expect(lunar.yearBranchIndex).toBe(6); // 午

    const cast = meihuaCast(lunar, BRANCH_INDEX.get("子")!);
    expect(cast.upperSum).toBe(25); // 午7 + 月6 + 日12
    expect(cast.totalSum).toBe(26); // + 子1
    expect(cast.upperTrigram.nameZh).toBe("乾"); // 25 mod 8 = 1
    expect(cast.lowerTrigram.nameZh).toBe("兌"); // 26 mod 8 = 2
    expect(cast.hexagram.kingWen).toBe(10);
    expect(cast.hexagram.nameZh).toBe("履");
    expect(cast.movingLine).toBe(2); // 26 mod 6
    expect(cast.changedHexagram.kingWen).toBe(25); // 天雷无妄
    // a cast HAS a moving line; that is exactly what distinguishes it from
    // the 卦氣 calendar fact, which has none.
    expect(cast.hexagram.lines[cast.movingLine - 1]).not.toBe(
      cast.changedHexagram.lines[cast.movingLine - 1],
    );
  });

  it("requires the 子=1 branch numbering — a 0-based numbering fails the cast", () => {
    // The API takes the repo's 0-based branch indices and applies +1 internally.
    // Reproduce the 子=0 arithmetic by hand to show what it would give:
    //   S = 午6 + 月6 + 日12 = 24 → 24 mod 8 = 0 → 8 = 坤
    //   T = 24 + 子0 = 24 → 0 → 8 = 坤  ⇒ 坤為地, King Wen 2, not 履.
    const s = 6 + 6 + 12;
    const wrong = hexagramByTrigrams((s % 8) || 8, ((s + 0) % 8) || 8);
    expect(wrong.kingWen).toBe(2);
    expect(wrong.kingWen).not.toBe(10);

    // whereas the shipped 1-based numbering gives 履
    expect(meihuaCast({ yearBranchIndex: 6, month: 6, day: 12 }, 0).hexagram.kingWen).toBe(10);
  });

  it("changes every day — unlike the 卦氣 calendar, which holds for ~six", () => {
    // 2026-07-25..28 are all 履 under 卦氣 (one window); the cast moves each day.
    const casts = [25, 26, 27, 28].map(
      (d) => meihuaCast(lunarFor(2026, 7, d), BRANCH_INDEX.get("子")!).hexagram,
    );
    expect(casts.map((h) => h.kingWen)).toEqual([10, 49, 21, 32]); // 履 革 噬嗑 恆
    for (const d of [25, 26, 27, 28]) {
      expect(dayHexagram({ year: 2026, month: 7, day: d }).hexagram.kingWen).toBe(10);
    }
  });

  it("is sensitive to the hour — only 子 and 申 cast 履 on the anchor date", () => {
    const lunar = lunarFor(2026, 7, 25);
    const matching = BRANCHES.filter(
      (b) => meihuaCast(lunar, b.index).hexagram.kingWen === 10,
    ).map((b) => b.hanzi);
    expect(matching).toEqual(["子", "申"]);
  });

  it("applies the 0→8 and 0→6 wraps", () => {
    // choose sums divisible by 8 and by 6: 午7 + 月5 + 日12 = 24, + 子1 = 25.
    const a = meihuaCast({ yearBranchIndex: 6, month: 5, day: 12 }, 0);
    expect(a.upperSum).toBe(24);
    expect(a.upperTrigram.nameZh).toBe("坤"); // 24 mod 8 = 0 → 8

    // total divisible by 6: 午7 + 月5 + 日11 = 23, + 巳6 = 29 → not; use 子1 with day 16
    const b = meihuaCast({ yearBranchIndex: 6, month: 5, day: 17 }, 0);
    expect(b.totalSum).toBe(30);
    expect(b.movingLine).toBe(6); // 30 mod 6 = 0 → 6
    expect(b.lowerTrigram.nameZh).toBe("坎"); // 30 mod 8 = 6
  });

  it("rejects out-of-range inputs rather than silently wrapping", () => {
    expect(() => meihuaCast({ yearBranchIndex: 12, month: 6, day: 12 }, 0)).toThrow(RangeError);
    expect(() => meihuaCast({ yearBranchIndex: -1, month: 6, day: 12 }, 0)).toThrow(RangeError);
    expect(() => meihuaCast({ yearBranchIndex: 6, month: 13, day: 12 }, 0)).toThrow(RangeError);
    expect(() => meihuaCast({ yearBranchIndex: 6, month: 0, day: 12 }, 0)).toThrow(RangeError);
    expect(() => meihuaCast({ yearBranchIndex: 6, month: 6, day: 31 }, 0)).toThrow(RangeError);
    expect(() => meihuaCast({ yearBranchIndex: 6, month: 6, day: 12 }, 12)).toThrow(RangeError);
    expect(() => meihuaCast({ yearBranchIndex: 6.5, month: 6, day: 12 }, 0)).toThrow(RangeError);
  });

  it("is deterministic", () => {
    const a = JSON.stringify(meihuaCast({ yearBranchIndex: 6, month: 6, day: 12 }, 0));
    const b = JSON.stringify(meihuaCast({ yearBranchIndex: 6, month: 6, day: 12 }, 0));
    expect(a).toBe(b);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 5. The card's lunar-date keying — no stale data across a date change
// ═══════════════════════════════════════════════════════════════════════════

/**
 * `useMeihuaLunarDate` loads the lunisolar date asynchronously (the lunar
 * library lives in the lazy verification chunk). The bug this pins: if the held
 * value is cleared inside the effect, React commits one render with the
 * PREVIOUS date's value still in state when the date changes — so stepping
 * ‹ / › paints yesterday's 梅花 cast, and yesterday's 烏兔 star, as today's.
 *
 * The fix is render-time selection against the key the value was computed for.
 * There is no DOM harness in this repo, so the hook's render/effect ordering is
 * reproduced by hand below: state SURVIVES a prop change, and render runs
 * before the effect.
 */
describe("梅花 lunar-date keying — a date change must not show the old date's data", () => {
  const JUL25 = { year: 2026, month: 7, day: 25 };
  const JUL26 = { year: 2026, month: 7, day: 26 };
  const value25 = {
    yearBranchIndex: 6,
    month: 6,
    day: 12,
    yearGanZhi: "丙午",
    yearBranchZh: "午",
    isLeapMonth: false,
  };

  it("keys a value to the date it was computed for", () => {
    expect(meihuaLunarKey(JUL25)).toBe("2026-7-25");
    expect(meihuaLunarKey(JUL25)).not.toBe(meihuaLunarKey(JUL26));
    // month/day are not zero-padded, but the tuple is unambiguous either way
    expect(meihuaLunarKey({ year: 2026, month: 1, day: 12 })).not.toBe(
      meihuaLunarKey({ year: 2026, month: 11, day: 2 }),
    );
  });

  it("returns the value for its own date, and null for any other", () => {
    const held = { key: meihuaLunarKey(JUL25), value: value25 };
    expect(selectMeihuaLunar(held, meihuaLunarKey(JUL25))).toBe(value25);
    expect(selectMeihuaLunar(held, meihuaLunarKey(JUL26))).toBeNull();
    expect(selectMeihuaLunar(null, meihuaLunarKey(JUL25))).toBeNull();
    // a date with no lunisolar date at all stays null rather than falling back
    expect(selectMeihuaLunar({ key: meihuaLunarKey(JUL25), value: null }, meihuaLunarKey(JUL25))).toBeNull();
  });

  it("renders null — never the previous date's cast — between the date change and the effect", () => {
    // The hook's lifecycle by hand: state persists across the prop change, and
    // the render that reads it happens BEFORE the effect that replaces it.
    let state: { key: string; value: typeof value25 | null } | null = null;
    const render = (civil: typeof JUL25) => selectMeihuaLunar(state, meihuaLunarKey(civil));

    expect(render(JUL25)).toBeNull(); // first paint: nothing loaded yet
    state = { key: meihuaLunarKey(JUL25), value: value25 }; // effect resolves
    expect(render(JUL25)).toBe(value25); // 25th shows the 25th's date

    // ‹ / › — the date changes. THIS render commits before any effect runs, and
    // it must not show the 25th's data under the 26th.
    expect(render(JUL26)).toBeNull();
    expect(render(JUL26)).not.toBe(value25);

    state = { key: meihuaLunarKey(JUL26), value: { ...value25, day: 13 } }; // effect resolves
    expect(render(JUL26)?.day).toBe(13);
    // and stepping back is symmetric — the 26th's value never shows on the 25th
    expect(render(JUL25)).toBeNull();
  });

  it("a cast built from a stale lunar date would visibly differ — which is why null matters", () => {
    // Not a cosmetic distinction: consecutive days cast different hexagrams, so
    // a stale value is a WRONG reading, not a slightly-late one.
    const a = meihuaCast({ yearBranchIndex: 6, month: 6, day: 12 }, 0);
    const b = meihuaCast({ yearBranchIndex: 6, month: 6, day: 13 }, 0);
    expect(a.hexagram.kingWen).not.toBe(b.hexagram.kingWen);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 6. Engine purity
// ═══════════════════════════════════════════════════════════════════════════

describe("engine purity", () => {
  const source = readFileSync(
    fileURLToPath(new URL("../src/engine/hexagram.ts", import.meta.url)),
    "utf8",
  );
  // Comments are prose about these very rules, so strip them before matching.
  const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

  it("does not import lunar-javascript (that library is confined to verification/)", () => {
    expect(code).not.toMatch(/from\s+["']lunar-javascript["']/);
  });

  it("reads no clock and no randomness", () => {
    expect(code).not.toMatch(/Date\.now\(/);
    expect(code).not.toMatch(/Math\.random\(/);
    expect(code).not.toMatch(/new Date\(\s*\)/);
  });

  it("does not reach the network", () => {
    expect(code).not.toMatch(/\bfetch\s*\(/);
    expect(code).not.toMatch(/XMLHttpRequest|WebSocket/);
  });

  it("hardcodes no solstice table — the solstice comes from the repo's solver", () => {
    expect(code).toMatch(/findSolarLongitudeCrossing\(270/);
  });
});
