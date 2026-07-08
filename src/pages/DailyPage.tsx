import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  DecisionResult,
  GENERAL_DAY_OBJECTIVE,
  dayGodPlain,
  evaluateDecision,
  humanDate,
  officerPlain,
  shenShaPlain,
} from "../engine/index.ts";
import { DayInsights } from "../ui/DayInsights.tsx";
import { useProfile } from "../ui/profile/ProfileContext.tsx";
import { TODAY_ISO, addDaysIso, buildRequest, civilOfIso, isValidIso } from "../ui/shared.ts";
import { NeedsProfile } from "./NeedsProfile.tsx";
import { DayVerification } from "./PlannerBits.tsx";

/** Daily planner view — one day's pillar, officer, day-god, special info,
 *  auspicious/inauspicious stars, personal fit, 12 hour slots, 宜/忌, and live
 *  verification badges. Browses past and future via /day/:date. */
export function DailyPage() {
  const params = useParams();
  const nav = useNavigate();
  const iso = isValidIso(params.date) ? params.date : TODAY_ISO;
  const isToday = iso === TODAY_ISO;
  const { chart, person } = useProfile();

  // Sweeps ON (for convention-sensitivity) + a lazy third-party cross-check so the
  // verification badges reflect a real VerificationReport, not a placeholder.
  const req = useMemo(() => buildRequest(GENERAL_DAY_OBJECTIVE.id, 1, person, { sweeps: true }, civilOfIso(iso)), [person, iso]);
  const baseRes = useMemo(() => evaluateDecision(req), [req]);
  const [verified, setVerified] = useState<{ hash: string; result: DecisionResult } | null>(null);
  useEffect(() => {
    let cancelled = false;
    setVerified(null);
    (async () => {
      try {
        const mod = await import("../engine/verification/runVerification.ts");
        const almanac = mod.buildAlmanacData(req.window);
        const withAlmanac = evaluateDecision({ ...req, almanac });
        const report = await mod.verifyDecisionResult({ ...req, almanac }, withAlmanac, new Date().toISOString());
        const v = mod.applyVerificationReport(withAlmanac, report);
        if (!cancelled) setVerified({ hash: baseRes.meta.calculationHash, result: v });
      } catch {
        /* the base reading stands on its own */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [req]); // eslint-disable-line react-hooks/exhaustive-deps

  const res = verified && verified.hash === baseRes.meta.calculationHash ? verified.result : baseRes;
  const rec = res.allDays[0];
  const officer = officerPlain(rec.tongshu.officer);
  const god = dayGodPlain(rec.tongshu.dayGod);
  const taboo =
    rec.rulesFired.some((r) => r.code === "year_break") ? "歲破 — tradition marks 諸事不宜"
    : rec.rulesFired.some((r) => r.code === "four_departure") ? "四離 — a season-pivot eve (大事勿用)"
    : rec.rulesFired.some((r) => r.code === "four_severance") ? "四絕 — a season-pivot eve (大事勿用)"
    : null;
  const clash = rec.shenShaTags.filter((t) => t.code === "clash_day" || t.code === "clash_zodiac");

  return (
    <>
      <div className="page-head">
        <h2 className="page-title">{isToday ? "Today" : "Day view"}</h2>
        <div className="stepper">
          <button className="btn-ghost" style={{ width: "auto", padding: "4px 12px" }} aria-label="Previous day" onClick={() => nav(`/day/${addDaysIso(iso, -1)}`)}>‹</button>
          <b style={{ minWidth: 150, textAlign: "center", fontSize: 14 }}>{humanDate(rec.civil)}</b>
          <button className="btn-ghost" style={{ width: "auto", padding: "4px 12px" }} aria-label="Next day" onClick={() => nav(`/day/${addDaysIso(iso, 1)}`)}>›</button>
          {!isToday && <Link className="btn-text" to="/today">Today</Link>}
        </div>
      </div>

      <div className="card" style={{ padding: 18 }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
          <b style={{ fontSize: 15 }}>The day at a glance</b>
          <span style={{ fontSize: 20, fontFamily: "var(--serif-cjk)", color: "var(--ink)" }} title="Day pillar (日柱)">{rec.tongshu.dayGanzhi.hanzi}</span>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
          <span className="pill" title={officer.blurb}>{officer.label} <span className="faint">· {officer.secondary}</span></span>
          <span className="pill" title={god.blurb}>{god.label} <span className="faint">· {god.secondary}</span></span>
          {rec.tongshu.sanShaDirection !== "—" && (
            <span className="pill" title="三煞 (Three-Killings) direction — avoid facing it when breaking ground or moving in.">三煞: {rec.tongshu.sanShaDirection}</span>
          )}
          {taboo && <span className="pill danger">{taboo}</span>}
          {clash.map((c) => (
            <span key={c.code} className="pill danger" title={shenShaPlain(c.code).blurb}>{shenShaPlain(c.code).label}</span>
          ))}
        </div>

        {/* Auspicious / inauspicious personal stars (神煞) */}
        {rec.personalized && rec.shenShaTags.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <div className="section-title" style={{ marginBottom: 6 }}>Your stars today (神煞)</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {rec.shenShaTags.map((t) => {
                const g = shenShaPlain(t.code);
                const good = t.polarity === "good";
                const bad = t.polarity === "bad";
                return (
                  <span key={t.code} className={`pill ${bad ? "danger" : good ? "good" : ""}`} title={g.blurb}>
                    {good ? "★ " : bad ? "▽ " : "· "}{g.label} <span className="faint">{g.secondary}</span>
                  </span>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {chart ? (
        <DayInsights chart={chart} rec={rec} />
      ) : (
        <NeedsProfile what="see how this day tilts your career, wealth, relationships and wellbeing, plus your best hours" />
      )}

      <DayVerification
        rec={rec}
        report={res.meta.verification}
        conventionSeverity={res.meta.sensitivity?.convention.severity ?? null}
      />
    </>
  );
}
