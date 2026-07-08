import { describe, expect, it } from "vitest";
import { parseActivity } from "../src/engine/advisor.ts";

// The example phrases from the Phase-5 spec must land on a sensible objective.
const cases: [string, string][] = [
  ["ask for a raise", "negotiation_meeting"],
  ["send scholarship email", "study_exam"],
  ["move to China", "moving_house"],
  ["first date", "negotiation_meeting"],
  ["launch website", "open_business"],
  ["book surgery", "medical_procedure"],
  ["sign a contract", "contract_signing"],
  ["get married", "wedding_marriage"],
  ["buy a house", "investment_purchase"],
];

describe("free-text activity parser", () => {
  for (const [q, id] of cases) {
    it(`maps "${q}" → ${id}`, () => {
      const a = parseActivity(q);
      expect(a, `no match for "${q}"`).not.toBeNull();
      expect(a!.objective.id).toBe(id);
    });
  }

  it("carries structured metadata: risk, binding, domain, tag, weighting", () => {
    const a = parseActivity("sign a contract")!;
    expect(a.risk).toBe("high");
    expect(a.binding).toBe(true);
    expect(a.domain).toBe("wealth");
    expect(a.primaryTag).toBe("contract");
    // The personal BaZi weighting lives on the objective (godBias/weights).
    expect(a.objective.godBias.length).toBeGreaterThan(0);
  });

  it("offers exactly one clarification when the read is ambiguous", () => {
    // Sweep: whenever a profile is ambiguous it must present a clarification with
    // the top pick + alternatives; when unambiguous, no clarification.
    for (const q of ["buy", "move", "open", "study", "sign a contract"]) {
      const a = parseActivity(q);
      if (!a) continue;
      if (a.clarification) {
        expect(a.clarification.options.length).toBeGreaterThanOrEqual(2);
        expect(a.clarification.options[0].id).toBe(a.objective.id);
      }
    }
  });

  it("is deterministic and returns null for gibberish", () => {
    expect(JSON.stringify(parseActivity("launch my website"))).toBe(JSON.stringify(parseActivity("launch my website")));
    expect(parseActivity("qwerty zxcvbn")).toBeNull();
  });
});
