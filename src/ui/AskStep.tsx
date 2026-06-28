import { Objective, objectivePlain } from "../engine/index.ts";

export const WINDOW_OPTIONS = [
  { days: 14, label: "Next 2 weeks" },
  { days: 31, label: "Next month" },
  { days: 92, label: "Next 3 months" },
  { days: 186, label: "Next 6 months" },
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
  const chosen = objectiveId ? objectives.find((o) => o.id === objectiveId) : null;
  return (
    <div className="ask">
      <h1>What are you trying to time?</h1>
      <p className="lede">Pick a decision and a rough window. You'll get one clear best day — and exactly why.</p>

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
        When are you looking?
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

      <button className="btn" disabled={!objectiveId} onClick={onSubmit}>
        Find my best day
      </button>
      <div className="ask-note">No sign-up, nothing leaves your device. The same inputs always give the same answer.</div>
    </div>
  );
}
