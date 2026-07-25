import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_AI_CONSENT,
  EMPTY_PRIORITIES,
  MAX_ACCEPTED_SIGNALS,
  MAX_INTENTIONS,
  MAX_RANKED_AREAS,
  PRIORITIES_STORE_KEY,
  PRIORITY_AREAS,
  PriorityProfile,
  acceptSignal,
  addArea,
  clearPriorities,
  freshness,
  hasAcceptedSignal,
  hasStatedSharedContent,
  isDefaultConsent,
  isEmptyProfile,
  loadPriorities,
  moveArea,
  parsePriorities,
  rankOf,
  removeAcceptedSignal,
  removeArea,
  savePriorities,
  setAiConsent,
  setContext,
  setIntention,
  sharedForAi,
  touchPriorities,
  unrankedAreas,
} from "../src/ui/priorities/prioritiesStore.ts";

/** The test env is `node`, so localStorage doesn't exist. A tiny in-memory stub
 *  lets the persistence wrappers be exercised for real rather than mocked away. */
class MemoryStorage {
  map = new Map<string, string>();
  get length() {
    return this.map.size;
  }
  getItem(k: string) {
    return this.map.has(k) ? this.map.get(k)! : null;
  }
  setItem(k: string, v: string) {
    this.map.set(k, String(v));
  }
  removeItem(k: string) {
    this.map.delete(k);
  }
  clear() {
    this.map.clear();
  }
  key(i: number) {
    return Array.from(this.map.keys())[i] ?? null;
  }
}

const g = globalThis as { localStorage?: unknown; window?: unknown; StorageEvent?: unknown };
let store: MemoryStorage;

beforeEach(() => {
  store = new MemoryStorage();
  g.localStorage = store as unknown as Storage;
});
afterEach(() => {
  delete g.localStorage;
  delete g.window;
  delete g.StorageEvent;
});

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 6, 25); // fixed clock — never Date.now()

const filled = (over: Partial<PriorityProfile> = {}): PriorityProfile => ({
  ...EMPTY_PRIORITIES,
  areas: ["wealth", "career"],
  intentions: ["get the business to profitability"],
  context: {},
  acceptedSignals: [],
  aiConsent: { ...DEFAULT_AI_CONSENT },
  updatedAt: NOW,
  ...over,
});

describe("the rankable set", () => {
  it("is exactly the engine's four life areas", () => {
    expect(PRIORITY_AREAS.map((a) => a.key)).toEqual(["career", "wealth", "relationship", "health"]);
  });
});

describe("parsePriorities", () => {
  it("treats an absent record as an empty profile, not an error", () => {
    const p = parsePriorities(undefined);
    expect(p).toEqual(EMPTY_PRIORITIES);
    expect(isEmptyProfile(p)).toBe(true);
  });

  it("survives complete nonsense", () => {
    for (const junk of [null, 42, "nope", [], { areas: "career" }, { aiConsent: 7 }]) {
      const p = parsePriorities(junk);
      expect(p.areas).toEqual([]);
      expect(p.aiConsent).toEqual(DEFAULT_AI_CONSENT);
      expect(p.updatedAt).toBeNull();
    }
  });

  it("drops unknown areas, duplicates and overflow, preserving rank order", () => {
    const p = parsePriorities({
      areas: ["wealth", "astrology", "wealth", "health", "career", "relationship", "career"],
    });
    expect(p.areas).toEqual(["wealth", "health", "career", "relationship"]);
    expect(p.areas.length).toBeLessThanOrEqual(MAX_RANKED_AREAS);
  });

  it("trims intentions, drops blanks and keeps at most two", () => {
    const p = parsePriorities({ intentions: ["  settle somewhere permanent  ", "", "   ", "b", "c"] });
    expect(p.intentions).toEqual(["settle somewhere permanent", "b"]);
    expect(p.intentions.length).toBeLessThanOrEqual(MAX_INTENTIONS);
  });

  it("keeps only non-empty context fields", () => {
    const p = parsePriorities({ context: { lifeStage: " early career ", occupation: "  ", comingUp: undefined } });
    expect(p.context).toEqual({ lifeStage: "early career" });
  });

  it("never grants the sensitive context consent from a malformed record", () => {
    expect(parsePriorities({ aiConsent: { context: "yes" } }).aiConsent.context).toBe(false);
    expect(parsePriorities({ aiConsent: { context: 1 } }).aiConsent.context).toBe(false);
    expect(parsePriorities({ aiConsent: { context: true } }).aiConsent.context).toBe(true);
  });

  it("never grants journal-aggregate consent from a malformed, absent or older record", () => {
    // A profile written before the flag existed carries no `journal` key at all.
    expect(parsePriorities({ aiConsent: { areas: true, intentions: true, context: false } }).aiConsent.journal).toBe(false);
    expect(parsePriorities({}).aiConsent.journal).toBe(false);
    expect(parsePriorities({ aiConsent: { journal: "yes" } }).aiConsent.journal).toBe(false);
    expect(parsePriorities({ aiConsent: { journal: 1 } }).aiConsent.journal).toBe(false);
    expect(parsePriorities({ aiConsent: { journal: true } }).aiConsent.journal).toBe(true);
  });

  it("respects an explicit opt-out of the on-by-default fields", () => {
    const p = parsePriorities({ aiConsent: { areas: false, intentions: false } });
    expect(p.aiConsent).toEqual({ areas: false, intentions: false, context: false, journal: false });
  });

  it("rejects a nonsense updatedAt rather than inventing freshness", () => {
    expect(parsePriorities({ updatedAt: "yesterday" }).updatedAt).toBeNull();
    expect(parsePriorities({ updatedAt: Number.NaN }).updatedAt).toBeNull();
    expect(parsePriorities({ updatedAt: -1 }).updatedAt).toBeNull();
    expect(parsePriorities({ areas: ["career"], updatedAt: NOW }).updatedAt).toBe(NOW);
  });

  it("de-duplicates accepted signals and drops malformed ones", () => {
    const p = parsePriorities({
      acceptedSignals: [
        { id: "a", label: "Wealth keeps coming up", source: "journal", acceptedAt: NOW },
        { id: "a", label: "duplicate", acceptedAt: NOW },
        { id: "", label: "no id" },
        { id: "b" },
      ],
    });
    expect(p.acceptedSignals.map((s) => s.id)).toEqual(["a"]);
    expect(p.acceptedSignals[0].label).toBe("Wealth keeps coming up");
  });
});

describe("load / save / clear", () => {
  it("loads an empty profile when nothing was ever stored", () => {
    expect(loadPriorities()).toEqual(EMPTY_PRIORITIES);
  });

  it("loads an empty profile from corrupt JSON instead of throwing", () => {
    store.setItem(PRIORITIES_STORE_KEY, "{not json");
    expect(loadPriorities()).toEqual(EMPTY_PRIORITIES);
  });

  it("round-trips a saved profile and stamps updatedAt from the passed clock", () => {
    const saved = savePriorities(filled({ updatedAt: null }), NOW);
    expect(saved.updatedAt).toBe(NOW);
    const back = loadPriorities();
    expect(back.areas).toEqual(["wealth", "career"]);
    expect(back.intentions).toEqual(["get the business to profitability"]);
    expect(back.updatedAt).toBe(NOW);
  });

  it("normalises on the way in, so a bad in-memory profile can't be persisted", () => {
    const saved = savePriorities({ ...EMPTY_PRIORITIES, areas: ["career", "career", "bogus"] } as PriorityProfile, NOW);
    expect(saved.areas).toEqual(["career"]);
  });

  it("does not stamp (or keep) an empty profile — the nudge must not fire over nothing", () => {
    const saved = savePriorities(EMPTY_PRIORITIES, NOW);
    expect(saved.updatedAt).toBeNull();
    expect(store.getItem(PRIORITIES_STORE_KEY)).toBeNull();
  });

  it("still persists a deliberate consent change made before any priorities exist", () => {
    const p = setAiConsent(EMPTY_PRIORITIES, "context", true);
    expect(isDefaultConsent(p)).toBe(false);
    savePriorities(p, NOW);
    expect(loadPriorities().aiConsent.context).toBe(true);
    expect(loadPriorities().updatedAt).toBeNull();
  });

  it("clears everything", () => {
    savePriorities(filled(), NOW);
    expect(clearPriorities()).toEqual(EMPTY_PRIORITIES);
    expect(loadPriorities()).toEqual(EMPTY_PRIORITIES);
  });

  it("degrades to an empty profile when storage is unavailable", () => {
    delete g.localStorage;
    expect(loadPriorities()).toEqual(EMPTY_PRIORITIES);
    expect(() => savePriorities(filled(), NOW)).not.toThrow();
    expect(() => clearPriorities()).not.toThrow();
  });

  it("does not throw when storage refuses the write", () => {
    g.localStorage = {
      getItem: () => null,
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
      removeItem: () => undefined,
    } as unknown as Storage;
    expect(() => savePriorities(filled(), NOW)).not.toThrow();
  });
});

describe("same-tab change notification", () => {
  /** Readers elsewhere in the app subscribe to `storage`, which the browser only
   *  fires in other tabs. Saving must re-emit it so the current tab keeps up. */
  function fakeWindow() {
    const seen: { key: string | null }[] = [];
    class FakeStorageEvent {
      key: string | null;
      constructor(public type: string, init?: { key?: string }) {
        this.key = init?.key ?? null;
      }
    }
    g.StorageEvent = FakeStorageEvent;
    g.window = { dispatchEvent: (e: { key: string | null }) => seen.push(e) };
    return seen;
  }

  it("pings on save and on clear", () => {
    const seen = fakeWindow();
    savePriorities(filled(), NOW);
    clearPriorities();
    expect(seen.map((e) => e.key)).toEqual([PRIORITIES_STORE_KEY, PRIORITIES_STORE_KEY]);
  });

  it("is a no-op outside a browser", () => {
    expect(() => savePriorities(filled(), NOW)).not.toThrow();
  });
});

describe("ranking helpers", () => {
  it("adds to the bottom, ignores duplicates and unknown keys", () => {
    let p = addArea(EMPTY_PRIORITIES, "health");
    p = addArea(p, "career");
    p = addArea(p, "health");
    expect(p.areas).toEqual(["health", "career"]);
    expect(addArea(p, "money" as never)).toBe(p);
  });

  it("never exceeds the cap", () => {
    let p = EMPTY_PRIORITIES;
    for (const a of PRIORITY_AREAS) p = addArea(p, a.key);
    expect(p.areas.length).toBe(Math.min(PRIORITY_AREAS.length, MAX_RANKED_AREAS));
  });

  it("moves an area up and down, and no-ops at the ends", () => {
    const p = parsePriorities({ areas: ["career", "wealth", "health"] });
    expect(moveArea(p, "wealth", -1).areas).toEqual(["wealth", "career", "health"]);
    expect(moveArea(p, "wealth", 1).areas).toEqual(["career", "health", "wealth"]);
    expect(moveArea(p, "career", -1)).toBe(p);
    expect(moveArea(p, "health", 1)).toBe(p);
    expect(moveArea(p, "relationship", -1)).toBe(p);
  });

  it("removes without disturbing the rest of the order", () => {
    const p = parsePriorities({ areas: ["career", "wealth", "health"] });
    expect(removeArea(p, "wealth").areas).toEqual(["career", "health"]);
    expect(removeArea(p, "relationship")).toBe(p);
  });

  it("reports rank and what is left to rank", () => {
    const p = parsePriorities({ areas: ["health", "career"] });
    expect(rankOf(p, "health")).toBe(1);
    expect(rankOf(p, "career")).toBe(2);
    expect(rankOf(p, "wealth")).toBeNull();
    expect(unrankedAreas(p)).toEqual(["wealth", "relationship"]);
  });
});

describe("intentions and context", () => {
  it("sets, trims and clears the two slots without leaving holes", () => {
    let p = setIntention(EMPTY_PRIORITIES, 0, "  get the business to profitability  ");
    p = setIntention(p, 1, "settle somewhere permanent");
    expect(p.intentions).toEqual(["get the business to profitability", "settle somewhere permanent"]);
    p = setIntention(p, 0, "");
    expect(p.intentions).toEqual(["settle somewhere permanent"]);
    expect(setIntention(p, 5, "nope")).toBe(p);
  });

  it("clears context fields individually", () => {
    let p = setContext(EMPTY_PRIORITIES, { lifeStage: "early career", occupation: "founder", comingUp: "a move" });
    expect(p.context).toEqual({ lifeStage: "early career", occupation: "founder", comingUp: "a move" });
    p = setContext(p, { occupation: "" });
    expect(p.context).toEqual({ lifeStage: "early career", comingUp: "a move" });
    p = setContext(p, {});
    expect(p.context).toEqual({ lifeStage: "early career", comingUp: "a move" });
  });
});

describe("AI consent", () => {
  it("defaults to areas + intentions on, context and the journal aggregate off", () => {
    expect(EMPTY_PRIORITIES.aiConsent).toEqual({ areas: true, intentions: true, context: false, journal: false });
    expect(isDefaultConsent(EMPTY_PRIORITIES)).toBe(true);
  });

  it("counts a journal-consent change as a departure from the default", () => {
    expect(isDefaultConsent(setAiConsent(EMPTY_PRIORITIES, "journal", true))).toBe(false);
  });

  it("toggles each field independently", () => {
    const p = setAiConsent(setAiConsent(EMPTY_PRIORITIES, "areas", false), "context", true);
    expect(p.aiConsent).toEqual({ areas: false, intentions: true, context: true, journal: false });
  });

  it("shares only what was consented to", () => {
    const p = filled({ context: { occupation: "founder" }, updatedAt: NOW });
    expect(sharedForAi(p)).toEqual({
      areas: ["wealth", "career"],
      intentions: ["get the business to profitability"],
    });
    expect(sharedForAi(setAiConsent(p, "context", true))?.context).toEqual({ occupation: "founder" });
    const none = setAiConsent(setAiConsent(p, "areas", false), "intentions", false);
    expect(sharedForAi(none)).toBeNull();
  });

  it("shares nothing from an empty profile", () => {
    expect(sharedForAi(EMPTY_PRIORITIES)).toBeNull();
  });

  it("never projects the journal aggregate by default — not even for a full profile", () => {
    // The proven leak: a profile that has consented to areas must NOT thereby
    // consent to its journal-derived behaviour aggregate.
    expect(sharedForAi(filled())?.journal).toBeUndefined();
    expect(sharedForAi(EMPTY_PRIORITIES)).toBeNull();
    const on = setAiConsent(filled(), "journal", true);
    expect(sharedForAi(on)?.journal).toBe(true);
  });

  it("does not count the journal permission as the user having STATED something", () => {
    const journalOnly = setAiConsent(EMPTY_PRIORITIES, "journal", true);
    expect(hasStatedSharedContent(sharedForAi(journalOnly))).toBe(false);
    expect(hasStatedSharedContent(sharedForAi(filled()))).toBe(true);
    expect(hasStatedSharedContent(null)).toBe(false);
  });

  it("does not hand the advisor a copy it can mutate", () => {
    const p = filled();
    const shared = sharedForAi(p)!;
    shared.areas!.push("health");
    expect(p.areas).toEqual(["wealth", "career"]);
  });
});

describe("accepted signals", () => {
  it("records only what was explicitly accepted, newest first", () => {
    let p = acceptSignal(EMPTY_PRIORITIES, { id: "s1", label: "Wealth keeps coming up" }, NOW);
    p = acceptSignal(p, { id: "s2", label: "You log a lot of health days" }, NOW + DAY);
    expect(p.acceptedSignals.map((s) => s.id)).toEqual(["s2", "s1"]);
    expect(p.acceptedSignals[0].acceptedAt).toBe(NOW + DAY);
    expect(p.acceptedSignals[1].source).toBe("journal");
    expect(hasAcceptedSignal(p, "s1")).toBe(true);
    expect(hasAcceptedSignal(p, "nope")).toBe(false);
  });

  it("re-accepting refreshes rather than duplicating", () => {
    let p = acceptSignal(EMPTY_PRIORITIES, { id: "s1", label: "old wording" }, NOW);
    p = acceptSignal(p, { id: "s1", label: "new wording" }, NOW + DAY);
    expect(p.acceptedSignals).toHaveLength(1);
    expect(p.acceptedSignals[0].label).toBe("new wording");
  });

  it("ignores a malformed suggestion", () => {
    expect(acceptSignal(EMPTY_PRIORITIES, { id: "", label: "x" }, NOW).acceptedSignals).toHaveLength(0);
    expect(acceptSignal(EMPTY_PRIORITIES, { id: "a", label: "   " }, NOW).acceptedSignals).toHaveLength(0);
  });

  it("caps the list and lets the user take one back out", () => {
    let p = EMPTY_PRIORITIES;
    for (let i = 0; i < MAX_ACCEPTED_SIGNALS + 5; i++) p = acceptSignal(p, { id: `s${i}`, label: `sig ${i}` }, NOW + i);
    expect(p.acceptedSignals).toHaveLength(MAX_ACCEPTED_SIGNALS);
    const id = p.acceptedSignals[0].id;
    p = removeAcceptedSignal(p, id);
    expect(hasAcceptedSignal(p, id)).toBe(false);
    expect(removeAcceptedSignal(p, "not-there")).toBe(p);
  });

  it("counts as content, so a signals-only profile is not empty", () => {
    const p = acceptSignal(EMPTY_PRIORITIES, { id: "s1", label: "Wealth keeps coming up" }, NOW);
    expect(isEmptyProfile(p)).toBe(false);
  });
});

describe("freshness", () => {
  it("is 'unset' when nothing was ever saved", () => {
    expect(freshness(EMPTY_PRIORITIES, NOW)).toEqual({ state: "unset", ageDays: null, ageMonths: null, needsReview: false });
  });

  it("is 'unset' for an emptied profile that still carries an old stamp", () => {
    expect(freshness({ ...EMPTY_PRIORITIES, updatedAt: NOW - 800 * DAY }, NOW).state).toBe("unset");
  });

  it("is fresh right up to the twelve-month mark", () => {
    const p = filled({ updatedAt: NOW - 364 * DAY });
    const f = freshness(p, NOW);
    expect(f.state).toBe("fresh");
    expect(f.ageDays).toBe(364);
    expect(f.needsReview).toBe(false);
  });

  it("asks for a review at twelve months, and never auto-changes anything", () => {
    const p = filled({ updatedAt: NOW - 400 * DAY });
    const f = freshness(p, NOW);
    expect(f.state).toBe("stale");
    expect(f.needsReview).toBe(true);
    expect(f.ageMonths).toBe(13);
    // The profile itself is untouched: a stale profile is still used in full.
    expect(p.areas).toEqual(["wealth", "career"]);
  });

  it("clamps a clock that went backwards instead of reporting a negative age", () => {
    expect(freshness(filled({ updatedAt: NOW + 5 * DAY }), NOW).ageDays).toBe(0);
  });

  it("touching re-stamps without changing content, and clears the nudge", () => {
    const p = filled({ updatedAt: NOW - 400 * DAY });
    const t = touchPriorities(p, NOW);
    expect(t.updatedAt).toBe(NOW);
    expect(t.areas).toEqual(p.areas);
    expect(t.intentions).toEqual(p.intentions);
    expect(freshness(t, NOW).needsReview).toBe(false);
    // An empty profile can't be touched into looking set.
    expect(touchPriorities(EMPTY_PRIORITIES, NOW).updatedAt).toBeNull();
  });
});

describe("the empty profile is harmless", () => {
  it("answers every query without special-casing by the caller", () => {
    const p = EMPTY_PRIORITIES;
    expect(isEmptyProfile(p)).toBe(true);
    expect(rankOf(p, "career")).toBeNull();
    expect(unrankedAreas(p)).toEqual(["career", "wealth", "relationship", "health"]);
    expect(sharedForAi(p)).toBeNull();
    expect(freshness(p, NOW).needsReview).toBe(false);
    expect(removeArea(p, "career")).toBe(p);
    expect(moveArea(p, "career", 1)).toBe(p);
  });

  it("is never mutated by the helpers", () => {
    addArea(EMPTY_PRIORITIES, "career");
    setIntention(EMPTY_PRIORITIES, 0, "x");
    setContext(EMPTY_PRIORITIES, { occupation: "y" });
    setAiConsent(EMPTY_PRIORITIES, "context", true);
    acceptSignal(EMPTY_PRIORITIES, { id: "s", label: "l" }, NOW);
    expect(EMPTY_PRIORITIES).toEqual({
      areas: [],
      intentions: [],
      context: {},
      acceptedSignals: [],
      aiConsent: { areas: true, intentions: true, context: false, journal: false },
      updatedAt: null,
    });
  });
});
