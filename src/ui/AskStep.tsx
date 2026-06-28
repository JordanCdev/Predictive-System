import { useMemo, useState } from "react";
import { Objective, matchObjective, objectivePlain } from "../engine/index.ts";

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

  // Deterministic free-text → objective. Updates as the user types.
  const match = useMemo(() => (query.trim().length >= 2 ? matchObjective(query) : null), [query]);

  const applyMatch = () => {
    if (match) onObjective(match.objective.id);
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
          placeholder="e.g. “sign a contract”, “buy a house”, “launch my shop”…"
          aria-label="Describe what you're trying to time"
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && match) {
              applyMatch();
            }
          }}
        />
        {query.trim().length >= 2 && (
          <div className="search-hint" aria-live="polite">
            {match ? (
              <button className={`match-chip ${match.objective.id === objectiveId ? "on" : ""}`} onClick={applyMatch}>
                <span className="emoji" aria-hidden="true">{match.objective.emoji}</span>
                <span>
                  Interpreted as <b>{objectivePlain(match.objective.id).gerund}</b>
                  {match.objective.id === objectiveId ? " ✓" : " — tap to use"}
                </span>
              </button>
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
