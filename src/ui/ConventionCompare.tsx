/**
 * Side-by-side four-pillar comparison: true solar time vs the civil clock.
 *
 * WHY: the app's default convention (ziping_true_solar_v1) shifts the hour
 * pillar relative to mainstream civil-clock calculators in a majority of charts
 * (and, rarely, the day pillar near midnight). Users who cross-check against
 * another app read that difference as OUR error unless we show both readings
 * and say plainly which school each belongs to.
 *
 * FREE for everyone — honesty and transparency are never gated (tier rule).
 */
import {
  ConventionSet,
  ZIPING_DEFAULT,
  ZIPING_TRUE_SOLAR,
  buildFourPillars,
  canonicalizeBirth,
} from "../engine/index.ts";
import type { Person } from "./PersonalizeCard.tsx";

export interface ConventionPillarSet {
  /** Year, month, day, hour — hanzi pairs. */
  pillars: [string, string, string, string];
  /** What was actually applied — true_solar downgrades to civil_clock when no longitude is known. */
  effectiveHourBasis: ConventionSet["hourBasis"];
}

/** Compute a person's four pillars under an explicit convention preset — the
 *  exact canonicalisation path the rest of the app uses. Null when the birth
 *  details can't produce a chart. Pure and framework-free, so tests can call it. */
export function pillarsUnderConvention(person: Person, requested: ConventionSet): ConventionPillarSet | null {
  try {
    const canonical = canonicalizeBirth(
      {
        dateOfBirth: person.birthDate,
        localBirthTime: person.timeCertainty === "hour_unknown" ? undefined : person.birthTime,
        tzOffsetMinutes: person.tzOffset,
        birthplace: person.birthCity,
        longitudeEast: person.longitudeEast,
        timeAccuracy: person.timeCertainty,
        sex: person.sex,
      },
      requested,
    );
    if (!canonical.valid || !canonical.moment) return null;
    const fp = buildFourPillars(canonical.moment, canonical.convention);
    return {
      pillars: [fp.year.hanzi, fp.month.hanzi, fp.day.hanzi, fp.hour.hanzi],
      effectiveHourBasis: canonical.convention.hourBasis,
    };
  } catch {
    return null;
  }
}

const PILLAR_HEADS = ["Year 年", "Month 月", "Day 日", "Hour 時"];

export function ConventionCompare({
  person,
  onSwitchConvention,
}: {
  person: Person;
  /** Writes the chosen preset id back onto the person (one tap, no re-entry). */
  onSwitchConvention: (conventionId: string) => void;
}) {
  // Without an hour the two schools can't meaningfully differ — nothing to compare.
  if (person.timeCertainty === "hour_unknown") return null;

  const solar = pillarsUnderConvention(person, ZIPING_TRUE_SOLAR);
  const civil = pillarsUnderConvention(person, ZIPING_DEFAULT);
  if (!solar || !civil) return null;

  const differing = [0, 1, 2, 3].filter((i) => solar.pillars[i] !== civil.pillars[i]);
  const usingSolar = person.conventionId === ZIPING_TRUE_SOLAR.id;
  const usingCivil = person.conventionId === ZIPING_DEFAULT.id;

  const row = (label: string, set: ConventionPillarSet, inUse: boolean) => (
    <>
      <span style={{ fontSize: 12.5, color: "var(--muted)", alignSelf: "center" }}>
        {label}
        {inUse ? " · in use" : ""}
      </span>
      {set.pillars.map((p, i) => (
        <span
          key={i}
          style={{
            textAlign: "center",
            padding: "4px 2px",
            borderRadius: 6,
            fontSize: 16,
            opacity: inUse ? 1 : 0.75,
            background: differing.includes(i) ? "var(--gold-soft)" : "transparent",
            fontWeight: differing.includes(i) ? 600 : 400,
          }}
        >
          {p}
        </span>
      ))}
    </>
  );

  return (
    <div style={{ marginTop: 14, borderTop: "1px solid var(--warn-border)", paddingTop: 12 }}>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Checking against another app?</div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(90px, auto) repeat(4, 1fr)",
          gap: "2px 6px",
          alignItems: "stretch",
        }}
      >
        <span />
        {PILLAR_HEADS.map((h) => (
          <span key={h} style={{ textAlign: "center", fontSize: 11.5, color: "var(--muted)" }}>
            {h}
          </span>
        ))}
        {row("True solar 真太陽時", solar, usingSolar)}
        {row("Civil clock", civil, usingCivil)}
      </div>
      <p style={{ fontSize: 12.5, color: "var(--muted)", margin: "8px 0" }}>
        {solar.effectiveHourBasis !== "true_solar"
          ? // Solar could not run (no longitude) — the rows coincide because both
            // fell back to the civil clock, NOT because the choice is inert.
            "Both rows currently read the civil clock: true solar time needs your birth place. Add your birth city or longitude and this choice can shift the hour (occasionally the day) pillar."
          : differing.length === 0
          ? "Your pillars come out identical under both, so this choice doesn't change your chart."
          : "Most other apps use the civil clock; we default to true solar time — both are legitimate schools. The highlighted pillars are where they differ for your birth."}
        {!usingSolar && !usingCivil &&
          " You're currently on a practitioner preset; switching below replaces it with one of these two."}
      </p>
      <div className="seg" style={{ maxWidth: 340 }}>
        <button
          className={usingSolar ? "on" : ""}
          aria-pressed={usingSolar}
          onClick={() => onSwitchConvention(ZIPING_TRUE_SOLAR.id)}
        >
          Use true solar
        </button>
        <button
          className={usingCivil ? "on" : ""}
          aria-pressed={usingCivil}
          onClick={() => onSwitchConvention(ZIPING_DEFAULT.id)}
        >
          Use civil clock
        </button>
      </div>
    </div>
  );
}
