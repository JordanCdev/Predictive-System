/**
 * 日家奇門九星 — the day's nine-star direction wheel (display only).
 *
 * An actual compass wheel: eight direction sectors around a centre, N at top,
 * each tinted by the star's 吉/中平/凶 class in the app's shared valence
 * colours. The ninth star sits in 中宮 and has NO direction — it is drawn in
 * the middle, where it belongs. A wheel that shows only eight stars is showing
 * eight of nine and quietly losing the one the day parks in the centre.
 *
 * Tap or focus a sector to read that star's classical verse and its travel
 * line, verbatim, with our translation clearly marked as ours.
 *
 * ON SMALL SCREENS the wheel is replaced by a plain list of the same nine
 * palaces, in the same compass order, as real text at real type sizes. A
 * 400-unit SVG squeezed into a 340px phone renders the English star names at
 * ~7px, which is not "small", it is unreadable. Where the wheel does render it
 * sits inside a horizontal scroller with a hard minimum width, so it never
 * shrinks below legibility either. Both paths drive the same detail panel.
 *
 * HONESTY THIS CARD IS RESPONSIBLE FOR — none of it is optional:
 *  - it is a directional READING from 日家奇門, an interpretation, not a
 *    prediction, and it moves nothing this app scores or ranks;
 *  - the 吉凶 of 招摇 and 天符 differs between two lineages; A ships, B is one
 *    tap away, and the two contested stars are marked on the wheel itself;
 *  - lineage B is NOT A's peer and the card says so on screen, next to the
 *    toggle, not inside a collapsed details: A is traced to named texts, B is
 *    practitioner circulation we could not trace or attribute to a school;
 *  - the day count has two readings of its anchor (甲子 day vs solstice day);
 *    the sourced one ships and the other is named, with what it would change;
 *  - the classical verses read 「門中見X」 — star AND door in the same palace.
 *    This is the star ring alone: half the doctrine.
 *
 * Drawn with inline SVG. No chart dependency, no icon font.
 */

import { useEffect, useMemo, useState } from "react";
import {
  CONTESTED_STARS,
  LINEAGE_B_UNSOURCED_NOTE,
  LINEAGE_CHIP_LABEL,
  LINEAGE_LABEL,
  LINEAGE_NOTE,
  NINE_STAR_NOT_A_PREDICTION_NOTE,
  NINE_STAR_SOURCE_NOTE,
  NINE_STAR_TRUNCATION_NOTE,
  RELABELLED_STARS,
  VERDICT_EN,
  nineStarsForCivilDate,
  valenceOf,
  verdictFor,
  type DunSwitchConvention,
  type LineageId,
  type NineStarDay,
  type NineStarPalace,
  type PalaceNumber,
  type Valence,
  type VerdictZh,
} from "../engine/nineStars.ts";
import { VALENCE_COLOR, VALENCE_TEXT_COLOR } from "./format.ts";

// ── geometry ────────────────────────────────────────────────────────────────

const CX = 200;
const CY = 210;
const R_OUT = 162;
const R_IN = 86;
const R_CENTRE = 74;
const R_DIR = 181; // compass letters sit OUTSIDE the ring, as on a real compass rose
const R_LABEL = (R_OUT + R_IN) / 2; // sector text is centred here, then stacked in SCREEN space
const HALF_SECTOR = 21.6; // degrees each side of the bearing — leaves a hairline gap

/**
 * The floor the wheel may not shrink below. At 400 viewBox units wide this is
 * a 0.9 scale, which keeps the 漢字 above 15px. Narrower than this and the SVG
 * scrolls sideways instead of shrinking.
 */
export const WHEEL_MIN_WIDTH_PX = 360;

/** Below this the wheel is dropped entirely for a readable list. */
export const NARROW_MEDIA_QUERY = "(max-width: 560px)";

/** Compass bearing (N = 0, clockwise) → SVG point at radius r. */
function pt(r: number, bearingDeg: number): [number, number] {
  const a = ((bearingDeg - 90) * Math.PI) / 180;
  return [CX + r * Math.cos(a), CY + r * Math.sin(a)];
}

function fmt(n: number): string {
  return n.toFixed(2);
}

/** Annulus sector from bearing a0 to a1, clockwise. */
function sectorPath(a0: number, a1: number): string {
  const [x0, y0] = pt(R_OUT, a0);
  const [x1, y1] = pt(R_OUT, a1);
  const [x2, y2] = pt(R_IN, a1);
  const [x3, y3] = pt(R_IN, a0);
  return [
    `M ${fmt(x0)} ${fmt(y0)}`,
    `A ${R_OUT} ${R_OUT} 0 0 1 ${fmt(x1)} ${fmt(y1)}`,
    `L ${fmt(x2)} ${fmt(y2)}`,
    `A ${R_IN} ${R_IN} 0 0 0 ${fmt(x3)} ${fmt(y3)}`,
    "Z",
  ].join(" ");
}

const SECTOR_FILL: Record<string, string> = {
  supportive: "rgba(29, 158, 117, 0.13)",
  mixed: "rgba(201, 154, 46, 0.15)",
  challenging: "rgba(192, 68, 46, 0.12)",
};
const SECTOR_FILL_ACTIVE: Record<string, string> = {
  supportive: "rgba(29, 158, 117, 0.26)",
  mixed: "rgba(201, 154, 46, 0.3)",
  challenging: "rgba(192, 68, 46, 0.24)",
};

// ── the day as rows (one source of truth for the list, and for the SVG's
//    accessible description) ──────────────────────────────────────────────────

export interface WheelRow {
  palace: PalaceNumber;
  /** "N" … "NW", or 中 for the centre. */
  compass: string;
  /** "North" … "Northwest", or "中宮 · no direction". */
  label: string;
  isCentre: boolean;
  trigramZh: string;
  starZh: string;
  starEn: string;
  verdict: VerdictZh;
  verdictEn: string;
  valence: Valence;
  /** The two lineages disagree on this star's 吉凶. */
  contested: boolean;
}

/**
 * The nine palaces as display rows: the eight directional ones in compass
 * order starting north, then 中宮 last. Pure — the wheel, the list and the
 * SVG's aria description all read from this, so they cannot drift apart.
 */
export function wheelRows(day: NineStarDay, lineage: LineageId): WheelRow[] {
  const row = (p: NineStarPalace): WheelRow => {
    const verdict = verdictFor(p.star, lineage);
    return {
      palace: p.palace,
      compass: p.direction ?? "中",
      label: p.directionEn ?? "中宮 · no direction",
      isCentre: p.isCentre,
      trigramZh: p.trigramZh,
      starZh: p.star.nameZh,
      starEn: p.star.nameEn,
      verdict,
      verdictEn: VERDICT_EN[verdict],
      valence: valenceOf(verdict),
      contested: CONTESTED_STARS.includes(p.star.nameZh),
    };
  };
  return [...day.ring.map(row), row(day.centre)];
}

/** The whole wheel, spoken. Used as the SVG's `aria-label`. */
export function wheelDescription(day: NineStarDay, rows: WheelRow[]): string {
  const ring = rows
    .filter((r) => !r.isCentre)
    .map((r) => `${r.label}: ${r.starZh} ${r.starEn}, ${r.verdict}`)
    .join("; ");
  const centre = rows.find((r) => r.isCentre)!;
  return `Nine-star direction wheel for the ${day.dayGanZhiZh} day. ${ring}. Centre palace, no direction: ${centre.starZh} ${centre.starEn}.`;
}

/** true when the viewport is too narrow for an eight-sector SVG to be read. */
function useNarrowViewport(): boolean {
  // Read once at mount as well as on change, so a phone never paints the
  // unreadable wheel for a frame before swapping to the list.
  const [narrow, setNarrow] = useState(
    () => typeof window !== "undefined" && !!window.matchMedia?.(NARROW_MEDIA_QUERY).matches,
  );
  useEffect(() => {
    const mq = typeof window !== "undefined" ? window.matchMedia?.(NARROW_MEDIA_QUERY) : null;
    if (!mq) return;
    const onChange = () => setNarrow(mq.matches);
    onChange();
    if (typeof mq.addEventListener === "function") {
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    }
    mq.addListener(onChange); // Safari < 14
    return () => mq.removeListener(onChange);
  }, []);
  return narrow;
}

// ── the card ────────────────────────────────────────────────────────────────

export function NineStarWheel({
  civil,
  dayGanzhiIndex,
  dunSwitch,
}: {
  civil: { year: number; month: number; day: number };
  /** Day pillar index from the app's own engine, if the caller already has it. */
  dayGanzhiIndex?: number;
  /** 正授 (default) vs 超神接氣 for the 陽遁/陰遁 switch. */
  dunSwitch?: DunSwitchConvention;
}) {
  const day = useMemo(
    () => nineStarsForCivilDate(civil, { dayGanzhiIndex, dunSwitch }),
    [civil.year, civil.month, civil.day, dayGanzhiIndex, dunSwitch], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const [lineage, setLineage] = useState<LineageId>("A");
  const [picked, setPicked] = useState<number | null>(null);
  const [hovered, setHovered] = useState<number | null>(null);
  // Focus is tracked separately from hover: sharing one slot meant any
  // mouseleave anywhere wiped the keyboard user's position on the wheel.
  const [focused, setFocused] = useState<number | null>(null);
  const narrow = useNarrowViewport();

  const rows = useMemo(() => wheelRows(day, lineage), [day, lineage]);

  const activePalace = hovered ?? focused ?? picked;
  const active = activePalace === null ? null : day.palaces.find((p) => p.palace === activePalace)!;

  const verdictOf = (p: NineStarPalace) => verdictFor(p.star, lineage);
  const valOf = (p: NineStarPalace) => valenceOf(verdictOf(p));

  const centreValence = valOf(day.centre);
  const toggle = (p: number) => setPicked(picked === p ? null : p);

  return (
    <div className="card" style={{ padding: 20, marginTop: 18 }}>
      <h3 className="section-title" style={{ margin: "0 0 6px" }}>
        Directions today ·{" "}
        <span style={{ fontFamily: "var(--serif-cjk)" }}>日家奇門九星</span>
      </h3>
      <p style={{ margin: "0 0 14px", fontSize: 13, color: "var(--muted)", lineHeight: 1.55 }}>
        Nine stars step one palace a day; eight land on compass points and one lands in{" "}
        <span style={{ fontFamily: "var(--serif-cjk)" }}>中宮</span>, which has no direction. Which
        way each favours travelling or moving today —{" "}
        <b>a directional reading from a classical text, not a prediction</b>, and it does not move
        the day&apos;s score.{" "}
        {narrow ? <b>Listed north first, then clockwise.</b> : <b>North is at the top.</b>}
      </p>

      {/* day / 遁 line */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 6,
          alignItems: "center",
          marginBottom: 12,
          fontSize: 12,
          color: "var(--muted)",
        }}
      >
        <span className="pill" style={{ fontFamily: "var(--serif-cjk)" }}>
          {day.dayGanZhiZh} <span className="faint">day</span>
        </span>
        <span className="pill" style={{ fontFamily: "var(--serif-cjk)" }}>
          {day.dunZh}{" "}
          <span className="faint" style={{ fontFamily: "var(--sans)" }}>
            {day.dun === "yang" ? "since 冬至" : "since 夏至"}
          </span>
        </span>
        <span className="pill">
          <span style={{ fontFamily: "var(--serif-cjk)" }}>太乙</span> in{" "}
          <span style={{ fontFamily: "var(--serif-cjk)" }}>
            {day.palaces.find((p) => p.star.nameZh === "太乙")!.trigramZh}
          </span>{" "}
          {day.taiyiPalace}
        </span>
      </div>

      {narrow ? (
        /* phone: the same nine palaces as readable text, in the same order */
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 6 }}>
          {rows.map((r) => {
            const on = picked === r.palace;
            return (
              <li key={r.palace}>
                <button
                  type="button"
                  onClick={() => toggle(r.palace)}
                  aria-pressed={on}
                  aria-label={`${r.label}${r.isCentre ? "" : `, palace ${r.palace} ${r.trigramZh}`}: ${r.starZh} ${r.starEn} — ${r.verdict} ${r.verdictEn}`}
                  style={{
                    width: "100%",
                    minHeight: 46,
                    display: "flex",
                    alignItems: "baseline",
                    gap: 10,
                    textAlign: "left",
                    padding: "9px 12px",
                    borderRadius: "var(--radius-cell)",
                    border: `1px solid ${on ? VALENCE_COLOR[r.valence] : "var(--hairline)"}`,
                    background: on ? SECTOR_FILL_ACTIVE[r.valence] : SECTOR_FILL[r.valence],
                    color: "var(--ink)",
                    cursor: "pointer",
                  }}
                >
                  <span
                    style={{
                      flex: "0 0 32px",
                      fontSize: 12,
                      fontWeight: 700,
                      letterSpacing: "0.6px",
                      color: r.isCentre ? "var(--faint)" : "var(--gold-text)",
                      fontFamily: r.isCentre ? "var(--serif-cjk)" : undefined,
                    }}
                  >
                    {r.compass}
                  </span>
                  <span style={{ fontFamily: "var(--serif-cjk)", fontSize: 17 }}>{r.starZh}</span>
                  <span style={{ flex: 1, fontSize: 12.5, color: "var(--muted)" }}>
                    {r.starEn}
                    {r.isCentre && <span className="faint"> · no direction today</span>}
                  </span>
                  <span
                    style={{
                      fontFamily: "var(--serif-cjk)",
                      fontSize: 13,
                      fontWeight: 600,
                      color: VALENCE_TEXT_COLOR[r.valence],
                    }}
                  >
                    {r.verdict}
                    {r.contested ? "*" : ""}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        /* the wheel — never allowed to shrink below WHEEL_MIN_WIDTH_PX; it
           scrolls sideways in a narrow column instead of going unreadable */
        <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              minWidth: WHEEL_MIN_WIDTH_PX,
            }}
          >
            <svg
              viewBox="0 0 400 416"
              role="img"
              aria-label={wheelDescription(day, rows)}
              style={{
                width: "100%",
                minWidth: WHEEL_MIN_WIDTH_PX,
                maxWidth: 380,
                height: "auto",
                touchAction: "manipulation",
              }}
            >
              {/* north marker, outside the ring — the compass orientation, stated
                  graphically as well as in the prose above */}
              <polygon points={`${CX},6 ${CX - 6},18 ${CX + 6},18`} fill="var(--gold)" />

              {/* eight direction sectors */}
              {day.ring.map((p) => {
                const bearing = p.bearingDeg!;
                const v = valOf(p);
                const isActive = activePalace === p.palace;
                const isFocused = focused === p.palace;
                const contested = CONTESTED_STARS.includes(p.star.nameZh);
                const isNorth = p.direction === "N";
                // Text is centred on the sector's mid-radius point but stacked
                // VERTICALLY in screen space, so every sector reads name → English
                // → verdict top-to-bottom. Stacking along the radius instead would
                // read upside-down in the southern half and collide at E/W.
                const [lx, ly] = pt(R_LABEL, bearing);
                const [dx, dy] = pt(R_DIR, bearing);
                return (
                  <g
                    key={p.palace}
                    role="button"
                    tabIndex={0}
                    aria-label={`${p.directionEn}, palace ${p.palace} ${p.trigramZh}: ${p.star.nameZh} ${p.star.nameEn} — ${verdictOf(p)} ${VERDICT_EN[verdictOf(p)]}`}
                    aria-pressed={picked === p.palace}
                    style={{ cursor: "pointer" }}
                    onClick={() => toggle(p.palace)}
                    onMouseEnter={() => setHovered(p.palace)}
                    onMouseLeave={() => setHovered(null)}
                    onFocus={() => setFocused(p.palace)}
                    onBlur={() => setFocused(null)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        toggle(p.palace);
                      }
                    }}
                  >
                    <path
                      d={sectorPath(bearing - HALF_SECTOR, bearing + HALF_SECTOR)}
                      fill={isActive ? SECTOR_FILL_ACTIVE[v] : SECTOR_FILL[v]}
                      stroke={isActive ? VALENCE_COLOR[v] : "var(--hairline-strong)"}
                      strokeWidth={isActive ? 2 : 1}
                    />
                    {/* explicit focus indicator — the UA ring on an SVG <g> is
                        unreliable across browsers, so we draw one too rather
                        than suppressing the native outline and hoping */}
                    {isFocused && (
                      <path
                        d={sectorPath(bearing - HALF_SECTOR, bearing + HALF_SECTOR)}
                        fill="none"
                        stroke="var(--gold)"
                        strokeWidth={3}
                        strokeDasharray="6 4"
                        pointerEvents="none"
                      />
                    )}
                    <text
                      x={dx}
                      y={dy + 3.5}
                      textAnchor="middle"
                      fontSize={isNorth ? 12 : 10}
                      fontWeight={isNorth ? 700 : 400}
                      letterSpacing="0.8"
                      fill={isNorth ? "var(--gold-text)" : "var(--faint)"}
                    >
                      {p.direction}
                    </text>
                    <text
                      x={lx}
                      y={ly - 10}
                      textAnchor="middle"
                      fontSize={17}
                      fontFamily="var(--serif-cjk)"
                      fill="var(--ink)"
                    >
                      {p.star.nameZh}
                    </text>
                    <text x={lx} y={ly + 4} textAnchor="middle" fontSize={9} fill="var(--muted)">
                      {p.star.nameEn}
                    </text>
                    <text
                      x={lx}
                      y={ly + 19}
                      textAnchor="middle"
                      fontSize={11}
                      fontFamily="var(--serif-cjk)"
                      fill={VALENCE_TEXT_COLOR[v]}
                    >
                      {verdictOf(p)}
                      {contested ? "*" : ""}
                    </text>
                  </g>
                );
              })}

              {/* 中宮 — the ninth star, no direction */}
              <g
                role="button"
                tabIndex={0}
                aria-label={`Centre palace 中宮, no direction: ${day.centre.star.nameZh} ${day.centre.star.nameEn} — ${verdictOf(day.centre)} ${VERDICT_EN[verdictOf(day.centre)]}`}
                aria-pressed={picked === 5}
                style={{ cursor: "pointer" }}
                onClick={() => toggle(5)}
                onMouseEnter={() => setHovered(5)}
                onMouseLeave={() => setHovered(null)}
                onFocus={() => setFocused(5)}
                onBlur={() => setFocused(null)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    toggle(5);
                  }
                }}
              >
                <circle
                  cx={CX}
                  cy={CY}
                  r={R_CENTRE}
                  fill="var(--surface-1)"
                  stroke={
                    activePalace === 5 ? VALENCE_COLOR[centreValence] : "var(--hairline-strong)"
                  }
                  strokeWidth={activePalace === 5 ? 2 : 1}
                  strokeDasharray="5 4"
                />
                {focused === 5 && (
                  <circle
                    cx={CX}
                    cy={CY}
                    r={R_CENTRE + 4}
                    fill="none"
                    stroke="var(--gold)"
                    strokeWidth={3}
                    strokeDasharray="6 4"
                    pointerEvents="none"
                  />
                )}
                <text
                  x={CX}
                  y={CY - 34}
                  textAnchor="middle"
                  fontSize={11}
                  fontFamily="var(--serif-cjk)"
                  fill="var(--faint)"
                >
                  中宮
                </text>
                <text
                  x={CX}
                  y={CY - 6}
                  textAnchor="middle"
                  fontSize={22}
                  fontFamily="var(--serif-cjk)"
                  fill="var(--ink)"
                >
                  {day.centre.star.nameZh}
                </text>
                <text x={CX} y={CY + 12} textAnchor="middle" fontSize={9.5} fill="var(--muted)">
                  {day.centre.star.nameEn}
                </text>
                <text
                  x={CX}
                  y={CY + 30}
                  textAnchor="middle"
                  fontSize={11}
                  fontFamily="var(--serif-cjk)"
                  fill={VALENCE_TEXT_COLOR[centreValence]}
                >
                  {verdictOf(day.centre)}
                  {CONTESTED_STARS.includes(day.centre.star.nameZh) ? "*" : ""}
                </text>
                <text x={CX} y={CY + 47} textAnchor="middle" fontSize={9} fill="var(--faint)">
                  no direction today
                </text>
              </g>
            </svg>
          </div>
        </div>
      )}

      {/* the verse for whatever is hovered / focused / picked */}
      <div
        style={{
          marginTop: narrow ? 12 : 6,
          minHeight: 128,
          border: "1px solid var(--hairline)",
          borderRadius: "var(--radius-cell)",
          background: "var(--surface-1)",
          padding: 14,
        }}
        aria-live="polite"
      >
        {active ? <StarDetail p={active} lineage={lineage} /> : <DetailPlaceholder />}
      </div>

      {/* lineage switch — the fork is a control, not a footnote, and the two
          sides are not equals, which has to be legible without opening
          anything */}
      <div style={{ marginTop: 14 }}>
        <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 6 }}>
          Two lineages classify <span style={{ fontFamily: "var(--serif-cjk)" }}>招摇</span> and{" "}
          <span style={{ fontFamily: "var(--serif-cjk)" }}>天符</span> differently (marked <b>*</b>).
          They are not equals — A is traced to texts we name; B is not:
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {(["A", "B"] as LineageId[]).map((id) => (
            <button
              key={id}
              type="button"
              className={`chip${lineage === id ? " on" : ""}`}
              onClick={() => setLineage(id)}
              aria-pressed={lineage === id}
            >
              {LINEAGE_CHIP_LABEL[id]}
            </button>
          ))}
        </div>
        <p style={{ margin: "8px 0 0", fontSize: 12, color: "var(--faint)", lineHeight: 1.5 }}>
          <b style={{ color: "var(--muted)" }}>{LINEAGE_LABEL[lineage]}</b> — {LINEAGE_NOTE[lineage]}
        </p>
        {/* shown whichever lineage is selected: the reader should not have to
            switch to B to learn that B is unsourced */}
        <p
          style={{
            margin: "8px 0 0",
            fontSize: 12,
            color: "var(--muted)",
            lineHeight: 1.5,
            borderLeft: "2px solid var(--hairline-strong)",
            paddingLeft: 10,
          }}
        >
          {LINEAGE_B_UNSOURCED_NOTE}
        </p>
      </div>

      {/* everything we would rather a reader saw than didn't */}
      <details className="advanced" style={{ marginTop: 12 }}>
        <summary>Where this comes from, and what is disputed</summary>
        <div style={{ fontSize: 12.5, color: "var(--muted)", lineHeight: 1.6, paddingTop: 4 }}>
          <p style={{ margin: "0 0 8px" }}>{NINE_STAR_SOURCE_NOTE}</p>
          <p style={{ margin: "0 0 8px" }}>{NINE_STAR_TRUNCATION_NOTE}</p>
          <p style={{ margin: "0 0 8px" }}>
            <b>Disputed 吉凶.</b> {LINEAGE_LABEL.A} — {LINEAGE_NOTE.A} {LINEAGE_LABEL.B} —{" "}
            {LINEAGE_NOTE.B}{" "}
            {RELABELLED_STARS.length > 0 && (
              <>
                <span style={{ fontFamily: "var(--serif-cjk)" }}>
                  {RELABELLED_STARS.join("、")}
                </span>{" "}
                is worded differently by the two but lands in the same middle bucket either way.
              </>
            )}
          </p>
          <p style={{ margin: "0 0 8px" }}>
            <b>Disputed anchor.</b> The placement verse{" "}
            <span style={{ fontFamily: "var(--serif-cjk)" }}>
              「冬至艮宮夏坤地，命起甲子順逆行」
            </span>{" "}
            can be read as counting days from the{" "}
            <span style={{ fontFamily: "var(--serif-cjk)" }}>甲子</span> day or from the solstice
            day. The <span style={{ fontFamily: "var(--serif-cjk)" }}>甲子</span> reading is the one
            shown here: it is the reading we could source, and it matches how the{" "}
            <span style={{ fontFamily: "var(--serif-cjk)" }}>八門</span> layer of the same system is
            anchored.{" "}
            {day.alternateAnchor && (
              <>
                We found no text stating the solstice reading, so it is not used — but for today it
                would put <span style={{ fontFamily: "var(--serif-cjk)" }}>太乙</span> in palace{" "}
                {day.alternateAnchor.taiyiPalace} and{" "}
                <span style={{ fontFamily: "var(--serif-cjk)" }}>
                  {day.alternateAnchor.centreStarZh}
                </span>{" "}
                in the centre instead
                {day.alternateAnchor.differsFromShipped
                  ? ", so the whole wheel would rotate."
                  : " — the same wheel as shown."}
              </>
            )}
          </p>
          {day.dunDetermination && (
            <p style={{ margin: "0 0 8px" }}>
              <b>陽遁 / 陰遁.</b> {day.dunDetermination.dunZh} here, opened by{" "}
              <span style={{ fontFamily: "var(--serif-cjk)" }}>
                {day.dunDetermination.solsticeZh}
              </span>{" "}
              on {day.dunDetermination.solsticeCivil.year}-
              {String(day.dunDetermination.solsticeCivil.month).padStart(2, "0")}-
              {String(day.dunDetermination.solsticeCivil.day).padStart(2, "0")} (read in UTC+8, the
              tables&apos; reference zone). Lineages also differ on whether the switch happens at
              the solstice itself (<span style={{ fontFamily: "var(--serif-cjk)" }}>正授</span>) or
              at the nearest <span style={{ fontFamily: "var(--serif-cjk)" }}>甲子</span> (
              <span style={{ fontFamily: "var(--serif-cjk)" }}>超神接氣</span>).{" "}
              {day.dunDetermination.conventionsDisagree
                ? "Today is inside the window where those two disagree — the wheel would be the other 遁 under the second convention."
                : "They agree on today."}
            </p>
          )}
          <p style={{ margin: 0 }}>
            English star names and verse translations here are ours — literal renderings, offered as
            labels rather than as readings. {NINE_STAR_NOT_A_PREDICTION_NOTE}
          </p>
        </div>
      </details>
    </div>
  );
}

// ── the detail block ────────────────────────────────────────────────────────

function DetailPlaceholder() {
  return (
    <div style={{ fontSize: 13, color: "var(--faint)", lineHeight: 1.6 }}>
      Tap a direction — or the centre — for that star&apos;s verse from{" "}
      <span style={{ fontFamily: "var(--serif-cjk)" }}>《奇門遁甲元靈經》</span> and what it says
      about setting out.
    </div>
  );
}

function StarDetail({ p, lineage }: { p: NineStarPalace; lineage: LineageId }) {
  const s = p.star;
  const verdict = verdictFor(s, lineage);
  const v = valenceOf(verdict);
  const contested = CONTESTED_STARS.includes(s.nameZh);

  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: 8 }}>
        <span style={{ fontFamily: "var(--serif-cjk)", fontSize: 19, color: "var(--ink)" }}>
          {s.nameZh}
        </span>
        <span style={{ fontSize: 13, color: "var(--muted)" }}>
          {s.pinyin} · {s.nameEn}
        </span>
        <span style={{ fontSize: 12.5, color: VALENCE_TEXT_COLOR[v], fontWeight: 600 }}>
          <span style={{ fontFamily: "var(--serif-cjk)" }}>{verdict}</span> {VERDICT_EN[verdict]}
        </span>
        <span style={{ fontSize: 12, color: "var(--faint)" }}>
          {p.isCentre ? (
            <>
              <span style={{ fontFamily: "var(--serif-cjk)" }}>中宮</span> · no direction today
            </>
          ) : (
            <>
              {p.directionEn} · palace {p.palace}{" "}
              <span style={{ fontFamily: "var(--serif-cjk)" }}>{p.trigramZh}</span>
            </>
          )}
        </span>
      </div>

      <div style={{ marginTop: 4, fontSize: 11.5, color: "var(--faint)" }}>
        <span style={{ fontFamily: "var(--serif-cjk)" }}>北斗</span> {s.beidouZh} ({s.beidouEn}) ·{" "}
        <span style={{ fontFamily: "var(--serif-cjk)" }}>奇門</span> {s.qimenZh} ({s.qimenEn})
        {contested && (
          <>
            {" "}
            · <b>* the two lineages disagree on this star&apos;s 吉凶</b>
          </>
        )}
      </div>

      <p
        style={{
          margin: "10px 0 4px",
          fontFamily: "var(--serif-cjk)",
          fontSize: 14.5,
          color: "var(--ink)",
          lineHeight: 1.75,
        }}
      >
        {s.verseZh}
      </p>
      <p style={{ margin: "0 0 8px", fontSize: 12.5, color: "var(--muted)", lineHeight: 1.55 }}>
        {s.verseEn} <span className="faint">— our translation, not the source&apos;s.</span>
      </p>

      <div style={{ fontSize: 12.5, color: "var(--muted)", lineHeight: 1.55 }}>
        <b>On setting out:</b>{" "}
        {s.travelLineZh ? (
          <>
            <span style={{ fontFamily: "var(--serif-cjk)" }}>{s.travelLineZh}</span>
            {s.travelLineSource === "gloss" && (
              <span className="faint">
                {" "}
                — this line travels with the doctrine in the{" "}
                <span style={{ fontFamily: "var(--serif-cjk)" }}>日家奇門</span> summaries but is
                not in the verse quoted above.
              </span>
            )}
            {s.travelLineIsGeneral && (
              <span className="faint">
                {" "}
                — a general{" "}
                <span style={{ fontFamily: "var(--serif-cjk)" }}>百事</span> (all-affairs) clause
                rather than a travel verdict as such.
              </span>
            )}
          </>
        ) : (
          <span className="faint">
            the verse gives no line about travel for this star — we have not supplied one. Classed{" "}
            <span style={{ fontFamily: "var(--serif-cjk)" }}>{verdict}</span> on its general
            verdict.
          </span>
        )}
      </div>

      <div style={{ marginTop: 8, fontSize: 11.5, color: "var(--faint)", lineHeight: 1.5 }}>
        Read strictly, the verse says{" "}
        <span style={{ fontFamily: "var(--serif-cjk)" }}>「門中見{s.nameZh}」</span> — this star{" "}
        <i>together with</i> the <span style={{ fontFamily: "var(--serif-cjk)" }}>八門</span> door
        in the same palace. This wheel shows the star ring only.
      </div>
    </div>
  );
}
