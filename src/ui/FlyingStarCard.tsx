import { useMemo } from "react";
import {
  FLYING_STAR_SCHOOLS,
  REFERENCE_ZONE_LABEL,
  dayFlyingStar,
  flyingStarAgreementRun,
  type FlyingStarAgreementRun,
  type FlyingStarCivilDate,
  type FlyingStarReading,
} from "../engine/flyingStar.ts";

/**
 * 日家紫白 — the day's Purple-White flying star.
 *
 * The number is the point of the card, so the number is what you see. But the
 * ONE contested step in the calculation — which 甲子 day the 60-day 元 is
 * numbered from — changes the answer for years at a stretch, and the two
 * readings are named lineages, not a bug. So on those days this card shows BOTH
 * numbers at the same size, side by side, with a plain sentence saying why they
 * differ. On the days they coincide it says that too, because "the schools agree
 * here" is information as well.
 *
 * WHY THE COPY TALKS IN BLOCKS, NOT FREQUENCIES. Whether the schools agree is a
 * property of the HALF-YEAR (each half has one anchor per school), and
 * consecutive halves move their 甲子 only 2–3 days along, so agreement holds for
 * runs of years: every day from 2020-06-21 to 2026-06-20 agrees, every day from
 * 2026-06-21 to 2031-12-21 differs. A per-day frequency would be wrong twice
 * over — the one this card used to quote overstated the measured rate (which is
 * 2182 of 5844 days over 2020–2035), and any such figure describes a structural
 * fact as a per-date lottery. The card therefore prints the current run's real
 * bounds, from `flyingStarAgreementRun`, instead of any frequency.
 *
 * What this card must never do, and the reasons:
 *  - Print one unqualified number. That would present one lineage as universal,
 *    which is the exact failure this app exists not to commit.
 *  - Call either school correct, or the better reading. We have not read the
 *    anchor rule in a primary Qing text; both are attested conventions.
 *  - Read the star as good or bad. 五黃煞 and the rest are a literature we have
 *    not sourced, so no reading appears here — the English words are colour
 *    names, nothing more.
 *  - Cite competitor parity as a justification. That a particular publisher's
 *    diary matches one school is a calibration fact, kept in the engine's
 *    header comment where it belongs.
 *
 * Display only: `src/engine/flyingStar.ts` feeds no scoring path, and this card
 * feeds none either.
 */

const zh = { fontFamily: "var(--serif-cjk)" } as const;

function StarFace({ reading, compact = false }: { reading: FlyingStarReading; compact?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 10, minWidth: 0 }}>
      <div
        style={{
          ...zh,
          fontSize: compact ? 30 : 38,
          lineHeight: 1,
          color: "var(--ink)",
          letterSpacing: "0.02em",
        }}
      >
        {reading.name}
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: "var(--ink)" }}>
          {reading.star} · {reading.colourEn}
        </div>
      </div>
    </div>
  );
}

function SchoolColumn({ reading }: { reading: FlyingStarReading }) {
  const school = FLYING_STAR_SCHOOLS[reading.school];
  return (
    <div
      style={{
        flex: "1 1 160px",
        minWidth: 0,
        padding: "10px 12px",
        border: "1px solid var(--hairline)",
        borderRadius: "var(--radius-cell)",
      }}
    >
      <StarFace reading={reading} compact />
      <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 8 }}>
        <span style={zh}>{school.nameZh}</span> · {school.nameEn}
      </div>
      <div style={{ fontSize: 11.5, color: "var(--faint)", marginTop: 3 }}>
        Anchored on the <span style={zh}>甲子</span> of {reading.anchorIso} — {school.seenInEn}.
      </div>
    </div>
  );
}

/**
 * "from 2020-06-21 to 2026-06-20", widening to "at least" when the engine's walk
 * hit its search bound rather than a real flip — so the sentence never claims a
 * boundary that was not found.
 */
function runSpan(run: FlyingStarAgreementRun): string {
  const from = run.startExact ? `from ${run.startIso}` : `from at least as far back as ${run.startIso}`;
  const to = run.endExact ? `to ${run.endIso}` : `to at least ${run.endIso}`;
  return `${from} ${to}`;
}

export function FlyingStarCard({ civil }: { civil: FlyingStarCivilDate }) {
  const day = useMemo(
    () => dayFlyingStar(civil),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [civil.year, civil.month, civil.day],
  );
  const run = useMemo(
    () => flyingStarAgreementRun(civil),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [civil.year, civil.month, civil.day],
  );

  const solstice = day.tongShu.governingSolstice;
  const directionGloss =
    day.tongShu.half === "yang"
      ? "one palace up each day"
      : "one palace down each day";

  return (
    <div className="card" style={{ padding: 16, marginTop: 12 }}>
      <h3 className="section-title" style={{ margin: "0 0 10px" }}>
        Daily flying star · <span style={zh}>日家紫白</span>
      </h3>

      {day.agree ? (
        <>
          <StarFace reading={day.tongShu} />
          <p style={{ margin: "10px 0 0", fontSize: 12.5, color: "var(--muted)" }}>
            Both lineages give the same number here, and not by coincidence. The{" "}
            <span style={zh}>通書／曆書</span> and <span style={zh}>超神接氣</span> schools number the
            60-day <span style={zh}>元</span> from a different <span style={zh}>甲子</span> day, but
            for this half-year both anchor on the same one ({run.sharedAnchorIso ?? day.tongShu.anchorIso}),
            so there is one number to show. Successive half-years move that{" "}
            <span style={zh}>甲子</span> only two or three days along, so the agreement holds in a
            long block rather than date by date: the two schools agree on every day {runSpan(run)}.
          </p>
        </>
      ) : (
        <>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <SchoolColumn reading={day.tongShu} />
            <SchoolColumn reading={day.chaoShen} />
          </div>
          <p style={{ margin: "10px 0 0", fontSize: 12.5, color: "var(--muted)" }}>
            Two numbers, because two lineages read this day differently. The 60-day{" "}
            <span style={zh}>元</span> is numbered from a <span style={zh}>甲子</span> day, and the
            schools pick a different one: <span style={zh}>通書／曆書</span> takes the first{" "}
            <span style={zh}>甲子</span> on or after the solstice, while{" "}
            <span style={zh}>超神接氣</span> takes the nearest one — which for this half-year fell{" "}
            <em>before</em> the solstice (<span style={zh}>超神</span>). The two <span style={zh}>甲子</span> sit exactly 60 days
            apart, so the readings differ by three palaces. That split is not a quirk of this date:
            because successive half-years move the <span style={zh}>甲子</span> only two or three days
            along, it holds for every day {runSpan(run)}. We show both because we have no doctrinal
            basis for declaring either wrong.
          </p>
        </>
      )}

      {day.outgoing && (
        <p style={{ margin: "10px 0 0", fontSize: 12.5, color: "var(--muted)" }}>
          This date is <span style={zh}>{solstice.nameZh}</span> itself, so two runs meet on it: the
          closing half and the opening one. Printed almanacs give the pair as outgoing/incoming.{" "}
          {day.agree && day.outgoing.agree ? (
            <>
              Both lineages read the pair the same way —{" "}
              <span style={zh}>{day.outgoing.tongShu.name}</span> then{" "}
              <span style={zh}>{day.tongShu.name}</span> ({day.outgoing.tongShu.star}/
              {day.tongShu.star}). The single number at the top of this card is the incoming one.
            </>
          ) : (
            <>
              The lineages give different pairs:{" "}
              <span style={zh}>{FLYING_STAR_SCHOOLS.tongShu.nameZh}</span>{" "}
              {day.outgoing.tongShu.star}/{day.tongShu.star} (
              <span style={zh}>{day.outgoing.tongShu.name}</span> then{" "}
              <span style={zh}>{day.tongShu.name}</span>), and{" "}
              <span style={zh}>{FLYING_STAR_SCHOOLS.chaoShen.nameZh}</span>{" "}
              {day.outgoing.chaoShen.star}/{day.chaoShen.star} (
              <span style={zh}>{day.outgoing.chaoShen.name}</span> then{" "}
              <span style={zh}>{day.chaoShen.name}</span>).{" "}
              {day.agree
                ? "The schools part only on the outgoing number; the incoming one they share, and that is the single number at the top of this card."
                : "In each pair the second number is the incoming one — the number standing in that school's column above."}
            </>
          )}
        </p>
      )}

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 12 }}>
        <span className="pill">
          <span style={zh}>{solstice.nameZh}</span> {solstice.dateIso}
        </span>
        <span className="pill">
          <span style={zh}>{day.tongShu.half === "yang" ? "陽遁順行" : "陰遁逆行"}</span>
        </span>
        <span className="pill faint">{directionGloss}</span>
      </div>

      <p style={{ margin: "12px 0 0", fontSize: 11.5, lineHeight: 1.6, color: "var(--faint)" }}>
        <span style={zh}>三元紫白擇日法</span>, day level. The tropical year is cut at the solstices
        — after <span style={zh}>冬至</span> the stars ascend, after <span style={zh}>夏至</span> they
        descend — and each half runs as three 60-day <span style={zh}>元</span> whose{" "}
        <span style={zh}>甲子</span> days open on <span style={zh}>一白七赤四綠</span> and{" "}
        <span style={zh}>九紫三碧六白</span>. That much is carried by two classical mnemonics
        (「<span style={zh}>冬至一白雨水七，谷雨四順起初一；夏至九宮處暑三，霜降六上逆同關</span>」).
        The anchor rule that separates the two readings above is attested as a named{" "}
        <span style={zh}>通書</span> convention in secondary sources; we have not read the passage in
        a primary Qing text such as <span style={zh}>協紀辨方書</span>, so neither school is presented
        as settled. Stars are computed in {REFERENCE_ZONE_LABEL} — the zone these almanacs are
        printed and read in — deliberately, for every reader, because a solstice near local midnight
        would otherwise move the anchor by a whole <span style={zh}>元</span> and the star by three.
        The nine names are colours, not readings: no meaning is attached here, and nothing on this
        card feeds what the app scores or ranks.
      </p>
    </div>
  );
}
