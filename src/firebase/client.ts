/**
 * Firebase client — auth (Google) + a per-user Firestore data layer.
 *
 * This is the only module that imports the firebase SDK, so it becomes its own
 * lazily-loaded chunk: nothing here touches the base bundle until the app is
 * configured and something calls in (AuthProvider dynamic-imports it on mount
 * when firebaseEnabled). Every document lives under users/{uid}/… so the security
 * rules can scope access to the signed-in user (see firestore.rules).
 */
import { FirebaseApp, initializeApp } from "firebase/app";
import { Auth, GoogleAuthProvider, User, getAuth, onAuthStateChanged, signInWithPopup, signOut } from "firebase/auth";
import {
  Firestore,
  initializeFirestore,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { firebaseConfig } from "./config.ts";
import type { Person } from "../ui/PersonalizeCard.tsx";
import type { ChatThread } from "../ui/chat/threadStore.ts";
import type { JournalEntry } from "../ui/journalStore.ts";
import type { UsageRecord } from "../billing/plans.ts";
import type { PeopleState } from "../ui/profile/peopleStore.ts";

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Firestore | null = null;

function ensure(): { auth: Auth; db: Firestore } {
  if (!app) {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    // ignoreUndefinedProperties is REQUIRED, not a nicety. Optional fields on a
    // stored person (relation, birthCity, longitudeEast) are legitimately
    // undefined, and plain getFirestore() makes setDoc() throw SYNCHRONOUSLY on
    // the first one — which, behind a write-through .catch(), silently disabled
    // cloud sync entirely for anyone whose profile had an unset optional field.
    db = initializeFirestore(app, { ignoreUndefinedProperties: true });
  }
  return { auth: auth!, db: db! };
}

export type { User };

// ── auth ─────────────────────────────────────────────────────────────────────

export function watchAuth(cb: (user: User | null) => void): () => void {
  return onAuthStateChanged(ensure().auth, cb);
}
export async function signInWithGoogle(): Promise<void> {
  await signInWithPopup(ensure().auth, new GoogleAuthProvider());
}
export async function signOutUser(): Promise<void> {
  await signOut(ensure().auth);
}
/** The current user's Firebase ID token (for the server-side AI proxy), or null. */
export async function getIdToken(): Promise<string | null> {
  const u = ensure().auth.currentUser;
  return u ? u.getIdToken() : null;
}

// ── data layer (per-user) ─────────────────────────────────────────────────────
// Firestore doc IDs may not contain '/'; entry ids use ':' which is allowed.
const safeId = (id: string) => id.replace(/\//g, "_");

/** users/{uid}/meta/profile → { person }. The stored birth profile. */
export async function loadProfile(uid: string): Promise<Person | null> {
  const snap = await getDoc(doc(ensure().db, "users", uid, "meta", "profile"));
  return snap.exists() ? ((snap.data().person ?? null) as Person | null) : null;
}
export async function saveProfile(uid: string, person: Person): Promise<void> {
  await setDoc(doc(ensure().db, "users", uid, "meta", "profile"), { person, updatedAt: serverTimestamp() });
}
export async function clearProfile(uid: string): Promise<void> {
  await deleteDoc(doc(ensure().db, "users", uid, "meta", "profile"));
}

// ── the cast (multi-profile) ─────────────────────────────────────────────────

/** users/{uid}/meta/people → { people, activeId }. Stored as one document rather
 *  than a collection: the whole cast is read and written together on every
 *  change, so a collection would only add round-trips and partial-write risk. */
export async function loadPeople(uid: string): Promise<PeopleState | null> {
  const snap = await getDoc(doc(ensure().db, "users", uid, "meta", "people"));
  if (!snap.exists()) return null;
  const data = snap.data();
  return { people: (data.people ?? []) as PeopleState["people"], activeId: (data.activeId ?? null) as string | null };
}
export async function savePeople(uid: string, state: PeopleState): Promise<void> {
  await setDoc(doc(ensure().db, "users", uid, "meta", "people"), { ...state, updatedAt: serverTimestamp() });
  // Mirror the active person to the legacy single-profile doc so an older client
  // signing into the same account still finds a chart.
  const active = state.people.find((p) => p.id === state.activeId);
  if (active) await saveProfile(uid, active);
}
/** users/{uid}/meta/journal → { entries }. Saved decisions + their outcomes.
 *  One document, like the cast: the journal is read and written whole, so a
 *  collection would only add a round-trip per keystroke and partial-write risk. */
export async function loadJournalCloud(uid: string): Promise<JournalEntry[]> {
  const snap = await getDoc(doc(ensure().db, "users", uid, "meta", "journal"));
  if (!snap.exists()) return [];
  const raw = snap.data().entries;
  return Array.isArray(raw) ? (raw as JournalEntry[]) : [];
}
export async function saveJournalCloud(uid: string, entries: JournalEntry[]): Promise<void> {
  await setDoc(doc(ensure().db, "users", uid, "meta", "journal"), { entries, updatedAt: serverTimestamp() });
}

// ── AI usage meter (written only by the chat Cloud Function; the client reads) ─

/** users/{uid}/billing/usage — the AI meter the Cloud Function increments. Read
 *  here only to show "N messages left today"; the server remains the authority. */
export function watchUsage(uid: string, cb: (record: UsageRecord | null) => void): () => void {
  return onSnapshot(
    doc(ensure().db, "users", uid, "billing", "usage"),
    (snap) => cb(snap.exists() ? (snap.data() as UsageRecord) : null),
    () => cb(null),
  );
}

/** Generic per-user collection helpers for the remaining spec collections
 *  (goals, saved_events, saved_reports, verification_runs). `ai_threads` is now
 *  live and has typed helpers below, built on these. */
export async function listDocs<T>(uid: string, coll: string): Promise<T[]> {
  const snap = await getDocs(collection(ensure().db, "users", uid, coll));
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as object) }) as T);
}
export async function putDoc(uid: string, coll: string, id: string, data: object): Promise<void> {
  await setDoc(doc(ensure().db, "users", uid, coll, safeId(id)), { ...data, updatedAt: serverTimestamp() });
}
export async function removeDoc(uid: string, coll: string, id: string): Promise<void> {
  await deleteDoc(doc(ensure().db, "users", uid, coll, safeId(id)));
}

// ── saved AI conversations ───────────────────────────────────────────────────
//
// users/{uid}/ai_threads/{threadId} → { thread, updatedAt: <server> }.
//
// A collection, not one document, because unlike the cast or the journal a
// conversation grows a turn at a time and there can be many of them: writing the
// whole history back on every reply would be a large upload per keystroke-ish
// turn, and one bad thread would risk the rest.
//
// TWO REASONS THE THREAD IS NESTED UNDER A `thread` FIELD rather than spread at
// the top level (the same shape `saveProfile` uses for `person`):
//   1. putDoc() stamps `updatedAt: serverTimestamp()` on whatever it is given.
//      Spread flat, that would CLOBBER the thread's own numeric `updatedAt` —
//      the exact field the merge orders by — and read it back as a Firestore
//      Timestamp, so every cloud thread would look undated and lose every merge.
//      Nested, the server stamp sits beside the thread and the thread's own
//      stamp survives a round trip byte-identical.
//   2. Document ids go through safeId(), which rewrites '/'. The thread's real
//      id stays inside the payload, so it is never quietly renamed.
export const AI_THREADS = "ai_threads";

interface ThreadDoc {
  id: string;
  thread?: unknown;
}

/** Every saved conversation in the account. Rows that aren't objects are skipped
 *  rather than thrown on — one bad document must not cost the user the rest. */
export async function listThreadsCloud(uid: string): Promise<ChatThread[]> {
  const docs = await listDocs<ThreadDoc>(uid, AI_THREADS);
  const out: ChatThread[] = [];
  for (const d of docs) {
    const t = d.thread as { id?: unknown } | null | undefined;
    if (t && typeof t === "object" && !Array.isArray(t) && typeof t.id === "string" && t.id) out.push(t as ChatThread);
  }
  return out;
}

export async function saveThreadCloud(uid: string, thread: ChatThread): Promise<void> {
  await putDoc(uid, AI_THREADS, thread.id, { thread });
}

export async function deleteThreadCloud(uid: string, id: string): Promise<void> {
  await removeDoc(uid, AI_THREADS, id);
}
