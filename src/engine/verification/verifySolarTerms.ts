/**
 * Solar-term verification against Hong Kong Observatory published times and
 * JPL Horizons-derived samples (docs/VERIFICATION.md).
 *
 * Offline by default: comparisons run against fixtures generated from the
 * authoritative sources (HKO publishes HKT times to the minute based on HM
 * Nautical Almanac Office data; the JPL fixture holds raw 1-minute Horizons
 * samples of apparent geocentric ecliptic-of-date longitude). Live JPL checks
 * live in jplHorizons.ts behind VERIFY_LIVE_JPL=1 and are never used here.
 */

import { findSolarLongitudeCrossing, solarLongitudeAtMillis } from "../astronomy.ts";
import { mod } from "../symbols.ts";
import { FieldAgreement, VerificationSource } from "./types.ts";
import hkoFixture from "./fixtures/hko-solar-terms.json";
import jplFixture from "./fixtures/jpl-2026-crossings.json";

// Tolerances (report §Tolerances): stricter than the old ±30 min kernel check.
export const SOLAR_TERM_PASS_SECONDS = 120;
export const SOLAR_TERM_WARN_SECONDS = 600;
export const SOLAR_LONGITUDE_PASS_DEG = 0.001;
export const SOLAR_LONGITUDE_WARN_DEG = 0.01;

export interface HkoTerm {
  year: number;
  nameZh: string;
  longitude: number;
  utcIso: string;
  hktText?: string;
}

export const HKO_TERMS: HkoTerm[] = hkoFixture.terms;
export const HKO_FIXTURE_YEARS: number[] = [...new Set(HKO_TERMS.map((t) => t.year))].sort();

export function hkoSource(): VerificationSource {
  return {
    id: "hko",
    sourceLabel: "Hong Kong Observatory 24-solar-term tables",
    sourceUrl: "fixture:src/engine/verification/fixtures/hko-solar-terms.json",
    checkedAtIso: hkoFixture.retrievedAtIso,
  };
}

export function jplSource(): VerificationSource {
  return {
    id: "jpl-horizons",
    version: jplFixture.apiVersion,
    sourceLabel: "NASA/JPL Horizons (fixture samples)",
    sourceUrl: "fixture:src/engine/verification/fixtures/jpl-2026-crossings.json",
    checkedAtIso: jplFixture.retrievedAtIso,
  };
}

function instantStatus(deltaSeconds: number): FieldAgreement["status"] {
  if (deltaSeconds <= SOLAR_TERM_PASS_SECONDS) return "pass";
  if (deltaSeconds <= SOLAR_TERM_WARN_SECONDS) return "warn";
  return "fail";
}

function angularDelta(a: number, b: number): number {
  return Math.abs(mod(a - b + 180, 360) - 180);
}

/** Compare the engine's crossing instant for one HKO-published term. */
export function verifyHkoTerm(term: HkoTerm): FieldAgreement[] {
  const published = Date.parse(term.utcIso);
  const internal = findSolarLongitudeCrossing(term.longitude, published);
  const deltaSeconds = Math.round(Math.abs(internal - published) / 1000);
  const fields: FieldAgreement[] = [
    {
      field: "solarTermInstant",
      status: instantStatus(deltaSeconds),
      source: "hko",
      expected: term.utcIso,
      actual: new Date(internal).toISOString(),
      delta: deltaSeconds,
      threshold: `pass<=${SOLAR_TERM_PASS_SECONDS}s warn<=${SOLAR_TERM_WARN_SECONDS}s`,
      blocking: true,
      notes: [`${term.nameZh} ${term.year} (λ=${term.longitude}°); HKO publishes to the minute (±30 s rounding).`],
    },
  ];
  // At HKO's published instant, the Sun must sit at the term longitude.
  const lonAtPublished = solarLongitudeAtMillis(published);
  const lonDelta = angularDelta(lonAtPublished, term.longitude);
  fields.push({
    field: "solarLongitude",
    status: lonDelta <= SOLAR_LONGITUDE_PASS_DEG ? "pass" : lonDelta <= SOLAR_LONGITUDE_WARN_DEG ? "warn" : "fail",
    source: "hko",
    expected: term.longitude,
    actual: Math.round(lonAtPublished * 100000) / 100000,
    delta: Math.round(lonDelta * 100000) / 100000,
    threshold: `pass<=${SOLAR_LONGITUDE_PASS_DEG}° warn<=${SOLAR_LONGITUDE_WARN_DEG}°`,
    blocking: false,
    notes: [`${term.nameZh} ${term.year}: engine solar longitude at the HKO instant (minute-rounded source).`],
  });
  return fields;
}

/** The HKO terms bracketing an instant (previous and next), if the fixture
 *  covers them. Terms sit ~15.2 days apart, so anything farther than 25 days
 *  means the instant is outside fixture coverage — not silently "bracketed"
 *  by the edge of the table. */
export function hkoTermsAround(utcMillis: number): HkoTerm[] {
  const MAX_GAP_MS = 25 * 86400000;
  const sorted = [...HKO_TERMS].sort((a, b) => Date.parse(a.utcIso) - Date.parse(b.utcIso));
  const prev = [...sorted].reverse().find((t) => Date.parse(t.utcIso) <= utcMillis);
  const next = sorted.find((t) => Date.parse(t.utcIso) > utcMillis);
  return [prev, next].filter(
    (t): t is HkoTerm => t !== undefined && Math.abs(Date.parse(t.utcIso) - utcMillis) <= MAX_GAP_MS,
  );
}

/** Verify the solar-term boundaries around a candidate instant against HKO. */
export function verifyTermsAround(utcMillis: number): FieldAgreement[] {
  const terms = hkoTermsAround(utcMillis);
  if (terms.length === 0) {
    return [
      {
        field: "solarTermInstant",
        status: "unsupported",
        source: "hko",
        blocking: false,
        notes: [
          `No HKO fixture covers this date (fixtures span ${HKO_FIXTURE_YEARS[0]}–${HKO_FIXTURE_YEARS[HKO_FIXTURE_YEARS.length - 1]}).`,
        ],
      },
    ];
  }
  return terms.flatMap(verifyHkoTerm);
}

export interface JplCrossing {
  term: string;
  longitudeDeg: number;
  utcIso: string;
  samples?: { utcIso: string; eclLonDeg: number }[];
}

export const JPL_CROSSINGS: JplCrossing[] = jplFixture.crossings;

/** Compare the engine against the JPL Horizons fixture (instants + raw samples). */
export function verifyAgainstJplFixture(): FieldAgreement[] {
  const fields: FieldAgreement[] = [];
  for (const crossing of JPL_CROSSINGS) {
    const published = Date.parse(crossing.utcIso);
    const internal = findSolarLongitudeCrossing(crossing.longitudeDeg, published);
    const deltaSeconds = Math.round(Math.abs(internal - published) / 1000);
    fields.push({
      field: "solarTermInstant",
      status: instantStatus(deltaSeconds),
      source: "jpl-horizons",
      expected: crossing.utcIso,
      actual: new Date(internal).toISOString(),
      delta: deltaSeconds,
      threshold: `pass<=${SOLAR_TERM_PASS_SECONDS}s warn<=${SOLAR_TERM_WARN_SECONDS}s`,
      blocking: true,
      notes: [`${crossing.term} (λ=${crossing.longitudeDeg}°), Horizons-interpolated crossing.`],
    });
    for (const sample of crossing.samples ?? []) {
      const lon = solarLongitudeAtMillis(Date.parse(sample.utcIso));
      const lonDelta = angularDelta(lon, sample.eclLonDeg);
      fields.push({
        field: "solarLongitude",
        status:
          lonDelta <= SOLAR_LONGITUDE_PASS_DEG ? "pass" : lonDelta <= SOLAR_LONGITUDE_WARN_DEG ? "warn" : "fail",
        source: "jpl-horizons",
        expected: sample.eclLonDeg,
        actual: Math.round(lon * 10000000) / 10000000,
        delta: Math.round(lonDelta * 10000000) / 10000000,
        threshold: `pass<=${SOLAR_LONGITUDE_PASS_DEG}° warn<=${SOLAR_LONGITUDE_WARN_DEG}°`,
        blocking: false,
        notes: [`${crossing.term} raw Horizons sample at ${sample.utcIso}.`],
      });
    }
  }
  return fields;
}
