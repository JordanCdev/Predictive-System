import { DayRecommendation } from "../engine/index.ts";

/** Honest per-day verification strip. The calendar facts (pillar, officer,
 *  day-god) are computed by deterministic, reproducible functions; the personal
 *  interpretation is medium-confidence and school-dependent. (Full third-party
 *  "Almanac cross-checked" badges land with the Phase-2 verification work.) */
export function DayVerification({ rec }: { rec: DayRecommendation }) {
  return (
    <div className="verify-badges" style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 14 }}>
      <span className="pill good" title="The day pillar, 建除 officer and 黄黑道 day-god are computed by pure, reproducible functions from the astronomical calendar.">
        ✓ Calendar · deterministic
      </span>
      {rec.verificationAgreement !== null && (
        <span className="pill good" title="Independent calendar sources (lunar-javascript; HKO/JPL) agree with this day's calendar facts.">
          ✓ Almanac cross-checked · {rec.verificationAgreement}/100
        </span>
      )}
      {rec.personalized && (
        <span className="pill" title="The personal fit (Day-Master balance, useful elements) is a medium-confidence interpretation that varies by school.">
          ○ Interpretation · school-dependent
        </span>
      )}
    </div>
  );
}
