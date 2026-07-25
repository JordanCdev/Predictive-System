import { useMemo } from "react";
import { BRANCHES, Branch, BaziChart, ganZhiFromIndex, isNoblemanDay, personalShenSha } from "../engine/index.ts";

interface StarRow {
  key: string;
  nameEn: string;
  nameZh: string;
  meaning: string;
  branches: Branch[];
}

const fmtBranch = (b: Branch) => `${b.hanzi} ${b.animal} (${b.pinyin})`;

/** "Your lucky keys" — the chart's own auxiliary stars (神煞): Nobleman branches,
 *  Peach Blossom and Travelling Horse, each derived deterministically from the
 *  natal pillars via the same engine tables the day scorer uses. */
export function LuckyKeys({ chart }: { chart: BaziChart }) {
  const rows = useMemo<StarRow[]>(() => {
    const by = (pos: string) => chart.pillars.find((p) => p.position === pos)!;
    const natal = {
      year: by("year").ganzhi.branch.index,
      month: by("month").ganzhi.branch.index,
      day: by("day").ganzhi.branch.index,
    };
    const dayStemIdx = by("day").ganzhi.stem.index;

    const nobleman = BRANCHES.filter((b) => isNoblemanDay(b.index, dayStemIdx));
    const peach: Branch[] = [];
    const horse: Branch[] = [];
    for (let b = 0; b < 12; b++) {
      // ganZhiFromIndex(0..11) yields branch 0..11; peach/horse depend on the branch only.
      const tags = personalShenSha(ganZhiFromIndex(b), natal).tags;
      if (tags.some((t) => t.code === "peach_blossom")) peach.push(BRANCHES[b]);
      if (tags.some((t) => t.code === "travelling_horse")) horse.push(BRANCHES[b]);
    }

    const out: StarRow[] = [];
    if (nobleman.length) {
      out.push({
        key: "nobleman",
        nameEn: "Nobleman",
        nameZh: "天乙貴人",
        meaning: "The tradition's “helpful people” star — mentors, allies and timely help tend to be the theme.",
        branches: nobleman,
      });
    }
    if (peach.length) {
      out.push({
        key: "peach_blossom",
        nameEn: "Peach Blossom",
        nameZh: "桃花",
        meaning: "The charm star — social magnetism and connection; tradition also counsels discretion on it.",
        branches: peach,
      });
    }
    if (horse.length) {
      out.push({
        key: "travelling_horse",
        nameEn: "Travelling Horse",
        nameZh: "驛馬",
        meaning: "The movement star — travel, relocation and momentum are its traditional themes.",
        branches: horse,
      });
    }
    return out;
  }, [chart]);

  if (rows.length === 0) return null;

  return (
    <>
      <div className="section-title" style={{ marginTop: 16 }}>
        Your lucky keys
      </div>
      <div style={{ display: "grid", gap: 8 }}>
        {rows.map((r) => (
          <div key={r.key} style={{ border: "1px solid var(--hairline)", borderRadius: 10, padding: "10px 12px", background: "var(--surface-1)" }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
              <b style={{ fontSize: 13.5 }}>{r.nameEn}</b>
              <span style={{ fontFamily: "var(--serif-cjk)", fontSize: 13, color: "var(--gold-text)" }}>{r.nameZh}</span>
              <span style={{ fontSize: 12.5, color: "var(--muted)" }}>
                {r.branches.map((b) => `${b.hanzi} ${b.animal}`).join(" · ")}
              </span>
            </div>
            <p style={{ margin: "4px 0 0", fontSize: 12.5, color: "var(--muted)", lineHeight: 1.55 }}>
              {r.meaning}{" "}
              Days whose branch is {r.branches.map(fmtBranch).join(" or ")} carry this star for you.
            </p>
          </div>
        ))}
      </div>
      <p className="ask-note" style={{ marginTop: 6 }}>
        Auxiliary stars (神煞) read from your birth chart — traditional overlays, always weighed below the main structure.
      </p>
    </>
  );
}
