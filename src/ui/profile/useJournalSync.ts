/**
 * Decision-journal state, with cloud sync when signed in.
 *
 * The journal was local-only: `saveJournalEntryCloud` and friends existed in the
 * Firebase client but nothing ever called them. That made two things untrue at
 * once — the privacy notice says signed-in records sync, and a subscriber who
 * changed device silently lost the decision history the plan sells. This hook is
 * the missing wiring.
 *
 * Merge policy on sign-in: union by entry id, newest `savedAt` winning. The
 * journal is append-mostly and entries are self-contained snapshots, so a union
 * is safe and never destroys a device's work — which matters more here than
 * last-writer-wins, because losing a logged outcome breaks the feedback loop the
 * app asks people to trust.
 */
import { useCallback, useEffect, useState } from "react";
import { JournalEntry, loadJournal } from "../journalStore.ts";
import { useAuth } from "./AuthContext.tsx";

function mergeById(a: JournalEntry[], b: JournalEntry[]): JournalEntry[] {
  const byId = new Map<string, JournalEntry>();
  for (const e of [...a, ...b]) {
    const prev = byId.get(e.id);
    if (!prev || (e.savedAt ?? 0) >= (prev.savedAt ?? 0)) byId.set(e.id, e);
  }
  return [...byId.values()].sort((x, y) => (y.savedAt ?? 0) - (x.savedAt ?? 0));
}

export interface JournalSync {
  entries: JournalEntry[];
  /** Apply a journalStore mutation's result and push it to the cloud. */
  apply: (next: JournalEntry[]) => void;
  /** Non-null when a cloud write failed — surfaced rather than swallowed. */
  syncError: string | null;
}

export function useJournalSync(): JournalSync {
  const { enabled, user } = useAuth();
  const [entries, setEntries] = useState<JournalEntry[]>(() => loadJournal());
  const [syncError, setSyncError] = useState<string | null>(null);

  // Pull on sign-in and merge with whatever this device already has.
  useEffect(() => {
    if (!enabled || !user) return;
    let cancelled = false;
    (async () => {
      try {
        const m = await import("../../firebase/client.ts");
        const cloud = await m.loadJournalCloud(user.uid);
        if (cancelled) return;
        const local = loadJournal();
        const merged = mergeById(local, cloud);
        setEntries(merged);
        m.saveJournalCloud(user.uid, merged).catch((e) =>
          setSyncError(e instanceof Error ? e.message : String(e)),
        );
      } catch (e) {
        if (!cancelled) setSyncError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, user]);

  const apply = useCallback(
    (next: JournalEntry[]) => {
      setEntries(next);
      if (!enabled || !user) return;
      setSyncError(null);
      import("../../firebase/client.ts")
        .then((m) => m.saveJournalCloud(user.uid, next))
        // Deliberately NOT swallowed. A silent .catch() is exactly how the
        // profile sync stayed broken without anyone noticing.
        .catch((e) => setSyncError(e instanceof Error ? e.message : String(e)));
    },
    [enabled, user],
  );

  return { entries, apply, syncError };
}
