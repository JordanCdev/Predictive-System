import { DayRecommendation } from "../engine/index.ts";
import { scoreColor } from "./format.ts";

const DOW = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

/** Month-style calendar heatmap of the candidate window, coloured by score. */
export function Heatmap({
  days,
  selectedIso,
  onSelect,
}: {
  days: DayRecommendation[];
  selectedIso: string | null;
  onSelect: (iso: string) => void;
}) {
  if (days.length === 0) return null;
  const first = days[0].civil;
  const lead = new Date(Date.UTC(first.year, first.month - 1, first.day)).getUTCDay();

  return (
    <div>
      <div className="heatmap">
        {DOW.map((d) => (
          <div className="heat-dow" key={d}>{d}</div>
        ))}
        {Array.from({ length: lead }).map((_, i) => (
          <div key={`lead-${i}`} />
        ))}
        {days.map((d) => {
          const bg = d.hardReject ? "#3a3144" : scoreColor(d.finalScore);
          const cls = `heat-cell ${d.hardReject ? "rej" : ""} ${selectedIso === d.isoDate ? "sel" : ""}`;
          return (
            <div
              key={d.isoDate}
              className={cls}
              style={{ background: bg }}
              title={`${d.isoDate} · ${d.hardReject ? "rejected" : `score ${d.finalScore}`}`}
              onClick={() => onSelect(d.isoDate)}
            >
              <span className="d">{d.civil.day}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
