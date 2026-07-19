/**
 * Boundary proximity — and the chart you'd get on the other side.
 *
 * WHY THIS EXISTS
 * A birth recorded a few minutes from a pillar boundary is *genuinely* ambiguous,
 * and no amount of astronomical precision fixes it: the uncertainty is in the
 * birth record, not the ephemeris. Three seams matter:
 *
 *   - 立春 — crossing it changes the YEAR pillar, and via 五虎遁 the month stem too.
 *   - 節 (jie) — crossing it changes the MONTH pillar.
 *   - the 子 hour seam at 23:00 — the day-boundary convention decides whether the
 *     DAY pillar (and via 五鼠遁 the hour stem) belongs to today or tomorrow.
 *
 * Most tools silently pick one side. That converts a known unknown into a hidden
 * error, and it is the top reason two BaZi tools disagree about the same person.
 *
 * This module instead computes **both candidate charts** and reports exactly what
 * differs, so the ambiguity becomes a visible, checkable fact — something the
 * user can resolve against their own birth record rather than something we
 * quietly decide for them.
 *
 * Pure and deterministic: no clock, no I/O. The alternative is produced by
 * re-running `buildFourPillars` with an explicitly perturbed input.
 */
import { ConventionSet } from "./conventions.ts";
import { FourPillars, MomentInput, buildFourPillars } from "./sexagenary.ts";

export type BoundaryKind = "lichun" | "jie" | "zi_hour";

export type PillarPosition = "year" | "month" | "day" | "hour";

export interface BoundaryFlag {
  kind: BoundaryKind;
  /** Minutes between the birth instant and the boundary. Null for the Zi seam,
   *  which is a doctrinal fork rather than a distance from an instant. */
  minutesAway: number | null;
  /** The pillar whose value is at stake. */
  affects: PillarPosition;
  /** One-line, plain-English statement of the ambiguity. */
  message: string;
}

export interface BoundaryAlternative {
  flag: BoundaryFlag;
  /** Short label for what produced the alternative reading. */
  scenario: string;
  /** The four pillars under the alternative, in year/month/day/hour order. */
  pillars: [string, string, string, string];
  /** Positions that actually differ from the primary chart. */
  differs: PillarPosition[];
}

const POSITIONS: PillarPosition[] = ["year", "month", "day", "hour"];

/** The three defensible answers to "where does the BaZi day begin?". */
const ZI_SCHOOLS = ["civil_midnight", "zi_23", "split_zi"] as const;

const ZI_SCENARIO: Record<(typeof ZI_SCHOOLS)[number], string> = {
  civil_midnight: "if the day is taken to start at midnight",
  zi_23: "if the whole day is taken to start at 23:00 (早子時)",
  split_zi: "if only the hour stem rolls at 23:00 (晚子時)",
};

const pillarsOf = (fp: FourPillars): [string, string, string, string] => [
  fp.year.hanzi,
  fp.month.hanzi,
  fp.day.hanzi,
  fp.hour.hanzi,
];

/** Shift a moment by whole minutes, normalising the calendar via UTC. */
function shiftMinutes(m: MomentInput, minutes: number): MomentInput {
  const at = Date.UTC(m.year, m.month - 1, m.day, m.hour, m.minute) + minutes * 60_000;
  const d = new Date(at);
  return {
    ...m,
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    hour: d.getUTCHours(),
    minute: d.getUTCMinutes(),
  };
}

/**
 * The alternative chart(s) implied by every boundary this birth sits near.
 *
 * For a solar-term seam (立春 / 節) the alternative is what the chart would be if
 * the recorded time were on the other side — computed by stepping the input just
 * past the boundary, which is exactly the error a rounded or misremembered birth
 * time introduces.
 *
 * For the Zi seam the alternative is the *other day-boundary convention*, since
 * both readings are defensible schools rather than one being a recording error.
 */
export function boundaryAlternatives(
  m: MomentInput,
  conv: ConventionSet,
  primary: FourPillars,
): BoundaryAlternative[] {
  const flags = primary.meta.boundaryFlags ?? [];
  const base = pillarsOf(primary);
  const out: BoundaryAlternative[] = [];

  for (const flag of flags) {
    let alt: FourPillars | null = null;
    let scenario = "";

    if (flag.kind === "zi_hour") {
      // Three schools disagree here, not two — so offer every *other* one whose
      // reading actually differs, rather than an arbitrary opposite.
      for (const boundary of ZI_SCHOOLS) {
        if (boundary === conv.dayBoundary) continue;
        const candidate = buildFourPillars(m, { ...conv, dayBoundary: boundary } as ConventionSet);
        const candidatePillars = pillarsOf(candidate);
        const changed = POSITIONS.filter((_, i) => candidatePillars[i] !== base[i]);
        if (changed.length === 0) continue;
        out.push({ flag, scenario: ZI_SCENARIO[boundary], pillars: candidatePillars, differs: changed });
      }
      continue;
    } else if (flag.minutesAway !== null) {
      // Step just past the boundary — a minute beyond it, in whichever direction
      // the boundary lies. `minutesAway` is unsigned, so try both and keep the
      // one that actually moves the pillar at stake.
      const delta = Math.ceil(flag.minutesAway) + 1;
      for (const signed of [delta, -delta]) {
        const candidate = buildFourPillars(shiftMinutes(m, signed), conv);
        const idx = POSITIONS.indexOf(flag.affects);
        if (pillarsOf(candidate)[idx] !== base[idx]) {
          alt = candidate;
          scenario =
            signed > 0
              ? `if the birth were ${delta} min later (past the boundary)`
              : `if the birth were ${delta} min earlier (before the boundary)`;
          break;
        }
      }
    }

    if (!alt) continue;
    const altPillars = pillarsOf(alt);
    const differs = POSITIONS.filter((_, i) => altPillars[i] !== base[i]);
    // A "boundary" that changes nothing is not worth showing.
    if (differs.length === 0) continue;
    out.push({ flag, scenario, pillars: altPillars, differs });
  }

  // 立春 IS a 節, so a birth at that instant trips both flags and produced two
  // entries with identical pillars and identical wording — the same doubt stated
  // twice, which reads like two separate problems.
  const seen = new Set<string>();
  return out.filter((a) => {
    const key = `${a.scenario}|${a.pillars.join(",")}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** True when any flag puts a whole pillar in doubt — the case worth interrupting for. */
export function hasStructuralAmbiguity(flags: BoundaryFlag[] | undefined): boolean {
  return (flags ?? []).some((f) => f.affects !== "hour");
}
