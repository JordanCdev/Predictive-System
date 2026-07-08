/**
 * Almanac 宜忌 adapter (Phase 1 of the accuracy work).
 *
 * Builds the day-by-day 宜/忌 (通勝/almanac) lists for a window from
 * lunar-javascript, as plain data the deterministic engine can blend in. This
 * module (and only this module family) imports lunar-javascript, so it stays in
 * the lazy verification chunk — the core engine never depends on the library.
 *
 * 宜忌 are civil-date facts; per the pinned comparator semantics
 * (docs/VERIFICATION.md) they are read at local civil noon, which is
 * host-timezone independent under Solar.fromYmdHms.
 */

import { Solar } from "lunar-javascript";
import { AlmanacData } from "../decision.ts";

/** Normalise the odd variant characters lunar-javascript can emit so the
 *  engine's simplified-Chinese term matching is reliable. */
function norm(s: string): string {
  return s.replace(/諸事不宜/g, "诸事不宜").replace(/馀/g, "余");
}

export interface AlmanacWindow {
  start: { year: number; month: number; day: number };
  days: number;
}

/** 宜/忌 for every civil day in the window, keyed by ISO date. */
export function buildAlmanacData(window: AlmanacWindow): AlmanacData {
  const startUtc = Date.UTC(window.start.year, window.start.month - 1, window.start.day);
  const out: AlmanacData = {};
  for (let i = 0; i < window.days; i++) {
    const d = new Date(startUtc + i * 86400000);
    const year = d.getUTCFullYear();
    const month = d.getUTCMonth() + 1;
    const day = d.getUTCDate();
    const iso = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const lunar = Solar.fromYmdHms(year, month, day, 12, 0, 0).getLunar();
    out[iso] = {
      yi: lunar.getDayYi().map(norm),
      ji: lunar.getDayJi().map(norm),
    };
  }
  return out;
}
