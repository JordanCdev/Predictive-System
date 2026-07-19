/**
 * The boundary disclosure — both candidate charts, side by side.
 *
 * A birth near 立春, a 節, or the 23:00 子 seam is genuinely ambiguous, and the
 * ambiguity is in the birth record rather than the calculation. Every other tool
 * in this category silently picks a side, which turns a known unknown into a
 * hidden error — and it is the single biggest reason two BaZi tools disagree
 * about the same person.
 *
 * So this is deliberately prominent rather than a footnote at the bottom of the
 * chart card, where the warning used to live. A user whose whole reading might
 * hinge on a ten-minute recording error should be told before they read it, not
 * after — and shown the other chart so they can go and check their birth record.
 */
import { BoundaryAlternative, PillarPosition } from "../engine/index.ts";

const POSITION_LABEL: Record<PillarPosition, string> = {
  year: "Year",
  month: "Month",
  day: "Day",
  hour: "Hour",
};
const ORDER: PillarPosition[] = ["year", "month", "day", "hour"];

export function BoundaryNotice({
  alternatives,
  primary,
  compact = false,
}: {
  alternatives: BoundaryAlternative[];
  /** The primary chart's four pillars, year→hour. */
  primary: [string, string, string, string];
  /** Single-line form for dense pages. */
  compact?: boolean;
}) {
  if (alternatives.length === 0) return null;

  if (compact) {
    return (
      <div className="boundary-strip">
        <span aria-hidden="true">⚠</span>
        <span>
          Your birth sits near a pillar boundary — <b>{alternatives[0].differs.map((d) => POSITION_LABEL[d]).join(" and ")}</b>{" "}
          {alternatives[0].differs.length > 1 ? "pillars depend" : "pillar depends"} on a detail of your birth record.{" "}
          <a href="#/settings/profile">See both readings</a>
        </span>
      </div>
    );
  }

  return (
    <div className="boundary-notice">
      <div className="boundary-head">
        <span className="boundary-tag" aria-hidden="true">⚠</span>
        <div>
          <b>Your birth sits on a boundary — two readings are defensible.</b>
          <p>
            This is not a flaw in the calculation. A birth recorded near one of these seams is genuinely ambiguous, and
            the answer lives in your birth record rather than in the astronomy. Both charts are shown so you can check.
          </p>
        </div>
      </div>

      {alternatives.map((alt, i) => (
        <div className="boundary-case" key={i}>
          <p className="boundary-why">{alt.flag.message}</p>
          <div className="chart-compare">
            <div className="cc-col">
              <div className="cc-label">As calculated</div>
              {ORDER.map((pos, idx) => (
                <div className={`cc-cell${alt.differs.includes(pos) ? " changed" : ""}`} key={pos}>
                  <span className="cc-pos">{POSITION_LABEL[pos]}</span>
                  <b>{primary[idx]}</b>
                </div>
              ))}
            </div>
            <div className="cc-col alt">
              <div className="cc-label">{alt.scenario}</div>
              {ORDER.map((pos, idx) => (
                <div className={`cc-cell${alt.differs.includes(pos) ? " changed" : ""}`} key={pos}>
                  <span className="cc-pos">{POSITION_LABEL[pos]}</span>
                  <b>{alt.pillars[idx]}</b>
                </div>
              ))}
            </div>
          </div>
          <p className="boundary-effect">
            {alt.differs.length === 1
              ? `The ${POSITION_LABEL[alt.differs[0]].toLowerCase()} pillar changes.`
              : `${alt.differs.map((d) => POSITION_LABEL[d]).join(" and ")} pillars change.`}{" "}
            {alt.differs.includes("day")
              ? "The Day pillar is your Day Master, so this alters the whole personal reading — not just one line of it."
              : alt.differs.includes("year")
                ? "The year pillar carries into the month stem (五虎遁), so more than one column moves."
                : "Everything else in your chart is unaffected."}
          </p>
        </div>
      ))}

      <p className="boundary-advice">
        If you can, check the exact recorded time against a birth certificate or hospital record. If you can't, treat
        the reading as provisional where the pillars above differ — we'd rather say so than pick a side and sound
        certain.
      </p>
    </div>
  );
}
