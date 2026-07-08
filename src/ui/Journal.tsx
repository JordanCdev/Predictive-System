import { useState } from "react";
import { relativeDay, shortDate } from "../engine/index.ts";
import { EventOutcome, JournalEntry, feedbackSummary } from "./journalStore.ts";
import { scoreColor, scoreTextColor } from "./format.ts";

const RATINGS: EventOutcome["rating"][] = ["great", "good", "mixed", "poor"];
const RATING_LABEL: Record<EventOutcome["rating"], string> = { great: "Great", good: "Good", mixed: "Mixed", poor: "Poor" };

/** The saved-decisions log with outcome logging (Phase 7). */
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
  onOpen: (objectiveId: string) => void;
  onRemove: (id: string) => void;
  onNote: (id: string, note: string) => void;
  onOutcome: (id: string, outcome: EventOutcome | null) => void;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [outcomeFor, setOutcomeFor] = useState<string | null>(null);
  if (entries.length === 0) return null;

  const civilOf = (iso: string) => {
    const [year, month, day] = iso.split("-").map(Number);
    return { year, month, day };
  };
  const summary = feedbackSummary(entries);

  return (
    <div className="card" style={{ padding: 20, marginTop: 18 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span className="seal sm" aria-hidden="true">誌</span>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Your decision journal</h3>
      </div>
      <p style={{ margin: "8px 0 12px", fontSize: 13, color: "var(--muted)" }}>
        Days you've saved to revisit. Once one has passed, log how it went — it tunes your reading, not the metaphysics.
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
                  <button className="btn-text" style={{ paddingLeft: 0 }} onClick={() => onOpen(e.objectiveId)}>Open reading ›</button>
                  <button className="btn-text" onClick={() => { setEditing(e.id); setDraft(e.note); }}>{e.note ? "Edit note" : "Add note"}</button>
                  {past && <button className="btn-text" onClick={() => setOutcomeFor(e.id)}>{e.outcome ? "Edit outcome" : "How did it go?"}</button>}
                  <button className="btn-text" style={{ color: "var(--cinnabar)", marginLeft: "auto" }} onClick={() => onRemove(e.id)}>Remove</button>
                </div>
              )}
            </div>
          );
        })}
      </div>
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
