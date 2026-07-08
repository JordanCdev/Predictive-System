import { useEffect, useRef, useState } from "react";
import { PeriodSummary } from "../engine/index.ts";
import { PeriodSummaryBlock } from "./PeriodSummaryBlock.tsx";
import { valenceColor, valenceLabel } from "./format.ts";

export interface LuckEntry {
  summary: PeriodSummary;
  startAge: number;
  endAge: number;
  active: boolean;
}

/** A life-spanning 大運 scrubber: one cell per 10-year luck decade, coloured by
 *  its valence, the current decade highlighted, tap to expand its reading. The
 *  natal chart is pinned as the fixed anchor at the left (ROADMAP §A1). */
export function LuckTimeline({ entries, natalGanzhi }: { entries: LuckEntry[]; natalGanzhi: string[] }) {
  const activeIdx = entries.findIndex((e) => e.active);
  const [open, setOpen] = useState<number | null>(activeIdx >= 0 ? activeIdx : null);
  const activeRef = useRef<HTMLButtonElement>(null);

  // Re-centre when the active decade changes (year stepping crosses a decade).
  useEffect(() => {
    setOpen(activeIdx >= 0 ? activeIdx : null);
    activeRef.current?.scrollIntoView({ inline: "center", block: "nearest" });
  }, [activeIdx]);

  if (entries.length === 0) return null;

  return (
    <div>
      <div className="section-title" style={{ marginTop: 16, marginBottom: 6 }}>Your life in 10-year chapters (大運)</div>
      <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 6, alignItems: "stretch" }}>
        {/* Natal anchor — the birth chart the whole timeline reads against. */}
        <div
          title="Your natal chart — the fixed reference every decade is read against"
          style={{
            flex: "0 0 auto",
            minWidth: 66,
            border: "1px dashed var(--hairline-strong)",
            borderRadius: 10,
            padding: "6px 8px",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            gap: 2,
          }}
        >
          <span style={{ fontSize: 10.5, color: "var(--muted)", letterSpacing: 0.3 }}>NATAL</span>
          <span style={{ fontSize: 13, fontFamily: "var(--serif-cjk)", color: "var(--ink)", lineHeight: 1.2 }}>
            {natalGanzhi.join(" ")}
          </span>
        </div>

        {entries.map((e, i) => {
          const s = e.summary;
          const isOpen = open === i;
          return (
            <button
              key={i}
              ref={e.active ? activeRef : undefined}
              onClick={() => setOpen((o) => (o === i ? null : i))}
              className="luck-cell"
              aria-pressed={isOpen}
              style={{
                flex: "0 0 auto",
                minWidth: 68,
                textAlign: "left",
                cursor: "pointer",
                border: `1px solid ${isOpen || e.active ? valenceColor(s.valence) : "var(--hairline)"}`,
                boxShadow: e.active ? `inset 0 0 0 1px ${valenceColor(s.valence)}` : undefined,
                background: e.active ? "var(--surface-1)" : "var(--surface-2)",
                borderRadius: 10,
                padding: "6px 8px",
                display: "flex",
                flexDirection: "column",
                gap: 3,
              }}
              title={`${valenceLabel(s.valence)} — ${s.theme.domain}`}
            >
              <span style={{ fontSize: 10.5, color: e.active ? valenceColor(s.valence) : "var(--muted)", fontWeight: e.active ? 700 : 500 }}>
                {e.active ? "now · " : ""}{Math.round(e.startAge)}–{Math.round(e.endAge)}
              </span>
              <span style={{ fontSize: 14, fontFamily: "var(--serif-cjk)", color: "var(--ink)", lineHeight: 1.15 }}>{s.ganzhi}</span>
              <span className="dot" style={{ width: 8, height: 8, borderRadius: 8, background: valenceColor(s.valence) }} />
            </button>
          );
        })}
      </div>

      {open !== null && entries[open] && <PeriodSummaryBlock s={entries[open].summary} />}
    </div>
  );
}
