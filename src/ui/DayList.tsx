import { useState } from "react";
import { DayRecommendation, officerPlain, relativeDay, shortDate, verdictBand, vetoExplain, Objective } from "../engine/index.ts";
import { scoreColor, scoreTextColor } from "./format.ts";

export function DayList({
  recs,
  selectedIso,
  todayIso,
  onSelect,
}: {
  recs: DayRecommendation[];
  selectedIso: string | null;
  todayIso: string;
  onSelect: (iso: string) => void;
}) {
  const [showAll, setShowAll] = useState(false);
  if (recs.length === 0) return null;
  const shown = showAll ? recs : recs.slice(0, 5);

  return (
    <div className="daylist">
      <div className="section-title">Every good day, ranked ({recs.length})</div>
      {shown.map((rec) => (
        <button
          key={rec.isoDate}
          className={`day-row ${rec.isoDate === selectedIso ? "sel" : ""}`}
          aria-current={rec.isoDate === selectedIso ? "true" : undefined}
          onClick={() => onSelect(rec.isoDate)}
        >
          <span className="band-dot" style={{ background: scoreColor(rec.finalScore) }} />
          <span className="gz" aria-hidden="true">
            {rec.tongshu.dayGanzhi.stem.hanzi}
            {rec.tongshu.dayGanzhi.branch.hanzi}
          </span>
          <span className="dr-main">
            <span className="dr-date">
              {shortDate(rec.civil)} · <span className="muted">{relativeDay(rec.isoDate, todayIso)}</span>
            </span>
            <span className="dr-sub">
              {verdictBand(rec.finalScore).label} · almanac: {officerPlain(rec.tongshu.officer).label}
            </span>
          </span>
          <span className="dr-score" style={{ color: scoreTextColor(rec.finalScore) }}>
            {rec.finalScore}
          </span>
        </button>
      ))}
      {recs.length > 5 && (
        <button className="btn-text" onClick={() => setShowAll((s) => !s)}>
          {showAll ? "Show fewer" : `Show all ${recs.length} days`}
        </button>
      )}
    </div>
  );
}

export function RuledOutDrawer({ rejected, objective }: { rejected: DayRecommendation[]; objective: Objective }) {
  if (rejected.length === 0) return null;
  return (
    <details className="dossier" style={{ marginTop: 14 }}>
      <summary>
        Ruled out, and why ({rejected.length})
      </summary>
      <div className="dossier-body">
        {rejected.map((rec) => (
          <div className="rule-row" key={rec.isoDate}>
            <div className="rr-main">
              <div className="rr-label">{shortDate(rec.civil)}</div>
              <div className="rr-cite" style={{ fontStyle: "normal", color: "var(--muted)" }}>
                {vetoExplain(rec, objective)}
              </div>
            </div>
          </div>
        ))}
      </div>
    </details>
  );
}
