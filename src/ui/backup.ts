/**
 * Data portability — export and restore everything this app knows about you.
 *
 * Why this exists: the app stores your cast of people, your entire decision
 * journal and every AI conversation you have had with it in this browser's
 * localStorage. Clearing site data (or switching
 * browser, or a private window closing) destroys all of it silently. A backup
 * file is the only honest answer to that, and it is FREE — losing your data is
 * not a paid feature, and portability is a right, not an upsell.
 *
 * This module is deliberately PURE and React-free: every function takes an
 * optional storage handle so it can be exercised in a node test with a fake.
 * Nothing here touches the engine's scoring path; it only moves user data
 * around. Wall-clock reads (the `exportedAt` stamp) happen in this UI layer and
 * are injectable, so the tests stay deterministic.
 *
 * SECURITY: `wei_ai_key` is the user's own API secret. It is never read, never
 * exported and never written by this module — a backup file is something people
 * email themselves. Only the data keys below are in scope.
 *
 * PRIVACY, on the AI conversations added in v3: a saved conversation is made of
 * the user's own questions and the readings they were given. It is their data,
 * exactly like their journal, so it belongs in their backup and in their own
 * account — and nowhere else. It is NOT a secret the way the API key is, so it
 * is exported; but it is personal, so the panel says plainly that the file is
 * readable by anyone who gets hold of it.
 */
import { VERSIONS } from "../engine/version.ts";
import { THREADS_STORE_KEY, parseThreads, sortThreads, type ChatThread } from "./chat/threadStore.ts";
import { isReflection, lastModified, type JournalEntry, type Reflection } from "./journalStore.ts";
import { PeopleState, StoredPerson, activePerson, migrate } from "./profile/peopleStore.ts";

/**
 * The bump-me-when-the-shape-changes number written into every export.
 *
 * v1 → v2: daily reflections joined the file.
 * v2 → v3: saved AI conversations joined the file.
 *
 * Every older file is still accepted exactly as before — an absent `reflections`
 * or `threads` key just reads as an empty list — and only versions ABOVE the
 * current one are refused.
 */
export const BACKUP_SCHEMA_VERSION = 3;

export const PEOPLE_KEY = "wei_people_v1";
/** Legacy single profile. Read so an old install still exports, written on
 *  restore so an older build (or a rollback) finds a profile where it expects one. */
export const LEGACY_PERSON_KEY = "wei_person_v1";
export const JOURNAL_KEY = "wei_journal_v1";
/** Daily reflections — the mood-and-a-line rows kept by journalStore. */
export const REFLECTIONS_KEY = "wei_reflections_v1";
/** Owned by the priorities feature; this module only ever passes it through. */
export const PRIORITIES_KEY = "wei_priorities_v1";
/** Saved AI conversations. Re-exported from chat/threadStore.ts rather than
 *  restated, so the two can never drift apart the way a copied literal would. */
export const THREADS_KEY = THREADS_STORE_KEY;

/** Keys that must NEVER appear in a backup. `wei_ai_key` is an API secret.
 *  Note what is NOT here: the conversations themselves. A transcript is the
 *  user's own writing, not a credential, so it travels in their backup — see the
 *  privacy note at the top of this file. */
export const EXCLUDED_KEYS = ["wei_ai_key", "wei_ai_consent", "wei_ai_model"] as const;

/** A restore file bigger than this is not a Wéi backup — refuse before parsing. */
export const MAX_BACKUP_BYTES = 8 * 1024 * 1024;

/** The minimal slice of localStorage this module needs. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface BackupFile {
  schemaVersion: number;
  /** ISO instant the file was written (UI wall-clock — never an engine input). */
  exportedAt: string;
  /** Which build wrote it, so a future importer can reason about the contents. */
  appVersion: string;
  /** Full version registry, for diagnostics if a restore ever looks wrong. */
  engineVersions: Record<string, string>;
  people: PeopleState;
  journal: JournalEntry[];
  /** Daily reflections. Absent from v1 files, which read as an empty list. */
  reflections: Reflection[];
  /** Saved AI conversations. Absent from v1 and v2 files, which read as empty. */
  threads: ChatThread[];
  /** Opaque pass-through of the priority profile, or null when there isn't one. */
  priorities: unknown;
}

export interface BackupSummary {
  people: number;
  journal: number;
  journalWithOutcomes: number;
  reflections: number;
  /** Saved AI conversations in the file. Named in the UI preview, because a file
   *  that silently carries — or silently lacks — someone's chat history is
   *  exactly the kind of understatement a restore confirmation must not make. */
  threads: number;
  hasPriorities: boolean;
  exportedAt: string | null;
  appVersion: string | null;
}

export type ParseResult =
  | { ok: true; data: BackupFile; summary: BackupSummary }
  | { ok: false; error: string };

export type BackupMode = "merge" | "replace";

export interface ApplySummary {
  mode: BackupMode;
  peopleAdded: number;
  /** Existing people overwritten by the incoming copy. */
  peopleUpdated: number;
  /** Of `peopleAdded`, how many shared an id with someone here but had different
   *  birth data, so they were added separately rather than overwriting them. */
  peopleImportedAsNew: number;
  peopleTotal: number;
  journalAdded: number;
  /** Local entries replaced by the incoming copy. */
  journalUpdated: number;
  /** Duplicates where the local copy won and the incoming one was discarded. */
  journalKept: number;
  journalTotal: number;
  reflectionsAdded: number;
  /** Local reflections replaced by a newer incoming copy of the same day. */
  reflectionsUpdated: number;
  /** Same-day duplicates where the local copy was newer and was kept. */
  reflectionsKept: number;
  reflectionsTotal: number;
  threadsAdded: number;
  /** Local conversations replaced by a more recently updated incoming copy. */
  threadsUpdated: number;
  /** Same-id conversations where the local copy was newer and was kept. */
  threadsKept: number;
  threadsTotal: number;
  priorities: "restored" | "kept" | "cleared" | "absent";
  /** Non-null when the browser refused to persist (private mode / quota). The
   *  caller must tell the user the restore did not stick. */
  storageError: string | null;
  /** Only meaningful alongside `storageError`: true when every key this restore
   *  had already touched was put back, so the device is exactly as it was. False
   *  means the store is in a partial state and we must say so rather than imply
   *  nothing happened. */
  storageRolledBack: boolean;
}

// ── storage plumbing ─────────────────────────────────────────────────────────

/** The browser's localStorage, or null wherever it isn't available (node tests,
 *  hardened private modes that throw on property access). */
export function browserStorage(): StorageLike | null {
  try {
    const s = (globalThis as { localStorage?: StorageLike }).localStorage;
    return s ?? null;
  } catch {
    return null;
  }
}

function readRaw(store: StorageLike | null, key: string): string | null {
  if (!store) return null;
  try {
    return store.getItem(key);
  } catch {
    return null;
  }
}

function readJson(store: StorageLike | null, key: string): unknown {
  const raw = readRaw(store, key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

// ── reading what's stored ────────────────────────────────────────────────────

/** Structural check for a journal entry. Anything that fails is dropped rather
 *  than thrown on — one corrupt row must never cost the user the other 200. */
export function isJournalEntry(v: unknown): v is JournalEntry {
  const e = v as Partial<JournalEntry> | null;
  return !!e && typeof e === "object" && typeof e.id === "string" && e.id.length > 0;
}

function normaliseJournal(v: unknown): JournalEntry[] {
  return Array.isArray(v) ? v.filter(isJournalEntry) : [];
}

/** Same tolerance for reflections: corrupt rows are dropped, never thrown on.
 *  `isReflection` is the journalStore's own structural check, so a backup can
 *  never smuggle in a row the app itself would refuse to load. */
function normaliseReflections(v: unknown): Reflection[] {
  return Array.isArray(v) ? v.filter(isReflection) : [];
}

/** Saved conversations go through the thread store's OWN defensive reader — the
 *  same one the chat panel boots with — for the same reason reflections go
 *  through `isReflection`: a backup must never smuggle in a thread the app
 *  itself would refuse to load, and it must never invent a second opinion about
 *  what a valid thread is. Corrupt rows are dropped, not thrown on. */
function normaliseThreads(v: unknown): ChatThread[] {
  return parseThreads(v);
}

/** When a thread was last touched. Tolerant of a missing or junk stamp — an
 *  undated thread sorts oldest and loses a merge, rather than throwing. */
export function threadUpdatedAt(t: ChatThread): number {
  const v: unknown = t.updatedAt;
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

/** `migrate()` can hand back the shared EMPTY_PEOPLE constant, so anything that
 *  ends up in a long-lived backup object gets its own array first. A backup must
 *  never alias live app state. */
function cloneState(s: PeopleState): PeopleState {
  return { people: s.people.slice(), activeId: s.activeId };
}

/**
 * Collect everything worth keeping into one versioned object.
 *
 * The legacy single-profile key is folded in via `migrate()`, so someone who has
 * never touched the multi-person UI still exports their chart.
 */
export function buildBackup(opts: { storage?: StorageLike | null; now?: Date } = {}): BackupFile {
  const store = opts.storage === undefined ? browserStorage() : opts.storage;
  const people = cloneState(migrate(readJson(store, PEOPLE_KEY), readJson(store, LEGACY_PERSON_KEY)));
  const journal = normaliseJournal(readJson(store, JOURNAL_KEY));
  const reflections = normaliseReflections(readJson(store, REFLECTIONS_KEY));
  const threads = normaliseThreads(readJson(store, THREADS_KEY));
  const priorities = readJson(store, PRIORITIES_KEY);
  return {
    schemaVersion: BACKUP_SCHEMA_VERSION,
    exportedAt: (opts.now ?? new Date()).toISOString(),
    appVersion: VERSIONS.engine,
    engineVersions: { ...VERSIONS },
    people,
    journal,
    reflections,
    threads,
    priorities: priorities ?? null,
  };
}

/** How many saved conversations this device holds right now. Exported so the
 *  panel can warn before a Replace erases them, without the panel needing to
 *  know the thread store's own API. */
export function localThreadCount(opts: { storage?: StorageLike | null } = {}): number {
  const store = opts.storage === undefined ? browserStorage() : opts.storage;
  return normaliseThreads(readJson(store, THREADS_KEY)).length;
}

export function summarise(data: BackupFile): BackupSummary {
  return {
    people: data.people.people.length,
    journal: data.journal.length,
    journalWithOutcomes: data.journal.filter((e) => e.outcome).length,
    reflections: data.reflections.length,
    threads: data.threads.length,
    hasPriorities: data.priorities !== null && data.priorities !== undefined,
    exportedAt: typeof data.exportedAt === "string" ? data.exportedAt : null,
    appVersion: typeof data.appVersion === "string" ? data.appVersion : null,
  };
}

/** Filename for a downloaded backup: dated, so a folder of them sorts sensibly. */
export function backupFilename(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `wei-backup-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.json`;
}

export function serializeBackup(data: BackupFile): string {
  return JSON.stringify(data, null, 2);
}

// ── reading a file back ──────────────────────────────────────────────────────

/**
 * Parse a restore file. Never throws: every failure comes back as a sentence we
 * are willing to show a person who has just lost their data and is anxious.
 */
export function parseBackup(text: string): ParseResult {
  if (typeof text !== "string" || text.trim().length === 0) {
    return { ok: false, error: "That file is empty." };
  }
  if (text.length > MAX_BACKUP_BYTES) {
    return {
      ok: false,
      error: "That file is far larger than a Wéi backup should ever be, so it wasn't opened. Check you picked the right file.",
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    return { ok: false, error: "That file isn't valid JSON, so it isn't a Wéi backup. Pick the .json file you downloaded from this page." };
  }

  const raw = parsed as Partial<BackupFile> | null;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, error: "That file doesn't look like a Wéi backup — it should be a single JSON object." };
  }
  if (typeof raw.schemaVersion !== "number" || !Number.isFinite(raw.schemaVersion) || raw.schemaVersion < 1) {
    return { ok: false, error: "That file doesn't look like a Wéi backup — it has no backup version number." };
  }
  if (raw.schemaVersion > BACKUP_SCHEMA_VERSION) {
    return {
      ok: false,
      error: `That backup was made by a newer version of the app (backup format ${raw.schemaVersion}; this build reads up to ${BACKUP_SCHEMA_VERSION}). Update the app, then try again — nothing has been changed here.`,
    };
  }

  const hasPeople = !!raw.people && typeof raw.people === "object" && Array.isArray((raw.people as PeopleState).people);
  const hasJournal = Array.isArray(raw.journal);
  // v1 files legitimately have no `reflections` key at all, and v1/v2 files have
  // no `threads` key — that is not damage, it just reads as an empty list. A
  // reflections-only or conversations-only file IS restorable.
  const hasReflections = Array.isArray(raw.reflections);
  const hasThreads = Array.isArray(raw.threads);
  if (!hasPeople && !hasJournal && !hasReflections && !hasThreads) {
    return { ok: false, error: "That file is valid JSON but carries no people and no journal, so there's nothing to restore." };
  }

  // Reuse the same tolerant loader the app boots with: malformed people are
  // dropped, and a dangling activeId is repaired, rather than importing junk.
  const people = cloneState(migrate(raw.people ?? null, null));
  const journal = normaliseJournal(raw.journal);
  const reflections = normaliseReflections(raw.reflections);
  const threads = normaliseThreads(raw.threads);
  if (people.people.length === 0 && journal.length === 0 && reflections.length === 0 && threads.length === 0) {
    return { ok: false, error: "Nothing in that file could be read as a person or a journal entry. It may be damaged." };
  }

  const data: BackupFile = {
    schemaVersion: raw.schemaVersion,
    exportedAt: typeof raw.exportedAt === "string" ? raw.exportedAt : "",
    appVersion: typeof raw.appVersion === "string" ? raw.appVersion : "",
    engineVersions:
      raw.engineVersions && typeof raw.engineVersions === "object" ? (raw.engineVersions as Record<string, string>) : {},
    people,
    journal,
    reflections,
    threads,
    priorities: raw.priorities ?? null,
  };
  return { ok: true, data, summary: summarise(data) };
}

// ── merge rules ──────────────────────────────────────────────────────────────

/**
 * Which of two journal entries with the same id survives a merge?
 *
 * THE RULE, in order:
 *   1. An entry carrying an outcome beats one that doesn't. A logged outcome is
 *      the scarcest, most deliberate thing in the store — the user sat down
 *      after the event and recorded how it went — and it can't be reconstructed.
 *      A note can be retyped; an outcome can't be re-lived.
 *      EXCEPT — the resurrection case: if the copy WITHOUT an outcome carries an
 *      explicit `updatedAt` newer than the logged copy, the user deliberately
 *      deleted that outcome after the backup was taken, and a restore must not
 *      bring it back. Only an explicit edit stamp counts here; a bare `savedAt`
 *      is a creation date and proves nothing about a deletion.
 *   2. Otherwise the more recently MODIFIED copy wins — `updatedAt` when the
 *      entry has been edited, `savedAt` otherwise (see journalStore.lastModified).
 *      `savedAt` alone is a creation stamp and never moves, so comparing it was
 *      inert for edited entries: an older backup could overwrite newer notes.
 *   3. On a dead tie, the incoming copy wins, matching the "incoming wins"
 *      convention used for people.
 *
 * Returns true when the INCOMING entry should replace the local one.
 */
export function incomingWinsJournal(local: JournalEntry, incoming: JournalEntry): boolean {
  const localOutcome = !!local.outcome;
  const incomingOutcome = !!incoming.outcome;
  const localAt = lastModified(local);
  const incomingAt = lastModified(incoming);

  if (localOutcome !== incomingOutcome) {
    const bare = localOutcome ? incoming : local;
    const loggedAt = localOutcome ? localAt : incomingAt;
    const bareEditedAt = typeof bare.updatedAt === "number" && Number.isFinite(bare.updatedAt) ? bare.updatedAt : null;
    const deletedDeliberately = bareEditedAt !== null && bareEditedAt > loggedAt;
    // Rule 1 unless the outcome was demonstrably removed on purpose afterwards.
    if (!deletedDeliberately) return incomingOutcome;
    return !incomingOutcome;
  }

  if (incomingAt !== localAt) return incomingAt > localAt;
  return true;
}

export interface MergeCounts {
  added: number;
  updated: number;
  kept: number;
}

/** Merge two journals by id under `incomingWinsJournal`. Pure; local order is
 *  preserved and genuinely new incoming entries are appended. */
export function mergeJournals(
  local: JournalEntry[],
  incoming: JournalEntry[],
): { merged: JournalEntry[]; counts: MergeCounts } {
  const byId = new Map<string, JournalEntry>();
  const order: string[] = [];
  for (const e of local) {
    if (!byId.has(e.id)) order.push(e.id);
    byId.set(e.id, e);
  }
  const counts: MergeCounts = { added: 0, updated: 0, kept: 0 };
  for (const e of incoming) {
    const existing = byId.get(e.id);
    if (!existing) {
      byId.set(e.id, e);
      order.push(e.id);
      counts.added += 1;
    } else if (incomingWinsJournal(existing, e)) {
      byId.set(e.id, e);
      counts.updated += 1;
    } else {
      counts.kept += 1;
    }
  }
  return { merged: order.map((id) => byId.get(id)!), counts };
}

/**
 * Merge daily reflections by their day. Far simpler than the journal rule
 * because a reflection has exactly one timestamp: `savedAt` is re-stamped on
 * every edit (see journalStore), so "newer savedAt wins" IS the last-edit rule
 * — there is no outcome to protect and no immovable creation stamp to trip
 * over. On a dead tie the incoming copy wins, matching the convention
 * everywhere else in this module. Pure; local order preserved, new days appended.
 */
export function mergeReflections(
  local: Reflection[],
  incoming: Reflection[],
): { merged: Reflection[]; counts: MergeCounts } {
  const byDay = new Map<string, Reflection>();
  const order: string[] = [];
  for (const r of local) {
    if (!byDay.has(r.isoDate)) order.push(r.isoDate);
    byDay.set(r.isoDate, r);
  }
  const counts: MergeCounts = { added: 0, updated: 0, kept: 0 };
  for (const r of incoming) {
    const existing = byDay.get(r.isoDate);
    if (!existing) {
      byDay.set(r.isoDate, r);
      order.push(r.isoDate);
      counts.added += 1;
    } else if (r.savedAt >= existing.savedAt) {
      byDay.set(r.isoDate, r);
      counts.updated += 1;
    } else {
      counts.kept += 1;
    }
  }
  // The store's documented order is newest day first; insertion order after a
  // merge interleaves the two histories, so re-sort before persisting.
  const merged = order.map((d) => byDay.get(d)!).sort((a, b) => b.isoDate.localeCompare(a.isoDate));
  return { merged, counts };
}

/**
 * Merge saved AI conversations by thread id, newest `updatedAt` winning.
 *
 * Last-writer-wins per thread is right here for the same reason it is right for
 * reflections: a thread carries exactly one edit stamp, re-stamped whenever a
 * turn is appended, so "newer updatedAt" IS "has more of the conversation in
 * it". There is nothing scarce to protect the way a logged outcome is, because
 * a longer transcript is a superset of a shorter one.
 *
 * What this merge will never do is DROP a thread. A conversation the file has
 * never seen stays exactly where it is — restoring an old backup must not cost
 * the user last night's chat. On a dead tie the incoming copy wins, matching the
 * convention everywhere else in this module.
 *
 * WHY THIS EXISTS ALONGSIDE `threadStore.mergeThreads`, which the cloud sync
 * uses: that one answers "which list", this one also answers "and what happened
 * to each row", because a restore has to be able to TELL the user what it did.
 * They agree on the rule that decides the data (newest wins, nothing dropped)
 * and on the resulting order — `sortThreads` is shared, so a restored list and a
 * synced list read identically, pinned conversations first.
 */
export function mergeThreads(
  local: ChatThread[],
  incoming: ChatThread[],
): { merged: ChatThread[]; counts: MergeCounts } {
  const byId = new Map<string, ChatThread>();
  const order: string[] = [];
  for (const t of local) {
    if (!byId.has(t.id)) order.push(t.id);
    byId.set(t.id, t);
  }
  const counts: MergeCounts = { added: 0, updated: 0, kept: 0 };
  for (const t of incoming) {
    const existing = byId.get(t.id);
    if (!existing) {
      byId.set(t.id, t);
      order.push(t.id);
      counts.added += 1;
    } else if (threadUpdatedAt(t) >= threadUpdatedAt(existing)) {
      byId.set(t.id, t);
      counts.updated += 1;
    } else {
      counts.kept += 1;
    }
  }
  // Insertion order after a merge interleaves two histories; the store's own
  // list order is what the panel reads, so hand back that (the same defect
  // mergeReflections had to fix for the day list).
  return { merged: sortThreads(order.map((id) => byId.get(id)!)), counts };
}

export interface PeopleMergeCounts extends MergeCounts {
  /** Incoming people whose id collided with a DIFFERENT human here, and who were
   *  therefore imported under a fresh id instead of overwriting anyone. Counted
   *  in `added` too — they really are new people on this device. */
  importedAsNew: number;
}

/**
 * Do two records describe the same human, or just share an id?
 *
 * Only the birth facts count: they are what the chart is computed from, and they
 * are the one thing a person cannot casually change. Labels, relations and
 * timezone tweaks are all editable, so a difference there is an edit, not a
 * different human.
 */
function sameHuman(a: StoredPerson, b: StoredPerson): boolean {
  return a.birthDate === b.birthDate && (a.birthTime ?? "") === (b.birthTime ?? "") && a.sex === b.sex;
}

/** A free id derived only from the colliding one, so the merge stays pure and
 *  deterministic — no clock, no randomness. */
function freshPersonId(base: string, taken: Set<string>): string {
  let candidate = `${base}_imported`;
  let n = 2;
  while (taken.has(candidate)) candidate = `${base}_imported_${n++}`;
  return candidate;
}

/**
 * Merge two casts by id. Nobody is ever dropped: a local person absent from the
 * backup stays exactly where they were, and the active person is preserved if
 * they still exist, so a merge doesn't silently swap whose chart you're reading.
 *
 * THE ID COLLISION TRAP: every install's primary person is stored under the same
 * id ("self"), so restoring a partner's — or a colleague's, or a shared device's
 * — backup would collide with YOUR chart and, under a mode advertised as
 * non-destructive, overwrite your birth data with theirs. So a colliding id is
 * not taken as proof of the same human. When the birth facts match, the incoming
 * copy wins as before (it is the same person, and the user chose this file).
 * When they differ, the incoming record is imported under a fresh id: your chart
 * stays yours and theirs is added alongside.
 */
export function mergePeople(
  local: PeopleState,
  incoming: PeopleState,
): { merged: PeopleState; counts: PeopleMergeCounts } {
  const byId = new Map<string, StoredPerson>();
  const order: string[] = [];
  for (const p of local.people) {
    if (!byId.has(p.id)) order.push(p.id);
    byId.set(p.id, p);
  }
  const counts: PeopleMergeCounts = { added: 0, updated: 0, kept: 0, importedAsNew: 0 };
  /** Old id → the id it was actually stored under, so activeId can follow. */
  const remapped = new Map<string, string>();

  for (const p of incoming.people) {
    const existing = byId.get(p.id);
    if (!existing) {
      byId.set(p.id, p);
      order.push(p.id);
      counts.added += 1;
      continue;
    }
    if (sameHuman(existing, p)) {
      byId.set(p.id, p);
      counts.updated += 1;
      continue;
    }
    const id = freshPersonId(p.id, new Set(byId.keys()));
    byId.set(id, { ...p, id });
    order.push(id);
    remapped.set(p.id, id);
    counts.added += 1;
    counts.importedAsNew += 1;
  }

  const people = order.map((id) => byId.get(id)!);
  const incomingActive = incoming.activeId ? (remapped.get(incoming.activeId) ?? incoming.activeId) : null;
  const activeId =
    people.some((p) => p.id === local.activeId) ? local.activeId
    : people.some((p) => p.id === incomingActive) ? incomingActive
    : (people[0]?.id ?? null);
  return { merged: { people, activeId }, counts };
}

// ── applying ─────────────────────────────────────────────────────────────────

/**
 * Write a parsed backup into storage.
 *
 * MERGE (the default) is additive and never destroys: nothing local disappears.
 * REPLACE overwrites the cast, the journal, the reflections, the saved AI
 * conversations and the priority profile with the file's contents — the UI must
 * have taken an explicit second confirmation, naming all of them, before calling
 * it. Neither mode touches the AI keys.
 *
 * Never throws: a storage failure comes back as `storageError` so the caller can
 * be honest that the restore did not stick.
 */
export function applyBackup(
  data: BackupFile,
  mode: BackupMode = "merge",
  opts: { storage?: StorageLike | null } = {},
): ApplySummary {
  const store = opts.storage === undefined ? browserStorage() : opts.storage;

  const localPeople = migrate(readJson(store, PEOPLE_KEY), readJson(store, LEGACY_PERSON_KEY));
  const localJournal = normaliseJournal(readJson(store, JOURNAL_KEY));
  const localReflections = normaliseReflections(readJson(store, REFLECTIONS_KEY));
  const localThreads = normaliseThreads(readJson(store, THREADS_KEY));
  const incomingPriorities = data.priorities ?? null;

  let people: PeopleState;
  let journal: JournalEntry[];
  let reflections: Reflection[];
  let threads: ChatThread[];
  let peopleCounts: PeopleMergeCounts;
  let journalCounts: MergeCounts;
  let reflectionCounts: MergeCounts;
  let threadCounts: MergeCounts;
  let priorities: ApplySummary["priorities"];

  if (mode === "replace") {
    people = data.people;
    journal = data.journal;
    // Replace means the file's contents, exactly — so a v1 file (no reflections)
    // or a v1/v2 file (no conversations) leaves an empty list, the same way a
    // file with no priorities clears them. The panel warns before this happens.
    reflections = data.reflections;
    threads = data.threads;
    peopleCounts = { added: data.people.people.length, updated: 0, kept: 0, importedAsNew: 0 };
    journalCounts = { added: data.journal.length, updated: 0, kept: 0 };
    reflectionCounts = { added: data.reflections.length, updated: 0, kept: 0 };
    threadCounts = { added: data.threads.length, updated: 0, kept: 0 };
    priorities = incomingPriorities !== null ? "restored" : "cleared";
  } else {
    const p = mergePeople(localPeople, data.people);
    const j = mergeJournals(localJournal, data.journal);
    // A merge is additive: a v1 file simply contributes no reflections, and
    // nothing local is ever removed by it.
    const r = mergeReflections(localReflections, data.reflections);
    const t = mergeThreads(localThreads, data.threads);
    people = p.merged;
    journal = j.merged;
    reflections = r.merged;
    threads = t.merged;
    peopleCounts = p.counts;
    journalCounts = j.counts;
    reflectionCounts = r.counts;
    threadCounts = t.counts;
    // A merge never removes a priority profile the user already has; the file's
    // copy only fills a gap, so restoring an old backup can't wipe today's answers.
    const localPriorities = readRaw(store, PRIORITIES_KEY);
    priorities =
      incomingPriorities === null ? "absent"
      : localPriorities ? "kept"
      : "restored";
  }

  let storageError: string | null = null;
  // Absent a storage failure there is nothing to roll back, so "true" reads as
  // "the device is in a consistent state", which it is.
  let storageRolledBack = true;
  if (!store) {
    storageError = "This browser isn't letting the app store data, so nothing was saved.";
  } else {
    // This is several separate writes, and a quota or private-mode throw can
    // land between any two of them — leaving people restored but the journal
    // not, for instance. So snapshot every key first and put them back on
    // failure, rather than telling the user "nothing may have been kept" and
    // hoping. Every key written below must appear in this list.
    const before = new Map<string, string | null>(
      [PEOPLE_KEY, LEGACY_PERSON_KEY, JOURNAL_KEY, REFLECTIONS_KEY, THREADS_KEY, PRIORITIES_KEY].map((k) => [
        k,
        readRaw(store, k),
      ]),
    );
    const touched: string[] = [];
    const put = (key: string, value: string) => {
      store.setItem(key, value);
      touched.push(key);
    };
    const drop = (key: string) => {
      store.removeItem(key);
      touched.push(key);
    };
    try {
      put(PEOPLE_KEY, JSON.stringify(people));
      // Mirror the active person to the legacy key, exactly as the app does.
      const active = activePerson(people);
      if (active) put(LEGACY_PERSON_KEY, JSON.stringify(active));
      else drop(LEGACY_PERSON_KEY);
      put(JOURNAL_KEY, JSON.stringify(journal));
      put(REFLECTIONS_KEY, JSON.stringify(reflections));
      put(THREADS_KEY, JSON.stringify(threads));
      if (priorities === "restored") put(PRIORITIES_KEY, JSON.stringify(incomingPriorities));
      else if (priorities === "cleared") drop(PRIORITIES_KEY);
    } catch (e) {
      // Best effort: a store that just refused a write may refuse the undo too.
      for (const key of touched) {
        try {
          const prev = before.get(key) ?? null;
          if (prev === null) store.removeItem(key);
          else store.setItem(key, prev);
        } catch {
          storageRolledBack = false;
        }
      }
      const why = e instanceof Error && e.message ? ` (${e.message})` : "";
      storageError = storageRolledBack
        ? `This browser refused to save the restored data${why}, so the restore was undone. Your existing people and journal are exactly as they were.`
        : `This browser refused to save the restored data${why}, and undoing the part that had been written failed too. Some of your data may now be a mix of both — check your people and journal before trying again.`;
    }
  }

  return {
    mode,
    peopleAdded: peopleCounts.added,
    peopleUpdated: peopleCounts.updated,
    peopleImportedAsNew: peopleCounts.importedAsNew,
    peopleTotal: people.people.length,
    journalAdded: journalCounts.added,
    journalUpdated: journalCounts.updated,
    journalKept: journalCounts.kept,
    journalTotal: journal.length,
    reflectionsAdded: reflectionCounts.added,
    reflectionsUpdated: reflectionCounts.updated,
    reflectionsKept: reflectionCounts.kept,
    reflectionsTotal: reflections.length,
    threadsAdded: threadCounts.added,
    threadsUpdated: threadCounts.updated,
    threadsKept: threadCounts.kept,
    threadsTotal: threads.length,
    priorities,
    storageError,
    storageRolledBack,
  };
}

/** One plain sentence describing what a restore did, for the panel to show. */
export function describeApply(s: ApplySummary): string {
  const bits: string[] = [];
  // Nothing landed, so don't recite counts that never made it to disk.
  if (s.storageError) {
    return s.storageRolledBack
      ? "Nothing was restored — this browser wouldn't save it, and your existing data was left exactly as it was."
      : "The restore didn't finish, and part of it may have been written before it failed.";
  }
  const reflectionsPhrase = (n: number) => `${n} ${n === 1 ? "reflection" : "reflections"}`;
  const threadsPhrase = (n: number) => `${n} saved ${n === 1 ? "conversation" : "conversations"}`;
  if (s.mode === "replace") {
    bits.push(
      `Replaced everything with the file: ${s.peopleTotal} ${s.peopleTotal === 1 ? "person" : "people"}, ${s.journalTotal} journal ${s.journalTotal === 1 ? "entry" : "entries"}, ${reflectionsPhrase(s.reflectionsTotal)} and ${threadsPhrase(s.threadsTotal)}.`,
    );
  } else {
    bits.push(
      `Merged in ${s.peopleAdded} new ${s.peopleAdded === 1 ? "person" : "people"}, ${s.journalAdded} new journal ${s.journalAdded === 1 ? "entry" : "entries"}, ${s.reflectionsAdded} new ${s.reflectionsAdded === 1 ? "reflection" : "reflections"} and ${s.threadsAdded} new ${s.threadsAdded === 1 ? "conversation" : "conversations"}.`,
    );
    if (s.peopleImportedAsNew)
      bits.push(
        `${s.peopleImportedAsNew} of ${s.peopleImportedAsNew === 1 ? "them shared an internal id with someone already here but had different birth details, so your chart was kept and theirs was added" : "them shared internal ids with people already here but had different birth details, so your charts were kept and theirs were added"} separately.`,
      );
    const updated = s.peopleUpdated + s.journalUpdated + s.reflectionsUpdated + s.threadsUpdated;
    if (updated) bits.push(`${updated} existing ${updated === 1 ? "record was" : "records were"} updated from the file.`);
    const kept = s.journalKept + s.reflectionsKept + s.threadsKept;
    if (kept) bits.push(`${kept} of your own ${kept === 1 ? "entry was" : "entries were"} kept as the better copy.`);
    bits.push(
      `You now have ${s.peopleTotal} ${s.peopleTotal === 1 ? "person" : "people"}, ${s.journalTotal} journal ${s.journalTotal === 1 ? "entry" : "entries"}, ${reflectionsPhrase(s.reflectionsTotal)} and ${threadsPhrase(s.threadsTotal)}.`,
    );
  }
  if (s.priorities === "restored") bits.push("Your priority profile was restored.");
  if (s.priorities === "kept") bits.push("Your current priority profile was left as it is.");
  if (s.priorities === "cleared") bits.push("The file had no priority profile, so yours was cleared.");
  return bits.join(" ");
}

/** Trigger a client-side download of the backup (mirrors report.ts / ics.ts). */
export function downloadBackup(opts: { storage?: StorageLike | null; now?: Date } = {}): string {
  const now = opts.now ?? new Date();
  const data = buildBackup({ storage: opts.storage, now });
  const name = backupFilename(now);
  const blob = new Blob([serializeBackup(data)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  return name;
}
