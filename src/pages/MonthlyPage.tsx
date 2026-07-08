import { useMemo } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  GENERAL_DAY_OBJECTIVE,
  DayRecommendation,
  LifeAreaKey,
  PeriodSummary,
  buildPeriodsReport,
  lifeAreaScores,
} from "../engine/index.ts";
import { PeriodSummaryBlock } from "../ui/PeriodSummaryBlock.tsx";
import { scoreColor } from "../ui/format.ts";
import { loadJournal } from "../ui/journalStore.ts";
import { useProfile } from "../ui/profile/ProfileContext.tsx";
import { TODAY_ISO } from "../ui/shared.ts";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DOW = ["M", "T", "W", "T", "F", "S", "S"];
const p2 = (n: number) => String(n).padStart(2, "0");
const isTaboo = (d: DayRecommendation) => d.rulesFired.some((r) => ["year_break", "four_departure", "four_severance"].includes(r.code));
const isClash = (d: DayRecommendation) => d.shenShaTags.some((t) => t.code === "clash_day" || t.code === "clash_zodiac");

function parseYm(ym: string | undefined): { year: number; month: number } {
  if (ym && /^\d{4}-\d{2}$/.test(ym)) {
    const [y, m] = ym.split("-").map(Number);
    if (y >= 1000 && m >= 1 && m <= 12) return { year: y, month: m };
  }
  const [y, m] = TODAY_ISO.split("-").map(Number);
  return { year: y, month: m };
}
const stepYm = (year: number, month: number, delta: number) => {
  const t = (year * 12 + (month - 1) + delta);
  return `${Math.floor(t / 12)}-${p2((t % 12) + 1)}`;
};

const AREA_ICON: Record<LifeAreaKey, string> = { career: "💼", wealth: "💰", relationship: "❤", health: "☯" };

export function MonthlyPage() {
  const params = useParams();
  const nav = useNavigate();
  const { year, month } = parseYm(params.ym);
  const { chart, dayun, birthCivil, personalized, evaluateWindow } = useProfile();

  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const days = useMemo(
    () => evaluateWindow(GENERAL_DAY_OBJECTIVE.id, { year, month, day: 1 }, daysInMonth).allDays,
    [evaluateWindow, year, month, daysInMonth],
  );
  const byDay = new Map(days.map((d) => [d.civil.day, d]));
  const firstDow = (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 6) % 7; // Monday-based

  // Solar-month pillar covering mid-month (personalised 10-Gods energy).
  const monthSummary: PeriodSummary | null = useMemo(() => {
    if (!chart || !birthCivil) return null;
    const midIso = `${year}-${p2(month)}-15`;
    for (const y of [year - 1, year, year + 1]) {
      const rep = buildPeriodsReport({ chart, dayun, birth: birthCivil, targetYear: y });
      const m = rep.months.find((mm) => mm.span && midIso >= mm.span.startIso && midIso < mm.span.endIso);
      if (m) return m;
    }
    return null;
  }, [chart, dayun, birthCivil, year, month]);

  // Best day per life area (personalised).
  const bestByArea = useMemo(() => {
    if (!chart) return null;
    const out: Record<LifeAreaKey, { day: number; score: number }> = {
      career: { day: 0, score: -1 }, wealth: { day: 0, score: -1 }, relationship: { day: 0, score: -1 }, health: { day: 0, score: -1 },
    };
    for (const d of days) {
      if (d.hardReject) continue;
      for (const a of lifeAreaScores(chart, d.tongshu.dayGanzhi).areas) {
        if (a.score > out[a.key].score) out[a.key] = { day: d.civil.day, score: a.score };
      }
    }
    return out;
  }, [chart, days]);

  const dangerDays = days.filter((d) => isClash(d) || isTaboo(d));
  const savedThisMonth = loadJournal().filter((e) => e.isoDate.startsWith(`${year}-${p2(month)}`));
  const savedDays = new Set(savedThisMonth.map((e) => Number(e.isoDate.slice(8, 10))));

  return (
    <>
      <div className="page-head">
        <h2 className="page-title">{MONTHS[month - 1]} {year}</h2>
        <div className="stepper">
          <button className="btn-ghost" style={{ width: "auto", padding: "4px 12px" }} aria-label="Previous month" onClick={() => nav(`/month/${stepYm(year, month, -1)}`)}>‹</button>
          <button className="btn-ghost" style={{ width: "auto", padding: "4px 12px" }} aria-label="Next month" onClick={() => nav(`/month/${stepYm(year, month, 1)}`)}>›</button>
          <Link className="btn-text" to={`/month/${TODAY_ISO.slice(0, 7)}`}>This month</Link>
        </div>
      </div>

      {/* Calendar grid coloured by general day rating; saved decisions dotted. */}
      <div className="card" style={{ padding: 16 }}>
        <div className="cal-grid" style={{ gridTemplateColumns: "repeat(7, 1fr)" }}>
          {DOW.map((d, i) => <div className="cal-dow" key={i}>{d}</div>)}
          {Array.from({ length: firstDow }).map((_, i) => <div key={`b${i}`} />)}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const day = i + 1;
            const rec = byDay.get(day);
            const iso = `${year}-${p2(month)}-${p2(day)}`;
            const isToday = iso === TODAY_ISO;
            return (
              <button key={day} className={`cal-cell ${isToday ? "sel" : ""}`} onClick={() => nav(`/day/${iso}`)} title={rec ? `Score ${rec.recommendationScore}` : ""}>
                <span className="cd">{day}</span>
                {rec && <span className="qdot" style={{ background: rec.hardReject || isClash(rec) || isTaboo(rec) ? "var(--cinnabar)" : scoreColor(rec.recommendationScore) }} />}
                {savedDays.has(day) && <span className="qdot" style={{ background: "var(--gold)", marginTop: 2 }} title="You saved a decision on this day" />}
              </button>
            );
          })}
        </div>
      </div>

      {/* Month's 10-Gods energy (solar-month pillar vs your chart). */}
      {monthSummary ? (
        <div className="card" style={{ padding: 20, marginTop: 12 }}>
          <div className="section-title" style={{ marginBottom: 2 }}>This month's energy (流月)</div>
          <PeriodSummaryBlock s={monthSummary} />
        </div>
      ) : (
        !personalized && (
          <div className="card" style={{ padding: 16, marginTop: 12 }}>
            <p style={{ margin: 0, fontSize: 13.5, color: "var(--muted)" }}>
              <Link to="/settings/profile">Add your birth details</Link> to see this month's 10-Gods energy and your best days by life area.
            </p>
          </div>
        )
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12, marginTop: 12 }}>
        {bestByArea && (
          <div className="card" style={{ padding: 16 }}>
            <div className="section-title" style={{ marginBottom: 8 }}>Best days by life area</div>
            {(Object.keys(bestByArea) as LifeAreaKey[]).map((k) => (
              <div key={k} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, fontSize: 13.5 }}>
                <span aria-hidden="true">{AREA_ICON[k]}</span>
                <span style={{ textTransform: "capitalize", minWidth: 92 }}>{k}</span>
                <Link to={`/day/${year}-${p2(month)}-${p2(bestByArea[k].day)}`} style={{ color: "var(--ink)", textDecoration: "none" }}>
                  <b>{MONTHS[month - 1].slice(0, 3)} {bestByArea[k].day}</b> <span style={{ color: "var(--muted)" }}>· {bestByArea[k].score}</span>
                </Link>
              </div>
            ))}
          </div>
        )}

        <div className="card" style={{ padding: 16 }}>
          <div className="section-title" style={{ marginBottom: 8 }}>Danger days</div>
          {dangerDays.length === 0 ? (
            <p style={{ margin: 0, fontSize: 13, color: "var(--muted)" }}>No clash or calendar-taboo days this month.</p>
          ) : (
            dangerDays.map((d) => (
              <div key={d.isoDate} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5, fontSize: 13.5 }}>
                <span style={{ color: "var(--cinnabar)" }}>⚠</span>
                <Link to={`/day/${d.isoDate}`} style={{ color: "var(--ink)", textDecoration: "none" }}>
                  <b>{MONTHS[month - 1].slice(0, 3)} {d.civil.day}</b> <span style={{ color: "var(--muted)" }}>· {isTaboo(d) ? "calendar taboo" : "clashes your chart"}</span>
                </Link>
              </div>
            ))
          )}
        </div>
      </div>

      {savedThisMonth.length > 0 && (
        <div className="card" style={{ padding: 16, marginTop: 12 }}>
          <div className="section-title" style={{ marginBottom: 8 }}>Your saved decisions this month</div>
          {savedThisMonth.map((e) => (
            <div key={e.id} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5, fontSize: 13.5 }}>
              <span className="dot" style={{ width: 8, height: 8, borderRadius: 8, background: "var(--gold)" }} />
              <Link to={`/day/${e.isoDate}`} style={{ color: "var(--ink)", textDecoration: "none" }}><b>{e.objectiveLabel}</b> <span style={{ color: "var(--muted)" }}>· {e.isoDate.slice(5)}</span></Link>
            </div>
          ))}
        </div>
      )}

      {/* Intentions — Heaven / Earth / Man / Spiritual reflective prompts (not engine claims). */}
      <div className="card" style={{ padding: 16, marginTop: 12 }}>
        <div className="section-title" style={{ marginBottom: 8 }}>Set your month (天 · 地 · 人 · 心)</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10 }}>
          {[
            { zh: "天", en: "Heaven — timing", q: "Which opportunities do you want to catch this month?" },
            { zh: "地", en: "Earth — place", q: "What in your environment or home needs attention?" },
            { zh: "人", en: "Man — people & effort", q: "Who will you work with, and where will your effort go?" },
            { zh: "心", en: "Spirit — inner", q: "What will you do to rest and stay steady?" },
          ].map((c) => (
            <div key={c.zh} style={{ border: "1px solid var(--hairline)", borderRadius: 10, padding: "10px 12px" }}>
              <div style={{ fontSize: 13, color: "var(--ink)" }}><span style={{ fontFamily: "var(--serif-cjk)", marginRight: 6 }}>{c.zh}</span>{c.en}</div>
              <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 4, lineHeight: 1.45 }}>{c.q}</div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
