import { DecisionResult, FivePhase, PHASE_LABEL, TEN_GOD_LABEL } from "../engine/index.ts";
import { PHASE_COLOR } from "./format.ts";

const POS_LABEL: Record<string, string> = { year: "Year", month: "Month", day: "Day · 日主", hour: "Hour" };
const ORDER: ("year" | "month" | "day" | "hour")[] = ["year", "month", "day", "hour"];

export function ChartPanel({ result }: { result: DecisionResult }) {
  const { subjectChart: chart, dayun } = result;
  const totalWeight = Object.values(chart.elements.weights).reduce((a, b) => a + b, 0) || 1;
  const phases: FivePhase[] = ["wood", "fire", "earth", "metal", "water"];

  // current luck pillar by note (we don't know exact age; show whole strip).
  return (
    <div className="panel panel-pad">
      <h2>Your BaZi Chart 八字</h2>

      <div className="pillars">
        {ORDER.map((pos) => {
          const p = chart.pillars.find((x) => x.position === pos)!;
          return (
            <div key={pos} className={`pillar ${pos === "day" ? "dm" : ""}`}>
              <div className="pos">{POS_LABEL[pos]}</div>
              <div className="gz">
                <span style={{ color: PHASE_COLOR[p.ganzhi.stem.phase] }}>{p.ganzhi.stem.hanzi}</span>
                <span style={{ color: PHASE_COLOR[p.ganzhi.branch.phase] }}>{p.ganzhi.branch.hanzi}</span>
              </div>
              <div className="sub">{p.ganzhi.pinyin}</div>
              <div className="sub">{p.naYinZh}</div>
              <div className="tg">{p.stemTenGod === "day_master" ? "Day Master" : TEN_GOD_LABEL[p.stemTenGod]}</div>
            </div>
          );
        })}
      </div>

      <div className="dm-summary">
        <span className="chip">Day Master <b>{chart.dayMaster.dayMaster.hanzi}</b> ({PHASE_LABEL[chart.dayMaster.dayMaster.phase]})</span>
        <span className="chip">Strength <b>{chart.dayMaster.strength}</b></span>
        <span className="chip">{chart.dayMaster.hasMonthCommand ? "得令 (in season)" : "失令 (out of season)"}</span>
      </div>

      <h3>Element Balance</h3>
      <div className="elements">
        {phases.map((ph) => {
          const pct = chart.elements.percent[ph];
          return (
            <div className="ele-row" key={ph}>
              <span className="name">{PHASE_LABEL[ph]}</span>
              <div className="ele-bar">
                <span style={{ width: `${(chart.elements.weights[ph] / totalWeight) * 100}%`, background: PHASE_COLOR[ph] }} />
              </div>
              <span className="pct">{pct}%</span>
            </div>
          );
        })}
      </div>

      <div className="fav-block">
        <div className="col">
          <div className="lbl">Favourable elements (用神 · medium confidence)</div>
          {chart.dayMaster.favorableElements.length ? (
            chart.dayMaster.favorableElements.map((e) => (
              <div key={e}><span className="dot" style={{ background: PHASE_COLOR[e] }} />{PHASE_LABEL[e]}</div>
            ))
          ) : (
            <div style={{ color: "var(--muted)" }}>Balanced — no strong bias</div>
          )}
        </div>
        <div className="col">
          <div className="lbl">Less favourable</div>
          {chart.dayMaster.unfavorableElements.length ? (
            chart.dayMaster.unfavorableElements.map((e) => (
              <div key={e}><span className="dot" style={{ background: PHASE_COLOR[e] }} />{PHASE_LABEL[e]}</div>
            ))
          ) : (
            <div style={{ color: "var(--muted)" }}>—</div>
          )}
        </div>
      </div>

      <h3>Luck Pillars 大運 ({dayun.direction})</h3>
      <div className="dayun-strip">
        {dayun.pillars.map((lp) => (
          <div className="dayun-cell" key={lp.index}>
            <div className="gz">
              <span style={{ color: PHASE_COLOR[lp.ganzhi.stem.phase] }}>{lp.ganzhi.stem.hanzi}</span>
              <span style={{ color: PHASE_COLOR[lp.ganzhi.branch.phase] }}>{lp.ganzhi.branch.hanzi}</span>
            </div>
            <div className="age">{lp.startAge}–{lp.endAge}y</div>
            <div className="tg">{TEN_GOD_LABEL[lp.stemTenGod].split(" ")[0]}</div>
          </div>
        ))}
      </div>

      <div className="hint" style={{ marginTop: 8 }}>{chart.dayMaster.rationale}</div>

      {result.meta.boundaryWarnings.map((w, i) => (
        <div className="warn" key={i}>⚠ {w}</div>
      ))}
    </div>
  );
}
