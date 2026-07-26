import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { ALL_LOCAL_KEYS, EXCLUDED_KEYS, wipeLocal } from "../src/ui/backup.ts";

/**
 * Erasure (Article 17) is only as complete as the list of things it deletes, and
 * that list is hand-maintained because the Firestore web SDK cannot enumerate
 * subcollections. So the real risk is not a broken delete — it is a NEW write
 * path added months from now that nobody adds to the erase path.
 *
 * These tests read the source of the two modules that own storage and fail when
 * a location is written but never erased. That is the drift this guards, and it
 * is exactly how users/{uid}/meta/profile came to accumulate birth records that
 * no code path ever removed.
 */
const CLIENT_SRC = readFileSync(new URL("../src/firebase/client.ts", import.meta.url), "utf8");

/** Collections the CLIENT is deliberately not permitted to erase, and why. */
const EXEMPT_COLLECTIONS = new Set(["billing"]);

describe("Firestore erasure covers every path the client writes", () => {
  it("erases every users/{uid}/<coll>/<doc> the client writes", () => {
    // Every `doc(..., "users", uid, "<coll>", "<id>")` in the client module.
    const written = new Set<string>();
    for (const m of CLIENT_SRC.matchAll(/"users",\s*uid,\s*"([a-z_]+)",\s*"([a-z_]+)"/g)) {
      written.add(`${m[1]}/${m[2]}`);
    }
    expect(written.size, "regex found no write paths — it has drifted from the source").toBeGreaterThan(0);

    // Everything the erase path names, as `coll/id`. Anchor on the assignment,
    // not the identifier: the type annotation `Array<[string, string]>` carries
    // its own brackets and slicing to the first `]` stops before any entry.
    const decl = CLIENT_SRC.slice(CLIENT_SRC.indexOf("ERASABLE_DOCS"));
    const table = decl.slice(decl.indexOf("= ["), decl.indexOf("];"));
    const erasable = new Set<string>();
    for (const m of table.matchAll(/\["([a-z_]+)",\s*"([a-z_]+)"\]/g)) {
      erasable.add(`${m[1]}/${m[2]}`);
    }
    expect(erasable.size, "parsed no entries out of ERASABLE_DOCS — the guard would pass vacuously").toBeGreaterThan(0);

    const missed = [...written].filter((p) => !erasable.has(p) && !EXEMPT_COLLECTIONS.has(p.split("/")[0]));
    expect(missed, `written but never erased: ${missed.join(", ")} — add to ERASABLE_DOCS or exempt it explicitly`).toEqual([]);
  });

  it("keeps the AI usage meter exempt for a stated reason, not by omission", () => {
    // The client cannot delete it: firestore.rules denies client writes to
    // `billing` so a quota cannot be self-reset, and a delete is a write. The
    // requirement is that the code SAYS so where a reader will find it.
    expect(CLIENT_SRC).toMatch(/billing/);
    expect(CLIENT_SRC).toMatch(/retained/);
    const rules = readFileSync(new URL("../firestore.rules", import.meta.url), "utf8");
    expect(rules).toContain("coll != 'billing'");
  });

  it("erases the whole ai_threads collection, not one document", () => {
    // Threads are the only true collection under a user; erasing "the active
    // one" would leave every other saved conversation behind.
    expect(CLIENT_SRC).toMatch(/ERASABLE_COLLECTIONS\s*=\s*\[AI_THREADS\]/);
    expect(CLIENT_SRC).toMatch(/getDocs\(collection\(db, "users", uid, coll\)\)/);
  });

  it("deletes stored data BEFORE the auth user", () => {
    // Order is not cosmetic: once the auth user is gone the security rules stop
    // matching and anything left under users/{uid} can never be deleted by the
    // user again. Assert the call order in the source.
    const fn = CLIENT_SRC.slice(CLIENT_SRC.indexOf("export async function deleteAccount"));
    const body = fn.slice(0, fn.indexOf("\n}"));
    expect(body.indexOf("eraseAccountData")).toBeGreaterThan(-1);
    expect(body.indexOf("deleteUser")).toBeGreaterThan(-1);
    expect(body.indexOf("eraseAccountData")).toBeLessThan(body.indexOf("deleteUser"));
  });
});

describe("local wipe", () => {
  const mk = (seed: Record<string, string>) => {
    const map = new Map(Object.entries(seed));
    return {
      store: {
        getItem: (k: string) => map.get(k) ?? null,
        setItem: (k: string, v: string) => void map.set(k, v),
        removeItem: (k: string) => void map.delete(k),
      },
      map,
    };
  };

  it("removes every app-owned key, including ones a backup deliberately excludes", () => {
    const seed: Record<string, string> = {};
    for (const k of ALL_LOCAL_KEYS) seed[k] = "x";
    const { store, map } = mk(seed);
    const removed = wipeLocal(store);
    expect(removed.length).toBe(ALL_LOCAL_KEYS.length);
    expect(map.size).toBe(0);
    // The API key is the point: a backup excludes it (a credential shouldn't
    // travel in a portable file), a wipe must include it (leaving a working key
    // on a device someone is walking away from is the opposite of erasure).
    for (const k of EXCLUDED_KEYS) expect(removed).toContain(k);
  });

  it("leaves keys it does not own alone", () => {
    const { store, map } = mk({ wei_journal_v1: "x", "some_other_app": "keep" });
    wipeLocal(store);
    expect(map.get("some_other_app")).toBe("keep");
    expect(map.has("wei_journal_v1")).toBe(false);
  });

  it("covers every wei_* key the app actually uses", () => {
    // Catches a new store being added without joining the wipe list.
    const used = new Set<string>();
    for (const f of ["../src/ui/backup.ts", "../src/ui/ChatPanel.tsx", "../src/ui/chat/threadStore.ts", "../src/firebase/client.ts"]) {
      const src = readFileSync(new URL(f, import.meta.url), "utf8");
      for (const m of src.matchAll(/"(wei_[a-z_0-9]+)"/g)) used.add(m[1]);
    }
    const missed = [...used].filter((k) => !(ALL_LOCAL_KEYS as readonly string[]).includes(k));
    expect(missed, `wei_* keys not covered by wipeLocal: ${missed.join(", ")}`).toEqual([]);
  });
});
