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
  BRANCHES,
  BaziChart,
  DaYun,
  DecisionResult,
  GENERAL_DAY_OBJECTIVE,
  OBJECTIVES,
  TEN_GOD_LABEL,
  analyzeProfile,
  buildPeriodsReport,
  ganZhiFromIndex,
  headlineVerdict,
  humanHourRange,
  interactionPlain,
  isNoblemanDay,
  lifeAreaScores,
  objectiveById,
  personalShenSha,
  practicalBestHour,
  rootingPlain,
  seasonalStatePlain,
  verdictBand,
} from "../engine/index.ts";
import type { BoundaryAlternative, DayRecommendation, PeriodSummary, PillarReading } from "../engine/index.ts";
import { areaLabel, freshness, hasStatedSharedContent, sharedForAi } from "../ui/priorities/prioritiesStore.ts";
import type { PriorityProfile } from "../ui/priorities/prioritiesStore.ts";
import type { JournalSignals } from "../ui/priorities/deriveSignals.ts";

/** Everything a tool needs to answer, all deterministic and client-side. */
export interface AiToolContext {
  /** The user's STATED priorities, if they've set any. Never read raw for output:
   *  `get_priorities` projects it through `sharedForAi`, the store's single
   *  consent gate. Absent = the user hasn't set any. */
  priorities?: PriorityProfile;
  /** Aggregate journal signals, read lazily at tool-call time so the advisor sees
   *  the current journal. Emitted ONLY under the profile's `journal` consent flag
   *  (off by default), and then as COUNTS only — the user's journal notes are raw
   *  personal text and never leave the device under any flag. */
  journalSignals?: () => JournalSignals;
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
    name: "get_natal_chart",
    description:
      "The subject's FULL natal chart, pillar by pillar: all four pillars (hanzi + pinyin + zodiac animal), hidden stems (藏干) with each one's Ten God, Na Yin, palace meaning per pillar, five-element balance, the functional element map (which element is this chart's Wealth/Officer/Resource/Output/Companion), Day-Master seasonal state + rooting + strength, and personal star branches (Nobleman 天乙貴人, Peach Blossom 桃花, Travelling Horse 驛馬). Use for 'what's in my chart', hidden stems, Na Yin, animals, and personality questions. No birth date/time/place is included.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "get_profile_fits",
    description:
      "How well this chart statically fits EVERY objective the engine can time, ranked best to worst, each with a 0–100 fit and a plain reason. Use for 'what suits me', 'what am I good at', and 'what would be hardest for me'. Fit is about the KIND of move, not a date — pair with find_best_days for timing.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "get_priorities",
    description:
      "What the user has SAID matters to them right now: their ranked life areas, one or two stated intentions, and optional life context — plus, only if they have separately opted in, aggregate counts of the decisions they've saved. These are the user's own stated goals, NOT facts about their chart and NOT part of the classical reading. They never change any day's score. Every field has its own consent switch; anything set but not consented to is listed in `withheld` and is absent from the result — never guess what it contains. Call this before giving personal guidance so your advice is aimed at what they actually want.",
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
    description:
      "Evaluate one specific calendar day: its pillar, officer, day-god, score, verdict, sub-scores, best hour and life-area tendencies. Omit objectiveId for a general 'how is this day for me' reading not tied to an activity.",
    input_schema: {
      type: "object",
      properties: {
        objectiveId: { type: "string", description: "Optional objective id from list_objectives. Omit for a general day reading." },
        isoDate: { type: "string", description: "The day as YYYY-MM-DD." },
      },
      required: ["isoDate"],
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

/** Boundary ambiguity, shaped identically for every chart-reading tool so the
 *  advisor can never narrate an ambiguous chart as settled. */
function boundaryPayload(boundary: BoundaryAlternative[] | undefined) {
  return (boundary ?? []).length === 0
    ? null
    : (boundary ?? []).map((b) => ({
        why: b.flag.message,
        alternativeScenario: b.scenario,
        pillarsThatWouldChange: b.differs,
        alternativePillars: b.pillars,
      }));
}

/** "子 Zǐ (Rat)" — the human-readable form of a branch, for star lists. */
function branchPlain(index: number): string {
  const b = BRANCHES[index];
  return `${b.hanzi} ${b.pinyin} (${b.animal})`;
}

/** Which life theme each pillar traditionally speaks for (palace, 宮位). Matches
 *  the engine's own life-area routing (lifeAreas.ts: month = career palace,
 *  day branch = spouse/self, hour = children/legacy). */
const PALACE_LABEL: Record<PillarReading["position"], string> = {
  year: "Roots — ancestry, grandparents, early environment",
  month: "Career & parents palace",
  day: "Self & spouse palace (the branch is the spouse palace)",
  hour: "Children & legacy palace — later life",
};

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
          boundaryAmbiguity: boundaryPayload(ctx.boundary),
          note: "Strength + useful-element reading is MEDIUM confidence and school-dependent.",
        };
      }

      case "get_natal_chart": {
        const dm = ctx.chart.dayMaster;
        const natalBranch = (pos: PillarReading["position"]) =>
          ctx.chart.pillars.find((p) => p.position === pos)!.ganzhi.branch.index;
        const natal = { year: natalBranch("year"), month: natalBranch("month"), day: natalBranch("day") };
        // Star branches are pure table lookups the engine already exports; the
        // natal object deliberately omits the hour (tongshu.ts: a defaulted hour
        // must never drive a personal star or clash).
        const starBranches = (code: string) =>
          BRANCHES.filter((b) => personalShenSha(ganZhiFromIndex(b.index), natal).tags.some((t) => t.code === code)).map((b) => branchPlain(b.index));
        const season = seasonalStatePlain(dm.seasonalState);
        return {
          pillars: ctx.chart.pillars.map((p) => ({
            position: p.position,
            palace: PALACE_LABEL[p.position],
            pillar: `${p.ganzhi.hanzi} (${p.ganzhi.stem.pinyin} ${p.ganzhi.branch.pinyin})`,
            stem: { hanzi: p.ganzhi.stem.hanzi, pinyin: p.ganzhi.stem.pinyin, element: p.ganzhi.stem.phase, yinYang: p.ganzhi.stem.yinYang },
            branch: { hanzi: p.ganzhi.branch.hanzi, pinyin: p.ganzhi.branch.pinyin, animal: p.ganzhi.branch.animal, element: p.ganzhi.branch.phase },
            stemTenGod: p.stemTenGod === "day_master" ? "Day Master (self)" : TEN_GOD_LABEL[p.stemTenGod],
            hiddenStems: p.hiddenStems.map((h) => ({
              stem: `${h.stem.hanzi} ${h.stem.pinyin} (${h.stem.phase})`,
              tenGod: TEN_GOD_LABEL[h.tenGod],
              weight: h.weight,
            })),
            naYin: { zh: p.naYinZh, en: p.naYinEn, element: p.naYinPhase },
          })),
          fiveElementBalance: {
            percent: ctx.chart.elements.percent,
            dominant: ctx.chart.elements.dominant,
            weakest: ctx.chart.elements.weakest,
          },
          functionalElements: {
            note: "Which element carries each life theme FOR THIS CHART — e.g. wealth: 'metal' means Metal days/years carry the money theme.",
            ...dm.functional,
          },
          dayMaster: {
            stem: `${dm.dayMaster.hanzi} ${dm.dayMaster.pinyin} (${dm.dayMaster.phase}, ${dm.dayMaster.yinYang})`,
            strength: dm.strength,
            structure: dm.structure,
            seasonalState: `${season.zh} — ${season.label}`,
            rooting: rootingPlain(dm.rooting),
            rationale: dm.rationale,
          },
          personalStars: {
            nobleman: BRANCHES.filter((b) => isNoblemanDay(b.index, dm.dayMaster.index)).map((b) => branchPlain(b.index)),
            peachBlossom: starBranches("peach_blossom"),
            travellingHorse: starBranches("travelling_horse"),
            note: "Days (or people's year branches) on these branches activate the star: Nobleman 天乙貴人 = helpful-people luck, Peach Blossom 桃花 = charisma/romance, Travelling Horse 驛馬 = movement.",
          },
          chartInteractions: ctx.chart.elements.interactions.map(interactionPlain),
          boundaryAmbiguity: boundaryPayload(ctx.boundary),
          note: "Pillars, hidden stems and Na Yin are deterministic facts. Strength, structure and palace readings are MEDIUM-confidence interpretation and school-dependent — present them as interpretation, not fact.",
        };
      }

      case "get_profile_fits": {
        const profile = analyzeProfile(ctx.chart);
        const fits = profile.fits.map((f) => ({
          objectiveId: f.objectiveId,
          objective: objectiveById(f.objectiveId).label,
          fit: f.fit,
          reason: f.reason,
        }));
        return {
          headline: profile.headline,
          strengths: profile.strengths,
          cautions: profile.cautions,
          fits,
          bestFit: fits[0] ?? null,
          mostDemanding: fits[fits.length - 1] ?? null,
          note: "Fit is a static 0–100 suitability of this chart for each KIND of move — not a date. The chosen day still matters: use find_best_days for timing.",
        };
      }

      case "get_priorities": {
        // Consent is enforced by `sharedForAi` — the one gate.
        const p = ctx.priorities ?? null;
        const shared = p ? sharedForAi(p) : null;
        // Derived LOCALLY (deriveSignals is pure and client-side) so "is there a
        // journal at all" can be reported honestly. Nothing from it is emitted
        // unless `shared.journal` — the consent flag — says it may be.
        const sig = ctx.journalSignals ? ctx.journalSignals() : null;
        const hasJournal = Boolean(sig && sig.totalEntries > 0);
        const withheld: string[] = [];
        const notSet: string[] = [];
        const hasContext = Boolean(p && (p.context.lifeStage || p.context.occupation || p.context.comingUp));
        const fields: [string, boolean, boolean][] = [
          ["areas", Boolean(p && p.areas.length > 0), Boolean(p?.aiConsent.areas)],
          ["intentions", Boolean(p && p.intentions.length > 0), Boolean(p?.aiConsent.intentions)],
          ["context", hasContext, Boolean(p?.aiConsent.context)],
          ["journal", hasJournal, Boolean(p?.aiConsent.journal)],
        ];
        for (const [name, isSet, consented] of fields) {
          if (!isSet) notSet.push(name);
          else if (!consented) withheld.push(name);
        }
        // The journal aggregate is DERIVED from behaviour rather than stated, so it
        // has its OWN consent flag (off by default) — it never rides on the stated
        // area ranking — and carries counts only. `sharedForAi` remains the one gate.
        const journal =
          shared?.journal && sig && hasJournal
            ? {
                savedDecisions: sig.totalEntries,
                byArea: sig.ranked.map((r) => ({ area: r.label, savedDecisions: r.entries, withLoggedOutcome: r.withOutcome })),
                note: "Aggregate counts only, derived from what the user saved and shared under its own consent switch — their journal notes never leave their device. This is behaviour, not something they told you.",
              }
            : null;
        const [y, m, d] = ctx.todayIso.split("-").map(Number);
        const age = p ? freshness(p, Date.UTC(y, (m || 1) - 1, d || 1)) : null;
        return {
          /** True only when the user has STATED something AND consented to share it.
           *  The journal flag is a permission over derived behaviour, so it alone
           *  never makes this true. */
          hasSharedPriorities: hasStatedSharedContent(shared),
          areas: shared?.areas ? shared.areas.map((k, i) => ({ rank: i + 1, key: k, label: areaLabel(k) })) : undefined,
          intentions: shared?.intentions,
          context: shared?.context,
          withheld,
          notSet,
          consentNote:
            withheld.length > 0
              ? `The user has NOT consented to share: ${withheld.join(", ")}. Those fields exist but are deliberately absent — do not guess, infer or ask the engine for them.`
              : "Nothing the user has set is being withheld.",
          lastUpdated: age && age.state !== "unset" ? { monthsAgo: age.ageMonths, needsReview: age.needsReview } : null,
          journal,
          note:
            "These are the user's STATED goals, not facts about their chart and not classical doctrine. Priorities NEVER change a day's score — the score stays a strict function of chart, date, objective and doctrine. The app shows a separate, clearly-labelled 'priority fit' axis alongside the classical score; if the user asks whether their priorities changed a rating, say plainly that they did not.",
        };
      }

      case "get_luck_pillars": {
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
        // objectiveId is optional: "how is 14 Oct 2027 for me?" gets the neutral
        // general-day reading rather than an error demanding an activity.
        const objectiveId = input.objectiveId == null || input.objectiveId === "" ? GENERAL_DAY_OBJECTIVE.id : String(input.objectiveId);
        const isoDate = String(input.isoDate ?? "");
        if (objectiveId !== GENERAL_DAY_OBJECTIVE.id && !OBJECTIVES.some((o) => o.id === objectiveId))
          return { error: `unknown objectiveId '${objectiveId}'. Call list_objectives, or omit objectiveId for a general day reading.` };
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
