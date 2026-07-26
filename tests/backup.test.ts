import { beforeEach, describe, expect, it } from "vitest";
import {
  BACKUP_SCHEMA_VERSION,
  BackupFile,
  JOURNAL_KEY,
  LEGACY_PERSON_KEY,
  MAX_BACKUP_BYTES,
  PEOPLE_KEY,
  PRIORITIES_KEY,
  REFLECTIONS_KEY,
  StorageLike,
  THREADS_KEY,
  applyBackup,
  backupFilename,
  buildBackup,
  describeApply,
  incomingWinsJournal,
  localThreadCount,
  mergeJournals,
  mergePeople,
  mergeReflections,
  mergeThreads,
  parseBackup,
  serializeBackup,
} from "../src/ui/backup.ts";
import type { ChatThread } from "../src/ui/chat/threadStore.ts";
import type { JournalEntry, Reflection } from "../src/ui/journalStore.ts";
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

const reflection = (isoDate: string, over: Partial<Reflection> = {}): Reflection => ({
  isoDate,
  mood: 4,
  note: "",
  savedAt: 1_000,
  ...over,
});

/** A saved conversation, in the shape the thread store persists — so a backup
 *  round trip really does go through that store's own reader unchanged. */
const thread = (id: string, updatedAt = 1_000, over: Record<string, unknown> = {}): ChatThread =>
  ({
    id,
    title: `Conversation ${id}`,
    createdAt: 500,
    updatedAt,
    turns: [{ kind: "ai", id: `${id}-1`, role: "user", content: `hello from ${id}`, at: 500 }],
    ...over,
  }) as unknown as ChatThread;

const NOW = new Date("2026-07-25T09:30:00.000Z");

/** A backup object built by hand, so a test never mutates one the module made. */
const file = (over: Partial<BackupFile> = {}): BackupFile => ({
  schemaVersion: BACKUP_SCHEMA_VERSION,
  exportedAt: NOW.toISOString(),
  appVersion: "0.3.0",
  engineVersions: {},
  people: { people: [], activeId: null },
  journal: [],
  reflections: [],
  threads: [],
  priorities: null,
  ...over,
});

let store: FakeStorage;
beforeEach(() => {
  store = new FakeStorage();
});

function seed(opts: { people?: StoredPerson[]; activeId?: string | null; journal?: JournalEntry[]; reflections?: Reflection[]; threads?: ChatThread[]; priorities?: unknown } = {}) {
  if (opts.people) {
    store.map.set(PEOPLE_KEY, JSON.stringify({ people: opts.people, activeId: opts.activeId ?? opts.people[0]?.id ?? null }));
  }
  if (opts.journal) store.map.set(JOURNAL_KEY, JSON.stringify(opts.journal));
  if (opts.reflections) store.map.set(REFLECTIONS_KEY, JSON.stringify(opts.reflections));
  if (opts.threads) store.map.set(THREADS_KEY, JSON.stringify(opts.threads));
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
    // A saved conversation IS exported (it is the user's own writing), so this
    // test has to prove the key stays out even when chat data is in the file.
    seed({ people: [person("a")], journal: [entry("x")], threads: [thread("t1")] });

    const b = buildBackup({ storage: store, now: NOW });
    const text = serializeBackup(b);
    expect(text).toContain("hello from t1");
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
      "reflections",
      "threads",
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

describe("reflections in backups (schema v2)", () => {
  /** A byte-faithful v1 file: version 1, and NO `reflections` key at all. */
  const v1Text = () =>
    JSON.stringify({
      schemaVersion: 1,
      exportedAt: NOW.toISOString(),
      appVersion: "0.3.0",
      engineVersions: {},
      people: { people: [person("a")], activeId: "a" },
      journal: [entry("x", { note: "old note" })],
      priorities: null,
    });

  it("still restores a v1 file exactly as before — absent reflections read as empty", () => {
    const r = parseBackup(v1Text());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.schemaVersion).toBe(1);
    expect(r.data.reflections).toEqual([]);
    expect(r.summary.reflections).toBe(0);
    expect(r.summary).toMatchObject({ people: 1, journal: 1 });

    const s = applyBackup(r.data, "merge", { storage: store });
    expect(s.storageError).toBeNull();
    expect(s.journalAdded).toBe(1);
    expect(s.reflectionsAdded).toBe(0);
    expect(JSON.parse(store.getItem(JOURNAL_KEY)!).map((e: JournalEntry) => e.id)).toEqual(["x"]);
  });

  it("a v1 merge never touches the reflections already on the device", () => {
    seed({ reflections: [reflection("2026-07-20", { mood: 2, note: "rough" })] });
    const r = parseBackup(v1Text());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    applyBackup(r.data, "merge", { storage: store });
    expect(JSON.parse(store.getItem(REFLECTIONS_KEY)!)).toEqual([reflection("2026-07-20", { mood: 2, note: "rough" })]);
  });

  it("rejects only versions ABOVE the current one", () => {
    const raw = JSON.parse(v1Text()) as Record<string, unknown>;
    raw.schemaVersion = BACKUP_SCHEMA_VERSION + 1;
    const r = parseBackup(JSON.stringify(raw));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("newer version of the app");
  });

  it("round-trips a v2 export with reflections byte-for-byte", () => {
    seed({
      people: [person("a")],
      journal: [entry("x")],
      reflections: [reflection("2026-07-24", { mood: 5, note: "good day", savedAt: 9_000 }), reflection("2026-07-23", { mood: 1 })],
    });
    const b = buildBackup({ storage: store, now: NOW });
    expect(b.schemaVersion).toBe(BACKUP_SCHEMA_VERSION);
    const parsed = parseBackup(serializeBackup(b));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.summary.reflections).toBe(2);

    const fresh = new FakeStorage();
    applyBackup(parsed.data, "merge", { storage: fresh });
    expect(buildBackup({ storage: fresh, now: NOW })).toEqual(b);
  });

  it("a reflections-only file is restorable", () => {
    const r = parseBackup(JSON.stringify(file({ reflections: [reflection("2026-07-24")] })));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.summary.reflections).toBe(1);
  });

  it("drops corrupt reflection rows rather than importing junk", () => {
    const r = parseBackup(
      JSON.stringify(
        file({
          reflections: [
            reflection("2026-07-24"),
            null,
            42,
            { isoDate: "not-a-date", mood: 3, note: "", savedAt: 1 },
            { isoDate: "2026-07-23", mood: 9, note: "", savedAt: 1 }, // mood out of range
            { isoDate: "2026-07-22", mood: 3, savedAt: 1 }, // note missing
          ] as unknown as Reflection[],
        }),
      ),
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.reflections).toEqual([reflection("2026-07-24")]);
  });

  it("merges by day with the newer savedAt winning, in both directions", () => {
    const olderHere = reflection("2026-07-20", { mood: 2, note: "as backed up", savedAt: 1_000 });
    const editedThere = reflection("2026-07-20", { mood: 4, note: "edited on the other device", savedAt: 9_000 });

    // Incoming is newer → it lands.
    const a = mergeReflections([olderHere], [editedThere]);
    expect(a.merged).toEqual([editedThere]);
    expect(a.counts).toEqual({ added: 0, updated: 1, kept: 0 });

    // Local is newer → the old backup must not win.
    const b = mergeReflections([editedThere], [olderHere]);
    expect(b.merged).toEqual([editedThere]);
    expect(b.counts).toEqual({ added: 0, updated: 0, kept: 1 });

    // Dead tie → incoming wins, matching the convention everywhere else.
    const tie = mergeReflections([olderHere], [reflection("2026-07-20", { mood: 3, savedAt: 1_000 })]);
    expect(tie.merged[0].mood).toBe(3);

    // The merged list comes back in the store's documented newest-first order —
    // a new incoming day must slot into place, not append (review-confirmed:
    // interleaved insertion order leaked backup history into the UI ordering).
    const c = mergeReflections([reflection("2026-07-20"), reflection("2026-07-19")], [reflection("2026-07-21")]);
    expect(c.merged.map((x) => x.isoDate)).toEqual(["2026-07-21", "2026-07-20", "2026-07-19"]);
    expect(c.counts).toEqual({ added: 1, updated: 0, kept: 0 });
  });

  it("merges through applyBackup without destroying anything local", () => {
    seed({ reflections: [reflection("2026-07-20", { note: "mine", savedAt: 5_000 })] });
    const s = applyBackup(
      file({ journal: [entry("x")], reflections: [reflection("2026-07-20", { note: "stale", savedAt: 1_000 }), reflection("2026-07-21")] }),
      "merge",
      { storage: store },
    );
    expect(s.reflectionsAdded).toBe(1);
    expect(s.reflectionsKept).toBe(1);
    expect(s.reflectionsTotal).toBe(2);
    const stored = JSON.parse(store.getItem(REFLECTIONS_KEY)!) as Reflection[];
    expect(stored.find((x) => x.isoDate === "2026-07-20")!.note).toBe("mine");
  });

  it("replace keeps only the file's reflections — and a v1 file clears them, like priorities", () => {
    seed({ people: [person("a")], reflections: [reflection("2026-07-20")] });
    const s = applyBackup(file({ people: { people: [person("b")], activeId: "b" }, reflections: [reflection("2026-07-21")] }), "replace", { storage: store });
    expect(s.reflectionsTotal).toBe(1);
    expect(JSON.parse(store.getItem(REFLECTIONS_KEY)!).map((x: Reflection) => x.isoDate)).toEqual(["2026-07-21"]);

    // A v1 file parsed today has an empty reflections list, so replace clears.
    const v1 = parseBackup(v1Text());
    expect(v1.ok).toBe(true);
    if (!v1.ok) return;
    applyBackup(v1.data, "replace", { storage: store });
    expect(JSON.parse(store.getItem(REFLECTIONS_KEY)!)).toEqual([]);
  });

  it("rolls reflections back too when a later write fails", () => {
    seed({ people: [person("a")], reflections: [reflection("2026-07-20", { note: "mine" })] });
    const before = store.getItem(REFLECTIONS_KEY)!;
    store.blocked.add(PRIORITIES_KEY); // everything lands, then the last write throws

    const s = applyBackup(file({ reflections: [reflection("2026-07-21")], priorities: { theirs: true } }), "replace", { storage: store });
    expect(s.storageError).toBeTruthy();
    expect(s.storageRolledBack).toBe(true);
    expect(store.getItem(REFLECTIONS_KEY)).toBe(before);
  });

  it("names reflections in the summary line, in both modes", () => {
    const replaced = applyBackup(file({ journal: [entry("x")], reflections: [reflection("2026-07-21")] }), "replace", { storage: store });
    expect(describeApply(replaced)).toMatch(/1 reflection\b/);

    const merged = applyBackup(file({ reflections: [reflection("2026-07-22"), reflection("2026-07-23")] }), "merge", { storage: store });
    expect(describeApply(merged)).toMatch(/2 new reflections/);
    expect(describeApply(merged)).toMatch(/you now have .*3 reflections/i);
  });
});

describe("saved AI conversations in backups (schema v3)", () => {
  /** A byte-faithful v1 file: version 1, no `reflections` and no `threads`. */
  const v1Text = () =>
    JSON.stringify({
      schemaVersion: 1,
      exportedAt: NOW.toISOString(),
      appVersion: "0.3.0",
      engineVersions: {},
      people: { people: [person("a")], activeId: "a" },
      journal: [entry("x", { note: "old note" })],
      priorities: null,
    });

  /** A byte-faithful v2 file: reflections present, `threads` absent entirely. */
  const v2Text = () =>
    JSON.stringify({
      schemaVersion: 2,
      exportedAt: NOW.toISOString(),
      appVersion: "0.3.0",
      engineVersions: {},
      people: { people: [person("a")], activeId: "a" },
      journal: [entry("x")],
      reflections: [reflection("2026-07-20", { mood: 3, note: "as it was" })],
      priorities: null,
    });

  it("reads a v1 file exactly as before — absent conversations read as an empty list", () => {
    const r = parseBackup(v1Text());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.schemaVersion).toBe(1);
    expect(r.data.threads).toEqual([]);
    expect(r.data.reflections).toEqual([]);
    expect(r.summary).toMatchObject({ people: 1, journal: 1, reflections: 0, threads: 0 });
  });

  it("reads a v2 file exactly as before, reflections and all", () => {
    const r = parseBackup(v2Text());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.schemaVersion).toBe(2);
    expect(r.data.reflections).toHaveLength(1);
    expect(r.data.threads).toEqual([]);
    expect(r.summary).toMatchObject({ people: 1, journal: 1, reflections: 1, threads: 0 });

    const s = applyBackup(r.data, "merge", { storage: store });
    expect(s.storageError).toBeNull();
    expect(s.reflectionsAdded).toBe(1);
    expect(s.threadsAdded).toBe(0);
    expect(JSON.parse(store.getItem(REFLECTIONS_KEY)!)).toHaveLength(1);
  });

  it("an old file merged in never touches the conversations already on the device", () => {
    for (const text of [v1Text(), v2Text()]) {
      store = new FakeStorage();
      seed({ threads: [thread("mine", 5_000)] });
      const r = parseBackup(text);
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      applyBackup(r.data, "merge", { storage: store });
      expect(JSON.parse(store.getItem(THREADS_KEY)!)).toEqual([thread("mine", 5_000)]);
    }
  });

  it("accepts version 3 and refuses only what is above it", () => {
    expect(BACKUP_SCHEMA_VERSION).toBe(3);
    const raw = JSON.parse(v1Text()) as Record<string, unknown>;
    raw.schemaVersion = 3;
    expect(parseBackup(JSON.stringify(raw)).ok).toBe(true);
    raw.schemaVersion = 4;
    const r = parseBackup(JSON.stringify(raw));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toContain("newer version of the app");
      expect(r.error).toContain("reads up to 3");
      expect(r.error).toMatch(/nothing has been changed/i);
    }
  });

  it("round-trips a v3 export with conversations byte-for-byte", () => {
    seed({
      people: [person("a")],
      journal: [entry("x")],
      reflections: [reflection("2026-07-24")],
      threads: [thread("t2", 9_000), thread("t1", 4_000)],
    });
    const b = buildBackup({ storage: store, now: NOW });
    expect(b.schemaVersion).toBe(3);
    const parsed = parseBackup(serializeBackup(b));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.summary.threads).toBe(2);

    const fresh = new FakeStorage();
    applyBackup(parsed.data, "merge", { storage: fresh });
    expect(buildBackup({ storage: fresh, now: NOW })).toEqual(b);
  });

  it("a conversations-only file is restorable", () => {
    const r = parseBackup(JSON.stringify(file({ threads: [thread("t1")] })));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.summary.threads).toBe(1);
    const s = applyBackup(r.data, "merge", { storage: store });
    expect(s.threadsAdded).toBe(1);
    expect(JSON.parse(store.getItem(THREADS_KEY)!)).toEqual([thread("t1")]);
  });

  it("drops corrupt conversation rows rather than importing junk", () => {
    const r = parseBackup(
      JSON.stringify(
        file({ threads: [thread("t1"), null, 42, "nope", { title: "no id" }, { id: "" }, ["array"]] as unknown as ChatThread[] }),
      ),
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.threads).toEqual([thread("t1")]);
  });

  it("merges by id with the newer updatedAt winning, in both directions", () => {
    const older = thread("t1", 1_000, { title: "as backed up" });
    const newer = thread("t1", 9_000, { title: "carried on since" });

    // Incoming is newer → it lands.
    const a = mergeThreads([older], [newer]);
    expect(a.merged).toEqual([newer]);
    expect(a.counts).toEqual({ added: 0, updated: 1, kept: 0 });

    // Local is newer → an old backup must not roll the conversation back.
    const b = mergeThreads([newer], [older]);
    expect(b.merged).toEqual([newer]);
    expect(b.counts).toEqual({ added: 0, updated: 0, kept: 1 });

    // Dead tie → incoming wins, matching the convention everywhere else.
    const tie = mergeThreads([thread("t1", 1_000, { title: "mine" })], [thread("t1", 1_000, { title: "theirs" })]);
    expect((tie.merged[0] as unknown as { title: string }).title).toBe("theirs");
  });

  it("never drops a conversation the file has never seen, and sorts newest first", () => {
    const { merged, counts } = mergeThreads(
      [thread("local-only", 7_000), thread("shared", 1_000)],
      [thread("shared", 8_000), thread("from-file", 3_000)],
    );
    expect(merged.map((t) => t.id)).toEqual(["shared", "local-only", "from-file"]);
    expect(counts).toEqual({ added: 1, updated: 1, kept: 0 });
  });

  it("treats a thread with a missing or junk stamp as oldest instead of throwing", () => {
    const undated = thread("t1", 0, { updatedAt: undefined });
    const dated = thread("t1", 5_000);
    expect(mergeThreads([undated], [dated]).merged).toEqual([dated]);
    expect(mergeThreads([dated], [undated]).counts).toEqual({ added: 0, updated: 0, kept: 1 });
  });

  it("merges through applyBackup without destroying anything local", () => {
    seed({ threads: [thread("mine", 5_000), thread("shared", 5_000, { title: "newer here" })] });
    const s = applyBackup(
      file({ threads: [thread("shared", 1_000, { title: "stale" }), thread("theirs", 2_000)] }),
      "merge",
      { storage: store },
    );
    expect(s.threadsAdded).toBe(1);
    expect(s.threadsKept).toBe(1);
    expect(s.threadsTotal).toBe(3);
    const stored = JSON.parse(store.getItem(THREADS_KEY)!) as { id: string; title: string }[];
    expect(stored.find((t) => t.id === "shared")!.title).toBe("newer here");
    expect(stored.map((t) => t.id).sort()).toEqual(["mine", "shared", "theirs"]);
  });

  it("replace keeps only the file's conversations — and a v2 file clears them, like priorities", () => {
    seed({ people: [person("a")], threads: [thread("mine")] });
    const s = applyBackup(file({ people: { people: [person("b")], activeId: "b" }, threads: [thread("theirs")] }), "replace", { storage: store });
    expect(s.threadsTotal).toBe(1);
    expect(JSON.parse(store.getItem(THREADS_KEY)!).map((t: ChatThread) => t.id)).toEqual(["theirs"]);

    const v2 = parseBackup(v2Text());
    expect(v2.ok).toBe(true);
    if (!v2.ok) return;
    applyBackup(v2.data, "replace", { storage: store });
    expect(JSON.parse(store.getItem(THREADS_KEY)!)).toEqual([]);
  });

  it("rolls conversations back too when a later write fails", () => {
    seed({ people: [person("a")], threads: [thread("mine")] });
    const before = store.getItem(THREADS_KEY)!;
    store.blocked.add(PRIORITIES_KEY); // everything lands, then the last write throws

    const s = applyBackup(file({ threads: [thread("theirs")], priorities: { theirs: true } }), "replace", { storage: store });
    expect(s.storageError).toBeTruthy();
    expect(s.storageRolledBack).toBe(true);
    expect(store.getItem(THREADS_KEY)).toBe(before);
  });

  it("names conversations in the summary line, in both modes", () => {
    const replaced = applyBackup(file({ journal: [entry("x")], threads: [thread("t1")] }), "replace", { storage: store });
    expect(describeApply(replaced)).toMatch(/1 saved conversation\b/);

    store = new FakeStorage();
    const merged = applyBackup(file({ threads: [thread("t1"), thread("t2")] }), "merge", { storage: store });
    expect(describeApply(merged)).toMatch(/2 new conversations/);
    expect(describeApply(merged)).toMatch(/you now have .*2 saved conversations/i);

    // …and a merge that keeps the local copy says so rather than staying silent.
    const kept = applyBackup(file({ threads: [thread("t1", 1)] }), "merge", { storage: store });
    expect(kept.threadsKept).toBe(1);
    expect(describeApply(kept)).toMatch(/kept as the better copy/);
  });

  it("counts what this device holds, for the Replace warning", () => {
    expect(localThreadCount({ storage: store })).toBe(0);
    seed({ threads: [thread("a"), thread("b")] });
    expect(localThreadCount({ storage: store })).toBe(2);
    store.map.set(THREADS_KEY, "{ not json");
    expect(localThreadCount({ storage: store })).toBe(0);
    expect(localThreadCount({ storage: null })).toBe(0);
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
