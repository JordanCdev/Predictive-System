import { BaziChart, DaYun, dayMasterPlain, elementHanzi, elementPlain } from "../engine/index.ts";
import { ChartPanel } from "./ChartPanel.tsx";
import { PHASE_COLOR } from "./format.ts";

/** Plain-English-first personal chart, with the expert pillars tucked behind a disclosure. */
export function YourChart({
  chart,
  dayun,
  currentAge,
  boundaryWarnings,
}: {
  chart: BaziChart;
  dayun: DaYun | null;
  currentAge: number | null;
  boundaryWarnings: string[];
}) {
  const dm = chart.dayMaster;
  return (
    <div className="card" style={{ padding: 20, marginTop: 18 }}>
      <h3 style={{ margin: "0 0 8px", fontSize: 16, fontWeight: 600 }}>Your chart</h3>
      <p style={{ margin: "0 0 14px", fontSize: 14.5, color: "var(--muted)", lineHeight: 1.55 }}>{dayMasterPlain(dm)}</p>

      <div className="element-chips">
        {dm.favorableElements.map((e) => (
          <span className="ec" key={`f-${e}`}>
            <span className="dot" style={{ background: PHASE_COLOR[e] }} />
            {elementPlain(e)} {elementHanzi(e)} · helps you
          </span>
        ))}
        {dm.unfavorableElements.map((e) => (
          <span className="ec" key={`u-${e}`}>
            <span className="dot" style={{ background: PHASE_COLOR[e], opacity: 0.5 }} />
            {elementPlain(e)} {elementHanzi(e)} · strains you
          </span>
        ))}
      </div>

      {boundaryWarnings.map((w, i) => (
        <div className="warn" key={i}>
          <span aria-hidden="true">⚠</span> {w}
        </div>
      ))}

      <details className="dossier" style={{ marginTop: 14 }}>
        <summary>Show the full chart (for practitioners)</summary>
        <div className="dossier-body">
          <ChartPanel chart={chart} dayun={dayun} currentAge={currentAge} />
          <p className="note-soft" style={{ marginTop: 12 }}>
            {dm.rationale.replace(/MEDIUM confidence \(school-dependent\)\./, "(interpretation varies by school).")}
          </p>
        </div>
      </details>
    </div>
  );
}
