import {
  DayRecommendation,
  Objective,
  RuleFired,
  Versions,
  conflictSentence,
  humanHourRange,
  practicalBestHour,
  subScoreNarrative,
  whyThisDay,
} from "../engine/index.ts";
import { ConfidencePanel } from "./meters.tsx";
import { scoreColor, scoreTextColor } from "./format.ts";

const LAYER_TITLE: Record<RuleFired["layer"], string> = {
  tongshu: "From the almanac (通書)",
  bazi: "From your chart (八字)",
  shensha: "Auxiliary stars (神煞)",
  hour: "Best-hour selection (時辰)",
};
const LAYER_ORDER: RuleFired["layer"][] = ["tongshu", "bazi", "shensha", "hour"];

/** Strip internal spec section numbers from a citation, keep the classical source. */
function classicalCite(citation: string): string {
  return citation.replace(/spec §[\d.,\s§]+;?\s*/g, "").replace(/\(\s*/, "(").trim();
}

export function ReasoningDossier({
  rec,
  objective,
  hash,
  versions,
}: {
  rec: DayRecommendation;
  objective: Objective;
  hash: string;
  versions: Versions;
}) {
  const subs = subScoreNarrative(rec, objective.weights);
  const bullets = whyThisDay(rec);
  const grouped = LAYER_ORDER.map((layer) => ({
    layer,
    rules: rec.rulesFired.filter((r) => r.layer === layer),
  })).filter((g) => g.rules.length > 0);

  return (
    <details className="dossier">
      <summary>Show the full reasoning</summary>
      <div className="dossier-body">
        <h4>In short</h4>
        <ul className="why-list" style={{ margin: "0 0 4px", paddingLeft: 18 }}>
          {bullets.map((b, i) => (
            <li key={i} style={{ fontSize: 13.5, lineHeight: 1.5, marginBottom: 4 }}>
              {b}
            </li>
          ))}
        </ul>

        <h4>What went into the score</h4>
        {subs.map((s) => (
          <div className="sub-bar" key={s.key}>
            <div className="sb-head">
              <span className="sb-name">
                {s.label} <span className="sb-w">· weight {s.weightPct}%</span>
              </span>
              <span className="sb-val" style={{ color: scoreTextColor(s.value) }}>
                {s.value}
              </span>
            </div>
            <div className="sb-track">
              <div className="sb-fill" style={{ width: `${s.value}%`, background: scoreColor(s.value) }} />
            </div>
            <div className="sb-blurb">{s.blurb}</div>
          </div>
        ))}

        {rec.conflicts.length > 0 && (
          <>
            <h4>Where the traditions disagree</h4>
            {rec.conflicts.map((c, i) => (
              <p key={i} style={{ fontSize: 13, color: "var(--warn-ink)", margin: "0 0 8px", lineHeight: 1.5 }}>
                {conflictSentence(c)}
              </p>
            ))}
          </>
        )}

        <h4>How sure we are, and why</h4>
        <ConfidencePanel confidence={rec.confidence} personalized={rec.personalized} />

        <h4>Every rule that fired, with its source</h4>
        {grouped.map((g) => (
          <div className="rules-group" key={g.layer}>
            <div className="rg-title">{LAYER_TITLE[g.layer]}</div>
            {g.rules.map((r, i) => (
              <div className="rule-row" key={i}>
                <div className="rr-main">
                  <div className="rr-label">{r.label}</div>
                  <div className="rr-cite">{classicalCite(r.citation)}</div>
                </div>
                <div className={`rr-eff ${r.effect > 0 ? "pos" : r.effect < 0 ? "neg" : "zero"}`}>
                  {r.effect > 0 ? "+" : ""}
                  {r.effect}
                </div>
              </div>
            ))}
          </div>
        ))}

        {rec.personalized && rec.allHours.length > 0 && (() => {
          const ph = practicalBestHour(rec);
          const overnightBest = ph && rec.bestHour && ph.branchIndex !== rec.bestHour.branchIndex;
          return (
            <>
              <h4>All twelve double-hours</h4>
              <div className="hours-grid">
                {rec.allHours.map((h) => (
                  <div className={`hour-cell ${h.branchIndex === ph?.branchIndex ? "best" : ""}`} key={h.branchIndex}>
                    <div className="hh">{humanHourRange(h.rangeLabel)}</div>
                    <div className="hg">{h.ganzhi.hanzi}</div>
                    <div className="hs" style={{ color: scoreTextColor(h.score) }}>
                      {h.score}
                    </div>
                  </div>
                ))}
              </div>
              {overnightBest && (
                <p className="note-soft" style={{ marginTop: 6, fontSize: 11.5 }}>
                  Highlighted = your recommended daytime window; the highest-scoring hour ({humanHourRange(rec.bestHour!.rangeLabel)}) is overnight and less practical to schedule.
                </p>
              )}
            </>
          );
        })()}

        <div className="verify">
          <span className="seal-mark"><span aria-hidden="true">✓</span> Verify</span> — this exact result reproduces from the same inputs.
          <br />
          Result ID <code>{hash}</code> · engine <code>{versions.engine}</code> · calendar{" "}
          <code>{versions.calendarKernel}</code> · BaZi <code>{versions.baziAlgorithm}</code> · almanac{" "}
          <code>{versions.tongshuRulePack}</code>
        </div>
      </div>
    </details>
  );
}
