import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  BRANCHES,
  DecisionResult,
  GENERAL_DAY_OBJECTIVE,
  buildFourPillars,
  classicalHoursOfDay,
  dayGodPlain,
  evaluateDecision,
  humanDate,
  officerPlain,
  shenShaPlain,
} from "../engine/index.ts";
import { AlmanacPanel, useAlmanacDayDetail } from "../ui/AlmanacPanel.tsx";
import { DayHero } from "../ui/DayHero.tsx";
import { HexagramCard, useMeihuaLunarDate } from "../ui/HexagramCard.tsx";
import { FlyingStarCard } from "../ui/FlyingStarCard.tsx";
import { NineStarWheel } from "../ui/NineStarWheel.tsx";
import { WuTuCard } from "../ui/WuTuCard.tsx";
import { DayInsights, HourGrid } from "../ui/DayInsights.tsx";
import { PersonalDayCard } from "../ui/PersonalDayCard.tsx";
import { ReflectionCard } from "../ui/ReflectionCard.tsx";
import { TenGodsDayChart } from "../ui/TenGodsDayChart.tsx";
import { PriorityFitChip } from "../ui/PriorityFitChip.tsx";
import { useProfile } from "../ui/profile/ProfileContext.tsx";
import { BoundaryNotice } from "../ui/BoundaryNotice.tsx";
import { TODAY_ISO, addDaysIso, buildRequest, civilOfIso, isValidIso } from "../ui/shared.ts";
import { NeedsProfile } from "./NeedsProfile.tsx";
import { DayVerification } from "./PlannerBits.tsx";

/** Daily planner view. Personalised (a chart is set): PERSON-FIRST — the
 *  PersonalDayCard hero (their reading, verdict + score, priority fit, best
 *  hour), then gauges/hours/宜忌, then the calendar day itself folded into a
 *  collapsible 通勝 section. No chart: almanac-first, unchanged — pillar,
 *  officer, day-god, classical hour gods, and the setup prompt. Same numbers
 *  either way; only the order of presentation differs. Browses past and
 *  future via /day/:date. */
export function DailyPage() {
  const params = useParams();
  const nav = useNavigate();
  const iso = isValidIso(params.date) ? params.date : TODAY_ISO;
  const isToday = iso === TODAY_ISO;
  const { chart, person, activeStored, boundary, primaryPillars } = useProfile();

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

  // Person-first vs almanac-first. With a personalised reading the page leads
  // with the person and demotes the calendar; without one, almanac-first is the
  // honest order (there is no person to lead with).
  const personalized = !!chart && rec.personalized;
  const gz = rec.tongshu.dayGanzhi;
  const dayAnimal = BRANCHES[gz.branch.index].animal;
  const HOUR_GRID_ID = "day-hour-grid";

  // The lazily-loaded third-party almanac detail — the same data AlmanacPanel
  // shows, shared into DayInsights so the open hour can carry the per-hour
  // cross-check stars. Null until the verification chunk arrives (or offline).
  const almanacDetail = useAlmanacDayDetail(rec.civil);

  // The lunisolar date, from the same lazy verification chunk. 烏兔 keys off the
  // lunar month and day, so the card waits for this and simply isn't there
  // offline — the rest of the fold does not depend on it.
  const lunarDate = useMeihuaLunarDate(rec.civil);

  // The date's own year + month pillars (its 四柱 frame at local noon under the
  // request's convention) — display context for the DayHero, cheap and cached.
  const datePillars = useMemo(() => {
    const c = civilOfIso(iso);
    const fp = buildFourPillars(
      { year: c.year, month: c.month, day: c.day, hour: 12, minute: 0, tzOffsetMinutes: req.window.tzOffsetMinutes },
      req.convention,
    );
    return { year: fp.year, month: fp.month };
  }, [iso, req]);

  // "The day at a glance" pills — identical content in both modes; only where
  // they sit on the page differs.
  const glancePills = (
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
  );

  // Auspicious / inauspicious personal stars (神煞) — personal, so in the
  // personalised layout they stay above the almanac fold, not inside it.
  const starsBlock =
    rec.personalized && rec.shenShaTags.length > 0 ? (
      <>
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
      </>
    ) : null;

  const crossLinks = (
    <div style={{ display: "flex", gap: 14, margin: "10px 2px 12px", fontSize: 13 }}>
      <Link className="btn-text" to={`/week/${iso}`}>This week ›</Link>
      <Link className="btn-text" to={`/month/${iso.slice(0, 7)}`}>This month ›</Link>
      <Link className="btn-text" to={`/year/${iso.slice(0, 4)}`}>This year ›</Link>
    </div>
  );

  // ── The date's own classical calendars ────────────────────────────────────
  // Four traditional day-readings of the DATE — 卦氣 hexagram (+ a 梅花 cast),
  // 日家紫白 flying star, 日家奇門 nine-star direction wheel, 烏兔 day star.
  // Built ONCE and mounted in both branches so the set and the order are
  // identical whether or not a chart is set. All four are display-only:
  // nothing in here reaches recommendationScore or calculationHash.
  //
  // Spacing lives in `.day-facts` (src/styles.css), not in the cards — one
  // rhythm for the group instead of four different inline top margins.
  const dayFacts = (
    <section className="day-facts" aria-label="Classical calendar facts about this date">
      <div className="day-facts-intro">
        <span className="day-facts-eyebrow">Four classical calendars · 曆日</span>
        <p>
          Four traditions read this date on their own terms. They describe the <i>day</i> — not any person — and they
          were never a single system, so they do not always agree with one another. Shown for interest and study: none
          of them feeds the recommendation score.
        </p>
      </div>

      <HexagramCard civil={rec.civil} />
      <FlyingStarCard civil={rec.civil} />
      <NineStarWheel civil={rec.civil} />

      {/* The page carries TWO directional prescriptions — the 三煞 pill in "the
          day at a glance" and the nine-star ring — and they routinely point
          different ways. Saying so where a reader meets the second one is the
          honest move; inventing a rule that ranks them would not be. */}
      <div className="day-facts-note">
        <b>Two directional systems, not one.</b>{" "}
        {rec.tongshu.sanShaDirection !== "—" ?
          <>The 三煞 pill under &ldquo;the day at a glance&rdquo; marks <b>{rec.tongshu.sanShaDirection}</b> today.</>
        : <>The 三煞 pill under &ldquo;the day at a glance&rdquo; marks no direction today.</>}{" "}
        三煞 comes from the day&apos;s branch triad in the 通勝; the ring above comes from 日家奇門. They are separate
        lineages with separate rules, they frequently disagree about the same compass point, and neither one overrides
        the other. This app shows both and does not reconcile them — where they conflict, the classical texts leave the
        call to the practitioner.
      </div>

      <WuTuCard civil={rec.civil} lunar={lunarDate} />
    </section>
  );

  return (
    <>
      <div className="page-head">
        <h2 className="page-title">{isToday ? "Today" : "Day view"}</h2>
        <div className="stepper">
          <button className="btn-ghost" style={{ width: "auto", padding: "4px 12px" }} aria-label="Previous day" onClick={() => nav(`/day/${addDaysIso(iso, -1)}`)}>‹</button>
          <b style={{ minWidth: 150, textAlign: "center", fontSize: 14 }}>{humanDate(rec.civil)}</b>
          <button className="btn-ghost" style={{ width: "auto", padding: "4px 12px" }} aria-label="Next day" onClick={() => nav(`/day/${addDaysIso(iso, 1)}`)}>›</button>
          <input
            type="date"
            className="jump-input"
            value={iso}
            aria-label="Jump to a date"
            onChange={(e) => {
              if (isValidIso(e.target.value)) nav(`/day/${e.target.value}`);
            }}
          />
          {!isToday && <Link className="btn-text" to="/today">Today</Link>}
        </div>
      </div>

      {primaryPillars && <BoundaryNotice alternatives={boundary} primary={primaryPillars} compact />}

      {personalized && chart ? (
        <>
          {/* PERSON-FIRST (the Power Planner order): the person and their
              reading, then their gauges/hours/宜忌, then — folded — the
              calendar day itself. Presentation only; same engine numbers. */}
          <PersonalDayCard chart={chart} rec={rec} label={activeStored?.label ?? "You"} hourGridId={HOUR_GRID_ID} />

          <div id={HOUR_GRID_ID}>
            <DayInsights chart={chart} rec={rec} almanac={almanacDetail} />
          </div>

          {/* The personal Ten-Gods energy chart — which of THEIR gods this day
              wakes. Display-only; the explainer inside says so. */}
          <TenGodsDayChart chart={chart} dayGz={gz} />

          {starsBlock && (
            <div className="card" style={{ padding: 18, marginTop: 18 }}>{starsBlock}</div>
          )}

          {/* The calendar-day material, demoted. A native <details> keeps the
              fold keyboard- and screen-reader-accessible; the summary row shows
              pillar · animal · officer so nothing is hidden, just folded. */}
          <details className="almanac-fold">
            <summary>
              <b>The day itself (通勝 almanac)</b>
              <span className="almanac-fold-meta">
                <span style={{ fontFamily: "var(--serif-cjk)" }}>{gz.hanzi}</span> · Day of the {dayAnimal} · {officer.label}
              </span>
            </summary>
            <div className="almanac-fold-body">
              <DayHero rec={rec} quiet datePillars={datePillars} />
              <div>
                <div className="section-title" style={{ margin: "14px 0 0" }}>The day at a glance</div>
                {glancePills}
              </div>
              <AlmanacPanel civil={rec.civil} />
              {/* The four classical day-facts. They are properties of the
                  calendar day, not readings of the person, so they belong
                  inside the day's own fold rather than above the personal
                  reading. Same group, same order as the visitor branch. */}
              {dayFacts}
            </div>
          </details>

          {crossLinks}
        </>
      ) : (
        <>
          {/* ALMANAC-FIRST — the right order when there is no person to lead
              with. This is today's layout, unchanged. */}
          <DayHero rec={rec} datePillars={datePillars} />

          {/* A SEPARATE axis, never a modifier: what the user says they care about
              changes what we surface and in what order, never the classical score.
              Renders nothing at all when no priorities are set. */}
          {chart && <PriorityFitChip chart={chart} rec={rec} />}

          {crossLinks}

          <div className="card" style={{ padding: 18 }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
              <b style={{ fontSize: 15 }}>The day at a glance</b>
            </div>
            {glancePills}
            {starsBlock && <div style={{ marginTop: 12 }}>{starsBlock}</div>}
          </div>

          {chart ? (
            <DayInsights chart={chart} rec={rec} almanac={almanacDetail} />
          ) : (
            <>
              {/* No profile → the classical Tong Shu hour read: the 黃道/黑道 hour gods
                  (時辰吉凶), seeded by the day branch. The same for every visitor —
                  honest about being impersonal, free of charge, never gated. */}
              <div className="card" style={{ padding: 20, marginTop: 18 }}>
                <h3 style={{ margin: "0 0 4px", fontSize: 16, fontWeight: 600 }}>Hour by hour (時辰吉凶)</h3>
                <p style={{ margin: "0 0 12px", fontSize: 13, color: "var(--muted)", lineHeight: 1.5 }}>
                  The classical almanac's hour gods (黃道/黑道) for this day — the traditional Tong Shu read, identical for
                  everyone. Add your birth details for hours weighed against your own chart.
                </p>
                <HourGrid hours={classicalHoursOfDay(rec.tongshu.dayGanzhi)} bestBranch={null} />
              </div>
              <NeedsProfile what="see how this day tilts your career, wealth, relationships and wellbeing, plus your best hours" />
            </>
          )}

          <AlmanacPanel civil={rec.civil} />
          {/* The identical group, in the identical order — this branch has no
              fold, so it simply sits after the almanac panel. */}
          {dayFacts}
        </>
      )}

      {/* /today is where onboarding lands and where the nav's first tab points,
          but it only ever described the day — it never offered the product's
          actual promise ("one clear best day for the thing you're deciding").
          It terminated. This is the way onward. */}
      <div className="card next-step">
        <div>
          <b>Got something specific to time?</b>
          <p>
            This page reads {isToday ? "today" : "this day"} as it falls. To find the <i>best</i> day for a particular
            decision — signing, launching, marrying, moving — say what it is and the engine ranks a whole window for you.
          </p>
        </div>
        <div className="next-step-actions">
          <Link className="btn" style={{ width: "auto", textDecoration: "none" }} to="/date-finder">Find my best day ›</Link>
          {chart && (
            <Link className="btn-ghost" style={{ width: "auto", padding: "8px 16px", textDecoration: "none" }} to="/chat">
              Ask the advisor ›
            </Link>
          )}
        </div>
      </div>

      {/* The day's reflection prompt (Agent C's card) — after the main content
          in BOTH branches (the tail below is shared), before verification. */}
      <ReflectionCard iso={iso} />

      <DayVerification
        rec={rec}
        report={res.meta.verification}
        conventionSeverity={res.meta.sensitivity?.convention.severity ?? null}
      />
    </>
  );
}
