import { describe, it, expect } from "vitest";
import { clashSeverityOf, evaluateDecision } from "./decision.ts";
import { ZIPING_DEFAULT } from "./conventions.ts";
import { objectiveById } from "./objectives.ts";
import {
  elementPlain,
  LEAD_AREA_POOR,
  actionGuidance,
  confidencePlain,
  dayMasterArchetype,
  functionalElementsPlain,
  headlineVerdict,
  humanDate,
  humanHourRange,
  isDaytimeHour,
  personalDayReading,
  pillarPalacePlain,
  relativeDay,
  strengthStructurePlain,
  subScoreNarrative,
  verdictBand,
  whyThisDay,
} from "./plainEnglish.ts";
import { STEMS } from "./symbols.ts";
import type { DayMasterAnalysis } from "./bazi.ts";
import { type LifeAreaKey, lifeAreaScores } from "./lifeAreas.ts";

const objective = objectiveById("contract_signing");

function personalReq() {
  return {
    birth: { year: 1990, month: 6, day: 15, hour: 14, minute: 30, tzOffsetMinutes: 480, timeCertainty: "exact" as const },
    sex: "male" as const,
    convention: ZIPING_DEFAULT,
    objective,
    window: { start: { year: 2026, month: 7, day: 1 }, days: 20, tzOffsetMinutes: 480 },
  };
}

describe("plainEnglish (deterministic explanation layer)", () => {
  it("verdictBand thresholds match the classical bands", () => {
    expect(verdictBand(80).key).toBe("excellent");
    expect(verdictBand(60).key).toBe("favourable");
    expect(verdictBand(50).key).toBe("neutral");
    expect(verdictBand(40).key).toBe("caution");
    expect(verdictBand(20).key).toBe("avoid");
  });

  it("verdictBand key↔label pairing is stable (guards UI colour-map drift)", () => {
    const pairs: Record<string, string> = {
      excellent: "Excellent",
      favourable: "Good",
      neutral: "Neutral",
      caution: "Weak",
      avoid: "Avoid",
    };
    for (const score of [90, 72, 65, 58, 50, 45, 38, 32, 10]) {
      const b = verdictBand(score);
      expect(pairs[b.key]).toBe(b.label);
    }
  });

  it("formats hours into a human clock", () => {
    expect(humanHourRange("寅 03:00–05:00")).toBe("3–5am");
    expect(humanHourRange("午 11:00–13:00")).toBe("11am–1pm");
    expect(humanHourRange("酉 17:00–19:00")).toBe("5–7pm");
  });

  it("relativeDay handles today / tomorrow / weeks", () => {
    expect(relativeDay("2026-07-01", "2026-07-01")).toBe("today");
    expect(relativeDay("2026-07-02", "2026-07-01")).toBe("tomorrow");
    expect(relativeDay("2026-07-10", "2026-07-01")).toBe("in 9 days");
    expect(relativeDay("2026-07-22", "2026-07-01")).toBe("in 3 weeks");
  });

  it("humanDate is stable", () => {
    expect(humanDate({ year: 2026, month: 7, day: 14 })).toBe("Tuesday, 14 July 2026");
  });

  it("produces identical strings for identical inputs (determinism)", () => {
    const a = evaluateDecision(personalReq());
    const b = evaluateDecision(personalReq());
    const ra = a.recommendations[0];
    const rb = b.recommendations[0];
    expect(headlineVerdict(ra, objective)).toBe(headlineVerdict(rb, objective));
    expect(whyThisDay(ra).join("|")).toBe(whyThisDay(rb).join("|"));
    expect(JSON.stringify(confidencePlain(ra.confidence, true))).toBe(JSON.stringify(confidencePlain(rb.confidence, true)));
  });

  it("personalized day narrates all four sub-scores; almanac narrates two", () => {
    const personal = evaluateDecision(personalReq());
    expect(subScoreNarrative(personal.recommendations[0], objective.weights)).toHaveLength(4);

    const { birth, sex, ...rest } = personalReq();
    void birth;
    void sex;
    const almanac = evaluateDecision(rest);
    const sub = subScoreNarrative(almanac.recommendations[0], objective.weights);
    expect(sub).toHaveLength(2);
    // renormalized weights sum to 100%
    expect(sub[0].weightPct + sub[1].weightPct).toBe(100);
  });

  it("the headline and the action guidance never contradict each other on a 四絕 eve", () => {
    // 2024-02-03 is a 四絕 day (eve of 立春). A wedding there is 大事勿用.
    const res = evaluateDecision({
      convention: ZIPING_DEFAULT,
      objective: objectiveById("wedding_marriage"),
      window: { start: { year: 2024, month: 2, day: 3 }, days: 1, tzOffsetMinutes: 480 },
    });
    const rec = res.allDays[0];
    const head = headlineVerdict(rec, objectiveById("wedding_marriage"));
    expect(head).toMatch(/大事勿用|Best avoided|四絕/);
    expect(head).not.toMatch(/excellent/i);
    const guide = actionGuidance(rec, objectiveById("wedding_marriage")).join(" ");
    expect(guide).toMatch(/season-pivot|hold off/i);
    expect(guide).not.toMatch(/green light/i); // no caution-then-green-light contradiction
  });

  it("does not cheer (best window / helpful-people) on a personalized taboo day", () => {
    // 2026 is 丙午 → every 子 day is 歲破. Such a day can still clear 45, but must
    // never pair an "avoid" headline with upbeat reasoning.
    const res = evaluateDecision({
      birth: { year: 1990, month: 6, day: 15, hour: 14, minute: 30, tzOffsetMinutes: 480, timeCertainty: "exact" },
      sex: "male",
      convention: ZIPING_DEFAULT,
      objective: objectiveById("travel"),
      window: { start: { year: 2026, month: 7, day: 1 }, days: 31, tzOffsetMinutes: 480 },
    });
    const day = res.allDays.find((d) => d.rulesFired.some((r) => r.code === "year_break"));
    expect(day).toBeDefined();
    const bullets = whyThisDay(day!).join(" ");
    expect(bullets).toMatch(/歲破/);
    expect(bullets).not.toMatch(/Best window|helpful-people|reinforces your/);
    const guide = actionGuidance(day!, objectiveById("travel")).join(" ");
    expect(guide).not.toMatch(/strongest hours/);
    expect(guide).not.toMatch(/green light/);
  });

  it("daytime classification: 午 hour is daytime, 子 hour is not", () => {
    expect(isDaytimeHour(6)).toBe(true); // 午 11:00–13:00
    expect(isDaytimeHour(0)).toBe(false); // 子 23:00–01:00
    expect(isDaytimeHour(2)).toBe(false); // 寅 03:00–05:00
    expect(isDaytimeHour(9)).toBe(true); // 酉 17:00–19:00
  });

  it("headlineVerdict reads as plain English", () => {
    const res = evaluateDecision(personalReq());
    const h = headlineVerdict(res.recommendations[0], objective);
    expect(h).toMatch(/day to sign and close deals|avoid/i);
    expect(h).not.toMatch(/[一-鿿]/); // no raw hanzi in the headline
  });
});

// Doctrine tests for the chart-depth copy: interpretation from the classical
// tradition, never prediction. "will happen"-style phrasing is forbidden.
const FORBIDDEN_PREDICTIVE = /\bwill\b|will happen|going to happen|guarantee|predicts?\b|destined|fated to/i;

describe("day-master archetypes (classical imagery, non-predictive)", () => {
  it("all 10 stems produce distinct, non-empty copy without predictive phrasing", () => {
    const paragraphs = new Set<string>();
    const names = new Set<string>();
    for (let i = 0; i < 10; i++) {
      const a = dayMasterArchetype(i);
      expect(a.paragraph.length).toBeGreaterThan(80);
      expect(a.name.length).toBeGreaterThan(0);
      expect(a.hanzi).toBe(STEMS[i].hanzi);
      expect(a.title).toContain(STEMS[i].hanzi);
      // Honest framing: labelled as imagery/tradition, and never predictive.
      expect(a.paragraph).toMatch(/classical imagery|tradition/i);
      expect(a.paragraph).not.toMatch(FORBIDDEN_PREDICTIVE);
      paragraphs.add(a.paragraph);
      names.add(a.name);
    }
    expect(paragraphs.size).toBe(10);
    expect(names.size).toBe(10);
  });

  it("is deterministic — identical inputs, identical strings", () => {
    expect(dayMasterArchetype(4)).toEqual(dayMasterArchetype(4));
  });
});

describe("strength + structure line", () => {
  const dmOf = (structure: DayMasterAnalysis["structure"], strength: DayMasterAnalysis["strength"]) =>
    ({ structure, strength }) as DayMasterAnalysis;

  it("covers all strengths and structures with distinct, honest, non-predictive lines", () => {
    const lines = [
      strengthStructurePlain(dmOf("normal", "strong")),
      strengthStructurePlain(dmOf("normal", "balanced")),
      strengthStructurePlain(dmOf("normal", "weak")),
      strengthStructurePlain(dmOf("follow", "weak")),
      strengthStructurePlain(dmOf("dominant", "strong")),
    ];
    expect(new Set(lines).size).toBe(5);
    for (const l of lines) {
      expect(l.length).toBeGreaterThan(40);
      expect(l).not.toMatch(FORBIDDEN_PREDICTIVE);
    }
    // Special structures get their own honest lines, named and flagged as school-dependent.
    expect(lines[3]).toMatch(/從格/);
    expect(lines[3]).toMatch(/school-dependent/);
    expect(lines[4]).toMatch(/專旺/);
    expect(lines[4]).toMatch(/school-dependent/);
  });
});

describe("pillar palaces (Zi Ping mapping, phrased honestly)", () => {
  it("maps the four positions to the standard palaces with distinct labels", () => {
    expect(pillarPalacePlain("year").label).toMatch(/ancestry|roots/i);
    expect(pillarPalacePlain("month").label).toMatch(/parents|career/i);
    expect(pillarPalacePlain("day").label).toMatch(/self|spouse/i);
    expect(pillarPalacePlain("hour").label).toMatch(/children|later life/i);
    const labels = (["year", "month", "day", "hour"] as const).map((p) => pillarPalacePlain(p).label);
    expect(new Set(labels).size).toBe(4);
    for (const p of ["year", "month", "day", "hour"] as const) {
      const pal = pillarPalacePlain(p);
      // Honest framing: the note names the tradition rather than asserting fact.
      expect(pal.note).toMatch(/Zi Ping/);
      expect(pal.note).not.toMatch(FORBIDDEN_PREDICTIVE);
    }
  });
});

// ── The person-first daily reading ───────────────────────────────────────────

describe("personalDayReading (person-first daily prose)", () => {
  const reqFor = (birthDay: number, days: number) => ({
    birth: { year: 1990, month: 6, day: birthDay, hour: 14, minute: 30, tzOffsetMinutes: 480, timeCertainty: "exact" as const },
    sex: "male" as const,
    convention: ZIPING_DEFAULT,
    objective,
    window: { start: { year: 2026, month: 7, day: 1 }, days, tzOffsetMinutes: 480 },
    options: { sweeps: false },
  });

  // One personalized 60-day window (a full sexagenary cycle: every day 干支
  // appears once), shared across the assertions below.
  const res60 = evaluateDecision(reqFor(15, 60));
  const chart = res60.subjectChart!;
  const readingOf = (i: number, leadArea?: LifeAreaKey) =>
    personalDayReading({ chart, rec: res60.allDays[i], leadArea });

  it("all 10 day-master stems produce distinct openings", () => {
    const openings = new Set<string>();
    const stems = new Set<number>();
    for (let i = 0; i < 10; i++) {
      // Consecutive birth days → consecutive day stems (all 10 of 甲..癸).
      const res = evaluateDecision(reqFor(15 + i, 1));
      const dm = res.subjectChart!.dayMaster.dayMaster.index;
      stems.add(dm);
      const r = personalDayReading({ chart: res.subjectChart!, rec: res.allDays[0] });
      expect(r.paragraphs[0]).toContain(dayMasterArchetype(dm).name);
      // Calendar-taboo days deliberately do NOT name the chart in the headline
      // (歲破/四離/四絕 clash the calendar for everyone — see the attribution
      // fix); every other day leads with the person's archetype.
      const taboo = res.allDays[0].rulesFired.some((x) =>
        ["year_break", "four_departure", "four_severance"].includes(x.code),
      );
      if (taboo) expect(r.headline).toMatch(/calendar itself|pushes against/);
      else expect(r.headline).toContain(dayMasterArchetype(dm).name);
      expect(r.headline).not.toMatch(/[一-鿿]/); // no raw hanzi in the headline
      openings.add(r.paragraphs[0]);
    }
    expect(stems.size).toBe(10);
    expect(openings.size).toBe(10);
  });

  it("favourable vs unfavourable days read differently", () => {
    const fitOf = (i: number) => {
      const rules = res60.allDays[i].rulesFired;
      const pos = rules.some((r) => (r.code === "element_stem" || r.code === "element_branch") && r.effect > 0);
      const neg = rules.some((r) => (r.code === "element_stem" || r.code === "element_branch") && r.effect < 0);
      return pos && neg ? "mixed" : pos ? "helps" : neg ? "strains" : "neutral";
    };
    const helpsIdx = res60.allDays.findIndex((_, i) => fitOf(i) === "helps");
    const strainsIdx = res60.allDays.findIndex((_, i) => fitOf(i) === "strains");
    expect(helpsIdx).toBeGreaterThanOrEqual(0);
    expect(strainsIdx).toBeGreaterThanOrEqual(0);
    const good = readingOf(helpsIdx);
    const bad = readingOf(strainsIdx);
    // "sit(s) well" — the split phrasing says "both … sit well" when the stem
    // and branch elements differ but both favour the chart.
    expect(good.paragraphs[0]).toMatch(/sits? well with your chart/);
    expect(bad.paragraphs[0]).toMatch(/runs? against your chart/);
    expect(good.paragraphs[0]).not.toBe(bad.paragraphs[0]);
  });

  it("names each element with ITS OWN direction on split days — never the branch's strain under the stem's name", () => {
    // Find a day where the stem and branch element rules disagree in sign.
    const signOf = (i: number, code: string) => {
      const r = res60.allDays[i].rulesFired.find((x) => x.code === code);
      return r ? Math.sign(r.effect) : 0;
    };
    const mixedIdx = res60.allDays.findIndex(
      (_, i) => signOf(i, "element_stem") * signOf(i, "element_branch") === -1,
    );
    expect(mixedIdx).toBeGreaterThanOrEqual(0);
    const rec = res60.allDays[mixedIdx];
    const p0 = readingOf(mixedIdx).paragraphs[0];
    const stemEl = elementPlain(rec.tongshu.dayGanzhi.stem.phase);
    const branchEl = elementPlain(rec.tongshu.dayGanzhi.branch.phase);
    // Both elements are named, each with its own direction, and the old netted
    // "cuts both ways" (which blamed one element for both) is gone.
    expect(p0).toContain(`${signOf(mixedIdx, "element_stem") > 0 ? stemEl + " stem sits well" : stemEl + " stem runs against"}`);
    expect(p0).toContain(branchEl);
    expect(p0).not.toMatch(/cuts both ways/);
  });

  it("taboo-only days blame the calendar, severe personal clashes blame the chart", () => {
    const isTaboo = (i: number) =>
      res60.allDays[i].rulesFired.some((x) => ["year_break", "four_departure", "four_severance"].includes(x.code));
    const severityOf = (i: number) => clashSeverityOf(res60.allDays[i].shenShaTags);
    const tabooOnly = res60.allDays.findIndex((_, i) => isTaboo(i) && severityOf(i) !== "severe");
    const severeOnly = res60.allDays.findIndex((_, i) => !isTaboo(i) && severityOf(i) === "severe");
    expect(tabooOnly).toBeGreaterThanOrEqual(0);
    expect(severeOnly).toBeGreaterThanOrEqual(0);
    // 歲破/四離/四絕 apply to everyone — the headline must not personalize them.
    expect(readingOf(tabooOnly).headline).toContain("calendar itself");
    expect(readingOf(tabooOnly).headline).not.toContain("pushes against your");
    expect(readingOf(severeOnly).headline).toContain("pushes against your");
  });

  it("never sells a 'strongest workable window' under a keep-it-light or sit-out headline", () => {
    for (let i = 0; i < res60.allDays.length; i++) {
      const r = readingOf(i);
      if (!r.bestHourLine) continue;
      const downbeatHeadline = /keep it light|sit out|best avoided/.test(r.headline);
      if (downbeatHeadline) expect(r.bestHourLine).toContain("least-bad");
      else expect(r.bestHourLine).toContain("strongest workable");
    }
  });

  it("the leans-your-way priority sentence never splices an area reason after it", () => {
    for (let i = 0; i < res60.allDays.length; i++) {
      for (const area of ["career", "wealth", "relationship", "health"] as LifeAreaKey[]) {
        const r = personalDayReading({ chart, rec: res60.allDays[i], leadArea: area });
        const m = r.paragraphs[1]?.match(/the day leans your way[^.]*\./);
        if (m) expect(m[0]).toMatch(/the day leans your way( there)?\./);
      }
    }
  });

  it("a clash day always carries a caution", () => {
    const clashDays = res60.allDays
      .map((d, i) => ({ d, i }))
      .filter(({ d }) => d.shenShaTags.some((t) => t.code.startsWith("clash_")));
    expect(clashDays.length).toBeGreaterThan(0);
    for (const { d, i } of clashDays) {
      const r = readingOf(i);
      expect(r.cautions.length).toBeGreaterThanOrEqual(1);
      expect(r.cautions.length).toBeLessThanOrEqual(2);
      // When no stronger calendar taboo shares the day, the clash itself is named.
      const taboo = d.rulesFired.some((x) => x.code === "year_break" || x.code === "four_departure" || x.code === "four_severance");
      if (!taboo) expect(r.cautions.join(" ")).toMatch(/沖|birth-year animal/);
    }
  });

  it("leadArea present vs absent changes exactly the priority sentence", () => {
    for (const area of ["career", "wealth", "relationship", "health"] as const) {
      const base = readingOf(0);
      const led = readingOf(0, area);
      expect(led.headline).toBe(base.headline);
      expect(led.cautions).toEqual(base.cautions);
      expect(led.bestHourLine).toBe(base.bestHourLine);
      expect(led.paragraphs[0]).toBe(base.paragraphs[0]);
      expect(led.paragraphs[1].startsWith(base.paragraphs[1])).toBe(true);
      expect(led.paragraphs[1].length).toBeGreaterThan(base.paragraphs[1].length);
      expect(led.paragraphs[1]).toMatch(/the area you've said matters most right now/);
    }
  });

  it("a poor day in the leadArea is stated as poor — no upbeat words (pinned rule)", () => {
    // Pinned rule: leadArea score < LEAD_AREA_POOR (45) → the priority sentence
    // says "runs weak" and carries none of the upbeat vocabulary.
    const UPBEAT = /leans your way|good|strong|favourable|flows?|serves|opens?/i;
    let checked = 0;
    for (let i = 0; i < res60.allDays.length; i++) {
      const areas = lifeAreaScores(chart, res60.allDays[i].tongshu.dayGanzhi).areas;
      for (const a of areas) {
        if (a.score >= LEAD_AREA_POOR) continue;
        const base = readingOf(i);
        const led = readingOf(i, a.key);
        const leadSentence = led.paragraphs[1].slice(base.paragraphs[1].length).trim();
        expect(leadSentence).toMatch(/runs weak/);
        expect(leadSentence).not.toMatch(UPBEAT);
        checked++;
      }
    }
    // The 60-day cycle must contain at least one genuinely poor area-day
    // (e.g. a day-branch clash shaking the spouse palace).
    expect(checked).toBeGreaterThan(0);
  });

  it("never uses predictive phrasing, in any composition", () => {
    for (let i = 0; i < res60.allDays.length; i++) {
      for (const area of [undefined, "career", "wealth", "relationship", "health"] as const) {
        const r = readingOf(i, area);
        const all = [r.headline, ...r.paragraphs, ...r.cautions, r.bestHourLine ?? ""].join(" ");
        expect(all).not.toMatch(FORBIDDEN_PREDICTIVE);
      }
    }
  });

  it("keeps the reading short: 2 paragraphs, ≤2 cautions, one hour line", () => {
    for (let i = 0; i < res60.allDays.length; i++) {
      const r = readingOf(i, "career");
      expect(r.paragraphs.length).toBeLessThanOrEqual(3);
      expect(r.paragraphs.length).toBeGreaterThanOrEqual(2);
      expect(r.cautions.length).toBeLessThanOrEqual(2);
      if (r.bestHourLine) expect(r.bestHourLine).toMatch(/window is \d/);
    }
  });

  it("the hour line never sells hours on a taboo / severe-clash day", () => {
    const steered = res60.allDays
      .map((d, i) => ({ d, i }))
      .filter(
        ({ d }) =>
          d.rulesFired.some((x) => x.code === "year_break" || x.code === "four_departure" || x.code === "four_severance") ||
          d.shenShaTags.some((t) => t.code === "clash_day" || t.code === "clash_hour"),
      );
    expect(steered.length).toBeGreaterThan(0);
    for (const { i } of steered) {
      const r = readingOf(i);
      if (r.bestHourLine) {
        expect(r.bestHourLine).toMatch(/least-bad window/);
        expect(r.bestHourLine).not.toMatch(/strongest workable/);
      }
      expect(r.headline).toMatch(/pushes against|keep it light|sit out/);
    }
  });

  it("is deterministic — identical inputs, identical prose", () => {
    const again = evaluateDecision(reqFor(15, 60));
    for (const i of [0, 7, 23, 41, 59]) {
      const a = personalDayReading({ chart, rec: res60.allDays[i], leadArea: "wealth" });
      const b = personalDayReading({ chart: again.subjectChart!, rec: again.allDays[i], leadArea: "wealth" });
      expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    }
  });
});

describe("functional element map", () => {
  it("narrates all five functional roles for a real chart, elements matching the engine", () => {
    const res = evaluateDecision(personalReq());
    const dm = res.subjectChart!.dayMaster;
    const map = functionalElementsPlain(dm);
    expect(map).toHaveLength(5);
    expect(map.map((f) => f.group)).toEqual(["wealth", "officer", "output", "resource", "companion"]);
    for (const f of map) {
      expect(f.element).toBe(dm.functional[f.group]);
      expect(f.sentence).toMatch(new RegExp(`for you is ${f.element[0].toUpperCase()}${f.element.slice(1)}`));
      expect(f.sentence).not.toMatch(FORBIDDEN_PREDICTIVE);
      // Valence agrees with the useful-element sets — never contradicts them.
      if (f.valence === "helps") expect(dm.favorableElements).toContain(f.element);
      if (f.valence === "strains") expect(dm.unfavorableElements).toContain(f.element);
    }
    const wealth = map.find((f) => f.group === "wealth")!;
    expect(wealth.sentence).toMatch(/money themes/);
  });
});
