import {
  BaziChart,
  DaYun,
  currentLuckPillar,
  dayMasterArchetype,
  dayMasterPlain,
  elementHanzi,
  elementPlain,
  functionalElementsPlain,
  interactionPlain,
  luckPhasePlain,
  rootingPlain,
  seasonalStatePlain,
  strengthStructurePlain,
} from "../engine/index.ts";
import { ChartPanel } from "./ChartPanel.tsx";
import { LuckyKeys } from "./LuckyKeys.tsx";
import { PHASE_COLOR } from "./format.ts";

/** Plain-English-first personal chart. The four pillars, hidden stems, Na Yin,
 *  element map and lucky stars all read in daylight — chart transparency is
 *  never gated; only the deepest practitioner note stays behind a disclosure. */
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
  const luck = currentLuckPillar(dayun, currentAge);
  const arch = dayMasterArchetype(dm.dayMaster.index);
  return (
    <div className="card" style={{ padding: 20, marginTop: 18 }}>
      <h3 style={{ margin: "0 0 8px", fontSize: 16, fontWeight: 600 }}>Your chart</h3>
      <p style={{ margin: "0 0 8px", fontSize: 14.5, color: "var(--muted)", lineHeight: 1.55 }}>{dayMasterPlain(dm)}</p>

      {/* Day-Master archetype — the classical stem imagery, labelled as tradition. */}
      <div
        style={{
          display: "flex",
          gap: 14,
          alignItems: "flex-start",
          margin: "10px 0",
          padding: "12px 14px",
          background: "var(--surface-2)",
          border: "1px solid var(--hairline)",
          borderRadius: 12,
        }}
      >
        <span
          aria-hidden="true"
          style={{ fontFamily: "var(--serif-cjk)", fontSize: 36, lineHeight: 1.1, color: PHASE_COLOR[dm.dayMaster.phase] }}
        >
          {arch.hanzi}
        </span>
        <div>
          <b style={{ fontSize: 14 }}>{arch.title}</b>
          <p style={{ margin: "4px 0 0", fontSize: 13.5, color: "var(--ink)", lineHeight: 1.55 }}>{arch.paragraph}</p>
          <p
            style={{
              margin: "8px 0 0",
              fontSize: 13.5,
              lineHeight: 1.55,
              color: dm.structure !== "normal" ? "var(--warn-ink)" : "var(--muted)",
            }}
          >
            {strengthStructurePlain(dm)}
          </p>
          <p className="ask-note" style={{ margin: "8px 0 0" }}>
            A character sketch from the classical stem imagery — tradition's lens on temperament, not a prediction.
          </p>
        </div>
      </div>

      {luck && <p style={{ margin: "0 0 14px", fontSize: 14, color: "var(--muted)", lineHeight: 1.55 }}>{luckPhasePlain(luck)}</p>}

      <div className="element-chips">
        <span className="ec" title="旺相休囚死 — your element's vitality in your birth season">
          {seasonalStatePlain(dm.seasonalState).label} ({seasonalStatePlain(dm.seasonalState).zh})
        </span>
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

      <p style={{ margin: "12px 0 0", fontSize: 13.5, color: "var(--muted)", lineHeight: 1.55 }}>{rootingPlain(dm.rooting)}</p>

      {chart.elements.interactions.length > 0 && (
        <ul className="why-list" style={{ margin: "10px 0 0", paddingLeft: 18 }}>
          {chart.elements.interactions.map((it, i) => (
            <li key={i} style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.5, marginBottom: 3 }}>
              {interactionPlain(it)}
            </li>
          ))}
        </ul>
      )}

      {dm.climatic && (
        <p style={{ margin: "12px 0 0", fontSize: 13, color: "var(--muted)", lineHeight: 1.55 }}>
          {dm.climatic.reason}
          {dm.climaticReconciliation === "conflict" && (
            <>
              {" "}
              <b style={{ color: "var(--warn-ink)", fontWeight: 600 }}>
                The balance school and the climate (調候) school differ here
              </b>{" "}
              — we show both rather than pick one for you.
            </>
          )}
          {dm.climaticReconciliation === "aligned" && (
            <>
              {" "}
              <b style={{ fontWeight: 600 }}>Here the climate (調候) school and the balance school agree</b> — the same element serves
              both readings, which strengthens it.
            </>
          )}
          {dm.climaticReconciliation === "neutral" && (
            <>
              {" "}
              The balance school is neutral on this element — a separate consideration, not a disagreement between schools.
            </>
          )}
        </p>
      )}

      {/* The functional element map — what each of the five elements does for THIS chart. */}
      <div className="section-title" style={{ marginTop: 16 }}>
        What each element does for you
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(215px, 1fr))", gap: 8 }}>
        {functionalElementsPlain(dm).map((f) => (
          <div key={f.group} style={{ border: "1px solid var(--hairline)", borderRadius: 10, padding: "9px 11px", background: "var(--surface-1)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 600 }}>
              <span className="dot" style={{ width: 8, height: 8, borderRadius: 8, background: PHASE_COLOR[f.element], flex: "0 0 auto" }} />
              <span>{f.label}</span>
              {f.valence !== "neutral" && (
                <span style={{ marginLeft: "auto", fontSize: 11, fontWeight: 500, color: f.valence === "helps" ? "var(--gold-text)" : "var(--warn-ink)" }}>
                  {f.valence === "helps" ? "helps you" : "strains you"}
                </span>
              )}
            </div>
            <p style={{ margin: "4px 0 0", fontSize: 12.5, color: "var(--muted)", lineHeight: 1.5 }}>{f.sentence}</p>
          </div>
        ))}
      </div>

      {/* The chart's own auxiliary stars — Nobleman, Peach Blossom, Travelling Horse. */}
      <LuckyKeys chart={chart} />

      {boundaryWarnings.map((w, i) => (
        <div className="warn" key={i}>
          <span aria-hidden="true">⚠</span> {w}
        </div>
      ))}

      {/* The four pillars in daylight — palaces, animals, hidden stems, Na Yin. */}
      <div className="section-title" style={{ marginTop: 16 }}>
        Your four pillars
      </div>
      <ChartPanel chart={chart} dayun={dayun} currentAge={currentAge} />

      <details className="dossier" style={{ marginTop: 14 }}>
        <summary>Practitioner note — how the strength verdict was reached</summary>
        <div className="dossier-body">
          <p className="note-soft" style={{ marginTop: 12 }}>
            {dm.rationale.replace(/MEDIUM confidence \(school-dependent\)\./, "(interpretation varies by school).")}
          </p>
        </div>
      </details>
    </div>
  );
}
