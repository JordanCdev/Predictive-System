import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  CONVENTION_PRESETS,
  DayRecommendation,
  DecisionResult,
  MAX_WINDOW_DAYS,
  OBJECTIVES,
  WINDOW_DAYS,
  buildPeriodsReport,
  evaluateDecision,
  parseActivity,
  headlineVerdict,
  humanHourRange,
  objectiveById,
  objectivePlain,
  practicalBestHour,
  shortDate,
  verdictBand,
  windowPlain,
} from "../engine/index.ts";
import { PeriodsPanel } from "../ui/PeriodsPanel.tsx";
import { TodayCard } from "../ui/TodayCard.tsx";
import { DayInsights } from "../ui/DayInsights.tsx";
import { AskStep } from "../ui/AskStep.tsx";
import { Alternative, BestDayHero, RuledOutCard } from "../ui/BestDayHero.tsx";
import { CalendarMonth } from "../ui/CalendarMonth.tsx";
import { DayList, RuledOutDrawer } from "../ui/DayList.tsx";
import { VetoState } from "../ui/VetoState.tsx";
import { PersonalizeCard } from "../ui/PersonalizeCard.tsx";
import { ProfilePanel } from "../ui/ProfilePanel.tsx";
import { ChatPanel } from "../ui/ChatPanel.tsx";
import { Journal } from "../ui/Journal.tsx";
import { JournalEntry, entryId, isJournalFull, loadJournal, recordOutcome, removeEntry, updateNote, upsertEntry } from "../ui/journalStore.ts";
import { downloadReport } from "../ui/report.ts";
import { YourChart } from "../ui/YourChart.tsx";
import { useProfile } from "../ui/profile/ProfileContext.tsx";
import { useEntitlements } from "../ui/profile/EntitlementsContext.tsx";
import { UpgradePrompt } from "../ui/billing/UpgradePrompt.tsx";
import { DEFAULT_TZ, TODAY_ISO, buildRequest } from "../ui/shared.ts";

const WINDOW_LADDER = WINDOW_DAYS as readonly number[];

/** Up to 3 meaningfully-different lateral jumps, excluding the day currently viewed. */
function computeAlternatives(recs: DayRecommendation[], excludeIso: string): Alternative[] {
  if (recs.length < 2) return [];
  const pick = recs[0];
  const used = new Set([excludeIso]);
  const pool = () => recs.filter((r) => !used.has(r.isoDate));
  const alts: Alternative[] = [];

  const soonest =
    pool().filter((r) => r.recommendationScore >= 58).sort((a, b) => a.isoDate.localeCompare(b.isoDate))[0] ??
    pool().sort((a, b) => a.isoDate.localeCompare(b.isoDate))[0];
  if (soonest) {
    alts.push({ kind: "Soonest good day", rec: soonest });
    used.add(soonest.isoDate);
  }
  const weekend = pool().filter((r) => r.weekday === "Sat" || r.weekday === "Sun").sort((a, b) => b.recommendationScore - a.recommendationScore)[0];
  if (weekend) {
    alts.push({ kind: "Best weekend", rec: weekend });
    used.add(weekend.isoDate);
  }
  const certain = pool().sort((a, b) => b.confidence.recommendationConfidence - a.confidence.recommendationConfidence || b.recommendationScore - a.recommendationScore)[0];
  if (certain && certain.confidence.recommendationConfidence > pick.confidence.recommendationConfidence) {
    alts.push({ kind: "Most certain", rec: certain });
    used.add(certain.isoDate);
  }
  if (alts.length === 0) {
    const next = pool().sort((a, b) => b.recommendationScore - a.recommendationScore)[0];
    if (next) alts.push({ kind: "Next best", rec: next });
  }
  return alts.slice(0, 3);
}

export function DateFinderPage() {
  const { person, setPerson, birthCivil, currentAge, warnings, evaluate, evaluateDay } = useProfile();
  const { clamp, entitlement } = useEntitlements();

  const [objectiveId, setObjectiveId] = useState<string | null>(null);
  const [showJournalPrompt, setShowJournalPrompt] = useState(false);
  const [windowDays, setWindowDays] = useState(31);
  const [phase, setPhase] = useState<"ask" | "answer">("ask");
  const [selectedIso, setSelectedIso] = useState<string | null>(null);
  const [journal, setJournal] = useState<JournalEntry[]>(() => loadJournal());
  const heroRef = useRef<HTMLDivElement>(null);
  const pendingScroll = useRef(false);

  // Global top-bar search: /date-finder?q=… pre-selects the objective and opens
  // the reading, so a decision typed anywhere jumps straight to its best day.
  const [searchParams] = useSearchParams();
  const qParam = searchParams.get("q");
  useEffect(() => {
    if (!qParam) return;
    const a = parseActivity(qParam);
    if (a) {
      setObjectiveId(a.objective.id);
      setPhase("answer");
    }
  }, [qParam]);

  // The plan's horizon is enforced here, at the one place the window reaches the
  // engine — so no UI path (the chip row, `widen()`, a stale state, a shared URL)
  // can search further than the plan allows.
  const { days: effectiveWindow, capped: horizonCapped } = clamp(windowDays);
  // "Widen the search" must stop at whichever comes first: the engine's ceiling
  // or the plan's — otherwise the button promises days it won't return.
  const maxWindow = Math.min(MAX_WINDOW_DAYS, clamp(MAX_WINDOW_DAYS).days);

  const computed = useMemo(() => {
    if (!objectiveId) return null;
    const req = buildRequest(objectiveId, effectiveWindow, person);
    return { req, result: evaluateDecision(req) };
  }, [objectiveId, effectiveWindow, person]);

  const [enriched, setEnriched] = useState<{ baseHash: string; result: DecisionResult } | null>(null);
  const reqHash = computed?.result.meta.calculationHash;
  useEffect(() => {
    if (!computed) return;
    let cancelled = false;
    (async () => {
      try {
        const mod = await import("../engine/verification/runVerification.ts");
        const almanac = mod.buildAlmanacData(computed.req.window);
        const reqWithAlmanac = { ...computed.req, almanac };
        const withAlmanac = evaluateDecision(reqWithAlmanac);
        const report = await mod.verifyDecisionResult(reqWithAlmanac, withAlmanac, new Date().toISOString());
        const verified = mod.applyVerificationReport(withAlmanac, report);
        if (!cancelled) setEnriched({ baseHash: computed.result.meta.calculationHash, result: verified });
      } catch {
        /* enrichment is additive — the base result stands on its own */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reqHash]); // eslint-disable-line react-hooks/exhaustive-deps

  const result: DecisionResult | null = useMemo(() => {
    if (!computed) return null;
    if (enriched && enriched.baseHash === computed.result.meta.calculationHash) return enriched.result;
    return computed.result;
  }, [computed, enriched]);

  const hash = reqHash;
  useEffect(() => {
    if (!result) return;
    setSelectedIso(result.recommendations[0]?.isoDate ?? null);
    if (phase === "answer") window.scrollTo({ top: 0 });
  }, [hash]); // eslint-disable-line react-hooks/exhaustive-deps

  const selectDay = (iso: string) => {
    pendingScroll.current = true;
    setSelectedIso(iso);
  };
  useEffect(() => {
    if (!pendingScroll.current) return;
    pendingScroll.current = false;
    const el = heroRef.current;
    if (el && el.getBoundingClientRect().top < 0) el.scrollIntoView({ block: "start" });
  }, [selectedIso]);

  const openReading = (id: string, win: number) => {
    setObjectiveId(id);
    setWindowDays(win);
    setPhase("answer");
    window.scrollTo({ top: 0 });
  };
  const toAsk = () => {
    setPhase("ask");
    window.scrollTo({ top: 0 });
  };
  const toAnswer = () => {
    if (!objectiveId) return;
    setPhase("answer");
    window.scrollTo({ top: 0 });
  };

  if (phase === "ask" || !objectiveId || !result) {
    return (
      <AskStep
        objectives={OBJECTIVES}
        objectiveId={objectiveId}
        windowDays={windowDays}
        onObjective={setObjectiveId}
        onWindow={setWindowDays}
        onSubmit={toAnswer}
      />
    );
  }

  const objective = objectiveById(objectiveId);
  const meta = { ...result.meta, personalized: result.personalized };
  const recs = result.recommendations;
  const pick = recs[0] ?? null;
  const selectedRec = result.allDays.find((d) => d.isoDate === selectedIso) ?? pick;
  const alternatives = computeAlternatives(recs, selectedRec.isoDate);
  const todayRec = result.allDays.find((d) => d.isoDate === TODAY_ISO) ?? null;
  const selIndex = result.allDays.findIndex((d) => d.isoDate === selectedRec.isoDate);
  const stepDay = (delta: number) => {
    const next = result.allDays[selIndex + delta];
    if (next) selectDay(next.isoDate);
  };
  // The context `warnings` already includes fp.meta.boundaryWarnings + canonical
  // warnings; result.meta.boundaryWarnings is the same set, so use one (no dup).
  const chartWarnings = warnings;

  const widen = () => setWindowDays((d) => WINDOW_LADDER.find((w) => w > d) ?? WINDOW_LADDER[WINDOW_LADDER.length - 1]);

  const loggedId = entryId(objectiveId, selectedRec.isoDate);
  const isLogged = journal.some((e) => e.id === loggedId);
  const journalFull = isJournalFull(journal, entitlement.plan.limits.journalEntries, loggedId);
  const toggleLog = () => {
    if (isLogged) {
      setJournal(removeEntry(loggedId));
      return;
    }
    if (journalFull) {
      setShowJournalPrompt(true);
      return;
    }
    const ph = selectedRec.personalized ? practicalBestHour(selectedRec) : null;
    setJournal(
      upsertEntry({
        id: loggedId,
        objectiveId,
        objectiveLabel: objectivePlain(objectiveId).gerund,
        isoDate: selectedRec.isoDate,
        weekday: selectedRec.weekday,
        score: selectedRec.recommendationScore,
        band: verdictBand(selectedRec.recommendationScore).label,
        verdict: headlineVerdict(selectedRec, objective),
        bestHour: ph ? humanHourRange(ph.rangeLabel) : null,
        note: "",
        savedAt: Date.now(),
      }),
    );
  };

  const downloadCurrentReport = () => {
    const yearOutlook =
      result.subjectChart && birthCivil
        ? buildPeriodsReport({ chart: result.subjectChart, dayun: result.dayun, birth: birthCivil, targetYear: Number(TODAY_ISO.slice(0, 4)) }).year
        : null;
    downloadReport({ rec: selectedRec, objective, meta, chart: result.subjectChart, yearOutlook, generatedNote: `Generated ${TODAY_ISO}` });
  };

  const personalize = (
    <PersonalizeCard person={person} defaultTz={DEFAULT_TZ} presets={CONVENTION_PRESETS} onApply={setPerson} onClear={() => setPerson(null)} />
  );

  return (
    <>
      <div className="context-bar">
        <div className="ctx-text">
          <b>{objectivePlain(objectiveId).gerund}</b> <span className="ctx-sub">· {windowPlain(effectiveWindow)}</span>
          {pick && (
            <span className="ctx-sub">
              {" "}· best <b style={{ fontWeight: 600 }}>{shortDate(pick.civil)}</b> ({pick.recommendationScore})
            </span>
          )}
        </div>
        <button className="btn-text ctx-change" onClick={toAsk}>Change</button>
      </div>

      {/* Say so when the search was shortened — a silently truncated window would
          read as "there's nothing good further out", which isn't what happened. */}
      {horizonCapped && <UpgradePrompt feature="horizon_5y" compact />}

      {todayRec && <TodayCard chart={result.subjectChart} today={todayRec} />}

      {recs.length === 0 ? (
        <>
          <VetoState objective={objective} windowDays={effectiveWindow} onWiden={widen} canWiden={effectiveWindow < maxWindow} />
          <RuledOutDrawer rejected={result.rejected} objective={objective} />
          {personalize}
          {result.personalized && result.subjectChart && (
            <ProfilePanel chart={result.subjectChart} evaluate={evaluate} defaultWindowDays={effectiveWindow} todayIso={TODAY_ISO} personalized={result.personalized} onOpenReading={openReading} />
          )}
          {result.personalized && result.subjectChart && birthCivil && (
            <ChatPanel chart={result.subjectChart} dayun={result.dayun} birth={birthCivil} todayIso={TODAY_ISO} evaluate={evaluate} evaluateDay={evaluateDay} />
          )}
          {showJournalPrompt && <UpgradePrompt feature="journal_unlimited" compact />}
          <Journal entries={journal} todayIso={TODAY_ISO} onOpen={(id) => openReading(id, windowDays)} onRemove={(id) => setJournal(removeEntry(id))} onNote={(id, note) => setJournal(updateNote(id, note))} onOutcome={(id, o) => setJournal(recordOutcome(id, o))} />
        </>
      ) : (
        <>
          <div ref={heroRef}>
            {selectedRec.hardReject ? (
              <RuledOutCard rec={selectedRec} objective={objective} hash={meta.calculationHash} versions={meta.engineVersions} todayIso={TODAY_ISO} pickIso={pick?.isoDate ?? null} onBackToPick={() => selectDay(pick?.isoDate ?? "")} />
            ) : (
              <BestDayHero rec={selectedRec} objective={objective} meta={meta} todayIso={TODAY_ISO} alternatives={alternatives} onPickAlt={selectDay} isPick={selectedRec.isoDate === pick?.isoDate} onBackToPick={() => selectDay(pick?.isoDate ?? "")} logged={isLogged} onToggleLog={toggleLog} onDownloadReport={downloadCurrentReport} />
            )}
          </div>

          {result.subjectChart && <DayInsights chart={result.subjectChart} rec={selectedRec} />}

          {!result.personalized && personalize}

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
            <div className="section-title" style={{ marginBottom: 0 }}>Browse the window</div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <button className="btn-ghost" style={{ width: "auto", padding: "3px 11px" }} aria-label="Previous day" disabled={selIndex <= 0} onClick={() => stepDay(-1)}>‹</button>
              <b style={{ minWidth: 84, textAlign: "center", fontSize: 13 }}>{shortDate(selectedRec.civil)}</b>
              <button className="btn-ghost" style={{ width: "auto", padding: "3px 11px" }} aria-label="Next day" disabled={selIndex >= result.allDays.length - 1} onClick={() => stepDay(1)}>›</button>
            </div>
          </div>
          <CalendarMonth key={pick?.isoDate ?? "none"} allDays={result.allDays} pickIso={pick?.isoDate ?? null} selectedIso={selectedIso} onSelect={selectDay} />

          <DayList recs={recs} selectedIso={selectedIso} todayIso={TODAY_ISO} onSelect={selectDay} />
          <RuledOutDrawer rejected={result.rejected} objective={objective} />

          {result.personalized && personalize}

          {result.personalized && result.subjectChart && (
            <ProfilePanel chart={result.subjectChart} evaluate={evaluate} defaultWindowDays={effectiveWindow} todayIso={TODAY_ISO} personalized={result.personalized} onOpenReading={openReading} />
          )}
          {result.personalized && result.subjectChart && birthCivil && (
            <PeriodsPanel chart={result.subjectChart} dayun={result.dayun} birth={birthCivil} todayIso={TODAY_ISO} />
          )}
          {result.personalized && result.subjectChart && birthCivil && (
            <ChatPanel chart={result.subjectChart} dayun={result.dayun} birth={birthCivil} todayIso={TODAY_ISO} evaluate={evaluate} evaluateDay={evaluateDay} />
          )}
          {showJournalPrompt && <UpgradePrompt feature="journal_unlimited" compact />}
          <Journal entries={journal} todayIso={TODAY_ISO} onOpen={(id) => openReading(id, windowDays)} onRemove={(id) => setJournal(removeEntry(id))} onNote={(id, note) => setJournal(updateNote(id, note))} onOutcome={(id, o) => setJournal(recordOutcome(id, o))} />

          {result.personalized && result.subjectChart && (
            <YourChart chart={result.subjectChart} dayun={result.dayun} currentAge={currentAge} boundaryWarnings={chartWarnings} />
          )}
        </>
      )}
    </>
  );
}
