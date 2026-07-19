import { DayRecommendation, VerificationReport } from "../engine/index.ts";

/** Live per-day verification badges (ROADMAP Phase 2):
 *  - Calendar verified — independent sources agree on this day's calendar facts.
 *  - Almanac cross-checked — the 通勝 宜/忌 was compared (warning-only).
 *  - Convention-sensitive — the reading shifts under other school conventions.
 *  - Unverified interpretation — the personal BaZi layer is medium-confidence and
 *    not third-party verifiable.
 *  The calendar facts are always deterministic + reproducible; these badges say
 *  how far independent sources could corroborate them. */
export function DayVerification({
  rec,
  report,
  conventionSeverity,
}: {
  rec: DayRecommendation;
  report: VerificationReport | null;
  conventionSeverity: "low" | "medium" | "high" | null;
}) {
  const externalSources = report ? report.sources.filter((s) => s.id !== "internal").length : 0;
  const calendarVerified = report != null && externalSources > 0 && report.blockingDisagreements.length === 0;
  const almanacField = report?.fields.find((f) => f.field === "yi" && f.status !== "unsupported");
  const conventionSensitive = conventionSeverity != null && conventionSeverity !== "low";

  return (
    <div className="verify-badges" style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 14 }}>
      {report == null ? (
        <span className="pill" title="Cross-checking this day's calendar facts against independent sources…">· Verifying calendar…</span>
      ) : calendarVerified ? (
        <span className="pill good" title={`Independent calendar sources (lunar-javascript; HKO/JPL solar terms) agree with this day's pillar, officer, day-god and clash — ${externalSources} source${externalSources === 1 ? "" : "s"}, no blocking disagreement.`}>
          ✓ Calendar verified · {report.overallAgreementScore}/100
        </span>
      ) : (
        // The list of disagreements used to live ONLY in `title`, so it existed
        // nowhere at all for a touch or screen-reader user — the one badge whose
        // whole point is telling you what went wrong.
        <span className="pill danger">
          ⚠ Calendar disagreement: {report.blockingDisagreements.join("; ")}
        </span>
      )}

      {almanacField && (
        <span className="pill good" title={`Mainstream almanac (通勝, via lunar-javascript) cross-checked — warning-only, publishers legitimately differ. ${almanacField.notes?.[0] ?? ""}`}>
          ✓ Almanac cross-checked
        </span>
      )}

      {conventionSensitive && (
        <span className="pill" title="This reading shifts under the other supported school conventions (Zi-hour rollover / true solar time) — treat it as school-dependent here.">
          ◑ Convention-sensitive
        </span>
      )}

      {rec.personalized && (
        <span className="pill" title="The personal fit (Day-Master balance, useful elements) is a medium-confidence interpretation that varies by school — it is not a third-party-verifiable fact.">
          ○ Unverified interpretation
        </span>
      )}
    </div>
  );
}
