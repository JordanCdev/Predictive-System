import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CanonicalBirth,
  CONVENTION_PRESETS,
  DayRecommendation,
  DecisionRequest,
  DecisionResult,
  MAX_WINDOW_DAYS,
  OBJECTIVES,
  WINDOW_DAYS,
  ZIPING_DEFAULT,
  buildPeriodsReport,
  canonicalizeBirth,
  evaluateDecision,
  headlineVerdict,
  humanHourRange,
  objectiveById,
  objectivePlain,
  practicalBestHour,
  shortDate,
  verdictBand,
  windowPlain,
} from "./engine/index.ts";
import { PeriodsPanel } from "./ui/PeriodsPanel.tsx";
import { TodayCard } from "./ui/TodayCard.tsx";
import { DayInsights } from "./ui/DayInsights.tsx";
import { AskStep } from "./ui/AskStep.tsx";
import { Alternative, BestDayHero, RuledOutCard } from "./ui/BestDayHero.tsx";
import { CalendarMonth } from "./ui/CalendarMonth.tsx";
import { DayList, RuledOutDrawer } from "./ui/DayList.tsx";
import { VetoState } from "./ui/VetoState.tsx";
import { PersonalizeCard, Person } from "./ui/PersonalizeCard.tsx";
import { ProfilePanel } from "./ui/ProfilePanel.tsx";
import { ChatPanel } from "./ui/ChatPanel.tsx";
import { Journal } from "./ui/Journal.tsx";
import { JournalEntry, entryId, loadJournal, removeEntry, updateNote, upsertEntry } from "./ui/journalStore.ts";
import { downloadReport } from "./ui/report.ts";
import { YourChart } from "./ui/YourChart.tsx";
import { HowItWorks } from "./ui/HowItWorks.tsx";

// Shared widen ladder — matches the Ask-step window chips.
const WINDOW_LADDER = WINDOW_DAYS as readonly number[];

// Captured once at load. The engine still receives explicit values → stays deterministic.
const NOW = new Date();
const pad = (n: number) => String(n).padStart(2, "0");
const TODAY_CIVIL = { year: NOW.getFullYear(), month: NOW.getMonth() + 1, day: NOW.getDate() };
const TODAY_ISO = `${TODAY_CIVIL.year}-${pad(TODAY_CIVIL.month)}-${pad(TODAY_CIVIL.day)}`;
const DEFAULT_TZ = -NOW.getTimezoneOffset();

/** Canonicalise a UI person into the engine's normalised birth object, applying
 *  the location-precision policy (solar hour basis without longitude → civil
 *  clock + warning). Returns null when there is no person or the date is bad. */
function canonicalFor(person: Person | null): CanonicalBirth | null {
  if (!person) return null;
  const requested = CONVENTION_PRESETS.find((c) => c.id === person.conventionId) ?? ZIPING_DEFAULT;
  const canonical = canonicalizeBirth(
    {
      dateOfBirth: person.birthDate,
      localBirthTime: person.timeCertainty === "hour_unknown" ? undefined : person.birthTime,
      tzOffsetMinutes: person.tzOffset,
      birthplace: person.birthCity,
      longitudeEast: person.longitudeEast,
      timeAccuracy: person.timeCertainty,
      sex: person.sex,
    },
    requested,
  );
  return canonical.valid ? canonical : null;
}

function buildRequest(
  objectiveId: string,
  windowDays: number,
  person: Person | null,
  options?: DecisionRequest["options"],
  start: { year: number; month: number; day: number } = TODAY_CIVIL,
): DecisionRequest {
  const objective = objectiveById(objectiveId);
  const tz = person ? person.tzOffset : DEFAULT_TZ;
  const window = { start, days: windowDays, tzOffsetMinutes: tz };
  const canonical = canonicalFor(person);
  if (!person || !canonical || !canonical.moment) {
    return { convention: ZIPING_DEFAULT, objective, window, options };
  }
  return {
    birth: canonical.moment,
    sex: person.sex,
    convention: canonical.convention,
    objective,
    window,
    options,
  };
}

function ageOn(birthDate: string): number | null {
  const [y, m, d] = birthDate.split("-").map(Number);
  if (!y) return null;
  const ms = Date.UTC(TODAY_CIVIL.year, TODAY_CIVIL.month - 1, TODAY_CIVIL.day) - Date.UTC(y, m - 1, d);
  return ms / (365.25 * 86400000);
}

function birthCivilOf(birthDate: string): { year: number; month: number; day: number } | null {
  const [y, m, d] = birthDate.split("-").map(Number);
  if (![y, m, d].every(Number.isFinite)) return null;
  return { year: y, month: m, day: d };
}

/** Up to 3 meaningfully-different lateral jumps, excluding the day currently viewed. */
function computeAlternatives(recs: DayRecommendation[], excludeIso: string): Alternative[] {
  if (recs.length < 2) return [];
  const pick = recs[0];
  const used = new Set([excludeIso]);
  const pool = () => recs.filter((r) => !used.has(r.isoDate));
  const alts: Alternative[] = [];

  // Soonest good day (>=58); if the window is mediocre, fall back to the soonest overall.
  const soonest =
    pool()
      .filter((r) => r.recommendationScore >= 58)
      .sort((a, b) => a.isoDate.localeCompare(b.isoDate))[0] ??
    pool().sort((a, b) => a.isoDate.localeCompare(b.isoDate))[0];
  if (soonest) {
    alts.push({ kind: "Soonest good day", rec: soonest });
    used.add(soonest.isoDate);
  }

  const weekend = pool()
    .filter((r) => r.weekday === "Sat" || r.weekday === "Sun")
    .sort((a, b) => b.recommendationScore - a.recommendationScore)[0];
  if (weekend) {
    alts.push({ kind: "Best weekend", rec: weekend });
    used.add(weekend.isoDate);
  }

  const certain = pool().sort((a, b) => b.confidence.overall - a.confidence.overall || b.recommendationScore - a.recommendationScore)[0];
  if (certain && certain.confidence.overall > pick.confidence.overall) {
    alts.push({ kind: "Most certain", rec: certain });
    used.add(certain.isoDate);
  }

  // Always offer at least one lateral jump when more days exist.
  if (alts.length === 0) {
    const next = pool().sort((a, b) => b.recommendationScore - a.recommendationScore)[0];
    if (next) alts.push({ kind: "Next best", rec: next });
  }
  return alts.slice(0, 3);
}

export function App() {
  const [objectiveId, setObjectiveId] = useState<string | null>(null);
  const [windowDays, setWindowDays] = useState(31);
  const [phase, setPhase] = useState<"ask" | "answer">("ask");
  const [person, setPerson] = useState<Person | null>(null);
  const [selectedIso, setSelectedIso] = useState<string | null>(null);
  const [journal, setJournal] = useState<JournalEntry[]>(() => loadJournal());
  const heroRef = useRef<HTMLDivElement>(null);
  const pendingScroll = useRef(false);

  const computed = useMemo(() => {
    if (!objectiveId) return null;
    const req = buildRequest(objectiveId, windowDays, person);
    return { req, result: evaluateDecision(req) };
  }, [objectiveId, windowDays, person]);

  // Enrichment pass, loaded lazily so lunar-javascript never touches the main
  // bundle or the deterministic base render. Two steps, one chunk:
  //   1. inject the mainstream-almanac 宜忌 and re-rank (the accuracy signal);
  //   2. cross-check the enriched result against lunar-javascript + HKO.
  // The base result shows instantly; this refines it when it lands. Keyed by the
  // BASE calculationHash (the enriched result carries a different hash).
  const [enriched, setEnriched] = useState<{ baseHash: string; result: DecisionResult } | null>(null);
  const reqHash = computed?.result.meta.calculationHash;
  useEffect(() => {
    if (!computed) return;
    let cancelled = false;
    (async () => {
      try {
        const mod = await import("./engine/verification/runVerification.ts");
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

  // When the computation changes (new objective/window/birth), focus the new top pick
  // and bring the freshly computed answer back into view.
  const hash = reqHash;
  useEffect(() => {
    if (!result) return;
    setSelectedIso(result.recommendations[0]?.isoDate ?? null);
    if (phase === "answer") window.scrollTo({ top: 0 });
  }, [hash]); // eslint-disable-line react-hooks/exhaustive-deps

  // Browsing a non-pick day updates the hero (above the fold) — pull it into view.
  const selectDay = (iso: string) => {
    pendingScroll.current = true;
    setSelectedIso(iso);
  };
  // Runs after the DOM commits (reliable, unlike rAF). Only fires on an explicit
  // selection, and only when the hero has scrolled out of view above the fold.
  useEffect(() => {
    if (!pendingScroll.current) return;
    pendingScroll.current = false;
    const el = heroRef.current;
    if (el && el.getBoundingClientRect().top < 0) el.scrollIntoView({ block: "start" });
  }, [selectedIso]);
  // Stable per-person evaluator the profile panel uses to score other objectives
  // and answer typed questions — same engine, same determinism. Sweeps are
  // skipped in this bulk path (the panel runs many evaluations; the headline
  // reading keeps them on).
  const evaluate = useCallback(
    (id: string, win: number) => evaluateDecision(buildRequest(id, win, person, { sweeps: false })),
    [person],
  );
  // Evaluate one named calendar day (a window of 1) — used by the AI chat's
  // evaluate_specific_day tool so it can read any date, not just the window.
  const evaluateDay = useCallback(
    (id: string, iso: string) => {
      const [y, m, d] = iso.split("-").map(Number);
      return evaluateDecision(buildRequest(id, 1, person, { sweeps: false }, { year: y, month: m, day: d }));
    },
    [person],
  );
  // Jump from a recommendation / Q&A answer straight into the full reading.
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
      <div className="app">
        <Masthead />
        <AskStep
          objectives={OBJECTIVES}
          objectiveId={objectiveId}
          windowDays={windowDays}
          onObjective={setObjectiveId}
          onWindow={setWindowDays}
          onSubmit={toAnswer}
        />
      </div>
    );
  }

  const objective = objectiveById(objectiveId);
  const meta = { ...result.meta, personalized: result.personalized };
  const recs = result.recommendations;
  const pick = recs[0] ?? null;
  const selectedRec = result.allDays.find((d) => d.isoDate === selectedIso) ?? pick;
  const alternatives = computeAlternatives(recs, selectedRec.isoDate);
  // Today's already-computed window day — powers the "now" snapshot card.
  const todayRec = result.allDays.find((d) => d.isoDate === TODAY_ISO) ?? null;
  // Day-stepper: move ±1 day within the computed window (chronological).
  const selIndex = result.allDays.findIndex((d) => d.isoDate === selectedRec.isoDate);
  const stepDay = (delta: number) => {
    const next = result.allDays[selIndex + delta];
    if (next) selectDay(next.isoDate);
  };
  const currentAge = person ? ageOn(person.birthDate) : null;
  const birthCivil = person ? birthCivilOf(person.birthDate) : null;
  // Request-layer notices (e.g. solar time downgraded to civil clock for a
  // missing birthplace longitude) — shown alongside the chart's own warnings.
  const canonicalWarnings = canonicalFor(person)?.warnings ?? [];
  const chartWarnings = [...result.meta.boundaryWarnings, ...canonicalWarnings];

  const widen = () =>
    setWindowDays((d) => WINDOW_LADDER.find((w) => w > d) ?? WINDOW_LADDER[WINDOW_LADDER.length - 1]);

  // Decision journal — log/unlog the currently-viewed day (a self-contained snapshot).
  const loggedId = entryId(objectiveId, selectedRec.isoDate);
  const isLogged = journal.some((e) => e.id === loggedId);
  const toggleLog = () => {
    if (isLogged) {
      setJournal(removeEntry(loggedId));
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

  // Shareable report — a self-contained HTML download of the current reading.
  const downloadCurrentReport = () => {
    const yearOutlook =
      result.subjectChart && birthCivil
        ? buildPeriodsReport({ chart: result.subjectChart, dayun: result.dayun, birth: birthCivil, targetYear: Number(TODAY_ISO.slice(0, 4)) }).year
        : null;
    downloadReport({ rec: selectedRec, objective, meta, chart: result.subjectChart, yearOutlook, generatedNote: `Generated ${TODAY_ISO}` });
  };

  return (
    <div className="app">
      <Masthead />

      <div className="context-bar">
        <div className="ctx-text">
          <b>{objectivePlain(objectiveId).gerund}</b>{" "}
          <span className="ctx-sub">· {windowPlain(windowDays)}</span>
          {pick && (
            <span className="ctx-sub">
              {" "}
              · best <b style={{ fontWeight: 600 }}>{shortDate(pick.civil)}</b> ({pick.recommendationScore})
            </span>
          )}
        </div>
        <button className="btn-text ctx-change" onClick={toAsk}>
          Change
        </button>
      </div>

      {todayRec && <TodayCard chart={result.subjectChart} today={todayRec} />}

      {recs.length === 0 ? (
        <>
          <VetoState objective={objective} windowDays={windowDays} onWiden={widen} canWiden={windowDays < MAX_WINDOW_DAYS} />
          <RuledOutDrawer rejected={result.rejected} objective={objective} />
          <PersonalizeCard
            person={person}
            defaultTz={DEFAULT_TZ}
            presets={CONVENTION_PRESETS}
            onApply={setPerson}
            onClear={() => setPerson(null)}
          />
          {result.personalized && result.subjectChart && (
            <ProfilePanel
              chart={result.subjectChart}
              evaluate={evaluate}
              defaultWindowDays={windowDays}
              todayIso={TODAY_ISO}
              personalized={result.personalized}
              onOpenReading={openReading}
            />
          )}
          {result.personalized && result.subjectChart && birthCivil && (
            <ChatPanel
              chart={result.subjectChart}
              dayun={result.dayun}
              birth={birthCivil}
              todayIso={TODAY_ISO}
              evaluate={evaluate}
              evaluateDay={evaluateDay}
            />
          )}
          <Journal
            entries={journal}
            todayIso={TODAY_ISO}
            onOpen={(id) => openReading(id, windowDays)}
            onRemove={(id) => setJournal(removeEntry(id))}
            onNote={(id, note) => setJournal(updateNote(id, note))}
          />
        </>
      ) : (
        <>
          <div ref={heroRef}>
            {selectedRec.hardReject ? (
              <RuledOutCard
                rec={selectedRec}
                objective={objective}
                hash={meta.calculationHash}
                versions={meta.engineVersions}
                todayIso={TODAY_ISO}
                pickIso={pick?.isoDate ?? null}
                onBackToPick={() => selectDay(pick?.isoDate ?? "")}
              />
            ) : (
              <BestDayHero
                rec={selectedRec}
                objective={objective}
                meta={meta}
                todayIso={TODAY_ISO}
                alternatives={alternatives}
                onPickAlt={selectDay}
                isPick={selectedRec.isoDate === pick?.isoDate}
                onBackToPick={() => selectDay(pick?.isoDate ?? "")}
                logged={isLogged}
                onToggleLog={toggleLog}
                onDownloadReport={downloadCurrentReport}
              />
            )}
          </div>

          {result.subjectChart && <DayInsights chart={result.subjectChart} rec={selectedRec} />}

          {/* Upsell sits right under the hero when not yet personalized (the hero invites it);
              once personalized, the "tailored" summary lives lower, next to the chart. */}
          {!result.personalized && (
            <PersonalizeCard
              person={person}
              defaultTz={DEFAULT_TZ}
              presets={CONVENTION_PRESETS}
              onApply={setPerson}
              onClear={() => setPerson(null)}
            />
          )}

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
            <div className="section-title" style={{ marginBottom: 0 }}>Browse the window</div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <button className="btn-ghost" style={{ width: "auto", padding: "3px 11px" }} aria-label="Previous day" disabled={selIndex <= 0} onClick={() => stepDay(-1)}>‹</button>
              <b style={{ minWidth: 84, textAlign: "center", fontSize: 13 }}>{shortDate(selectedRec.civil)}</b>
              <button className="btn-ghost" style={{ width: "auto", padding: "3px 11px" }} aria-label="Next day" disabled={selIndex >= result.allDays.length - 1} onClick={() => stepDay(1)}>›</button>
            </div>
          </div>
          <CalendarMonth
            key={pick?.isoDate ?? "none"}
            allDays={result.allDays}
            pickIso={pick?.isoDate ?? null}
            selectedIso={selectedIso}
            onSelect={selectDay}
          />

          <DayList recs={recs} selectedIso={selectedIso} todayIso={TODAY_ISO} onSelect={selectDay} />
          <RuledOutDrawer rejected={result.rejected} objective={objective} />

          {result.personalized && (
            <PersonalizeCard
              person={person}
              defaultTz={DEFAULT_TZ}
              presets={CONVENTION_PRESETS}
              onApply={setPerson}
              onClear={() => setPerson(null)}
            />
          )}

          {result.personalized && result.subjectChart && (
            <ProfilePanel
              chart={result.subjectChart}
              evaluate={evaluate}
              defaultWindowDays={windowDays}
              todayIso={TODAY_ISO}
              personalized={result.personalized}
              onOpenReading={openReading}
            />
          )}

          {result.personalized && result.subjectChart && birthCivil && (
            <PeriodsPanel
              chart={result.subjectChart}
              dayun={result.dayun}
              birth={birthCivil}
              todayIso={TODAY_ISO}
            />
          )}

          {result.personalized && result.subjectChart && birthCivil && (
            <ChatPanel
              chart={result.subjectChart}
              dayun={result.dayun}
              birth={birthCivil}
              todayIso={TODAY_ISO}
              evaluate={evaluate}
              evaluateDay={evaluateDay}
            />
          )}

          <Journal
            entries={journal}
            todayIso={TODAY_ISO}
            onOpen={(id) => openReading(id, windowDays)}
            onRemove={(id) => setJournal(removeEntry(id))}
            onNote={(id, note) => setJournal(updateNote(id, note))}
          />

          {result.personalized && result.subjectChart && (
            <YourChart
              chart={result.subjectChart}
              dayun={result.dayun}
              currentAge={currentAge}
              boundaryWarnings={chartWarnings}
            />
          )}
        </>
      )}

      <HowItWorks />
      <Footer />
    </div>
  );
}

function Masthead() {
  return (
    <div className="masthead">
      <div className="seal">易</div>
      <div className="wordmark">
        Wéi · Decision Timing
        <span className="sub">Good days for big decisions — and exactly why.</span>
      </div>
    </div>
  );
}

function Footer() {
  return (
    <div className="foot">
      A transparent decision-support tool grounded in classical Chinese metaphysics (BaZi &amp; Tong Shu day selection) plus
      astronomical solar-term calculation. Confidence reflects how well-sourced and reproducible a reading is — not the odds
      any outcome occurs. Different masters legitimately disagree; we show the conflicts. One input among many — use your own
      judgement too.
    </div>
  );
}
