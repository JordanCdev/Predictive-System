/**
 * Journal → priority SIGNALS (suggest-and-confirm).
 *
 * The decision journal already records the only honest evidence of what someone
 * actually cares about: the decisions they bothered to save. This module turns
 * that backward-looking log into a small set of SUGGESTIONS — "your journal
 * suggests career matters most right now" — each carrying the evidence that
 * produced it.
 *
 * Three rules govern this file and must not be relaxed:
 *
 * 1. SUGGESTIONS ONLY. Nothing here writes anywhere. A derived signal becomes a
 *    durable priority only when the user presses Add. Silent inference into a
 *    profile is exactly what destroys trust in a product like this.
 * 2. PURE AND DETERMINISTIC. Same entries in, same suggestions out. No wall
 *    clock, no randomness, no network — and nothing here touches the classical
 *    day score, which stays a strict function of chart + date + objective +
 *    doctrine.
 * 3. EVIDENCE TRAVELS WITH THE CLAIM. Every suggestion states how many saved
 *    decisions produced it and which ones, so the user can disagree with a
 *    glance rather than trusting a black box.
 *
 * ## How an objective maps to a life area
 *
 * The mapping is DERIVED from the engine's existing objective metadata rather
 * than invented as a second opinion:
 *
 * - `godBias` (the Ten-God energy an objective wants) is routed to life areas
 *   using `src/engine/lifeAreas.ts`'s own routing — that file is the engine's
 *   settled statement of which Ten-God group speaks for which area:
 *     officer   → career            (career += officer activation)
 *     resource  → career + health   (career += ½·resource; resource restores a
 *                                    light Day Master)
 *     wealth    → wealth            (wealth += wealth activation)
 *     output    → nothing           (the engine routes Output to the health
 *                                    gauge, but as EVIDENCE OF INTENT it says
 *                                    nothing — see GOD_AREAS)
 *     companion → relationship      (the companion group is the one lifeAreas
 *                                    routes to the relationship axis)
 * - `primaryTag` (the almanac activity) names a DOMAIN the Ten-God bias cannot
 *   express — 嫁娶 is the relationship axis by definition, 求醫 the health axis,
 *   入學 development, 入宅/動土 the household, 納財/開市 money. Where the tag
 *   names a domain it leads, and the godBias contribution is halved so a
 *   wedding's Resource bias cannot read as "you care about career".
 * - Objectives whose tag names no domain (travel 出行, general) rest on their
 *   godBias alone — and where that godBias is Output, which names no domain
 *   either, they contribute NO signal at all. `general_day` and `travel` are
 *   both in that position: reading a day, or planning a trip, tells us nothing
 *   about what the reader cares about.
 *
 * Per objective, area weights below 40% of that objective's strongest area are
 * dropped as noise, and the rest normalised to sum to 1 — so one saved decision
 * is always exactly one unit of evidence, split across at most a couple of areas.
 */

import { AREA_META, LifeAreaKey, OBJECTIVES, Objective, objectiveById } from "../../engine/index.ts";
import type { ActivityTag } from "../../engine/index.ts";
import type { GodGroup } from "../../engine/index.ts";
import type { JournalEntry } from "../journalStore.ts";

/** Re-exported from the engine's own gauge labels rather than restated, so a
 *  suggestion can never name an area differently from the gauge it points at. */
export const AREA_LABEL: Record<LifeAreaKey, string> = {
  career: AREA_META.career.label,
  wealth: AREA_META.wealth.label,
  relationship: AREA_META.relationship.label,
  health: AREA_META.health.label,
};

/** Stable order, used only to break exact ties deterministically. */
const AREA_ORDER: LifeAreaKey[] = ["career", "wealth", "relationship", "health"];

type AreaWeights = Partial<Record<LifeAreaKey, number>>;

/** Ten-God group → life area, taken from lifeAreas.ts's own routing (see header). */
const GOD_AREAS: Record<GodGroup, AreaWeights> = {
  officer: { career: 1 },
  resource: { career: 0.5, health: 0.5 },
  wealth: { wealth: 1 },
  // Output routes to the health gauge INSIDE the engine, but as evidence of what
  // a person cares about it says nothing: 出行 (travel) is an Output objective
  // whose tag names no domain, so routing Output here made every saved travel
  // plan read as 100% "Wellbeing is your top priority". It carries no area
  // evidence of its own — see the travel note under TAG_AREAS.
  output: {},
  companion: { relationship: 0.5 },
};

/** Almanac activity → the life domain it names, where the Ten-God bias can't. */
const TAG_AREAS: Partial<Record<ActivityTag, AreaWeights>> = {
  marry: { relationship: 1.5 }, // 嫁娶
  medical: { health: 1.5 }, // 求醫
  study: { career: 0.75 }, // 入學 — development, routed like Resource
  move: { relationship: 0.75 }, // 入宅 — a household matter
  ground: { relationship: 0.5 }, // 動土 — the home again
  contract: { wealth: 0.5 }, // 納財 / commercial agreement
  open: { wealth: 0.5 }, // 開市
  // travel (出行) and general name no domain, and their godBias carries none
  // either — so they contribute no area evidence at all. A trip can be for work,
  // family, health or none of those; the journal cannot tell which.
};

const add = (into: AreaWeights, from: AreaWeights, factor: number) => {
  for (const [k, v] of Object.entries(from) as [LifeAreaKey, number][]) {
    into[k] = (into[k] ?? 0) + v * factor;
  }
};

/**
 * The life areas one saved decision for this objective is evidence for, summing
 * to 1 (or empty when the objective carries no domain signal at all).
 * Exported so the mapping is inspectable and testable rather than folded away.
 */
export function objectiveAreaWeights(objective: Objective): AreaWeights {
  const tag = TAG_AREAS[objective.primaryTag];
  const raw: AreaWeights = {};
  if (tag) add(raw, tag, 1);
  // Where the activity already names a domain, the Ten-God bias is a supporting
  // hint only — halved so it cannot outvote what the decision is actually about.
  const godFactor = tag ? 0.5 : 1;
  for (const g of objective.godBias) add(raw, GOD_AREAS[g], godFactor);

  const values = Object.values(raw) as number[];
  if (values.length === 0) return {};
  const max = Math.max(...values);
  const kept = (Object.entries(raw) as [LifeAreaKey, number][]).filter(([, v]) => v >= max * 0.4);
  const total = kept.reduce((a, [, v]) => a + v, 0);
  const out: AreaWeights = {};
  for (const [k, v] of kept) out[k] = v / total;
  return out;
}

/** Cached per-objective weights (OBJECTIVES is a module constant). */
const WEIGHTS_BY_ID: Record<string, AreaWeights> = Object.fromEntries(
  OBJECTIVES.map((o) => [o.id, objectiveAreaWeights(o)]),
);

function weightsFor(objectiveId: string): AreaWeights {
  if (objectiveId in WEIGHTS_BY_ID) return WEIGHTS_BY_ID[objectiveId];
  // objectiveById falls back to OBJECTIVES[0] for anything unknown, which would
  // silently invent evidence — so an unrecognised id contributes nothing.
  const obj = OBJECTIVES.find((o) => o.id === objectiveId);
  return obj ? objectiveAreaWeights(obj) : {};
}

/** One objective's contribution to an area's evidence. */
export interface SignalEvidenceItem {
  objectiveId: string;
  /** The label as stored on the entry (falls back to the engine's). */
  label: string;
  count: number;
}

export interface AreaSignal {
  area: LifeAreaKey;
  label: string;
  /** Evidence weight, in "saved decisions" (fractional — one entry can straddle areas). */
  weight: number;
  /** How many saved decisions contributed to this area at all. */
  entries: number;
  /** How many of those the user came back to and logged an outcome for. */
  withOutcome: number;
  /** 0–100 share of the journal's total evidence sitting in this area. */
  share: number;
  /** Which decisions produced it, most-used first. */
  contributors: SignalEvidenceItem[];
  /** A ready-to-render, honest evidence sentence. */
  evidence: string;
}

export interface JournalSignals {
  /** Entries that carried any life-area signal (a general day reading carries none). */
  consideredEntries: number;
  /** Total entries looked at. */
  totalEntries: number;
  /** False until the journal clears the minimum-evidence bar. */
  enoughEvidence: boolean;
  minEntries: number;
  /** Ranked suggestions that cleared every threshold (0–2 of them). */
  suggestions: AreaSignal[];
  /** Every area's standing, ranked — for debugging and tests, not for display. */
  ranked: AreaSignal[];
  /** Honest framing to render with the cards. */
  note: string;
}

export interface DeriveOptions {
  /** Areas to leave out — already in the profile, or dismissed by the user. */
  exclude?: readonly LifeAreaKey[];
  /** Minimum journal entries before anything is suggested at all. */
  minEntries?: number;
  /** Minimum saved decisions touching an area before it can be suggested. */
  minAreaEntries?: number;
  /** Minimum evidence weight (in whole saved decisions) for an area. */
  minAreaWeight?: number;
  /** How many suggestions to return at most. */
  limit?: number;
}

const DEFAULTS = { minEntries: 3, minAreaEntries: 3, minAreaWeight: 2, limit: 2 };

const NOTE =
  "This is a suggestion from your own saved decisions — a product feature, not part of the classical reading. " +
  "Nothing is added to your priorities unless you add it, and priorities never change a day's score.";

function evidenceSentence(area: AreaSignal): string {
  const decisions = `${area.entries} saved decision${area.entries === 1 ? "" : "s"}`;
  const top = area.contributors
    .slice(0, 2)
    .map((c) => `${c.count} × ${c.label}`)
    .join(", ");
  const more = area.contributors.length > 2 ? ", and others" : "";
  const outcome = area.withOutcome > 0 ? ` You logged an outcome for ${area.withOutcome} of them.` : "";
  return `${decisions} point here — ${top}${more}.${outcome}`;
}

/**
 * Derive priority suggestions from the decision journal. Pure: no storage, no
 * clock, no side effects. The caller decides what to show and the USER decides
 * what to keep.
 */
export function deriveSignals(entries: readonly JournalEntry[], options: DeriveOptions = {}): JournalSignals {
  const minEntries = options.minEntries ?? DEFAULTS.minEntries;
  const minAreaEntries = options.minAreaEntries ?? DEFAULTS.minAreaEntries;
  const minAreaWeight = options.minAreaWeight ?? DEFAULTS.minAreaWeight;
  const limit = options.limit ?? DEFAULTS.limit;
  const exclude = new Set(options.exclude ?? []);

  const acc = new Map<
    LifeAreaKey,
    { weight: number; entries: number; withOutcome: number; byObjective: Map<string, SignalEvidenceItem> }
  >();
  let considered = 0;
  let totalWeight = 0;

  for (const e of entries) {
    const weights = weightsFor(e.objectiveId);
    const pairs = Object.entries(weights) as [LifeAreaKey, number][];
    if (pairs.length === 0) continue; // e.g. a general day reading — no signal
    considered += 1;
    for (const [area, w] of pairs) {
      const bucket =
        acc.get(area) ?? { weight: 0, entries: 0, withOutcome: 0, byObjective: new Map<string, SignalEvidenceItem>() };
      bucket.weight += w;
      bucket.entries += 1;
      if (e.outcome) bucket.withOutcome += 1;
      const label = e.objectiveLabel || objectiveById(e.objectiveId).label;
      const item = bucket.byObjective.get(e.objectiveId) ?? { objectiveId: e.objectiveId, label, count: 0 };
      item.count += 1;
      bucket.byObjective.set(e.objectiveId, item);
      acc.set(area, bucket);
      totalWeight += w;
    }
  }

  const ranked: AreaSignal[] = [...acc.entries()]
    .map(([area, b]) => {
      const contributors = [...b.byObjective.values()].sort(
        (x, y) => y.count - x.count || x.objectiveId.localeCompare(y.objectiveId),
      );
      const signal: AreaSignal = {
        area,
        label: AREA_LABEL[area],
        weight: Math.round(b.weight * 100) / 100,
        entries: b.entries,
        withOutcome: b.withOutcome,
        share: totalWeight > 0 ? Math.round((b.weight / totalWeight) * 100) : 0,
        contributors,
        evidence: "",
      };
      signal.evidence = evidenceSentence(signal);
      return signal;
    })
    .sort(
      (a, b) =>
        b.weight - a.weight ||
        b.entries - a.entries ||
        AREA_ORDER.indexOf(a.area) - AREA_ORDER.indexOf(b.area),
    );

  const enoughEvidence = considered >= minEntries;
  const suggestions = enoughEvidence
    ? ranked
        .filter((s) => !exclude.has(s.area) && s.entries >= minAreaEntries && s.weight >= minAreaWeight)
        .slice(0, Math.max(0, limit))
    : [];

  return {
    consideredEntries: considered,
    totalEntries: entries.length,
    enoughEvidence,
    minEntries,
    suggestions,
    ranked,
    note: NOTE,
  };
}
