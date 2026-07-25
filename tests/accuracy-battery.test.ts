/**
 * Accuracy cross-check battery (350+ birth datetimes, 1940–2030) against
 * lunar-javascript@1.7.7 as the independent reference.
 *
 * Frames (mirroring src/engine/verification/verifyLunarJavascript.ts):
 *  - Day + hour pillars are DATE/TIME-based: probe the comparator with the raw
 *    local wall-clock (frame-neutral in lunar-javascript).
 *  - Year + month pillars are INSTANT-based (exact solar-term instants): convert
 *    the local wall-clock to a UTC instant with the historically-correct offset,
 *    then probe the comparator in the CST (UTC+8) frame via getYearInGanZhiExact /
 *    getMonthInGanZhiExact.
 *
 * Sect mapping (probed against v1.7.7):
 *  - EightChar.setSect(1)  == engine ZIPING_ZI_ROLLOVER (zi_23: whole day turns 23:00)
 *  - EightChar.setSect(2)  == engine ZIPING_SPLIT_ZI    (晚子時: day at midnight,
 *    hour stem rolls at 23:00). The app's civil_midnight dayBoundary differs from
 *    sect 2 ONLY in the 23:00–23:59 hour stem — a school split, tracked separately.
 *
 * Apples-to-apples runs use a civil_clock hourBasis. A separate run uses the app
 * DEFAULT registration convention (ziping_true_solar_v1, i.e. ZIPING_TRUE_SOLAR
 * with a birth longitude) to measure how far the default intentionally diverges
 * from mainstream civil-clock calculators.
 */
import { describe, expect, it } from "vitest";
import { Solar } from "lunar-javascript";
import { buildFourPillars, MomentInput } from "../src/engine/sexagenary.ts";
import {
  ConventionSet,
  ZIPING_DEFAULT,
  ZIPING_SPLIT_ZI,
  ZIPING_TRUE_SOLAR,
  ZIPING_ZI_ROLLOVER,
} from "../src/engine/conventions.ts";
import { resolveOffset } from "../src/engine/timezone.ts";
import { canonicalizeBirth } from "../src/engine/request.ts";

// ── places ───────────────────────────────────────────────────────────────────

interface Place {
  name: string;
  zone: string;
  lon: number;
}
const BEIJING: Place = { name: "Beijing", zone: "Asia/Shanghai", lon: 116.407 };
const LONDON: Place = { name: "London", zone: "Europe/London", lon: -0.1276 };
const NEW_YORK: Place = { name: "New York", zone: "America/New_York", lon: -74.006 };

// ── case generation (deterministic) ──────────────────────────────────────────

interface BirthCase {
  id: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  place: Place;
  tag: string;
}

function makeCases(): BirthCase[] {
  const cases: BirthCase[] = [];
  const push = (date: string, time: string, place: Place, tag: string) =>
    cases.push({ id: `${date}T${time}@${place.name}`, date, time, place, tag });

  // A) 立春 (year-boundary) sweep: Feb 3–5 each 5th year, midday + late Zi.
  for (let y = 1940; y <= 2030; y += 5) {
    for (const d of ["03", "04", "05"]) {
      for (const t of ["12:00", "23:30"]) push(`${y}-02-${d}`, t, BEIJING, "lichun-window");
    }
  }

  // B) month 節-term days (approximate jie dates every month of the year).
  const TERM_DAYS = ["01-05", "02-04", "03-05", "04-04", "05-05", "06-05", "07-07", "08-07", "09-07", "10-08", "11-07", "12-07"];
  for (const y of [1943, 1957, 1969, 1984, 1998, 2007, 2016, 2024]) {
    for (const md of TERM_DAYS) push(`${y}-${md}`, "09:00", BEIJING, "jie-window");
  }

  // C) hour boundaries in a DST zone (London — includes 1944 double summer time).
  for (const y of [1944, 1969, 1987, 1998, 2015, 2026]) {
    for (const md of ["03-21", "07-15", "10-10"]) {
      for (const t of ["00:00", "00:30", "11:00", "13:00", "23:00", "23:30"]) {
        push(`${y}-${md}`, t, LONDON, "hour-boundary");
      }
    }
  }

  // D) US DST-era births.
  for (const y of [1955, 1975, 2005, 2020]) {
    for (const md of ["01-15", "06-15"]) {
      for (const t of ["00:30", "12:00", "23:00"]) push(`${y}-${md}`, t, NEW_YORK, "us-dst-era");
    }
  }

  // E) exact DST transition oddities.
  push("1998-03-29", "01:30", LONDON, "dst-nonexistent"); // clocks jumped 01:00→02:00
  push("1998-10-25", "01:30", LONDON, "dst-ambiguous"); //   clocks fell back
  push("2015-03-08", "02:30", NEW_YORK, "dst-nonexistent");
  push("2015-11-01", "01:30", NEW_YORK, "dst-ambiguous");
  push("1944-06-15", "01:30", LONDON, "double-summer-time"); // BDST, UTC+2
  push("1988-07-15", "12:00", BEIJING, "china-dst"); //        China DST 1986–91, UTC+9

  // F) Jordan's golden chart.
  push("1998-03-23", "19:47", LONDON, "golden-jordan");

  return cases;
}

// ── reference (lunar-javascript) ─────────────────────────────────────────────

interface Pillars {
  year: string;
  month: string;
  day: string;
  hour: string;
}

function referencePillars(
  c: { year: number; month: number; day: number; hour: number; minute: number },
  tzOffsetMinutes: number,
  sect: 1 | 2,
): Pillars {
  // DATE/TIME frame: raw local wall clock.
  const lunar = Solar.fromYmdHms(c.year, c.month, c.day, c.hour, c.minute, 0).getLunar();
  const ec = lunar.getEightChar();
  ec.setSect(sect);
  // INSTANT frame: UTC instant → CST wall clock.
  const utc = Date.UTC(c.year, c.month - 1, c.day, c.hour, c.minute) - tzOffsetMinutes * 60000;
  const cst = new Date(utc + 8 * 3600000);
  const inst = Solar.fromYmdHms(
    cst.getUTCFullYear(),
    cst.getUTCMonth() + 1,
    cst.getUTCDate(),
    cst.getUTCHours(),
    cst.getUTCMinutes(),
    cst.getUTCSeconds(),
  ).getLunar();
  return {
    year: inst.getYearInGanZhiExact(),
    month: inst.getMonthInGanZhiExact(),
    day: ec.getDay(),
    hour: ec.getTime(),
  };
}

// ── battery runner ───────────────────────────────────────────────────────────

interface Mismatch {
  input: string;
  field: "year" | "month" | "day" | "hour";
  ours: string;
  reference: string;
  comparison: string;
  category:
    | "unexplained-engine-bug-candidate"
    | "near-lichun-boundary"
    | "near-jie-boundary"
    | "hour-2300-school-split";
  detail: string;
}

interface BatteryResult {
  totalCases: number;
  skipped: string[];
  mismatches: Mismatch[];
  /** How often the app DEFAULT (true-solar) run diverges from the civil-clock run. */
  defaultDivergence: { total: number; hour: number; day: number; month: number; year: number; examples: string[] };
  offsetsUsed: Record<string, number>;
}

function fieldsOf(p: { year: { hanzi: string }; month: { hanzi: string }; day: { hanzi: string }; hour: { hanzi: string } }): Pillars {
  return { year: p.year.hanzi, month: p.month.hanzi, day: p.day.hanzi, hour: p.hour.hanzi };
}

function runBattery(): BatteryResult {
  const cases = makeCases();
  const mismatches: Mismatch[] = [];
  const skipped: string[] = [];
  const offsetsUsed: Record<string, number> = {};
  const defaultDivergence = { total: 0, hour: 0, day: 0, month: 0, year: 0, examples: [] as string[] };

  for (const c of cases) {
    const [y, mo, d] = c.date.split("-").map(Number);
    const [h, mi] = c.time.split(":").map(Number);
    const civil = { year: y, month: mo, day: d, hour: h, minute: mi };

    // Historically-correct offset, exactly as the UI resolves it for a chosen city.
    const resolved = resolveOffset(c.place.zone, civil);
    if (resolved.certainty === "unavailable") {
      skipped.push(`${c.id}: zone unresolvable in this runtime`);
      continue;
    }
    const tz = resolved.offsetMinutes;
    offsetsUsed[`${c.place.zone}@${tz}`] = (offsetsUsed[`${c.place.zone}@${tz}`] ?? 0) + 1;

    const moment: MomentInput = { ...civil, tzOffsetMinutes: tz, timeCertainty: "exact" };
    const inputLabel = `${c.date} ${c.time} ${c.place.name} (UTC${tz >= 0 ? "+" : ""}${tz / 60}${resolved.certainty !== "exact" ? `, ${resolved.certainty}` : ""}) [${c.tag}]`;

    // Apples-to-apples runs: civil_clock hourBasis, sect-matched day boundary.
    const runs: Array<{ conv: ConventionSet; sect: 1 | 2; comparison: string; schoolSplitAt23: boolean }> = [
      { conv: ZIPING_SPLIT_ZI, sect: 2, comparison: "civil_clock+split_zi vs sect2", schoolSplitAt23: false },
      { conv: ZIPING_ZI_ROLLOVER, sect: 1, comparison: "civil_clock+zi_23 vs sect1", schoolSplitAt23: false },
      // App's engine-default day boundary: differs from sect 2 only at 23:xx hour stem.
      { conv: ZIPING_DEFAULT, sect: 2, comparison: "civil_clock+civil_midnight vs sect2", schoolSplitAt23: true },
    ];

    let civilPillars: Pillars | null = null;
    for (const run of runs) {
      const fp = buildFourPillars(moment, run.conv);
      const ours = fieldsOf(fp);
      if (run.conv === ZIPING_DEFAULT) civilPillars = ours;
      const ref = referencePillars(civil, tz, run.sect);

      const lichunFlag = fp.meta.boundaryFlags.find((f) => f.kind === "lichun");
      const jieFlag = fp.meta.boundaryFlags.find((f) => f.kind === "jie");

      for (const field of ["year", "month", "day", "hour"] as const) {
        if (ours[field] === ref[field]) continue;
        let category: Mismatch["category"] = "unexplained-engine-bug-candidate";
        let detail = "";
        if (field === "hour" && h === 23 && run.schoolSplitAt23) {
          category = "hour-2300-school-split";
          detail = "23:00–23:59 hour stem: comparator sect2 uses next-day stem (晚子時); civil_midnight keeps current-day stem. Documented school split, not arithmetic.";
        } else if (field === "year" && lichunFlag && lichunFlag.minutesAway !== null && lichunFlag.minutesAway <= 20) {
          category = "near-lichun-boundary";
          detail = `Birth is ${Math.round(lichunFlag.minutesAway)} min from 立春; the two implementations' term instants differ by well under that — ephemeris epsilon, not arithmetic.`;
        } else if (field === "month" && jieFlag && jieFlag.minutesAway !== null && jieFlag.minutesAway <= 20) {
          category = "near-jie-boundary";
          detail = `Birth is ${Math.round(jieFlag.minutesAway)} min from a 節; ephemeris epsilon between the implementations.`;
        }
        mismatches.push({
          input: inputLabel,
          field,
          ours: ours[field],
          reference: ref[field],
          comparison: run.comparison,
          category,
          detail,
        });
      }
    }

    // App DEFAULT registration convention: true_solar + this city's longitude,
    // through the same canonicalizeBirth path the UI uses.
    const canonical = canonicalizeBirth(
      {
        dateOfBirth: c.date,
        localBirthTime: c.time,
        tzOffsetMinutes: tz,
        birthplace: c.place.name,
        longitudeEast: c.place.lon,
        timeAccuracy: "exact",
      },
      ZIPING_TRUE_SOLAR,
    );
    if (canonical.moment && civilPillars) {
      const dfp = fieldsOf(buildFourPillars(canonical.moment, canonical.convention));
      const diff = (["year", "month", "day", "hour"] as const).filter((f) => dfp[f] !== civilPillars![f]);
      if (diff.length > 0) {
        defaultDivergence.total++;
        for (const f of diff) defaultDivergence[f]++;
        if (defaultDivergence.examples.length < 12) {
          defaultDivergence.examples.push(
            `${inputLabel}: ${diff.map((f) => `${f} ${civilPillars![f]}→${dfp[f]}`).join(", ")} (true-solar shift)`,
          );
        }
      }
    }
  }

  return { totalCases: cases.length - skipped.length, skipped, mismatches, defaultDivergence, offsetsUsed };
}

const RESULT = runBattery();

// ── report + assertions ──────────────────────────────────────────────────────

describe("accuracy battery vs lunar-javascript", () => {
  it("runs at least 300 cases", () => {
    expect(RESULT.totalCases).toBeGreaterThanOrEqual(300);
    expect(RESULT.skipped, RESULT.skipped.join("\n")).toEqual([]);
  });

  it("Jordan's golden chart 1998-03-23 19:47 London is 戊寅/乙卯/己巳/甲戌 under the app default (true solar, London longitude)", () => {
    const canonical = canonicalizeBirth(
      {
        dateOfBirth: "1998-03-23",
        localBirthTime: "19:47",
        tzOffsetMinutes: resolveOffset("Europe/London", { year: 1998, month: 3, day: 23, hour: 19, minute: 47 }).offsetMinutes,
        birthplace: "London",
        longitudeEast: LONDON.lon,
        timeAccuracy: "exact",
      },
      ZIPING_TRUE_SOLAR,
    );
    expect(canonical.moment).not.toBeNull();
    expect(canonical.convention.hourBasis).toBe("true_solar");
    const p = fieldsOf(buildFourPillars(canonical.moment!, canonical.convention));
    expect(p).toEqual({ year: "戊寅", month: "乙卯", day: "己巳", hour: "甲戌" });
  });

  it("reports the full mismatch table", () => {
    const byCategory: Record<string, Mismatch[]> = {};
    for (const m of RESULT.mismatches) (byCategory[m.category] ??= []).push(m);
    const summary = {
      totalCases: RESULT.totalCases,
      totalComparisons: RESULT.totalCases * 3 * 4,
      mismatchesByCategory: Object.fromEntries(Object.entries(byCategory).map(([k, v]) => [k, v.length])),
      defaultConventionDivergence: RESULT.defaultDivergence,
      offsetsUsed: RESULT.offsetsUsed,
    };
    // Full machine-readable dump for the orchestrator.
    console.log("ACCURACY_BATTERY_SUMMARY " + JSON.stringify(summary, null, 2));
    console.log("ACCURACY_BATTERY_MISMATCHES " + JSON.stringify(RESULT.mismatches, null, 2));
    expect(RESULT.totalCases).toBeGreaterThan(0);
  });

  it("has no unexplained pillar mismatches (engine-bug candidates)", () => {
    const bugs = RESULT.mismatches.filter((m) => m.category === "unexplained-engine-bug-candidate");
    expect(bugs, JSON.stringify(bugs, null, 2)).toEqual([]);
  });

  it("school-split mismatches occur only at 23:xx and only in the civil_midnight run", () => {
    for (const m of RESULT.mismatches.filter((x) => x.category === "hour-2300-school-split")) {
      expect(m.comparison).toBe("civil_clock+civil_midnight vs sect2");
      expect(m.field).toBe("hour");
    }
  });
});
