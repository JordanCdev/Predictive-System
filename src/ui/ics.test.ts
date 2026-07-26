import { describe, it, expect } from "vitest";
import { evaluateDecision, objectiveById, objectivePlain, ZIPING_DEFAULT } from "../engine/index.ts";
import { buildICS, discreetByDefault } from "./ics.ts";

const objective = objectiveById("contract_signing");

function rec(obj = objective) {
  const res = evaluateDecision({
    birth: { year: 1990, month: 6, day: 15, hour: 14, minute: 30, tzOffsetMinutes: 480, timeCertainty: "exact" },
    sex: "male",
    convention: ZIPING_DEFAULT,
    objective: obj,
    window: { start: { year: 2026, month: 7, day: 1 }, days: 20, tzOffsetMinutes: 480 },
  });
  return res.recommendations[0];
}

describe("ics export", () => {
  it("builds a valid, deterministic VEVENT for the recommendation", () => {
    const r = rec();
    const ics = buildICS(r, objective);
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("BEGIN:VEVENT");
    expect(ics).toContain("END:VCALENDAR");
    expect(ics).toMatch(/SUMMARY:.*W.{0,2}i/); // "(Wéi)" present
    expect(ics).toMatch(/DTSTART/);
    expect(ics).toContain(r.isoDate.replace(/-/g, "")); // the event date
    expect(ics).toContain(`UID:${r.isoDate}-${objective.id}@wei`);
    // pure + deterministic
    expect(buildICS(r, objective)).toBe(ics);
  });
});

describe("calendar discretion", () => {
  // A .ics leaves the app for Google/Apple/Outlook, is often a shared or work
  // calendar, and surfaces on lock screens. These tests assert the INVARIANT —
  // "the activity does not appear anywhere in the file" — rather than the exact
  // wording, so rephrasing the copy can't quietly reopen the leak.
  const MEDICAL = objectiveById("medical_procedure");

  it("defaults to discreet for objectives that would disclose something sensitive", () => {
    expect(discreetByDefault("medical_procedure")).toBe(true);
    expect(discreetByDefault("career_move")).toBe(true);
    expect(discreetByDefault("investment_purchase")).toBe(true);
    expect(discreetByDefault("contract_signing")).toBe(false);
    expect(discreetByDefault("travel")).toBe(false);
  });

  it("leaks the activity nowhere in the file when discreet", () => {
    const r = rec(MEDICAL);
    const ics = buildICS(r, MEDICAL, { discreet: true });
    const plain = objectivePlain(MEDICAL.id);
    // Every channel the objective could ride out on: title, body, and the UID
    // that calendar clients store and replay in sync payloads and exports.
    for (const leak of [MEDICAL.id, plain.gerund, plain.short, plain.verb]) {
      expect(ics.toLowerCase(), `leaked "${leak}"`).not.toContain(leak.toLowerCase());
    }
    // "medical" must not survive in any casing or via the prose helpers, which
    // name the activity inside headlineVerdict/whyThisDay.
    expect(ics.toLowerCase()).not.toContain("medical");
    // Still a usable calendar entry — the timing is the part that must survive.
    expect(ics).toContain("BEGIN:VEVENT");
    expect(ics).toMatch(/DTSTART/);
    expect(ics).toContain(r.isoDate.replace(/-/g, ""));
  });

  it("names the activity when the user opts out of discretion", () => {
    const r = rec(MEDICAL);
    const ics = buildICS(r, MEDICAL, { discreet: false });
    expect(ics).toContain(objectivePlain(MEDICAL.id).gerund);
    expect(ics).toContain(`UID:${r.isoDate}-${MEDICAL.id}@wei`);
  });

  it("is deterministic in both modes", () => {
    const r = rec(MEDICAL);
    expect(buildICS(r, MEDICAL, { discreet: true })).toBe(buildICS(r, MEDICAL, { discreet: true }));
    expect(buildICS(r, MEDICAL, { discreet: false })).toBe(buildICS(r, MEDICAL, { discreet: false }));
  });
});
