/**
 * Layer 4d — Daily life-area tendencies (career / wealth / relationship / health).
 *
 * A deterministic, explanatory-only read of how one external pillar (a day, and
 * by extension a month or year) tilts four life domains, relative to the natal
 * chart. It reuses the period layer's `pillarInfluence` (Ten-God theme × 用神/忌神
 * favourability × branch interactions routed to natal palaces) and re-projects
 * it onto the four areas people actually ask about — the Joey-Yap / BaZi-Fortune
 * "daily gauges" (ROADMAP §5 item 4).
 *
 * Each area is a transparent 0–100 tendency gauge, NOT a probability and NOT a
 * prediction of events. Every gauge pairs with a tendency sentence and carries
 * the not-fate disclaimer. No network, no LLM, no wall clock.
 */

import { BaziChart } from "./bazi.ts";
import { PillarInfluence, pillarInfluence } from "./periods.ts";
import { interactionPolarity } from "./interactions.ts";
import { FivePhase, GanZhi, GodGroup } from "./symbols.ts";
import { elementPlain } from "./plainEnglish.ts";

export type LifeAreaKey = "career" | "wealth" | "relationship" | "health";

export interface LifeAreaScore {
  key: LifeAreaKey;
  label: string;
  hanzi: string;
  /** 0–100 tendency gauge for this area under this pillar. */
  score: number;
  /** One tendency sentence — never a claim that an event will occur. */
  reason: string;
}

export interface LifeAreaReading {
  ganzhi: string;
  areas: LifeAreaScore[];
  disclaimer: string;
}

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

const AREA_META: Record<LifeAreaKey, { label: string; hanzi: string }> = {
  career: { label: "Career", hanzi: "事業" },
  wealth: { label: "Wealth", hanzi: "財富" },
  relationship: { label: "Relationship", hanzi: "感情" },
  health: { label: "Wellbeing", hanzi: "健康" },
};

const LIFE_AREA_DISCLAIMER =
  "Daily gauges are tendencies — where the day's energy tilts each area for you, not forecasts of what will happen.";

type Position = "year" | "month" | "day" | "hour";

/** How strongly the stem's Ten-God group activates a target area, signed by
 *  whether its element helps or strains the chart. */
function groupActivation(inf: PillarInfluence, group: GodGroup): number {
  if (inf.stemGroup !== group) return 0;
  return inf.stemValence > 0 ? 16 : inf.stemValence < 0 ? -8 : 6;
}

/** Net contribution of the branch interactions that land on a natal palace. */
function palace(inf: PillarInfluence, position: Position, fav: FivePhase[]): number {
  let s = 0;
  for (const h of inf.hits) {
    if (!h.natalPositions.includes(position)) continue;
    if (interactionPolarity(h.type) > 0) {
      s += h.element && fav.includes(h.element) ? 8 : 5;
    } else if (h.type === "six_clash") {
      s += h.attenuated ? -6 : -12;
    } else if (h.type === "punishment") {
      s -= 10;
    } else if (h.type === "six_harm" || h.type === "self_punishment") {
      s -= 6;
    } // destruction: negligible
  }
  return s;
}

/** True if any non-attenuated clash/punishment/harm hits the given palace. */
function palaceShaken(inf: PillarInfluence, position: Position): boolean {
  return inf.hits.some(
    (h) =>
      h.natalPositions.includes(position) &&
      interactionPolarity(h.type) < 0 &&
      h.type !== "destruction" &&
      !(h.type === "six_clash" && h.attenuated),
  );
}

/** True if a cooperative harmony lands on the given palace. */
function palaceHarmonised(inf: PillarInfluence, position: Position): boolean {
  return inf.hits.some((h) => h.natalPositions.includes(position) && interactionPolarity(h.type) > 0);
}

/**
 * The four life-area tendency gauges for an external pillar against a chart.
 * `gz` is a day (or month / year) 干支.
 */
export function lifeAreaScores(chart: BaziChart, gz: GanZhi): LifeAreaReading {
  const inf = pillarInfluence(chart, gz);
  const fav = chart.dayMaster.favorableElements;
  const strength = chart.dayMaster.strength;
  const elementTilt = inf.stemValence * 3 + inf.branchValence * 2;
  const stemEl = elementPlain(inf.stemElement);

  // ── Career 事業 — Officer/authority theme, career palace (month). ──
  let career = 50 + elementTilt + groupActivation(inf, "officer") + 0.5 * groupActivation(inf, "resource") + palace(inf, "month", fav);
  let careerReason: string;
  if (inf.stemGroup === "officer") {
    careerReason =
      inf.stemValence >= 0
        ? "Authority and structure are activated and supported — a window for taking on responsibility."
        : "A career theme is active but adds pressure — pace yourself and mind your health.";
  } else if (palaceShaken(inf, "month")) {
    careerReason = "A shake-up around your career palace — expect movement rather than steadiness.";
  } else if (inf.stemGroup === "resource") {
    careerReason = "Learning and mentorship energy backs your career today.";
  } else {
    careerReason = "A steady, unremarkable stretch for career matters.";
  }

  // ── Wealth 財富 — Wealth theme, tempered by whether the Day Master can carry it. ──
  const wealthRaw = groupActivation(inf, "wealth");
  const carry = strength === "weak" ? 0.6 : 1;
  let wealth = 50 + elementTilt + wealthRaw * carry;
  let wealthReason: string;
  if (inf.stemGroup === "wealth") {
    if (strength === "weak") {
      wealth -= 6;
      wealthReason = "Money is in play, but a lighter Day Master can over-reach — commit within your means (財多身弱).";
    } else {
      wealthReason =
        inf.stemValence >= 0
          ? "An effort-and-reward window — income and opportunities tend to open."
          : "Wealth is active but this element strains you — watch outflow and over-commitment.";
    }
  } else {
    wealthReason = "No strong wealth pull today — a neutral stretch for money matters.";
  }

  // ── Relationship 感情 — spouse palace (day branch) + companion friction. ──
  let relationship = 50 + 0.5 * elementTilt + palace(inf, "day", fav) * 1.2;
  let relationshipReason: string;
  if (inf.stemGroup === "companion") relationship -= 6;
  if (palaceShaken(inf, "day")) {
    relationshipReason = "The spouse/partner palace is stirred — a day for care and patience with those close to you.";
  } else if (palaceHarmonised(inf, "day")) {
    relationshipReason = "Cooperative energy on your relationship axis — connection tends to flow.";
  } else if (inf.stemGroup === "companion") {
    relationshipReason = "Peer and rivalry energy is up — good for allies, less so for one-to-one closeness.";
  } else {
    relationshipReason = "A quiet day on the relationship front.";
  }

  // ── Wellbeing 健康 — Day-Master balance + clashes to the self palaces. ──
  let health = 50;
  const g = inf.stemGroup;
  let healthReason: string;
  if (strength === "weak") {
    if (g === "resource" || g === "companion") { health += 12; healthReason = `Restorative ${stemEl} energy supports you — a good day to rest and consolidate.`; }
    else if (g === "output" || g === "wealth" || g === "officer") { health -= 8; healthReason = "A draining theme for a lighter Day Master — protect your energy and don't over-do it."; }
    else healthReason = "A neutral day for your energy levels.";
  } else if (strength === "strong") {
    if (g === "output" || g === "wealth") { health += 10; healthReason = `A good outlet day — channelling ${stemEl} energy suits a well-supported chart.`; }
    else if (g === "resource" || g === "companion") { health -= 6; healthReason = "More of the same element you already hold — you may feel restless or stuck."; }
    else healthReason = "A steady day for your energy levels.";
  } else {
    health += inf.stemValence * 4;
    healthReason = inf.stemValence > 0 ? "The day's energy sits well with your balanced chart." : inf.stemValence < 0 ? "A slightly off-key day energetically — keep to your rhythm." : "A steady day for your energy levels.";
  }
  health += palace(inf, "day", fav) * 0.8 + palace(inf, "hour", fav) * 0.6;
  if (palaceShaken(inf, "day") || palaceShaken(inf, "hour")) {
    healthReason = "A clash touches your self/health palace — go gently and avoid strain.";
  }

  const areas: LifeAreaScore[] = [
    { key: "career", ...AREA_META.career, score: clamp(career), reason: careerReason },
    { key: "wealth", ...AREA_META.wealth, score: clamp(wealth), reason: wealthReason },
    { key: "relationship", ...AREA_META.relationship, score: clamp(relationship), reason: relationshipReason },
    { key: "health", ...AREA_META.health, score: clamp(health), reason: healthReason },
  ];

  return { ganzhi: gz.hanzi, areas, disclaimer: LIFE_AREA_DISCLAIMER };
}
