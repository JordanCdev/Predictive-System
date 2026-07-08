import {
  BaziChart,
  DayRecommendation,
  dayGodPlain,
  humanDate,
  officerPlain,
} from "../engine/index.ts";
import { LifeAreaGauges } from "./DayInsights.tsx";

/** A persistent "now" snapshot: today's pillar, day-officer, day-god and — once
 *  personalized — how the day tilts each life area for you (ROADMAP §A3). Built
 *  from the already-computed window day, so it never recomputes the calendar. */
export function TodayCard({ chart, today }: { chart: BaziChart | null; today: DayRecommendation }) {
  const officer = officerPlain(today.tongshu.officer);
  const god = dayGodPlain(today.tongshu.dayGod);
  const taboo =
    today.rulesFired.some((r) => r.code === "year_break") ? "歲破 — a day tradition marks 諸事不宜"
    : today.rulesFired.some((r) => r.code === "four_departure") ? "四離 — a season-pivot eve (大事勿用)"
    : today.rulesFired.some((r) => r.code === "four_severance") ? "四絕 — a season-pivot eve (大事勿用)"
    : null;

  return (
    <div className="card" style={{ padding: 18, marginTop: 14 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.6, color: "var(--gold-text)" }}>TODAY</span>
          <b style={{ fontSize: 15 }}>{humanDate(today.civil)}</b>
        </div>
        <span style={{ fontSize: 15, fontFamily: "var(--serif-cjk)", color: "var(--ink)" }} title="Today's day pillar (日柱)">
          {today.tongshu.dayGanzhi.hanzi}
        </span>
      </div>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
        <span style={{ fontSize: 12, border: "1px solid var(--hairline)", borderRadius: 999, padding: "2px 9px", color: "var(--ink)" }} title={officer.blurb}>
          {officer.label} <span style={{ color: "var(--faint)" }}>· {officer.secondary}</span>
        </span>
        <span style={{ fontSize: 12, border: "1px solid var(--hairline)", borderRadius: 999, padding: "2px 9px", color: "var(--ink)" }} title={god.blurb}>
          {god.label} <span style={{ color: "var(--faint)" }}>· {god.secondary}</span>
        </span>
        {taboo && (
          <span style={{ fontSize: 12, border: "1px solid #c0442e55", borderRadius: 999, padding: "2px 9px", color: "#b3403a" }}>{taboo}</span>
        )}
      </div>

      {chart ? (
        <div style={{ marginTop: 12 }}>
          <LifeAreaGauges chart={chart} dayGz={today.tongshu.dayGanzhi} compact />
        </div>
      ) : (
        <p style={{ margin: "10px 0 0", fontSize: 12.5, color: "var(--muted)" }}>
          Add your birth details below to see how today tilts your career, wealth, relationships and wellbeing.
        </p>
      )}
    </div>
  );
}
