import { useMemo, useState } from "react";
import {
  BaziChart,
  DaYun,
  PeriodSummary,
  PeriodValence,
  buildPeriodsReport,
} from "../engine/index.ts";

const VALENCE_COLOR: Record<PeriodValence, string> = {
  supportive: "#1d9e75",
  mixed: "#c99a2e",
  challenging: "#c0442e",
  neutral: "var(--muted)",
};

const VALENCE_LABEL: Record<PeriodValence, string> = {
  supportive: "Supportive",
  mixed: "Mixed",
  challenging: "Demanding",
  neutral: "Quiet",
};

function SummaryBlock({ s }: { s: PeriodSummary }) {
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
        <span className="dot" style={{ width: 9, height: 9, borderRadius: 9, background: VALENCE_COLOR[s.valence], display: "inline-block" }} />
        <b style={{ fontSize: 14 }}>{s.label}</b>
        <span style={{ fontSize: 12, color: VALENCE_COLOR[s.valence] }}>{VALENCE_LABEL[s.valence]}</span>
        {s.taiSui && s.taiSui.fanTaiSui && (
          <span
            title={s.taiSui.label}
            style={{ fontSize: 11, fontWeight: 600, color: "#c0442e", border: "1px solid #c0442e55", borderRadius: 999, padding: "1px 8px" }}
          >
            犯太歲 · {s.taiSui.relation}
          </span>
        )}
      </div>
      {/* Theme + the natal life areas this period touches */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", margin: "0 0 6px" }}>
        <span style={{ fontSize: 11.5, background: "var(--hairline)", borderRadius: 999, padding: "1px 9px", color: "var(--ink)" }}>
          {s.theme.domain}
        </span>
        {s.lifeAreas.map((a) => (
          <span key={a} style={{ fontSize: 11.5, color: "var(--muted)", border: "1px solid var(--hairline)", borderRadius: 999, padding: "1px 8px" }}>
            {a}
          </span>
        ))}
      </div>
      <p style={{ margin: "0 0 6px", fontSize: 13.5, color: "var(--muted)", lineHeight: 1.5 }}>{s.headline}</p>
      {s.tailwinds.length > 0 && (
        <ul className="why-list" style={{ margin: "2px 0", paddingLeft: 18 }}>
          {s.tailwinds.map((t, i) => (
            <li key={`t${i}`} style={{ fontSize: 12.5, color: "var(--muted)", lineHeight: 1.45 }}>▲ {t}</li>
          ))}
        </ul>
      )}
      {s.headwinds.map((h, i) => (
        <div key={`h${i}`} style={{ fontSize: 12.5, color: "var(--muted)", lineHeight: 1.45, paddingLeft: 18 }}>▽ {h}</div>
      ))}
      {s.cautions.map((c, i) => (
        <div key={`c${i}`} style={{ fontSize: 12.5, color: VALENCE_COLOR.challenging, lineHeight: 1.45, paddingLeft: 18 }}>⚠ {c}</div>
      ))}
    </div>
  );
}

/** Year & month tendency analysis (大運 / 流年 / 流月) tied to the chart. */
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

  return (
    <div className="card" style={{ padding: 20, marginTop: 18 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Year &amp; month outlook</h3>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <button className="btn-ghost" style={{ width: "auto", padding: "4px 12px" }} onClick={() => setTargetYear((y) => y - 1)}>‹</button>
          <b style={{ minWidth: 44, textAlign: "center", fontSize: 15 }}>{targetYear}</b>
          <button className="btn-ghost" style={{ width: "auto", padding: "4px 12px" }} onClick={() => setTargetYear((y) => y + 1)}>›</button>
        </div>
      </div>

      <p style={{ margin: "8px 0 0", fontSize: 14, color: "var(--ink)", lineHeight: 1.55 }}>{report.interaction}</p>

      {report.activeLuck && <SummaryBlock s={report.activeLuck} />}
      <SummaryBlock s={report.year} />

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
              borderColor: openMonth === m.label ? VALENCE_COLOR[m.valence] : undefined,
            }}
          >
            <span className="when" style={{ fontSize: 12 }}>{m.ganzhi} · {m.label.split(" ")[0]}</span>
            <span className="meta">
              <span className="dot" style={{ background: VALENCE_COLOR[m.valence] }} />
              {m.span ? `${m.span.startIso.slice(5)}→${m.span.endIso.slice(5)}` : ""}
            </span>
          </button>
        ))}
      </div>

      {openMonth && (() => {
        const m = report.months.find((x) => x.label === openMonth);
        return m ? <SummaryBlock s={m} /> : null;
      })()}

      <div className="disclaimer" style={{ marginTop: 14 }}>{report.disclaimer}</div>
    </div>
  );
}
