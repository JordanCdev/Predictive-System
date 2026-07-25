import { beforeEach, describe, expect, it } from "vitest";
import {
  BACKUP_SCHEMA_VERSION,
  BackupFile,
  JOURNAL_KEY,
  LEGACY_PERSON_KEY,
  MAX_BACKUP_BYTES,
  PEOPLE_KEY,
  PRIORITIES_KEY,
  StorageLike,
  applyBackup,
  backupFilename,
  buildBackup,
  describeApply,
  incomingWinsJournal,
  mergeJournals,
  mergePeople,
  parseBackup,
  serializeBackup,
} from "../src/ui/backup.ts";
import type { JournalEntry } from "../src/ui/journalStore.ts";
import { SELF_ID, type StoredPerson } from "../src/ui/profile/peopleStore.ts";

/** An in-memory stand-in for localStorage — the tests run in the node env. */
class FakeStorage implements StorageLike {
  map = new Map<string, string>();
  /** Set to make every write throw, mimicking private mode / quota. */
  readonly = false;
  /** Writes to these keys throw; everything else (including an undo) works. */
  blocked = new Set<string>();
  /** Once this many writes have succeeded, every later write throws — a quota
   *  filling up mid-restore, which also defeats the rollback. */
  failAfterWrites: number | null = null;
  writes = 0;
  private guard(k: string) {
    if (this.readonly || this.blocked.has(k)) throw new Error("QuotaExceededError");
    if (this.failAfterWrites !== null && this.writes >= this.failAfterWrites) throw new Error("QuotaExceededError");
    this.writes += 1;
  }
  getItem(k: string) {
    return this.map.has(k) ? this.map.get(k)! : null;
  }
  setItem(k: string, v: string) {
    this.guard(k);
    this.map.set(k, v);
  }
  removeItem(k: string) {
    this.guard(k);
    this.map.delete(k);
  }
}

const person = (id: string, label = id): StoredPerson => ({
  id,
  label,
  birthDate: "1998-03-23",
  birthTime: "19:47",
  sex: "male",
  timeCertainty: "exact",
  tzOffset: 0,
  conventionId: "ziping_true_solar_v1",
});

const entry = (id: string, over: Partial<JournalEntry> = {}): JournalEntry => ({
  id,
  objectiveId: "career_move",
  objectiveLabel: "A career move",
  isoDate: "2026-08-01",
  weekday: "Saturday",
  score: 71,
  band: "Favourable",
  verdict: "A supported day",
  bestHour: null,
  note: "",
  savedAt: 1_000,
  ...over,
});

const NOW = new Date("2026-07-25T09:30:00.000Z");

/** A backup object built by hand, so a test never mutates one the module made. */
const file = (over: Partial<BackupFile> = {}): BackupFile => ({
  schemaVersion: BACKUP_SCHEMA_VERSION,
  exportedAt: NOW.toISOString(),
  appVersion: "0.3.0",
  engineVersions: {},
  people: { people: [], activeId: null },
  journal: [],
  priorities: null,
  ...over,
});

let store: FakeStorage;
beforeEach(() => {
  store = new FakeStorage();
});

function seed(opts: { people?: StoredPerson[]; activeId?: string | null; journal?: JournalEntry[]; priorities?: unknown } = {}) {
  if (opts.people) {
    store.map.set(PEOPLE_KEY, JSON.stringify({ people: opts.people, activeId: opts.activeId ?? opts.people[0]?.id ?? null }));
  }
  if (opts.journal) store.map.set(JOURNAL_KEY, JSON.stringify(opts.journal));
  if (opts.priorities !== undefined) store.map.set(PRIORITIES_KEY, JSON.stringify(opts.priorities));
}

describe("buildBackup", () => {
  it("captures people, journal and priorities with a version stamp", () => {
    seed({ people: [person("a"), person("b")], activeId: "b", journal: [entry("x"), entry("y")], priorities: { speed: 3 } });
    const b = buildBackup({ storage: store, now: NOW });
    expect(b.schemaVersion).toBe(BACKUP_SCHEMA_VERSION);
    expect(b.exportedAt).toBe("2026-07-25T09:30:00.000Z");
    expect(b.appVersion).toMatch(/^\d+\.\d+\.\d+$/);
    expect(b.people.people.map((p) => p.id)).toEqual(["a", "b"]);
    expect(b.people.activeId).toBe("b");
    expect(b.journal.map((e) => e.id)).toEqual(["x", "y"]);
    expect(b.priorities).toEqual({ speed: 3 });
  });

  it("lifts a legacy single profile so an old install still exports its chart", () => {
    store.map.set(LEGACY_PERSON_KEY, JSON.stringify({ birthDate: "1998-03-23", sex: "male", birthTime: "19:47" }));
    const b = buildBackup({ storage: store, now: NOW });
    expect(b.people.people).toHaveLength(1);
    expect(b.people.people[0].birthDate).toBe("1998-03-23");
  });

  it("tolerates an empty store, absent priorities and corrupt JSON", () => {
    const b = buildBackup({ storage: store, now: NOW });
    expect(b.people.people).toEqual([]);
    expect(b.journal).toEqual([]);
    expect(b.priorities).toBeNull();

    store.map.set(PEOPLE_KEY, "{ not json");
    store.map.set(JOURNAL_KEY, "{{{");
    store.map.set(PRIORITIES_KEY, "nope");
    const b2 = buildBackup({ storage: store, now: NOW });
    expect(b2.people.people).toEqual([]);
    expect(b2.journal).toEqual([]);
    expect(b2.priorities).toBeNull();
  });

  it("drops malformed people and journal rows rather than exporting junk", () => {
    store.map.set(PEOPLE_KEY, JSON.stringify({ people: [person("a"), { id: "bad" }, null, 7], activeId: "a" }));
    store.map.set(JOURNAL_KEY, JSON.stringify([entry("x"), null, 42, { note: "no id" }]));
    const b = buildBackup({ storage: store, now: NOW });
    expect(b.people.people.map((p) => p.id)).toEqual(["a"]);
    expect(b.journal.map((e) => e.id)).toEqual(["x"]);
  });

  it("survives storage being unavailable entirely", () => {
    const b = buildBackup({ storage: null, now: NOW });
    expect(b.people.people).toEqual([]);
    expect(b.journal).toEqual([]);
  });

  it("names the file after the day it was made", () => {
    expect(backupFilename(new Date(2026, 6, 5))).toBe("wei-backup-2026-07-05.json");
  });
});

describe("the AI key never leaves the device", () => {
  it("is absent from the backup object and its serialised text", () => {
    store.map.set("wei_ai_key", "sk-ant-SUPER-SECRET-VALUE");
    store.map.set("wei_ai_consent", "yes");
    store.map.set("wei_ai_model", "claude-x");
    seed({ people: [person("a")], journal: [entry("x")] });

    const b = buildBackup({ storage: store, now: NOW });
    const text = serializeBackup(b);
    expect(text).not.toContain("SUPER-SECRET-VALUE");
    expect(text).not.toContain("sk-ant");
    expect(text).not.toContain("wei_ai_key");
    expect(text).not.toContain("wei_ai_consent");
    expect(text).not.toContain("wei_ai_model");
    expect(Object.keys(b)).toEqual([
      "schemaVersion",
      "exportedAt",
      "appVersion",
      "engineVersions",
      "people",
      "journal",
      "priorities",
    ]);
  });

  it("is untouched by a restore, in either mode", () => {
    store.map.set("wei_ai_key", "sk-ant-SUPER-SECRET-VALUE");
    const f = file({ people: { people: [person("a")], activeId: "a" }, journal: [entry("x")] });
    applyBackup(f, "merge", { storage: store });
    expect(store.getItem("wei_ai_key")).toBe("sk-ant-SUPER-SECRET-VALUE");
    applyBackup(f, "replace", { storage: store });
    expect(store.getItem("wei_ai_key")).toBe("sk-ant-SUPER-SECRET-VALUE");
  });
});

describe("round trip", () => {
  it("restores an exported file byte-for-byte into a fresh device", () => {
    seed({ people: [person("a", "You"), person("b", "Mei")], activeId: "b", journal: [entry("x", { note: "hi" }), entry("y", { outcome: { actualDate: "2026-08-01", rating: "good", stress: 2, helped: true, notes: "", recordedAt: 5 } })], priorities: { pace: "calm" } });
    const text = serializeBackup(buildBackup({ storage: store, now: NOW }));

    const fresh = new FakeStorage();
    const parsed = parseBackup(text);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.summary).toMatchObject({ people: 2, journal: 2, journalWithOutcomes: 1, hasPriorities: true });
    applyBackup(parsed.data, "merge", { storage: fresh });

    expect(buildBackup({ storage: fresh, now: NOW })).toEqual(buildBackup({ storage: store, now: NOW }));
    // …and the legacy mirror is written so an older build still finds a profile.
    expect(JSON.parse(fresh.getItem(LEGACY_PERSON_KEY)!).id).toBe("b");
  });
});

describe("parseBackup", () => {
  const good = (over: Partial<BackupFile> = {}) =>
    JSON.stringify({
      schemaVersion: BACKUP_SCHEMA_VERSION,
      exportedAt: NOW.toISOString(),
      appVersion: "0.3.0",
      engineVersions: {},
      people: { people: [person("a")], activeId: "a" },
      journal: [entry("x")],
      priorities: null,
      ...over,
    });

  it("accepts a well-formed file", () => {
    const r = parseBackup(good());
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.summary).toMatchObject({ people: 1, journal: 1, hasPriorities: false });
  });

  it("rejects empty, non-JSON and non-object input without throwing", () => {
    for (const bad of ["", "   ", "not json at all", "{ oops", "[1,2,3]", "null", '"a string"', "42"]) {
      const r = parseBackup(bad);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.length).toBeGreaterThan(10);
    }
  });

  it("rejects JSON that is simply the wrong thing", () => {
    const r = parseBackup(JSON.stringify({ hello: "world" }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/backup/i);
  });

  it("rejects a file with a version but no readable contents", () => {
    const r = parseBackup(JSON.stringify({ schemaVersion: 1, people: { people: [] }, journal: [] }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/nothing to restore|damaged/i);
  });

  it("explains a future schema version rather than mangling it", () => {
    const r = parseBackup(good({ schemaVersion: BACKUP_SCHEMA_VERSION + 1 }));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toContain("newer version of the app");
      expect(r.error).toMatch(/nothing has been changed/i);
    }
  });

  it("refuses an oversized file before parsing it", () => {
    const huge = `{"schemaVersion":1,"padding":"${"x".repeat(MAX_BACKUP_BYTES)}"}`;
    const r = parseBackup(huge);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/larger/i);
  });

  it("tolerates a file with no priorities key at all", () => {
    const raw = JSON.parse(good()) as Record<string, unknown>;
    delete raw.priorities;
    const r = parseBackup(JSON.stringify(raw));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.priorities).toBeNull();
      expect(r.summary.hasPriorities).toBe(false);
    }
  });

  it("accepts a people-only or journal-only file", () => {
    const peopleOnly = parseBackup(good({ journal: [] }));
    expect(peopleOnly.ok).toBe(true);
    const journalOnly = parseBackup(good({ people: { people: [], activeId: null } }));
    expect(journalOnly.ok).toBe(true);
    if (journalOnly.ok) expect(journalOnly.summary.people).toBe(0);
  });

  it("drops corrupt rows inside an otherwise valid file", () => {
    const r = parseBackup(
      JSON.stringify({
        schemaVersion: 1,
        people: { people: [person("a"), { id: "bad" }], activeId: "gone" },
        journal: [entry("x"), null],
      }),
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.people.people.map((p) => p.id)).toEqual(["a"]);
      expect(r.data.people.activeId).toBe("a"); // dangling activeId repaired
      expect(r.data.journal.map((e) => e.id)).toEqual(["x"]);
    }
  });
});

describe("merge semantics", () => {
  it("adds new people and lets the incoming copy win on a conflict", () => {
    const local = { people: [person("a", "You"), person("b", "Old name")], activeId: "a" };
    const incoming = { people: [{ ...person("b"), label: "New name" }, person("c", "Mei")], activeId: "c" };
    const { merged, counts } = mergePeople(local, incoming);
    expect(merged.people.map((p) => p.id)).toEqual(["a", "b", "c"]);
    expect(merged.people[1].label).toBe("New name");
    expect(counts).toEqual({ added: 1, updated: 1, kept: 0, importedAsNew: 0 });
    // A merge never silently swaps whose chart you're reading.
    expect(merged.activeId).toBe("a");
  });

  it("adopts the file's active person only when the local one is gone", () => {
    const { merged } = mergePeople({ people: [], activeId: null }, { people: [person("c")], activeId: "c" });
    expect(merged.activeId).toBe("c");
  });

  // Every install stores its primary person under the same id ("self"), so an id
  // collision is NOT evidence of the same human — it is the normal case when two
  // different people's backups meet.
  it("never overwrites your chart with a different human who shares an id", () => {
    const mine = { ...person(SELF_ID, "You"), birthDate: "1998-03-23", birthTime: "19:47", sex: "male" as const };
    const theirs = { ...person(SELF_ID, "Partner"), birthDate: "1996-11-02", birthTime: "04:10", sex: "female" as const };
    const { merged, counts } = mergePeople({ people: [mine], activeId: SELF_ID }, { people: [theirs], activeId: SELF_ID });

    expect(counts).toEqual({ added: 1, updated: 0, kept: 0, importedAsNew: 1 });
    expect(merged.people).toHaveLength(2);
    // Mine is untouched, in place, and still the one being read.
    expect(merged.people[0]).toEqual(mine);
    expect(merged.activeId).toBe(SELF_ID);
    // Theirs is present under a fresh id, carrying their own birth data.
    expect(merged.people[1].id).not.toBe(SELF_ID);
    expect(merged.people[1]).toMatchObject({ label: "Partner", birthDate: "1996-11-02", sex: "female" });
  });

  it("still updates in place when the colliding record is genuinely the same human", () => {
    const mine = person(SELF_ID, "You");
    const renamed = { ...person(SELF_ID, "Me"), relation: "self", tzOffset: 1 };
    const { merged, counts } = mergePeople({ people: [mine], activeId: SELF_ID }, { people: [renamed], activeId: SELF_ID });
    expect(counts).toEqual({ added: 0, updated: 1, kept: 0, importedAsNew: 0 });
    expect(merged.people).toHaveLength(1);
    expect(merged.people[0].label).toBe("Me");
  });

  it("gives each colliding stranger its own fresh id, deterministically", () => {
    const mine = person(SELF_ID, "You");
    const a = { ...person(SELF_ID, "A"), birthDate: "1990-01-01" };
    const b = { ...person(SELF_ID, "B"), birthDate: "1991-01-01" };
    const first = mergePeople({ people: [mine], activeId: SELF_ID }, { people: [a, b], activeId: SELF_ID });
    expect(first.counts.importedAsNew).toBe(2);
    const ids = first.merged.people.map((p) => p.id);
    expect(new Set(ids).size).toBe(3);
    // Pure: the same inputs give the same ids, with no clock or randomness.
    const second = mergePeople({ people: [mine], activeId: SELF_ID }, { people: [a, b], activeId: SELF_ID });
    expect(second.merged.people.map((p) => p.id)).toEqual(ids);
  });

  it("follows the file's active person to its new id when nothing local survives to be active", () => {
    const mine = person("a", "You");
    const stranger = { ...person(SELF_ID, "Them"), birthDate: "1970-05-05" };
    const localSelf = person(SELF_ID, "Me");
    const { merged } = mergePeople(
      { people: [localSelf, mine], activeId: "gone" },
      { people: [stranger], activeId: SELF_ID },
    );
    // local activeId is dangling, so the file's choice applies — remapped.
    expect(merged.activeId).toBe(merged.people[2].id);
    expect(merged.people[2].label).toBe("Them");
  });

  it("keeps your own chart through a full applyBackup of someone else's file", () => {
    const mine = person(SELF_ID, "You");
    seed({ people: [mine] });
    const theirs = { ...person(SELF_ID, "Partner"), birthDate: "1996-11-02", sex: "female" as const };
    const s = applyBackup(file({ people: { people: [theirs], activeId: SELF_ID } }), "merge", { storage: store });
    expect(s.peopleAdded).toBe(1);
    expect(s.peopleImportedAsNew).toBe(1);
    expect(s.peopleUpdated).toBe(0);
    expect(s.peopleTotal).toBe(2);
    const stored = JSON.parse(store.getItem(PEOPLE_KEY)!) as { people: StoredPerson[]; activeId: string };
    expect(stored.people[0]).toEqual(mine);
    expect(stored.activeId).toBe(SELF_ID);
    expect(describeApply(s)).toMatch(/your chart was kept/i);
  });

  it("keeps an entry with an outcome over one without, whichever direction", () => {
    const withOutcome = entry("x", { savedAt: 1, outcome: { actualDate: "2026-08-01", rating: "great", stress: 1, helped: true, notes: "", recordedAt: 9 } });
    const without = entry("x", { savedAt: 999, note: "newer but unlogged" });
    // Incoming carries the outcome → incoming wins even though it is older.
    expect(incomingWinsJournal(without, withOutcome)).toBe(true);
    // Local carries the outcome → local is kept even though incoming is newer.
    expect(incomingWinsJournal(withOutcome, without)).toBe(false);

    const a = mergeJournals([without], [withOutcome]);
    expect(a.merged[0].outcome).toBeTruthy();
    expect(a.counts).toEqual({ added: 0, updated: 1, kept: 0 });

    const b = mergeJournals([withOutcome], [without]);
    expect(b.merged[0].outcome).toBeTruthy();
    expect(b.counts).toEqual({ added: 0, updated: 0, kept: 1 });
  });

  it("falls back to the newer savedAt, then to the incoming copy on a tie", () => {
    expect(incomingWinsJournal(entry("x", { savedAt: 10 }), entry("x", { savedAt: 20 }))).toBe(true);
    expect(incomingWinsJournal(entry("x", { savedAt: 20 }), entry("x", { savedAt: 10 }))).toBe(false);
    expect(incomingWinsJournal(entry("x", { savedAt: 10 }), entry("x", { savedAt: 10 }))).toBe(true);
  });

  // savedAt is a CREATION stamp and never moves, so an edit is only visible in
  // updatedAt. Without it, restoring last month's backup silently reverted every
  // note typed since.
  it("keeps a note edited after the backup was taken, and restores one edited before", () => {
    const original = entry("x", { savedAt: 1_000, note: "as saved" });
    const editedHere = entry("x", { savedAt: 1_000, note: "edited today", updatedAt: 9_000 });
    const editedThere = entry("x", { savedAt: 1_000, note: "edited on the other device", updatedAt: 9_000 });

    // Local was edited after the file was written → the old backup must not win.
    expect(incomingWinsJournal(editedHere, original)).toBe(false);
    const a = mergeJournals([editedHere], [original]);
    expect(a.merged[0].note).toBe("edited today");
    expect(a.counts).toEqual({ added: 0, updated: 0, kept: 1 });

    // The other direction: the file carries the newer edit, so it should land.
    expect(incomingWinsJournal(original, editedThere)).toBe(true);
    const b = mergeJournals([original], [editedThere]);
    expect(b.merged[0].note).toBe("edited on the other device");
    expect(b.counts).toEqual({ added: 0, updated: 1, kept: 0 });
  });

  it("prefers the later edit when both copies have been edited", () => {
    const older = entry("x", { savedAt: 1_000, note: "older edit", updatedAt: 5_000 });
    const newer = entry("x", { savedAt: 1_000, note: "newer edit", updatedAt: 6_000 });
    expect(incomingWinsJournal(older, newer)).toBe(true);
    expect(incomingWinsJournal(newer, older)).toBe(false);
  });

  it("does not resurrect an outcome the user deleted after the backup was made", () => {
    const outcome = { actualDate: "2026-08-01", rating: "good" as const, stress: 2, helped: true, notes: "", recordedAt: 5 };
    const backedUp = entry("x", { savedAt: 1_000, outcome });
    const deletedSince = entry("x", { savedAt: 1_000, updatedAt: 9_000 }); // recordOutcome(id, null)

    expect(incomingWinsJournal(deletedSince, backedUp)).toBe(false);
    expect(incomingWinsJournal(backedUp, deletedSince)).toBe(true);
    // …but an un-edited copy without an outcome still loses to a logged one,
    // however new its creation stamp looks.
    expect(incomingWinsJournal(entry("x", { savedAt: 99_999 }), backedUp)).toBe(true);
  });

  it("preserves local order and appends genuinely new entries", () => {
    const { merged, counts } = mergeJournals([entry("x"), entry("y")], [entry("y", { savedAt: 5000 }), entry("z")]);
    expect(merged.map((e) => e.id)).toEqual(["x", "y", "z"]);
    expect(counts).toEqual({ added: 1, updated: 1, kept: 0 });
  });

  it("never destroys anything local when applied through storage", () => {
    seed({ people: [person("a")], journal: [entry("x", { note: "mine" })], priorities: { mine: true } });
    const s = applyBackup(
      file({ people: { people: [person("b")], activeId: "b" }, journal: [entry("y")], priorities: { theirs: true } }),
      "merge",
      { storage: store },
    );
    expect(s.mode).toBe("merge");
    expect(s.peopleAdded).toBe(1);
    expect(s.peopleTotal).toBe(2);
    expect(s.journalAdded).toBe(1);
    expect(s.journalTotal).toBe(2);
    // A merge must not overwrite a priority profile the user has right now.
    expect(s.priorities).toBe("kept");
    expect(JSON.parse(store.getItem(PRIORITIES_KEY)!)).toEqual({ mine: true });
    expect(JSON.parse(store.getItem(PEOPLE_KEY)!).activeId).toBe("a");
  });

  it("restores priorities on merge when the device has none", () => {
    const s = applyBackup(
      file({ people: { people: [person("a")], activeId: "a" }, priorities: { pace: "calm" } }),
      "merge",
      { storage: store },
    );
    expect(s.priorities).toBe("restored");
    expect(JSON.parse(store.getItem(PRIORITIES_KEY)!)).toEqual({ pace: "calm" });
  });

  it("reports absent priorities without touching the local ones", () => {
    seed({ priorities: { mine: true } });
    const s = applyBackup(file({ journal: [entry("x")] }), "merge", { storage: store });
    expect(s.priorities).toBe("absent");
    expect(JSON.parse(store.getItem(PRIORITIES_KEY)!)).toEqual({ mine: true });
  });
});

describe("replace semantics", () => {
  it("keeps only the file's contents", () => {
    seed({ people: [person("a")], journal: [entry("x"), entry("y")], priorities: { mine: true } });
    const s = applyBackup(
      file({ people: { people: [person("b")], activeId: "b" }, journal: [entry("z")], priorities: { theirs: true } }),
      "replace",
      { storage: store },
    );
    expect(s.mode).toBe("replace");
    expect(s.peopleTotal).toBe(1);
    expect(s.journalTotal).toBe(1);
    expect(JSON.parse(store.getItem(PEOPLE_KEY)!).people.map((p: StoredPerson) => p.id)).toEqual(["b"]);
    expect(JSON.parse(store.getItem(JOURNAL_KEY)!).map((e: JournalEntry) => e.id)).toEqual(["z"]);
    expect(JSON.parse(store.getItem(PRIORITIES_KEY)!)).toEqual({ theirs: true });
    expect(s.priorities).toBe("restored");
  });

  it("clears the priority profile when the file has none", () => {
    seed({ people: [person("a")], priorities: { mine: true } });
    const s = applyBackup(file({ people: { people: [person("b")], activeId: "b" } }), "replace", { storage: store });
    expect(s.priorities).toBe("cleared");
    expect(store.getItem(PRIORITIES_KEY)).toBeNull();
  });

  it("clears the legacy mirror when the file has no people", () => {
    seed({ people: [person("a")] });
    store.map.set(LEGACY_PERSON_KEY, JSON.stringify(person("a")));
    applyBackup(file({ journal: [entry("x")] }), "replace", { storage: store });
    expect(store.getItem(LEGACY_PERSON_KEY)).toBeNull();
  });
});

describe("hostile storage", () => {
  it("reports a write failure instead of throwing", () => {
    seed({ people: [person("a")] });
    store.readonly = true;
    const s = applyBackup(file({ people: { people: [person("b")], activeId: "b" } }), "merge", { storage: store });
    expect(s.storageError).toBeTruthy();
    expect(s.storageError).toContain("QuotaExceededError");
  });

  it("reports having no storage at all", () => {
    const s = applyBackup(file({ people: { people: [person("b")], activeId: "b" } }), "merge", { storage: null });
    expect(s.storageError).toMatch(/isn't letting the app store data/);
    expect(describeApply(s)).toMatch(/nothing was restored/i);
  });

  // A restore is four separate writes; a throw between them used to leave the
  // store half-restored while the error text implied nothing had changed.
  it("rolls back the keys it already wrote when a later write throws", () => {
    seed({ people: [person("a")], journal: [entry("x", { note: "mine" })] });
    const peopleBefore = store.getItem(PEOPLE_KEY)!;
    const journalBefore = store.getItem(JOURNAL_KEY)!;
    store.blocked.add(JOURNAL_KEY); // people + legacy land, then the journal fails

    const s = applyBackup(
      file({ people: { people: [person("b")], activeId: "b" }, journal: [entry("y")] }),
      "merge",
      { storage: store },
    );

    expect(s.storageError).toContain("QuotaExceededError");
    expect(s.storageRolledBack).toBe(true);
    expect(store.getItem(PEOPLE_KEY)).toBe(peopleBefore);
    expect(store.getItem(JOURNAL_KEY)).toBe(journalBefore);
    // The legacy mirror was written and then removed again — it wasn't there before.
    expect(store.getItem(LEGACY_PERSON_KEY)).toBeNull();
    expect(describeApply(s)).toMatch(/nothing was restored/i);
    expect(s.storageError).toMatch(/exactly as they were/i);
  });

  it("says so honestly when even the rollback fails", () => {
    seed({ people: [person("a")], journal: [entry("x")] });
    store.failAfterWrites = 2; // people + legacy land, then nothing works again

    const s = applyBackup(
      file({ people: { people: [person("b")], activeId: "b" }, journal: [entry("y")] }),
      "merge",
      { storage: store },
    );

    expect(s.storageRolledBack).toBe(false);
    expect(s.storageError).toMatch(/may now be a mix/i);
    expect(describeApply(s)).toMatch(/didn't finish/i);
    expect(describeApply(s)).not.toMatch(/merged in/i);
  });
});

describe("no aliasing of live state", () => {
  it("gives each backup its own arrays, so mutating one can't corrupt another", () => {
    const a = buildBackup({ storage: store, now: NOW });
    a.people.people.push(person("intruder"));
    a.journal.push(entry("intruder"));
    const b = buildBackup({ storage: store, now: NOW });
    expect(b.people.people).toEqual([]);
    expect(b.journal).toEqual([]);
    const parsed = parseBackup(JSON.stringify(file({ journal: [entry("x")] })));
    expect(parsed.ok && parsed.data.people.people).toEqual([]);
  });
});
