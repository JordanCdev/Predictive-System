/** Decision journal — a small localStorage-backed log of decisions the user has
 *  chosen to remember (ROADMAP §5 item 11). The engine stays deterministic; this
 *  is purely user data. Each entry is a self-contained SNAPSHOT of the reading at
 *  save time, so revisiting it never depends on re-evaluation or the window. */

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

export function removeEntry(id: string): JournalEntry[] {
  return persist(loadJournal().filter((e) => e.id !== id));
}

export function updateNote(id: string, note: string): JournalEntry[] {
  return persist(loadJournal().map((e) => (e.id === id ? { ...e, note } : e)));
}

export function hasEntry(objectiveId: string, isoDate: string): boolean {
  return loadJournal().some((e) => e.id === entryId(objectiveId, isoDate));
}
