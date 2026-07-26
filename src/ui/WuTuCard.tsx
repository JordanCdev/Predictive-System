import { useMemo } from "react";
import { dayGanzhiIndexFromCivilDate } from "../engine/sexagenary.ts";
import {
  WU_TU_ALTERNATE_LINEAGE,
  WU_TU_BRANCH_PALACE_CAVEAT,
  shuoIndexFromDay,
  wuTuDayStar,
  wuTuMonth,
} from "../engine/wuTu.ts";

/**
 * 烏兔 — one row of the almanac: which of the nine stars governs today under
 * 天元烏兔經, and what that name actually means.
 *
 * WHY THE COPY LEADS WITH THE GLOSS. Other almanacs print this column in
 * English as "Black Rabbit", which reads like a zodiac animal and sends people
 * looking at the day pillar. It isn't one. 烏兔 is 日月 — 烏 is 金烏, the golden
 * crow in the sun (and 烏 also plainly means "black"), 兔 is 玉兔, the jade
 * rabbit in the moon. Word for word the pair glosses as "black rabbit"; that's
 * the whole story behind the odd label, and saying so is more useful than
 * repeating it.
 *
 * DISPLAY ONLY. Nothing here feeds `recommendationScore` or
 * `calculationHash` — it is a calendar column shown beside the reading, and
 * the interpretation is labelled with the lineage it comes from.
 *
 * LINEAGE. Shown on the 月朔起例 (new-moon anchored) line, which is what
 * ../engine/wuTu.ts implements. A 節氣起例 (solar-term anchored) line also
 * circulates and returns a DIFFERENT star for the same day; the card names it
 * rather than pretending one lineage is universal.
 */

// ── lunar day numerals (初一 … 三十) ────────────────────────────────────────

const DIGITS = ["", "一", "二", "三", "四", "五", "六", "七", "八", "九"];

/** 1..30 → 初一 … 初十, 十一 … 十九, 二十, 廿一 … 廿九, 三十. */
export function lunarDayZh(day: number): string {
  if (day === 10) return "初十";
  if (day < 10) return `初${DIGITS[day]}`;
  if (day < 20) return `十${DIGITS[day - 10]}`;
  if (day === 20) return "二十";
  if (day < 30) return `廿${DIGITS[day - 20]}`;
  return "三十";
}

// ── the card ────────────────────────────────────────────────────────────────

/**
 * The lunisolar numbers the method needs, plus the month label the copy prints
 * and the month's LENGTH, which the 太陽日 list cannot be honest without.
 * Deliberately a plain shape rather than an import: lunar-javascript may only
 * be touched under src/engine/verification/**, so the page that already loads
 * the lunisolar date for the almanac hands it down. Any object with these
 * fields fits — including the verification layer's own lunar-date record, which
 * carries `month`, `day`, `isLeapMonth` and `daysInMonth` under those names.
 */
export interface WuTuLunarDate {
  /** Lunar month 1..12. A leap month keeps its own number and sets the flag. */
  month: number;
  /** Lunar day 1..30 within that month. */
  day: number;
  /** 閏月 — affects only the label; the star flight keys off the month's own
   *  新月 pillar, so a leap month is just another month here. */
  isLeapMonth?: boolean;
  /** 29 (小月) or 30 (大月). REQUIRED for an honest 太陽日 list: the flight
   *  itself is length-independent, but a 小月 has no 三十, so without this the
   *  card would print a day that month does not contain. Optional only because
   *  the supplier may not be able to determine it — see `displayableDays`. */
  daysInMonth?: 29 | 30;
}

/**
 * The lunar days of a month-wide list that this month actually contains.
 *
 * `wuTuMonth` truncates by the length it is given, so the honest answer needs
 * the real one. When the length is unknown we drop day 30 rather than assert
 * it: omitting a genuine 三十 in a 大月 understates the almanac, whereas
 * printing 三十 in a 小月 states a day that does not exist. Exported so the
 * rule is pinned by a test rather than buried in a render.
 */
export function displayableDays(
  days: readonly number[],
  daysInMonth: 29 | 30 | undefined,
): number[] {
  return daysInMonth ? [...days] : days.filter((d) => d <= 29);
}

export function WuTuCard({
  civil,
  lunar,
}: {
  civil: { year: number; month: number; day: number };
  /** Null while the lunisolar date is loading, or forever if it cannot be
   *  loaded — in which case the card simply isn't there. */
  lunar: WuTuLunarDate | null;
}) {
  const reading = useMemo(() => {
    if (!lunar) return null;
    // A malformed lunar day would throw in the engine; a missing almanac row is
    // not worth taking the page down for, so the card just doesn't render.
    if (!Number.isInteger(lunar.day) || lunar.day < 1 || lunar.day > 30) return null;
    const dayIndex = dayGanzhiIndexFromCivilDate(civil.year, civil.month, civil.day);
    const shuoIndex = shuoIndexFromDay(dayIndex, lunar.day);
    // The month's real length, or undefined if the supplier could not give one.
    // Anything else is treated as absent rather than fed to the engine, which
    // rejects a length that is not 29 or 30.
    const daysInMonth =
      lunar.daysInMonth === 29 || lunar.daysInMonth === 30 ? lunar.daysInMonth : undefined;
    return {
      star: wuTuDayStar(shuoIndex, lunar.day),
      month: wuTuMonth(shuoIndex, daysInMonth ?? 30),
      daysInMonth,
    };
  }, [civil.year, civil.month, civil.day, lunar]);

  if (!lunar || !reading) return null;

  const { star, month, daysInMonth } = reading;
  const sunDays = displayableDays(month.sunDays, daysInMonth).map(lunarDayZh).join("、");
  const entailedPalaces = WU_TU_BRANCH_PALACE_CAVEAT.entailed.length;

  return (
    <div className="card" style={{ padding: 18 }}>
      {/* Shared card heading: same element and class as the other divination
          cards — h3.section-title, "English name · 漢字". */}
      <h3 className="section-title" style={{ margin: "0 0 8px" }}>
        Day star · <span style={{ fontFamily: "var(--serif-cjk)" }}>烏兔</span>
      </h3>

      <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
        <span style={{ fontFamily: "var(--serif-cjk)", fontSize: 22, lineHeight: 1.1 }}>
          {star.nameZh}
        </span>
        <span style={{ fontSize: 14 }}>{star.nameEn}</span>
        <span className="faint" style={{ fontSize: 12 }}>
          · <span style={{ fontFamily: "var(--serif-cjk)" }}>{star.palaceZh}</span> palace {star.palace}
        </span>
        <span
          className={`pill ${star.auspicious ? "good" : "danger"}`}
          title={
            star.auspicious
              ? "吉 in this lineage. The ranking runs 太陽 › 太陰 › 金星 › 木星 › 水星."
              : "凶 in this lineage: 土星, 火星, 羅睺 and 計都 are the four to avoid."
          }
        >
          <span style={{ fontFamily: "var(--serif-cjk)" }}>{star.auspicious ? "吉" : "凶"}</span>
          {star.isSunDay ? " — the one this method looks for" : ""}
        </span>
      </div>

      <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 8, lineHeight: 1.55 }}>
        <span style={{ fontFamily: "var(--serif-cjk)" }}>{lunarDayZh(lunar.day)}</span> of the{" "}
        {lunar.isLeapMonth ? "leap " : ""}
        {lunar.month}
        {lunar.month === 1 ? "st" : lunar.month === 2 ? "nd" : lunar.month === 3 ? "rd" : "th"} lunar
        month, whose <span style={{ fontFamily: "var(--serif-cjk)" }}>太陽</span> days fall on{" "}
        <span style={{ fontFamily: "var(--serif-cjk)" }}>{sunDays}</span>.
      </div>

      <p style={{ fontSize: 12, color: "var(--muted)", margin: "10px 0 0", lineHeight: 1.6 }}>
        <span style={{ fontFamily: "var(--serif-cjk)" }}>烏兔</span> means sun and moon:{" "}
        <span style={{ fontFamily: "var(--serif-cjk)" }}>烏</span> is the golden crow that lives in
        the sun — and it also plainly means <em>black</em> —{" "}
        <span style={{ fontFamily: "var(--serif-cjk)" }}>兔</span> is the jade rabbit that lives in
        the moon. Word for word that glosses as &ldquo;black rabbit&rdquo;, which is where the odd
        English name in some almanacs comes from; it is not an animal sign and has nothing to do
        with today&apos;s day pillar. The method flies the nine{" "}
        <span style={{ fontFamily: "var(--serif-cjk)" }}>洛書</span> palaces one palace per lunar
        day, starting from the palace this month&apos;s{" "}
        <span style={{ fontFamily: "var(--serif-cjk)" }}>初一</span> occupies, so each star returns
        every nine days. <span style={{ fontFamily: "var(--serif-cjk)" }}>太陽</span> sits in{" "}
        <span style={{ fontFamily: "var(--serif-cjk)" }}>艮</span>8 and is the day practitioners
        hunt for — which is why the whole method is called{" "}
        <span style={{ fontFamily: "var(--serif-cjk)" }}>烏兔太陽擇日法</span>.
      </p>

      <p style={{ fontSize: 11.5, color: "var(--faint)", margin: "12px 0 0", lineHeight: 1.55 }}>
        <span style={{ fontFamily: "var(--serif-cjk)" }}>《天元烏兔經》</span>, attributed to{" "}
        <span style={{ fontFamily: "var(--serif-cjk)" }}>楊筠松</span> (Yang Yun-song, Tang). Shown
        on the <span style={{ fontFamily: "var(--serif-cjk)" }}>{WU_TU_ALTERNATE_LINEAGE.shippedNameZh}</span>{" "}
        ({WU_TU_ALTERNATE_LINEAGE.shippedNameEn}) lineage, which counts from each lunar month&apos;s
        new moon. A{" "}
        <span style={{ fontFamily: "var(--serif-cjk)" }}>{WU_TU_ALTERNATE_LINEAGE.alternateNameZh}</span>{" "}
        ({WU_TU_ALTERNATE_LINEAGE.alternateNameEn}) lineage also circulates —{" "}
        <span style={{ fontFamily: "var(--serif-cjk)" }}>
          {WU_TU_ALTERNATE_LINEAGE.alternateMnemonic}
        </span>{" "}
        — and it gives a different star for the same day. We show one and name the other rather than
        merge them. {entailedPalaces} of the nine{" "}
        <span style={{ fontFamily: "var(--serif-cjk)" }}>
          {WU_TU_BRANCH_PALACE_CAVEAT.mapNameZh}
        </span>{" "}
        branch-to-palace assignments the flight needs (
        <span style={{ fontFamily: "var(--serif-cjk)" }}>
          {WU_TU_BRANCH_PALACE_CAVEAT.entailed.flatMap((g) => g.branchesZh).join("、")}
        </span>
        ) are entailed by the published{" "}
        <span style={{ fontFamily: "var(--serif-cjk)" }}>太陽值日</span> table rather than shown by a
        worked example in the sources read — we have not verified them against a primary text and
        say so rather than let it pass. This is one tradition&apos;s reading of the calendar, not a
        forecast, and it does not enter the score.
      </p>
    </div>
  );
}
