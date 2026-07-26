import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { relativeDay, shortDate } from "../engine/index.ts";
import {
  EventOutcome,
  JournalEntry,
  Reflection,
  feedbackSummary,
  loadReflections,
  moodLabel,
  removeReflection,
} from "./journalStore.ts";
import { scoreColor, scoreTextColor } from "./format.ts";
import { AreaSignal, deriveSignals } from "./priorities/deriveSignals.ts";
import { areaSignalId, dismissSignal, loadDismissed } from "./priorities/dismissedSignals.ts";
import {
  MAX_INTENTIONS,
  MAX_INTENTION_CHARS,
  PRIORITY_AREAS,
  PriorityProfile,
  acceptSignal,
  addArea,
  hasAcceptedSignal,
  loadPriorities,
  savePriorities,
  setIntention,
} from "./priorities/prioritiesStore.ts";

const RATINGS: EventOutcome["rating"][] = ["great", "good", "mixed", "poor"];
const RATING_LABEL: Record<EventOutcome["rating"], string> = { great: "Great", good: "Good", mixed: "Mixed", poor: "Poor" };

/** The wording the user sees on the card — and, if they accept, exactly what is
 *  stored as the accepted signal's label. No re-phrasing after the fact. */
const signalLabel = (s: AreaSignal) => `${s.label} is a priority right now`;

/** The saved-decisions log with outcome logging (Phase 7), plus the forward-looking
 *  half of the loop (Phase 10): what the journal SUGGESTS you care about, and what
 *  you say you're working on.
 *
 *  Suggestions are suggestions. Nothing is written to the priority profile without
 *  an explicit press of Add — the app never infers a durable fact about someone
 *  from their behaviour and quietly keeps it. */
export function Journal({
  entries,
  todayIso,
  onOpen,
  onRemove,
  onNote,
  onOutcome,
}: {
  entries: JournalEntry[];
  todayIso: string;
  /** Reopen the reading this entry was saved from, landing on its saved day. */
  onOpen: (objectiveId: string, isoDate: string) => void;
  onRemove: (id: string) => void;
  onNote: (id: string, note: string) => void;
  onOutcome: (id: string, outcome: EventOutcome | null) => void;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [outcomeFor, setOutcomeFor] = useState<string | null>(null);
  // Daily reflections live in their own store and are owned by this panel +
  // ReflectionCard; the decisions list still arrives via props unchanged.
  const [reflections, setReflections] = useState<Reflection[]>(() => loadReflections());
  // Priorities are the user's own data, edited on the profile page too; this panel
  // reads a snapshot and writes through the same store.
  const [priorities, setPriorities] = useState<PriorityProfile>(() => loadPriorities());
  const [dismissed, setDismissed] = useState<string[]>(() => loadDismissed());
  const [intentDraft, setIntentDraft] = useState("");

  // Everything the app must not ask about again: areas already ranked, areas the
  // user dismissed, and areas already accepted from a suggestion. Excluding them
  // INSIDE deriveSignals matters — filtering afterwards would drop cards that had
  // already used up the two-card cap, so a qualifying third area could never
  // surface however much evidence it had.
  const excluded = useMemo(() => {
    const settled = PRIORITY_AREAS.map((a) => a.key).filter(
      (k) => dismissed.includes(areaSignalId(k)) || hasAcceptedSignal(priorities, areaSignalId(k)),
    );
    return [...priorities.areas, ...settled];
  }, [priorities, dismissed]);
  // Pure derivation — same entries in, same suggestions out.
  const signals = useMemo(() => deriveSignals(entries, { exclude: excluded }), [entries, excluded]);
  const cards = signals.suggestions;
  const intentionsFull = priorities.intentions.length >= MAX_INTENTIONS;

  const addPriority = (s: AreaSignal) => {
    const now = Date.now(); // UI wall clock — never read by the engine
    const next = acceptSignal(addArea(priorities, s.area), { id: areaSignalId(s.area), label: signalLabel(s), source: "journal" }, now);
    setPriorities(savePriorities(next, now));
  };
  const dismissCard = (s: AreaSignal) => setDismissed(dismissSignal(areaSignalId(s.area)));
  const saveIntention = () => {
    const t = intentDraft.trim();
    if (!t || intentionsFull) return;
    setPriorities(savePriorities(setIntention(priorities, priorities.intentions.length, t), Date.now()));
    setIntentDraft("");
  };
  const clearIntention = (i: number) => setPriorities(savePriorities(setIntention(priorities, i, ""), Date.now()));

  if (entries.length === 0 && reflections.length === 0) return null;

  const civilOf = (iso: string) => {
    const [year, month, day] = iso.split("-").map(Number);
    return { year, month, day };
  };
  const summary = feedbackSummary(entries);

  // A reflections-only journal (moods logged, no decisions yet) shouldn't wear
  // the decision-journal's chrome — the header and intro would describe content
  // that isn't there.
  const reflectionsOnly = entries.length === 0;

  return (
    <div className="card" style={{ padding: 20, marginTop: 18 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span className="seal sm" aria-hidden="true">誌</span>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>{reflectionsOnly ? "Your journal" : "Your decision journal"}</h3>
      </div>
      <p style={{ margin: "8px 0 12px", fontSize: 13, color: "var(--muted)" }}>
        {reflectionsOnly
          ? "Your daily reflections so far. Save a decision from a reading and it will appear here too."
          : "Days you've saved to revisit. Once one has passed, log how it went — it tunes your reading, not the metaphysics."}
      </p>

      {summary.withOutcome > 0 && (
        <div style={{ border: "1px solid var(--hairline)", borderRadius: 10, padding: "10px 12px", marginBottom: 12, background: "var(--surface-1)" }}>
          <div style={{ fontSize: 13, color: "var(--ink)" }}>
            <b>{summary.withOutcome}</b> of {summary.logged} logged with an outcome.
            {summary.helpfulRate !== null && <> The timing advice felt helpful <b>{summary.helpfulRate}%</b> of the time.</>}
            {summary.higherScoresFeltBetter !== null && (
              <> Your higher-scored days {summary.higherScoresFeltBetter ? "tended to feel better" : "didn't clearly feel better"} — for you, so far.</>
            )}
          </div>
          <div style={{ fontSize: 11.5, color: "var(--faint)", marginTop: 5, lineHeight: 1.45 }}>{summary.disclaimer}</div>
        </div>
      )}

      {/* ── What your journal SUGGESTS you care about (suggestion, never inference) ── */}
      {cards.length > 0 && (
        <section aria-label="Suggested priorities from your journal" style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
          {cards.map((s) => (
            <div key={s.area} style={{ border: "1px dashed var(--hairline)", borderRadius: 10, padding: "10px 12px", background: "var(--surface-1)" }}>
              <div style={{ fontSize: 13.5, color: "var(--ink)", lineHeight: 1.5 }}>
                Your journal suggests <b>{s.label.toLowerCase()}</b> matters most right now — add it to your priorities?
              </div>
              <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 4, lineHeight: 1.5 }}>{s.evidence}</div>
              <div style={{ display: "flex", gap: 12, marginTop: 8, alignItems: "center", flexWrap: "wrap" }}>
                <button className="btn" style={{ maxWidth: 200, padding: "6px 14px" }} onClick={() => addPriority(s)}>
                  Add {s.label.toLowerCase()} to my priorities
                </button>
                <button className="btn-text" onClick={() => dismissCard(s)}>Not right now</button>
              </div>
            </div>
          ))}
          <div style={{ fontSize: 11.5, color: "var(--faint)", lineHeight: 1.45 }}>{signals.note}</div>
        </section>
      )}

      {/* ── The forward-looking counterpart to the outcome log ── */}
      <section aria-label="What you're working on" style={{ border: "1px solid var(--hairline)", borderRadius: 10, padding: "10px 12px", marginBottom: 12 }}>
        <div style={{ fontSize: 13.5, color: "var(--ink)", fontWeight: 600 }}>What are you working on?</div>
        <p style={{ margin: "4px 0 8px", fontSize: 12.5, color: "var(--muted)", lineHeight: 1.5 }}>
          The outcome log looks back. This looks forward — one line about what you're pushing on now. It changes what the
          app puts in front of you first, and never a day's classical score.
        </p>
        <p style={{ margin: "0 0 8px", fontSize: 11.5, color: "var(--faint)", lineHeight: 1.45 }}>
          Worth knowing: what you write here is stored in this browser, and — unlike the rest of your journal — it is
          sent word-for-word to the AI advisor if you use it, because sharing intentions is on by default.{" "}
          <Link className="btn-text" style={{ padding: 0 }} to="/settings/profile">
            Change what the advisor may see ›
          </Link>
        </p>
        {priorities.intentions.length > 0 && (
          <ul style={{ listStyle: "none", margin: "0 0 8px", padding: 0, display: "flex", flexDirection: "column", gap: 6 }}>
            {priorities.intentions.map((it, i) => (
              <li key={i} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: "var(--ink)" }}>
                <span aria-hidden="true" style={{ color: "var(--faint)" }}>→</span>
                <span style={{ flex: 1 }}>{it}</span>
                <button className="btn-text" style={{ color: "var(--cinnabar)" }} aria-label={`Remove intention: ${it}`} onClick={() => clearIntention(i)}>
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
        {intentionsFull ? (
          <div style={{ fontSize: 11.5, color: "var(--faint)", lineHeight: 1.45 }}>
            Two at a time — remove one to add another. More than that stops being an intention and starts being a diary.
          </div>
        ) : (
          <div style={{ display: "flex", gap: 6 }}>
            <input
              className="qa-input"
              style={{ flex: 1 }}
              value={intentDraft}
              maxLength={MAX_INTENTION_CHARS}
              placeholder="e.g. raising a seed round before the autumn"
              aria-label="What are you working on right now?"
              onChange={(ev) => setIntentDraft(ev.target.value)}
              onKeyDown={(ev) => ev.key === "Enter" && saveIntention()}
            />
            <button className="btn-ghost" style={{ width: "auto", padding: "4px 12px" }} disabled={!intentDraft.trim()} onClick={saveIntention}>
              Save
            </button>
          </div>
        )}
      </section>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {entries.map((e) => {
          const past = e.isoDate <= todayIso;
          return (
            <div key={e.id} style={{ border: "1px solid var(--hairline)", borderRadius: 10, padding: "10px 12px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span className="dot" style={{ width: 9, height: 9, borderRadius: 9, background: scoreColor(e.score) }} />
                <b style={{ fontSize: 14 }}>{e.objectiveLabel}</b>
                <span style={{ fontSize: 12.5, color: "var(--muted)" }}>
                  · {shortDate(civilOf(e.isoDate))} <span style={{ color: "var(--faint)" }}>({relativeDay(e.isoDate, todayIso)})</span>
                </span>
                <span style={{ marginLeft: "auto", fontSize: 13, fontWeight: 600, color: scoreTextColor(e.score) }}>{e.score}</span>
              </div>
              <p style={{ margin: "6px 0 0", fontSize: 12.5, color: "var(--muted)", lineHeight: 1.5 }}>{e.verdict}</p>
              {e.bestHour && <p style={{ margin: "3px 0 0", fontSize: 12, color: "var(--muted)" }}>◷ Best window {e.bestHour}</p>}

              {editing === e.id ? (
                <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                  <input className="qa-input" style={{ flex: 1 }} value={draft} autoFocus placeholder="Add a note…" onChange={(ev) => setDraft(ev.target.value)} onKeyDown={(ev) => { if (ev.key === "Enter") { onNote(e.id, draft.trim()); setEditing(null); } }} />
                  <button className="btn-ghost" style={{ width: "auto", padding: "4px 12px" }} onClick={() => { onNote(e.id, draft.trim()); setEditing(null); }}>Save</button>
                </div>
              ) : (
                e.note && <p style={{ margin: "6px 0 0", fontSize: 12.5, color: "var(--ink)", fontStyle: "italic" }}>“{e.note}”</p>
              )}

              {/* Recorded outcome */}
              {e.outcome && outcomeFor !== e.id && (
                <div style={{ marginTop: 8, fontSize: 12.5, color: "var(--muted)", display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  <span style={{ border: "1px solid var(--hairline)", borderRadius: 999, padding: "1px 9px", color: "var(--ink)" }}>
                    Outcome: <b>{RATING_LABEL[e.outcome.rating]}</b>
                  </span>
                  <span>stress {e.outcome.stress}/5</span>
                  <span>{e.outcome.helped ? "advice helped ✓" : "advice didn't help"}</span>
                  {e.outcome.notes && <span style={{ fontStyle: "italic" }}>“{e.outcome.notes}”</span>}
                </div>
              )}

              {outcomeFor === e.id ? (
                <OutcomeForm entry={e} onCancel={() => setOutcomeFor(null)} onSave={(o) => { onOutcome(e.id, o); setOutcomeFor(null); }} />
              ) : (
                <div style={{ display: "flex", gap: 12, marginTop: 8, flexWrap: "wrap" }}>
                  <button className="btn-text" style={{ paddingLeft: 0 }} onClick={() => onOpen(e.objectiveId, e.isoDate)}>Open reading ›</button>
                  <Link className="btn-text" style={{ textDecoration: "none" }} to={`/day/${e.isoDate}`}>View day ›</Link>
                  <button className="btn-text" onClick={() => { setEditing(e.id); setDraft(e.note); }}>{e.note ? "Edit note" : "Add note"}</button>
                  {past && <button className="btn-text" onClick={() => setOutcomeFor(e.id)}>{e.outcome ? "Edit outcome" : "How did it go?"}</button>}
                  <button className="btn-text" style={{ color: "var(--cinnabar)", marginLeft: "auto" }} onClick={() => onRemove(e.id)}>Remove</button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Daily reflections: quieter rows — a mood and a line, no reading attached.
            They live alongside decisions but are deliberately NOT folded into the
            feedback summary above, which stays decision-based. ── */}
      {reflections.length > 0 && (
        <section aria-label="Daily reflections" style={{ marginTop: entries.length > 0 ? 14 : 0 }}>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--muted)", marginBottom: 6 }}>
            Daily reflections
          </div>
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 6 }}>
            {reflections.map((r) => (
              <li
                key={r.isoDate}
                style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", border: "1px dashed var(--hairline)", borderRadius: 10, padding: "7px 12px", fontSize: 12.5, color: "var(--muted)" }}
              >
                <span>
                  {shortDate(civilOf(r.isoDate))}{" "}
                  <span style={{ color: "var(--faint)" }}>({relativeDay(r.isoDate, todayIso)})</span>
                </span>
                <span style={{ color: "var(--ink)" }}>
                  Felt: <b>{moodLabel(r.mood)}</b>
                </span>
                {r.note && <span style={{ fontStyle: "italic" }}>“{r.note}”</span>}
                <span style={{ marginLeft: "auto", display: "flex", gap: 10 }}>
                  <Link className="btn-text" style={{ textDecoration: "none", padding: 0 }} to={`/day/${r.isoDate}`}>
                    View day ›
                  </Link>
                  <button
                    className="btn-text"
                    style={{ color: "var(--cinnabar)", padding: 0 }}
                    aria-label={`Remove the reflection for ${r.isoDate}`}
                    onClick={() => setReflections(removeReflection(r.isoDate))}
                  >
                    Remove
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function OutcomeForm({ entry, onSave, onCancel }: { entry: JournalEntry; onSave: (o: EventOutcome) => void; onCancel: () => void }) {
  const [rating, setRating] = useState<EventOutcome["rating"]>(entry.outcome?.rating ?? "good");
  const [stress, setStress] = useState(entry.outcome?.stress ?? 3);
  const [helped, setHelped] = useState(entry.outcome?.helped ?? true);
  const [notes, setNotes] = useState(entry.outcome?.notes ?? "");
  const [actualDate, setActualDate] = useState(entry.outcome?.actualDate ?? entry.isoDate);

  return (
    <div style={{ marginTop: 10, border: "1px solid var(--hairline)", borderRadius: 10, padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ fontSize: 12.5, color: "var(--ink)" }}>How did it go?</div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {RATINGS.map((r) => (
          <button key={r} className={`chip ${rating === r ? "on" : "ghost"}`} onClick={() => setRating(r)}>{RATING_LABEL[r]}</button>
        ))}
      </div>
      <label style={{ fontSize: 12.5, color: "var(--muted)", display: "flex", alignItems: "center", gap: 8 }}>
        Stress
        <input type="range" min={1} max={5} value={stress} onChange={(e) => setStress(Number(e.target.value))} style={{ flex: 1 }} />
        <b style={{ color: "var(--ink)" }}>{stress}/5</b>
      </label>
      <label style={{ fontSize: 12.5, color: "var(--muted)", display: "flex", alignItems: "center", gap: 6 }}>
        <input type="checkbox" checked={helped} onChange={(e) => setHelped(e.target.checked)} /> The timing advice felt helpful
      </label>
      <label style={{ fontSize: 12.5, color: "var(--muted)", display: "flex", alignItems: "center", gap: 8 }}>
        Actual date
        <input type="date" value={actualDate} onChange={(e) => setActualDate(e.target.value)} />
      </label>
      <input className="qa-input" placeholder="Anything you'd note for next time…" value={notes} onChange={(e) => setNotes(e.target.value)} />
      <div style={{ display: "flex", gap: 8 }}>
        <button className="btn" style={{ maxWidth: 160 }} onClick={() => onSave({ rating, stress, helped, notes: notes.trim(), actualDate, recordedAt: Date.now() })}>Save outcome</button>
        <button className="btn-ghost" style={{ width: "auto", padding: "8px 14px" }} onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}
