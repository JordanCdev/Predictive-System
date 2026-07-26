/**
 * Saved conversations, synced to the signed-in account.
 *
 * THE ORDER OF AUTHORITY, and it is not negotiable: local storage is where a
 * conversation lives. The cloud is a copy. Firebase is unconfigured in the
 * shipped build (no VITE_FIREBASE_*), so `enabled` is false for everyone today
 * and every path here has to be a no-op that leaves the local thread store
 * working exactly as it does with this hook absent. Nothing in the chat panel
 * may await a network round-trip before showing a saved conversation.
 *
 * WHY THIS IS DEPENDENCY-INJECTED. It takes `loadLocal`/`saveLocal` rather than
 * reaching into the thread store itself, for the same reason ThreadList and
 * transcript.ts are structurally typed: the store owns the thread shape and its
 * persistence, and this module owns only the question "what does the account
 * know that this device doesn't, and vice versa". It also means the decisions
 * can be tested in node against two plain arrays — no React, no localStorage.
 *
 * MERGE POLICY: union by thread id, newest `updatedAt` winning — `mergeThreads`
 * from the store itself, not a second opinion written here, so a sign-in and a
 * backup restore can never disagree about which copy of a conversation is the
 * real one. A thread the cloud has never seen is never destroyed; it is pushed
 * up instead.
 *
 * WHY IT LISTENS RATHER THAN WAITING TO BE TOLD. The store re-emits a `storage`
 * event on every save (`notifyThreadsChanged`), so this hook can watch that and
 * push what changed. The alternative — every call site remembering to call
 * `push` after every mutation — is the shape of bug that made cloud sync a
 * no-op for the profile: it looked wired, and one path simply never called it.
 * `push`/`remove` remain for callers that want to be explicit.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO: infer deletions. A conversation vanishing
 * from local storage is NOT taken as "delete it from the account", because the
 * same observation is produced by a browser that has started refusing reads —
 * and that inference, wrong once, would wipe every conversation in the account.
 * Deleting is an explicit `remove(id)`. The honest consequence, stated so the
 * panel can state it too: a conversation deleted while signed out comes back on
 * the next sign-in, because nothing recorded that the deletion happened.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../profile/AuthContext.tsx";
import { THREADS_STORE_KEY, mergeThreads, type ChatThread } from "./threadStore.ts";

/**
 * How long to wait after a change before uploading. A turn lands in storage the
 * moment it is composed and again when the reply finishes streaming; without a
 * pause that is two full-thread writes per exchange. Long enough to coalesce a
 * burst, short enough that closing the tab a couple of seconds later has still
 * saved it — and irrelevant to safety either way, since local storage already
 * has the conversation before this timer starts.
 */
export const PUSH_DEBOUNCE_MS = 1_500;

export interface ThreadSyncOptions {
  /** Read every conversation this device holds right now (threadStore.loadThreads). */
  loadLocal: () => ChatThread[];
  /** Persist the merged set locally (threadStore.saveThreads). Called only when
   *  the merge actually changed something, so a sign-in with nothing new to say
   *  writes nothing and re-renders nobody. */
  saveLocal: (threads: ChatThread[]) => void;
}

export interface ThreadSync {
  /** A conversation changed — upsert it into the account. A no-op when signed
   *  out. Rarely needed: changes are picked up from the store's own ping. */
  push: (thread: ChatThread) => void;
  /** A conversation was deleted here — delete the account's copy too. This is
   *  the ONLY way a delete propagates; see the note above. */
  remove: (id: string) => void;
  /** True while the sign-in pull is in flight. Nothing blocks on it. */
  syncing: boolean;
  /** Non-null when a cloud call failed. Surfaced, never swallowed — a silent
   *  .catch() is exactly how the profile sync stayed broken without anyone
   *  noticing. Local conversations are unaffected either way. */
  syncError: string | null;
  /** How many conversations the account contributed on the last pull, so the
   *  panel can say "3 conversations came back from your account". */
  pulledFromCloud: number;
}

/** What we believe the account currently holds: thread id → its `updatedAt`
 *  there. Only ever built from a real read or a confirmed write. */
export function cloudStamps(cloud: ChatThread[]): Map<string, number> {
  return new Map(cloud.map((t) => [t.id, t.updatedAt]));
}

/**
 * Which local conversations the account is missing or holds an older copy of —
 * the "never lose a conversation by signing in" guarantee, as a list of writes.
 * Pure, and the single place that decides what gets uploaded.
 */
export function threadsToPush(local: ChatThread[], known: ReadonlyMap<string, number>): ChatThread[] {
  return local.filter((t) => {
    const seen = known.get(t.id);
    return seen === undefined || seen < t.updatedAt;
  });
}

/** Did the merge change anything this device is holding? Compared by id and
 *  stamp rather than deep equality — a thread only ever moves forward, and a
 *  reordering alone is not a reason to rewrite storage and re-render the panel. */
export function changedLocally(local: ChatThread[], merged: ChatThread[]): boolean {
  if (local.length !== merged.length) return true;
  const byId = new Map(local.map((t) => [t.id, t]));
  return merged.some((t) => {
    const mine = byId.get(t.id);
    return !mine || mine.updatedAt !== t.updatedAt;
  });
}

export function useThreadSync(opts: ThreadSyncOptions): ThreadSync {
  const { enabled, user } = useAuth();
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [pulledFromCloud, setPulled] = useState(0);

  // The callers are closures over the panel's state and change identity every
  // render. Holding them in a ref keeps the effects below keyed on sign-in
  // alone — otherwise every keystroke would re-run the whole merge.
  const io = useRef(opts);
  io.current = opts;

  /** What the account holds, as far as we know. Empty until the first pull, so
   *  before then everything looks un-pushed — which is the safe direction. */
  const known = useRef<Map<string, number>>(new Map());
  const flushing = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fail = useCallback((e: unknown) => setSyncError(e instanceof Error ? e.message : String(e)), []);

  /** Upload everything the account is behind on. Sequential, not Promise.all: a
   *  phone on a train should not open a dozen parallel writes, and one failure
   *  should stop the rest rather than produce a dozen identical messages. */
  const flush = useCallback(
    async (uid: string) => {
      if (flushing.current) return;
      flushing.current = true;
      try {
        const pending = threadsToPush(io.current.loadLocal(), known.current);
        if (pending.length === 0) return;
        const m = await import("../../firebase/client.ts");
        for (const t of pending) {
          await m.saveThreadCloud(uid, t);
          // Recorded only after the write resolved, so a failure half way
          // through leaves the rest genuinely pending rather than assumed sent.
          known.current.set(t.id, t.updatedAt);
        }
      } catch (e) {
        fail(e);
      } finally {
        flushing.current = false;
      }
    },
    [fail],
  );

  // Pull on sign-in, merge with whatever this device already has, then push back
  // anything the account is missing or holds an older copy of.
  useEffect(() => {
    if (!enabled || !user) return;
    let cancelled = false;
    setSyncing(true);
    setSyncError(null);
    (async () => {
      try {
        const m = await import("../../firebase/client.ts");
        const cloud = await m.listThreadsCloud(user.uid);
        if (cancelled) return;
        // Read local AFTER the await — the user may well have been typing.
        const local = io.current.loadLocal();
        const merged = mergeThreads(local, cloud);
        if (changedLocally(local, merged)) io.current.saveLocal(merged);
        known.current = cloudStamps(cloud);
        setPulled(cloud.length);
        setSyncing(false);
        await flush(user.uid);
      } catch (e) {
        if (!cancelled) {
          fail(e);
          setSyncing(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, user, fail, flush]);

  // Then keep up: the store pings this tab on every save (the browser only
  // fires `storage` in OTHER tabs, which is why threadStore re-emits it), so
  // this catches both a reply landing here and one landing in another tab.
  useEffect(() => {
    if (!enabled || !user || typeof window === "undefined") return;
    const uid = user.uid;
    const onChanged = (e: StorageEvent) => {
      // key === null is a whole-store clear; anything else must be our key.
      if (e.key !== null && e.key !== THREADS_STORE_KEY) return;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(uid), PUSH_DEBOUNCE_MS);
    };
    window.addEventListener("storage", onChanged);
    return () => {
      window.removeEventListener("storage", onChanged);
      // A pending upload is dropped, not raced. Nothing is lost: it is still in
      // local storage, and `known` will still be behind on the next sign-in.
      if (timer.current) clearTimeout(timer.current);
    };
  }, [enabled, user, flush]);

  const push = useCallback(
    (thread: ChatThread) => {
      if (!enabled || !user) return;
      setSyncError(null);
      import("../../firebase/client.ts")
        .then(async (m) => {
          await m.saveThreadCloud(user.uid, thread);
          known.current.set(thread.id, thread.updatedAt);
        })
        .catch(fail);
    },
    [enabled, user, fail],
  );

  const remove = useCallback(
    (id: string) => {
      if (!enabled || !user) return;
      setSyncError(null);
      import("../../firebase/client.ts")
        .then(async (m) => {
          await m.deleteThreadCloud(user.uid, id);
          known.current.delete(id);
        })
        .catch(fail);
    },
    [enabled, user, fail],
  );

  return { push, remove, syncing, syncError, pulledFromCloud };
}
