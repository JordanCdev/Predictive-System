/**
 * The person-first hero of the daily view (presentation only).
 *
 * The Power Planner insight, applied: the reader comes before the calendar.
 * This card leads with WHO the day is read for (their label and the date), then
 * the personal reading in plain English, the day's verdict + score as one chip,
 * the separately-labelled priority-fit line, and the best-hour pointer. All of
 * it is derived from values the engine already computed — nothing here scores.
 *
 * Copy honesty: everything shown is the engine's `personalDayReading` output,
 * which speaks in "tilts" and "tradition marks", never predictions. The score
 * chip keeps its "ranking heuristic, not a prediction" title. The priority-fit
 * line stays a separate axis with its "classical score unchanged" note intact.
 */

import { useMemo } from "react";
import { BaziChart, DayRecommendation, TEN_GOD_LABEL, humanDate, personalDayReading, tenGodPlain, verdictBand } from "../engine/index.ts";
import { scoreColor, scoreTextColor } from "./format.ts";
import { PriorityFitChip, useRankedAreas } from "./PriorityFitChip.tsx";

/** "Saturday, 25 July" — the full human date without the year, for the greeting. */
function greetingDate(civil: DayRecommendation["civil"]): string {
  return humanDate(civil).replace(/\s\d{4}$/, "");
}

export function PersonalDayCard({
  chart,
  rec,
  label,
  hourGridId,
}: {
  chart: BaziChart;
  rec: DayRecommendation;
  /** Display name from the stored person — "You" until onboarding sets a real one. */
  label: string;
  /** DOM id of the element containing the hour grid; the best-hour link scrolls to it. */
  hourGridId: string;
}) {
  const ranked = useRankedAreas();
  const leadArea = ranked[0];
  const reading = useMemo(
    () => personalDayReading({ chart, rec, leadArea }),
    [chart, rec, leadArea],
  );

  const band = verdictBand(rec.recommendationScore);
  const score = Math.round(rec.recommendationScore);
  const named = label.trim() !== "" && label.trim().toLowerCase() !== "you";
  const dateLine = greetingDate(rec.civil);

  return (
    <div className="card day-hero" style={{ padding: "20px 22px", display: "flex", flexDirection: "column", gap: 12 }}>
      {/* The greeting — the person first, then the date. */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <span style={{ fontSize: 13, color: "var(--muted)", letterSpacing: 0.2 }}>
          {named ? (
            <>
              <b style={{ color: "var(--ink)", fontSize: 14 }}>{label.trim()}</b>
              <span aria-hidden="true"> — </span>
              {dateLine}
            </>
          ) : (
            dateLine
          )}
        </span>

        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        {/* Day-type badge: what kind of day this is FOR THIS PERSON — the day
            stem's Ten God relative to their Day Master. A label the engine
            already computed (rec.dayStemTenGod); display only. */}
        {rec.dayStemTenGod && (() => {
          const label = TEN_GOD_LABEL[rec.dayStemTenGod];
          const cut = label.lastIndexOf(" ");
          return (
            <span
              className="pill"
              style={{ padding: "4px 10px", whiteSpace: "nowrap" }}
              title={`The day stem is your ${label} — a day of ${tenGodPlain(rec.dayStemTenGod)}. A classical label for the day's flavour, not part of the score.`}
            >
              {label.slice(0, cut)} day <span className="faint" style={{ fontFamily: "var(--serif-cjk)" }}>· {label.slice(cut + 1)}</span>
            </span>
          );
        })()}

        {/* The verdict + rounded score, as one chip. Same band/colour logic as everywhere else. */}
        <span
          className="pill"
          style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "4px 12px", whiteSpace: "nowrap" }}
          title="Recommendation score (0–100) — a ranking heuristic under this rule set, not a prediction."
        >
          <span className="dot" style={{ width: 8, height: 8, borderRadius: 8, background: scoreColor(rec.recommendationScore) }} />
          <b style={{ fontSize: 13.5, color: scoreTextColor(rec.recommendationScore) }}>{band.label}</b>
          <b style={{ fontSize: 15, color: scoreTextColor(rec.recommendationScore) }}>{score}</b>
          <span className="faint" style={{ fontSize: 11 }}>{rec.personalized ? "your day rating" : "general day rating"}</span>
        </span>
        </span>
      </div>

      {/* The reading itself — headline prominent, then the paragraphs. */}
      <div>
        <h3 style={{ margin: 0, fontSize: 18, fontWeight: 650, lineHeight: 1.35, color: "var(--ink)" }}>
          {reading.headline}
        </h3>
        {reading.paragraphs.map((p, i) => (
          <p key={i} style={{ margin: "8px 0 0", fontSize: 13.5, lineHeight: 1.6, color: "var(--muted)" }}>
            {p}
          </p>
        ))}
      </div>

      {/* Cautions — the day's watch-outs, in the same danger-pill voice used elsewhere. */}
      {reading.cautions.length > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {reading.cautions.map((c, i) => (
            <span key={i} className="pill danger" style={{ whiteSpace: "normal", lineHeight: 1.45 }}>
              {c}
            </span>
          ))}
        </div>
      )}

      {/* Best hour, with a jump to the full hour grid below. */}
      {reading.bestHourLine && (
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap", fontSize: 13, color: "var(--ink)" }}>
          <span style={{ lineHeight: 1.5 }}>{reading.bestHourLine}</span>
          <button
            className="btn-text"
            style={{ padding: "0 2px", fontSize: 12.5 }}
            onClick={() =>
              document.getElementById(hourGridId)?.scrollIntoView({
                behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
                block: "start",
              })
            }
          >
            See all hours ›
          </button>
        </div>
      )}

      {/* The priority-fit axis, inline — a separate line, never a score modifier. */}
      <PriorityFitChip chart={chart} rec={rec} embedded />
    </div>
  );
}
