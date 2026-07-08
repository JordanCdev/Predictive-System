/**
 * Layer 2b — Stem & branch interaction engine (合/沖/刑/害/破 + 三合/三會).
 *
 * Deterministic reference tables and detectors for the classical Heavenly-Stem
 * and Earthly-Branch relationships, used by the period/forecast layer to read a
 * luck pillar / annual pillar / month pillar against the natal chart. Pure
 * lookup functions over the symbol tables — no astronomy, no scoring, no prose.
 *
 * Indices follow the engine convention: branches 子=0..亥=11, stems 甲=0..癸=9.
 * Member lists corroborated across classical sources (see docs/ROADMAP.md §B1).
 * Where schools genuinely disagree the choice is documented at the table:
 *   - 午未 six-combination element: defaulted to Fire (most-cited).
 *   - 破 (destruction): computed but weighted lowest; callers may ignore it.
 */

import {
  BRANCHES,
  FivePhase,
  STEMS,
  SIX_HARMONY_PAIRS,
  THREE_HARMONY,
  THREE_MEETING,
  mod,
} from "./symbols.ts";

// ── Stem interactions (天干) ─────────────────────────────────────────────────

const EARTH_STEMS = new Set([4, 5]); // 戊 己 — the centre; no directional clash
const STEM_COMBINE_ELEMENT: FivePhase[] = ["earth", "metal", "water", "wood", "fire"];

/** 天干五合 — a stem combines with the one 5 positions away. Returns the element
 *  it *can* transform into (combination ≠ guaranteed transformation), or null. */
export function stemCombination(a: number, b: number): FivePhase | null {
  if (mod(a - b, 10) !== 5) return null;
  return STEM_COMBINE_ELEMENT[Math.min(mod(a, 10), mod(b, 10)) % 5];
}

/** 天干四沖 — same-polarity, mutually-controlling clash across the compass.
 *  甲庚 乙辛 丙壬 丁癸 only; 戊己 (Earth) never clash. */
export function stemClash(a: number, b: number): boolean {
  if (EARTH_STEMS.has(mod(a, 10)) || EARTH_STEMS.has(mod(b, 10))) return false;
  return mod(a - b, 10) === 6 || mod(b - a, 10) === 6;
}

// ── Branch interaction tables (地支) ─────────────────────────────────────────

/** 六害 — Six Harms (子未 丑午 寅巳 卯辰 申亥 酉戌). */
const SIX_HARM_PAIRS: [number, number][] = [
  [0, 7], [1, 6], [2, 5], [3, 4], [8, 11], [9, 10],
];

/** 破 — Destruction (weakest; often ignored). 子酉 丑辰 寅亥 卯午 巳申 未戌. */
const DESTRUCTION_PAIRS: [number, number][] = [
  [0, 9], [1, 4], [2, 11], [3, 6], [5, 8], [7, 10],
];

/** 相刑 — three-member punishment groups + the 子卯 pair + self-punishments. */
const PUNISH_GROUPS: number[][] = [
  [2, 5, 8], // 寅巳申 無恩 (ungrateful)
  [1, 10, 7], // 丑戌未 恃勢 (bullying)
];
const PUNISH_PAIR: [number, number] = [0, 3]; // 子卯 無禮 (rude)
const SELF_PUNISH = new Set([4, 6, 9, 11]); // 辰 午 酉 亥 自刑

// ── Interaction records ──────────────────────────────────────────────────────

export type BranchInteractionType =
  | "three_meeting"
  | "three_harmony"
  | "three_harmony_half"
  | "six_harmony"
  | "six_clash"
  | "six_harm"
  | "punishment"
  | "self_punishment"
  | "destruction";

/** Precedence weight (higher = stronger); drives the resolution pass and any
 *  "which relation dominates" display. 三會 > 三合 > 刑 > 六沖 > 半三合 >
 *  自刑 > 六合 > 六害 > 破. */
export const INTERACTION_STRENGTH: Record<BranchInteractionType, number> = {
  three_meeting: 9,
  three_harmony: 8,
  punishment: 7,
  six_clash: 6,
  three_harmony_half: 5,
  self_punishment: 4,
  six_harmony: 3,
  six_harm: 2,
  destruction: 1,
};

export interface NatalBranch {
  index: number;
  position: "year" | "month" | "day" | "hour";
}

export interface BranchHit {
  type: BranchInteractionType;
  /** Pooled/resultant element for combinations & meetings. */
  element?: FivePhase;
  /** Natal branches (indices) involved, and their pillar positions. */
  natalBranches: number[];
  natalPositions: NatalBranch["position"][];
  strength: number;
  /** Set by resolveBranchHits() when a stronger combination neutralises a clash. */
  attenuated?: boolean;
  note?: string;
}

function pairKey(a: number, b: number): string {
  return [a, b].sort((x, y) => x - y).join(",");
}
const HARM_KEYS = new Set(SIX_HARM_PAIRS.map(([a, b]) => pairKey(a, b)));
const PO_KEYS = new Set(DESTRUCTION_PAIRS.map(([a, b]) => pairKey(a, b)));

/**
 * All interactions of a single EXTERNAL branch (a luck / annual / month branch)
 * against the multiset of NATAL branches. Triples (三合/三會) fire when the
 * external branch completes a group two natal branches already partly form;
 * half-三合 fires only when the external + one natal branch include the group's
 * cardinal (子午卯酉) — the "no central qi" halves are intentionally omitted.
 */
export function branchAgainstNatal(external: number, natal: NatalBranch[]): BranchHit[] {
  const hits: BranchHit[] = [];
  const ext = mod(external, 12);
  const uniqNatal = (idxs: number[]) => natal.filter((n) => idxs.includes(n.index));

  // --- Triples: 三會 (directional) then 三合 (harmony) ---
  const tripleGroups: { list: { branches: number[]; element: FivePhase }[]; type: BranchInteractionType }[] = [
    { list: THREE_MEETING, type: "three_meeting" },
    { list: THREE_HARMONY, type: "three_harmony" },
  ];
  const usedInTriple = new Set<number>(); // natal branches locked into a completed triple
  for (const { list, type } of tripleGroups) {
    for (const g of list) {
      if (!g.branches.includes(ext)) continue;
      const others = g.branches.filter((b) => b !== ext);
      const natalOthers = others.filter((b) => natal.some((n) => n.index === b));
      if (natalOthers.length === others.length) {
        // full triple completed by the external branch
        const involved = uniqNatal(natalOthers);
        involved.forEach((n) => usedInTriple.add(n.index));
        hits.push({
          type,
          element: g.element,
          natalBranches: involved.map((n) => n.index),
          natalPositions: involved.map((n) => n.position),
          strength: INTERACTION_STRENGTH[type],
        });
      } else if (type === "three_harmony" && natalOthers.length === 1) {
        // half three-harmony — only counts if the pair includes the cardinal (index 1 of the group)
        const cardinal = g.branches[1];
        const pair = [ext, natalOthers[0]];
        if (pair.includes(cardinal)) {
          const involved = uniqNatal(natalOthers);
          hits.push({
            type: "three_harmony_half",
            element: g.element,
            natalBranches: involved.map((n) => n.index),
            natalPositions: involved.map((n) => n.position),
            strength: INTERACTION_STRENGTH.three_harmony_half,
          });
        }
      }
    }
  }

  // --- Group punishments 刑 (寅巳申 / 丑戌未): external + ≥1 natal covering ≥2 members ---
  for (const grp of PUNISH_GROUPS) {
    if (!grp.includes(ext)) continue;
    const natalInGrp = natal.filter((n) => grp.includes(n.index) && n.index !== ext);
    if (natalInGrp.length >= 1) {
      hits.push({
        type: "punishment",
        natalBranches: natalInGrp.map((n) => n.index),
        natalPositions: natalInGrp.map((n) => n.position),
        strength: INTERACTION_STRENGTH.punishment,
        note: natalInGrp.length === 1 ? "partial punishment (2 of 3 present)" : undefined,
      });
    }
  }

  // --- Pairwise relations against each natal branch ---
  for (const n of natal) {
    const key = pairKey(ext, n.index);

    // self-punishment: external equals a natal branch that self-punishes
    if (ext === n.index && SELF_PUNISH.has(ext)) {
      hits.push({ type: "self_punishment", natalBranches: [n.index], natalPositions: [n.position], strength: INTERACTION_STRENGTH.self_punishment });
    }
    // 子卯 rude punishment
    if (key === pairKey(PUNISH_PAIR[0], PUNISH_PAIR[1])) {
      hits.push({ type: "punishment", natalBranches: [n.index], natalPositions: [n.position], strength: INTERACTION_STRENGTH.punishment, note: "子卯 punishment" });
    }
    // 六沖
    if (mod(ext - n.index, 12) === 6) {
      hits.push({ type: "six_clash", natalBranches: [n.index], natalPositions: [n.position], strength: INTERACTION_STRENGTH.six_clash });
    }
    // 六合
    for (const p of SIX_HARMONY_PAIRS) {
      if (p.branches.includes(ext) && p.branches.includes(n.index) && ext !== n.index) {
        hits.push({ type: "six_harmony", element: p.element, natalBranches: [n.index], natalPositions: [n.position], strength: INTERACTION_STRENGTH.six_harmony });
      }
    }
    // 六害
    if (ext !== n.index && HARM_KEYS.has(key)) {
      hits.push({ type: "six_harm", natalBranches: [n.index], natalPositions: [n.position], strength: INTERACTION_STRENGTH.six_harm });
    }
    // 破 (lowest priority)
    if (ext !== n.index && PO_KEYS.has(key)) {
      hits.push({ type: "destruction", natalBranches: [n.index], natalPositions: [n.position], strength: INTERACTION_STRENGTH.destruction });
    }
  }

  return hits;
}

/**
 * Resolution pass — 合解沖: a six-clash is attenuated when the clashed natal
 * branch is "occupied" by a harmony, either (a) a triple the external branch
 * itself completes, or (b) `lockedBranches` — natal branches already bound in
 * the chart's OWN 三合/三會/六合 (pass `chart.elements.interactions` members).
 * Clash records are marked `attenuated` rather than removed, so the caller can
 * still show them, downgraded.
 */
export function resolveBranchHits(hits: BranchHit[], lockedBranches: Set<number> = new Set()): BranchHit[] {
  const combinedBranches = new Set<number>(lockedBranches);
  for (const h of hits) {
    if (h.type === "three_meeting" || h.type === "three_harmony") {
      h.natalBranches.forEach((b) => combinedBranches.add(b));
    }
  }
  if (combinedBranches.size === 0) return hits;
  return hits.map((h) =>
    h.type === "six_clash" && h.natalBranches.some((b) => combinedBranches.has(b))
      ? { ...h, attenuated: true, note: "softened — this branch is bound in a harmony frame (合解沖)" }
      : h,
  );
}

// ── Plain-English labels ─────────────────────────────────────────────────────

export const INTERACTION_LABEL: Record<BranchInteractionType, string> = {
  three_meeting: "Directional frame 三會",
  three_harmony: "Three-Harmony 三合",
  three_harmony_half: "Half-Harmony 半三合",
  six_harmony: "Six-Harmony 六合",
  six_clash: "Clash 六沖",
  six_harm: "Harm 六害",
  punishment: "Punishment 刑",
  self_punishment: "Self-punishment 自刑",
  destruction: "Destruction 破",
};

/** Positive/negative/neutral valence of an interaction TYPE (before element
 *  favourability is considered). Combinations cooperate; clash/harm/punish grate. */
export function interactionPolarity(type: BranchInteractionType): 1 | 0 | -1 {
  switch (type) {
    case "three_meeting":
    case "three_harmony":
    case "three_harmony_half":
    case "six_harmony":
      return 1;
    case "six_clash":
    case "six_harm":
    case "punishment":
    case "self_punishment":
    case "destruction":
      return -1;
  }
}

export { BRANCHES, STEMS };
