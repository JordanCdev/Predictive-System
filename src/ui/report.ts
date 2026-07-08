/**
 * Shareable report (ROADMAP §5 item 12) — a self-contained, dependency-free HTML
 * document the user can save, print, or "Save as PDF". Pure string-building over
 * the already-computed reading; the download is triggered by the user's click
 * (mirrors ics.ts). Deterministic given its inputs (a timestamp is passed in).
 */
import {
  BaziChart,
  DayRecommendation,
  DecisionResult,
  Objective,
  PeriodSummary,
  actionGuidance,
  confidenceLabel,
  dayMasterPlain,
  elementPlain,
  headlineVerdict,
  humanDate,
  humanHourRange,
  objectivePlain,
  practicalBestHour,
  subScoreNarrative,
  verdictBand,
  whyThisDay,
} from "../engine/index.ts";

export interface ReportParams {
  rec: DayRecommendation;
  objective: Objective;
  meta: DecisionResult["meta"] & { personalized: boolean };
  chart: BaziChart | null;
  yearOutlook: PeriodSummary | null;
  generatedNote: string;
}

const esc = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const ul = (items: string[]): string => `<ul>${items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>`;

export function buildReportHTML(p: ReportParams): string {
  const { rec, objective, meta, chart, yearOutlook } = p;
  const obj = objectivePlain(objective.id);
  const band = verdictBand(rec.recommendationScore);
  const ph = rec.personalized ? practicalBestHour(rec) : null;

  const subScores = subScoreNarrative(rec, objective.weights)
    .map((s) => `<tr><td>${esc(s.label)}</td><td class="num">${s.value}</td><td class="num muted">${s.weightPct}%</td></tr>`)
    .join("");

  const chartBlock =
    meta.personalized && chart
      ? `<section>
           <h2>Your chart</h2>
           <p>${esc(dayMasterPlain(chart.dayMaster))}</p>
           <p class="muted">Favourable: ${esc(chart.dayMaster.favorableElements.map(elementPlain).join(", ") || "—")} · Unfavourable: ${esc(chart.dayMaster.unfavorableElements.map(elementPlain).join(", ") || "—")}</p>
         </section>`
      : "";

  const yearBlock = yearOutlook
    ? `<section>
         <h2>This year's outlook</h2>
         <p>${esc(yearOutlook.headline)}</p>
         ${yearOutlook.tailwinds.length ? `<p class="muted"><b>Tailwinds</b></p>${ul(yearOutlook.tailwinds)}` : ""}
         ${yearOutlook.headwinds.length ? `<p class="muted"><b>Headwinds</b></p>${ul(yearOutlook.headwinds)}` : ""}
         ${yearOutlook.cautions.length ? `<p class="muted"><b>Handle with care</b></p>${ul(yearOutlook.cautions)}` : ""}
       </section>`
    : "";

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Wéi report — ${esc(obj.gerund)} · ${esc(rec.isoDate)}</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { font-family: Georgia, "Songti SC", serif; color: #2c2a24; background: #fff; max-width: 720px; margin: 32px auto; padding: 0 20px; line-height: 1.55; }
  header { border-bottom: 2px solid #b8924a; padding-bottom: 12px; margin-bottom: 20px; }
  .seal { font-size: 22px; color: #b5432e; }
  h1 { font-size: 22px; margin: 6px 0 2px; }
  h2 { font-size: 15px; margin: 22px 0 6px; color: #6b6760; text-transform: uppercase; letter-spacing: 0.06em; }
  .verdict { font-size: 17px; margin: 6px 0; }
  .score { display: inline-block; font-weight: 700; padding: 1px 10px; border-radius: 999px; border: 1px solid currentColor; }
  .muted { color: #6b6760; }
  ul { margin: 4px 0 0; padding-left: 20px; }
  li { margin: 2px 0; }
  table { border-collapse: collapse; width: 100%; margin-top: 4px; font-size: 14px; }
  td { padding: 3px 6px; border-bottom: 1px solid rgba(20,18,12,0.08); }
  td.num { text-align: right; font-variant-numeric: tabular-nums; }
  footer { margin-top: 28px; border-top: 1px solid rgba(20,18,12,0.12); padding-top: 12px; font-size: 12px; color: #6b6760; }
  code { font-family: ui-monospace, Menlo, monospace; font-size: 11px; word-break: break-all; }
  @media print { body { margin: 0; max-width: none; } }
</style></head>
<body>
  <header>
    <div class="seal">易 · Wéi — Decision Timing</div>
    <h1>${esc(obj.gerund)}</h1>
    <div class="muted">${esc(meta.windowLabel)} · ${meta.personalized ? "personalised to your chart" : "general almanac reading"}</div>
  </header>

  <section>
    <h2>Best day</h2>
    <p class="verdict"><b>${esc(humanDate(rec.civil))}</b></p>
    <p class="verdict">${esc(headlineVerdict(rec, objective))}</p>
    <p><span class="score">${rec.recommendationScore}/100 · ${esc(band.label)}</span>
       &nbsp; <span class="muted">${esc(confidenceLabel(rec.confidence.recommendationConfidence))} (${rec.confidence.recommendationConfidence}/100)</span></p>
    ${ph ? `<p>◷ Best window: <b>${esc(humanHourRange(ph.rangeLabel))}</b></p>` : ""}
  </section>

  <section>
    <h2>Why this day</h2>
    ${ul(whyThisDay(rec))}
  </section>

  <section>
    <h2>What to do</h2>
    ${ul(actionGuidance(rec, objective))}
  </section>

  <section>
    <h2>Score breakdown</h2>
    <table><tbody>${subScores}</tbody></table>
  </section>

  ${chartBlock}
  ${yearBlock}

  <footer>
    <p>The recommendation score is a transparent heuristic under this rule set — not a prediction, and confidence is not a probability the undertaking succeeds. Different schools legitimately disagree; use this as one input alongside your own judgement.</p>
    <p>${esc(p.generatedNote)} · Engine ${esc(meta.engineVersions.engine ?? "")} · Reproducible hash <code>${esc(meta.calculationHash)}</code></p>
  </footer>
</body></html>`;
}

/** Trigger a client-side download of the shareable HTML report. */
export function downloadReport(p: ReportParams): void {
  const blob = new Blob([buildReportHTML(p)], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `wei-report-${p.objective.id}-${p.rec.isoDate}.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
