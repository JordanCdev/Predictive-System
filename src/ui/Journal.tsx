import { useState } from "react";
import { relativeDay, shortDate } from "../engine/index.ts";
import { JournalEntry } from "./journalStore.ts";
import { scoreColor, scoreTextColor } from "./format.ts";

/** The saved-decisions log. Deterministic snapshots the user chose to keep. */
export function Journal({
  entries,
  todayIso,
  onOpen,
  onRemove,
  onNote,
}: {
  entries: JournalEntry[];
  todayIso: string;
  onOpen: (objectiveId: string) => void;
  onRemove: (id: string) => void;
  onNote: (id: string, note: string) => void;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  if (entries.length === 0) return null;

  const civilOf = (iso: string) => {
    const [year, month, day] = iso.split("-").map(Number);
    return { year, month, day };
  };

  return (
    <div className="card" style={{ padding: 20, marginTop: 18 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span className="seal sm" aria-hidden="true">誌</span>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Your decision journal</h3>
      </div>
      <p style={{ margin: "8px 0 12px", fontSize: 13, color: "var(--muted)" }}>
        Days you've saved to revisit. Each is a snapshot of the reading when you logged it.
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {entries.map((e) => (
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
                <input
                  className="qa-input"
                  style={{ flex: 1 }}
                  value={draft}
                  autoFocus
                  placeholder="Add a note…"
                  onChange={(ev) => setDraft(ev.target.value)}
                  onKeyDown={(ev) => { if (ev.key === "Enter") { onNote(e.id, draft.trim()); setEditing(null); } }}
                />
                <button className="btn-ghost" style={{ width: "auto", padding: "4px 12px" }} onClick={() => { onNote(e.id, draft.trim()); setEditing(null); }}>Save</button>
              </div>
            ) : (
              e.note && <p style={{ margin: "6px 0 0", fontSize: 12.5, color: "var(--ink)", fontStyle: "italic" }}>“{e.note}”</p>
            )}

            <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
              <button className="btn-text" style={{ paddingLeft: 0 }} onClick={() => onOpen(e.objectiveId)}>Open reading ›</button>
              <button className="btn-text" onClick={() => { setEditing(e.id); setDraft(e.note); }}>{e.note ? "Edit note" : "Add note"}</button>
              <button className="btn-text" style={{ color: "var(--cinnabar)", marginLeft: "auto" }} onClick={() => onRemove(e.id)}>Remove</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
