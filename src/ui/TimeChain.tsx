/**
 * "How your birth time was read" — the time-correction chain, shown as working.
 *
 * WHY THIS IS PROMINENT
 * Getting from a wall-clock birth time to an hour pillar involves four separate
 * adjustments, each of which a different tool handles differently — and it is the
 * single most-disputed calculation in this field. In practitioner forums and app
 * reviews, "was true solar time applied?" and "does it even ask for a birth
 * place?" are the reflexive first questions when a chart feels wrong, and the
 * market leader reportedly applies no solar correction at all.
 *
 * Every tool asserts an hour pillar. Almost none show how they got there. This
 * does, arithmetic included, so a sceptical user can check each step against
 * their own understanding rather than having to trust the total.
 */
import { ConventionSet } from "../engine/index.ts";
import { labelFor } from "../engine/timezone.ts";

export interface TimeChainInput {
  /** As the user recorded it, e.g. "23:30". */
  recordedTime: string;
  /** Minutes east of UTC in force at birth (already DST-resolved). */
  tzOffsetMinutes: number;
  birthCity?: string;
  longitudeEast?: number;
  /** Total solar correction the engine applied, in minutes. */
  solarCorrectionMinutes: number;
  /** Effective local wall time after correction. */
  effective: { hour: number; minute: number };
  convention: ConventionSet;
  /** The resulting hour pillar, for the final line. */
  hourPillar: string;
  /** True when the birth time was never supplied. */
  timeUnknown: boolean;
}

const hhmm = (h: number, m: number) => `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
const signed = (n: number) => `${n >= 0 ? "+" : "−"}${Math.abs(Math.round(n))} min`;

export function TimeChain(p: TimeChainInput) {
  if (p.timeUnknown) {
    return (
      <div className="timechain">
        <div className="tc-head">How your birth time was read</div>
        <p className="tc-unknown">
          No birth time was given, so there is no hour pillar to derive — the engine used noon purely to place the day
          and says so rather than inventing an hour. Everything above the hour line still holds.
        </p>
      </div>
    );
  }

  const zoneMeridian = (p.tzOffsetMinutes / 60) * 15;
  const longitudePart =
    p.longitudeEast !== undefined ? (p.longitudeEast - zoneMeridian) * 4 : null;
  // The engine adds longitude + equation-of-time together; recover the EoT part
  // rather than recomputing it, so this panel can never disagree with the engine.
  const eotPart =
    p.convention.hourBasis === "true_solar" && longitudePart !== null
      ? p.solarCorrectionMinutes - longitudePart
      : p.convention.hourBasis === "true_solar"
        ? p.solarCorrectionMinutes
        : null;

  const steps: { label: string; value: string; note: string }[] = [
    {
      label: "Recorded birth time",
      value: p.recordedTime,
      note: p.birthCity ? `as written, local clock time in ${p.birthCity}` : "as written, local clock time",
    },
    {
      label: "Clock in force that day",
      value: labelFor(p.tzOffsetMinutes),
      note: "resolved from the birth date, including any summer time then in force",
    },
  ];

  if (p.convention.hourBasis === "civil_clock") {
    steps.push({
      label: "Solar correction",
      value: "none",
      note: "this convention reads the civil clock directly — no longitude or equation-of-time adjustment",
    });
  } else {
    steps.push({
      label: "Longitude vs zone meridian",
      value: longitudePart === null ? "not applied" : signed(longitudePart),
      note:
        longitudePart === null
          ? "no birth longitude given, so the meridian offset could not be applied"
          : `${p.longitudeEast!.toFixed(2)}°E against the zone meridian ${zoneMeridian.toFixed(1)}°, at 4 min per degree`,
    });
    if (p.convention.hourBasis === "true_solar") {
      steps.push({
        label: "Equation of time",
        value: eotPart === null ? "not applied" : signed(eotPart),
        note: "the real Sun runs ahead of or behind the mean Sun by up to ~16 min across the year (真太陽時)",
      });
    }
  }

  steps.push({
    label: "Effective solar time",
    value: hhmm(p.effective.hour, p.effective.minute),
    note: `total adjustment ${signed(p.solarCorrectionMinutes)} — this is the time the hour pillar is read from`,
  });

  return (
    <div className="timechain">
      <div className="tc-head">How your birth time was read</div>
      <ol className="tc-steps">
        {steps.map((s) => (
          <li key={s.label}>
            <div className="tc-row">
              <span className="tc-label">{s.label}</span>
              <b className="tc-value">{s.value}</b>
            </div>
            <div className="tc-note">{s.note}</div>
          </li>
        ))}
      </ol>
      <div className="tc-result">
        Hour pillar <b>{p.hourPillar}</b> · doctrine <span className="tc-conv">{p.convention.label}</span>
      </div>
      <p className="tc-foot">
        Tools disagree about charts mostly because they disagree about these four lines, silently. Each step is shown so
        you can check ours against whatever you're comparing it with.
      </p>
    </div>
  );
}
