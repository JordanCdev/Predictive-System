import { PeriodSummary } from "../engine/index.ts";
import { valenceColor, valenceLabel } from "./format.ts";

/** One expanded period reading (大運 / 流年 / 流月) — theme, life areas, and the
 *  tailwind / headwind / caution bullets. Shared by the year, month and luck
 *  scrubber so every altitude reads identically. */
export function PeriodSummaryBlock({ s }: { s: PeriodSummary }) {
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
        <span className="dot" style={{ width: 9, height: 9, borderRadius: 9, background: valenceColor(s.valence), display: "inline-block" }} />
        <b style={{ fontSize: 14 }}>{s.label}</b>
        <span style={{ fontSize: 12, color: valenceColor(s.valence) }}>{valenceLabel(s.valence)}</span>
        {s.taiSui && s.taiSui.fanTaiSui && (
          <span
            title={s.taiSui.label}
            style={{ fontSize: 11, fontWeight: 600, color: "#c0442e", border: "1px solid #c0442e55", borderRadius: 999, padding: "1px 8px" }}
          >
            犯太歲 · {s.taiSui.relation}
          </span>
        )}
      </div>
      {/* Theme + the natal life areas this period touches */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", margin: "0 0 6px" }}>
        <span style={{ fontSize: 11.5, background: "var(--hairline)", borderRadius: 999, padding: "1px 9px", color: "var(--ink)" }}>
          {s.theme.domain}
        </span>
        {s.lifeAreas.map((a) => (
          <span key={a} style={{ fontSize: 11.5, color: "var(--muted)", border: "1px solid var(--hairline)", borderRadius: 999, padding: "1px 8px" }}>
            {a}
          </span>
        ))}
      </div>
      <p style={{ margin: "0 0 6px", fontSize: 13.5, color: "var(--muted)", lineHeight: 1.5 }}>{s.headline}</p>
      {s.tailwinds.length > 0 && (
        <ul className="why-list" style={{ margin: "2px 0", paddingLeft: 18 }}>
          {s.tailwinds.map((t, i) => (
            <li key={`t${i}`} style={{ fontSize: 12.5, color: "var(--muted)", lineHeight: 1.45 }}>▲ {t}</li>
          ))}
        </ul>
      )}
      {s.headwinds.map((h, i) => (
        <div key={`h${i}`} style={{ fontSize: 12.5, color: "var(--muted)", lineHeight: 1.45, paddingLeft: 18 }}>▽ {h}</div>
      ))}
      {s.cautions.map((c, i) => (
        <div key={`c${i}`} style={{ fontSize: 12.5, color: valenceColor("challenging"), lineHeight: 1.45, paddingLeft: 18 }}>⚠ {c}</div>
      ))}
    </div>
  );
}
