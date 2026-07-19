/**
 * AI tool bridge — the deterministic engine, exposed to the chat model.
 *
 * The AI is a strict EXPLANATION shell: it never computes pillars, scores, dates
 * or elements itself. Every number it cites comes from one of these tools, each
 * a thin wrapper over an existing deterministic engine call executed LOCALLY in
 * the browser (ROADMAP §C2). The tool results are small JSON payloads — the same
 * facts the deterministic UI already renders. No tool here touches the network.
 */

import {
  BaziChart,
  DaYun,
  DecisionResult,
  OBJECTIVES,
  analyzeProfile,
  buildPeriodsReport,
  headlineVerdict,
  humanHourRange,
  interactionPlain,
  lifeAreaScores,
  objectiveById,
  practicalBestHour,
  verdictBand,
} from "../engine/index.ts";
import type { BoundaryAlternative, DayRecommendation, PeriodSummary } from "../engine/index.ts";

/** Everything a tool needs to answer, all deterministic and client-side. */
export interface AiToolContext {
  /** Feature gate, so a tool cannot hand back Pro-only content the UI paywalls.
   *  Defaults to permissive when absent (tests, non-billing deployments). */
  can?: (feature: "luck_pillars" | "year_forecast") => boolean;
  /** Both candidate charts when the birth sits on a pillar boundary; empty
   *  otherwise. Surfaced so the advisor cannot narrate an ambiguous chart as if
   *  it were settled. */
  boundary?: BoundaryAlternative[];
  chart: BaziChart;
  dayun: DaYun | null;
  birth: { year: number; month: number; day: number };
  todayIso: string;
  /** Rank a window from today (reuses App's per-person evaluator). */
  evaluate: (objectiveId: string, windowDays: number) => DecisionResult;
  /** Evaluate a single named day (window of 1 starting at isoDate). */
  evaluateDay: (objectiveId: string, isoDate: string) => DecisionResult;
}

export interface AiToolDef {
  name: string;
  description: string;
  input_schema: { type: "object"; properties: Record<string, unknown>; required?: string[] };
}

/** The Anthropic tool definitions handed to the model. */
export const AI_TOOLS: AiToolDef[] = [
  {
    name: "list_objectives",
    description: "List the life decisions this engine can time (id + label + description). Call this first if unsure which objective id to use.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "get_chart_summary",
    description:
      "The subject's natal BaZi chart summary: Day Master, strength, special structure, favourable/unfavourable elements (用神/忌神), and chart interactions. No birth date/time/place is included.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "get_luck_pillars",
    description: "The subject's 大運 luck-cycle timeline: each 10-year decade with its Ten-God theme, valence, and which decade is active now.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "get_period_summary",
    description:
      "The 流年 (annual) reading for a year, optionally with one 流月 (solar month). Returns the Ten-God theme, valence, 太歲 status, and tailwind/headwind/caution tendencies.",
    input_schema: {
      type: "object",
      properties: {
        year: { type: "integer", description: "The Gregorian year, e.g. 2026." },
        month: { type: "integer", description: "Optional solar-month ordinal 1–12 (1 = 寅 month, opening at 立春 ≈ early Feb)." },
      },
      required: ["year"],
    },
  },
  {
    name: "find_best_days",
    description: "Rank the best days for an objective over a window of days starting today. Returns the top few with score, verdict and best hour.",
    input_schema: {
      type: "object",
      properties: {
        objectiveId: { type: "string", description: "An objective id from list_objectives (e.g. 'wedding_marriage')." },
        windowDays: { type: "integer", description: "How many days ahead to search (1–1826)." },
      },
      required: ["objectiveId", "windowDays"],
    },
  },
  {
    name: "evaluate_specific_day",
    description: "Evaluate one specific calendar day for an objective: its pillar, officer, day-god, score, verdict, sub-scores, best hour and life-area tendencies.",
    input_schema: {
      type: "object",
      properties: {
        objectiveId: { type: "string", description: "An objective id from list_objectives." },
        isoDate: { type: "string", description: "The day as YYYY-MM-DD." },
      },
      required: ["objectiveId", "isoDate"],
    },
  },
];

// ── result shaping helpers ───────────────────────────────────────────────────

function bestHourPlain(rec: DayRecommendation): string | null {
  if (!rec.personalized) return null;
  const ph = practicalBestHour(rec);
  return ph ? humanHourRange(ph.rangeLabel) : null;
}

function summarizeRec(rec: DayRecommendation, objectiveId: string) {
  const obj = objectiveById(objectiveId);
  return {
    date: rec.isoDate,
    weekday: rec.weekday,
    dayPillar: rec.tongshu.dayGanzhi.hanzi,
    score: rec.recommendationScore,
    band: verdictBand(rec.recommendationScore).label,
    verdict: headlineVerdict(rec, obj),
    ruledOut: rec.hardReject,
    bestHour: bestHourPlain(rec),
  };
}

function summarizePeriod(s: PeriodSummary) {
  return {
    ganzhi: s.ganzhi,
    valence: s.valence,
    theme: s.theme.domain,
    taiSui: s.taiSui && s.taiSui.relation !== "none" ? { relation: s.taiSui.relation, fanTaiSui: s.taiSui.fanTaiSui, label: s.taiSui.label } : null,
    headline: s.headline,
    tailwinds: s.tailwinds,
    headwinds: s.headwinds,
    cautions: s.cautions,
    lifeAreas: s.lifeAreas,
  };
}

// ── the executor ─────────────────────────────────────────────────────────────

/** Run a tool locally against the deterministic engine. Never throws — bad
 *  input returns an `{ error }` payload the model can recover from. */
export function executeTool(name: string, rawInput: unknown, ctx: AiToolContext): unknown {
  const input = (rawInput ?? {}) as Record<string, unknown>;
  try {
    switch (name) {
      case "list_objectives":
        return { objectives: OBJECTIVES.map((o) => ({ id: o.id, label: o.label, description: o.description })) };

      case "get_chart_summary": {
        const dm = ctx.chart.dayMaster;
        const profile = analyzeProfile(ctx.chart);
        return {
          dayMaster: `${dm.dayMaster.hanzi} (${dm.dayMaster.phase})`,
          strength: dm.strength,
          structure: dm.structure,
          favourableElements: dm.favorableElements,
          unfavourableElements: dm.unfavorableElements,
          seasonalState: dm.seasonalState,
          headline: profile.headline,
          strengths: profile.strengths,
          cautions: profile.cautions,
          chartInteractions: ctx.chart.elements.interactions.map(interactionPlain),
          // The advisor previously never saw this, so it narrated a chart that
          // might hinge on a ten-minute recording error with full confidence.
          boundaryAmbiguity:
            (ctx.boundary ?? []).length === 0
              ? null
              : (ctx.boundary ?? []).map((b) => ({
                  why: b.flag.message,
                  alternativeScenario: b.scenario,
                  pillarsThatWouldChange: b.differs,
                  alternativePillars: b.pillars,
                })),
          note: "Strength + useful-element reading is MEDIUM confidence and school-dependent.",
        };
      }

      case "get_luck_pillars": {
        // The 大運 scrubber is a Pro feature; the advisor must not route around it.
        if (ctx.can && !ctx.can("luck_pillars")) {
          return {
            unavailable: "luck_pillars",
            message:
              "The ten-year luck-pillar reading is part of Pro. Tell the user that plainly, don't describe their decades, and offer what you CAN do on their plan.",
          };
        }
        const year = Number(ctx.todayIso.slice(0, 4));
        const report = buildPeriodsReport({ chart: ctx.chart, dayun: ctx.dayun, birth: ctx.birth, targetYear: year });
        return {
          direction: ctx.dayun?.direction ?? null,
          rule: ctx.dayun?.rule ?? null,
          pillars: report.luckPillars.map((s) => ({
            ...summarizePeriod(s),
            label: s.label,
            active: s.label.startsWith("now"),
          })),
        };
      }

      case "get_period_summary": {
        const year = Number(input.year);
        if (!Number.isFinite(year)) return { error: "year must be a number, e.g. 2026" };
        // The current year is free; any OTHER year is Pro, matching YearlyPage.
        const thisYear = Number(ctx.todayIso.slice(0, 4));
        if (year !== thisYear && ctx.can && !ctx.can("year_forecast")) {
          return {
            unavailable: "year_forecast",
            year,
            message: `Reading a year other than ${thisYear} is part of Pro. Say so plainly, don't describe ${year}, and offer the current year instead.`,
          };
        }
        const report = buildPeriodsReport({ chart: ctx.chart, dayun: ctx.dayun, birth: ctx.birth, targetYear: year });
        const out: Record<string, unknown> = {
          year,
          interaction: report.interaction,
          yearSummary: summarizePeriod(report.year),
        };
        if (input.month != null) {
          const m = Number(input.month);
          if (Number.isFinite(m) && m >= 1 && m <= 12) {
            const mp = report.months[m - 1];
            out.month = { label: mp.label, span: mp.span, ...summarizePeriod(mp) };
          } else {
            out.monthError = "month must be a solar-month ordinal 1–12 (1 = 寅, opening at 立春).";
          }
        }
        return out;
      }

      case "find_best_days": {
        const objectiveId = String(input.objectiveId ?? "");
        const windowDays = Number(input.windowDays);
        if (!OBJECTIVES.some((o) => o.id === objectiveId)) return { error: `unknown objectiveId '${objectiveId}'. Call list_objectives.` };
        if (!Number.isFinite(windowDays) || windowDays < 1) return { error: "windowDays must be a positive integer." };
        const res = ctx.evaluate(objectiveId, Math.min(1826, Math.round(windowDays)));
        return {
          objective: objectiveById(objectiveId).label,
          windowDays: Math.min(1826, Math.round(windowDays)),
          favourableElements: res.meta.favorableElements,
          personalized: res.personalized,
          best: res.recommendations.slice(0, 5).map((r) => summarizeRec(r, objectiveId)),
          ruledOutCount: res.rejected.length,
          note:
            res.recommendations.length === 0
              ? "Every day in this window hit a hard traditional taboo for this objective — suggest widening the window."
              : undefined,
        };
      }

      case "evaluate_specific_day": {
        const objectiveId = String(input.objectiveId ?? "");
        const isoDate = String(input.isoDate ?? "");
        if (!OBJECTIVES.some((o) => o.id === objectiveId)) return { error: `unknown objectiveId '${objectiveId}'. Call list_objectives.` };
        if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return { error: "isoDate must be YYYY-MM-DD." };
        const res = ctx.evaluateDay(objectiveId, isoDate);
        const rec = res.allDays.find((d) => d.isoDate === isoDate) ?? res.allDays[0];
        if (!rec) return { error: `could not evaluate ${isoDate}` };
        return {
          ...summarizeRec(rec, objectiveId),
          objective: objectiveById(objectiveId).label,
          officer: `${rec.tongshu.officer.nameZh} ${rec.tongshu.officer.nameEn}`,
          dayGod: `${rec.tongshu.dayGod.nameZh} ${rec.tongshu.dayGod.nameEn}`,
          subScores: rec.subScores,
          topReasons: rec.topReasons,
          rejectReasons: rec.hardReject ? rec.rejectReasons : undefined,
          almanacVerdict: rec.almanacVerdict,
          lifeAreas: res.personalized
            ? lifeAreaScores(ctx.chart, rec.tongshu.dayGanzhi).areas.map((a) => ({ area: a.label, score: a.score, tendency: a.reason }))
            : null,
        };
      }

      default:
        return { error: `unknown tool '${name}'` };
    }
  } catch (e) {
    return { error: `tool '${name}' failed: ${e instanceof Error ? e.message : String(e)}` };
  }
}
