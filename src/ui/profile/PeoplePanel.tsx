/**
 * The cast panel — everyone whose chart is stored, who's currently active, and
 * the controls to add, edit or remove them.
 *
 * The single-profile flow is unchanged: with one person stored this renders as a
 * quiet "add someone" affordance rather than a list, so a solo user never has to
 * think about a feature they aren't using.
 */
import { useState } from "react";
import { CONVENTION_PRESETS } from "../../engine/index.ts";
import { Person, PersonalizeCard } from "../PersonalizeCard.tsx";
import { UpgradePrompt } from "../billing/UpgradePrompt.tsx";
import { DEFAULT_TZ } from "../shared.ts";
import { useProfile } from "./ProfileContext.tsx";
import { StoredPerson } from "./peopleStore.ts";

export function PeoplePanel() {
  const { people, activeId, atProfileLimit, profileLimit, isLocked, selectPerson, savePerson, deletePerson } = useProfile();
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftMeta, setDraftMeta] = useState<{ label: string; relation?: string }>({ label: "" });

  const editing: StoredPerson | null = people.find((p) => p.id === editingId) ?? null;

  const startAdd = () => {
    setDraftMeta({ label: "" });
    setEditingId(null);
    setAdding(true);
  };
  const startEdit = (p: StoredPerson) => {
    setDraftMeta({ label: p.label, relation: p.relation });
    setAdding(false);
    setEditingId(p.id);
  };
  const close = () => {
    setAdding(false);
    setEditingId(null);
  };

  const apply = (p: Person) => {
    savePerson(p, { id: editingId ?? undefined, label: draftMeta.label, relation: draftMeta.relation });
    close();
  };

  const formOpen = adding || editing !== null;

  return (
    <div className="card people-panel">
      <div className="people-head">
        <div>
          <b>People</b>
          <p>
            Charts you've stored. Readings are scored against whoever is selected — and the date finder can check a day
            against several people at once.
          </p>
        </div>
        {!formOpen && !atProfileLimit && (
          <button className="btn-ghost people-add" onClick={startAdd}>
            + Add someone
          </button>
        )}
      </div>

      {people.length > 0 && (
        <ul className="people-list">
          {people.map((p) => {
            const locked = isLocked(p.id);
            return (
              <li key={p.id} className={`person-row${p.id === activeId ? " active" : ""}${locked ? " locked" : ""}`}>
                <button
                  className="person-pick"
                  disabled={locked}
                  onClick={() => selectPerson(p.id)}
                  aria-pressed={p.id === activeId}
                  title={locked ? "Included in Pro" : `Read against ${p.label}'s chart`}
                >
                  <span className="person-dot" aria-hidden="true" />
                  <span className="person-name">
                    {p.label}
                    {p.relation ? <span className="person-rel"> · {p.relation}</span> : null}
                  </span>
                  <span className="person-dob">{p.birthDate}</span>
                </button>
                {locked ? (
                  <span className="person-locked-tag">Pro</span>
                ) : (
                  <span className="person-actions">
                    <button className="btn-text" onClick={() => startEdit(p)}>Edit</button>
                    <button className="btn-text danger" onClick={() => deletePerson(p.id)}>Remove</button>
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {/* A downgrade parks people rather than deleting them — say so plainly. */}
      {people.some((p) => isLocked(p.id)) && (
        <p className="people-parked">
          {people.filter((p) => isLocked(p.id)).length} stored {people.filter((p) => isLocked(p.id)).length === 1 ? "chart is" : "charts are"} paused
          on the free plan. Nothing was deleted — they return the moment you're on Pro.
        </p>
      )}

      {formOpen && (
        <div style={{ marginTop: 12 }}>
          <PersonalizeCard
            person={editing ?? null}
            defaultTz={DEFAULT_TZ}
            presets={CONVENTION_PRESETS}
            startEditing
            applyLabel={editing ? "Save changes" : "Add to my people"}
            subject={{ label: draftMeta.label, relation: draftMeta.relation, onChange: setDraftMeta }}
            onApply={apply}
            onClear={close}
            onCancel={close}
          />
        </div>
      )}

      {atProfileLimit && !formOpen && (
        <div style={{ marginTop: 12 }}>
          <UpgradePrompt feature="multi_profile" compact />
        </div>
      )}

      {!atProfileLimit && people.length <= 1 && !formOpen && (
        <p className="people-hint">
          Adding a partner, family member or co-founder lets you find a date that works for all of you — not just for you.
          Their details are stored the same way yours are, and limited to {profileLimit} {profileLimit === 1 ? "person" : "people"} on your plan.
        </p>
      )}
    </div>
  );
}
