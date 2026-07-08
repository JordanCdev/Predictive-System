import { useMemo, useState } from "react";
import { Objective, objectivePlain, parseActivity } from "../engine/index.ts";

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
  onObjective,
  onWindow,
  onSubmit,
}: {
  objectives: Objective[];
  objectiveId: string | null;
  windowDays: number;
  onObjective: (id: string) => void;
  onWindow: (days: number) => void;
  onSubmit: () => void;
}) {
  const [query, setQuery] = useState("");
  const chosen = objectiveId ? objectives.find((o) => o.id === objectiveId) : null;

  // Deterministic free-text → structured activity profile. Updates as you type.
  const activity = useMemo(() => (query.trim().length >= 2 ? parseActivity(query) : null), [query]);

  const applyMatch = () => {
    if (activity) onObjective(activity.objective.id);
  };

  return (
    <div className="ask">
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
        {WINDOW_OPTIONS.map((w) => (
          <button
            key={w.days}
            className={`chip ${windowDays === w.days ? "on" : ""}`}
            aria-pressed={windowDays === w.days}
            onClick={() => onWindow(w.days)}
          >
            {w.label}
          </button>
        ))}
      </div>
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
