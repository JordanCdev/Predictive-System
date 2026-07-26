import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  JournalEntry,
  Reflection,
  getReflection,
  isJournalFull,
  isReflection,
  isReflectionFull,
  loadReflections,
  moodLabel,
  removeReflection,
  upsertReflection,
} from "../src/ui/journalStore.ts";

const reflection = (isoDate: string, over: Partial<Reflection> = {}): Reflection => ({
  isoDate,
  mood: 4,
  note: "",
  savedAt: 1_000,
  ...over,
});

const decision = (id: string): JournalEntry => ({
  id,
  objectiveId: "x",
  objectiveLabel: "X",
  isoDate: "2026-01-01",
  weekday: "Mon",
  score: 70,
  band: "",
  verdict: "",
  bestHour: null,
  note: "",
  savedAt: 0,
});

const g = globalThis as { localStorage?: unknown };
let map: Map<string, string>;
beforeEach(() => {
  map = new Map<string, string>();
  g.localStorage = {
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  } as unknown as Storage;
});
afterEach(() => {
  delete g.localStorage;
});

describe("reflections store CRUD", () => {
  it("saves, reads back and removes a reflection", () => {
    upsertReflection(reflection("2026-07-25", { mood: 5, note: "a great day" }));
    expect(getReflection("2026-07-25")).toMatchObject({ mood: 5, note: "a great day" });
    expect(getReflection("2026-07-24")).toBeNull();

    removeReflection("2026-07-25");
    expect(getReflection("2026-07-25")).toBeNull();
    expect(loadReflections()).toEqual([]);
  });

  it("keeps the list sorted newest day first, however days are added", () => {
    upsertReflection(reflection("2026-07-20"));
    upsertReflection(reflection("2026-07-25"));
    upsertReflection(reflection("2026-07-22"));
    expect(loadReflections().map((r) => r.isoDate)).toEqual(["2026-07-25", "2026-07-22", "2026-07-20"]);
  });

  it("upserts one per day — saving again replaces, never duplicates", () => {
    upsertReflection(reflection("2026-07-25", { mood: 2, note: "first take", savedAt: 1_000 }));
    upsertReflection(reflection("2026-07-25", { mood: 4, note: "on reflection", savedAt: 2_000 }));
    const list = loadReflections();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ mood: 4, note: "on reflection", savedAt: 2_000 });
  });

  it("labels every mood, and shrugs at nonsense", () => {
    expect([1, 2, 3, 4, 5].map(moodLabel)).toEqual(["Terrible", "Poor", "Okay", "Good", "Great"]);
    expect(moodLabel(0)).toBe("—");
    expect(moodLabel(99)).toBe("—");
  });
});

describe("the shared journal allowance (settled tier decision)", () => {
  // Decisions and reflections draw on ONE journalEntries cap. These cover the
  // counting; the never-trim guarantee is structural — no store function here
  // deletes anything to enforce a limit.
  it("counts decisions + reflections together against the limit", () => {
    const decisions = [decision("a"), decision("b")];
    const reflections = [reflection("2026-07-24")];
    // 3 of 4 used → a new reflection fits.
    expect(isReflectionFull(decisions, reflections, 4, "2026-07-25")).toBe(false);
    // 3 of 3 → a NEW day is blocked…
    expect(isReflectionFull(decisions, reflections, 3, "2026-07-25")).toBe(true);
    // …but re-saving the day that already has one is always allowed.
    expect(isReflectionFull(decisions, reflections, 3, "2026-07-24")).toBe(false);
  });

  it("the decision-side check counts reflections too — one lever, both directions", () => {
    const decisions = [decision("a"), decision("b")];
    const reflections = [reflection("2026-07-24")];
    expect(isJournalFull(decisions, 3, undefined, reflections)).toBe(true);
    expect(isJournalFull(decisions, 4, undefined, reflections)).toBe(false);
    // Re-saving an existing decision stays allowed at the cap.
    expect(isJournalFull(decisions, 3, "a", reflections)).toBe(false);
  });

  it("isJournalFull reads stored reflections when none are passed", () => {
    upsertReflection(reflection("2026-07-24"));
    upsertReflection(reflection("2026-07-23"));
    expect(isJournalFull([decision("a")], 3)).toBe(true);
    expect(isJournalFull([decision("a")], 4)).toBe(false);
  });
});

describe("corrupt storage tolerance", () => {
  it("returns an empty list for junk JSON and non-arrays", () => {
    map.set("wei_reflections_v1", "{ not json");
    expect(loadReflections()).toEqual([]);
    map.set("wei_reflections_v1", JSON.stringify({ sneaky: "object" }));
    expect(loadReflections()).toEqual([]);
  });

  it("drops malformed rows and keeps the good ones", () => {
    map.set(
      "wei_reflections_v1",
      JSON.stringify([
        reflection("2026-07-25"),
        null,
        42,
        "nope",
        { isoDate: "not-a-date", mood: 3, note: "", savedAt: 1 },
        { isoDate: "2026-07-24", mood: 0, note: "", savedAt: 1 }, // mood below range
        { isoDate: "2026-07-23", mood: 6, note: "", savedAt: 1 }, // mood above range
        { isoDate: "2026-07-22", mood: 3.5, note: "", savedAt: 1 }, // non-integer mood
        { isoDate: "2026-07-21", mood: 3, note: "", savedAt: NaN }, // no usable stamp
        { isoDate: "2026-07-20", mood: 3, savedAt: 1 }, // note missing entirely
      ]),
    );
    expect(loadReflections()).toEqual([reflection("2026-07-25")]);
  });

  it("upserting over corrupt storage recovers rather than throwing", () => {
    map.set("wei_reflections_v1", "{{{");
    upsertReflection(reflection("2026-07-25"));
    expect(loadReflections()).toEqual([reflection("2026-07-25")]);
  });

  it("survives having no localStorage at all", () => {
    delete g.localStorage;
    expect(loadReflections()).toEqual([]);
    expect(getReflection("2026-07-25")).toBeNull();
    // The write is lost, but nothing throws — same contract as the journal.
    expect(() => upsertReflection(reflection("2026-07-25"))).not.toThrow();
    expect(() => removeReflection("2026-07-25")).not.toThrow();
  });

  it("isReflection is strict about shape", () => {
    expect(isReflection(reflection("2026-07-25"))).toBe(true);
    expect(isReflection(null)).toBe(false);
    expect(isReflection("2026-07-25")).toBe(false);
    expect(isReflection({ ...reflection("2026-07-25"), mood: "great" })).toBe(false);
    expect(isReflection({ ...reflection("2026-07-25"), note: 7 })).toBe(false);
  });
});
