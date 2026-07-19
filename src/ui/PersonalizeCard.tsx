import { useEffect, useState } from "react";
import { ConventionSet } from "../engine/index.ts";
import { labelFor, resolveOffset } from "../engine/timezone.ts";
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
  /** IANA zone of the birth city, so the offset in force on the birth DATE
   *  (summer time, historical zone changes) can be resolved rather than assumed. */
  birthZone?: string;
  /** True once the user has hand-edited the offset — after which we stop
   *  auto-correcting it, because they may know something we don't (a record kept
   *  in local rather than official time, a border town, a misremembered city). */
  tzManual?: boolean;
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

  // Selecting a city sets zone, longitude and timezone in one move.
  const pickCity = (name: string) => {
    const c = cityByName(name);
    setDraft((d) =>
      c
        ? { ...d, birthCity: c.name, birthZone: c.zone, longitudeEast: c.lon, tzOffset: c.tz, tzManual: false }
        : { ...d, birthCity: undefined, birthZone: undefined },
    );
  };

  /**
   * The offset actually in force at this birth — resolved from the city's IANA
   * zone and the birth DATE, so a summer birth gets summer time automatically
   * instead of relying on the user to know their clocks had gone forward.
   *
   * Recomputed as the date/time/city change, and applied unless the user has
   * taken manual control of the offset.
   */
  const resolvedZone = (() => {
    if (!draft.birthZone || !/^\d{4}-\d{2}-\d{2}$/.test(draft.birthDate)) return null;
    const [y, mo, dd] = draft.birthDate.split("-").map(Number);
    const [hh, mi] = noTime ? [12, 0] : (draft.birthTime || "12:00").split(":").map(Number);
    if (![y, mo, dd, hh, mi].every(Number.isFinite)) return null;
    return resolveOffset(draft.birthZone, { year: y, month: mo, day: dd, hour: hh, minute: mi });
  })();

  useEffect(() => {
    if (!resolvedZone || draft.tzManual) return;
    if (resolvedZone.certainty === "unavailable") return;
    if (resolvedZone.offsetMinutes === draft.tzOffset) return;
    setDraft((d) => ({ ...d, tzOffset: resolvedZone.offsetMinutes }));
  }, [resolvedZone?.offsetMinutes, resolvedZone?.certainty, draft.tzManual]); // eslint-disable-line react-hooks/exhaustive-deps

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
        {/* The resolved offset is stated out loud rather than applied silently:
            it changes the hour pillar, so the user should be able to see it and
            disagree with it. */}
        {resolvedZone && resolvedZone.certainty !== "unavailable" && (
          <div className={resolvedZone.certainty === "exact" ? "note-soft tz-note" : "warn tz-note"}>
            {resolvedZone.certainty !== "exact" && <span aria-hidden="true">⚠ </span>}
            <b>Clocks read {labelFor(draft.tzOffset)}</b>
            {draft.tzManual ? " (set by you)." : ` in ${draft.birthCity} on that date.`}
            {resolvedZone.note ? ` ${resolvedZone.note}` : ""}
            {draft.tzManual && resolvedZone.offsetMinutes !== draft.tzOffset && (
              <>
                {" "}We'd have used {labelFor(resolvedZone.offsetMinutes)}.{" "}
                <button
                  type="button"
                  className="btn-text"
                  style={{ padding: 0, minHeight: 0 }}
                  onClick={() => setDraft((d) => ({ ...d, tzManual: false, tzOffset: resolvedZone.offsetMinutes }))}
                >
                  Use that instead
                </button>
              </>
            )}
          </div>
        )}
        <div className="note-soft">
          Your city sets the time-zone — including summer time in force on your birth date — and, via true solar time
          (真太陽時), places the hour pillar the way most online BaZi tools do. City not listed? Set the time-zone under
          Advanced.
        </div>

        <details className="advanced">
          <summary>Advanced · for practitioners</summary>
          <label className="field" style={{ marginTop: 10 }}>
            <span>Birth time-zone (override)</span>
            <select
              value={draft.tzOffset}
              // Editing this takes manual control: we stop auto-correcting, because
              // the user may know something the zone table doesn't.
              onChange={(e) => setDraft((d) => ({ ...d, tzOffset: Number(e.target.value), tzManual: true }))}
            >
              {TZ_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <div className="note-soft">
              Resolved from your city and birth date, summer time included. Override only if your birth record used a
              different clock — doing so stops the automatic correction.
            </div>
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
