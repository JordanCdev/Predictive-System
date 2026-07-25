import { describe, expect, it } from "vitest";
import { OBJECTIVES, objectiveById } from "../src/engine/objectives.ts";
import type { JournalEntry } from "../src/ui/journalStore.ts";
import { deriveSignals, objectiveAreaWeights } from "../src/ui/priorities/deriveSignals.ts";

let seq = 0;
/** A journal entry for an objective. `savedAt` is fixed data, never a clock read. */
const entry = (objectiveId: string, over: Partial<JournalEntry> = {}): JournalEntry => {
  const isoDate = over.isoDate ?? `2026-08-${String((seq % 28) + 1).padStart(2, "0")}`;
  seq += 1;
  return {
    id: `${objectiveId}:${isoDate}:${seq}`,
    objectiveId,
    objectiveLabel: objectiveById(objectiveId).label,
    isoDate,
    weekday: "Monday",
    score: 62,
    band: "Good",
    verdict: "A workable day.",
    bestHour: null,
    note: "PRIVATE NOTE — must never appear in a signal",
    savedAt: 1_700_000_000_000,
    ...over,
  };
};

describe("objective → life-area mapping (derived from godBias + primaryTag)", () => {
  /** Objectives that legitimately name no life area at all (see below). */
  const DOMAINLESS = ["travel"];

  it("gives every domain-carrying objective a mapping that sums to 1", () => {
    for (const o of OBJECTIVES) {
      const w = objectiveAreaWeights(o);
      const total = Object.values(w).reduce((a, b) => a + b, 0);
      if (DOMAINLESS.includes(o.id)) {
        expect(w, o.id).toEqual({});
        continue;
      }
      expect(Object.keys(w).length, o.id).toBeGreaterThan(0);
      expect(total, o.id).toBeCloseTo(1, 10);
    }
  });

  it("routes each objective to the area it is obviously about", () => {
    const top = (id: string) =>
      (Object.entries(objectiveAreaWeights(objectiveById(id))) as [string, number][]).sort((a, b) => b[1] - a[1])[0][0];
    expect(top("career_move")).toBe("career");
    expect(top("contract_signing")).toBe("wealth");
    expect(top("open_business")).toBe("wealth");
    expect(top("investment_purchase")).toBe("wealth");
    expect(top("wedding_marriage")).toBe("relationship");
    expect(top("moving_house")).toBe("relationship");
    expect(top("medical_procedure")).toBe("health");
    // study_exam leads on its own 入學 tag, not on the Output group.
    expect(top("study_exam")).toBe("career");
  });

  it("treats a planned trip as evidence of nothing", () => {
    // 出行 names no life domain, and its Output godBias names none either — a trip
    // can be for work, family or rest. Routing Output to health made one saved
    // travel plan read as 100% evidence that Wellbeing is the top priority.
    expect(objectiveAreaWeights(objectiveById("travel"))).toEqual({});
    const signals = deriveSignals([entry("travel"), entry("travel"), entry("travel"), entry("travel")]);
    expect(signals.consideredEntries).toBe(0);
    expect(signals.ranked).toEqual([]);
    expect(signals.suggestions).toEqual([]);
    // …and it cannot tip an otherwise-honest journal either.
    const mixed = deriveSignals([entry("travel"), entry("travel"), entry("career_move"), entry("career_move"), entry("career_move")]);
    expect(mixed.ranked.map((r) => r.area)).toEqual(["career"]);
    expect(mixed.suggestions.map((r) => r.area)).toEqual(["career"]);
  });

  it("does not let a wedding's Resource bias read as a career signal", () => {
    expect(objectiveAreaWeights(objectiveById("wedding_marriage"))).toEqual({ relationship: 1 });
    expect(objectiveAreaWeights(objectiveById("medical_procedure"))).toEqual({ health: 1 });
  });

  it("treats the general day reading as no signal at all", () => {
    // Reading a day tells us nothing about what the reader cares about.
    const signals = deriveSignals([entry("general_day"), entry("general_day"), entry("general_day"), entry("general_day")]);
    expect(signals.consideredEntries).toBe(0);
    expect(signals.enoughEvidence).toBe(false);
    expect(signals.suggestions).toEqual([]);
  });
});

describe("deriveSignals — evidence thresholds", () => {
  it("suggests nothing below the minimum-evidence bar", () => {
    const two = deriveSignals([entry("career_move"), entry("career_move")]);
    expect(two.enoughEvidence).toBe(false);
    expect(two.suggestions).toEqual([]);
  });

  it("suggests an area once three saved decisions point at it, with the evidence", () => {
    const s = deriveSignals([entry("career_move"), entry("career_move"), entry("career_move")]);
    expect(s.enoughEvidence).toBe(true);
    expect(s.suggestions.length).toBe(1);
    const top = s.suggestions[0];
    expect(top.area).toBe("career");
    expect(top.label).toBe("Career");
    expect(top.entries).toBe(3);
    expect(top.weight).toBeCloseTo(3, 5);
    expect(top.share).toBe(100);
    expect(top.evidence).toContain("3 saved decisions");
    expect(top.evidence).toContain("3 × Start a job");
    expect(top.contributors[0]).toEqual({ objectiveId: "career_move", label: objectiveById("career_move").label, count: 3 });
  });

  it("needs real weight, not just three grazing entries", () => {
    // negotiation_meeting is a commercial meeting: ⅔ wealth, ⅓ career. Three of
    // them touch career three times but carry only 1 decision of evidence for it,
    // so career stays below the weight floor while wealth clears it.
    const s = deriveSignals([entry("negotiation_meeting"), entry("negotiation_meeting"), entry("negotiation_meeting")]);
    expect(s.ranked.map((r) => r.area)).toEqual(["wealth", "career"]);
    expect(s.ranked[1].area).toBe("career");
    expect(s.ranked[1].entries).toBe(3); // touched by all three…
    expect(s.ranked[1].weight).toBeCloseTo(1, 5); // …but worth one decision
    expect(s.suggestions.map((x) => x.area)).toEqual(["wealth"]);
  });

  it("counts a mixed journal by weight and ranks the strongest area first", () => {
    const s = deriveSignals([
      entry("contract_signing"),
      entry("contract_signing"),
      entry("contract_signing"),
      entry("investment_purchase"),
      entry("wedding_marriage"),
    ]);
    expect(s.suggestions[0].area).toBe("wealth");
    // 3 × contract (⅔ each) + 1 × purchase (1.0) = 3 decisions of evidence.
    expect(s.suggestions[0].weight).toBeCloseTo(3, 5);
    expect(s.suggestions[0].entries).toBe(4);
    expect(s.suggestions[0].share).toBe(60);
    expect(s.suggestions[0].contributors.map((c) => c.objectiveId)).toEqual(["contract_signing", "investment_purchase"]);
    // Career is touched three times but only worth one decision; the wedding is a
    // single entry. Neither is suggested on that evidence.
    expect(s.suggestions.map((x) => x.area)).toEqual(["wealth"]);
  });

  it("never re-suggests an area the user has already ranked", () => {
    const entries = [entry("career_move"), entry("career_move"), entry("career_move")];
    expect(deriveSignals(entries).suggestions.map((x) => x.area)).toEqual(["career"]);
    expect(deriveSignals(entries, { exclude: ["career"] }).suggestions).toEqual([]);
  });

  it("reports how many of the contributing decisions were followed up", () => {
    const outcome = { actualDate: "2026-08-02", rating: "good" as const, stress: 2, helped: true, notes: "", recordedAt: 1_700_000_000_000 };
    const s = deriveSignals([entry("career_move", { outcome }), entry("career_move"), entry("career_move")]);
    expect(s.suggestions[0].withOutcome).toBe(1);
    expect(s.suggestions[0].evidence).toContain("You logged an outcome for 1 of them.");
  });

  it("ignores an unrecognised objective id rather than inventing evidence for it", () => {
    // objectiveById falls back to OBJECTIVES[0]; deriveSignals must not.
    const s = deriveSignals([entry("not_a_real_objective"), entry("not_a_real_objective"), entry("not_a_real_objective")]);
    expect(s.consideredEntries).toBe(0);
    expect(s.suggestions).toEqual([]);
  });
});

describe("deriveSignals — the trust guarantees", () => {
  it("is pure and deterministic — the same entries always give the same signals", () => {
    const entries = [entry("career_move"), entry("career_move"), entry("career_move"), entry("wedding_marriage")];
    const a = JSON.stringify(deriveSignals(entries));
    const b = JSON.stringify(deriveSignals(entries));
    expect(a).toBe(b);
  });

  it("never leaks the user's journal notes into a suggestion", () => {
    const entries = [entry("career_move"), entry("career_move"), entry("career_move")];
    expect(JSON.stringify(deriveSignals(entries))).not.toContain("PRIVATE NOTE");
  });

  it("writes nothing — a suggestion is only ever a suggestion", () => {
    const entries = [entry("career_move"), entry("career_move"), entry("career_move")];
    const before = JSON.stringify(entries);
    const store: Record<string, string> = {};
    const spy = { setItem: (k: string, v: string) => (store[k] = v) };
    // deriveSignals takes no store and returns plain data; the entries it was
    // handed come back untouched.
    deriveSignals(entries);
    expect(JSON.stringify(entries)).toBe(before);
    expect(Object.keys(store)).toEqual([]);
    expect(spy.setItem).toBeDefined();
  });

  it("labels its output as a product feature, not doctrine", () => {
    const s = deriveSignals([entry("career_move"), entry("career_move"), entry("career_move")]);
    expect(s.note).toMatch(/not part of the classical reading/i);
    expect(s.note).toMatch(/never change a day's score/i);
  });
});
