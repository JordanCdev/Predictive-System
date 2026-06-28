import { BaziChart, DaYun, PHASE_LABEL, TEN_GOD_LABEL } from "../engine/index.ts";
import { PHASE_COLOR } from "./format.ts";

const POS_LABEL: Record<string, string> = { year: "Year", month: "Month", day: "Day · 日主", hour: "Hour" };
const ORDER: ("year" | "month" | "day" | "hour")[] = ["year", "month", "day", "hour"];

/** The expert four-pillar view — shown only behind an opt-in disclosure. */
export function ChartPanel({ chart, dayun, currentAge }: { chart: BaziChart; dayun: DaYun | null; currentAge: number | null }) {
  const phases = ["wood", "fire", "earth", "metal", "water"] as const;
  const total = Object.values(chart.elements.weights).reduce((a, b) => a + b, 0) || 1;

  return (
    <div className="chart">
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
              <div className="sub">{p.naYinZh}</div>
              <div className="tg">{p.stemTenGod === "day_master" ? "Day Master" : TEN_GOD_LABEL[p.stemTenGod]}</div>
            </div>
          );
        })}
      </div>

      <h3>Element balance</h3>
      <div className="elements">
        {phases.map((ph) => (
          <div className="ele-row" key={ph}>
            <span className="name">{PHASE_LABEL[ph]}</span>
            <div className="ele-bar">
              <span style={{ width: `${(chart.elements.weights[ph] / total) * 100}%`, background: PHASE_COLOR[ph] }} />
            </div>
            <span className="pct">{chart.elements.percent[ph]}%</span>
          </div>
        ))}
      </div>

      {dayun && (
        <>
          <h3>Luck pillars 大運 ({dayun.direction})</h3>
          <div className="dayun-strip">
            {dayun.pillars.map((lp) => {
              const cur = currentAge !== null && currentAge >= lp.startAge && currentAge < lp.endAge;
              return (
                <div className={`dayun-cell ${cur ? "cur" : ""}`} key={lp.index}>
                  <div className="gz">
                    <span style={{ color: PHASE_COLOR[lp.ganzhi.stem.phase] }}>{lp.ganzhi.stem.hanzi}</span>
                    <span style={{ color: PHASE_COLOR[lp.ganzhi.branch.phase] }}>{lp.ganzhi.branch.hanzi}</span>
                  </div>
                  <div className="age">
                    {Math.round(lp.startAge)}–{Math.round(lp.endAge)}y
                  </div>
                  <div className="tg">{TEN_GOD_LABEL[lp.stemTenGod].split(" ")[0]}</div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
