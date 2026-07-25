import { useCallback, useMemo, useRef, useState } from "react";
import { useEntitlements } from "./profile/EntitlementsContext.tsx";
import {
  AdvisorAnswer,
  BaziChart,
  DayRecommendation,
  DecisionResult,
  ObjectiveFit,
  analyzeProfile,
  composeProfileAnswer,
  composeTimingAnswer,
  composeUnknownAnswer,
  objectiveById,
  objectivePlain,
  parseAdvisorQuery,
  relativeDay,
  shortDate,
} from "../engine/index.ts";
import { scoreColor, scoreTextColor } from "./format.ts";

interface Resolved {
  fit: ObjectiveFit;
  best: DayRecommendation | null;
}

interface Exchange {
  id: number;
  question: string;
  answer: AdvisorAnswer;
}

/** Qualitative label for a static chart-suitability score (distinct wording from
 *  day scores so the two never read as the same number). */
function fitLabel(fit: number): { word: string; cls: string } {
  if (fit >= 74) return { word: "Strong fit", cls: "f-strong" };
  if (fit >= 58) return { word: "Good fit", cls: "f-good" };
  if (fit >= 45) return { word: "Fair fit", cls: "f-fair" };
  return { word: "Demanding", cls: "f-weak" };
}

export function ProfilePanel({
  chart,
  evaluate,
  defaultWindowDays,
  todayIso,
  personalized,
  onOpenReading,
}: {
  chart: BaziChart;
  evaluate: (objectiveId: string, windowDays: number) => DecisionResult;
  defaultWindowDays: number;
  todayIso: string;
  personalized: boolean;
  onOpenReading: (objectiveId: string, windowDays: number) => void;
}) {
  const { clamp } = useEntitlements();
  const profile = useMemo(() => analyzeProfile(chart), [chart]);

  // Best day for each top recommendation, scanned over the chosen horizon.
  const recs = useMemo<Resolved[]>(
    () =>
      profile.top.map((fit) => {
        const r = evaluate(fit.objectiveId, defaultWindowDays);
        return { fit, best: r.recommendations[0] ?? null };
      }),
    [profile, evaluate, defaultWindowDays],
  );

  const [query, setQuery] = useState("");
  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const nextId = useRef(1);

  const ask = useCallback(
    (raw: string) => {
      const q = raw.trim();
      if (!q) return;
      const intent = parseAdvisorQuery(q);
      let answer: AdvisorAnswer;
      if (intent.kind === "timing" && intent.objectiveId) {
        // Describe the window actually searched: the plan clamp caps length,
        // so a free user asking about "next year" must be told the truth.
        const { days: win, capped } = clamp(intent.windowDays ?? defaultWindowDays);
        const result = evaluate(intent.objectiveId, win);
        answer = composeTimingAnswer(objectiveById(intent.objectiveId), result, todayIso, win);
        if (capped) {
          answer = {
            ...answer,
            paragraphs: [...answer.paragraphs, `Searched the next ${win} days — your plan's horizon. A Pro plan searches up to five years out.`],
          };
        }
      } else if (intent.kind === "profile") {
        answer = composeProfileAnswer(profile);
      } else {
        answer = composeUnknownAnswer(profile);
      }
      setExchanges((prev) => [...prev, { id: nextId.current++, question: q, answer }]);
      setQuery("");
    },
    [defaultWindowDays, evaluate, profile, todayIso, clamp],
  );

  return (
    <div className="card profile-panel">
      <div className="pp-head">
        <span className="seal sm" aria-hidden="true">命</span>
        <div>
          <h3>Your profile &amp; best moves</h3>
          <p className="pp-lede">{profile.headline}</p>
        </div>
      </div>

      {(profile.strengths.length > 0 || profile.cautions.length > 0) && (
        <div className="pp-traits">
          {profile.strengths.map((s) => (
            <span className="trait pos" key={`s-${s}`}>
              <span aria-hidden="true">↑</span> {s}
            </span>
          ))}
          {profile.cautions.map((c) => (
            <span className="trait neg" key={`c-${c}`}>
              <span aria-hidden="true">↓</span> {c}
            </span>
          ))}
        </div>
      )}

      <div className="section-title" style={{ marginTop: 16 }}>
        Top moves for your chart
      </div>
      <div className="rec-list">
        {recs.map(({ fit, best }) => {
          const op = objectivePlain(fit.objectiveId);
          const obj = objectiveById(fit.objectiveId);
          const fl = fitLabel(fit.fit);
          return (
            <div className="rec-card" key={fit.objectiveId}>
              <div className="rec-top">
                <span className="rec-emoji" aria-hidden="true">{obj.emoji}</span>
                <span className="rec-name">{op.gerund}</span>
                <span className={`fit-badge ${fl.cls}`}>{fl.word}</span>
              </div>
              <div className="fit-bar" aria-hidden="true">
                <span className="fit-fill" style={{ width: `${fit.fit}%`, background: scoreColor(fit.fit) }} />
              </div>
              <p className="rec-reason">{fit.reason}</p>
              {best ? (
                <button className="rec-day" onClick={() => onOpenReading(fit.objectiveId, defaultWindowDays)}>
                  <span className="band-dot" style={{ background: scoreColor(best.recommendationScore) }} />
                  <span className="rec-day-main">
                    Best day: <b>{shortDate(best.civil)}</b> <span className="muted">· {relativeDay(best.isoDate, todayIso)}</span>
                  </span>
                  <span className="rec-day-score" style={{ color: scoreTextColor(best.recommendationScore) }}>
                    {best.recommendationScore}
                  </span>
                </button>
              ) : (
                <button className="rec-day empty" onClick={() => onOpenReading(fit.objectiveId, defaultWindowDays)}>
                  No clear day in this window — open to widen the search ›
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* The rest of the 11-objective ranking — every decision type, weakest last,
          each with its honest reason. Fit transparency is never gated. */}
      {profile.fits.length > profile.top.length && (
        <>
          <div className="section-title" style={{ marginTop: 18 }}>
            The rest of the ranking — weakest last
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {profile.fits.slice(profile.top.length).map((fit) => {
              const op = objectivePlain(fit.objectiveId);
              const obj = objectiveById(fit.objectiveId);
              const fl = fitLabel(fit.fit);
              return (
                <button
                  key={fit.objectiveId}
                  className="rec-day"
                  style={{ display: "block", textAlign: "left", width: "100%" }}
                  onClick={() => onOpenReading(fit.objectiveId, defaultWindowDays)}
                >
                  <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span aria-hidden="true">{obj.emoji}</span>
                    <span style={{ fontWeight: 600, fontSize: 13.5 }}>{op.gerund}</span>
                    <span className={`fit-badge ${fl.cls}`} style={{ marginLeft: "auto" }}>
                      {fl.word}
                    </span>
                  </span>
                  <span className="fit-bar" aria-hidden="true" style={{ display: "block", marginTop: 5 }}>
                    <span className="fit-fill" style={{ width: `${fit.fit}%`, background: scoreColor(fit.fit) }} />
                  </span>
                  <span className="rec-reason" style={{ display: "block", marginTop: 4 }}>{fit.reason}</span>
                </button>
              );
            })}
          </div>
          <div className="ask-note" style={{ marginTop: 8 }}>
            A “demanding” fit isn't a prohibition — it means this kind of move leans on energies your chart carries less easily, so
            the day you pick matters more. Open any of them to find it.
          </div>
        </>
      )}

      {/* Custom Q&A — the app responds deterministically. */}
      <div className="section-title" style={{ marginTop: 18 }}>
        Ask about your timing
      </div>
      <div className="qa-thread">
        {exchanges.map((ex) => (
          <div className="qa-pair" key={ex.id}>
            <div className="qa-q">{ex.question}</div>
            <div className="qa-a">
              <div className="qa-a-title">{ex.answer.title}</div>
              {ex.answer.paragraphs.map((p, i) => (
                <p key={i}>{p}</p>
              ))}
              {ex.answer.action && (
                <button
                  className="btn-ghost qa-action"
                  onClick={() => onOpenReading(ex.answer.action!.objectiveId, ex.answer.action!.windowDays)}
                >
                  {ex.answer.action.label} ›
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="qa-input-row">
        <input
          className="qa-input"
          type="text"
          value={query}
          placeholder={personalized ? "e.g. “best time to change jobs in the next 2 years?”" : "e.g. “good week to sign a contract?”"}
          aria-label="Ask about your timing"
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") ask(query);
          }}
        />
        <button className="btn qa-send" disabled={!query.trim()} onClick={() => ask(query)}>
          Ask
        </button>
      </div>
      {exchanges.length === 0 && (
        <div className="qa-suggest">
          {["When should I sign the contract?", "Best time to launch in the next year?", "What does my chart suit?"].map((s) => (
            <button key={s} className="chip ghost" onClick={() => ask(s)}>
              {s}
            </button>
          ))}
        </div>
      )}
      <div className="ask-note" style={{ marginTop: 10 }}>
        Answers come straight from the engine — same question, same answer, every time. One input among many; use your own judgement too.
      </div>
    </div>
  );
}
