/** Detect an unambiguous absolute calendar date typed into the global search bar,
 *  so "2027-10-14" or "14 Oct 2027" jumps straight to that day's reading instead
 *  of the decision matcher. Deterministic, no guessing: purely numeric forms like
 *  "3/4/2027" are deliberately NOT parsed — they read differently across locales,
 *  and a wrong guess would send someone to the wrong day. Returns YYYY-MM-DD or
 *  null. */
import { isValidIso } from "./shared.ts";

const MONTH_BY_NAME: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
  jan: 1, feb: 2, mar: 3, apr: 4, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};

const pad2 = (n: number) => String(n).padStart(2, "0");

function isoIfReal(year: number, month: number, day: number): string | null {
  const iso = `${year}-${pad2(month)}-${pad2(day)}`;
  return isValidIso(iso) ? iso : null;
}

export function parseAbsoluteDateQuery(query: string): string | null {
  const s = query.trim().toLowerCase().replace(/,/g, " ").replace(/\s+/g, " ");

  // ISO-style: 2027-10-14 (also 2027/10/14 — year-first is unambiguous).
  let m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (m) return isoIfReal(Number(m[1]), Number(m[2]), Number(m[3]));

  // "14 Oct 2027" / "14th October 2027"
  m = s.match(/^(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]+)\.?\s+(\d{4})$/);
  if (m) {
    const month = MONTH_BY_NAME[m[2]];
    return month ? isoIfReal(Number(m[3]), month, Number(m[1])) : null;
  }

  // "Oct 14 2027" / "October 14th, 2027"
  m = s.match(/^([a-z]+)\.?\s+(\d{1,2})(?:st|nd|rd|th)?\s+(\d{4})$/);
  if (m) {
    const month = MONTH_BY_NAME[m[1]];
    return month ? isoIfReal(Number(m[3]), month, Number(m[2])) : null;
  }

  return null;
}
