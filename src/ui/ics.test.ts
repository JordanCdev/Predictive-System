import { describe, it, expect } from "vitest";
import { evaluateDecision, objectiveById, ZIPING_DEFAULT } from "../engine/index.ts";
import { buildICS } from "./ics.ts";

const objective = objectiveById("contract_signing");

function rec() {
  const res = evaluateDecision({
    birth: { year: 1990, month: 6, day: 15, hour: 14, minute: 30, tzOffsetMinutes: 480, timeCertainty: "exact" },
    sex: "male",
    convention: ZIPING_DEFAULT,
    objective,
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
