/**
 * "Don't ask me again" for journal-derived priority suggestions.
 *
 * Deliberately a SEPARATE store from the priority profile: a dismissal is not a
 * priority, and it must never end up in the exported/synced profile as though the
 * user had said something about that life area. Dismissing is the user declining
 * to answer — the app's job is then to stop asking, and nothing else.
 *
 * Pure-ish: only the two localStorage wrappers touch the outside world, and the
 * engine never reads any of this.
 */

import type { LifeAreaKey } from "../../engine/index.ts";

export const DISMISSED_STORE_KEY = "wei_priority_dismissed_v1";

function storage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

/** Ids of suggestions the user has dismissed. Unknown shapes read as empty. */
export function loadDismissed(): string[] {
  const ls = storage();
  if (!ls) return [];
  try {
    const raw = ls.getItem(DISMISSED_STORE_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw) as unknown;
    return Array.isArray(list) ? list.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/** Record a dismissal (idempotent). Returns the updated list. */
export function dismissSignal(id: string): string[] {
  const next = [...new Set([...loadDismissed(), id])];
  const ls = storage();
  try {
    ls?.setItem(DISMISSED_STORE_KEY, JSON.stringify(next));
  } catch {
    /* private mode / quota — it just re-asks next session */
  }
  return next;
}

/** Clear every dismissal — used by "show suggestions again". */
export function clearDismissed(): string[] {
  const ls = storage();
  try {
    ls?.removeItem(DISMISSED_STORE_KEY);
  } catch {
    /* ignore */
  }
  return [];
}

/** The stable id for an area suggestion, shared by the card and the store. */
export function areaSignalId(area: LifeAreaKey): string {
  return `journal:area:${area}`;
}
