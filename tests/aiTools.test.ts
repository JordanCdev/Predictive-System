import { describe, expect, it } from "vitest";
import { buildFourPillars, MomentInput } from "../src/engine/sexagenary.ts";
import { buildBaziChart, computeDaYun } from "../src/engine/bazi.ts";
import { ZIPING_DEFAULT } from "../src/engine/conventions.ts";
import { evaluateDecision } from "../src/engine/decision.ts";
import { objectiveById } from "../src/engine/objectives.ts";
import { AI_TOOLS, AiToolContext, executeTool } from "../src/ai/tools.ts";

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
  it("exposes the six documented tools with input schemas", () => {
    const names = AI_TOOLS.map((t) => t.name).sort();
    expect(names).toEqual(
      ["evaluate_specific_day", "find_best_days", "get_chart_summary", "get_luck_pillars", "get_period_summary", "list_objectives"].sort(),
    );
    for (const t of AI_TOOLS) expect(t.input_schema.type).toBe("object");
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

  it("get_luck_pillars flags exactly one active decade", () => {
    const r = executeTool("get_luck_pillars", {}, ctx) as any;
    expect(r.pillars.length).toBeGreaterThan(0);
    expect(r.pillars.filter((p: any) => p.active).length).toBe(1);
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

  it("returns an error for an unknown tool", () => {
    expect((executeTool("nope", {}, ctx) as any).error).toMatch(/unknown tool/);
  });

  it("is deterministic — identical calls yield identical JSON", () => {
    const a = JSON.stringify(executeTool("find_best_days", { objectiveId: "open_business", windowDays: 92 }, ctx));
    const b = JSON.stringify(executeTool("find_best_days", { objectiveId: "open_business", windowDays: 92 }, ctx));
    expect(a).toBe(b);
  });
});
