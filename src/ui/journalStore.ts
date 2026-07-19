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
  /** Epoch ms when saved (UI wall-clock — never used by the engine). */
  savedAt: number;
  /** Set once the user records how the decision turned out (Phase 7). */
  outcome?: EventOutcome;
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
 */
export function isJournalFull(list: JournalEntry[], limit: number, id?: string): boolean {
  if (id && list.some((e) => e.id === id)) return false;
  return list.length >= limit;
}

export function removeEntry(id: string): JournalEntry[] {
  return persist(loadJournal().filter((e) => e.id !== id));
}

export function updateNote(id: string, note: string): JournalEntry[] {
  return persist(loadJournal().map((e) => (e.id === id ? { ...e, note } : e)));
}

export function recordOutcome(id: string, outcome: EventOutcome | null): JournalEntry[] {
  return persist(
    loadJournal().map((e) => (e.id === id ? { ...e, outcome: outcome ?? undefined } : e)),
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
