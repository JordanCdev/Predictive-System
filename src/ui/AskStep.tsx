import { useMemo, useState } from "react";
import { Objective, objectivePlain, parseActivity } from "../engine/index.ts";
import { UpgradePrompt } from "./billing/UpgradePrompt.tsx";
import { useEntitlements } from "./profile/EntitlementsContext.tsx";

const metaChipStyle = { fontSize: 11.5, color: "var(--muted)", border: "1px solid var(--hairline)", borderRadius: 999, padding: "1px 9px", textTransform: "capitalize" as const };

export const WINDOW_OPTIONS = [
  { days: 14, label: "2 weeks" },
  { days: 31, label: "1 month" },
  { days: 92, label: "3 months" },
  { days: 186, label: "6 months" },
  { days: 365, label: "1 year" },
  { days: 730, label: "2 years" },
  { days: 1826, label: "5 years" },
];

export function AskStep({
  objectives,
  objectiveId,
  windowDays,
  unmatchedQuery,
  onObjective,
  onWindow,
  onSubmit,
}: {
  objectives: Objective[];
  objectiveId: string | null;
  windowDays: number;
  /** A search we could not map to an objective — told plainly rather than ignored. */
  unmatchedQuery?: string | null;
  onObjective: (id: string) => void;
  onWindow: (days: number) => void;
  onSubmit: () => void;
}) {
  const [query, setQuery] = useState("");
  const [showHorizonPrompt, setShowHorizonPrompt] = useState(false);
  const { entitlement } = useEntitlements();
  const horizonDays = entitlement.plan.limits.horizonDays;
  const chosen = objectiveId ? objectives.find((o) => o.id === objectiveId) : null;

  // Deterministic free-text → structured activity profile. Updates as you type.
  const activity = useMemo(() => (query.trim().length >= 2 ? parseActivity(query) : null), [query]);

  const applyMatch = () => {
    if (activity) onObjective(activity.objective.id);
  };

  return (
    <div className="ask">
      {unmatchedQuery && (
        <div className="warn" style={{ marginBottom: 14 }}>
          <span aria-hidden="true">⚠</span> We couldn't work out what kind of decision “{unmatchedQuery}” is, so we
          haven't guessed. Pick the closest one below — the engine only times the activities listed here.
        </div>
      )}
      <h1>What are you trying to time?</h1>
      <p className="lede">Describe it in your own words, or pick one below. You'll get one clear best day — and exactly why.</p>

      {/* Free-text search — maps to an objective deterministically (no guesswork sent anywhere). */}
      <div className="search-wrap">
        <input
          className="obj-search"
          type="text"
          value={query}
          placeholder="e.g. “ask for a raise”, “move to China”, “launch my website”, “book surgery”…"
          aria-label="Describe what you're trying to time"
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && activity) {
              applyMatch();
            }
          }}
        />
        {query.trim().length >= 2 && (
          <div className="search-hint" aria-live="polite">
            {activity ? (
              <>
                <button className={`match-chip ${activity.objective.id === objectiveId ? "on" : ""}`} onClick={applyMatch}>
                  <span className="emoji" aria-hidden="true">{activity.objective.emoji}</span>
                  <span>
                    Interpreted as <b>{objectivePlain(activity.objective.id).gerund}</b>
                    {activity.objective.id === objectiveId ? " ✓" : " — tap to use"}
                  </span>
                </button>
                {/* The structured read: which domain, how risky, how binding. */}
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
                  <span style={metaChipStyle}>{activity.domain}</span>
                  <span style={metaChipStyle}>{activity.risk === "high" ? "high-stakes" : activity.risk === "medium" ? "moderate stakes" : "low-stakes"}</span>
                  <span style={metaChipStyle}>{activity.binding ? "binding commitment" : "non-binding"}</span>
                </div>
                {/* One clarifying question when the read is ambiguous. */}
                {activity.clarification ? (
                  <div style={{ marginTop: 8 }}>
                    <span className="no-match" style={{ opacity: 0.8 }}>{activity.clarification.question} </span>
                    <span className="alt-matches" style={{ display: "inline-flex", gap: 6, flexWrap: "wrap", marginTop: 4 }}>
                      {activity.clarification.options.map((o) => (
                        <button key={o.id} className={`match-chip ${o.id === objectiveId ? "on" : ""}`} style={{ opacity: 0.9 }} onClick={() => onObjective(o.id)}>
                          <span className="emoji" aria-hidden="true">{o.emoji}</span>
                          <span>{objectivePlain(o.id).gerund}</span>
                        </button>
                      ))}
                    </span>
                  </div>
                ) : (
                  activity.alternatives.length > 0 && (
                    <span className="alt-matches" style={{ display: "inline-flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginTop: 6 }}>
                      <span className="no-match" style={{ opacity: 0.75 }}>or</span>
                      {activity.alternatives.map((o) => (
                        <button key={o.id} className="match-chip" style={{ opacity: 0.85 }} onClick={() => onObjective(o.id)}>
                          <span className="emoji" aria-hidden="true">{o.emoji}</span>
                          <span>{objectivePlain(o.id).gerund}</span>
                        </button>
                      ))}
                    </span>
                  )
                )}
              </>
            ) : (
              <span className="no-match">No close match — pick the nearest decision below.</span>
            )}
          </div>
        )}
      </div>

      <div className="obj-grid" role="group" aria-label="What are you timing?">
        {objectives.map((o) => (
          <button
            key={o.id}
            className={`obj-card ${o.id === objectiveId ? "on" : ""}`}
            aria-pressed={o.id === objectiveId}
            onClick={() => onObjective(o.id)}
          >
            <span className="emoji" aria-hidden="true">
              {o.emoji}
            </span>
            <span className="label">{objectivePlain(o.id).gerund}</span>
          </button>
        ))}
      </div>

      <div className="obj-desc">{chosen ? objectivePlain(chosen.id).desc : "Pick a decision above to continue."}</div>

      <div className="field-label" id="when-label">
        How far ahead should we look?
      </div>
      <div className="when-chips" role="group" aria-labelledby="when-label">
        {WINDOW_OPTIONS.map((w) => {
          const locked = w.days > horizonDays;
          return (
            <button
              key={w.days}
              className={`chip ${windowDays === w.days ? "on" : ""}${locked ? " locked" : ""}`}
              aria-pressed={windowDays === w.days}
              // Locked spans stay visible and clickable: tapping one explains the
              // limit rather than leaving a mystery grey chip.
              onClick={() => (locked ? setShowHorizonPrompt(true) : onWindow(w.days))}
            >
              {w.label}
              {locked && <span className="chip-lock" aria-hidden="true"> ✦</span>}
            </button>
          );
        })}
      </div>
      {showHorizonPrompt && <UpgradePrompt feature="horizon_5y" compact />}
      <div className="ask-note" style={{ marginTop: 6 }}>
        Looking further ahead finds the single strongest day in that span — plus the soonest good one.
      </div>

      <button className="btn" disabled={!objectiveId} onClick={onSubmit}>
        Find my best day
      </button>
      <div className="ask-note">No sign-up, nothing leaves your device. The same inputs always give the same answer.</div>
    </div>
  );
}
