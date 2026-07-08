import { useMemo } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  GENERAL_DAY_OBJECTIVE,
  DayRecommendation,
  humanHourRange,
  practicalBestHour,
  shortDate,
  verdictBand,
  weekdayName,
} from "../engine/index.ts";
import { scoreColor, scoreTextColor } from "../ui/format.ts";
import { useProfile } from "../ui/profile/ProfileContext.tsx";
import { TODAY_ISO, addDaysIso, civilOfIso, isValidIso } from "../ui/shared.ts";

function mondayOf(iso: string): string {
  const c = civilOfIso(iso);
  const dow = new Date(Date.UTC(c.year, c.month - 1, c.day)).getUTCDay(); // 0=Sun
  return addDaysIso(iso, -((dow + 6) % 7)); // days since Monday
}
const isTaboo = (d: DayRecommendation) => d.rulesFired.some((r) => ["year_break", "four_departure", "four_severance"].includes(r.code));
const isClash = (d: DayRecommendation) => d.shenShaTags.some((t) => t.code === "clash_day" || t.code === "clash_zodiac");

/** Weekly planner — seven day cards, the best personal days, caution days, the
 *  best windows, a weekly theme, and a "plan this week" nudge. */
export function WeeklyPage() {
  const params = useParams();
  const nav = useNavigate();
  const base = isValidIso(params.date) ? params.date : TODAY_ISO;
  const weekStart = mondayOf(base);
  const { evaluateWindow, personalized } = useProfile();

  const days = useMemo(() => evaluateWindow(GENERAL_DAY_OBJECTIVE.id, civilOfIso(weekStart), 7).allDays, [evaluateWindow, weekStart]);

  const ranked = [...days].sort((a, b) => b.recommendationScore - a.recommendationScore);
  const bestDays = ranked.filter((d) => d.recommendationScore >= 58 && !isClash(d) && !isTaboo(d)).slice(0, 3);
  const cautionDays = days.filter((d) => isClash(d) || isTaboo(d) || d.recommendationScore < 45);
  const favourable = days.filter((d) => d.recommendationScore >= 58).length;
  const theme =
    favourable >= 5 ? "A broadly supportive week — a good stretch to move things forward."
    : favourable >= 2 ? "A mixed week — pick your moments; the strong days below are where to act."
    : "A quieter, more demanding week — favour maintenance over big new commitments.";

  const rangeLabel = `${shortDate(civilOfIso(weekStart))} – ${shortDate(civilOfIso(addDaysIso(weekStart, 6)))}`;

  return (
    <>
      <div className="page-head">
        <h2 className="page-title">Week</h2>
        <div className="stepper">
          <button className="btn-ghost" style={{ width: "auto", padding: "4px 12px" }} aria-label="Previous week" onClick={() => nav(`/week/${addDaysIso(weekStart, -7)}`)}>‹</button>
          <b style={{ minWidth: 170, textAlign: "center", fontSize: 13.5 }}>{rangeLabel}</b>
          <button className="btn-ghost" style={{ width: "auto", padding: "4px 12px" }} aria-label="Next week" onClick={() => nav(`/week/${addDaysIso(weekStart, 7)}`)}>›</button>
          <Link className="btn-text" to={`/week/${mondayOf(TODAY_ISO)}`}>This week</Link>
        </div>
      </div>

      <p style={{ margin: "0 0 12px", fontSize: 14, color: "var(--ink)", lineHeight: 1.55 }}>{theme}</p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 8 }}>
        {days.map((d) => {
          const ph = personalized ? practicalBestHour(d) : null;
          const flag = isTaboo(d) ? "taboo" : isClash(d) ? "clash" : null;
          const isToday = d.isoDate === TODAY_ISO;
          return (
            <button
              key={d.isoDate}
              onClick={() => nav(`/day/${d.isoDate}`)}
              className="card"
              style={{ padding: "10px 12px", textAlign: "left", cursor: "pointer", border: isToday ? "1px solid var(--gold)" : undefined, display: "flex", flexDirection: "column", gap: 4 }}
            >
              <span style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <span style={{ fontSize: 12.5, color: "var(--muted)" }}>{weekdayName(d.civil).slice(0, 3)} {d.civil.day}</span>
                <b style={{ fontSize: 13, color: scoreTextColor(d.recommendationScore) }}>{d.recommendationScore}</b>
              </span>
              <span style={{ fontSize: 15, fontFamily: "var(--serif-cjk)", color: "var(--ink)" }}>{d.tongshu.dayGanzhi.hanzi}</span>
              <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11.5, color: "var(--muted)" }}>
                <span className="dot" style={{ width: 8, height: 8, borderRadius: 8, background: scoreColor(d.recommendationScore) }} />
                {verdictBand(d.recommendationScore).label}
              </span>
              {ph && <span style={{ fontSize: 11, color: "var(--faint)" }}>◷ {humanHourRange(ph.rangeLabel)}</span>}
              {flag && <span style={{ fontSize: 11, color: "var(--cinnabar)" }}>{flag === "taboo" ? "⚠ calendar taboo" : "⚠ clashes you"}</span>}
            </button>
          );
        })}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12, marginTop: 16 }}>
        <div className="card" style={{ padding: 16 }}>
          <div className="section-title" style={{ marginBottom: 6 }}>Best days this week</div>
          {bestDays.length === 0 ? (
            <p style={{ margin: 0, fontSize: 13, color: "var(--muted)" }}>No standout days — any day will do for routine matters.</p>
          ) : (
            bestDays.map((d) => {
              const ph = personalized ? practicalBestHour(d) : null;
              return (
                <div key={d.isoDate} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <span className="dot" style={{ width: 9, height: 9, borderRadius: 9, background: scoreColor(d.recommendationScore) }} />
                  <Link to={`/day/${d.isoDate}`} style={{ fontSize: 13.5, color: "var(--ink)", textDecoration: "none" }}>
                    <b>{shortDate(d.civil)}</b> <span style={{ color: "var(--muted)" }}>· {d.recommendationScore}{ph ? ` · best ${humanHourRange(ph.rangeLabel)}` : ""}</span>
                  </Link>
                </div>
              );
            })
          )}
        </div>

        <div className="card" style={{ padding: 16 }}>
          <div className="section-title" style={{ marginBottom: 6 }}>Handle with care</div>
          {cautionDays.length === 0 ? (
            <p style={{ margin: 0, fontSize: 13, color: "var(--muted)" }}>No caution days this week.</p>
          ) : (
            cautionDays.map((d) => (
              <div key={d.isoDate} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <span style={{ color: "var(--cinnabar)" }}>⚠</span>
                <Link to={`/day/${d.isoDate}`} style={{ fontSize: 13.5, color: "var(--ink)", textDecoration: "none" }}>
                  <b>{shortDate(d.civil)}</b> <span style={{ color: "var(--muted)" }}>· {isTaboo(d) ? "calendar taboo" : isClash(d) ? "clashes your chart" : "a weak day"}</span>
                </Link>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="card" style={{ padding: 16, marginTop: 12, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <span style={{ fontSize: 13.5, color: "var(--muted)" }}>Have something specific to time this week?</span>
        <div style={{ display: "flex", gap: 8 }}>
          <Link className="btn-ghost" style={{ width: "auto", padding: "6px 14px", textDecoration: "none" }} to="/date-finder">Find the best day ›</Link>
          <Link className="btn-ghost" style={{ width: "auto", padding: "6px 14px", textDecoration: "none" }} to="/chat">Ask the advisor ›</Link>
        </div>
      </div>
    </>
  );
}
