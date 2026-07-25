import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MomentInput, buildFourPillars } from "../src/engine/sexagenary.ts";
import { buildBaziChart } from "../src/engine/bazi.ts";
import { ZIPING_DEFAULT } from "../src/engine/conventions.ts";
import { evaluateDecision } from "../src/engine/decision.ts";
import { objectiveById } from "../src/engine/objectives.ts";
import { AREA_META, lifeAreaScores } from "../src/engine/lifeAreas.ts";
import { ganZhiFromIndex } from "../src/engine/symbols.ts";
import type { LifeAreaKey } from "../src/engine/lifeAreas.ts";
import { PRIORITY_FIT_NOTE, PriorityFitArea, formatFitDelta, priorityFit } from "../src/ui/priorityFit.ts";

const dayKey = (d: { civil: { year: number; month: number; day: number } }) => `${d.civil.year}-${d.civil.month}-${d.civil.day}`;

const areas = (career: number, wealth: number, relationship: number, health: number): PriorityFitArea[] => [
  { key: "career", label: "Career", score: career },
  { key: "wealth", label: "Wealth", score: wealth },
  { key: "relationship", label: "Relationship", score: relationship },
  { key: "health", label: "Wellbeing", score: health },
];

describe("priorityFit — the formula", () => {
  it("is positive when the day is strong in the top-ranked area", () => {
    const fit = priorityFit(["career", "wealth", "relationship", "health"], areas(90, 50, 50, 50))!;
    expect(fit).not.toBeNull();
    expect(fit.delta).toBeGreaterThan(0);
    expect(fit.leadArea).toBe("career");
    expect(fit.leadLabel).toBe("Career");
  });

  it("is NOT positive when the strength sits in an area the user did not rank", () => {
    // Only career ranked; the day's strength is entirely in health.
    const fit = priorityFit(["career"], areas(50, 50, 50, 90))!;
    expect(fit.delta).toBeLessThan(0);
  });

  it("is ~zero for a day that is uniformly strong — good everywhere is not *especially* yours", () => {
    expect(priorityFit(["career", "wealth"], areas(88, 88, 88, 88))!.delta).toBe(0);
    expect(priorityFit(["career", "wealth"], areas(12, 12, 12, 12))!.delta).toBe(0);
  });

  it("weights by rank — the same day reads differently depending on the order", () => {
    const day = areas(80, 40, 50, 50);
    const careerFirst = priorityFit(["career", "wealth"], day)!.delta;
    const wealthFirst = priorityFit(["wealth", "career"], day)!.delta;
    expect(careerFirst).toBeGreaterThan(wealthFirst);
    expect(careerFirst).toBeGreaterThan(0);
    expect(wealthFirst).toBeLessThan(0);
  });

  it("ranking every area still says something — it is a weighting, not a filter", () => {
    const all: LifeAreaKey[] = ["health", "relationship", "wealth", "career"];
    const fit = priorityFit(all, areas(40, 40, 40, 95))!;
    expect(fit.delta).toBeGreaterThan(0);
    expect(fit.leadArea).toBe("health");
    expect(fit.used).toEqual(all);
  });

  it("reports the two means it compares, so the number can be explained", () => {
    const fit = priorityFit(["career"], areas(90, 50, 50, 50))!;
    expect(fit.weighted).toBe(90);
    expect(fit.baseline).toBe(60);
    expect(fit.delta).toBe(30);
  });
});

/**
 * The disclosure names the areas that went into the number. It must name them the
 * way the daily gauges name them — a user who reads "health" under a gauge titled
 * "Wellbeing" has been shown an internal key and will reasonably assume a bug.
 */
describe("priorityFit — labels match the daily gauges", () => {
  const birth: MomentInput = { year: 1990, month: 6, day: 15, hour: 14, minute: 30, tzOffsetMinutes: 480 };
  const chart = buildBaziChart(buildFourPillars(birth, ZIPING_DEFAULT));

  it("carries a label per used area, parallel to `used`, never a raw key", () => {
    const ranked: LifeAreaKey[] = ["health", "career", "wealth", "relationship"];
    const fit = priorityFit(ranked, areas(40, 40, 40, 95))!;
    expect(fit.usedLabels).toHaveLength(fit.used.length);
    expect(fit.usedLabels).toEqual(["Wellbeing", "Career", "Wealth", "Relationship"]);
    expect(fit.usedLabels).toEqual(fit.used.map((k) => AREA_META[k].label));
    expect(fit.leadLabel).toBe(fit.usedLabels[0]);
    expect(fit.usedLabels).not.toContain("health");
  });

  it("falls back to the engine's AREA_META when the caller passes unlabelled gauges", () => {
    const fit = priorityFit(["health", "career"], [
      { key: "health", score: 70 },
      { key: "career", score: 30 },
    ])!;
    expect(fit.usedLabels).toEqual(["Wellbeing", "Career"]);
    expect(fit.leadLabel).toBe(AREA_META.health.label);
  });

  it("matches the labels the real gauges ship for the same day, exactly", () => {
    const gauges = lifeAreaScores(chart, ganZhiFromIndex(23)).areas;
    const ranked = gauges.map((g) => g.key);
    const fit = priorityFit(ranked, gauges)!;
    expect(fit.usedLabels).toEqual(ranked.map((k) => gauges.find((g) => g.key === k)!.label));
    // and the gauges themselves are AREA_META — one source, no restatement.
    for (const g of gauges) expect(g.label).toBe(AREA_META[g.key].label);
  });
});

describe("priorityFit — totality", () => {
  it("returns null when there is nothing to say, rather than a zero to nag with", () => {
    expect(priorityFit([], areas(90, 50, 50, 50))).toBeNull();
    expect(priorityFit(null, areas(90, 50, 50, 50))).toBeNull();
    expect(priorityFit(undefined, areas(90, 50, 50, 50))).toBeNull();
    expect(priorityFit(["career"], [])).toBeNull();
    expect(priorityFit(["career"], null)).toBeNull();
    expect(priorityFit(["career"], undefined)).toBeNull();
  });

  it("returns null when none of the ranked areas has a gauge today", () => {
    expect(priorityFit(["career", "wealth"], [{ key: "health", score: 70 }])).toBeNull();
  });

  it("skips ranked areas with no gauge and keeps the rest, in rank order", () => {
    const fit = priorityFit(["wealth", "career"], [{ key: "career", score: 80 }, { key: "health", score: 20 }])!;
    expect(fit.used).toEqual(["career"]);
    expect(fit.leadArea).toBe("career");
    expect(fit.leadLabel).toBe("Career"); // fallback label when the caller omits one
  });

  it("counts a duplicated priority once, keeping its first (best) rank", () => {
    const day = areas(80, 40, 50, 50);
    expect(priorityFit(["career", "career", "wealth"], day)).toEqual(priorityFit(["career", "wealth"], day));
  });

  it("ignores a duplicated or non-finite gauge rather than throwing", () => {
    const dup: PriorityFitArea[] = [
      { key: "career", score: 80 },
      { key: "career", score: 10 },
      { key: "wealth", score: Number.NaN },
      { key: "health", score: 40 },
    ];
    const fit = priorityFit(["career"], dup)!;
    expect(fit.weighted).toBe(80);
    expect(fit.baseline).toBe(60); // (80 + 40) / 2 — the NaN gauge and the duplicate are dropped
  });

  it("handles ties without preferring either side", () => {
    const fit = priorityFit(["career", "wealth"], areas(50, 50, 50, 50))!;
    expect(fit.delta).toBe(0);
    expect(Object.is(fit.delta, -0)).toBe(false); // never renders as "-0"
  });

  it("stays honest and non-predictive in its wording", () => {
    const samples = [
      priorityFit(["career"], areas(100, 0, 0, 0))!,
      priorityFit(["career"], areas(50, 50, 50, 50))!,
      priorityFit(["career"], areas(0, 100, 100, 100))!,
      priorityFit(["career"], areas(56, 50, 50, 50))!,
      priorityFit(["career"], areas(44, 50, 50, 50))!,
    ];
    for (const s of samples) {
      expect(s.plain.length).toBeGreaterThan(0);
      expect(s.plain).not.toMatch(/will |guarantee|destin|predict|certain/i);
    }
    expect(PRIORITY_FIT_NOTE).toMatch(/not classical doctrine/i);
    expect(PRIORITY_FIT_NOTE).toMatch(/never changes the day's classical score/i);
  });

  it("never returns -0, even when the comparison rounds down through zero", () => {
    // weighted 50 vs baseline 50.25 → −0.25, which rounds to a negative zero.
    const fit = priorityFit(["career", "wealth"], areas(50, 50, 50, 51))!;
    expect(fit.delta).toBe(0);
    expect(Object.is(fit.delta, -0)).toBe(false);
    expect(formatFitDelta(fit.delta)).toBe("0");
    expect(JSON.stringify(fit)).toContain('"delta":0');
  });

  it("returns null when every gauge is non-finite — no NaN can reach the screen", () => {
    expect(priorityFit(["career"], areas(Number.NaN, Number.NaN, Number.NaN, Number.NaN))).toBeNull();
    const fit = priorityFit(["career", "wealth"], [
      { key: "career", score: Number.NaN },
      { key: "wealth", score: 60 },
      { key: "health", score: 40 },
    ])!;
    expect(fit.used).toEqual(["wealth"]); // the NaN-gauged priority is skipped, not propagated
    expect(Number.isFinite(fit.delta)).toBe(true);
    expect(Number.isFinite(fit.weighted)).toBe(true);
    expect(Number.isFinite(fit.baseline)).toBe(true);
  });

  it("formats the delta with a sign and a real minus glyph", () => {
    expect(formatFitDelta(8)).toBe("+8");
    expect(formatFitDelta(-3)).toBe("−3");
    expect(formatFitDelta(0)).toBe("0");
  });
});

describe("priorityFit — determinism", () => {
  const birth: MomentInput = { year: 1990, month: 6, day: 15, hour: 14, minute: 30, tzOffsetMinutes: 480 };
  const chart = buildBaziChart(buildFourPillars(birth, ZIPING_DEFAULT));

  it("gives byte-identical output for identical inputs, across the whole 60-cycle", () => {
    for (let i = 0; i < 60; i++) {
      const gauges = lifeAreaScores(chart, ganZhiFromIndex(i)).areas;
      const a = priorityFit(["wealth", "health", "career"], gauges);
      const b = priorityFit(["wealth", "health", "career"], gauges);
      expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    }
  });

  it("never depends on wall clock or randomness — same gauges, same answer, any order of calls", () => {
    const gauges = lifeAreaScores(chart, ganZhiFromIndex(7)).areas;
    const first = priorityFit(["career"], gauges);
    priorityFit(["health", "relationship"], gauges);
    priorityFit([], gauges);
    expect(JSON.stringify(priorityFit(["career"], gauges))).toBe(JSON.stringify(first));
  });
});

/**
 * THE LOAD-BEARING TEST.
 *
 * The whole design of this feature rests on one promise: a user's stated
 * priorities change what is SURFACED, never what is SCORED. If this test ever
 * fails, priority data has leaked into the classical calculation and the
 * product is lying about its own number.
 */
describe("priority fit NEVER touches the classical score", () => {
  const birth: MomentInput = { year: 1990, month: 6, day: 15, hour: 14, minute: 30, tzOffsetMinutes: 480 };
  const chart = buildBaziChart(buildFourPillars(birth, ZIPING_DEFAULT));
  const req = {
    birth,
    sex: "male" as const,
    convention: ZIPING_DEFAULT,
    objective: objectiveById("sign_contract"),
    window: { start: { year: 2026, month: 7, day: 8 }, days: 14, tzOffsetMinutes: 480 },
    options: { sweeps: false },
  };

  it("leaves recommendationScore and calculationHash byte-identical either side of a fit computation", () => {
    const before = evaluateDecision(req);
    const beforeJson = JSON.stringify(before);

    // Compute priority fit for every day, under several different priority
    // orders — the most aggressive thing the UI could ever do with this module.
    const orders: LifeAreaKey[][] = [
      ["career", "wealth", "relationship", "health"],
      ["health", "career"],
      ["relationship"],
      [],
    ];
    const fits = before.allDays.flatMap((d) =>
      orders.map((o) => priorityFit(o, lifeAreaScores(chart, d.tongshu.dayGanzhi).areas)),
    );
    expect(fits.some((f) => f !== null)).toBe(true); // the exercise was real

    const after = evaluateDecision(req);

    expect(after.meta.calculationHash).toBe(before.meta.calculationHash);
    expect(after.allDays.map((d) => d.recommendationScore)).toEqual(before.allDays.map((d) => d.recommendationScore));
    expect(after.allDays.map((d) => dayKey(d))).toEqual(before.allDays.map((d) => dayKey(d)));
    expect(JSON.stringify(after)).toBe(beforeJson); // the entire DecisionResult, unchanged
  });

  it("re-ordering priorities cannot change the ranked days", () => {
    const ranked = evaluateDecision(req).allDays.map((d) => `${dayKey(d)}:${d.recommendationScore}`);
    for (const order of [["career"], ["health"], ["wealth", "relationship"]] as LifeAreaKey[][]) {
      const res = evaluateDecision(req);
      res.allDays.forEach((d) => priorityFit(order, lifeAreaScores(chart, d.tongshu.dayGanzhi).areas));
      expect(res.allDays.map((d) => `${dayKey(d)}:${d.recommendationScore}`)).toEqual(ranked);
    }
  });

  it("the fit module never receives a classical score — it is structurally unable to use one", () => {
    // priorityFit's signature takes only (rankedAreas, life-area gauges). A day's
    // recommendationScore is not in scope for it, by construction. Guard the
    // shape so a future refactor cannot quietly widen the input.
    expect(priorityFit.length).toBe(2);
    const fit = priorityFit(["career"], areas(70, 50, 50, 50))!;
    expect(Object.keys(fit).sort()).toEqual([
      "baseline",
      "delta",
      "leadArea",
      "leadLabel",
      "plain",
      "used",
      "usedLabels",
      "weighted",
    ]);
  });

  /**
   * THE STATIC GUARD.
   *
   * The person layer is one-way: the UI may read the engine, the engine may never
   * read the person. If any engine module imported the priority store, the
   * derived signals, or this fit module, a user's stated preferences could reach
   * `recommendationScore` / `calculationHash` and the product's doctrinal number
   * would silently become a personalised one.
   *
   * Two properties this check has to have, both of which the first version
   * lacked:
   *   • It covers the WHOLE person layer — every module under src/ui/priorities/
   *     and its localStorage key — not a hand-picked pair of names.
   *   • It matches IMPORT SPECIFIERS (static, dynamic, re-export, require) after
   *     comments are stripped, so prose in an engine file that merely *mentions*
   *     priorities cannot fail the build, while a real edge always does.
   */
  describe("the engine can never import the person layer", () => {
    const ENGINE_ROOT = new URL("../src/engine/", import.meta.url);

    /** Every module of the person layer, by the name an import would have to use. */
    const FORBIDDEN_SPECIFIER = /priorityFit|prioritiesStore|deriveSignals|dismissedSignals|ui[\\/]priorities/i;
    /** The profile's localStorage key (any version suffix): engine code has no business naming it. */
    const FORBIDDEN_LITERAL = /wei_priorit/i;

    /** Drop comments and their contents, so prose can never trip the guard. */
    const stripComments = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

    /** Static imports, `export … from`, `import()` and `require()` specifiers. */
    const specifiersOf = (src: string): string[] => {
      const out: string[] = [];
      const patterns = [
        /(?:^|[\s;}])(?:import|export)\s[\s\S]*?\sfrom\s*["']([^"']+)["']/g,
        /(?:^|[\s;}])import\s*["']([^"']+)["']/g,
        /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
        /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g,
      ];
      for (const re of patterns) for (const m of src.matchAll(re)) out.push(m[1]);
      return out;
    };

    /** Every .ts/.tsx under src/engine/, recursively — never a hand-listed subset. */
    const engineFiles = (): string[] => {
      const found: string[] = [];
      const walk = (dir: URL, prefix: string) => {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
          if (entry.isDirectory()) walk(new URL(entry.name + "/", dir), `${prefix}${entry.name}/`);
          else if (/\.tsx?$/.test(entry.name)) found.push(`${prefix}${entry.name}`);
        }
      };
      walk(ENGINE_ROOT, "");
      return found.sort();
    };

    it("walks a non-trivial number of engine files — the guard itself must not silently cover nothing", () => {
      const files = engineFiles();
      expect(files.length).toBeGreaterThan(5);
      expect(files).toContain("lifeAreas.ts");
    });

    it("no module under src/engine/** imports any part of the person layer, or names its storage key", () => {
      const offenders: string[] = [];
      for (const rel of engineFiles()) {
        const code = stripComments(readFileSync(new URL(rel, ENGINE_ROOT), "utf8"));
        for (const spec of specifiersOf(code)) {
          if (FORBIDDEN_SPECIFIER.test(spec)) offenders.push(`src/engine/${rel} imports "${spec}"`);
        }
        if (FORBIDDEN_LITERAL.test(code)) offenders.push(`src/engine/${rel} references the priority storage key ("wei_priorit…")`);
      }
      expect(
        offenders,
        offenders.length === 0
          ? ""
          : `The person layer leaked into the engine:\n  ${offenders.join("\n  ")}\n\n` +
            "The engine must stay a pure function of chart + date + objective + doctrine. " +
            "An engine module that can read the user's stated priorities can let them reach " +
            "recommendationScore / calculationHash, which would make the app's classical number " +
            "quietly personalised while still being presented as doctrine. Read the priorities in " +
            "the UI layer and pass only engine-shaped data down, or surface the result alongside " +
            "the classical score (see src/ui/priorityFit.ts) instead of inside it.",
      ).toEqual([]);
    });

    it("the guard detects a real import and ignores a mere mention in prose", () => {
      // A synthetic engine file that only TALKS about the feature: must pass.
      const prose = stripComments(
        `// priorityFit and wei_priorities_v1 are deliberately NOT imported here.\n` +
          `/* prioritiesStore, deriveSignals, dismissedSignals: all ui/priorities. */\n` +
          `import { clamp } from "./util.ts";\n`,
      );
      expect(specifiersOf(prose).filter((s) => FORBIDDEN_SPECIFIER.test(s))).toEqual([]);
      expect(FORBIDDEN_LITERAL.test(prose)).toBe(false);

      // Each real form of leak: every one must be caught.
      const leaks = [
        `import { priorityFit } from "../ui/priorityFit.ts";`,
        `import { loadPriorities } from "../ui/priorities/prioritiesStore.ts";`,
        `export { deriveSignals } from "../ui/priorities/deriveSignals.ts";`,
        `export * from "../ui/priorities/dismissedSignals.ts";`,
        `const m = await import("../ui/priorities/prioritiesStore.ts");`,
        `const m = require("../ui/priorityFit.ts");`,
      ];
      for (const leak of leaks) {
        expect(specifiersOf(stripComments(leak)).some((s) => FORBIDDEN_SPECIFIER.test(s)), leak).toBe(true);
      }
      expect(FORBIDDEN_LITERAL.test(stripComments(`const KEY = "wei_priorities_v1";`))).toBe(true);
    });
  });
});
