import { useEffect, useState } from "react";
import type { AlmanacDayDetail } from "../engine/verification/lunarAlmanac.ts";

/**
 * 通勝 almanac panel — the full third-party 宜/忌 lists, the lunar date in
 * Chinese and the 28-mansion, for one civil day. The data comes from
 * lunar-javascript via the lazy verification chunk (a deliberate cross-check
 * against an independent implementation, clearly labelled as such); the panel
 * renders nothing until the chunk arrives and hides gracefully offline.
 */

/** English glosses for the 通書 activity terms lunar-javascript emits
 *  (simplified script, as normalised by the adapter). Terms without a gloss
 *  render as hanzi alone — never guessed. */
const YIJI_GLOSS: Record<string, string> = {
  祭祀: "ancestor rites",
  祈福: "prayers & blessings",
  求嗣: "praying for children",
  开光: "consecration",
  塑绘: "sacred images",
  斋醮: "Taoist rites",
  沐浴: "ritual bathing",
  嫁娶: "marriage",
  纳采: "betrothal gifts",
  订盟: "engagement",
  文定: "engagement",
  冠笄: "coming of age",
  会亲友: "gathering friends & family",
  进人口: "adding to the household",
  出行: "travel",
  移徙: "moving home",
  入宅: "moving into a new home",
  安床: "setting up the bed",
  安门: "fitting a door",
  作灶: "fitting the stove",
  修造: "building & renovation",
  起基: "laying foundations",
  动土: "breaking ground",
  上梁: "raising the main beam",
  竖柱: "raising pillars",
  盖屋: "roofing",
  开市: "opening a business",
  开业: "opening a business",
  交易: "trading & deals",
  立券: "signing contracts",
  纳财: "receiving wealth",
  挂匾: "hanging the signboard",
  开仓: "opening the storehouse",
  出货财: "shipping goods",
  赴任: "taking up a post",
  入学: "starting studies",
  习艺: "learning a craft",
  上册: "enrolment",
  裁衣: "cutting cloth",
  合帐: "making bed-curtains",
  经络: "loom & machinery work",
  酝酿: "brewing & fermenting",
  栽种: "planting",
  纳畜: "acquiring livestock",
  牧养: "pasturing",
  捕捉: "catching pests",
  畋猎: "hunting",
  结网: "weaving nets",
  取渔: "fishing",
  开池: "digging a pond",
  掘井: "digging a well",
  放水: "filling the pond",
  造船: "boat building",
  乘船: "boarding a boat",
  理发: "haircut",
  整手足甲: "trimming nails",
  治病: "treating illness",
  求医: "seeing a doctor",
  针灸: "acupuncture",
  疗目: "treating the eyes",
  解除: "clearing away",
  扫舍: "sweeping the house",
  拆卸: "demolition",
  破屋: "tearing down a building",
  坏垣: "tearing down a wall",
  平治道涂: "repairing roads",
  修坟: "repairing a grave",
  安葬: "burial",
  破土: "breaking earth (burial)",
  入殓: "encoffining",
  移柩: "moving the coffin",
  启钻: "opening the grave",
  除服: "ending mourning",
  成服: "donning mourning",
  谢土: "thanking the earth",
  出火: "moving the altar",
  安香: "installing the altar",
  安碓磑: "installing the mill",
  词讼: "lawsuits",
  诸事不宜: "nothing is advisable",
  余事勿取: "take up nothing else",
  无: "none listed",
};

const GONG_EN: Record<string, string> = { 东: "eastern", 南: "southern", 西: "western", 北: "northern" };
const SHOU_EN: Record<string, string> = { 青龙: "Azure Dragon", 朱雀: "Vermilion Bird", 白虎: "White Tiger", 玄武: "Black Tortoise" };

function TermChips({ terms }: { terms: string[] }) {
  if (terms.length === 0) return <span style={{ fontSize: 12.5, color: "var(--muted)" }}>— none listed.</span>;
  return (
    <span style={{ display: "inline-flex", flexWrap: "wrap", gap: 6 }}>
      {terms.map((t) => (
        <span
          key={t}
          style={{
            fontSize: 12,
            border: "1px solid var(--hairline)",
            background: "var(--surface-2)",
            color: "var(--ink)",
            borderRadius: 999,
            padding: "2px 10px",
            display: "inline-flex",
            alignItems: "baseline",
            gap: 5,
          }}
        >
          <span style={{ fontFamily: "var(--serif-cjk)", color: "var(--ink)" }}>{t}</span>
          {YIJI_GLOSS[t] && <span style={{ fontSize: 10.5, color: "var(--muted)" }}>{YIJI_GLOSS[t]}</span>}
        </span>
      ))}
    </span>
  );
}

export function AlmanacPanel({ civil }: { civil: { year: number; month: number; day: number } }) {
  const [detail, setDetail] = useState<AlmanacDayDetail | null>(null);
  useEffect(() => {
    let cancelled = false;
    setDetail(null);
    // Lazy: the only lunar-javascript entry points live in engine/verification/*.
    import("../engine/verification/lunarAlmanac.ts")
      .then((m) => {
        if (!cancelled) setDetail(m.buildAlmanacDayDetail(civil));
      })
      .catch(() => {
        /* offline / chunk failed — the panel simply doesn't appear */
      });
    return () => {
      cancelled = true;
    };
  }, [civil.year, civil.month, civil.day]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!detail) return null;
  const m = detail.mansion;

  return (
    <div className="card" style={{ padding: 18, marginTop: 12 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <b style={{ fontSize: 15 }}>通勝 almanac <span style={{ fontWeight: 400, fontSize: 12, color: "var(--muted)" }}>(third-party cross-check)</span></b>
        <span style={{ fontSize: 14, fontFamily: "var(--serif-cjk)", color: "var(--ink)" }} title="Lunar (agricultural calendar) date">
          農曆 {detail.lunarDateZh}
        </span>
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 12, alignItems: "baseline" }}>
        <b style={{ color: "#1d9e75", fontFamily: "var(--serif-cjk)", fontSize: 15, flex: "0 0 auto" }} title="宜 — activities this almanac marks suitable today">宜</b>
        <TermChips terms={detail.yi} />
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 8, alignItems: "baseline" }}>
        <b style={{ color: "#c0442e", fontFamily: "var(--serif-cjk)", fontSize: 15, flex: "0 0 auto" }} title="忌 — activities this almanac marks unsuitable today">忌</b>
        <TermChips terms={detail.ji} />
      </div>

      {m && (
        <div style={{ marginTop: 12, fontSize: 12.5, color: "var(--muted)", lineHeight: 1.5 }}>
          <b style={{ color: "var(--ink)" }} title="廿八宿 — the day's lunar mansion">廿八宿:</b>{" "}
          <span style={{ fontFamily: "var(--serif-cjk)", color: "var(--ink)" }}>{m.xiu}{m.zheng}{m.animal}</span>
          {m.gong && m.shou && (
            <> — a mansion of the {GONG_EN[m.gong] ?? m.gong} {SHOU_EN[m.shou] ?? m.shou} palace</>
          )}
          ; tradition marks it <b style={{ color: m.luck === "吉" ? "#15795a" : "#b3403a" }}>{m.luck === "吉" ? "吉 auspicious" : `${m.luck} inauspicious`}</b>.
        </div>
      )}

      <p style={{ margin: "12px 0 0", fontSize: 11.5, color: "var(--faint)", lineHeight: 1.5 }}>
        From lunar-javascript, an independently implemented almanac, loaded on demand as a cross-check on this engine's
        calendar facts. 宜/忌 prescription lists legitimately differ between almanac publishers — treat them as one
        tradition's reading, not a verdict.
      </p>
    </div>
  );
}
