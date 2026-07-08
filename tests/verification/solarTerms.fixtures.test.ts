import { describe, expect, it } from "vitest";
import {
  HKO_FIXTURE_YEARS,
  HKO_TERMS,
  JPL_CROSSINGS,
  SOLAR_TERM_PASS_SECONDS,
  verifyAgainstJplFixture,
  verifyHkoTerm,
  verifyTermsAround,
} from "../../src/engine/verification/verifySolarTerms.ts";
import { findSolarLongitudeCrossing } from "../../src/engine/astronomy.ts";

describe("HKO solar-term fixtures (offline, authoritative)", () => {
  it("covers three years with 24 terms each", () => {
    expect(HKO_FIXTURE_YEARS).toEqual([2025, 2026, 2027]);
    for (const year of HKO_FIXTURE_YEARS) {
      expect(HKO_TERMS.filter((t) => t.year === year)).toHaveLength(24);
    }
  });

  it("matches every one of the 72 published term instants within 120 s", () => {
    for (const term of HKO_TERMS) {
      const [instant] = verifyHkoTerm(term);
      expect(
        instant.status,
        `${term.nameZh} ${term.year}: engine=${String(instant.actual)} HKO=${term.utcIso} Δ=${String(instant.delta)}s`,
      ).toBe("pass");
    }
  });

  it("engine solar longitude at every published instant is within 0.01° (minute-rounded source)", () => {
    for (const term of HKO_TERMS) {
      const [, longitude] = verifyHkoTerm(term);
      expect(
        longitude.status,
        `${term.nameZh} ${term.year}: λ=${String(longitude.actual)} vs ${term.longitude} Δ=${String(longitude.delta)}°`,
      ).not.toBe("fail");
    }
  });

  it("matches Li Chun 2026 within two minutes (report example)", () => {
    const liChun2026 = HKO_TERMS.find((t) => t.year === 2026 && t.nameZh === "立春")!;
    expect(liChun2026.utcIso).toBe("2026-02-03T20:02:00Z");
    const internal = findSolarLongitudeCrossing(315, Date.parse(liChun2026.utcIso));
    expect(Math.abs(internal - Date.parse(liChun2026.utcIso)) / 1000).toBeLessThanOrEqual(SOLAR_TERM_PASS_SECONDS);
  });

  it("verifyTermsAround brackets an instant with its two neighbouring terms", () => {
    // 2026-07-08 sits between 小暑 (Jul 7) and 大暑 (Jul 22).
    const fields = verifyTermsAround(Date.UTC(2026, 6, 8, 4));
    const instants = fields.filter((f) => f.field === "solarTermInstant");
    expect(instants).toHaveLength(2);
    expect(instants.map((f) => f.notes?.[0] ?? "")).toEqual([
      expect.stringContaining("小暑"),
      expect.stringContaining("大暑"),
    ]);
    for (const f of instants) expect(f.status).toBe("pass");
  });

  it("reports unsupported (never a silent pass) outside fixture coverage", () => {
    const fields = verifyTermsAround(Date.UTC(2031, 6, 1));
    expect(fields.some((f) => f.status === "unsupported")).toBe(true);
  });
});

describe("JPL Horizons fixtures (apparent geocentric ecliptic-of-date longitude)", () => {
  it("holds five 2026 crossings with raw 1-minute samples", () => {
    expect(JPL_CROSSINGS).toHaveLength(5);
    for (const c of JPL_CROSSINGS) {
      expect(c.samples?.length ?? 0).toBeGreaterThanOrEqual(3);
    }
  });

  it("matches every JPL-interpolated crossing within 120 s and every raw longitude sample within 0.01°", () => {
    const fields = verifyAgainstJplFixture();
    for (const f of fields) {
      expect(
        f.status,
        `${f.field} ${f.notes?.[0] ?? ""}: expected=${String(f.expected)} actual=${String(f.actual)} Δ=${String(f.delta)}`,
      ).not.toBe("fail");
    }
    // Crossing instants (blocking) must all be full passes, not just warns.
    for (const f of fields.filter((x) => x.field === "solarTermInstant")) {
      expect(f.status, `${f.notes?.[0]} Δ=${String(f.delta)}s`).toBe("pass");
    }
  });

  it("HKO and JPL agree with each other (independent-source consistency)", () => {
    // Where both sources publish the same 2026 crossing, they must sit within
    // 90 s of each other (HKO rounds to the minute; JPL interpolated to the second).
    const pairs: [number, string][] = [
      [315, "立春"],
      [0, "春分"],
      [90, "夏至"],
      [180, "秋分"],
      [270, "冬至"],
    ];
    for (const [lon, nameZh] of pairs) {
      const hko = HKO_TERMS.find((t) => t.year === 2026 && t.nameZh === nameZh)!;
      const jpl = JPL_CROSSINGS.find((c) => c.longitudeDeg === lon)!;
      const delta = Math.abs(Date.parse(hko.utcIso) - Date.parse(jpl.utcIso)) / 1000;
      expect(delta, `${nameZh} 2026: HKO=${hko.utcIso} JPL=${jpl.utcIso}`).toBeLessThanOrEqual(90);
    }
  });
});
