import { DayRecommendation, McdaWeights } from "../engine/index.ts";
import { PHASE_COLOR, confidenceLabel, prettyDate, scoreColor, scoreLabel } from "./format.ts";

const POLARITY_CLASS: Record<string, string> = { good: "yellow", bad: "black", neutral: "hour" };

export function DayCard({
  rec,
  rank,
  weights,
  expanded,
  onToggle,
}: {
  rec: DayRecommendation;
  rank: number;
  weights: McdaWeights;
  expanded: boolean;
  onToggle: () => void;
}) {
  const gz = rec.tongshu.dayGanzhi;
  const color = scoreColor(rec.finalScore);

  return (
    <div className={`day-card ${rank === 1 ? "top" : ""}`}>
      <div className="day-card-head" onClick={onToggle}>
        <div className={`rank-badge ${rank === 1 ? "gold" : ""}`}>{rank}</div>
        <div className="gz-mini">
          <span style={{ color: PHASE_COLOR[gz.stem.phase] }}>{gz.stem.hanzi}</span>
          <span style={{ color: PHASE_COLOR[gz.branch.phase] }}>{gz.branch.hanzi}</span>
        </div>
        <div className="date">
          <div className="d1">{prettyDate(rec.civil)}</div>
          <div className="d2">
            {gz.pinyin} day · {rec.tongshu.dayGanzhi.branch.animal} · best hour {rec.bestHour.ganzhi.branch.hanzi} ({rec.bestHour.rangeLabel.split(" ")[1]})
          </div>
        </div>
        <div className="score-ring">
          <div className="num" style={{ color }}>{rec.finalScore}</div>
          <div className="lab" style={{ color }}>{scoreLabel(rec.finalScore)}</div>
        </div>
      </div>

      <div className="badges">
        <span className="badge">建除 {rec.tongshu.officer.nameZh} {rec.tongshu.officer.nameEn}</span>
        <span className={`badge ${rec.tongshu.dayGod.yellow ? "yellow" : "black"}`}>
          {rec.tongshu.dayGod.yellow ? "黄道" : "黑道"} {rec.tongshu.dayGod.nameZh}
        </span>
        <span className="badge hour">⏱ {rec.bestHour.ganzhi.hanzi} {rec.bestHour.rangeLabel.split(" ")[1]}</span>
        <span className="badge">Confidence {confidenceLabel(rec.confidence.overall)} ({rec.confidence.overall})</span>
        {rec.conflicts.length > 0 && <span className="badge conflict">⚠ {rec.conflicts.length} conflict{rec.conflicts.length > 1 ? "s" : ""}</span>}
        {rec.shenShaTags.map((t) => (
          <span key={t.nameEn} className={`badge ${POLARITY_CLASS[t.polarity]}`}>{t.nameZh}</span>
        ))}
      </div>

      <ul className="reasons">
        {rec.topReasons.map((r, i) => (
          <li key={i}>• {r}</li>
        ))}
      </ul>

      {expanded && <DayDetail rec={rec} weights={weights} />}
    </div>
  );
}

function DayDetail({ rec, weights }: { rec: DayRecommendation; weights: McdaWeights }) {
  const subs: { k: string; v: number; w: number }[] = [
    { k: "Officer 建除", v: rec.subScores.officer, w: weights.officer },
    { k: "Day-road 黄黑", v: rec.subScores.road, w: weights.road },
    { k: "Personal 八字", v: rec.subScores.personal, w: weights.personal },
    { k: "Hour 時辰", v: rec.subScores.hour, w: weights.hour },
  ];

  return (
    <div className="detail">
      <h4>Score breakdown (deterministic MCDA)</h4>
      <div className="subscore-grid">
        {subs.map((s) => (
          <div className="subscore" key={s.k}>
            <div className="v" style={{ color: scoreColor(s.v) }}>{s.v}</div>
            <div className="k">{s.k}</div>
            <div className="w">weight {Math.round(s.w * 100)}%</div>
          </div>
        ))}
      </div>

      {rec.conflicts.length > 0 && (
        <>
          <h4>School conflicts (shown, not silently resolved)</h4>
          {rec.conflicts.map((c, i) => (
            <div className="conflict-note" key={i}>
              <b>{c.schools.join(" ↔ ")}</b> · {c.severity} — {c.reason}
            </div>
          ))}
        </>
      )}

      <h4>Rules fired & citations</h4>
      {rec.rulesFired.map((r, i) => (
        <div className="rule" key={i}>
          <div>
            <div className="lbl">{r.label}</div>
            <div className="cite">{r.citation}</div>
          </div>
          <div className={`eff ${r.effect > 0 ? "pos" : r.effect < 0 ? "neg" : "zero"}`}>
            {r.effect > 0 ? "+" : ""}{r.effect}
          </div>
        </div>
      ))}

      <h4>All 12 double-hours (時辰)</h4>
      <div className="hours-grid">
        {rec.allHours.map((h) => (
          <div className={`hour-cell ${h.branchIndex === rec.bestHour.branchIndex ? "best" : ""}`} key={h.branchIndex}>
            <div className="hgz">{h.ganzhi.hanzi}</div>
            <div className="hr">{h.rangeLabel.split(" ").slice(1).join(" ")}</div>
            <div className="hs" style={{ color: scoreColor(h.score) }}>{h.score}</div>
          </div>
        ))}
      </div>

      <h4>Confidence components (spec §12)</h4>
      <div style={{ fontSize: 11.5, color: "var(--muted)", lineHeight: 1.8 }}>
        Reproducibility {pc(rec.confidence.components.calculationReproducibility)} · Source {pc(rec.confidence.components.sourceQuality)} · Specificity {pc(rec.confidence.components.sourceSpecificity)} · School agreement {pc(rec.confidence.components.schoolAgreement)} · Input quality {pc(rec.confidence.components.inputQuality)} · Validation {pc(rec.confidence.components.validationConcordance)} · Rule coverage {pc(rec.confidence.components.ruleCoverage)}
      </div>
    </div>
  );
}

function pc(n: number): string {
  return `${Math.round(n * 100)}%`;
}
