import { useMemo, useState } from "react";
import {
  BaziChart,
  DaYun,
  buildPeriodsReport,
} from "../engine/index.ts";
import { PeriodSummaryBlock } from "./PeriodSummaryBlock.tsx";
import { LuckEntry, LuckTimeline } from "./LuckTimeline.tsx";
import { Gate, UpgradePrompt } from "./billing/UpgradePrompt.tsx";
import { useEntitlements } from "./profile/EntitlementsContext.tsx";
import { valenceColor } from "./format.ts";

/** Year & month tendency analysis (大運 / 流年 / 流月) tied to the chart, with a
 *  life-spanning luck scrubber and an unbounded year stepper. */
export function PeriodsPanel({
  chart,
  dayun,
  birth,
  todayIso,
}: {
  chart: BaziChart;
  dayun: DaYun | null;
  birth: { year: number; month: number; day: number };
  todayIso: string;
}) {
  const currentYear = Number(todayIso.slice(0, 4));
  const [targetYear, setTargetYear] = useState(currentYear);
  const [openMonth, setOpenMonth] = useState<string | null>(null);

  const report = useMemo(
    () => buildPeriodsReport({ chart, dayun, birth, targetYear }),
    [chart, dayun, birth, targetYear],
  );

  // Zip the raw luck pillars (age spans) with their summaries (valence + detail).
  const luckEntries = useMemo<LuckEntry[]>(() => {
    if (!dayun) return [];
    return dayun.pillars.map((p, i) => ({
      summary: report.luckPillars[i],
      startAge: p.startAge,
      endAge: p.endAge,
      active: report.luckPillars[i]?.label.startsWith("now") ?? false,
    }));
  }, [dayun, report]);

  const natalGanzhi = chart.pillars.map((p) => p.ganzhi.hanzi);
  // Same rule as YearlyPage: the CURRENT year reads free, any other year is Pro.
  // Without this the stepper here rendered a full 流年 + twelve 流月 for 2029 —
  // byte-identical to the content YearlyPage paywalls, one route over.
  const { can } = useEntitlements();
  const yearLocked = targetYear !== currentYear && !can("year_forecast");

  return (
    <div className="card" style={{ padding: 20, marginTop: 18 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Your luck cycle &amp; outlook</h3>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <button className="btn-ghost" style={{ width: "auto", padding: "4px 12px" }} aria-label="Previous year" onClick={() => setTargetYear((y) => y - 1)}>‹</button>
          <b style={{ minWidth: 44, textAlign: "center", fontSize: 15 }}>{targetYear}</b>
          <button className="btn-ghost" style={{ width: "auto", padding: "4px 12px" }} aria-label="Next year" onClick={() => setTargetYear((y) => y + 1)}>›</button>
          {targetYear !== currentYear && (
            <button className="btn-text" style={{ paddingRight: 0 }} onClick={() => setTargetYear(currentYear)}>Today</button>
          )}
        </div>
      </div>

      {/* Life-spanning luck scrubber — the decade active for the selected year is
          highlighted and opened; tap any decade to read it. */}
      <Gate feature="luck_pillars" compact preview={<LuckTimeline entries={luckEntries} natalGanzhi={natalGanzhi} teaser />}>
        <LuckTimeline entries={luckEntries} natalGanzhi={natalGanzhi} />
      </Gate>

      {yearLocked ? (
        <>
          <UpgradePrompt feature="year_forecast" compact />
          <p className="ask-note" style={{ marginTop: 4 }}>
            {currentYear} reads in full on every plan — press “Today” above.
          </p>
        </>
      ) : (
        <>
          <p style={{ margin: "14px 0 0", fontSize: 14, color: "var(--ink)", lineHeight: 1.55 }}>{report.interaction}</p>

          <PeriodSummaryBlock s={report.year} />

      <div className="section-title" style={{ marginTop: 16, marginBottom: 6 }}>The twelve solar months</div>
      <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 4 }}>
        {report.months.map((m) => (
          <button
            key={m.label}
            onClick={() => setOpenMonth((o) => (o === m.label ? null : m.label))}
            className="alt-chip"
            style={{
              minWidth: 92,
              flex: "0 0 auto",
              borderColor: openMonth === m.label ? valenceColor(m.valence) : undefined,
            }}
          >
            <span className="when" style={{ fontSize: 12 }}>{m.ganzhi} · {m.label.split(" ")[0]}</span>
            <span className="meta">
              <span className="dot" style={{ background: valenceColor(m.valence) }} />
              {m.span ? `${m.span.startIso.slice(5)}→${m.span.endIso.slice(5)}` : ""}
            </span>
          </button>
        ))}
      </div>

          {openMonth && (() => {
            const m = report.months.find((x) => x.label === openMonth);
            return m ? <PeriodSummaryBlock s={m} /> : null;
          })()}
        </>
      )}

      <div className="disclaimer" style={{ marginTop: 14 }}>{report.disclaimer}</div>
    </div>
  );
}
