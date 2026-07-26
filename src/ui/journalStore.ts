/** Decision journal — a small localStorage-backed log of decisions the user has
 *  chosen to remember (ROADMAP §5 item 11). The engine stays deterministic; this
 *  is purely user data. Each entry is a self-contained SNAPSHOT of the reading at
 *  save time, so revisiting it never depends on re-evaluation or the window. */

/** How a logged decision actually turned out. Used ONLY for the user's own
 *  reflection, preference calibration and confidence wording — never as evidence
 *  that the method "works" (see feedbackSummary's disclaimer). */
export interface EventOutcome {
  /** The date the thing actually happened (may differ from the planned isoDate). */
  actualDate: string;
  /** The user's felt sense of how it went. */
  rating: "great" | "good" | "mixed" | "poor";
  /** 1 (calm) … 5 (very stressful). */
  stress: number;
  /** Did the timing advice feel helpful? */
  helped: boolean;
  notes: string;
  recordedAt: number;
}

export interface JournalEntry {
  /** Stable key: `${objectiveId}:${isoDate}` — one entry per objective+day. */
  id: string;
  objectiveId: string;
  /** Plain objective label, stored so the list renders without the engine. */
  objectiveLabel: string;
  isoDate: string;
  weekday: string;
  score: number;
  band: string;
  verdict: string;
  bestHour: string | null;
  note: string;
  /** Epoch ms when first saved (UI wall-clock — never used by the engine).
   *  This is a CREATION stamp and is deliberately never bumped, so the journal
   *  keeps its original ordering. For "which copy is newer?" use `updatedAt`. */
  savedAt: number;
  /**
   * Epoch ms of the last edit to this entry — a note change, or an outcome being
   * logged, changed or removed. Absent on entries that have never been edited
   * (and on everything written by builds before this field existed), so readers
   * must fall back to `savedAt`.
   *
   * This exists because backup/restore has to decide which of two copies of the
   * same entry is the more recent one. Without a real last-modified stamp,
   * restoring an older backup would silently overwrite notes edited since.
   * UI wall-clock only — never an engine input.
   */
  updatedAt?: number;
  /** Set once the user records how the decision turned out (Phase 7). */
  outcome?: EventOutcome;
}

/** When was this entry last meaningfully changed? Falls back to the creation
 *  stamp for entries written before `updatedAt` existed. */
export function lastModified(e: JournalEntry): number {
  const updated = typeof e.updatedAt === "number" && Number.isFinite(e.updatedAt) ? e.updatedAt : 0;
  const saved = typeof e.savedAt === "number" && Number.isFinite(e.savedAt) ? e.savedAt : 0;
  return Math.max(updated, saved);
}

const STORE = "wei_journal_v1";

export function entryId(objectiveId: string, isoDate: string): string {
  return `${objectiveId}:${isoDate}`;
}

export function loadJournal(): JournalEntry[] {
  try {
    const raw = localStorage.getItem(STORE);
    const list = raw ? (JSON.parse(raw) as JournalEntry[]) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function persist(list: JournalEntry[]): JournalEntry[] {
  try {
    localStorage.setItem(STORE, JSON.stringify(list));
  } catch {
    /* private mode / quota — the in-memory list still works this session */
  }
  return list;
}

/** Add (or replace) an entry, newest first. Returns the updated list. */
export function upsertEntry(entry: JournalEntry): JournalEntry[] {
  const rest = loadJournal().filter((e) => e.id !== entry.id);
  return persist([entry, ...rest]);
}

/**
 * Is the plan's entry allowance used up?
 *
 * Only ever blocks *new* entries. Existing ones are never trimmed to fit a
 * smaller plan — a downgrade must not destroy someone's decision history, and
 * the outcome log is what the honest-feedback loop is built on. Re-saving an
 * entry that already exists is always allowed.
 *
 * TIER DECISION (settled): decision entries and daily reflections share ONE
 * `journalEntries` allowance, so reflections count here too. Callers that don't
 * pass them get the stored list, defensively read; tests can inject their own.
 */
export function isJournalFull(
  list: JournalEntry[],
  limit: number,
  id?: string,
  reflections: Reflection[] = loadReflections(),
): boolean {
  if (id && list.some((e) => e.id === id)) return false;
  return list.length + reflections.length >= limit;
}

export function removeEntry(id: string): JournalEntry[] {
  return persist(loadJournal().filter((e) => e.id !== id));
}

/** Edit an entry's note. Stamps `updatedAt` so a later restore can tell this
 *  copy is newer than the one sitting in an old backup file. The clock is a
 *  parameter so tests stay deterministic. */
export function updateNote(id: string, note: string, now: number = Date.now()): JournalEntry[] {
  return persist(loadJournal().map((e) => (e.id === id ? { ...e, note, updatedAt: now } : e)));
}

/** Log, change or clear how a decision turned out. Also stamps `updatedAt` —
 *  in particular a REMOVAL needs a stamp, otherwise restoring an old backup
 *  would resurrect the outcome the user just deleted. */
export function recordOutcome(
  id: string,
  outcome: EventOutcome | null,
  now: number = Date.now(),
): JournalEntry[] {
  return persist(
    loadJournal().map((e) => (e.id === id ? { ...e, outcome: outcome ?? undefined, updatedAt: now } : e)),
  );
}

const RATING_SCORE: Record<EventOutcome["rating"], number> = { great: 100, good: 75, mixed: 50, poor: 25 };

/** An HONEST, reflective summary of the outcome log. It is calibration for the
 *  user's own preferences and wording — explicitly NOT a claim that the method is
 *  empirically validated. */
export interface FeedbackSummary {
  logged: number;
  withOutcome: number;
  helpfulRate: number | null; // 0–100, fraction who said the advice helped
  avoidedHelped: boolean | null;
  /** Whether higher-rated days tended to feel better (a within-user association,
   *  NOT proof of anything). null when there isn't enough data. */
  higherScoresFeltBetter: boolean | null;
  disclaimer: string;
}

export function feedbackSummary(entries: JournalEntry[]): FeedbackSummary {
  const withOutcome = entries.filter((e) => e.outcome);
  const helped = withOutcome.filter((e) => e.outcome!.helped).length;
  // Correlate the engine's day score with the felt rating — a weak within-user
  // association at best; reported cautiously, never as validation.
  let higherScoresFeltBetter: boolean | null = null;
  if (withOutcome.length >= 4) {
    const withScore = withOutcome.map((e) => ({ s: e.score, r: RATING_SCORE[e.outcome!.rating] }));
    const meanS = withScore.reduce((a, b) => a + b.s, 0) / withScore.length;
    const meanR = withScore.reduce((a, b) => a + b.r, 0) / withScore.length;
    const cov = withScore.reduce((a, b) => a + (b.s - meanS) * (b.r - meanR), 0);
    higherScoresFeltBetter = cov > 0;
  }
  return {
    logged: entries.length,
    withOutcome: withOutcome.length,
    helpfulRate: withOutcome.length ? Math.round((helped / withOutcome.length) * 100) : null,
    avoidedHelped: null,
    higherScoresFeltBetter,
    disclaimer:
      "This reflects your own experience so far — it calibrates wording and your preferences, and is not evidence that the method predicts outcomes.",
  };
}

export function hasEntry(objectiveId: string, isoDate: string): boolean {
  return loadJournal().some((e) => e.id === entryId(objectiveId, isoDate));
}

// ── Daily reflections ────────────────────────────────────────────────────────
// A lighter kind of journal row: how a day FELT, for any day, tied to nothing.
// A decision entry needs an objective and a reading; a reflection needs neither.
// Same honesty rules apply — this is the user's own record, never scoring input.

/** One per calendar day. `isoDate` is the identity; saving again replaces it. */
export interface Reflection {
  /** `YYYY-MM-DD` — the natural key. */
  isoDate: string;
  /** 1 (terrible) … 5 (great). */
  mood: number;
  /** Optional one-liner. Empty string when the user only picked a mood. */
  note: string;
  /** Epoch ms of the LAST save. Unlike a decision's `savedAt` (a creation stamp
   *  that never moves), this is bumped on every edit: the day itself is the
   *  identity here, so there is nothing to lose by re-stamping, and backup/restore
   *  needs exactly one "which copy is newer?" number. UI wall-clock only. */
  savedAt: number;
}

/** The user-facing wording for each mood, index `mood - 1`. Shared by the card,
 *  the journal list and the aria-labels so a screen reader hears the same word
 *  the sighted user sees. */
export const MOOD_LABELS = ["Terrible", "Poor", "Okay", "Good", "Great"] as const;

export function moodLabel(mood: number): string {
  return MOOD_LABELS[mood - 1] ?? "—";
}

const REFLECTIONS_STORE = "wei_reflections_v1";

/** Structural check — anything that fails is dropped rather than thrown on,
 *  matching how corrupt journal rows are treated everywhere else. */
export function isReflection(v: unknown): v is Reflection {
  const r = v as Partial<Reflection> | null;
  return (
    !!r &&
    typeof r === "object" &&
    typeof r.isoDate === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(r.isoDate) &&
    typeof r.mood === "number" &&
    Number.isInteger(r.mood) &&
    r.mood >= 1 &&
    r.mood <= 5 &&
    typeof r.note === "string" &&
    typeof r.savedAt === "number" &&
    Number.isFinite(r.savedAt)
  );
}

/** Newest day first, corrupt rows dropped, storage failures → empty list. */
export function loadReflections(): Reflection[] {
  try {
    const raw = localStorage.getItem(REFLECTIONS_STORE);
    const list = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(list) ? list.filter(isReflection) : [];
  } catch {
    return [];
  }
}

function persistReflections(list: Reflection[]): Reflection[] {
  try {
    localStorage.setItem(REFLECTIONS_STORE, JSON.stringify(list));
  } catch {
    /* private mode / quota — the in-memory list still works this session */
  }
  return list;
}

export function getReflection(isoDate: string): Reflection | null {
  return loadReflections().find((r) => r.isoDate === isoDate) ?? null;
}

/** Add or replace THE reflection for its day — one per day, always. Kept sorted
 *  newest day first so every reader sees the same order. */
export function upsertReflection(r: Reflection): Reflection[] {
  const rest = loadReflections().filter((x) => x.isoDate !== r.isoDate);
  return persistReflections([r, ...rest].sort((a, b) => b.isoDate.localeCompare(a.isoDate)));
}

export function removeReflection(isoDate: string): Reflection[] {
  return persistReflections(loadReflections().filter((r) => r.isoDate !== isoDate));
}

/**
 * Is the plan's allowance used up for a NEW reflection on `isoDate`?
 *
 * TIER DECISION (settled): reflections and decision entries draw on ONE shared
 * `journalEntries` allowance — a single honest lever, and the free tier keeps its
 * floor. So the count here is decisions + reflections together, exactly like
 * `isJournalFull` on the decision side.
 *
 * Same guarantees as `isJournalFull`: only NEW rows are ever blocked. Re-saving
 * the day's existing reflection is always allowed, and nothing already stored is
 * ever trimmed to fit a smaller plan — a downgrade must not destroy history.
 */
export function isReflectionFull(
  decisions: JournalEntry[],
  reflections: Reflection[],
  limit: number,
  isoDate?: string,
): boolean {
  if (isoDate && reflections.some((r) => r.isoDate === isoDate)) return false;
  return decisions.length + reflections.length >= limit;
}
