/**
 * Live JPL Horizons client — OPT-IN ONLY (docs/VERIFICATION.md).
 *
 * Never runs in the browser and never runs by default: callers must set
 * VERIFY_LIVE_JPL=1 (see tests/verification/solarTerms.live.test.ts and
 * .github/workflows/live-verification.yml). Per JPL's API terms the client
 * serialises all requests through a single-flight queue with a configurable
 * inter-request delay, and validates the response signature version so a
 * format change fails safely instead of being misparsed.
 */

const HORIZONS_URL = "https://ssd.jpl.nasa.gov/api/horizons.api";
const EXPECTED_API_MAJOR = "1";

type Env = Record<string, string | undefined>;
function env(): Env {
  const p = (globalThis as { process?: { env?: Env } }).process;
  return p?.env ?? {};
}

export function jplLiveEnabled(): boolean {
  return env().VERIFY_LIVE_JPL === "1";
}

function requestDelayMs(): number {
  return Number(env().JPL_REQUEST_DELAY_MS ?? 1500);
}

function timeoutMs(): number {
  return Number(env().JPL_TIMEOUT_MS ?? 15000);
}

// Single-flight queue: JPL asks that clients submit one request at a time.
let queueTail: Promise<unknown> = Promise.resolve();
function enqueue<T>(job: () => Promise<T>): Promise<T> {
  const run = queueTail.then(async () => {
    await new Promise((resolve) => setTimeout(resolve, requestDelayMs()));
    return job();
  });
  queueTail = run.catch(() => undefined);
  return run;
}

export interface JplSample {
  utcIso: string;
  eclLonDeg: number;
}

const MONTHS: Record<string, number> = {
  Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6,
  Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12,
};

/** "2026-Feb-03 20:01" → UTC ISO. Horizons calendar output is UT. */
function parseHorizonsDate(text: string): string {
  const m = text.trim().match(/^(\d{4})-([A-Z][a-z]{2})-(\d{2}) (\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!m) throw new Error(`Unparseable Horizons date: "${text}"`);
  const [, y, mon, d, h, min, s] = m;
  const iso = new Date(
    Date.UTC(Number(y), MONTHS[mon] - 1, Number(d), Number(h), Number(min), Number(s ?? 0)),
  ).toISOString();
  return iso;
}

/**
 * Fetch apparent geocentric ecliptic-of-date longitudes of the Sun (QUANTITIES
 * 31, ObsEcLon) between two instants. One serialized request.
 */
export async function fetchSunEclipticLongitudes(
  startUtcIso: string,
  stopUtcIso: string,
  stepMinutes: number,
): Promise<JplSample[]> {
  if (!jplLiveEnabled()) {
    throw new Error("Live JPL verification is disabled — set VERIFY_LIVE_JPL=1 to opt in.");
  }
  return enqueue(async () => {
    const params = new URLSearchParams({
      format: "json",
      COMMAND: "'10'",
      OBJ_DATA: "'NO'",
      MAKE_EPHEM: "'YES'",
      EPHEM_TYPE: "'OBSERVER'",
      CENTER: "'500@399'",
      START_TIME: `'${startUtcIso.replace("T", " ").replace(/:\d\d(\.\d+)?Z$/, "")}'`,
      STOP_TIME: `'${stopUtcIso.replace("T", " ").replace(/:\d\d(\.\d+)?Z$/, "")}'`,
      STEP_SIZE: `'${stepMinutes} m'`,
      QUANTITIES: "'31'",
      ANG_FORMAT: "'DEG'",
      EXTRA_PREC: "'YES'",
      APPARENT: "'AIRLESS'",
      CSV_FORMAT: "'YES'",
    });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs());
    try {
      const res = await fetch(`${HORIZONS_URL}?${params.toString()}`, { signal: controller.signal });
      if (!res.ok) throw new Error(`JPL Horizons HTTP ${res.status}`);
      const body = (await res.json()) as { signature?: { version?: string }; result?: string };
      const version = body.signature?.version ?? "";
      if (!version.startsWith(`${EXPECTED_API_MAJOR}.`)) {
        throw new Error(
          `JPL Horizons API version "${version}" does not match expected major ${EXPECTED_API_MAJOR}.x — refusing to parse a possibly-changed format.`,
        );
      }
      const result = body.result ?? "";
      const soe = result.indexOf("$$SOE");
      const eoe = result.indexOf("$$EOE");
      if (soe === -1 || eoe === -1) throw new Error("JPL Horizons response missing $$SOE/$$EOE ephemeris block.");
      const samples: JplSample[] = [];
      for (const line of result.slice(soe + 5, eoe).split("\n")) {
        const cells = line.split(",").map((c) => c.trim());
        // CSV columns: date, [flags…,] ObsEcLon, ObsEcLat — longitude is the
        // first numeric cell after the date that parses as a finite number.
        if (cells.length < 3 || !cells[0]) continue;
        const lon = cells.slice(1).map(Number).find((n) => Number.isFinite(n));
        if (lon === undefined) continue;
        samples.push({ utcIso: parseHorizonsDate(cells[0]), eclLonDeg: lon });
      }
      if (samples.length === 0) throw new Error("JPL Horizons response parsed to zero samples.");
      return samples;
    } finally {
      clearTimeout(timer);
    }
  });
}

/** Live crossing instant for a target longitude: coarse hour-step bracket, then
 *  a 1-minute pass, linearly interpolated (Sun ≈0.0007°/min → error ≪ 1 s). */
export async function fetchCrossingInstant(longitudeDeg: number, aroundUtcIso: string): Promise<string> {
  const around = Date.parse(aroundUtcIso);
  const day = 86400000;
  const coarse = await fetchSunEclipticLongitudes(
    new Date(around - day).toISOString(),
    new Date(around + day).toISOString(),
    60,
  );
  const target = ((longitudeDeg % 360) + 360) % 360;
  const signedDelta = (lon: number) => ((lon - target + 540) % 360) - 180;
  let bracket: [JplSample, JplSample] | null = null;
  for (let i = 1; i < coarse.length; i++) {
    if (signedDelta(coarse[i - 1].eclLonDeg) <= 0 && signedDelta(coarse[i].eclLonDeg) > 0) {
      bracket = [coarse[i - 1], coarse[i]];
      break;
    }
  }
  if (!bracket) throw new Error(`No crossing of λ=${longitudeDeg}° within ±1 day of ${aroundUtcIso}.`);
  const fine = await fetchSunEclipticLongitudes(bracket[0].utcIso, bracket[1].utcIso, 1);
  for (let i = 1; i < fine.length; i++) {
    const a = signedDelta(fine[i - 1].eclLonDeg);
    const b = signedDelta(fine[i].eclLonDeg);
    if (a <= 0 && b > 0) {
      const t0 = Date.parse(fine[i - 1].utcIso);
      const t1 = Date.parse(fine[i].utcIso);
      return new Date(t0 + ((0 - a) / (b - a)) * (t1 - t0)).toISOString();
    }
  }
  throw new Error(`Crossing of λ=${longitudeDeg}° not found in the fine window.`);
}
