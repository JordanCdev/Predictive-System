import { useMemo, useState } from "react";
import { DayRecommendation } from "../engine/index.ts";
import { scoreColor } from "./format.ts";

const DOW = ["S", "M", "T", "W", "T", "F", "S"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

interface MonthBucket {
  key: string;
  year: number;
  month: number;
  byDay: Map<number, DayRecommendation>;
}

export function CalendarMonth({
  allDays,
  pickIso,
  selectedIso,
  onSelect,
}: {
  allDays: DayRecommendation[];
  pickIso: string | null;
  selectedIso: string | null;
  onSelect: (iso: string) => void;
}) {
  const months = useMemo<MonthBucket[]>(() => {
    const map = new Map<string, MonthBucket>();
    for (const d of allDays) {
      const key = `${d.civil.year}-${d.civil.month}`;
      if (!map.has(key)) map.set(key, { key, year: d.civil.year, month: d.civil.month, byDay: new Map() });
      map.get(key)!.byDay.set(d.civil.day, d);
    }
    return [...map.values()];
  }, [allDays]);

  const initial = Math.max(
    0,
    months.findIndex((m) => pickIso?.startsWith(`${m.year}-${String(m.month).padStart(2, "0")}`)),
  );
  const [page, setPage] = useState(initial);
  const m = months[Math.min(page, months.length - 1)] ?? months[0];
  if (!m) return null;

  const daysInMonth = new Date(Date.UTC(m.year, m.month, 0)).getUTCDate();
  const firstDow = new Date(Date.UTC(m.year, m.month - 1, 1)).getUTCDay();

  return (
    <div className="card calendar">
      <div className="month-pager">
        <button className="pager-btn" onClick={() => setPage((p) => p - 1)} disabled={page <= 0} aria-label="Previous month">
          ‹
        </button>
        <div className="mname">
          {MONTHS[m.month - 1]} {m.year}
        </div>
        <button
          className="pager-btn"
          onClick={() => setPage((p) => p + 1)}
          disabled={page >= months.length - 1}
          aria-label="Next month"
        >
          ›
        </button>
      </div>

      <div className="cal-grid">
        {DOW.map((d, i) => (
          <div className="cal-dow" key={i}>
            {d}
          </div>
        ))}
        {Array.from({ length: firstDow }).map((_, i) => (
          <div key={`lead-${i}`} />
        ))}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day = i + 1;
          const rec = m.byDay.get(day);
          if (!rec) {
            return (
              <div className="cal-cell out" key={day} aria-hidden="true">
                <span className="cd">{day}</span>
              </div>
            );
          }
          const isPick = rec.isoDate === pickIso;
          const cls = `cal-cell ${rec.hardReject ? "rej" : ""} ${isPick ? "pick" : ""} ${
            rec.isoDate === selectedIso ? "sel" : ""
          }`;
          return (
            <button
              className={cls}
              key={day}
              onClick={() => onSelect(rec.isoDate)}
              aria-current={rec.isoDate === selectedIso ? "date" : undefined}
              aria-label={`${MONTHS[m.month - 1]} ${day} — ${rec.hardReject ? "ruled out" : `score ${rec.recommendationScore}`}${isPick ? ", our pick" : ""}`}
              title={rec.hardReject ? "Ruled out" : `Score ${rec.recommendationScore}`}
            >
              <span className="cd">{day}</span>
              {!rec.hardReject && <span className="qdot" style={{ background: scoreColor(rec.recommendationScore) }} />}
            </button>
          );
        })}
      </div>

      <div className="cal-legend">
        <span className="lg">
          <span className="sw" style={{ background: scoreColor(80) }} /> great
        </span>
        <span className="lg">
          <span className="sw" style={{ background: scoreColor(50) }} /> mixed
        </span>
        <span className="lg">
          <span className="sw" style={{ background: scoreColor(20) }} /> weak
        </span>
        <span className="lg">
          <span className="sw" style={{ border: "1px solid var(--gold)", background: "transparent" }} /> our pick
        </span>
        <span className="lg">
          <span className="sw" style={{ background: "transparent", color: "var(--faint)", textDecoration: "line-through" }}>
            7
          </span>{" "}
          ruled out
        </span>
      </div>
    </div>
  );
}
