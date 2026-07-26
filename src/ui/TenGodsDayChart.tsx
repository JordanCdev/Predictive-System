/**
 * Personal Ten-Gods energy chart for one day (free tier — display only).
 *
 * Horizontal signed bars from a centre axis: how strongly today's pillar
 * "wakes" each of the chart's Ten Gods (engine `tenGodDayActivation` — the day
 * stem at full weight plus the day branch's hidden stems at their stored
 * weights, signed by whether the god's element is favourable to this chart).
 * Positive bars use the shared supportive green, negative the shared
 * challenging red (src/ui/format.ts valence colours), neutral a muted tone.
 * All 10 gods always render, absent ones dimmed — nothing is hidden.
 *
 * Copy honesty: an interpretive read, and it NEVER moves the score — the
 * explainer line says so in as many words.
 */

import { useMemo } from "react";
import {
  BaziChart,
  GanZhi,
  TEN_GOD_LABEL,
  tenGodDayActivation,
  tenGodPlain,
} from "../engine/index.ts";
import { VALENCE_COLOR, VALENCE_TEXT_COLOR } from "./format.ts";

/** Split "Hurting Officer 傷官" into its English and hanzi halves. */
function splitLabel(label: string): { en: string; hz: string } {
  const i = label.lastIndexOf(" ");
  return { en: label.slice(0, i), hz: label.slice(i + 1) };
}

/** Bars are scaled against the arithmetic maximum |activation| = 2. Using the
 *  fixed bound (not the day's max) keeps bar lengths comparable day to day. */
const MAX_ACTIVATION = 2;

export function TenGodsDayChart({ chart, dayGz }: { chart: BaziChart; dayGz: GanZhi }) {
  const rows = useMemo(() => tenGodDayActivation(chart, dayGz), [chart, dayGz]);

  return (
    <div className="card" style={{ padding: 20, marginTop: 18 }}>
      <h3 style={{ margin: "0 0 4px", fontSize: 16, fontWeight: 600 }}>
        Your Ten Gods today <span style={{ fontFamily: "var(--serif-cjk)", fontWeight: 500 }}>十神</span>
      </h3>
      <p style={{ margin: "0 0 12px", fontSize: 13, color: "var(--muted)", lineHeight: 1.5 }}>
        Which of your chart's Ten Gods the day pillar{" "}
        <b style={{ fontFamily: "var(--serif-cjk)" }}>{dayGz.hanzi}</b> wakes, and whether each sits with or against
        your useful elements — an interpretive read for reflection; it does not move the day's score.
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        {rows.map((r) => {
          const { en, hz } = splitLabel(TEN_GOD_LABEL[r.tenGod]);
          const frac = Math.min(Math.abs(r.activation) / MAX_ACTIVATION, 1);
          const barColor =
            r.valence === "neutral" ? "var(--muted)" : r.activation >= 0 ? VALENCE_COLOR.supportive : VALENCE_COLOR.challenging;
          const textColor =
            !r.present ? "var(--faint)"
            : r.valence === "neutral" ? "var(--muted)"
            : r.activation >= 0 ? VALENCE_TEXT_COLOR.supportive
            : VALENCE_TEXT_COLOR.challenging;
          const title = r.present
            ? `${en} (${hz}, carried by ${r.stem.hanzi}) — ${tenGodPlain(r.tenGod)}. Activation ${r.activation > 0 ? "+" : ""}${r.activation.toFixed(2)} (${r.valence} element for your chart). Display only — never scored.`
            : `${en} (${hz}, carried by ${r.stem.hanzi}) — ${tenGodPlain(r.tenGod)}. Not touched by this day's pillar.`;
          return (
            <div
              key={r.tenGod}
              title={title}
              style={{ display: "flex", alignItems: "center", gap: 8, opacity: r.present ? 1 : 0.45 }}
            >
              {/* Label: carrier stem hanzi + English god name. */}
              <span
                style={{
                  flex: "0 0 148px",
                  display: "flex",
                  alignItems: "baseline",
                  gap: 6,
                  fontSize: 12,
                  color: "var(--ink)",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                }}
              >
                <span style={{ fontFamily: "var(--serif-cjk)", fontSize: 13.5 }}>{r.stem.hanzi}</span>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{en}</span>
              </span>

              {/* Signed bar from a centre axis. */}
              <span style={{ flex: 1, position: "relative", height: 10, minWidth: 80 }}>
                {/* centre axis */}
                <span
                  aria-hidden="true"
                  style={{ position: "absolute", left: "50%", top: -2, bottom: -2, width: 1, background: "var(--hairline)" }}
                />
                {r.present && frac > 0 && (
                  <span
                    style={{
                      position: "absolute",
                      top: 1,
                      height: 8,
                      borderRadius: 4,
                      background: barColor,
                      width: `${Math.max(frac * 50, 1.5)}%`,
                      ...(r.activation >= 0 ? { left: "50%" } : { right: "50%" }),
                    }}
                  />
                )}
              </span>

              {/* Signed value. */}
              <b style={{ flex: "0 0 42px", textAlign: "right", fontSize: 11.5, color: textColor, fontVariantNumeric: "tabular-nums" }}>
                {r.present ? `${r.activation > 0 ? "+" : ""}${r.activation.toFixed(2)}` : "—"}
              </b>
            </div>
          );
        })}
      </div>

      <p style={{ margin: "10px 0 0", fontSize: 11.5, color: "var(--faint)", lineHeight: 1.45 }}>
        Bar length = how much of the god's stem today's pillar carries (day stem full weight, hidden stems by their
        classical weights); direction = whether that god's element is favourable (right, green) or unfavourable
        (left, red) for your chart. Elements your chart neither favours nor avoids show a short muted bar on the
        right — neutral, not favourable. Dimmed rows aren't touched today. Interpretive, school-dependent, and
        display-only.
      </p>
    </div>
  );
}
