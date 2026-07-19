import { describe, expect, it } from "vitest";
import {
  EMPTY_PEOPLE,
  PeopleState,
  SELF_ID,
  StoredPerson,
  activePerson,
  allowedPeople,
  isPersonLocked,
  migrate,
  removePerson,
  setActive,
  upsertPerson,
} from "../src/ui/profile/peopleStore.ts";

const person = (id: string, label = id): StoredPerson => ({
  id,
  label,
  birthDate: "1990-05-04",
  birthTime: "08:30",
  sex: "female",
  timeCertainty: "exact",
  tzOffset: 0,
  conventionId: "ziping_true_solar_v1",
});

const state = (ids: string[], activeId: string | null = ids[0] ?? null): PeopleState => ({
  people: ids.map((id) => person(id)),
  activeId,
});

describe("migrate", () => {
  it("lifts a legacy single profile without losing it", () => {
    const legacy = { birthDate: "1988-01-02", sex: "male", birthTime: "12:00" };
    const s = migrate(null, legacy);
    expect(s.people).toHaveLength(1);
    expect(s.people[0].id).toBe(SELF_ID);
    expect(s.people[0].label).toBe("You");
    expect(s.people[0].birthDate).toBe("1988-01-02");
    expect(s.activeId).toBe(SELF_ID);
  });

  it("prefers the multi-person record over the legacy key", () => {
    const s = migrate(state(["a", "b"], "b"), { birthDate: "1988-01-02", sex: "male" });
    expect(s.people.map((p) => p.id)).toEqual(["a", "b"]);
    expect(s.activeId).toBe("b");
  });

  it("drops malformed entries rather than throwing", () => {
    const s = migrate({ people: [person("a"), { id: "bad" }, null, 42], activeId: "a" }, null);
    expect(s.people.map((p) => p.id)).toEqual(["a"]);
  });

  it("repairs a dangling activeId", () => {
    expect(migrate(state(["a", "b"], "gone"), null).activeId).toBe("a");
  });

  it("returns empty state for nothing, junk or an empty list", () => {
    expect(migrate(null, null)).toEqual(EMPTY_PEOPLE);
    expect(migrate("nonsense", undefined)).toEqual(EMPTY_PEOPLE);
    expect(migrate({ people: [], activeId: null }, null)).toEqual(EMPTY_PEOPLE);
  });
});

describe("mutations", () => {
  it("adds a new person and makes them active", () => {
    const s = upsertPerson(state(["a"]), person("b", "Ben"));
    expect(s.people.map((p) => p.id)).toEqual(["a", "b"]);
    expect(s.activeId).toBe("b");
  });

  it("edits in place without changing who is active", () => {
    const s = upsertPerson(state(["a", "b"], "a"), { ...person("b"), label: "Renamed" });
    expect(s.people).toHaveLength(2);
    expect(activePerson(s)?.id).toBe("a");
    expect(s.people[1].label).toBe("Renamed");
  });

  it("falls back to a remaining person when the active one is removed", () => {
    const s = removePerson(state(["a", "b"], "a"), "a");
    expect(s.people.map((p) => p.id)).toEqual(["b"]);
    expect(s.activeId).toBe("b");
  });

  it("empties cleanly when the last person is removed", () => {
    expect(removePerson(state(["a"]), "a")).toEqual(EMPTY_PEOPLE);
  });

  it("ignores an attempt to activate someone who isn't stored", () => {
    const s = state(["a", "b"], "a");
    expect(setActive(s, "nope")).toEqual(s);
    expect(setActive(s, "b").activeId).toBe("b");
  });
});

describe("plan limits", () => {
  it("keeps every person under the limit", () => {
    expect(allowedPeople(state(["a", "b"]), 6)).toHaveLength(2);
  });

  it("parks the overflow on downgrade but never deletes it", () => {
    const s = state(["a", "b", "c", "d"], "c");
    const allowed = allowedPeople(s, 1);
    expect(allowed).toHaveLength(1);
    // The *active* person survives a downgrade — never an arbitrary first entry,
    // or the app would suddenly be reading someone else's chart.
    expect(allowed[0].id).toBe("c");
    // …and nothing was removed from the stored state.
    expect(s.people).toHaveLength(4);
    expect(isPersonLocked(s, "a", 1)).toBe(true);
    expect(isPersonLocked(s, "c", 1)).toBe(false);
  });

  it("always leaves at least one usable person", () => {
    expect(allowedPeople(state(["a", "b"]), 0)).toHaveLength(1);
  });
});
