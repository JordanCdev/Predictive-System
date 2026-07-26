/**
 * The daily reflection — "how did today feel?" for ANY day, tied to nothing.
 *
 * A decision entry needs an objective and a saved reading; this needs neither.
 * It is the lightest possible row in the honest-feedback loop: a mood and an
 * optional one-liner, one per day, editable, stored on this device.
 *
 * Self-contained by design: it reads and writes the reflections store itself,
 * so a page mounts it with nothing but the day (`<ReflectionCard iso={...} />`).
 *
 * SETTLED: reflections and decision entries draw on ONE shared allowance
 * (`journalEntries`) — a high abuse bound, not a product tier. When it's used
 * up, a NEW reflection is blocked with the same honest cap message as the
 * decision journal — existing rows are never trimmed, and editing the day's
 * existing reflection always works.
 */
import { useMemo, useState } from "react";
import { useEntitlements } from "./profile/EntitlementsContext.tsx";
import { TODAY_ISO, addDaysIso } from "./shared.ts";
import {
  MOOD_LABELS,
  Reflection,
  getReflection,
  isReflectionFull,
  loadJournal,
  loadReflections,
  moodLabel,
  upsertReflection,
} from "./journalStore.ts";

/** Plain-text glyphs, deliberately not emoji — they render identically
 *  everywhere and the aria-label carries the meaning. Index `mood - 1`. */
const MOOD_GLYPHS = ["− −", "−", "·", "+", "+ +"] as const;

const MAX_NOTE_CHARS = 120;

export function ReflectionCard({ iso }: { iso: string }) {
  const { entitlement } = useEntitlements();

  // Snapshot of the store for this mount; every save writes through and updates it.
  const [saved, setSaved] = useState<Reflection | null>(() => getReflection(iso));
  const [editing, setEditing] = useState(false);
  const [mood, setMood] = useState<number | null>(() => saved?.mood ?? null);
  const [note, setNote] = useState(() => saved?.note ?? "");

  // The day pages navigate in place (‹ / ›), so the same mounted card can be
  // handed a different day. Re-seed from the store when that happens — the
  // render-time reset pattern, no effect needed.
  const [lastIso, setLastIso] = useState(iso);
  if (iso !== lastIso) {
    const s = getReflection(iso);
    setLastIso(iso);
    setSaved(s);
    setEditing(false);
    setMood(s?.mood ?? null);
    setNote(s?.note ?? "");
  }

  // Yesterday's reflection, shown small — continuity without a full history view.
  const yesterday = useMemo(() => getReflection(addDaysIso(iso, -1)), [iso]);

  // A reflection is a record of a day lived, not a prediction — mirror the
  // outcome log's past-only gate and don't invite moods for days yet to come.
  if (iso > TODAY_ISO) {
    return yesterday || saved ? (
      <div className="card" style={{ padding: 16, marginTop: 12 }}>
        <div className="section-title" style={{ marginBottom: 4 }}>Daily reflection</div>
        <p style={{ margin: 0, fontSize: 12.5, color: "var(--muted)" }}>
          This day hasn't happened yet — come back after it to note how it went.
        </p>
      </div>
    ) : null;
  }

  // The shared decisions+reflections allowance. Editing the day's existing
  // reflection is always allowed, so the cap only bites on a brand-new day.
  const capped =
    !saved &&
    isReflectionFull(loadJournal(), loadReflections(), entitlement.plan.limits.journalEntries, iso);

  const save = (m: number) => {
    const r: Reflection = { isoDate: iso, mood: m, note: note.trim().slice(0, MAX_NOTE_CHARS), savedAt: Date.now() };
    upsertReflection(r);
    setSaved(r);
    setMood(m);
    setEditing(false);
  };

  const form = (
    <>
      <div role="group" aria-label="How did this day feel?" style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {MOOD_LABELS.map((label, i) => {
          const m = i + 1;
          const on = mood === m;
          return (
            <button
              key={m}
              className={`chip ${on ? "on" : "ghost"}`}
              aria-label={label}
              aria-pressed={on}
              title={label}
              onClick={() => setMood(m)}
              style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 1, minWidth: 52, padding: "6px 8px", lineHeight: 1.2 }}
            >
              <span aria-hidden="true" style={{ fontSize: 14, fontWeight: 700 }}>{MOOD_GLYPHS[i]}</span>
              <span aria-hidden="true" style={{ fontSize: 10.5 }}>{label}</span>
            </button>
          );
        })}
      </div>
      <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
        <input
          className="qa-input"
          style={{ flex: 1 }}
          value={note}
          maxLength={MAX_NOTE_CHARS}
          placeholder="One line about the day (optional)…"
          aria-label="A short note about the day"
          onChange={(ev) => setNote(ev.target.value)}
          onKeyDown={(ev) => { if (ev.key === "Enter" && mood !== null) save(mood); }}
        />
        <button
          className="btn-ghost"
          style={{ width: "auto", padding: "4px 12px" }}
          disabled={mood === null}
          onClick={() => mood !== null && save(mood)}
        >
          Save
        </button>
        {editing && saved && (
          <button
            className="btn-text"
            onClick={() => { setEditing(false); setMood(saved.mood); setNote(saved.note); }}
          >
            Cancel
          </button>
        )}
      </div>
    </>
  );

  return (
    <div className="card" style={{ padding: 20, marginTop: 18 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span className="seal sm" aria-hidden="true">感</span>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>How was this day?</h3>
      </div>
      <p style={{ margin: "8px 0 12px", fontSize: 13, color: "var(--muted)" }}>
        A mood and a line, kept on this device. It builds your own record of how days actually felt — it never changes a
        day's score.
      </p>

      {saved && !editing ? (
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", fontSize: 13 }}>
          <span style={{ border: "1px solid var(--hairline)", borderRadius: 999, padding: "1px 9px", color: "var(--ink)" }}>
            Felt: <b>{moodLabel(saved.mood)}</b>
          </span>
          {saved.note && <span style={{ fontStyle: "italic", color: "var(--ink)" }}>“{saved.note}”</span>}
          <button className="btn-text" style={{ marginLeft: "auto" }} onClick={() => setEditing(true)}>
            Edit
          </button>
        </div>
      ) : capped ? (
        <p style={{ margin: 0, fontSize: 12.5, color: "var(--muted)", lineHeight: 1.5 }}>
          Your journal is at its {entitlement.plan.limits.journalEntries}-entry allowance — decisions and reflections
          share it. Everything you've saved stays exactly as it is; remove an entry you no longer need to make room for
          a new day.
        </p>
      ) : (
        form
      )}

      {yesterday && (
        <p style={{ margin: "10px 0 0", fontSize: 11.5, color: "var(--faint)", lineHeight: 1.45 }}>
          Yesterday you said: {moodLabel(yesterday.mood)}
          {yesterday.note ? <> — “{yesterday.note}”</> : null}
        </p>
      )}
    </div>
  );
}
