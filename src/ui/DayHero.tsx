import { BRANCHES, DayRecommendation, mod, verdictBand } from "../engine/index.ts";
import { scoreColor, scoreTextColor } from "./format.ts";

/** The 4 most recent years (up to and including `uptoYear`) whose year branch
 *  is `branchIndex` (1984 = 甲子, 子 = 0), oldest first. */
function recentYearsOfBranch(branchIndex: number, uptoYear: number): number[] {
  const years: number[] = [];
  for (let y = uptoYear; years.length < 4 && y > uptoYear - 49; y--) {
    if (mod(y - 1984, 12) === branchIndex) years.push(y);
  }
  return years.reverse();
}

/** Joey-Yap-style day hero: the day's verdict + score, the day pillar with its
 *  zodiac animal, and the Tong Shu's most-read fact — who the day clashes (沖).
 *  Free-tier: single-day transparency is never gated. */
export function DayHero({ rec }: { rec: DayRecommendation }) {
  const gz = rec.tongshu.dayGanzhi;
  const animal = BRANCHES[gz.branch.index].animal;
  const clashAnimal = rec.tongshu.clashAnimal;
  const clashBranchHz = BRANCHES[rec.tongshu.clashBranchIndex].hanzi;
  const band = verdictBand(rec.recommendationScore);
  const years = recentYearsOfBranch(rec.tongshu.clashBranchIndex, rec.civil.year);

  return (
    <div className="card day-hero" style={{ padding: "18px 20px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <span style={{ fontSize: 34, lineHeight: 1.1, fontFamily: "var(--serif-cjk)", color: "var(--ink)" }} title="Day pillar (日柱)">
            {gz.hanzi}
          </span>
          <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <b style={{ fontSize: 14, color: "var(--ink)" }}>{gz.pinyin}</b>
            <span style={{ fontSize: 12.5, color: "var(--muted)" }}>Day of the {animal}</span>
          </span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2 }}>
          <span style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <b style={{ fontSize: 17, color: scoreTextColor(rec.recommendationScore) }}>{band.label}</b>
            <span
              style={{ fontSize: 24, fontWeight: 700, color: scoreTextColor(rec.recommendationScore) }}
              title="Recommendation score (0–100) — a ranking heuristic under this rule set, not a prediction."
            >
              {Math.round(rec.recommendationScore)}
            </span>
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11.5, color: "var(--faint)" }}>
            <span className="dot" style={{ width: 8, height: 8, borderRadius: 8, background: scoreColor(rec.recommendationScore) }} />
            {rec.personalized ? "your day rating" : "general day rating"}
          </span>
        </div>
      </div>

      <div
        className="pill danger"
        style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 12, maxWidth: "100%", whiteSpace: "normal", lineHeight: 1.45 }}
        title={`The day branch ${gz.branch.hanzi} clashes ${clashBranchHz} (六沖). Zodiac years begin at 立春 (early February), not 1 January — early-year birthdays may belong to the previous animal.`}
      >
        <b style={{ fontFamily: "var(--serif-cjk)" }}>沖</b>
        <span>
          Clash: <b>{clashAnimal}</b> — people born in {clashAnimal} years (e.g. {years.join(", ")}); tradition marks the day
          unfavourable for their big moves.{" "}
          <span style={{ color: "var(--muted)", fontStyle: "normal" }}>
            Zodiac years start at 立春 (early Feb) — a January birthday may be the previous animal.
          </span>
        </span>
      </div>
    </div>
  );
}
