import { useEffect, useMemo, useState } from "react";
import {
  CONVENTION_PRESETS,
  DecisionRequest,
  DecisionResult,
  OBJECTIVES,
  evaluateDecision,
  objectiveById,
} from "./engine/index.ts";
import { ChartPanel } from "./ui/ChartPanel.tsx";
import { DayCard } from "./ui/DayCard.tsx";
import { Heatmap } from "./ui/Heatmap.tsx";

// UI-only defaults (engine still receives explicit values → stays deterministic).
const today = new Date();
const pad = (n: number) => String(n).padStart(2, "0");
const todayStr = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
const defaultTz = -today.getTimezoneOffset();

interface FormState {
  birthDate: string;
  birthTime: string;
  sex: "male" | "female";
  timeCertainty: "exact" | "approximate" | "hour_unknown";
  tzOffset: number;
  conventionId: string;
  objectiveId: string;
  windowStart: string;
  windowDays: number;
}

const TZ_OPTIONS = (() => {
  const opts: { value: number; label: string }[] = [];
  for (let m = -12 * 60; m <= 14 * 60; m += 30) {
    const sign = m < 0 ? "-" : "+";
    const a = Math.abs(m);
    opts.push({ value: m, label: `UTC${sign}${pad(Math.floor(a / 60))}:${pad(a % 60)}` });
  }
  return opts;
})();

function buildRequest(f: FormState): DecisionRequest {
  const [by, bm, bd] = f.birthDate.split("-").map(Number);
  const [bh, bmin] = f.birthTime.split(":").map(Number);
  const [wy, wm, wd] = f.windowStart.split("-").map(Number);
  const convention = CONVENTION_PRESETS.find((c) => c.id === f.conventionId) ?? CONVENTION_PRESETS[0];
  return {
    birth: { year: by, month: bm, day: bd, hour: bh, minute: bmin, tzOffsetMinutes: f.tzOffset, timeCertainty: f.timeCertainty },
    sex: f.sex,
    convention,
    objective: objectiveById(f.objectiveId),
    window: { start: { year: wy, month: wm, day: wd }, days: f.windowDays, tzOffsetMinutes: f.tzOffset },
  };
}

export function App() {
  const [form, setForm] = useState<FormState>({
    birthDate: "1990-06-15",
    birthTime: "14:30",
    sex: "male",
    timeCertainty: "exact",
    tzOffset: defaultTz,
    conventionId: CONVENTION_PRESETS[0].id,
    objectiveId: OBJECTIVES[0].id,
    windowStart: todayStr,
    windowDays: 45,
  });
  const [result, setResult] = useState<DecisionResult | null>(null);
  const [expandedIso, setExpandedIso] = useState<string | null>(null);
  const [selectedIso, setSelectedIso] = useState<string | null>(null);
  const [showRejects, setShowRejects] = useState(false);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((s) => ({ ...s, [k]: v }));

  const run = () => {
    const res = evaluateDecision(buildRequest(form));
    setResult(res);
    setExpandedIso(res.recommendations[0]?.isoDate ?? null);
    setSelectedIso(res.recommendations[0]?.isoDate ?? null);
  };

  // Auto-run once on mount so the page is never empty.
  useEffect(() => { run(); /* eslint-disable-next-line */ }, []);

  const objective = useMemo(() => objectiveById(form.objectiveId), [form.objectiveId]);

  return (
    <div className="app">
      <header className="masthead">
        <div className="sigil">易</div>
        <div>
          <h1>Decision Timing Engine</h1>
          <p className="tagline">A deterministic, explainable Chinese-metaphysics engine for choosing <i>when</i> to act.</p>
        </div>
      </header>

      <div className="principle">
        <b>How this works.</b> Every result is computed by pure, reproducible functions — solar terms, four pillars, Tong Shu
        day-officers and your personal BaZi — then ranked by transparent multi-criteria scoring. No AI guesses the dates; the
        machine shows its calculations, the rules it fired, source citations, school conflicts and a confidence index. Same
        inputs always give the same answer.
      </div>

      <div className="grid">
        {/* ---------------- input panel ---------------- */}
        <div className="panel panel-pad form-sticky">
          <h2>1 · Who & what</h2>

          <h3>Your birth (for personalization)</h3>
          <div className="row">
            <label className="field"><span>Birth date</span>
              <input type="date" value={form.birthDate} onChange={(e) => set("birthDate", e.target.value)} />
            </label>
            <label className="field"><span>Birth time</span>
              <input type="time" value={form.birthTime} onChange={(e) => set("birthTime", e.target.value)} />
            </label>
          </div>
          <label className="field"><span>Birth time-zone</span>
            <select value={form.tzOffset} onChange={(e) => set("tzOffset", Number(e.target.value))}>
              {TZ_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>
          <div className="row">
            <label className="field"><span>Sex (for 大運 direction)</span>
              <div className="seg">
                <button className={form.sex === "male" ? "on" : ""} onClick={() => set("sex", "male")}>Male</button>
                <button className={form.sex === "female" ? "on" : ""} onClick={() => set("sex", "female")}>Female</button>
              </div>
            </label>
            <label className="field"><span>Time certainty</span>
              <select value={form.timeCertainty} onChange={(e) => set("timeCertainty", e.target.value as FormState["timeCertainty"])}>
                <option value="exact">Exact</option>
                <option value="approximate">Approximate</option>
                <option value="hour_unknown">Hour unknown</option>
              </select>
            </label>
          </div>

          <h3>Convention set (doctrine)</h3>
          <label className="field">
            <select value={form.conventionId} onChange={(e) => set("conventionId", e.target.value)}>
              {CONVENTION_PRESETS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
            <div className="hint">Every calculation is bound to an explicit convention (day-rollover, hour basis…), so disputes are visible, not hidden.</div>
          </label>

          <h2 style={{ marginTop: 22 }}>2 · The decision</h2>
          <label className="field"><span>What are you timing?</span>
            <select value={form.objectiveId} onChange={(e) => set("objectiveId", e.target.value)}>
              {OBJECTIVES.map((o) => <option key={o.id} value={o.id}>{o.emoji} {o.label}</option>)}
            </select>
          </label>
          <div className="hint" style={{ marginTop: -6, marginBottom: 12 }}>{objective.description}</div>

          <h3>Search window</h3>
          <div className="row">
            <label className="field"><span>Start date</span>
              <input type="date" value={form.windowStart} onChange={(e) => set("windowStart", e.target.value)} />
            </label>
            <label className="field"><span>Days to scan</span>
              <input type="number" min={1} max={180} value={form.windowDays} onChange={(e) => set("windowDays", Math.max(1, Math.min(180, Number(e.target.value))))} />
            </label>
          </div>

          <button className="btn-primary" onClick={run}>Compute auspicious timing</button>
          <div className="hint" style={{ marginTop: 8 }}>Runs entirely in your browser. Nothing is sent anywhere.</div>
        </div>

        {/* ---------------- results ---------------- */}
        <div>
          {result && <ChartPanel result={result} />}

          {result && (
            <div className="panel panel-pad" style={{ marginTop: 22 }}>
              <div className="result-head">
                <div className="obj">{objective.emoji} Best timing — {objective.label}</div>
                <div className="meta">{result.meta.windowLabel}</div>
              </div>
              <div className="hint">{objective.doctrineNote}</div>

              <Heatmap
                days={result.allDays}
                selectedIso={selectedIso}
                onSelect={(iso) => { setSelectedIso(iso); setExpandedIso(iso); }}
              />

              {result.recommendations.length === 0 ? (
                <div className="empty"><div className="big">無</div>No qualifying days in this window — every candidate was vetoed. Widen the window or relax the objective.</div>
              ) : (
                <div className="section-label">Ranked days ({result.recommendations.length} qualifying)</div>
              )}

              {result.recommendations.slice(0, 60).map((rec, i) => (
                <DayCard
                  key={rec.isoDate}
                  rec={rec}
                  rank={i + 1}
                  weights={objective.weights}
                  expanded={expandedIso === rec.isoDate}
                  onToggle={() => setExpandedIso(expandedIso === rec.isoDate ? null : rec.isoDate)}
                />
              ))}

              {result.rejected.length > 0 && (
                <>
                  <button className="toggle-rejects" onClick={() => setShowRejects((s) => !s)}>
                    {showRejects ? "▾ Hide" : "▸ Show"} {result.rejected.length} vetoed day{result.rejected.length > 1 ? "s" : ""} (hard constraints)
                  </button>
                  {showRejects && result.rejected.map((rec) => (
                    <div className="day-card reject-card" key={rec.isoDate}>
                      <div className="day-card-head" style={{ cursor: "default" }}>
                        <div className="rank-badge">✕</div>
                        <div className="gz-mini">{rec.tongshu.dayGanzhi.hanzi}</div>
                        <div className="date"><div className="d1">{rec.isoDate} · {rec.weekday}</div><div className="d2">建除 {rec.tongshu.officer.nameZh} · {rec.tongshu.dayGod.nameZh}</div></div>
                      </div>
                      {rec.rejectReasons.map((r, i) => <div className="reject-reason" key={i}>⛔ {r}</div>)}
                    </div>
                  ))}
                </>
              )}

              <FooterMeta result={result} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function FooterMeta({ result }: { result: DecisionResult }) {
  const v = result.meta.engineVersions;
  return (
    <>
      <div className="footer-meta">
        <div>Convention: <code>{result.meta.conventionId}</code> · Calculation hash: <code>{result.meta.calculationHash}</code></div>
        <div>
          Versions — engine <code>{v.engine}</code>, calendar <code>{v.calendarKernel}</code>, solar <code>{v.solarModel}</code>,
          BaZi <code>{v.baziAlgorithm}</code>, Tong Shu <code>{v.tongshuRulePack}</code>, policy <code>{v.decisionPolicy}</code>
        </div>
        <div>{result.meta.generatedAtNote}</div>
      </div>
      <div className="disclaimer">
        This engine is a transparent decision-support tool grounded in classical Chinese-metaphysics rules (BaZi / Zi Ping and
        Tong Shu day selection) plus astronomical solar-term calculation. Its <b>confidence index reflects reproducibility,
        source support and school agreement — not an empirical probability that any life outcome will occur</b>. Different
        masters and lineages legitimately disagree; conflicts are shown rather than hidden. Use it as one structured input
        alongside your own judgement and practical constraints.
      </div>
    </>
  );
}
