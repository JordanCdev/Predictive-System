import { describe, expect, it } from "vitest";
import { canonicalizeBirth } from "../src/engine/request.ts";
import { ZIPING_DEFAULT, ZIPING_TRUE_SOLAR } from "../src/engine/conventions.ts";

describe("canonical birth input", () => {
  it("normalises a complete input without downgrade", () => {
    const c = canonicalizeBirth(
      {
        dateOfBirth: "1990-06-15",
        localBirthTime: "14:30",
        tzOffsetMinutes: 480,
        birthplace: "Hong Kong",
        longitudeEast: 114.17,
        timeAccuracy: "exact",
      },
      ZIPING_TRUE_SOLAR,
    );
    expect(c.valid).toBe(true);
    expect(c.downgraded).toBe(false);
    expect(c.convention.hourBasis).toBe("true_solar");
    expect(c.moment).toEqual(
      expect.objectContaining({ year: 1990, month: 6, day: 15, hour: 14, minute: 30, longitudeEast: 114.17 }),
    );
    expect(c.missingFields).toEqual([]);
  });

  it("downgrades solar time to civil clock when longitude is missing, with a warning", () => {
    const c = canonicalizeBirth(
      { dateOfBirth: "1990-06-15", localBirthTime: "14:30", tzOffsetMinutes: 480, timeAccuracy: "exact" },
      ZIPING_TRUE_SOLAR,
    );
    expect(c.valid).toBe(true);
    expect(c.downgraded).toBe(true);
    expect(c.convention.hourBasis).toBe("civil_clock");
    expect(c.requestedConventionId).toBe(ZIPING_TRUE_SOLAR.id);
    expect(c.missingFields).toContain("longitude");
    expect(c.warnings.join(" ")).toMatch(/longitude/i);
  });

  it("does not downgrade a civil-clock request that lacks longitude", () => {
    const c = canonicalizeBirth({ dateOfBirth: "1990-06-15", localBirthTime: "09:00", tzOffsetMinutes: 0 }, ZIPING_DEFAULT);
    expect(c.downgraded).toBe(false);
    expect(c.convention.hourBasis).toBe("civil_clock");
  });

  it("treats a missing time as hour_unknown at noon and records the gap", () => {
    const c = canonicalizeBirth({ dateOfBirth: "1988-11-02", tzOffsetMinutes: 60 }, ZIPING_DEFAULT);
    expect(c.valid).toBe(true);
    expect(c.moment?.hour).toBe(12);
    expect(c.moment?.timeCertainty).toBe("hour_unknown");
    expect(c.missingFields).toContain("localBirthTime");
  });

  it("rejects an unparseable date without throwing", () => {
    const c = canonicalizeBirth({ dateOfBirth: "not-a-date", tzOffsetMinutes: 0 }, ZIPING_DEFAULT);
    expect(c.valid).toBe(false);
    expect(c.moment).toBeNull();
    expect(c.missingFields).toContain("dateOfBirth");
  });
});
