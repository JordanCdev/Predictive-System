import { useState } from "react";
import {
  DayRecommendation,
  DecisionResult,
  Objective,
  Versions,
  actionGuidance,
  conflictSentence,
  headlineVerdict,
  humanDate,
  humanHourRange,
  practicalBestHour,
  relativeDay,
  shortDate,
  vetoExplain,
} from "../engine/index.ts";
import { ConfidenceChip, ConfidencePanel, GoodMeter } from "./meters.tsx";
import { ReasoningDossier } from "./ReasoningDossier.tsx";
import { downloadICS } from "./ics.ts";
import { scoreColor } from "./format.ts";

export interface Alternative {
  kind: string;
  rec: DayRecommendation;
}

export function BestDayHero({
  rec,
  objective,
  meta,
  todayIso,
  alternatives,
  onPickAlt,
  isPick,
  onBackToPick,
}: {
  rec: DayRecommendation;
  objective: Objective;
  meta: DecisionResult["meta"] & { personalized: boolean };
  todayIso: string;
  alternatives: Alternative[];
  onPickAlt: (iso: string) => void;
  isPick: boolean;
  onBackToPick?: () => void;
}) {
  const [confOpen, setConfOpen] = useState(false);
  const conflict = rec.conflicts[0];

  return (
    <div className="card hero">
      {!isPick && onBackToPick && (
        <button className="btn-text" style={{ marginBottom: 6, paddingLeft: 0 }} onClick={onBackToPick}>
          ‹ Back to our top pick
        </button>
      )}
      <div className="rel">{isPick ? "Our pick · " : ""}{relativeDay(rec.isoDate, todayIso)}</div>
      <h2 className="date">{humanDate(rec.civil)}</h2>
      <p className="verdict">{headlineVerdict(rec, objective)}</p>

      <div className="meters">
        <GoodMeter score={rec.finalScore} />
        <div className="meter-divider" />
        <ConfidenceChip
          confidence={rec.confidence}
          personalized={meta.personalized}
          open={confOpen}
          onToggle={() => setConfOpen((o) => !o)}
        />
      </div>
      {confOpen && <ConfidencePanel confidence={rec.confidence} personalized={meta.personalized} />}

      {rec.personalized && practicalBestHour(rec) && (
        <div className="besthour">
          <span className="ico" aria-hidden="true">◷</span>
          Best window&nbsp;<b>{humanHourRange(practicalBestHour(rec)!.rangeLabel)}</b>
        </div>
      )}

      {conflict && (
        <div className="conflict-banner">
          <span className="ico" aria-hidden="true">⚠</span>
          <span>
            <b>The traditions disagree a little here.</b> {conflictSentence(conflict)}
            {rec.conflicts.length > 1 && ` (and ${rec.conflicts.length - 1} more — see the full reasoning).`}
          </span>
        </div>
      )}

      <div className="todo">
        <div className="todo-label">What to do</div>
        <ul className="todo-list">
          {actionGuidance(rec, objective).map((t, i) => (
            <li key={i}>{t}</li>
          ))}
        </ul>
        <button className="btn-ghost cal-add" onClick={() => downloadICS(rec, objective)}>
          <span aria-hidden="true">＋</span> Add to calendar
        </button>
      </div>

      {alternatives.length > 0 && (
        <div className="alts">
          <div className="alts-label">Other good days</div>
          <div className="alts-row">
            {alternatives.map((alt) => (
              <button className="alt-chip" key={alt.kind} onClick={() => onPickAlt(alt.rec.isoDate)}>
                <span className="kind">{alt.kind}</span>
                <span className="when">{shortDate(alt.rec.civil)}</span>
                <span className="meta">
                  <span className="dot" style={{ background: scoreColor(alt.rec.finalScore) }} />
                  {relativeDay(alt.rec.isoDate, todayIso)} · {alt.rec.finalScore}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      <ReasoningDossier rec={rec} objective={objective} hash={meta.calculationHash} versions={meta.engineVersions} />
    </div>
  );
}

/** Shown when a browsed/calendar day was hard-vetoed — reassuring, not a dead end. */
export function RuledOutCard({
  rec,
  objective,
  hash,
  versions,
  todayIso,
  pickIso,
  onBackToPick,
}: {
  rec: DayRecommendation;
  objective: Objective;
  hash: string;
  versions: Versions;
  todayIso: string;
  pickIso: string | null;
  onBackToPick?: () => void;
}) {
  return (
    <div className="card hero">
      <div className="rel" style={{ color: "var(--cinnabar)" }}>
        Ruled out · {relativeDay(rec.isoDate, todayIso)}
      </div>
      <h2 className="date">{humanDate(rec.civil)}</h2>
      <p className="verdict">{vetoExplain(rec, objective)}</p>
      {pickIso && onBackToPick && (
        <button className="btn" style={{ marginTop: 18, maxWidth: 280 }} onClick={onBackToPick}>
          See our top pick instead
        </button>
      )}
      <ReasoningDossier rec={rec} objective={objective} hash={hash} versions={versions} />
    </div>
  );
}
