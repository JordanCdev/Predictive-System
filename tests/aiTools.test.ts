import { describe, expect, it } from "vitest";
import { buildFourPillars, MomentInput } from "../src/engine/sexagenary.ts";
import { buildBaziChart, computeDaYun } from "../src/engine/bazi.ts";
import { ZIPING_DEFAULT } from "../src/engine/conventions.ts";
import { evaluateDecision } from "../src/engine/decision.ts";
import { objectiveById } from "../src/engine/objectives.ts";
import { AI_TOOLS, AiToolContext, executeTool } from "../src/ai/tools.ts";
import { EMPTY_PRIORITIES, PriorityProfile } from "../src/ui/priorities/prioritiesStore.ts";
import { deriveSignals } from "../src/ui/priorities/deriveSignals.ts";
import type { JournalEntry } from "../src/ui/journalStore.ts";

const birth: MomentInput = { year: 1990, month: 6, day: 15, hour: 14, minute: 30, tzOffsetMinutes: 480 };
const fp = buildFourPillars(birth, ZIPING_DEFAULT);
const chart = buildBaziChart(fp);
const dayun = computeDaYun(fp, "male");

const mkReq = (id: string, days: number, start: { year: number; month: number; day: number }) => ({
  birth,
  sex: "male" as const,
  convention: ZIPING_DEFAULT,
  objective: objectiveById(id),
  window: { start, days, tzOffsetMinutes: 480 },
  options: { sweeps: false },
});

const ctx: AiToolContext = {
  chart,
  dayun,
  birth: { year: 1990, month: 6, day: 15 },
  todayIso: "2026-07-08",
  evaluate: (id, win) => evaluateDecision(mkReq(id, win, { year: 2026, month: 7, day: 8 })),
  evaluateDay: (id, iso) => {
    const [y, m, d] = iso.split("-").map(Number);
    return evaluateDecision(mkReq(id, 1, { year: y, month: m, day: d }));
  },
};

describe("AI tool definitions", () => {
  it("exposes the nine documented tools with input schemas", () => {
    const names = AI_TOOLS.map((t) => t.name).sort();
    expect(names).toEqual(
      [
        "evaluate_specific_day",
        "find_best_days",
        "get_chart_summary",
        "get_luck_pillars",
        "get_natal_chart",
        "get_period_summary",
        "get_priorities",
        "get_profile_fits",
        "list_objectives",
      ].sort(),
    );
    for (const t of AI_TOOLS) expect(t.input_schema.type).toBe("object");
  });

  it("evaluate_specific_day requires only the date — objectiveId is optional", () => {
    const def = AI_TOOLS.find((t) => t.name === "evaluate_specific_day")!;
    expect(def.input_schema.required).toEqual(["isoDate"]);
  });
});

describe("executeTool — the deterministic engine bridge", () => {
  it("list_objectives returns every objective id", () => {
    const r = executeTool("list_objectives", {}, ctx) as any;
    expect(r.objectives.length).toBeGreaterThanOrEqual(11);
    expect(r.objectives[0]).toHaveProperty("id");
  });

  it("get_chart_summary reports the chart but leaks no birth date/time/place", () => {
    const r = executeTool("get_chart_summary", {}, ctx) as any;
    expect(r.dayMaster).toMatch(/\((wood|fire|earth|metal|water)\)/);
    expect(Array.isArray(r.favourableElements)).toBe(true);
    const json = JSON.stringify(r);
    expect(json).not.toMatch(/1990|14:30|birth/i);
  });

  it("get_natal_chart returns four pillars with hidden stems, Na Yin, stars and palaces — no birth data", () => {
    const r = executeTool("get_natal_chart", {}, ctx) as any;
    expect(r.pillars.map((p: any) => p.position)).toEqual(["year", "month", "day", "hour"]);
    for (const p of r.pillars) {
      expect(p.palace.length).toBeGreaterThan(0);
      expect(p.stem.hanzi.length).toBeGreaterThan(0);
      expect(p.branch.animal.length).toBeGreaterThan(0);
      expect(p.hiddenStems.length).toBeGreaterThanOrEqual(1);
      expect(p.hiddenStems[0].tenGod.length).toBeGreaterThan(0);
      expect(p.naYin.zh.length).toBeGreaterThan(0);
    }
    // The day pillar's stem is the self, not a Ten God.
    expect(r.pillars[2].stemTenGod).toMatch(/Day Master/);
    // Functional map covers all five roles.
    for (const role of ["wealth", "officer", "resource", "output", "companion"]) {
      expect(["wood", "fire", "earth", "metal", "water"]).toContain(r.functionalElements[role]);
    }
    // Personal stars: 1990-06-15 is a 己(earth) day master → 子/申 nobleman.
    expect(r.personalStars.nobleman.length).toBeGreaterThan(0);
    expect(r.personalStars.peachBlossom.length).toBe(1);
    expect(r.personalStars.travellingHorse.length).toBe(1);
    expect(r.dayMaster.strength).toMatch(/strong|balanced|weak/);
    expect(r.fiveElementBalance.dominant).not.toBe(undefined);
    const json = JSON.stringify(r);
    expect(json).not.toMatch(/1990|14:30|birth/i);
  });

  it("get_profile_fits ranks all 11 objectives best-first with reasons", () => {
    const r = executeTool("get_profile_fits", {}, ctx) as any;
    expect(r.fits.length).toBeGreaterThanOrEqual(11);
    for (let i = 1; i < r.fits.length; i++) expect(r.fits[i - 1].fit).toBeGreaterThanOrEqual(r.fits[i].fit);
    expect(r.fits[0].reason.length).toBeGreaterThan(0);
    expect(r.bestFit.objectiveId).toBe(r.fits[0].objectiveId);
    expect(r.mostDemanding.objectiveId).toBe(r.fits[r.fits.length - 1].objectiveId);
    expect(r.headline.length).toBeGreaterThan(0);
  });

  it("get_luck_pillars flags exactly one active decade", () => {
    const r = executeTool("get_luck_pillars", {}, ctx) as any;
    expect(r.pillars.length).toBeGreaterThan(0);
    expect(r.pillars.filter((p: any) => p.active).length).toBe(1);
  });

  it("get_luck_pillars always answers — the decade reading is never withheld", () => {
    const r = executeTool("get_luck_pillars", {}, ctx) as any;
    expect(r.unavailable).toBeUndefined();
    expect(r.error).toBeUndefined();
    expect(r.pillars.length).toBeGreaterThan(0);
  });

  it("get_period_summary classifies 2026 as the 本命年 (值太歲) for a 午 native", () => {
    const r = executeTool("get_period_summary", { year: 2026 }, ctx) as any;
    expect(r.year).toBe(2026);
    expect(r.yearSummary.ganzhi).toBe("丙午");
    expect(r.yearSummary.taiSui?.relation).toBe("zhi");
    expect(["supportive", "mixed", "challenging", "neutral"]).toContain(r.yearSummary.valence);
  });

  it("get_period_summary accepts an optional solar month", () => {
    const r = executeTool("get_period_summary", { year: 2026, month: 1 }, ctx) as any;
    expect(r.month).toBeDefined();
    expect(r.month.ganzhi.length).toBeGreaterThan(0);
  });

  it("get_period_summary always answers for years other than the current one", () => {
    // todayIso is 2026-07-08 — past and future years both read in full.
    for (const year of [2024, 2028]) {
      const r = executeTool("get_period_summary", { year }, ctx) as any;
      expect(r.unavailable).toBeUndefined();
      expect(r.error).toBeUndefined();
      expect(r.year).toBe(year);
      expect(r.yearSummary.ganzhi.length).toBeGreaterThan(0);
      expect(["supportive", "mixed", "challenging", "neutral"]).toContain(r.yearSummary.valence);
    }
  });

  it("find_best_days ranks days with scores and validates its input", () => {
    const r = executeTool("find_best_days", { objectiveId: "contract_signing", windowDays: 31 }, ctx) as any;
    expect(r.objective.length).toBeGreaterThan(0);
    expect(r.best.length).toBeGreaterThan(0);
    expect(r.best[0]).toHaveProperty("date");
    expect(r.best[0]).toHaveProperty("score");
    const bad = executeTool("find_best_days", { objectiveId: "nope", windowDays: 31 }, ctx) as any;
    expect(bad.error).toMatch(/unknown objectiveId/);
  });

  it("evaluate_specific_day returns officer, day-god and life-area tendencies", () => {
    const r = executeTool("evaluate_specific_day", { objectiveId: "wedding_marriage", isoDate: "2026-07-16" }, ctx) as any;
    expect(r.date).toBe("2026-07-16");
    expect(r.officer.length).toBeGreaterThan(0);
    expect(r.dayGod.length).toBeGreaterThan(0);
    expect(r.lifeAreas.length).toBe(4);
    const bad = executeTool("evaluate_specific_day", { objectiveId: "wedding_marriage", isoDate: "16-07-2026" }, ctx) as any;
    expect(bad.error).toMatch(/YYYY-MM-DD/);
  });

  it("evaluate_specific_day without an objective falls back to the general day reading", () => {
    const r = executeTool("evaluate_specific_day", { isoDate: "2026-07-16" }, ctx) as any;
    expect(r.error).toBeUndefined();
    expect(r.date).toBe("2026-07-16");
    expect(r.objective).toBe("General day reading");
    expect(typeof r.score).toBe("number");
    // Still rejects a WRONG objective id rather than silently defaulting.
    const bad = executeTool("evaluate_specific_day", { objectiveId: "nope", isoDate: "2026-07-16" }, ctx) as any;
    expect(bad.error).toMatch(/unknown objectiveId/);
  });

  it("get_priorities says plainly when the user has set nothing", () => {
    const r = executeTool("get_priorities", {}, ctx) as any;
    expect(r.hasSharedPriorities).toBe(false);
    expect(r.notSet.sort()).toEqual(["areas", "context", "intentions", "journal"]);
    expect(r.withheld).toEqual([]);
    expect(r.areas).toBeUndefined();
    expect(r.journal).toBeNull();
    expect(r.note).toMatch(/NEVER change a day's score/);
  });

  it("returns an error for an unknown tool", () => {
    expect((executeTool("nope", {}, ctx) as any).error).toMatch(/unknown tool/);
  });

  it("is deterministic — identical calls yield identical JSON", () => {
    const a = JSON.stringify(executeTool("find_best_days", { objectiveId: "open_business", windowDays: 92 }, ctx));
    const b = JSON.stringify(executeTool("find_best_days", { objectiveId: "open_business", windowDays: 92 }, ctx));
    expect(a).toBe(b);
  });
});

// ── get_priorities: field-level consent, and no raw journal text, ever ────────

const priorities = (over: Partial<PriorityProfile> = {}): PriorityProfile => ({
  ...EMPTY_PRIORITIES,
  areas: ["career", "wealth"],
  intentions: ["ship the new pricing page"],
  context: { occupation: "founder" },
  aiConsent: { areas: true, intentions: true, context: false, journal: false },
  updatedAt: Date.UTC(2026, 6, 1),
  ...over,
});

const journalEntry = (objectiveId: string, n: number): JournalEntry => ({
  id: `${objectiveId}:${n}`,
  objectiveId,
  objectiveLabel: "Start a job / accept a role / career move",
  isoDate: `2026-07-0${n}`,
  weekday: "Monday",
  score: 61,
  band: "Good",
  verdict: "A workable day.",
  bestHour: null,
  note: "SECRET-JOURNAL-NOTE",
  savedAt: 1_700_000_000_000,
});

const withPriorities = (p: PriorityProfile | undefined, entries: JournalEntry[] = []): AiToolContext => ({
  ...ctx,
  priorities: p,
  journalSignals: () => deriveSignals(entries),
});

describe("get_priorities — the consent gate", () => {
  it("returns the fields the user consented to, and only those", () => {
    const r = executeTool("get_priorities", {}, withPriorities(priorities())) as any;
    expect(r.hasSharedPriorities).toBe(true);
    expect(r.areas).toEqual([
      { rank: 1, key: "career", label: "Career" },
      { rank: 2, key: "wealth", label: "Wealth" },
    ]);
    expect(r.intentions).toEqual(["ship the new pricing page"]);
    // Context is set but consent for it is off — absent, and flagged.
    expect(r.context).toBeUndefined();
    expect(r.withheld).toEqual(["context"]);
    expect(r.consentNote).toMatch(/NOT consented to share: context/);
    expect(JSON.stringify(r)).not.toContain("founder");
  });

  it("withholds every field the user turned off, and never says why it was withheld", () => {
    const p = priorities({ aiConsent: { areas: false, intentions: false, context: false, journal: false } });
    const r = executeTool("get_priorities", {}, withPriorities(p)) as any;
    expect(r.hasSharedPriorities).toBe(false);
    expect(r.areas).toBeUndefined();
    expect(r.intentions).toBeUndefined();
    expect(r.withheld.sort()).toEqual(["areas", "context", "intentions"]);
    const json = JSON.stringify(r);
    expect(json).not.toContain("pricing page");
    expect(json).not.toContain("founder");
    expect(r.journal).toBeNull();
  });

  it("distinguishes 'not set' from 'withheld' so the model cannot conflate them", () => {
    const p = priorities({
      intentions: [],
      context: {},
      aiConsent: { areas: false, intentions: true, context: true, journal: true },
    });
    const r = executeTool("get_priorities", {}, withPriorities(p)) as any;
    expect(r.withheld).toEqual(["areas"]);
    // Consented to but with an empty journal: "not set", never "withheld".
    expect(r.notSet.sort()).toEqual(["context", "intentions", "journal"]);
  });

  it("reports the journal as aggregate counts and NEVER the notes, once consented", () => {
    const entries = [journalEntry("career_move", 1), journalEntry("career_move", 2), journalEntry("career_move", 3)];
    const p = priorities({ aiConsent: { areas: true, intentions: true, context: false, journal: true } });
    const r = executeTool("get_priorities", {}, withPriorities(p, entries)) as any;
    expect(r.journal.savedDecisions).toBe(3);
    expect(r.journal.byArea[0]).toEqual({ area: "Career", savedDecisions: 3, withLoggedOutcome: 0 });
    expect(r.withheld).toEqual(["context"]);
    expect(JSON.stringify(r)).not.toContain("SECRET-JOURNAL-NOTE");
  });

  it("never ships the journal aggregate off the DEFAULT profile — the proven leak", () => {
    // A user who has never opened the priorities panel: loadPriorities() gives
    // exactly EMPTY_PRIORITIES. Their behaviour must not travel with a payload
    // that simultaneously reports they shared nothing.
    const entries = [journalEntry("career_move", 1), journalEntry("career_move", 2), journalEntry("career_move", 3)];
    const r = executeTool("get_priorities", {}, withPriorities({ ...EMPTY_PRIORITIES }, entries)) as any;
    expect(r.hasSharedPriorities).toBe(false);
    expect(r.journal).toBeNull();
    // It exists but was not consented to — reported as withheld, not as "not set".
    expect(r.withheld).toEqual(["journal"]);
    expect(r.notSet.sort()).toEqual(["areas", "context", "intentions"]);
    const json = JSON.stringify(r);
    expect(json).not.toContain("SECRET-JOURNAL-NOTE");
    expect(json).not.toContain("savedDecisions");
  });

  it("does not let the areas flag stand in for journal consent", () => {
    const entries = [journalEntry("career_move", 1), journalEntry("career_move", 2)];
    const areasOnly = priorities({ aiConsent: { areas: true, intentions: true, context: false, journal: false } });
    expect((executeTool("get_priorities", {}, withPriorities(areasOnly, entries)) as any).journal).toBeNull();
    // …and the journal flag alone is not the user having STATED anything.
    const journalOnly = { ...EMPTY_PRIORITIES, aiConsent: { ...EMPTY_PRIORITIES.aiConsent, journal: true } };
    const r = executeTool("get_priorities", {}, withPriorities(journalOnly, entries)) as any;
    expect(r.hasSharedPriorities).toBe(false);
    expect(r.journal.savedDecisions).toBe(2);
  });

  it("surfaces staleness from the ISO date, with no wall-clock read", () => {
    const p = priorities({ updatedAt: Date.UTC(2024, 0, 1) }); // ctx.todayIso is 2026-07-08
    const r = executeTool("get_priorities", {}, withPriorities(p)) as any;
    expect(r.lastUpdated.needsReview).toBe(true);
    expect(r.lastUpdated.monthsAgo).toBeGreaterThan(24);
    const fresh = executeTool("get_priorities", {}, withPriorities(priorities())) as any;
    expect(fresh.lastUpdated.needsReview).toBe(false);
  });

  it("is deterministic — identical calls yield identical JSON", () => {
    const c = withPriorities(priorities(), [journalEntry("career_move", 1)]);
    expect(JSON.stringify(executeTool("get_priorities", {}, c))).toBe(JSON.stringify(executeTool("get_priorities", {}, c)));
  });
});
