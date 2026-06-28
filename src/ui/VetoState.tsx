import { Objective, objectivePlain, windowPlain } from "../engine/index.ts";

export function VetoState({
  objective,
  windowDays,
  onWiden,
  canWiden,
}: {
  objective: Objective;
  windowDays: number;
  onWiden: () => void;
  canWiden: boolean;
}) {
  const { verb } = objectivePlain(objective.id);
  return (
    <div className="card veto-state">
      <div className="vs-icon">🗓️</div>
      <h3>No clearly good day to {verb} in {windowPlain(windowDays)}.</h3>
      <p>
        A few days were ruled out by strong traditional warnings — like a Breaking day, or a day that clashes your chart.
        Widening the search usually turns up a good one.
      </p>
      {canWiden && (
        <button className="btn" onClick={onWiden}>
          Look further ahead
        </button>
      )}
    </div>
  );
}
