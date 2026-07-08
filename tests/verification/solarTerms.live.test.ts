import { describe, expect, it } from "vitest";
import {
  fetchCrossingInstant,
  fetchSunEclipticLongitudes,
  jplLiveEnabled,
} from "../../src/engine/verification/jplHorizons.ts";
import { findSolarLongitudeCrossing } from "../../src/engine/astronomy.ts";

/**
 * LIVE verification against JPL Horizons — opt-in only:
 *
 *   VERIFY_LIVE_JPL=1 npm test -- tests/verification/solarTerms.live.test.ts
 *
 * Requests are serialized with a delay (JPL fair use); never run in CI's
 * default offline job. See .github/workflows/live-verification.yml.
 */

describe("JPL Horizons live gate", () => {
  it("refuses to touch the network unless VERIFY_LIVE_JPL=1", async () => {
    if (jplLiveEnabled()) return; // gate open — the live suite below covers it
    await expect(fetchSunEclipticLongitudes("2026-02-03T00:00:00Z", "2026-02-04T00:00:00Z", 60)).rejects.toThrow(
      /VERIFY_LIVE_JPL/,
    );
  });
});

describe.skipIf(!jplLiveEnabled())("JPL Horizons live verification", () => {
  it(
    "matches the live 立春 2026 crossing within 120 s",
    async () => {
      const liveIso = await fetchCrossingInstant(315, "2026-02-03T20:00:00Z");
      const internal = findSolarLongitudeCrossing(315, Date.parse(liveIso));
      const deltaSeconds = Math.abs(internal - Date.parse(liveIso)) / 1000;
      expect(deltaSeconds, `live=${liveIso} engine=${new Date(internal).toISOString()}`).toBeLessThanOrEqual(120);
    },
    180000,
  );

  it(
    "matches the live December solstice 2026 within 120 s",
    async () => {
      const liveIso = await fetchCrossingInstant(270, "2026-12-21T20:00:00Z");
      const internal = findSolarLongitudeCrossing(270, Date.parse(liveIso));
      const deltaSeconds = Math.abs(internal - Date.parse(liveIso)) / 1000;
      expect(deltaSeconds, `live=${liveIso} engine=${new Date(internal).toISOString()}`).toBeLessThanOrEqual(120);
    },
    180000,
  );
});
