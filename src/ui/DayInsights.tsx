import { useMemo, useState } from "react";
import {
  ActivityTag,
  BaziChart,
  DayRecommendation,
  HourPick,
  LifeAreaScore,
  humanHourRange,
  lifeAreaScores,
} from "../engine/index.ts";
import { scoreColor, scoreTextColor, valenceColor, valenceOfScore } from "./format.ts";

// ── Life-area gauges (career / wealth / relationship / health) ───────────────

const AREA_ICON: Record<string, string> = { career: "💼", wealth: "💰", relationship: "❤", health: "☯" };

export function LifeAreaGauges({ chart, dayGz, compact }: { chart: BaziChart; dayGz: DayRecommendation["tongshu"]["dayGanzhi"]; compact?: boolean }) {
  const reading = useMemo(() => lifeAreaScores(chart, dayGz), [chart, dayGz]);
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 8 }}>
        {reading.areas.map((a: LifeAreaScore) => {
          const col = valenceColor(valenceOfScore(a.score));
          const isOpen = open === a.key;
          return (
            <button
              key={a.key}
              onClick={() => setOpen((o) => (o === a.key ? null : a.key))}
              aria-pressed={isOpen}
              style={{
                textAlign: "left",
                cursor: "pointer",
                border: `1px solid ${isOpen ? col : "var(--hairline)"}`,
                background: "var(--surface-2)",
                borderRadius: 10,
                padding: compact ? "7px 9px" : "9px 11px",
                display: "flex",
                flexDirection: "column",
                gap: 5,
              }}
              title={a.reason}
            >
              <span style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 12.5, color: "var(--ink)" }}>
                <span><span aria-hidden="true" style={{ marginRight: 5 }}>{AREA_ICON[a.key]}</span>{a.label} <span style={{ color: "var(--faint)", fontSize: 11 }}>{a.hanzi}</span></span>
                <b style={{ color: scoreTextColor(a.score), fontSize: 13 }}>{a.score}</b>
              </span>
              <span style={{ height: 5, borderRadius: 5, background: "var(--hairline)", overflow: "hidden", display: "block" }}>
                <span style={{ display: "block", height: "100%", width: `${a.score}%`, background: col, borderRadius: 5 }} />
              </span>
              {isOpen && <span style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.45 }}>{a.reason}</span>}
            </button>
          );
        })}
      </div>
      <div className="disclaimer" style={{ marginTop: 8 }}>{reading.disclaimer}</div>
    </div>
  );
}

// ── Auspicious-hour grid (12 double-hours) ───────────────────────────────────

export function HourGrid({ hours, bestBranch }: { hours: HourPick[]; bestBranch: number | null }) {
  const [open, setOpen] = useState<number | null>(null);
  if (hours.length === 0) return null;
  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(80px, 1fr))", gap: 6 }}>
        {hours.map((h) => {
          const best = h.branchIndex === bestBranch;
          const isOpen = open === h.branchIndex;
          const col = scoreColor(h.score);
          return (
            <button
              key={h.branchIndex}
              onClick={() => setOpen((o) => (o === h.branchIndex ? null : h.branchIndex))}
              aria-pressed={isOpen}
              style={{
                cursor: "pointer",
                textAlign: "center",
                border: `1px solid ${best ? "var(--gold)" : isOpen ? col : "var(--hairline)"}`,
                boxShadow: best ? "inset 0 0 0 1px var(--gold)" : undefined,
                background: "var(--surface-2)",
                borderRadius: 9,
                padding: "6px 4px",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 2,
              }}
              title={`${humanHourRange(h.rangeLabel)} · ${h.score}/100${best ? " · best window" : ""}`}
            >
              <span style={{ fontSize: 13, fontFamily: "var(--serif-cjk)", color: "var(--ink)" }}>{h.ganzhi.hanzi}</span>
              <span style={{ fontSize: 10.5, color: "var(--muted)" }}>{humanHourRange(h.rangeLabel)}</span>
              <span style={{ display: "flex", alignItems: "center", gap: 3 }}>
                <span className="dot" style={{ width: 7, height: 7, borderRadius: 7, background: col }} />
                <span style={{ fontSize: 10.5, color: scoreTextColor(h.score) }}>{h.score}</span>
              </span>
            </button>
          );
        })}
      </div>
      {open !== null && (() => {
        const h = hours.find((x) => x.branchIndex === open);
        if (!h) return null;
        return (
          <div style={{ marginTop: 8, fontSize: 12.5, color: "var(--muted)", lineHeight: 1.5, paddingLeft: 2 }}>
            <b style={{ color: "var(--ink)" }}>{humanHourRange(h.rangeLabel)}</b> ({branchHzLabel(h)}) — {h.score}/100
            {h.reasons.length > 0 ? (
              <ul className="why-list" style={{ margin: "3px 0 0", paddingLeft: 18 }}>
                {h.reasons.map((r, i) => (
                  <li key={i} style={{ fontSize: 12, lineHeight: 1.4 }}>{r}</li>
                ))}
              </ul>
            ) : (
              <span> — a neutral window.</span>
            )}
          </div>
        );
      })()}
    </div>
  );
}

function branchHzLabel(h: HourPick): string {
  return h.rangeLabel.split(" ")[0];
}

// ── 宜 / 忌 chips (the day-officer's suitable / unsuitable activities) ─────────

const TAG_PLAIN: Record<ActivityTag, { label: string; blurb: string }> = {
  open: { label: "Open / launch", blurb: "Opening a business, a grand opening, or going live." },
  marry: { label: "Weddings", blurb: "A marriage ceremony or registration (嫁娶)." },
  move: { label: "Moving home", blurb: "Relocating or moving into a new home (移徙 / 入宅)." },
  travel: { label: "Travel", blurb: "Setting off on a journey or long trip (出行)." },
  contract: { label: "Contracts & deals", blurb: "Signing agreements, closing deals, committing capital (立券 / 交易)." },
  ground: { label: "Breaking ground", blurb: "Starting construction or renovation (動土)." },
  medical: { label: "Medical / healing", blurb: "Treatment, surgery, or seeing a doctor (求醫療病)." },
  study: { label: "Study & exams", blurb: "Enrolling, sitting exams, submitting work (入學)." },
  litigation: { label: "Legal disputes", blurb: "Lawsuits and formal disputes (詞訟)." },
  burial: { label: "Burial rites", blurb: "Funeral and burial matters (安葬)." },
  capture: { label: "Pursuit", blurb: "Hunting, capture, catching what has escaped." },
  general: { label: "General affairs", blurb: "Everyday undertakings with no special category." },
};

export function YiJiChips({ rec }: { rec: DayRecommendation }) {
  const [open, setOpen] = useState<string | null>(null);
  const off = rec.tongshu.officer;
  const yi = off.good.filter((t) => t !== "general" || off.good.length === 1);
  const ji = off.bad;
  const chip = (tag: ActivityTag, kind: "yi" | "ji") => {
    const key = `${kind}:${tag}`;
    const isOpen = open === key;
    const col = kind === "yi" ? "#1d9e75" : "#c0442e";
    return (
      <button
        key={key}
        onClick={() => setOpen((o) => (o === key ? null : key))}
        aria-pressed={isOpen}
        style={{
          cursor: "pointer",
          fontSize: 12,
          border: `1px solid ${isOpen ? col : "var(--hairline)"}`,
          background: isOpen ? (kind === "yi" ? "rgba(29,158,117,0.08)" : "rgba(192,68,46,0.08)") : "var(--surface-2)",
          color: "var(--ink)",
          borderRadius: 999,
          padding: "2px 10px",
        }}
        title={TAG_PLAIN[tag].blurb}
      >
        <span style={{ color: col, fontWeight: 700, marginRight: 4 }}>{kind === "yi" ? "宜" : "忌"}</span>
        {TAG_PLAIN[tag].label}
      </button>
    );
  };
  const openTag = open ? (open.split(":")[1] as ActivityTag) : null;
  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {yi.map((t) => chip(t, "yi"))}
        {ji.map((t) => chip(t, "ji"))}
        {yi.length === 0 && ji.length === 0 && (
          <span style={{ fontSize: 12.5, color: "var(--muted)" }}>A balanced day with no strong 宜/忌 for particular activities.</span>
        )}
      </div>
      {openTag && (
        <div style={{ marginTop: 7, fontSize: 12.5, color: "var(--muted)", lineHeight: 1.5 }}>{TAG_PLAIN[openTag].blurb}</div>
      )}
      <div style={{ marginTop: 7, fontSize: 11.5, color: "var(--faint)", lineHeight: 1.45 }}>
        From the day's officer ({rec.tongshu.officer.nameZh} {rec.tongshu.officer.nameEn}, 建除十二神).
        {rec.almanacVerdict !== "unavailable" && (
          <>
            {" "}Mainstream almanac (通勝) for this activity:{" "}
            <b style={{ color: rec.almanacVerdict === "favourable" ? "#15795a" : rec.almanacVerdict === "unfavourable" ? "#b3403a" : "var(--muted)" }}>
              {rec.almanacVerdict === "favourable" ? "宜 favourable" : rec.almanacVerdict === "unfavourable" ? "忌 avoid" : "neutral"}
            </b>.
          </>
        )}
      </div>
    </div>
  );
}

// ── Composite: everything about one selected day ─────────────────────────────

export function DayInsights({ chart, rec }: { chart: BaziChart; rec: DayRecommendation }) {
  return (
    <div className="card" style={{ padding: 20, marginTop: 18 }}>
      <h3 style={{ margin: "0 0 4px", fontSize: 16, fontWeight: 600 }}>This day, area by area</h3>
      <p style={{ margin: "0 0 12px", fontSize: 13, color: "var(--muted)" }}>
        How <b style={{ fontFamily: "var(--serif-cjk)" }}>{rec.tongshu.dayGanzhi.hanzi}</b> tilts each part of life for your chart, its best hours, and what tradition marks it 宜/忌 for.
      </p>
      <LifeAreaGauges chart={chart} dayGz={rec.tongshu.dayGanzhi} />

      <div className="section-title" style={{ marginTop: 16, marginBottom: 6 }}>Best hours (時辰)</div>
      <HourGrid hours={rec.allHours} bestBranch={rec.bestHour?.branchIndex ?? null} />

      <div className="section-title" style={{ marginTop: 16, marginBottom: 6 }}>Suitable &amp; unsuitable (宜 / 忌)</div>
      <YiJiChips rec={rec} />
    </div>
  );
}
