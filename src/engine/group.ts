/**
 * Group day-selection — one date that has to work for several people.
 *
 * Weddings, signings, launches and moves are rarely one person's decision. The
 * classical practice is the same: a date is chosen against *each* participant's
 * chart, and a day that clashes any principal is set aside no matter how well it
 * reads for the others.
 *
 * So the group verdict is deliberately **not** an average. It is bound by the
 * worst reading in the party:
 *   - anyone hard-rejected → the day is out for the group, full stop;
 *   - otherwise the group score is the minimum personal score, with the mean
 *     used only to break ties between days that share a floor.
 *
 * An average would let a day that badly clashes the bride ride on four
 * enthusiastic guests — exactly the error this feature exists to prevent.
 *
 * Deterministic and pure, like the rest of the engine: it consumes already-
 * computed per-person `DecisionResult`s and does no calculation of its own
 * beyond aggregation.
 */
import { DayRecommendation, DecisionResult } from "./decision.ts";
import { verdictBand } from "./plainEnglish.ts";

export interface GroupMember {
  id: string;
  label: string;
  result: DecisionResult;
}

export interface MemberDay {
  id: string;
  label: string;
  score: number;
  band: string;
  hardReject: boolean;
  /** Non-null when the day clashes this person's own chart. */
  clashCeiling: number | null;
  /** The person's own top reason for the day, for the "why" line. */
  reason: string | null;
}

export type GroupConsensus = "strong" | "workable" | "split" | "poor" | "ruled_out";

export interface GroupDay {
  isoDate: string;
  civil: { year: number; month: number; day: number };
  weekday: string;
  members: MemberDay[];
  /** The binding constraint: the lowest personal score in the party. */
  groupScore: number;
  meanScore: number;
  /** Highest minus lowest — how much the party disagrees about this day. */
  spread: number;
  consensus: GroupConsensus;
  /** Labels of anyone the day is hard-rejected or poor for. */
  concerns: string[];
  /** True when at least one member is hard-rejected on this day. */
  ruledOut: boolean;
}

/** Matches the engine's own score precision (decision.ts `round1`). */
const round1 = (n: number) => Math.round(n * 10) / 10;

/** Below this, a day is a real problem for the person rather than merely dull. */
const POOR_SCORE = 45;
/** A spread this wide means the party genuinely disagrees about the day. */
const SPLIT_SPREAD = 22;

function consensusOf(groupScore: number, spread: number, ruledOut: boolean): GroupConsensus {
  if (ruledOut) return "ruled_out";
  if (groupScore < POOR_SCORE) return "poor";
  if (spread >= SPLIT_SPREAD) return "split";
  if (groupScore >= 58) return "strong";
  return "workable";
}

/**
 * Combine per-person results into one ranked list of group days.
 *
 * Only dates present for **every** member are considered — a partial window
 * (someone evaluated over a shorter span) would otherwise silently score a day
 * against fewer people than the user thinks.
 */
export function combineGroupDays(members: GroupMember[]): GroupDay[] {
  if (members.length === 0) return [];

  // Index each member's days, then keep only the dates common to all of them.
  const byMember = members.map((m) => {
    const map = new Map<string, DayRecommendation>();
    for (const day of m.result.allDays) map.set(day.isoDate, day);
    return { member: m, map };
  });
  const [first, ...rest] = byMember;
  const commonDates = [...first.map.keys()].filter((iso) => rest.every((r) => r.map.has(iso))).sort();

  const days: GroupDay[] = [];
  for (const iso of commonDates) {
    const memberDays: MemberDay[] = byMember.map(({ member, map }) => {
      const day = map.get(iso)!;
      return {
        id: member.id,
        label: member.label,
        score: day.recommendationScore,
        band: verdictBand(day.recommendationScore).label,
        hardReject: day.hardReject,
        clashCeiling: day.clashCeiling,
        reason: day.topReasons[0] ?? null,
      };
    });

    // Scores carry one decimal from the engine (round1); keep the aggregates at
    // the same precision so a group figure reads like every other score in the app.
    const scores = memberDays.map((m) => m.score);
    const groupScore = Math.min(...scores);
    const meanScore = round1(scores.reduce((a, b) => a + b, 0) / scores.length);
    const spread = round1(Math.max(...scores) - groupScore);
    const ruledOut = memberDays.some((m) => m.hardReject);
    const concerns = memberDays
      .filter((m) => m.hardReject || m.score < POOR_SCORE)
      .map((m) => m.label);

    const sample = first.map.get(iso)!;
    days.push({
      isoDate: iso,
      civil: sample.civil,
      weekday: sample.weekday,
      members: memberDays,
      groupScore,
      meanScore,
      spread,
      consensus: consensusOf(groupScore, spread, ruledOut),
      concerns,
      ruledOut,
    });
  }
  return days;
}

/**
 * The group's recommended days, best first: never a day that's ruled out for
 * someone, ranked by the floor, then the mean, then earliest.
 */
export function rankGroupDays(days: GroupDay[]): GroupDay[] {
  return days
    .filter((d) => !d.ruledOut)
    .slice()
    .sort(
      (a, b) =>
        b.groupScore - a.groupScore || b.meanScore - a.meanScore || a.isoDate.localeCompare(b.isoDate),
    );
}

/** A one-line, honest summary of how the party sits on a day. */
export function groupVerdictLine(day: GroupDay): string {
  const names = (list: string[]) =>
    list.length === 1 ? list[0] : `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}`;

  if (day.ruledOut) {
    const blocked = day.members.filter((m) => m.hardReject).map((m) => m.label);
    return `Ruled out — this day is vetoed for ${names(blocked)}.`;
  }
  if (day.consensus === "poor") return `Weak for the group — the day reads poorly for ${names(day.concerns)}.`;
  if (day.consensus === "split") {
    const low = day.members.slice().sort((a, b) => a.score - b.score)[0];
    return `Split — good for most, but only ${low.band.toLowerCase()} for ${low.label}.`;
  }
  if (day.consensus === "strong") return "Works for everyone — no one in the party is strained by this day.";
  return "Workable for everyone, without being anyone's standout day.";
}
