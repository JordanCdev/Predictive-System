import { BaziChart, DaYun, PHASE_LABEL, TEN_GOD_LABEL, TenGod, pillarPalacePlain } from "../engine/index.ts";
import { PHASE_COLOR } from "./format.ts";

const POS_LABEL: Record<string, string> = { year: "Year", month: "Month", day: "Day · 日主", hour: "Hour" };
const ORDER: ("year" | "month" | "day" | "hour")[] = ["year", "month", "day", "hour"];

/** "Direct Wealth 正財" → "Direct Wealth" (drop the trailing hanzi token). */
function tenGodEn(g: TenGod): string {
  return TEN_GOD_LABEL[g].split(" ").slice(0, -1).join(" ");
}

/** The full four-pillar view — pillars with palaces, animals, hidden stems (藏干)
 *  and Na Yin in daylight, plus element balance and the Da Yun strip. */
export function ChartPanel({ chart, dayun, currentAge }: { chart: BaziChart; dayun: DaYun | null; currentAge: number | null }) {
  const phases = ["wood", "fire", "earth", "metal", "water"] as const;
  const total = Object.values(chart.elements.weights).reduce((a, b) => a + b, 0) || 1;

  return (
    <div className="chart">
      <div className="pillars">
        {ORDER.map((pos) => {
          const p = chart.pillars.find((x) => x.position === pos)!;
          const palace = pillarPalacePlain(pos);
          return (
            <div key={pos} className={`pillar ${pos === "day" ? "dm" : ""}`}>
              <div className="pos">{POS_LABEL[pos]}</div>
              <div className="pos" style={{ color: "var(--gold-text)", marginTop: 1 }} title={palace.note}>
                {palace.label}
              </div>
              <div className="gz">
                <span style={{ color: PHASE_COLOR[p.ganzhi.stem.phase] }}>{p.ganzhi.stem.hanzi}</span>
                <span style={{ color: PHASE_COLOR[p.ganzhi.branch.phase] }}>{p.ganzhi.branch.hanzi}</span>
              </div>
              <div className="sub">
                {p.ganzhi.branch.animal} · {p.ganzhi.branch.pinyin}
              </div>
              <div className="tg">{p.stemTenGod === "day_master" ? "Day Master" : tenGodEn(p.stemTenGod)}</div>

              {/* 藏干 — the stems hidden inside the branch, each with its Ten God. */}
              <div style={{ marginTop: 7, paddingTop: 6, borderTop: "1px solid var(--hairline)" }}>
                <div className="pos" style={{ letterSpacing: 0.4 }} title="藏干 — the stems hidden inside this branch">
                  Hidden 藏干
                </div>
                {p.hiddenStems.map((h) => (
                  <div
                    key={h.stem.index}
                    style={{ display: "flex", alignItems: "baseline", justifyContent: "center", gap: 5, fontSize: 11, lineHeight: 1.6 }}
                  >
                    <span style={{ fontFamily: "var(--serif-cjk)", fontSize: 13, color: PHASE_COLOR[h.stem.phase] }}>{h.stem.hanzi}</span>
                    <span style={{ color: "var(--muted)" }}>{tenGodEn(h.tenGod)}</span>
                  </div>
                ))}
              </div>

              {/* 納音 — the pillar's "sound" element, Chinese + English. */}
              <div className="sub" style={{ marginTop: 6 }} title="納音 — the pillar's melodic element">
                {p.naYinZh} · {p.naYinEn}
              </div>
            </div>
          );
        })}
      </div>
      <p className="ask-note" style={{ marginTop: 8 }}>
        Palace labels (ancestry / parents &amp; career / self &amp; spouse / children &amp; later life) follow the classical Zi Ping
        mapping — a traditional lens on each pillar, not a verdict.
      </p>

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
      <p style={{ margin: "6px 0 0", fontSize: 12.5, color: "var(--muted)", lineHeight: 1.5 }}>
        Most present: <b style={{ color: PHASE_COLOR[chart.elements.dominant] }}>{PHASE_LABEL[chart.elements.dominant]}</b> · least
        present: <b style={{ color: PHASE_COLOR[chart.elements.weakest] }}>{PHASE_LABEL[chart.elements.weakest]}</b>. Weighted by hidden
        stems and the month's seasonal command — an accounting convention, not a score.
      </p>

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
