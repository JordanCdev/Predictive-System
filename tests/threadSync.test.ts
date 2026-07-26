/**
 * The cloud-sync decisions, tested as pure functions.
 *
 * The hook itself is thin React plumbing around three things: merge what the
 * account has with what this device has, work out what the account is behind
 * on, and never block on either. The first is the thread store's own
 * `mergeThreads` — deliberately not a second opinion written here; the other two
 * are below.
 *
 * The guarantee under test is the one that matters when Firebase is finally
 * configured: signing in must never cost you a conversation, and a conversation
 * already uploaded must not be uploaded again on every keystroke.
 */
import { describe, expect, it } from "vitest";
import { changedLocally, cloudStamps, threadsToPush } from "../src/ui/chat/useThreadSync.ts";
import { mergeThreads, type ChatThread } from "../src/ui/chat/threadStore.ts";

const thread = (id: string, updatedAt = 1_000, over: Record<string, unknown> = {}): ChatThread =>
  ({ id, title: `Conversation ${id}`, createdAt: 500, updatedAt, turns: [], ...over }) as unknown as ChatThread;

describe("threadsToPush", () => {
  it("uploads a conversation the account has never seen", () => {
    const local = [thread("local-only", 3_000)];
    const merged = mergeThreads(local, []);
    expect(threadsToPush(merged, cloudStamps([])).map((t) => t.id)).toEqual(["local-only"]);
  });

  it("uploads a conversation this device has carried on since the cloud last saw it", () => {
    const cloud = [thread("t1", 1_000)];
    const merged = mergeThreads([thread("t1", 9_000)], cloud);
    expect(threadsToPush(merged, cloudStamps(cloud)).map((t) => t.id)).toEqual(["t1"]);
  });

  it("uploads nothing when the account is already up to date", () => {
    const cloud = [thread("t1", 9_000), thread("t2", 4_000)];
    const merged = mergeThreads([thread("t1", 1_000)], cloud);
    // The cloud copy of t1 is newer, and t2 came down — neither needs a write.
    expect(threadsToPush(merged, cloudStamps(cloud))).toEqual([]);
  });

  it("uploads only the stale ones out of a mixed set", () => {
    const cloud = [thread("newer-there", 9_000), thread("older-there", 1_000)];
    const local = [thread("newer-there", 2_000), thread("older-there", 5_000), thread("only-here", 7_000)];
    const merged = mergeThreads(local, cloud);
    expect(
      threadsToPush(merged, cloudStamps(cloud))
        .map((t) => t.id)
        .sort(),
    ).toEqual(["older-there", "only-here"]);
  });

  // The debounced re-push after every save must be a no-op once a thread has
  // landed, or a long conversation re-uploads its whole history per turn.
  it("stops uploading a thread once the write has been recorded", () => {
    const known = cloudStamps([]);
    const t = thread("t1", 5_000);
    expect(threadsToPush([t], known)).toHaveLength(1);
    known.set(t.id, t.updatedAt);
    expect(threadsToPush([t], known)).toEqual([]);
    // …until it moves on again.
    expect(threadsToPush([thread("t1", 6_000)], known).map((x) => x.id)).toEqual(["t1"]);
  });

  // Before the first pull, `known` is empty — so everything looks un-pushed,
  // which is the safe direction to be wrong in.
  it("errs towards uploading when nothing is known about the account yet", () => {
    const local = [thread("a"), thread("b")];
    expect(threadsToPush(local, new Map()).map((t) => t.id)).toEqual(["a", "b"]);
  });

  // The whole point of the pull: a device signing in must end up holding at
  // least everything it held before, plus whatever the account had.
  it("never leaves a local conversation out of the merged set", () => {
    const local = [thread("a", 1), thread("b", 2), thread("c", 3)];
    const merged = mergeThreads(local, [thread("b", 99), thread("d", 4)]);
    for (const t of local) expect(merged.some((m) => m.id === t.id)).toBe(true);
    expect(merged).toHaveLength(4);
  });
});

describe("changedLocally", () => {
  it("is false when the merge brought nothing new, so a sign-in writes nothing", () => {
    const local = [thread("a", 5_000), thread("b", 1_000)];
    expect(changedLocally(local, mergeThreads(local, [thread("a", 2_000)]))).toBe(false);
  });

  it("is true when the account contributed a conversation", () => {
    const local = [thread("a", 5_000)];
    expect(changedLocally(local, mergeThreads(local, [thread("b", 1_000)]))).toBe(true);
  });

  it("is true when the account had a newer copy of a conversation we hold", () => {
    const local = [thread("a", 1_000)];
    expect(changedLocally(local, mergeThreads(local, [thread("a", 9_000)]))).toBe(true);
  });

  it("ignores a pure reordering, since the merge sorts newest first", () => {
    const local = [thread("a", 1_000), thread("b", 9_000)];
    const merged = mergeThreads(local, []);
    expect(merged.map((t) => t.id)).toEqual(["b", "a"]);
    expect(changedLocally(local, merged)).toBe(false);
  });
});
