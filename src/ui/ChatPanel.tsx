import { ReactNode, RefObject, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  BaziChart,
  DaYun,
  DecisionResult,
  analyzeProfile,
  composeProfileAnswer,
  composeTimingAnswer,
  composeUnknownAnswer,
  objectiveById,
  objectivePlain,
  parseAdvisorQuery,
} from "../engine/index.ts";
import type { AdvisorAnswer, BoundaryAlternative } from "../engine/index.ts";
import { useAuth } from "./profile/AuthContext.tsx";
import { useEntitlements } from "./profile/EntitlementsContext.tsx";
import { buildChatChips } from "./chatChips.ts";
import type { ChatChip } from "./chatChips.ts";
import { splitDateTokens } from "./chatDates.ts";
import { loadJournal } from "./journalStore.ts";
import { deriveSignals } from "./priorities/deriveSignals.ts";
import { areaLabel, loadPriorities } from "./priorities/prioritiesStore.ts";
import type { PriorityProfile } from "./priorities/prioritiesStore.ts";
import { ThreadList } from "./chat/ThreadList.tsx";
import { boundaryNote, buildTranscriptRows, overBudgetNote, voiceNote } from "./chat/transcript.ts";
import { forTranscript, isVisible, toolLabel, toolLabels } from "./chat/turnView.ts";
import { useThreadSync } from "./chat/useThreadSync.ts";
import {
  DEFAULT_REPLAY_BUDGET_TOKENS,
  DEFAULT_THREAD_LIMITS,
  THREADS_STORE_KEY,
  aiTurn,
  appendMessages,
  appendTurn,
  createThread,
  deleteThread as deleteThreadIn,
  loadThreads,
  messageText,
  newThreadId,
  offlineTurn,
  pruneNote,
  pruneThreads,
  renameThread as renameThreadIn,
  replayWindow,
  saveThreads,
  setPinned as setPinnedIn,
  sortThreads,
  titleFor,
  upsertThread,
} from "./chat/threadStore.ts";
import type { ChatThread, ChatTurn, SaveOutcome } from "./chat/threadStore.ts";
import type { AiToolContext } from "../ai/tools.ts";
import type { ChatMessage, ChatSettings } from "../ai/chatClient.ts";

const KEY_STORE = "wei_ai_key";
const MODEL_STORE = "wei_ai_model";
const CONSENT_STORE = "wei_ai_consent";
/** Which saved conversation this device was last reading, PER CHART. Only a
 *  pointer — the conversations themselves live in the thread store. Scoped by
 *  subject because "the conversation I was in" is a different answer for each
 *  person the app has stored. */
const ACTIVE_STORE = "wei_ai_active_thread";
const activeStoreKey = (subjectKey: string) => `${ACTIVE_STORE}:${subjectKey}`;
const DEFAULT_MODEL = "claude-sonnet-5";

// VITE_AI_PROXY_URL wires the chat through a relay that holds the key server-side
// (the local dev proxy in vite.config.ts). On the static GitHub Pages build it is
// unset, so the deployed app uses BYOK — each user enters their own key.
const PROXY_URL: string | undefined = import.meta.env.VITE_AI_PROXY_URL || undefined;

const MODELS = [
  { id: "claude-sonnet-5", label: "Sonnet 5 — balanced (recommended)" },
  { id: "claude-haiku-4-5", label: "Haiku 4.5 — fastest / cheapest" },
  { id: "claude-opus-4-8", label: "Opus 4.8 — most capable" },
];

/** "Sonnet 5" — the short name, for markers inside the transcript. Falls back to
 *  the raw id so a thread written by a model this build has never heard of still
 *  says who wrote it. */
function modelLabel(id: string): string {
  const found = MODELS.find((m) => m.id === id);
  return found ? found.label.split(" — ")[0] : id;
}

/** Search horizon for the offline (no-key) deterministic advisor. */
const OFFLINE_WINDOW_DAYS = 92;

/** Said when a reply lands for a conversation the user deleted while it was in
 *  flight. The delete wins — but silently dropping the answer would look like
 *  the advisor had failed. */
const DELETED_MID_FLIGHT =
  "That conversation was deleted while its reply was still arriving, so the reply was discarded.";

/** Sentence verb for an objective, for building suggestion chips. */
const offlineVerb = (id: string) => objectivePlain(id).verb;

const readLS = (k: string): string | null => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const writeLS = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* private mode — settings just won't persist */
  }
};

/**
 * The messages `runChat` produced for THIS question — everything after the last
 * copy of the question itself.
 *
 * Found by matching the question rather than by `prior.length + 1`: the client is
 * free to repair or re-shape the history it was handed before sending it (a
 * stored transcript can need it), and index arithmetic over an array someone else
 * may legitimately resize is how you end up silently appending replayed history
 * to a thread as if it were new. The index is kept as a fallback.
 */
function messagesAfter(updated: ChatMessage[], question: string, priorLength: number): ChatMessage[] {
  for (let i = updated.length - 1; i >= 0; i--) {
    const m = updated[i];
    if (m.role === "user" && typeof m.content === "string" && m.content === question) return updated.slice(i + 1);
  }
  return updated.slice(Math.min(priorLength + 1, updated.length));
}

// ── which chart a conversation is about ──────────────────────────────────────
//
// This app stores several people, and every answer the advisor gives is specific
// to ONE chart: the same question against a different chart is a different
// answer. A conversation therefore belongs to the chart it was held about, and
// switching person must not silently carry on someone else's conversation
// against the new chart.
//
// The subject is carried IN THE THREAD ID rather than as a field on the thread,
// because the id is the one part of a stored conversation that survives every
// round-trip we have — `parseThread` rebuilds a thread from a fixed set of
// fields, and the account copy and the backup file are keyed by id. A field
// would be dropped on the next load; the id is not.

const SUBJECT_MARK = "~s";

/** 32-bit FNV-1a, base-36. Only ever used to name a chart — never an engine
 *  input, and never anything the engine's own hashes depend on. */
function hash36(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}

/**
 * A stable name for "the chart this panel is discussing", derived from the chart
 * itself (its four pillars) and the birth date behind it. Two people with the
 * same four pillars AND the same birth date have, for the advisor's purposes,
 * the same reading — so sharing a conversation between them is not the bug this
 * guards against.
 */
export function subjectKeyOf(chart: BaziChart, birth: { year: number; month: number; day: number }): string {
  const pillars = Array.isArray(chart?.pillars) ? chart.pillars.map((p) => p?.ganzhi?.index ?? -1).join(",") : "";
  return hash36(`${birth.year}-${birth.month}-${birth.day}|${pillars}`);
}

/** The subject stamped into a thread id, or null for a conversation saved
 *  before conversations were scoped to a chart. */
export function subjectOf(threadId: string): string | null {
  if (typeof threadId !== "string") return null;
  const i = threadId.lastIndexOf(SUBJECT_MARK);
  if (i < 0) return null;
  return threadId.slice(i + SUBJECT_MARK.length) || null;
}

/** Stamp (or re-stamp) a thread id with a subject. */
export function withSubject(threadId: string, subjectKey: string): string {
  const i = threadId.lastIndexOf(SUBJECT_MARK);
  const bare = i < 0 ? threadId : threadId.slice(0, i);
  return subjectKey ? `${bare}${SUBJECT_MARK}${subjectKey}` : bare;
}

/**
 * Is this conversation showable under the current subject?
 *
 * Its own subject, yes. An UNSCOPED conversation (saved before this existed) —
 * also yes: it is the user's own data and hiding it would read as data loss.
 * What an unscoped conversation never gets is *resumed automatically*
 * (`resumeThreadId`), and the moment anything is said in one it is adopted into
 * the chart being discussed (`baseForNewTurn`), so it can never later be
 * continued against a different chart.
 */
export function belongsToSubject(threadId: string, subjectKey: string): boolean {
  const s = subjectOf(threadId);
  return s === null || s === subjectKey;
}

/** Which conversation to open for this subject: the one this device was last
 *  reading (if it is still this subject's), else this subject's most recent,
 *  else none — a new conversation. */
export function resumeThreadId(threads: ChatThread[], subjectKey: string, remembered: string | null): string | null {
  const mine = threads.filter((t) => subjectOf(t.id) === subjectKey);
  if (remembered && mine.some((t) => t.id === remembered)) return remembered;
  return sortThreads(mine)[0]?.id ?? null;
}

/**
 * The thread a new turn belongs in, and the id it REPLACES (adoption).
 *
 * Three cases:
 *  - the open conversation is this subject's → carry on in it;
 *  - it is unscoped (saved before scoping) → adopt it into this subject, which
 *    means a new id, so `replaces` names the old record to retire;
 *  - it belongs to someone else, or there is none → start a fresh conversation.
 */
export function baseForNewTurn(
  threads: ChatThread[],
  activeId: string | null,
  subjectKey: string,
  nowMs: number,
  rand?: () => number,
): { base: ChatThread; replaces: string | null } {
  const fresh = () => createThread(nowMs, { id: withSubject(newThreadId(nowMs, rand), subjectKey) });
  const existing = threads.find((t) => t.id === activeId);
  if (!existing) return { base: fresh(), replaces: null };
  const s = subjectOf(existing.id);
  if (s === subjectKey) return { base: existing, replaces: null };
  if (s === null) return { base: { ...existing, id: withSubject(existing.id, subjectKey) }, replaces: existing.id };
  return { base: fresh(), replaces: null };
}

/**
 * Undo a send that failed — SURGICALLY, against the list as it is NOW.
 *
 * Restoring a whole-list snapshot taken before the request would clobber
 * everything else that happened while it was in flight: a rename, another
 * conversation's turn, a delete. So this touches exactly one conversation:
 *
 *  - the user deleted it mid-flight → `changed: false`. A deleted conversation
 *    stays deleted; nothing is resurrected;
 *  - it existed before the question → put the pre-send copy back;
 *  - the question is what created it (or adopted it under a new id) → remove it
 *    again, and restore the pre-send copy under its original id if there was one.
 *
 * `push`/`remove` make the undo SYMMETRIC with the account: a failed send must
 * not leave an unanswered question — or a whole spurious conversation — in the
 * cloud to come back at the next sign-in.
 */
export interface SendRollback {
  threads: ChatThread[];
  /** Conversation to write back to the account (null when there is none). */
  push: ChatThread | null;
  /** Ids whose account copy must be deleted. */
  remove: string[];
  /** False when there is nothing to undo — the conversation is already gone. */
  changed: boolean;
}

export function rollbackSend(live: ChatThread[], sentId: string, prior: ChatThread | null): SendRollback {
  if (!live.some((t) => t.id === sentId)) return { threads: live, push: null, remove: [], changed: false };
  if (prior && prior.id === sentId) {
    return { threads: upsertThread(live, prior), push: prior, remove: [], changed: true };
  }
  const without = deleteThreadIn(live, sentId);
  return prior
    ? { threads: upsertThread(without, prior), push: prior, remove: [sentId], changed: true }
    : { threads: without, push: null, remove: [sentId], changed: true };
}

/**
 * How many of the omitted turns a person can actually SEE.
 *
 * The replay boundary tells the user those messages are "still here to read".
 * Tool-plumbing turns are stored and replayed but never rendered, so counting
 * them makes the marker claim messages that are not on screen — and a marker
 * that counts only invisible turns is a marker about nothing.
 */
export function visibleOmitted(turns: ChatTurn[], omittedTurns: number): number {
  const n = Math.max(0, Math.min(Math.floor(omittedTurns) || 0, turns.length));
  let count = 0;
  for (let i = 0; i < n; i++) if (isVisible(turns[i])) count++;
  return count;
}

/**
 * What to tell someone whose conversation did not reach this device's storage.
 *
 * `saveThreads` reports this rather than swallowing it, and it matters: a
 * conversation that silently failed to save LOOKS saved, right up until the
 * reload that loses it. So it is said plainly, with the reason, and with the one
 * mitigating fact if it applies — the account still has it.
 */
export function unsavedNote(reason: SaveOutcome["reason"] | null, inAccount: boolean): string | null {
  if (!reason) return null;
  const why = reason === "quota" ? "this device's storage is full" : "this browser isn't allowing storage";
  return (
    `This conversation couldn't be saved on this device — ${why}, so it will be gone if you reload.` +
    (inAccount ? " It is still being saved to your account." : "")
  );
}

/** Conversational AI layer over the deterministic reading. Additive: it never
 *  replaces the deterministic Q&A, and stays inert until the user opts in and
 *  configures a key (or a proxy is built in). */
export function ChatPanel({
  chart,
  dayun,
  birth,
  todayIso,
  evaluate,
  evaluateDay,
  boundary,
}: {
  chart: BaziChart;
  dayun: DaYun | null;
  birth: { year: number; month: number; day: number };
  todayIso: string;
  evaluate: (objectiveId: string, windowDays: number) => DecisionResult;
  evaluateDay: (objectiveId: string, isoDate: string) => DecisionResult;
  /** Passed through to the advisor so it can't narrate an ambiguous chart as settled. */
  boundary?: BoundaryAlternative[];
}) {
  const [apiKey, setApiKey] = useState<string>(() => readLS(KEY_STORE) ?? "");
  const [model, setModel] = useState<string>(() => readLS(MODEL_STORE) ?? DEFAULT_MODEL);
  const [consented, setConsented] = useState<boolean>(() => readLS(CONSENT_STORE) === "1");
  const [keyDraft, setKeyDraft] = useState("");
  const [showSettings, setShowSettings] = useState(false);

  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outOfQuota, setOutOfQuota] = useState(false);
  const [retryText, setRetryText] = useState<string | null>(null);
  /** Housekeeping the user is entitled to know about (what pruning removed). */
  const [notice, setNotice] = useState<string | null>(null);
  /** Why the last save didn't reach this device's storage (null when it did).
   *  Said plainly rather than letting the conversation quietly vanish on the
   *  next reload. */
  const [unsaved, setUnsaved] = useState<SaveOutcome["reason"] | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const threadRef = useRef<HTMLDivElement>(null);

  /** The chart this panel is about — conversations are scoped to it. */
  const subjectKey = useMemo(() => subjectKeyOf(chart, birth), [chart, birth]);
  const subjectRef = useRef(subjectKey);

  // ── saved conversations ────────────────────────────────────────────────────
  // THE conversation state. Previously `bubbles` (useState) and `historyRef`
  // (useRef): both died on reload and on a route change to /today and back, so
  // "memory" lasted exactly as long as one mounted component. Now the panel
  // renders a stored thread, and every request replays a transcript WE hold —
  // which is also why changing model mid-conversation continues it rather than
  // starting again.
  const [threads, setThreads] = useState<ChatThread[]>(() => loadThreads());
  const [activeId, setActiveId] = useState<string | null>(() =>
    // Only ever resumes a conversation held about THIS chart. One saved before
    // conversations were scoped stays listed and openable, but is never picked
    // up automatically — see `belongsToSubject`.
    resumeThreadId(loadThreads(), subjectKey, readLS(activeStoreKey(subjectKey))),
  );
  // The async send path reads these long after the render that closed over them.
  const threadsRef = useRef(threads);
  threadsRef.current = threads;
  const activeIdRef = useRef(activeId);
  activeIdRef.current = activeId;

  useEffect(() => {
    if (activeId) writeLS(activeStoreKey(subjectKey), activeId);
  }, [activeId, subjectKey]);

  // Switching person switches conversation. The pointer is per-subject, so each
  // chart picks up where IT left off, and a person with no history here starts a
  // new conversation rather than inheriting the last one.
  useEffect(() => {
    if (subjectRef.current === subjectKey) return;
    subjectRef.current = subjectKey;
    abortRef.current?.abort();
    setActiveId(resumeThreadId(threadsRef.current, subjectKey, readLS(activeStoreKey(subjectKey))));
    setError(null);
    setRetryText(null);
    setNotice(null);
    setInput("");
  }, [subjectKey]);

  const hydrate = useCallback(() => {
    const next = loadThreads();
    threadsRef.current = next;
    setThreads(next);
  }, []);

  // Re-read when another tab writes, and when this tab's own store re-emits
  // (threadStore dispatches a same-tab ping, since `storage` only fires in OTHER
  // tabs). That is how a sign-in merge and a second open panel stay in step.
  // Our OWN writes are skipped: we already hold that list, and re-parsing it
  // mid-send would swap the array identity under an in-flight answer.
  const selfWrite = useRef(false);
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (selfWrite.current) return;
      if (e.key === null || e.key === THREADS_STORE_KEY) hydrate();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [hydrate]);

  const sync = useThreadSync({ loadLocal: loadThreads, saveLocal: saveThreads });
  const syncRef = useRef(sync);
  syncRef.current = sync;

  /**
   * Persist a new thread list, enforcing the storage bound and SAYING what that
   * cost. The bound is an abuse/storage limit — there are no tiers in this app
   * and nothing here is an upsell.
   */
  const commit = useCallback((next: ChatThread[], touched?: ChatThread | null): ChatThread[] => {
    const pruned = pruneThreads(next, DEFAULT_THREAD_LIMITS, Date.now());
    const note = pruneNote(pruned);
    if (note) setNotice(note);
    threadsRef.current = pruned.threads;
    setThreads(pruned.threads);
    // `saveThreads` pings this tab synchronously; the flag keeps that ping from
    // bouncing straight back into `hydrate`.
    selfWrite.current = true;
    let saved: SaveOutcome;
    try {
      saved = saveThreads(pruned.threads);
    } finally {
      selfWrite.current = false;
    }
    // A write that didn't land is not a saved conversation. Say so.
    setUnsaved(saved.persisted ? null : saved.reason ?? "unavailable");
    // Pruning removed conversations from this device; the account has to lose
    // them too, or the next sign-in pulls every one of them straight back.
    for (const gone of pruned.removedThreads) syncRef.current.remove(gone.id);
    if (touched && pruned.threads.some((t) => t.id === touched.id)) syncRef.current.push(touched);
    return pruned.threads;
  }, []);

  /** The conversations that belong to the chart on screen. */
  const visibleThreads = useMemo(
    () => threads.filter((t) => belongsToSubject(t.id, subjectKey)),
    [threads, subjectKey],
  );

  const active = useMemo(() => visibleThreads.find((t) => t.id === activeId) ?? null, [visibleThreads, activeId]);
  const turns = active?.turns ?? [];

  // What of this conversation is actually being replayed to the model. Computed
  // for display too, so the boundary is visible BEFORE the next question rather
  // than being explained afterwards.
  const window_ = useMemo(
    () => (active ? replayWindow(active, DEFAULT_REPLAY_BUDGET_TOKENS) : null),
    [active],
  );

  // The boundary marker counts what is READABLE above it, not the stored turns:
  // tool_result plumbing is replayed but never drawn, so counting it would
  // promise messages that aren't on screen. `replayFrom` still places the marker
  // at the real cut.
  const omittedTurns = window_?.omittedTurns ?? 0;
  const rows = useMemo(
    () =>
      buildTranscriptRows(turns.map(forTranscript), {
        replayFrom: omittedTurns,
        omittedTurns: visibleOmitted(turns, omittedTurns),
        modelLabel,
      }),
    [turns, omittedTurns],
  );

  /** Label every assistant turn only when the thread actually changed hands —
   *  a single-model conversation needs no byline on every paragraph. */
  const mixedVoices = useMemo(() => rows.some((r) => r.kind === "voice"), [rows]);

  /** Live assistant turn. Held OUTSIDE the store while it streams, so a
   *  half-written answer is never persisted and never replayed. */
  const [streaming, setStreaming] = useState<{ text: string; tools: string[]; model: string } | null>(null);

  const auth = useAuth();
  const { quota, noteAiMessage, releaseAiMessage } = useEntitlements();
  const configured = Boolean(PROXY_URL || apiKey);
  // Metering only exists behind the hosted relay. A BYOK user is spending their
  // own Anthropic key, so it isn't ours to ration.
  const metered = Boolean(PROXY_URL) && auth.enabled && Boolean(auth.user);
  const blocked = metered && (outOfQuota || !quota.allowed);

  const settings: ChatSettings = useMemo(() => ({ model, apiKey: apiKey || undefined, proxyUrl: PROXY_URL }), [model, apiKey]);

  // The user's stated priorities. Edited on the profile page and in the journal,
  // so re-read when this tab regains focus (and on cross-tab writes) rather than
  // trusting a mount-time snapshot. Storage reads only — nothing here is engine input.
  const [priorities, setPriorities] = useState<PriorityProfile>(() => loadPriorities());
  useEffect(() => {
    const reread = () => setPriorities(loadPriorities());
    window.addEventListener("focus", reread);
    window.addEventListener("storage", reread);
    return () => {
      window.removeEventListener("focus", reread);
      window.removeEventListener("storage", reread);
    };
  }, []);

  const ctx: AiToolContext = useMemo(
    () => ({
      chart,
      dayun,
      birth,
      todayIso,
      evaluate,
      evaluateDay,
      boundary,
      priorities,
      // Read lazily at tool-call time so the advisor sees the current journal.
      // Deriving is local and pure; get_priorities only EMITS anything from it
      // under the profile's own `journal` consent flag, and then counts only —
      // journal note text is never sent to the model under any setting. (It does
      // sync to the signed-in user's own account — that is storage, not egress to
      // the model, and the privacy notice now draws that line explicitly.)
      journalSignals: () => deriveSignals(loadJournal()),
    }),
    [chart, dayun, birth, todayIso, evaluate, evaluateDay, boundary, priorities],
  );

  /**
   * Exactly what leaves the device when the AI advisor is used, in the user's own
   * terms. Derived from what they have actually SET and actually CONSENTED to, so
   * the pre-chat box can't promise "everything else stays on your device" while
   * `get_priorities` ships their profile off it. Order matches the tool payload.
   */
  const sharedWithModel = useMemo(() => {
    const items: string[] = [];
    if (priorities.areas.length > 0 && priorities.aiConsent.areas) {
      items.push(`your ranked life areas (${priorities.areas.map((a) => areaLabel(a)).join(", ")})`);
    }
    if (priorities.intentions.length > 0 && priorities.aiConsent.intentions) {
      items.push("the intentions you wrote, word for word");
    }
    const hasContext = Boolean(priorities.context.lifeStage || priorities.context.occupation || priorities.context.comingUp);
    if (hasContext && priorities.aiConsent.context) {
      items.push("the optional context you filled in — life stage, occupation, what's coming up");
    }
    if (priorities.aiConsent.journal) {
      items.push("how many decisions you've saved in each life area — counts only, never what they were about");
    }
    return items;
  }, [priorities]);

  // Suggested chips come from the user's ACTUAL chart (their top fit, their
  // weakest fit) — every chip leads to a full answer.
  const chips = useMemo(() => {
    const base = buildChatChips(chart);
    // Fold in what they've told us they care about: these route to
    // get_priorities + find_best_days.
    const mine: ChatChip[] = [];
    // Consent-gated: a chip that names a field the user chose not to share would
    // put it in the transcript anyway, which is the same leak by another route.
    const top = priorities.aiConsent.areas ? priorities.areas[0] : undefined;
    if (top) {
      const label = areaLabel(top).toLowerCase();
      mine.push({
        label: `What should I watch for ${label}?`,
        prompt: `${areaLabel(top)} is my top priority right now — what should I be watching for over the next few weeks?`,
      });
    }
    const intention = priorities.intentions[0];
    if (intention && priorities.aiConsent.intentions) {
      mine.push({ label: "Timing for what I'm working on", prompt: `I'm working on: ${intention}. When are the supportive windows for that?` });
    }
    return [...mine, ...base].slice(0, 6);
  }, [chart, priorities]);

  const scrollDown = useCallback(() => {
    requestAnimationFrame(() => threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight }));
  }, []);

  // ── thread management ──────────────────────────────────────────────────────

  const stop = () => abortRef.current?.abort();

  const newChat = () => {
    stop();
    // Deliberately does NOT create an empty thread: a conversation starts
    // existing when something is said in it. Everything already saved stays.
    setActiveId(null);
    setError(null);
    setRetryText(null);
    setNotice(null);
    // Clear the latch too. The server stamps "quota_exceeded" on its fail-CLOSED
    // path as well as a genuine limit, so a Firestore blip used to switch the
    // advisor off for the rest of the session with no way back but a reload.
    setOutOfQuota(false);
    setInput("");
  };

  const selectThread = (id: string) => {
    stop();
    setActiveId(id);
    setError(null);
    setRetryText(null);
    scrollDown();
  };

  const rename = (id: string, title: string) => {
    const next = renameThreadIn(threadsRef.current, id, title, Date.now());
    commit(next, next.find((t) => t.id === id));
  };

  /** Pinning is the user saying "keep this" — pruning never removes a pinned
   *  conversation, which the pruning note already promises. */
  const pin = (id: string, pinned: boolean) => {
    const next = setPinnedIn(threadsRef.current, id, pinned, Date.now());
    commit(next, next.find((t) => t.id === id));
  };

  const remove = (id: string) => {
    if (id === activeIdRef.current) stop();
    const next = deleteThreadIn(threadsRef.current, id);
    commit(next);
    syncRef.current.remove(id);
    if (id === activeIdRef.current) setActiveId(resumeThreadId(next, subjectKey, null));
  };

  // ── offline deterministic advisor (no key, no proxy — never a dead end) ────
  // It writes into the SAME thread as the AI, so adding a key later continues
  // the conversation rather than starting a second one beside it.
  const profile = useMemo(() => analyzeProfile(chart), [chart]);
  const askOffline = useCallback(
    (raw: string) => {
      const q = raw.trim();
      if (!q) return;
      const intent = parseAdvisorQuery(q);
      let answer: AdvisorAnswer;
      if (intent.kind === "timing" && intent.objectiveId) {
        // parseAdvisorQuery already snaps windows to the engine's five-year
        // horizon, so the answer describes exactly the window searched.
        const win = intent.windowDays ?? OFFLINE_WINDOW_DAYS;
        answer = composeTimingAnswer(objectiveById(intent.objectiveId), evaluate(intent.objectiveId, win), todayIso, win);
      } else if (intent.kind === "profile") {
        answer = composeProfileAnswer(profile);
      } else {
        answer = composeUnknownAnswer(profile);
      }
      const now = Date.now();
      const { base, replaces } = baseForNewTurn(threadsRef.current, activeIdRef.current, subjectKey, now);
      const next = appendTurn(base, offlineTurn(q, answer), now);
      // `replaces` is set when an unscoped conversation was adopted into this
      // chart: the old record is retired here and in the account, so there is
      // never a second copy of it under the previous id.
      const list = replaces ? deleteThreadIn(threadsRef.current, replaces) : threadsRef.current;
      commit(upsertThread(list, next), next);
      if (replaces) syncRef.current.remove(replaces);
      setActiveId(next.id);
      setInput("");
      scrollDown();
    },
    [commit, evaluate, profile, scrollDown, subjectKey, todayIso],
  );

  const enable = () => {
    const k = keyDraft.trim();
    if (!PROXY_URL && !k) return;
    if (k) {
      setApiKey(k);
      writeLS(KEY_STORE, k);
    }
    writeLS(MODEL_STORE, model);
    writeLS(CONSENT_STORE, "1");
    setConsented(true);
    setKeyDraft("");
  };

  // ── sending ────────────────────────────────────────────────────────────────

  const send = useCallback(
    async (raw: string) => {
      const text = raw.trim();
      if (!text || busy || blocked) return;
      setError(null);
      setRetryText(null);
      setNotice(null);
      setInput("");
      if (metered) noteAiMessage(); // move the local counter now; the server is authoritative

      const now = Date.now();
      const before = threadsRef.current;
      const activeBefore = activeIdRef.current;
      const subjectAtSend = subjectKey;
      const { base, replaces } = baseForNewTurn(before, activeBefore, subjectAtSend, now);
      // WHICH conversation this answer belongs to, captured now. Everything that
      // lands when the request finishes is checked against this id in the LIVE
      // list — the user may have deleted the conversation while it was in
      // flight, and a completion must never write a deleted conversation back.
      const threadId = base.id;
      /** The conversation exactly as it was before the question — what a failure
       *  restores. Null when this question is what created it. */
      const priorThread = before.find((t) => t.id === (replaces ?? base.id)) ?? null;
      // The window is computed from the thread BEFORE this question: `runChat`
      // appends the question itself. Everything outside it is still on screen —
      // the transcript marks the boundary rather than hiding it.
      const replay = replayWindow(base, DEFAULT_REPLAY_BUDGET_TOKENS);
      const prior: ChatMessage[] = replay.messages;

      // Persist the question immediately: if the answer fails or the tab dies
      // mid-stream, what the user asked is not lost.
      const withQuestion = appendTurn(base, aiTurn("user", text), now);
      const listBefore = replaces ? deleteThreadIn(before, replaces) : before;
      commit(upsertThread(listBefore, withQuestion), withQuestion);
      if (replaces) syncRef.current.remove(replaces);
      setActiveId(threadId);

      // The model in force for THIS turn, captured now — changing the dropdown
      // while an answer streams must not relabel the answer already in flight.
      const turnModel = model;
      setStreaming({ text: "", tools: [], model: turnModel });
      setBusy(true);
      const controller = new AbortController();
      abortRef.current = controller;
      let streamed = "";
      try {
        // A secured Cloud-Function proxy verifies the caller's Firebase ID token.
        const authToken = PROXY_URL ? (await auth.getIdToken()) ?? undefined : undefined;
        const mod = await import("../ai/chatClient.ts");
        const updated = await mod.runChat(
          prior,
          text,
          { ...settings, model: turnModel, authToken },
          ctx,
          {
            onTextDelta: (t) => {
              streamed += t;
              setStreaming((s) => (s ? { ...s, text: s.text + t } : s));
            },
            onToolStart: (name) =>
              setStreaming((s) => (s ? { ...s, tools: [...s.tools, toolLabel(name)] } : s)),
          },
          controller.signal,
          // What the window left out. The model is told the same thing the
          // transcript's boundary marker tells the user, so it can say "that's
          // outside what I was given" instead of confabulating around the gap.
          { prunedTurns: replay.omittedTurns },
        );
        // Everything after the question we already stored. Each assistant message
        // is stamped with the model that wrote it — that stamp is what makes a
        // mid-thread model switch legible instead of invisible.
        const fresh = messagesAfter(updated, text, prior.length);
        const answered = appendMessages(
          withQuestion,
          fresh.length > 0 ? fresh : [{ role: "assistant", content: "(no reply)" }],
          turnModel,
          Date.now(),
        );
        if (threadsRef.current.some((t) => t.id === threadId)) {
          commit(upsertThread(threadsRef.current, answered), answered);
        } else {
          setNotice(DELETED_MID_FLIGHT);
        }
      } catch (e) {
        const aborted = controller.signal.aborted || (e instanceof DOMException && e.name === "AbortError");
        if (aborted) {
          // A stop still consumed the upstream call, but the user got nothing
          // useful — don't bill the local counter for it either.
          if (metered) releaseAiMessage();
          // Keep whatever streamed before the stop, as its own turn: it is part
          // of the conversation, and the transcript is the record of what was said.
          const stopped = appendTurn(
            withQuestion,
            aiTurn("assistant", streamed ? `${streamed} …(stopped)` : "(stopped)", turnModel),
            Date.now(),
          );
          // Same rule as the success path: if the conversation was deleted while
          // this ran, it stays deleted.
          if (threadsRef.current.some((t) => t.id === threadId)) {
            commit(upsertThread(threadsRef.current, stopped), stopped);
          }
        } else {
          const quotaHit = e instanceof Error && e.name === "QuotaError";
          // Give the optimistic message back unless the SERVER said we're out —
          // otherwise five failed sends silently lock the session until reload.
          if (metered && !quotaHit) releaseAiMessage();
          setError(e instanceof Error ? e.message : String(e));
          // A quota block isn't retryable — offering "Retry" would just fail again.
          setOutOfQuota(quotaHit);
          setRetryText(quotaHit ? null : text);
          // Roll the question back out of the saved conversation and put it back
          // in the input: an unanswered question sitting in a saved conversation
          // is worse than no question at all. Surgically, against the list as it
          // is NOW — a rename, another conversation's turn, or a delete that
          // happened while this request was in flight all survive — and mirrored
          // to the account, so the question doesn't come back at the next
          // sign-in.
          const roll = rollbackSend(threadsRef.current, threadId, priorThread);
          if (roll.changed) {
            commit(roll.threads, roll.push);
            for (const id of roll.remove) syncRef.current.remove(id);
            // If the question had just opened a brand-new conversation, that
            // conversation never existed — go back to whatever was selected.
            // Only when the panel is still on the same chart and the same
            // conversation: switching person already chose what to show.
            if (subjectRef.current === subjectAtSend && activeIdRef.current === threadId) {
              setActiveId(priorThread ? priorThread.id : activeBefore);
            }
          }
          setInput(text);
        }
      } finally {
        abortRef.current = null;
        setStreaming(null);
        setBusy(false);
        scrollDown();
      }
    },
    [auth, blocked, busy, commit, ctx, metered, model, noteAiMessage, releaseAiMessage, scrollDown, settings, subjectKey],
  );

  useEffect(scrollDown, [turns.length, scrollDown]);

  // ── shared pieces ──────────────────────────────────────────────────────────

  // What deleting actually does, said accurately.
  //
  // Deletion propagates to the account only while signed IN: nothing records a
  // deletion made while signed out, so the account's copy is still there and
  // comes back at the next sign-in. Rather than promise "for good" and be wrong,
  // the confirmation says what will happen. (The alternative — a tombstone
  // queued locally and replayed on the next sign-in — belongs in the sync layer,
  // not here; it is noted as a follow-up.)
  const signedOutWithAccount = Boolean(auth.enabled && !auth.user);
  const deletePrompt = signedOutWithAccount ? "Delete here? Your account keeps its copy." : "Delete for good?";
  const deleteHint = signedOutWithAccount
    ? "You're signed out, so this only removes it from this device — your account's copy comes back the next time you sign in. Sign in first to delete it everywhere."
    : undefined;

  const threadListNode = (
    <ThreadList
      threads={sortThreads(visibleThreads).map((t) => ({
        id: t.id,
        title: titleFor(t),
        updatedAt: t.updatedAt,
        pinned: t.pinned === true,
      }))}
      activeId={activeId}
      onSelect={selectThread}
      onRename={rename}
      onPin={pin}
      onDelete={remove}
      onNew={newChat}
      deletePrompt={deletePrompt}
      deleteHint={deleteHint}
    />
  );

  const transcriptNode = (
    <Transcript
      rows={rows}
      turns={turns}
      streaming={streaming}
      showBylines={mixedVoices}
      innerRef={threadRef}
    />
  );

  const notices = [
    notice,
    // Sent whole because trimming it would split a tool call from its result.
    // It belongs with the other storage/replay facts rather than in its own
    // corner — one voice for "here is what actually happens to your words".
    window_?.overBudget ? overBudgetNote() : null,
    unsavedNote(unsaved, Boolean(auth.enabled && auth.user)),
    sync.syncError
      ? `Your saved conversations are on this device. Syncing them to your account failed: ${sync.syncError}`
      : null,
  ].filter((s): s is string => Boolean(s));

  const noticeNode = notices.length > 0 && (
    <div className="ask-note" style={{ textAlign: "left", marginTop: 8 }}>
      {notices.join(" ")}
    </div>
  );

  // ── Not configured / not consented → offline deterministic advisor ─────────
  // No key wall: the same input answers questions through the deterministic
  // advisor (advisor.ts), clearly labelled. Full AI chat is a collapsible setup.
  if (!configured || !consented) {
    const offlineChips = [
      ...(profile.top[0] ? [`When should I ${offlineVerb(profile.top[0].objectiveId)}?`] : []),
      ...(profile.top[1] ? [`Best time to ${offlineVerb(profile.top[1].objectiveId)} in the next 6 months?`] : []),
      "What does my chart suit?",
    ];
    return (
      <div className="card" style={{ padding: 20, marginTop: 18 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span className="seal sm" aria-hidden="true">語</span>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Ask about your reading</h3>
          <span style={{ fontSize: 11, color: "var(--muted)", border: "1px solid var(--hairline)", borderRadius: 999, padding: "1px 8px" }}>
            Offline advisor — deterministic, no AI
          </span>
        </div>
        <p style={{ margin: "10px 0 0", fontSize: 13.5, color: "var(--muted)", lineHeight: 1.55 }}>
          Ask in your own words — answers come straight from the engine on your device. Same question, same answer,
          every time. Nothing leaves your browser. Your conversations are kept here, so you can pick one up later.
        </p>

        {visibleThreads.length > 0 && threadListNode}
        {turns.length > 0 && transcriptNode}

        <div className="qa-input-row" style={{ marginTop: 10 }}>
          <input
            className="qa-input"
            type="text"
            value={input}
            placeholder={'e.g. "when should I sign the contract?"'}
            aria-label="Ask about your reading (offline advisor)"
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && askOffline(input)}
          />
          <button className="btn qa-send" disabled={!input.trim()} onClick={() => askOffline(input)}>Ask</button>
        </div>

        {noticeNode}

        {turns.length === 0 && (
          <div className="qa-suggest">
            {offlineChips.map((s) => (
              <button key={s} className="chip ghost" onClick={() => askOffline(s)}>{s}</button>
            ))}
          </div>
        )}

        <details className="dossier" style={{ marginTop: 14 }}>
          <summary>Want the conversational version? Set up AI chat</summary>
          <div className="dossier-body">
            <p style={{ margin: "10px 0 0", fontSize: 13.5, color: "var(--muted)", lineHeight: 1.55 }}>
              Ask open-ended questions and get a conversational explanation. The AI is a narrator over this engine — it
              <b> never calculates</b>; it calls the same deterministic tools you see here and cites what they return.
              It picks up in the conversation you're already in.
            </p>
            <div style={{ margin: "12px 0", padding: "10px 12px", background: "var(--warn-bg)", border: "1px solid var(--warn-border)", borderRadius: 10, fontSize: 12.5, color: "var(--warn-ink)", lineHeight: 1.5 }}>
              <b>Before you start:</b> chatting sends the following to Anthropic's Claude so it can explain your reading:
              <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
                <li>your question, and the earlier messages in that chat — including anything you asked the offline advisor in the same conversation;</li>
                <li>
                  your <i>derived chart summary</i> — Day Master, elements, pillars and the scores this app already
                  computed on your device. <b>Never</b> your birth date, time or city;
                </li>
                {sharedWithModel.map((s) => (
                  <li key={s}>{s};</li>
                ))}
              </ul>
              <div style={{ marginTop: 6 }}>
                {sharedWithModel.length === 0
                  ? "You haven't set anything else the advisor would receive — nothing from your profile or journal is included."
                  : "Those last items come from your profile and its consent switches — turn any of them off and they stop being sent."}{" "}
                The text of your journal notes is <b>never</b> sent, under any setting.{" "}
                <Link className="btn-text" style={{ padding: 0 }} to="/settings/profile">
                  Review what the advisor may see ›
                </Link>
              </div>
            </div>

            {!PROXY_URL && (
              <div>
                <label style={{ fontSize: 12.5, color: "var(--ink)", display: "block", marginBottom: 4 }}>Your Anthropic API key (stored only in this browser)</label>
                <input
                  className="qa-input"
                  type="password"
                  placeholder="sk-ant-…"
                  value={keyDraft}
                  onChange={(e) => setKeyDraft(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && enable()}
                  style={{ width: "100%" }}
                />
                <div style={{ fontSize: 11.5, color: "var(--faint)", marginTop: 5 }}>
                  Get one at console.anthropic.com → API keys. It never leaves your browser; the request goes straight to Anthropic.
                </div>
              </div>
            )}

            <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
              <button className="btn" style={{ maxWidth: 220 }} disabled={!PROXY_URL && !keyDraft.trim()} onClick={enable}>
                {PROXY_URL ? "I understand — start chatting" : "Save key & start"}
              </button>
              <select value={model} onChange={(e) => setModel(e.target.value)} style={{ fontSize: 12.5, padding: "6px 8px", borderRadius: 8 }} aria-label="AI model">
                {MODELS.map((m) => (
                  <option key={m.id} value={m.id}>{m.label}</option>
                ))}
              </select>
            </div>
          </div>
        </details>
      </div>
    );
  }

  // ── Chat thread ─────────────────────────────────────────────────────────────
  return (
    <div className="card" style={{ padding: 20, marginTop: 18 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span className="seal sm" aria-hidden="true">語</span>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Chat with your reading</h3>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {metered && (
            <span className="quota-chip" title={`${quota.used} of ${quota.limit} used today`}>
              {quota.remaining} left today
            </span>
          )}
          <button className="btn-text" style={{ paddingRight: 0 }} onClick={() => setShowSettings((s) => !s)}>
            {showSettings ? "Close" : "Settings"}
          </button>
        </div>
      </div>

      {showSettings && (
        <div style={{ margin: "10px 0", padding: 12, border: "1px solid var(--hairline)", borderRadius: 10, display: "flex", flexDirection: "column", gap: 8 }}>
          <label style={{ fontSize: 12.5, color: "var(--ink)" }}>
            Model
            <select value={model} onChange={(e) => { setModel(e.target.value); writeLS(MODEL_STORE, e.target.value); }} style={{ marginLeft: 8, fontSize: 12.5, padding: "4px 8px", borderRadius: 8 }}>
              {MODELS.map((m) => (
                <option key={m.id} value={m.id}>{m.label}</option>
              ))}
            </select>
          </label>
          <span style={{ fontSize: 11.5, color: "var(--faint)" }}>
            Switching model keeps this conversation. The transcript is stored on your device and replayed with every
            question, so whichever model you pick carries on from the same context — and the reply is marked with the
            model that wrote it.
          </span>
          {!PROXY_URL && (
            <button
              className="btn-text"
              style={{ alignSelf: "flex-start", paddingLeft: 0, color: "var(--cinnabar)" }}
              onClick={() => { setApiKey(""); writeLS(KEY_STORE, ""); setConsented(false); writeLS(CONSENT_STORE, ""); }}
            >
              Forget my API key
            </button>
          )}
          <span style={{ fontSize: 11.5, color: "var(--faint)" }}>
            {PROXY_URL ? "Using a hosted relay — no key stored." : "Your key is stored only in this browser."}
            {" "}Your saved conversations stay on this device
            {auth.enabled && auth.user ? " and in your account." : "."}
          </span>
        </div>
      )}

      {visibleThreads.length > 0 && threadListNode}

      {turns.length === 0 && !streaming ? (
        <p style={{ fontSize: 13, color: "var(--muted)", margin: "12px 0 0", lineHeight: 1.55 }}>
          Ask me anything about your timing — I'll pull the numbers from the engine and explain them. This conversation
          is saved on your device, so you can come back to it.
        </p>
      ) : (
        transcriptNode
      )}

      {error && (
        <div className="warn" style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span><span aria-hidden="true">⚠</span> {error}</span>
          {retryText && (
            <button className="btn-text" style={{ padding: 0, color: "var(--warn-ink)", fontWeight: 600 }} onClick={() => send(retryText)}>
              Retry
            </button>
          )}
        </div>
      )}

      <div className="qa-input-row" style={{ marginTop: 10 }}>
        <input
          className="qa-input"
          type="text"
          value={input}
          placeholder={blocked ? "You're out of advisor messages for today" : "e.g. “compare my two best wedding days next year”"}
          aria-label="Chat with your reading"
          disabled={busy || blocked}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send(input)}
        />
        {busy ? (
          <button className="btn qa-send" onClick={stop} title="Stop generating">■ Stop</button>
        ) : (
          <button className="btn qa-send" disabled={!input.trim() || blocked} onClick={() => send(input)}>Send</button>
        )}
      </div>

      {blocked && (
        <p className="ask-note" style={{ marginTop: 8 }}>
          Daily allowance reached — it resets at midnight UTC. The rest of the app — every reading, score and forecast —
          keeps working; only the AI narration is metered.
        </p>
      )}

      {noticeNode}

      {turns.length === 0 && (
        <div className="qa-suggest">
          {chips.map((c) => (
            <button key={c.label} className="chip ghost" disabled={busy || blocked} onClick={() => send(c.prompt)}>
              {c.label}
            </button>
          ))}
        </div>
      )}

      <div className="ask-note" style={{ marginTop: 10 }}>
        The AI narrates the engine's deterministic output — it never computes pillars, scores or dates itself. Tendencies, not predictions. One input among many.
      </div>
    </div>
  );
}

// ── the transcript ───────────────────────────────────────────────────────────

/**
 * The saved conversation, plus the two markers that keep it honest: where the
 * replay window cuts, and where the answering model changed. Both are rendered
 * in the flow, at the point they happened — never as a footnote at the bottom,
 * and never omitted.
 */
function Transcript({
  rows,
  turns,
  streaming,
  showBylines,
  innerRef,
}: {
  rows: ReturnType<typeof buildTranscriptRows>;
  turns: ChatTurn[];
  streaming: { text: string; tools: string[]; model: string } | null;
  showBylines: boolean;
  innerRef: RefObject<HTMLDivElement>;
}) {
  return (
    <div className="qa-thread" ref={innerRef} style={{ maxHeight: 420, overflowY: "auto", marginTop: 12 }}>
      {rows.map((row, i) => {
        if (row.kind === "boundary") {
          return (
            <div className="chat-marker" key={`b${i}`}>
              <span>{boundaryNote(row.omittedTurns)}</span>
            </div>
          );
        }
        if (row.kind === "voice") {
          return (
            <div className="chat-marker" key={`v${i}`}>
              <span>{voiceNote(row.label, row.offline)}</span>
            </div>
          );
        }
        const turn = turns[row.index];
        if (!turn || !isVisible(turn)) return null;
        return <TurnView key={turn.id} turn={turn} showByline={showBylines} />;
      })}
      {streaming && (
        <div className="qa-a">
          <ToolChips labels={streaming.tools} />
          {streaming.text ? (
            <RichText text={streaming.text} />
          ) : (
            <p style={{ margin: 0, color: "var(--muted)", fontStyle: "italic" }}>thinking…</p>
          )}
        </div>
      )}
    </div>
  );
}

function ToolChips({ labels }: { labels: string[] }) {
  if (labels.length === 0) return null;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 6 }}>
      {labels.map((t, j) => (
        <span key={j} style={{ fontSize: 11, color: "var(--muted)", border: "1px solid var(--hairline)", borderRadius: 999, padding: "1px 8px" }}>
          ◷ {t}
        </span>
      ))}
    </div>
  );
}

function TurnView({ turn, showByline }: { turn: ChatTurn; showByline: boolean }) {
  if (turn.kind === "offline") {
    return (
      <div className="qa-pair">
        <div className="qa-q">{turn.question}</div>
        <div className="qa-a">
          <div className="qa-a-title">{turn.answer.title}</div>
          {turn.answer.paragraphs.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
          {turn.answer.action?.pickIso && (
            <Link className="btn-text" style={{ paddingLeft: 0 }} to={`/day/${turn.answer.action.pickIso}`}>
              Open that day's full reading ›
            </Link>
          )}
          <div style={{ fontSize: 10.5, color: "var(--faint)", marginTop: 4 }}>Offline advisor — deterministic, no AI</div>
        </div>
      </div>
    );
  }
  if (turn.role === "user") {
    return (
      <div className="qa-pair">
        <div className="qa-q">{messageText(turn.content)}</div>
      </div>
    );
  }
  const text = messageText(turn.content);
  return (
    <div className="qa-a" style={{ marginBottom: 12 }}>
      <ToolChips labels={toolLabels(turn.content)} />
      {text ? <RichText text={text} /> : null}
      {showByline && turn.model && (
        <div className="chat-byline">
          <span className="dot">{modelLabel(turn.model)}</span>
        </div>
      )}
    </div>
  );
}

// ── minimal markdown: **bold** inline + `- ` / `• ` bullets + date links ─────

/** Render text with [YYYY-MM-DD] tokens (and bare ISO dates) as tappable
 *  day-reading chips — any date the advisor names is one tap from its evidence. */
function renderDates(text: string, keyPrefix: string): ReactNode[] {
  return splitDateTokens(text).map((seg, i) =>
    seg.kind === "date" ? (
      <Link
        key={`${keyPrefix}d${i}`}
        to={`/day/${seg.iso}`}
        title="Open this day's full reading"
        style={{
          display: "inline-block",
          border: "1px solid var(--hairline)",
          borderRadius: 999,
          padding: "0 8px",
          fontSize: "0.92em",
          fontWeight: 600,
          color: "var(--ink)",
          textDecoration: "none",
          whiteSpace: "nowrap",
        }}
      >
        {seg.display}
      </Link>
    ) : (
      <span key={`${keyPrefix}t${i}`}>{seg.text}</span>
    ),
  );
}

function renderInline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") ? (
      <strong key={i}>{renderDates(part.slice(2, -2), `s${i}`)}</strong>
    ) : (
      <span key={i}>{renderDates(part, `p${i}`)}</span>
    ),
  );
}

function RichText({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  let bullets: string[] = [];
  const flush = (key: string) => {
    if (!bullets.length) return;
    blocks.push(
      <ul key={`u${key}`} style={{ margin: "2px 0 6px", paddingLeft: 18 }}>
        {bullets.map((b, i) => (
          <li key={i} style={{ marginBottom: 2, lineHeight: 1.5 }}>{renderInline(b)}</li>
        ))}
      </ul>,
    );
    bullets = [];
  };
  text.split("\n").forEach((raw, i) => {
    const line = raw.trim();
    if (!line) return flush(`b${i}`);
    const m = line.match(/^[-*•]\s+(.*)/);
    if (m) {
      bullets.push(m[1]);
      return;
    }
    flush(`b${i}`);
    blocks.push(
      <p key={`p${i}`} style={{ margin: "0 0 6px", lineHeight: 1.55 }}>{renderInline(line)}</p>,
    );
  });
  flush("end");
  return <>{blocks}</>;
}
