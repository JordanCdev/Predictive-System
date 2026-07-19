/**
 * The stored cast of people — you, plus whoever else a decision involves.
 *
 * Pure functions over a plain state object so the migration and the invariants
 * are unit-testable without React or localStorage. The provider owns persistence.
 *
 * Backwards compatibility matters here: users already have a single profile under
 * `wei_person_v1`. `migrate()` lifts that into the multi-person shape without
 * losing it, and the provider keeps writing the active person back to the old key
 * so a rollback (or an older tab) still finds a profile.
 */
import { Person } from "../PersonalizeCard.tsx";

export interface StoredPerson extends Person {
  id: string;
  /** What to call them in the UI — "You", "Mei", "Dad". */
  label: string;
  /** Free text: partner, child, co-founder. Presentation only. */
  relation?: string;
}

export interface PeopleState {
  people: StoredPerson[];
  /** The person every personalised reading is scored against. */
  activeId: string | null;
}

export const EMPTY_PEOPLE: PeopleState = { people: [], activeId: null };

export const SELF_ID = "self";

/** Structural validity — the same bar the single-profile loader used, plus id. */
export function isStoredPerson(v: unknown): v is StoredPerson {
  const p = v as Partial<StoredPerson> | null;
  return (
    !!p &&
    typeof p.id === "string" &&
    p.id.length > 0 &&
    typeof p.label === "string" &&
    typeof p.birthDate === "string" &&
    (p.sex === "male" || p.sex === "female")
  );
}

function isLegacyPerson(v: unknown): v is Person {
  const p = v as Partial<Person> | null;
  return !!p && typeof p.birthDate === "string" && (p.sex === "male" || p.sex === "female");
}

/** Ids are derived from the clock, so callers pass one in to stay deterministic. */
export function newPersonId(seed: string | number): string {
  return `p_${String(seed).replace(/[^a-zA-Z0-9]/g, "")}`;
}

/**
 * Build valid state from whatever was persisted: the new multi-person record, the
 * legacy single profile, or nothing. Anything malformed is dropped rather than
 * thrown on — a corrupt entry must never take the app down.
 */
export function migrate(stored: unknown, legacy: unknown): PeopleState {
  const rec = stored as Partial<PeopleState> | null;
  if (rec && Array.isArray(rec.people)) {
    const people = rec.people.filter(isStoredPerson);
    if (people.length > 0) {
      const activeId = people.some((p) => p.id === rec.activeId) ? rec.activeId! : people[0].id;
      return { people, activeId };
    }
  }
  // No usable multi-person record — lift the legacy single profile if there is one.
  if (isLegacyPerson(legacy)) {
    return { people: [{ ...legacy, id: SELF_ID, label: "You" }], activeId: SELF_ID };
  }
  return EMPTY_PEOPLE;
}

export function activePerson(state: PeopleState): StoredPerson | null {
  return state.people.find((p) => p.id === state.activeId) ?? null;
}

/** Add or replace a person, keeping ids unique. A new person becomes active,
 *  because the user just described them and expects to see their reading. */
export function upsertPerson(state: PeopleState, person: StoredPerson): PeopleState {
  const existing = state.people.findIndex((p) => p.id === person.id);
  if (existing >= 0) {
    const people = state.people.slice();
    people[existing] = person;
    return { people, activeId: state.activeId };
  }
  return { people: [...state.people, person], activeId: person.id };
}

/** Remove a person; if they were active, fall back to the first one left. */
export function removePerson(state: PeopleState, id: string): PeopleState {
  const people = state.people.filter((p) => p.id !== id);
  if (people.length === 0) return EMPTY_PEOPLE;
  return { people, activeId: state.activeId === id ? people[0].id : state.activeId };
}

export function setActive(state: PeopleState, id: string): PeopleState {
  return state.people.some((p) => p.id === id) ? { ...state, activeId: id } : state;
}

/**
 * How many of the stored people the current plan actually entitles the user to.
 *
 * A downgrade must never destroy data: if someone cancels Pro with four people
 * stored, we keep all four and simply stop *using* the ones beyond the limit,
 * so re-subscribing restores them intact. The active person is always allowed,
 * so a downgrade can't leave the app with no readable profile.
 */
export function allowedPeople(state: PeopleState, limit: number): StoredPerson[] {
  if (state.people.length <= limit) return state.people;
  const active = activePerson(state);
  const rest = state.people.filter((p) => p.id !== active?.id);
  const kept = active ? [active, ...rest] : rest;
  return kept.slice(0, Math.max(1, limit));
}

/** Is this person usable under the plan, or parked by a downgrade? */
export function isPersonLocked(state: PeopleState, id: string, limit: number): boolean {
  return !allowedPeople(state, limit).some((p) => p.id === id);
}
