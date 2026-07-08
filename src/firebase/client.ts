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
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { firebaseConfig } from "./config.ts";
import type { Person } from "../ui/PersonalizeCard.tsx";
import type { JournalEntry } from "../ui/journalStore.ts";

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Firestore | null = null;

function ensure(): { auth: Auth; db: Firestore } {
  if (!app) {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
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

/** users/{uid}/journal/{entryId} — saved decisions + their outcomes. */
export async function loadJournalCloud(uid: string): Promise<JournalEntry[]> {
  const snap = await getDocs(collection(ensure().db, "users", uid, "journal"));
  return snap.docs.map((d) => d.data() as JournalEntry);
}
export async function saveJournalEntryCloud(uid: string, entry: JournalEntry): Promise<void> {
  await setDoc(doc(ensure().db, "users", uid, "journal", safeId(entry.id)), entry);
}
export async function deleteJournalEntryCloud(uid: string, id: string): Promise<void> {
  await deleteDoc(doc(ensure().db, "users", uid, "journal", safeId(id)));
}

/** Generic per-user collection helpers for the remaining spec collections
 *  (goals, saved_events, saved_reports, verification_runs, ai_threads). */
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
