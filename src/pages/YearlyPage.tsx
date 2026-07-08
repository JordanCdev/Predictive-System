import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { annualPillar, buildPeriodsReport } from "../engine/index.ts";
import { PeriodSummaryBlock } from "../ui/PeriodSummaryBlock.tsx";
import { LuckEntry, LuckTimeline } from "../ui/LuckTimeline.tsx";
import { valenceColor } from "../ui/format.ts";
import { useProfile } from "../ui/profile/ProfileContext.tsx";
import { NeedsProfile } from "./NeedsProfile.tsx";

const CURRENT_YEAR = Number(new Date().getFullYear());
const DETAIL_HORIZON = 5; // years of month-level detail, per spec

export function YearlyPage() {
  const params = useParams();
  const nav = useNavigate();
  const parsedYear = /^\d{4}$/.test(params.year ?? "") ? Number(params.year) : NaN;
  const year = parsedYear >= 1000 ? parsedYear : CURRENT_YEAR;
  const { chart, dayun, birthCivil } = useProfile();
  const [openMonth, setOpenMonth] = useState<string | null>(null);

  const report = useMemo(
    () => (chart && birthCivil ? buildPeriodsReport({ chart, dayun, birth: birthCivil, targetYear: year }) : null),
    [chart, dayun, birthCivil, year],
  );

  const luckEntries = useMemo<LuckEntry[]>(() => {
    if (!dayun || !report) return [];
    return dayun.pillars.map((p, i) => ({
      summary: report.luckPillars[i],
      startAge: p.startAge,
      endAge: p.endAge,
      active: report.luckPillars[i]?.label.startsWith("now") ?? false,
    }));
  }, [dayun, report]);

  const detailed = Math.abs(year - CURRENT_YEAR) <= DETAIL_HORIZON;
  const opportunities = report?.months.filter((m) => m.valence === "supportive") ?? [];
  const risks = report?.months.filter((m) => m.valence === "challenging") ?? [];

  const navRow = (
    <div className="stepper">
      <button className="btn-ghost" style={{ width: "auto", padding: "4px 12px" }} aria-label="Previous year" onClick={() => nav(`/year/${year - 1}`)}>‹</button>
      <b style={{ minWidth: 56, textAlign: "center", fontSize: 15 }}>{year}</b>
      <button className="btn-ghost" style={{ width: "auto", padding: "4px 12px" }} aria-label="Next year" onClick={() => nav(`/year/${year + 1}`)}>›</button>
      {year !== CURRENT_YEAR && <Link className="btn-text" to={`/year/${CURRENT_YEAR}`}>This year</Link>}
    </div>
  );

  if (!report) {
    return (
      <>
        <div className="page-head"><h2 className="page-title">Year {year}</h2>{navRow}</div>
        <div className="card" style={{ padding: 16 }}>
          <p style={{ margin: 0, fontSize: 14, color: "var(--ink)" }}>
            {year} is the year of <b style={{ fontFamily: "var(--serif-cjk)" }}>{annualPillar(year).hanzi}</b> (流年).
          </p>
        </div>
        <NeedsProfile what="see this year's Ten-God theme, your active luck decade and the month-by-month outlook" />
      </>
    );
  }

  return (
    <>
      <div className="page-head"><h2 className="page-title">Year {year}</h2>{navRow}</div>

      <LuckTimeline entries={luckEntries} natalGanzhi={chart!.pillars.map((p) => p.ganzhi.hanzi)} />

      <p style={{ margin: "14px 0 0", fontSize: 14, color: "var(--ink)", lineHeight: 1.55 }}>{report.interaction}</p>
      <div className="card" style={{ padding: 20, marginTop: 10 }}>
        <div className="section-title" style={{ marginBottom: 2 }}>This year (流年 {report.year.ganzhi})</div>
        <PeriodSummaryBlock s={report.year} />
      </div>

      {detailed ? (
        <>
          {(opportunities.length > 0 || risks.length > 0) && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12, marginTop: 12 }}>
              <div className="card" style={{ padding: 16 }}>
                <div className="section-title" style={{ marginBottom: 8 }}>Opportunity windows</div>
                {opportunities.length === 0 ? <p style={{ margin: 0, fontSize: 13, color: "var(--muted)" }}>No standout supportive months this year.</p> :
                  opportunities.map((m) => (
                    <div key={m.label} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5, fontSize: 13.5 }}>
                      <span className="dot" style={{ width: 9, height: 9, borderRadius: 9, background: valenceColor("supportive") }} />
                      <b>{m.label.split(" ")[0]}</b> <span style={{ color: "var(--muted)" }}>· {m.theme.domain}{m.span ? ` · ${m.span.startIso.slice(5)}→${m.span.endIso.slice(5)}` : ""}</span>
                    </div>
                  ))}
              </div>
              <div className="card" style={{ padding: 16 }}>
                <div className="section-title" style={{ marginBottom: 8 }}>Handle-with-care windows</div>
                {risks.length === 0 ? <p style={{ margin: 0, fontSize: 13, color: "var(--muted)" }}>No especially demanding months this year.</p> :
                  risks.map((m) => (
                    <div key={m.label} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5, fontSize: 13.5 }}>
                      <span className="dot" style={{ width: 9, height: 9, borderRadius: 9, background: valenceColor("challenging") }} />
                      <b>{m.label.split(" ")[0]}</b> <span style={{ color: "var(--muted)" }}>· {m.theme.domain}{m.span ? ` · ${m.span.startIso.slice(5)}→${m.span.endIso.slice(5)}` : ""}</span>
                    </div>
                  ))}
              </div>
            </div>
          )}

          <div className="section-title" style={{ marginTop: 16, marginBottom: 6 }}>Month by month (流月)</div>
          <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 4 }}>
            {report.months.map((m) => (
              <button key={m.label} onClick={() => setOpenMonth((o) => (o === m.label ? null : m.label))} className="alt-chip" style={{ minWidth: 92, flex: "0 0 auto", borderColor: openMonth === m.label ? valenceColor(m.valence) : undefined }}>
                <span className="when" style={{ fontSize: 12 }}>{m.ganzhi} · {m.label.split(" ")[0]}</span>
                <span className="meta"><span className="dot" style={{ background: valenceColor(m.valence) }} />{m.span ? `${m.span.startIso.slice(5)}→${m.span.endIso.slice(5)}` : ""}</span>
              </button>
            ))}
          </div>
          {openMonth && (() => {
            const m = report.months.find((x) => x.label === openMonth);
            return m ? <PeriodSummaryBlock s={m} /> : null;
          })()}
        </>
      ) : (
        <div className="card" style={{ padding: 16, marginTop: 12 }}>
          <p style={{ margin: 0, fontSize: 13.5, color: "var(--muted)", lineHeight: 1.55 }}>
            Month-by-month detail is limited to {DETAIL_HORIZON} years from now — that far out, the luck-decade and annual themes above are the honest level of resolution. Deterministic daily claims that far ahead would overstate what the method can say.
          </p>
        </div>
      )}

      <div className="disclaimer" style={{ marginTop: 14 }}>{report.disclaimer}</div>
    </>
  );
}
