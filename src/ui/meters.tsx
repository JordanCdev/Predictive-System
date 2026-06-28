import { useEffect, useRef, useState } from "react";
import { ConfidenceBreakdown, confidencePlain, verdictBand } from "../engine/index.ts";
import { scoreColor, scoreTextColor } from "./format.ts";

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

/** Animate the last rendered value → target (UI only — never touches engine values).
 *  Animating from the previous value, not 0, means selecting another day glides
 *  instead of snapping back to zero. */
function useCountUp(target: number, ms = 550): number {
  const prev = useRef(prefersReducedMotion() ? target : 0);
  const [v, setV] = useState(prev.current);
  useEffect(() => {
    if (prefersReducedMotion()) {
      setV(target);
      prev.current = target;
      return;
    }
    const from = prev.current;
    let raf = 0;
    const start = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / ms);
      const eased = 1 - Math.pow(1 - p, 3);
      setV(from + (target - from) * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
      else prev.current = target;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return v;
}

/** "How good" — a ring showing the score with its band colour. */
export function ScoreMeter({ score, size = 66 }: { score: number; size?: number }) {
  const live = useCountUp(score);
  const r = size / 2 - 5;
  const c = 2 * Math.PI * r;
  const color = scoreColor(score);
  const offset = c * (1 - Math.max(0, Math.min(100, live)) / 100);
  const band = verdictBand(score);
  return (
    <svg
      className="ring"
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={`Score ${Math.round(score)} out of 100 — ${band.label}`}
    >
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--hairline)" strokeWidth={5} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={5}
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={offset}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text className="ring-num" x="50%" y="50%" dominantBaseline="central" textAnchor="middle" aria-hidden="true">
        {Math.round(live)}
      </text>
    </svg>
  );
}

/** The "how good" cluster: ring + band word. */
export function GoodMeter({ score }: { score: number }) {
  const band = verdictBand(score);
  return (
    <div className="meter-good">
      <ScoreMeter score={score} />
      <div className="band" style={{ color: scoreTextColor(score) }}>
        {band.label}
        <span className="cap">how good</span>
      </div>
    </div>
  );
}

/** The "how sure" chip — visually subordinate, ALWAYS carries the epistemic framing. */
export function ConfidenceChip({
  confidence,
  personalized,
  open,
  onToggle,
}: {
  confidence: ConfidenceBreakdown;
  personalized: boolean;
  open: boolean;
  onToggle: () => void;
}) {
  const plain = confidencePlain(confidence, personalized);
  return (
    <div className="conf">
      <div className="lab">{plain.label}</div>
      <div className="cap">how solid the reasoning is — not your odds</div>
      <button className="why" onClick={onToggle} aria-expanded={open}>
        {open ? "Hide" : "Why?"}
      </button>
    </div>
  );
}

/** The expandable confidence breakdown — used in the hero and the dossier. */
export function ConfidencePanel({
  confidence,
  personalized,
}: {
  confidence: ConfidenceBreakdown;
  personalized: boolean;
}) {
  const plain = confidencePlain(confidence, personalized);
  return (
    <div className="conf-pop">
      <p style={{ margin: "0 0 12px", fontSize: 13.5, lineHeight: 1.5 }}>{plain.sentence}</p>
      {plain.components.map((comp) => (
        <div className="conf-bar" key={comp.key} title={comp.blurb}>
          <span className="cb-name">{comp.label}</span>
          <span className="cb-track">
            <span className="cb-fill" style={{ width: `${Math.round(comp.value * 100)}%` }} />
          </span>
          <span className="cb-val">{Math.round(comp.value * 100)}%</span>
        </div>
      ))}
      <div className="disclaimer">{plain.disclaimer}</div>
    </div>
  );
}
