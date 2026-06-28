import { useState } from "react";
import { ConventionSet } from "../engine/index.ts";

export interface Person {
  birthDate: string;
  birthTime: string;
  sex: "male" | "female";
  timeCertainty: "exact" | "approximate" | "hour_unknown";
  tzOffset: number;
  conventionId: string;
  /** Birth longitude °E — only used by the true-solar / mean-solar conventions. */
  longitudeEast?: number;
}

const pad = (n: number) => String(n).padStart(2, "0");
const TZ_OPTIONS = (() => {
  const opts: { value: number; label: string }[] = [];
  for (let m = -12 * 60; m <= 14 * 60; m += 30) {
    const sign = m < 0 ? "-" : "+";
    const a = Math.abs(m);
    opts.push({ value: m, label: `UTC${sign}${pad(Math.floor(a / 60))}:${pad(a % 60)}` });
  }
  return opts;
})();

export function PersonalizeCard({
  person,
  defaultTz,
  presets,
  onApply,
  onClear,
}: {
  person: Person | null;
  defaultTz: number;
  presets: ConventionSet[];
  onApply: (p: Person) => void;
  onClear: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Person>(
    person ?? {
      birthDate: "",
      birthTime: "12:00",
      sex: "male",
      timeCertainty: "exact",
      tzOffset: defaultTz,
      conventionId: presets[0].id,
    },
  );
  const set = <K extends keyof Person>(k: K, v: Person[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const noTime = draft.timeCertainty === "hour_unknown";

  // A real, fully-specified date — refuse partial/garbage rather than personalize on NaN.
  const validDate = (() => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(draft.birthDate);
    if (!m) return false;
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    return y >= 1850 && y <= 2100 && mo >= 1 && mo <= 12 && d >= 1 && d <= 31;
  })();
  const canApply = validDate && (noTime || /^\d{2}:\d{2}$/.test(draft.birthTime));

  // Applied + not editing → compact summary.
  if (person && !editing) {
    return (
      <div className="card personalize-card">
        <div className="pc-head">
          <span className="pc-emoji">✓</span>
          <div style={{ flex: 1 }}>
            <h3>Tailored to your chart</h3>
            <p>
              Born {person.birthDate}
              {person.timeCertainty === "hour_unknown" ? " (time unknown)" : `, ${person.birthTime}`}. The reading now
              factors in your BaZi.
            </p>
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
          <button className="btn-ghost" style={{ width: "auto", padding: "8px 16px" }} onClick={() => { setDraft(person); setEditing(true); }}>
            Edit
          </button>
          <button className="btn-text" onClick={onClear}>
            Remove personalization
          </button>
        </div>
      </div>
    );
  }

  // Upsell (collapsed).
  if (!editing) {
    return (
      <div className="card personalize-card">
        <div className="pc-head">
          <span className="pc-emoji">✶</span>
          <div style={{ flex: 1 }}>
            <h3>Make this yours</h3>
            <p>Add your birth details to tailor the days to your own chart — and unlock your best hours. Optional, and stays on your device.</p>
          </div>
        </div>
        <button className="btn-ghost" style={{ marginTop: 14 }} onClick={() => setEditing(true)}>
          Add my birth details
        </button>
      </div>
    );
  }

  // Editing form.
  return (
    <div className="card personalize-card">
      <h3 style={{ marginBottom: 4 }}>Your birth details</h3>
      <p>Used only to personalize the reading. Nothing is uploaded.</p>
      <div className="birth-form">
        <div className="row-2">
          <label className="field">
            <span>Birth date</span>
            <input type="date" value={draft.birthDate} onChange={(e) => set("birthDate", e.target.value)} />
          </label>
          <label className="field">
            <span>Birth time {noTime ? "(unknown)" : ""}</span>
            <input type="time" value={draft.birthTime} disabled={noTime} onChange={(e) => set("birthTime", e.target.value)} />
          </label>
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5, color: "var(--muted)" }}>
          <input
            type="checkbox"
            style={{ width: 18, height: 18 }}
            checked={noTime}
            onChange={(e) => set("timeCertainty", e.target.checked ? "hour_unknown" : "exact")}
          />
          I don't know my birth time
        </label>
        {noTime && <div className="note-soft">That's fine — we'll skip hour-level detail and say so honestly in the confidence.</div>}

        <div className="row-2">
          <label className="field">
            <span>Sex (affects your long-term timing)</span>
            <div className="seg">
              <button className={draft.sex === "male" ? "on" : ""} aria-pressed={draft.sex === "male"} onClick={() => set("sex", "male")}>
                Male
              </button>
              <button className={draft.sex === "female" ? "on" : ""} aria-pressed={draft.sex === "female"} onClick={() => set("sex", "female")}>
                Female
              </button>
            </div>
          </label>
          <label className="field">
            <span>Birth time-zone</span>
            <select value={draft.tzOffset} onChange={(e) => set("tzOffset", Number(e.target.value))}>
              {TZ_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <details className="advanced">
          <summary>Advanced · for practitioners</summary>
          <label className="field" style={{ marginTop: 10 }}>
            <span>Doctrine (convention set)</span>
            <select value={draft.conventionId} onChange={(e) => set("conventionId", e.target.value)}>
              {presets.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
            <div className="note-soft">Every calculation is bound to an explicit convention, so disputes are visible, not hidden.</div>
          </label>
          <label className="field" style={{ marginTop: 10 }}>
            <span>Birth longitude °E (optional — sharpens true-solar time)</span>
            <input
              type="number"
              step="0.1"
              placeholder="e.g. 103.8 for Singapore"
              value={draft.longitudeEast ?? ""}
              onChange={(e) => set("longitudeEast", e.target.value === "" ? undefined : Number(e.target.value))}
            />
            <div className="note-soft">With the true-solar doctrine, your hour pillar uses the real Sun (longitude + equation of time).</div>
          </label>
        </details>

        <div style={{ display: "flex", gap: 10 }}>
          <button className="btn" disabled={!canApply} onClick={() => { onApply(draft); setEditing(false); }}>
            Apply to my reading
          </button>
          <button className="btn-ghost" style={{ width: "auto", padding: "8px 16px" }} onClick={() => setEditing(false)}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
