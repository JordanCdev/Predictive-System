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
 *  render as hanzi alone — never guessed. Exported so the hour-detail view can
 *  reuse the same wording. */
export const YIJI_GLOSS: Record<string, string> = {
  // hour-list terms (the per-hour 宜/忌 vocabulary adds a few of its own)
  见贵: "seeing dignitaries",
  求财: "seeking wealth",
  酬神: "thanking the gods",
  订婚: "engagement",
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

/** English glosses for the day-star (神煞) names lunar-javascript emits
 *  (simplified script). Conventional renderings, not translations of doctrine;
 *  terms without a gloss render as hanzi with a generic tooltip — never
 *  guessed. Exported so the hour-detail view can gloss the hour gods too. */
export const SHENSHA_GLOSS: Record<string, string> = {
  // 吉神 — auspicious stars
  天乙贵人: "Heavenly Noble",
  天德: "Heaven Virtue",
  月德: "Month Virtue",
  天德合: "Heaven Virtue Combination",
  月德合: "Month Virtue Combination",
  天恩: "Heavenly Grace",
  天赦: "Heavenly Pardon",
  天愿: "Heavenly Wish",
  母仓: "Mother's Granary",
  时德: "Season Virtue",
  月空: "Month Emptiness",
  月恩: "Month Grace",
  四相: "Four Phases",
  金堂: "Gold Hall",
  玉堂: "Jade Hall",
  解神: "Relief God",
  司命: "Life Governor",
  青龙: "Green Dragon",
  明堂: "Bright Hall",
  金匮: "Golden Coffer",
  三合: "Triple Harmony",
  六合: "Six Harmony",
  五合: "Five Harmony",
  五富: "Five Riches",
  天喜: "Heavenly Happiness",
  天医: "Heavenly Doctor",
  天马: "Heavenly Horse",
  驿马: "Post Horse",
  生气: "Life Qi",
  阳德: "Yang Virtue",
  阴德: "Yin Virtue",
  不将: "No General (wedding star)",
  圣心: "Sage's Heart",
  益后: "Benefit Posterity",
  续世: "Continuing the Line",
  要安: "Essential Calm",
  玉宇: "Jade Eaves",
  敬安: "Respectful Calm",
  普护: "Universal Protection",
  福生: "Fortune Birth",
  鸣吠: "Crowing & Barking",
  鸣吠对: "Crowing & Barking Pair",
  王日: "King Day",
  官日: "Officer Day",
  守日: "Guard Day",
  相日: "Minister Day",
  民日: "People's Day",
  临日: "Approach Day",
  // 凶煞 — inauspicious stars
  天刑: "Heavenly Punishment",
  天牢: "Sky Jail",
  白虎: "White Tiger",
  玄武: "Black Tortoise",
  朱雀: "Vermilion Bird",
  勾陈: "Hook Snare",
  咸池: "Salty Pool (Peach Blossom)",
  小耗: "Small Consumer",
  大耗: "Great Consumer",
  五虚: "Five Emptiness",
  五离: "Five Separations",
  归忌: "Return Taboo",
  九坎: "Nine Pits",
  九焦: "Nine Scorches",
  大时: "Great Time",
  大败: "Great Defeat",
  月害: "Month Harm",
  月破: "Month Break",
  月厌: "Month Loathing",
  月煞: "Month Killer",
  月刑: "Month Punishment",
  月虚: "Month Void",
  劫煞: "Robbery Sha",
  灾煞: "Disaster Sha",
  天贼: "Heavenly Thief",
  死气: "Death Qi",
  死神: "Death God",
  血支: "Blood Branch",
  血忌: "Blood Taboo",
  四击: "Four Strikes",
  四废: "Four Voids",
  九空: "Nine Voids",
  五墓: "Five Graves",
  土符: "Earth Tally",
  地囊: "Earth Pouch",
  八风: "Eight Winds",
  八专: "Eight Specials",
  天吏: "Heavenly Magistrate",
  往亡: "Departure Peril",
  重日: "Double Day",
  复日: "Repeat Day",
  河魁: "River Chief",
  天罡: "Sky Ridge",
  游祸: "Roaming Misfortune",
  招摇: "Flaunting Star",
  披麻: "Wearing Hemp (mourning)",
  厌对: "Loathing Opposite",
  触水龙: "Water-Touching Dragon",
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

/** Day stars as chips: hanzi + gloss where we have one, generic tooltip where
 *  we don't. Same chip anatomy as the 宜/忌 terms, tinted by kind. */
function StarChips({ terms, kind }: { terms: string[]; kind: "good" | "bad" }) {
  if (terms.length === 0) return <span style={{ fontSize: 12.5, color: "var(--muted)" }}>— none listed.</span>;
  return (
    <span style={{ display: "inline-flex", flexWrap: "wrap", gap: 6 }}>
      {terms.map((t) => (
        <span
          key={t}
          title={SHENSHA_GLOSS[t] ? `${t} — ${SHENSHA_GLOSS[t]}` : `${t} — a traditional day star (神煞); English renderings vary by school.`}
          style={{
            fontSize: 12,
            border: "1px solid var(--hairline)",
            background: kind === "good" ? "rgba(29,158,117,0.07)" : "rgba(192,68,46,0.07)",
            color: "var(--ink)",
            borderRadius: 999,
            padding: "2px 10px",
            display: "inline-flex",
            alignItems: "baseline",
            gap: 5,
          }}
        >
          <span style={{ fontFamily: "var(--serif-cjk)", color: "var(--ink)" }}>{t}</span>
          {SHENSHA_GLOSS[t] && <span style={{ fontSize: 10.5, color: "var(--muted)" }}>{SHENSHA_GLOSS[t]}</span>}
        </span>
      ))}
    </span>
  );
}

/** Loads the full third-party almanac detail for one civil day via the lazy
 *  verification chunk; null until the chunk arrives (or forever, offline).
 *  Exported so pages can fetch the detail once and share it between the panel
 *  and the hour grid's per-hour enrichment. */
export function useAlmanacDayDetail(civil: { year: number; month: number; day: number } | null): AlmanacDayDetail | null {
  const [detail, setDetail] = useState<AlmanacDayDetail | null>(null);
  useEffect(() => {
    let cancelled = false;
    setDetail(null);
    if (!civil) return;
    const { year, month, day } = civil;
    // Lazy: the only lunar-javascript entry points live in engine/verification/*.
    import("../engine/verification/lunarAlmanac.ts")
      .then((m) => {
        if (!cancelled) setDetail(m.buildAlmanacDayDetail({ year, month, day }));
      })
      .catch(() => {
        /* offline / chunk failed — the panel simply doesn't appear */
      });
    return () => {
      cancelled = true;
    };
  }, [civil?.year, civil?.month, civil?.day]); // eslint-disable-line react-hooks/exhaustive-deps
  return detail;
}

export function AlmanacPanel({ civil }: { civil: { year: number; month: number; day: number } }) {
  const detail = useAlmanacDayDetail(civil);
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

      {(detail.jiShen.length > 0 || detail.xiongSha.length > 0) && (
        <>
          <div style={{ display: "flex", gap: 8, marginTop: 12, alignItems: "baseline" }}>
            <b
              style={{ color: "#1d9e75", fontFamily: "var(--serif-cjk)", fontSize: 13.5, flex: "0 0 auto" }}
              title="吉神 — the auspicious day stars this almanac lists for today"
            >
              吉神
            </b>
            <StarChips terms={detail.jiShen} kind="good" />
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 8, alignItems: "baseline" }}>
            <b
              style={{ color: "#c0442e", fontFamily: "var(--serif-cjk)", fontSize: 13.5, flex: "0 0 auto" }}
              title="凶煞 — the inauspicious day stars this almanac lists for today"
            >
              凶煞
            </b>
            <StarChips terms={detail.xiongSha} kind="bad" />
          </div>
          <p style={{ margin: "7px 0 0", fontSize: 11.5, color: "var(--faint)", lineHeight: 1.5 }}>
            Almanac publishers differ on these star lists — this is one independent publisher's set, shown as a cross-check, and other almanacs may list a different set for the same day.
          </p>
        </>
      )}

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
