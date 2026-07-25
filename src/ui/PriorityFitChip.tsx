/**
 * The priority-fit axis, on screen — deliberately a SEPARATE line from the day's
 * classical verdict, never a modifier of it.
 *
 * The design brief in one sentence: show "Classical score 74 · Priority fit +8
 * (career focus)" rather than quietly turning 74 into 82. The classical score is
 * doctrine; the fit number is a modern product read of the day's own life-area
 * gauges through the ranking the user typed in. Mixing them would make the
 * doctrinal number un-auditable, so the UI keeps them visually and verbally apart
 * and says so in the aside.
 *
 * Renders NOTHING when the user has no ranked priorities — an unset profile gets
 * no nag, no empty state, no placeholder.
 */

import { useEffect, useMemo, useState } from "react";
import { BaziChart, DayRecommendation, lifeAreaScores } from "../engine/index.ts";
import { PRIORITY_FIT_NOTE, formatFitDelta, priorityFit } from "./priorityFit.ts";
import { PRIORITIES_STORE_KEY, PriorityProfile, loadPriorities } from "./priorities/prioritiesStore.ts";

/**
 * The stored priority profile, read once on mount and kept in step with other
 * tabs. A UI-layer localStorage read — nothing here reaches the engine.
 */
export function usePriorities(): PriorityProfile {
  const [profile, setProfile] = useState<PriorityProfile>(() => loadPriorities());
  useEffect(() => {
    // Another tab (or another window of the same app) edited the profile.
    const onStorage = (e: StorageEvent) => {
      if (e.key === null || e.key === PRIORITIES_STORE_KEY) setProfile(loadPriorities());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);
  return profile;
}

/** Just the ranked areas — what the fit calculation and the gauge ordering need. */
export function useRankedAreas(): PriorityProfile["areas"] {
  return usePriorities().areas;
}

/**
 * The chip. Sits next to the day's verdict, states the classical score alongside
 * its own number, and carries an expandable aside that spells out exactly what
 * this is and what it does not touch.
 */
export function PriorityFitChip({ chart, rec }: { chart: BaziChart; rec: DayRecommendation }) {
  const ranked = useRankedAreas();
  const [open, setOpen] = useState(false);

  const gz = rec.tongshu.dayGanzhi;
  const fit = useMemo(() => priorityFit(ranked, lifeAreaScores(chart, gz).areas), [ranked, chart, gz]);
  if (!fit) return null; // no priorities set → say nothing at all

  const classical = Math.round(rec.recommendationScore);
  const focus = fit.leadLabel.toLowerCase();

  return (
    <div
      className="card"
      style={{ padding: "12px 16px", marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span style={{ fontSize: 12.5, color: "var(--muted)" }}>
          Classical score <b style={{ color: "var(--ink)" }}>{classical}</b>
          <span className="faint"> · unchanged by anything below</span>
        </span>
        <span aria-hidden="true" style={{ color: "var(--hairline)" }}>|</span>
        <span
          className="pill"
          style={{ display: "inline-flex", alignItems: "baseline", gap: 6, whiteSpace: "normal" }}
          title={PRIORITY_FIT_NOTE}
        >
          <span style={{ fontSize: 12.5, color: "var(--muted)" }}>Priority fit</span>
          <b style={{ fontSize: 14, color: "var(--ink)" }}>{formatFitDelta(fit.delta)}</b>
          <span style={{ fontSize: 12.5, color: "var(--muted)" }}>
            {fit.delta === 0 ? "· even across your priorities" : `· leans ${fit.delta > 0 ? "toward" : "away from"} your ${focus} focus`}
          </span>
        </span>
        <button
          className="btn-text"
          style={{ padding: "2px 4px", fontSize: 12.5 }}
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
        >
          {open ? "Hide" : "What's this?"}
        </button>
      </div>

      {open && (
        <div className="disclaimer" style={{ marginTop: 0 }}>
          <b>Your priorities, not the almanac.</b> {fit.plain} This compares the day's own life-area gauges,
          weighted by the order you ranked them in ({fit.usedLabels.join(" › ")}), against the same day's average across all
          four areas — {fit.weighted} versus {fit.baseline}. {PRIORITY_FIT_NOTE} Change your ranking and this number
          moves; the {classical} above will not.
        </div>
      )}
    </div>
  );
}
