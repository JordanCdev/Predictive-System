import { useState } from "react";
import { ConventionSet } from "../engine/index.ts";
import { CITIES, CITY_REGIONS, cityByName } from "./cities.ts";

export interface Person {
  birthDate: string;
  birthTime: string;
  sex: "male" | "female";
  timeCertainty: "exact" | "approximate" | "hour_unknown";
  tzOffset: number;
  conventionId: string;
  /** Birth longitude °E — used by the true-solar / mean-solar conventions. */
  longitudeEast?: number;
  /** Birth city name — sets the timezone + longitude, and shown in the summary. */
  birthCity?: string;
}

// Default doctrine: true solar time (真太陽時), matching most online BaZi tools —
// so the hour pillar lines up once a birth city (→ longitude) is chosen.
const DEFAULT_CONVENTION_ID = "ziping_true_solar_v1";

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

/** Optional "who is this?" fields, used when the card captures someone *other*
 *  than the account holder (the multi-profile cast). Absent for the self flow, so
 *  the original single-profile experience is untouched. */
export interface NamedSubject {
  label: string;
  relation?: string;
  onChange: (next: { label: string; relation?: string }) => void;
}

export function PersonalizeCard({
  person,
  defaultTz,
  presets,
  onApply,
  onClear,
  subject,
  startEditing = false,
  applyLabel,
  onCancel,
}: {
  person: Person | null;
  defaultTz: number;
  presets: ConventionSet[];
  onApply: (p: Person) => void;
  onClear: () => void;
  /** When set, the form also captures a name + relation for this person. */
  subject?: NamedSubject;
  /** Open straight into the form (adding someone new). */
  startEditing?: boolean;
  applyLabel?: string;
  onCancel?: () => void;
}) {
  const [editing, setEditing] = useState(startEditing);
  const [draft, setDraft] = useState<Person>(
    person ?? {
      birthDate: "",
      birthTime: "12:00",
      sex: "male",
      timeCertainty: "exact",
      tzOffset: defaultTz,
      conventionId: presets.some((p) => p.id === DEFAULT_CONVENTION_ID) ? DEFAULT_CONVENTION_ID : presets[0].id,
    },
  );
  const set = <K extends keyof Person>(k: K, v: Person[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const noTime = draft.timeCertainty === "hour_unknown";

  // Selecting a city sets both timezone and longitude in one move.
  const pickCity = (name: string) => {
    const c = cityByName(name);
    setDraft((d) => (c ? { ...d, birthCity: c.name, tzOffset: c.tz, longitudeEast: c.lon } : { ...d, birthCity: undefined }));
  };

  // A real, fully-specified date — refuse partial/garbage rather than personalize on NaN.
  const validDate = (() => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(draft.birthDate);
    if (!m) return false;
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    return y >= 1850 && y <= 2100 && mo >= 1 && mo <= 12 && d >= 1 && d <= 31;
  })();
  const canApply = validDate && (noTime || /^\d{2}:\d{2}$/.test(draft.birthTime));

  const cancel = () => {
    setEditing(false);
    onCancel?.();
  };

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
              {person.timeCertainty === "hour_unknown" ? " (time unknown)" : `, ${person.birthTime}`}
              {person.birthCity ? ` · ${person.birthCity}` : ""}.{" "}
              {(presets.find((p) => p.id === person.conventionId)?.hourBasis === "true_solar" && person.timeCertainty !== "hour_unknown")
                ? "Hour pillar uses true solar time (真太陽時)."
                : "The reading now factors in your BaZi."}
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
      <h3 style={{ marginBottom: 4 }}>{subject ? "Their birth details" : "Your birth details"}</h3>
      <p>
        {subject
          ? "Stored alongside your own chart so a date can be checked against everyone involved."
          : "Used only to personalize the reading. Nothing is uploaded."}
      </p>
      <div className="birth-form">
        {subject && (
          <div className="row-2">
            <label className="field">
              <span>Name</span>
              <input
                type="text"
                placeholder="e.g. Mei"
                value={subject.label}
                onChange={(e) => subject.onChange({ label: e.target.value, relation: subject.relation })}
              />
            </label>
            <label className="field">
              <span>Relationship (optional)</span>
              <input
                type="text"
                placeholder="e.g. partner, co-founder"
                value={subject.relation ?? ""}
                onChange={(e) => subject.onChange({ label: subject.label, relation: e.target.value || undefined })}
              />
            </label>
          </div>
        )}
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
            <span>Birth city</span>
            <select value={draft.birthCity ?? ""} onChange={(e) => pickCity(e.target.value)}>
              <option value="">Select…</option>
              {CITY_REGIONS.map((r) => (
                <optgroup key={r} label={r}>
                  {CITIES.filter((c) => c.region === r).map((c) => (
                    <option key={c.name} value={c.name}>
                      {c.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
        </div>
        <div className="note-soft">
          Your city sets the time-zone and, via true solar time (真太陽時), places the hour pillar the way most online BaZi
          tools do. City not listed, or a summer/DST birth? Fine-tune the time-zone under Advanced.
        </div>

        <details className="advanced">
          <summary>Advanced · for practitioners</summary>
          <label className="field" style={{ marginTop: 10 }}>
            <span>Birth time-zone (override)</span>
            <select value={draft.tzOffset} onChange={(e) => set("tzOffset", Number(e.target.value))}>
              {TZ_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <div className="note-soft">Auto-set from your city — adjust for a summer/DST birth or an unlisted city.</div>
          </label>
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
          <button
            className="btn"
            disabled={!canApply || (subject !== undefined && !subject.label.trim())}
            onClick={() => { onApply(draft); setEditing(false); }}
          >
            {applyLabel ?? "Apply to my reading"}
          </button>
          <button className="btn-ghost" style={{ width: "auto", padding: "8px 16px" }} onClick={cancel}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
