import { useEffect, useMemo, useState } from "react";
import { dayHexagram, meihuaCast } from "../engine/index.ts";
import type { Hexagram } from "../engine/index.ts";
import type { MeihuaLunarDateDetail } from "../engine/verification/meihuaLunar.ts";

/**
 * The day's hexagram, and — clearly subordinate — a 梅花易數 cast for the day.
 *
 * TWO DIFFERENT THINGS, and the card exists to keep them apart:
 *
 *  1. 卦氣 / 六日七分 (leads). A CALENDAR FACT. The 60 hexagrams of the
 *     day-rotation each govern 6 days 2 h 6 min, the cycle restarting at 冬至
 *     with 公中孚; the arrangement is the 京房卦氣直日圖 as recorded in
 *     《新唐書‧曆志》. A hexagram belongs to a multi-day window, not to a day,
 *     so the window is shown — otherwise a reader takes it for a daily throw.
 *
 *  2. 梅花易數 年月日時起卦 (secondary, quieter). A CAST: a divination
 *     technique applied to a moment, which needs an hour. The classics contain
 *     no day-only form, so the hour here is our stated choice (子時, the hour
 *     the Chinese day opens) and the card says so. It is never labelled the
 *     day's hexagram.
 *
 * Display only. Nothing here reaches recommendationScore or calculationHash —
 * this is a fact about the calendar shown beside the reading, not an input to
 * it. The glyphs are DRAWN rather than set in the Unicode hexagram block, which
 * most systems have no font for.
 */

// ── the composed Chinese name (上卦象 + 下卦象 + 卦名) ───────────────────────
// 天澤履, 火水未濟, … and 乾為天 for the eight doubled trigrams. The image
// characters are the standard 八卦之象; the composition rule is the one printed
// on every 卦名 table, not a reading of our own.
const TRIGRAM_IMAGE_ZH: Record<string, string> = {
  乾: "天",
  兌: "澤",
  離: "火",
  震: "雷",
  巽: "風",
  坎: "水",
  艮: "山",
  坤: "地",
};

export function composedNameZh(h: Hexagram): string {
  const up = TRIGRAM_IMAGE_ZH[h.upper.nameZh];
  const lo = TRIGRAM_IMAGE_ZH[h.lower.nameZh];
  if (!up || !lo) return h.nameZh;
  return h.upper.nameZh === h.lower.nameZh ? `${h.upper.nameZh}為${up}` : `${up}${lo}${h.nameZh}`;
}

function describe(h: Hexagram): string {
  return `${composedNameZh(h)} — ${h.pinyin}, ${h.nameEn}; ${h.upper.nameEn} over ${h.lower.nameEn}`;
}

// ── the drawn glyph ─────────────────────────────────────────────────────────

/** Six stacked lines, bottom-to-top: yang = one solid bar, yin = two with a
 *  gap. The container is `column-reverse`, so the DOM is written in reading
 *  order (初爻 first) and painted top-down. Sized in em; `font-size` is the
 *  only dial. */
function HexagramGlyph({
  hexagram,
  label,
  small = false,
  quiet = false,
  movingLine = null,
}: {
  hexagram: Hexagram;
  label: string;
  small?: boolean;
  quiet?: boolean;
  movingLine?: number | null;
}) {
  return (
    <div
      className={`hexagram-glyph${small ? " is-small" : ""}${quiet ? " is-quiet" : ""}`}
      role="img"
      aria-label={label}
    >
      {hexagram.lines.map((yang, i) => (
        <div
          key={i}
          className={`hexagram-glyph-line${movingLine === i + 1 ? " is-moving" : ""}`}
        >
          {yang ? (
            <span className="hexagram-glyph-bar" />
          ) : (
            <>
              <span className="hexagram-glyph-bar" />
              <span className="hexagram-glyph-bar" />
            </>
          )}
        </div>
      ))}
    </div>
  );
}

// ── the governed window, as civil days ──────────────────────────────────────

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const REFERENCE_OFFSET_MS = 8 * 60 * 60_000; // UTC+8, the tables' reference zone

/** The civil days a window governs under the engine's noon rule: a date belongs
 *  to whichever hexagram covers its 12:00 in the reference zone. */
export function windowCivilDays(startIso: string, endIso: string): { first: Date; last: Date } | null {
  const s = new Date(new Date(startIso).getTime() + REFERENCE_OFFSET_MS);
  const e = new Date(new Date(endIso).getTime() + REFERENCE_OFFSET_MS);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return null;
  const first = new Date(Date.UTC(s.getUTCFullYear(), s.getUTCMonth(), s.getUTCDate()));
  if (s.getUTCHours() >= 12) first.setUTCDate(first.getUTCDate() + 1);
  const last = new Date(Date.UTC(e.getUTCFullYear(), e.getUTCMonth(), e.getUTCDate()));
  if (e.getUTCHours() < 12) last.setUTCDate(last.getUTCDate() - 1);
  return { first, last };
}

export function formatWindow(first: Date, last: Date): string {
  const d1 = first.getUTCDate();
  const d2 = last.getUTCDate();
  const m1 = MONTHS[first.getUTCMonth()];
  const m2 = MONTHS[last.getUTCMonth()];
  const y1 = first.getUTCFullYear();
  const y2 = last.getUTCFullYear();
  if (y1 !== y2) return `${d1} ${m1} ${y1} – ${d2} ${m2} ${y2}`;
  if (m1 !== m2) return `${d1} ${m1} – ${d2} ${m2}`;
  return `${d1}–${d2} ${m1}`;
}

/** The window's exact instants, for the tooltip — stated in the reference zone
 *  so the ~2 h 6 min drift per window is visible to anyone who looks. */
function formatInstant(iso: string): string {
  const t = new Date(new Date(iso).getTime() + REFERENCE_OFFSET_MS);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${t.getUTCFullYear()}-${p(t.getUTCMonth() + 1)}-${p(t.getUTCDate())} ${p(t.getUTCHours())}:${p(t.getUTCMinutes())} UTC+8`;
}

// ── the lazily-loaded lunisolar date the cast needs ─────────────────────────

/** The 梅花 cast needs the lunar year branch, month and day. Those come from
 *  lunar-javascript, which may only be imported under engine/verification/** —
 *  so it arrives in the same lazy chunk the 通勝 panel already pulls, and is
 *  null until it does (or forever, offline). The 卦氣 half above never waits
 *  on this. */

/** The date a held lunar value was computed FOR. Values are stamped with it so
 *  a value can never be shown against a different date. */
export function meihuaLunarKey(civil: { year: number; month: number; day: number }): string {
  return `${civil.year}-${civil.month}-${civil.day}`;
}

export interface KeyedMeihuaLunar {
  key: string;
  value: MeihuaLunarDateDetail | null;
}

/**
 * Render-time selection, and the whole point of the keying: a value computed
 * for ANOTHER date is not this date's data, so it reads as "not here yet"
 * rather than as today's.
 *
 * Clearing the state inside the effect instead would be wrong: on a date change
 * React commits a render holding the previous date's value BEFORE the effect
 * runs, so stepping ‹ / › would paint yesterday's cast (and yesterday's 烏兔
 * star, which shares this hook) as though they were today's, with nothing on
 * screen to betray it.
 */
export function selectMeihuaLunar(
  state: KeyedMeihuaLunar | null,
  key: string,
): MeihuaLunarDateDetail | null {
  return state && state.key === key ? state.value : null;
}

export function useMeihuaLunarDate(civil: { year: number; month: number; day: number }) {
  const [state, setState] = useState<KeyedMeihuaLunar | null>(null);
  const { year, month, day } = civil;
  const key = meihuaLunarKey({ year, month, day });
  useEffect(() => {
    let cancelled = false;
    import("../engine/verification/meihuaLunar.ts")
      .then((m) => {
        if (!cancelled) setState({ key, value: m.buildMeihuaLunarDate({ year, month, day }) });
      })
      .catch(() => {
        /* offline / chunk failed — the cast simply doesn't appear */
      });
    return () => {
      cancelled = true;
    };
  }, [key, year, month, day]);
  // Selected during render, so the stale value is never painted even for the
  // one commit between a date change and the effect that replaces it.
  return selectMeihuaLunar(state, key);
}

/** 子時 in the repo's 0-based branch indexing (子=0). The hour the Chinese day
 *  opens — a stated convention, not doctrine; see the note in the card. */
export const CAST_HOUR_BRANCH_INDEX = 0;

// ── the card ────────────────────────────────────────────────────────────────

export function HexagramCard({ civil }: { civil: { year: number; month: number; day: number } }) {
  const day = useMemo(() => dayHexagram(civil), [civil.year, civil.month, civil.day]); // eslint-disable-line react-hooks/exhaustive-deps
  const lunar = useMeihuaLunarDate(civil);
  const cast = useMemo(
    () => (lunar ? meihuaCast(lunar, CAST_HOUR_BRANCH_INDEX) : null),
    [lunar],
  );

  const h = day.hexagram;
  const span = windowCivilDays(day.windowStartIso, day.windowEndIso);

  return (
    <div className="card hexagram-card" style={{ padding: 18 }}>
      {/* The card's own title, in the shared heading form the other three
          day-fact cards use: "English name · 漢字", one h3.section-title. The
          梅花 label further down is deliberately quieter than this. */}
      <h3 className="section-title" style={{ margin: "0 0 10px" }}>
        Daily hexagram · 卦氣
      </h3>

      <div className="hexagram-lede">
        <HexagramGlyph hexagram={h} label={describe(h)} />
        <div className="hexagram-lede-body">
          <div className="hexagram-name-zh">{composedNameZh(h)}</div>
          <div className="hexagram-name-en">
            {h.pinyin} · {h.nameEn} <span className="faint">· King Wen {h.kingWen}</span>
          </div>
          <div className="hexagram-rank">
            The <span style={{ fontFamily: "var(--serif-cjk)" }}>{day.rank}</span> ({day.rankEn})
            hexagram of <span style={{ fontFamily: "var(--serif-cjk)" }}>{day.midQiTerm.nameZh}</span>{" "}
            {day.midQiTerm.nameEn} — <span style={{ fontFamily: "var(--serif-cjk)" }}>{h.upper.nameZh}</span>{" "}
            {h.upper.nameEn} over <span style={{ fontFamily: "var(--serif-cjk)" }}>{h.lower.nameZh}</span>{" "}
            {h.lower.nameEn}.
          </div>
          {span && (
            <span
              className="hexagram-window"
              title={`This window runs ${formatInstant(day.windowStartIso)} → ${formatInstant(day.windowEndIso)}. Each of the 60 runs 6 days 2 hours 6 minutes, so the edges drift and rarely fall on midnight.`}
            >
              Governs {formatWindow(span.first, span.last)}
            </span>
          )}
        </div>
      </div>

      <p className="hexagram-source">
        This is a calendar entry, not a throw for the day: in the 六日七分 scheme each of the 60 hexagrams of the
        day-rotation governs 6 days 2 hours 6 minutes, the cycle restarting at the winter solstice with{" "}
        <span style={{ fontFamily: "var(--serif-cjk)" }}>公中孚</span> and the four{" "}
        <span style={{ fontFamily: "var(--serif-cjk)" }}>正卦</span> (坎離震兌) held back to govern the 24 qi.
        Arrangement: the <span style={{ fontFamily: "var(--serif-cjk)" }}>京房卦氣直日圖</span> as recorded in{" "}
        <span style={{ fontFamily: "var(--serif-cjk)" }}>《新唐書‧曆志》</span>, from{" "}
        <span style={{ fontFamily: "var(--serif-cjk)" }}>孟喜</span> and{" "}
        <span style={{ fontFamily: "var(--serif-cjk)" }}>《易緯‧稽覽圖》</span>. Windows are read in the tables&apos;
        reference zone (UTC+8), and a date is assigned to whichever hexagram covers its local noon — a stated
        convention, not a derived fact. Other traditions derive a day&apos;s hexagram differently: a variant we have
        seen described — as giving the four 正卦 a whole day each at the solstices and equinoxes, and usually
        attributed to the <span style={{ fontFamily: "var(--serif-cjk)" }}>焦氏易林</span> line — we have{" "}
        <b>not</b> traced to a primary text, so we do not present it as fact; and tables that re-anchor at every{" "}
        <span style={{ fontFamily: "var(--serif-cjk)" }}>節</span> rather than every{" "}
        <span style={{ fontFamily: "var(--serif-cjk)" }}>中氣</span> disagree with this one on some days. Shown as
        classical material; it feeds nothing this app scores or ranks.
      </p>

      {cast && lunar && (
        <div className="hexagram-cast">
          <HexagramGlyph
            hexagram={cast.hexagram}
            label={`Cast: ${describe(cast.hexagram)}; moving line ${cast.movingLine}`}
            small
            quiet
            movingLine={cast.movingLine}
          />
          <div className="hexagram-cast-body">
            {/* Subordinate to the card title above — smaller, uppercase, faint.
                It is a section INSIDE the card, never a second card title. */}
            <div className="hexagram-cast-label">Also — a cast for the day · 梅花易數</div>
            <div className="hexagram-cast-name">
              {composedNameZh(cast.hexagram)}{" "}
              <span className="hexagram-name-en" style={{ display: "inline" }}>
                {cast.hexagram.pinyin} · {cast.hexagram.nameEn}
              </span>{" "}
              <span className="hexagram-cast-moving" title="動爻 — the line shown in cinnabar. Flipping it gives the 變卦.">
                動爻 line {cast.movingLine} → {composedNameZh(cast.changedHexagram)}
              </span>
            </div>
            <p className="hexagram-cast-note">
              <span style={{ fontFamily: "var(--serif-cjk)" }}>梅花易數</span> takes a hexagram from a{" "}
              <i>moment</i> — the lunisolar year branch, month, day and hour, summed and divided by eight — rather
              than from the calendar&apos;s own table. Cast here for{" "}
              <span style={{ fontFamily: "var(--serif-cjk)" }}>子時</span>, the hour the Chinese day opens, on the
              lunisolar day <span style={{ fontFamily: "var(--serif-cjk)" }}>{lunar.yearGanZhi}</span> year
              {lunar.isLeapMonth ? ", leap month " : ", month "}
              {lunar.month}, day {lunar.day}. The classics give no day-without-hour form, so that hour is our
              choice and not doctrine — this is a cast, not the day&apos;s hexagram, and the two agree only
              occasionally.{" "}
              {lunar.isLeapMonth
                ? "This is a leap month (閏月), and we count it under its own number, as the almanac prints it"
                : "A leap month (閏月) is counted here under its own number, as the almanac prints it"}
              ; other lines count a <span style={{ fontFamily: "var(--serif-cjk)" }}>閏月</span> as the following
              month, which casts a different hexagram — that choice is ours too, like the hour. Rule:
              《梅花易數》卷一「年月日時起例」.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
