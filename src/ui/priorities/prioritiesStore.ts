/**
 * The priority profile — "what this person cares about right now".
 *
 * The app has always known a user's *chart*. It has never known what they
 * actually want. This is that layer, and it is deliberately thin: a ranked
 * handful of life areas, one or two intentions, a little optional context, and
 * field-level consent for what the AI advisor may see.
 *
 * THE RULE THAT GOVERNS THIS WHOLE MODULE:
 *   **Priorities never change a day's classical score.** `recommendationScore`
 *   stays a strict function of chart + date + objective + doctrine. Nothing here
 *   is read by `src/engine/**` — it only decides what gets SURFACED, in what
 *   ORDER, and what a separately-labelled "priority fit" axis is computed from.
 *   If a future change makes the engine import this file, that change is wrong.
 *
 * Two more standing constraints:
 *  - **Nothing is ever inferred silently.** `acceptedSignals` only grows when the
 *    user explicitly accepts a suggestion; there is no code path that writes one
 *    on the user's behalf.
 *  - **Pure and clock-free.** Every decision function takes `nowMs`, in the style
 *    of `src/billing/plans.ts`, so freshness and stamping are unit-testable. Only
 *    the two localStorage wrappers touch the outside world.
 */

import { AREA_META } from "../../engine/index.ts";
import type { LifeAreaKey } from "../../engine/index.ts";

export const PRIORITIES_STORE_KEY = "wei_priorities_v1";

/** At most five ranked areas (the report's cap). The engine only defines four,
 *  so in practice the ceiling is the catalogue below — the cap is the contract. */
export const MAX_RANKED_AREAS = 5;
/** Two short lines. More than that stops being an intention and starts being a diary. */
export const MAX_INTENTIONS = 2;
export const MAX_INTENTION_CHARS = 140;
export const MAX_CONTEXT_CHARS = 120;
/** Accepted journal-derived signals kept. Small on purpose — this is a summary. */
export const MAX_ACCEPTED_SIGNALS = 12;
/** Priorities go stale. Twelve months, then we ask — we never auto-change. */
export const STALE_AFTER_DAYS = 365;

const DAY_MS = 86_400_000;

/** The four areas, named exactly as the daily gauges name them — label and hanzi
 *  come from the engine's own AREA_META so the priority list and the gauges can
 *  never drift apart. Only the blurb (which explains the choice at pick time) is
 *  authored here. */
export const PRIORITY_AREAS: readonly { key: LifeAreaKey; label: string; hanzi: string; blurb: string }[] = [
  { key: "career", ...AREA_META.career, blurb: "Work, position, responsibility, study." },
  { key: "wealth", ...AREA_META.wealth, blurb: "Income, deals, money decisions." },
  { key: "relationship", ...AREA_META.relationship, blurb: "Partner, family, the people close to you." },
  { key: "health", ...AREA_META.health, blurb: "Energy, rest, health matters." },
];

const AREA_KEYS: readonly LifeAreaKey[] = PRIORITY_AREAS.map((a) => a.key);

export function areaLabel(key: LifeAreaKey): string {
  return PRIORITY_AREAS.find((a) => a.key === key)?.label ?? key;
}

/** Optional, and every field independently clearable. Nothing here is required
 *  to use the app, and an absent field is never treated as an answer. */
export interface PriorityContext {
  /** Free text — "early career", "raising young kids", "winding down". */
  lifeStage?: string;
  occupation?: string;
  /** "What's coming up" — a move, a launch, a hearing, a wedding. */
  comingUp?: string;
}

/**
 * FIELD-LEVEL consent for the AI advisor. Separate flags because these fields
 * carry different sensitivity: an area ranking is innocuous, a "what's coming
 * up" note can drift into health, family or legal territory. Context is OFF by
 * default and only the user can turn it on.
 *
 * `journal` is the fourth flag and is likewise OFF by default. It covers the
 * AGGREGATE counts derived from the decision journal (how many decisions were
 * saved per life area) — behaviour, not something the user chose to say, which
 * is why it can never ride on the `areas` flag. Journal note text is not covered
 * by any flag: it never leaves the device at all.
 */
export interface PriorityAiConsent {
  areas: boolean;
  intentions: boolean;
  context: boolean;
  journal: boolean;
}

/** A priority the user ACCEPTED from a journal-derived suggestion. Written only
 *  by an explicit accept action — never by inference. */
export interface AcceptedSignal {
  /** Stable id of the suggestion, so accepting twice doesn't duplicate. */
  id: string;
  /** Exactly the wording the user saw when they accepted it. */
  label: string;
  /** Where the suggestion came from. Shown to the user, never hidden. */
  source: string;
  /** Epoch ms, passed in by the caller. */
  acceptedAt: number;
}

export interface PriorityProfile {
  /** Ranked, most important first. Empty means "not set" — never "nothing matters". */
  areas: LifeAreaKey[];
  /** Nought to two short free-text lines. */
  intentions: string[];
  context: PriorityContext;
  acceptedSignals: AcceptedSignal[];
  aiConsent: PriorityAiConsent;
  /** Epoch ms of the last user save, or null if never set. UI clock, not engine. */
  updatedAt: number | null;
}

/** Areas + intentions on; context and the derived journal aggregate OFF — the
 *  report's required default. Anything DERIVED from behaviour starts off. */
export const DEFAULT_AI_CONSENT: PriorityAiConsent = {
  areas: true,
  intentions: true,
  context: false,
  journal: false,
};

export const EMPTY_PRIORITIES: PriorityProfile = {
  areas: [],
  intentions: [],
  context: {},
  acceptedSignals: [],
  aiConsent: { ...DEFAULT_AI_CONSENT },
  updatedAt: null,
};

const emptyProfile = (): PriorityProfile => ({
  areas: [],
  intentions: [],
  context: {},
  acceptedSignals: [],
  aiConsent: { ...DEFAULT_AI_CONSENT },
  updatedAt: null,
});

// ── normalisation ────────────────────────────────────────────────────────────

function text(v: unknown, max: number): string | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.trim().slice(0, max);
  return t.length > 0 ? t : undefined;
}

function bool(v: unknown, fallback: boolean): boolean {
  return typeof v === "boolean" ? v : fallback;
}

function isAreaKey(v: unknown): v is LifeAreaKey {
  return typeof v === "string" && (AREA_KEYS as readonly string[]).includes(v);
}

function normaliseSignal(v: unknown): AcceptedSignal | null {
  const s = v as Partial<AcceptedSignal> | null;
  if (!s || typeof s.id !== "string" || s.id.length === 0) return null;
  const label = text(s.label, MAX_INTENTION_CHARS);
  if (!label) return null;
  return {
    id: s.id,
    label,
    source: text(s.source, 40) ?? "journal",
    acceptedAt: typeof s.acceptedAt === "number" && Number.isFinite(s.acceptedAt) ? s.acceptedAt : 0,
  };
}

/**
 * Build a valid profile from whatever was persisted — a well-formed record, a
 * partial one from an older build, or nonsense. Anything unrecognised is dropped
 * rather than thrown on: a corrupt entry must never take the profile page down,
 * and an absent one is simply an empty profile (which is a legitimate state).
 */
export function parsePriorities(raw: unknown): PriorityProfile {
  const r = raw as Partial<PriorityProfile> | null;
  if (!r || typeof r !== "object" || Array.isArray(r)) return emptyProfile();

  const areas: LifeAreaKey[] = [];
  if (Array.isArray(r.areas)) {
    for (const a of r.areas) {
      if (isAreaKey(a) && !areas.includes(a) && areas.length < MAX_RANKED_AREAS) areas.push(a);
    }
  }

  const intentions: string[] = [];
  if (Array.isArray(r.intentions)) {
    for (const i of r.intentions) {
      const t = text(i, MAX_INTENTION_CHARS);
      if (t && intentions.length < MAX_INTENTIONS) intentions.push(t);
    }
  }

  const rc = (r.context ?? {}) as Partial<PriorityContext>;
  const context: PriorityContext = {};
  const lifeStage = text(rc.lifeStage, MAX_CONTEXT_CHARS);
  const occupation = text(rc.occupation, MAX_CONTEXT_CHARS);
  const comingUp = text(rc.comingUp, MAX_CONTEXT_CHARS);
  if (lifeStage) context.lifeStage = lifeStage;
  if (occupation) context.occupation = occupation;
  if (comingUp) context.comingUp = comingUp;

  const acceptedSignals: AcceptedSignal[] = [];
  if (Array.isArray(r.acceptedSignals)) {
    for (const s of r.acceptedSignals) {
      const sig = normaliseSignal(s);
      if (sig && !acceptedSignals.some((x) => x.id === sig.id) && acceptedSignals.length < MAX_ACCEPTED_SIGNALS) {
        acceptedSignals.push(sig);
      }
    }
  }

  const rcon = (r.aiConsent ?? {}) as Partial<PriorityAiConsent>;
  const aiConsent: PriorityAiConsent = {
    areas: bool(rcon.areas, DEFAULT_AI_CONSENT.areas),
    intentions: bool(rcon.intentions, DEFAULT_AI_CONSENT.intentions),
    // Never let a malformed or absent record silently *grant* a sensitive one:
    // only a literal `true` counts, so an older stored profile (which has no
    // `journal` key at all) reads as "not consented".
    context: rcon.context === true,
    journal: rcon.journal === true,
  };

  const updatedAt =
    typeof r.updatedAt === "number" && Number.isFinite(r.updatedAt) && r.updatedAt > 0 ? r.updatedAt : null;

  return { areas, intentions, context, acceptedSignals, aiConsent, updatedAt };
}

// ── persistence (the only impure part) ───────────────────────────────────────

function storage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null; // blocked by a privacy setting — behave as "nothing stored"
  }
}

/**
 * Tell the rest of this tab that the profile changed.
 *
 * Readers elsewhere (the priority-fit chip, the advisor context) already listen
 * for `storage`, which the browser only fires in OTHER tabs. Re-emitting it here
 * means an edit on the profile page is picked up immediately by anything mounted
 * in this one, without those modules needing a bespoke subscription. Purely a UI
 * notification — no engine code observes it.
 *
 * Exported because a writer OUTSIDE this module (the backup/restore path, which
 * replaces the whole localStorage record wholesale) must be able to tell mounted
 * panels to re-hydrate; without that ping the profile page would keep editing a
 * pre-restore snapshot.
 */
export function notifyPrioritiesChanged(): void {
  try {
    if (typeof window === "undefined" || typeof StorageEvent !== "function") return;
    window.dispatchEvent(new StorageEvent("storage", { key: PRIORITIES_STORE_KEY }));
  } catch {
    /* environments without a constructible StorageEvent simply don't get the ping */
  }
}

/** Read the stored profile. Absent, unreadable or corrupt all yield an empty
 *  profile, which is a fully supported state everywhere in the app. */
export function loadPriorities(): PriorityProfile {
  const ls = storage();
  if (!ls) return emptyProfile();
  try {
    const raw = ls.getItem(PRIORITIES_STORE_KEY);
    if (!raw) return emptyProfile();
    return parsePriorities(JSON.parse(raw));
  } catch {
    return emptyProfile();
  }
}

/**
 * Normalise, stamp and persist. `nowMs` is the caller's wall clock (a UI read,
 * never an engine one) so the stamp stays testable.
 *
 * A profile the user has emptied out keeps no stamp — an empty profile with a
 * date would trip the freshness nudge over nothing. It is still written when the
 * consent flags have been changed from their defaults, because a deliberate
 * consent choice must survive a reload even with no priorities entered yet.
 */
export function savePriorities(profile: PriorityProfile, nowMs: number): PriorityProfile {
  const clean = parsePriorities(profile);
  const empty = isEmptyProfile(clean);
  const next: PriorityProfile = { ...clean, updatedAt: empty ? null : nowMs };
  const ls = storage();
  try {
    if (ls) {
      if (empty && isDefaultConsent(next)) ls.removeItem(PRIORITIES_STORE_KEY);
      else ls.setItem(PRIORITIES_STORE_KEY, JSON.stringify(next));
    }
  } catch {
    /* private mode / quota — the in-memory profile still works this session */
  }
  notifyPrioritiesChanged();
  return next;
}

/** Forget everything. Returns the empty profile so callers can set state from it. */
export function clearPriorities(): PriorityProfile {
  const ls = storage();
  try {
    ls?.removeItem(PRIORITIES_STORE_KEY);
  } catch {
    /* ignore */
  }
  notifyPrioritiesChanged();
  return emptyProfile();
}

// ── pure editing helpers ─────────────────────────────────────────────────────

/** Nothing set — no areas, no intentions, no context, no accepted signals.
 *  Consent flags alone don't count as content. */
export function isEmptyProfile(p: PriorityProfile): boolean {
  return (
    p.areas.length === 0 &&
    p.intentions.length === 0 &&
    p.acceptedSignals.length === 0 &&
    !p.context.lifeStage &&
    !p.context.occupation &&
    !p.context.comingUp
  );
}

/** Are the consent flags untouched? A deliberate change is worth persisting even
 *  when there are no priorities yet. */
export function isDefaultConsent(p: PriorityProfile): boolean {
  return (
    p.aiConsent.areas === DEFAULT_AI_CONSENT.areas &&
    p.aiConsent.intentions === DEFAULT_AI_CONSENT.intentions &&
    p.aiConsent.context === DEFAULT_AI_CONSENT.context &&
    p.aiConsent.journal === DEFAULT_AI_CONSENT.journal
  );
}

/** 1-based rank of an area, or null when it isn't ranked. */
export function rankOf(p: PriorityProfile, key: LifeAreaKey): number | null {
  const i = p.areas.indexOf(key);
  return i < 0 ? null : i + 1;
}

/** Areas the user hasn't ranked yet, in catalogue order. */
export function unrankedAreas(p: PriorityProfile): LifeAreaKey[] {
  return AREA_KEYS.filter((k) => !p.areas.includes(k));
}

/** Append an area to the bottom of the ranking. No-op if already ranked or full. */
export function addArea(p: PriorityProfile, key: LifeAreaKey): PriorityProfile {
  if (!isAreaKey(key) || p.areas.includes(key) || p.areas.length >= MAX_RANKED_AREAS) return p;
  return { ...p, areas: [...p.areas, key] };
}

export function removeArea(p: PriorityProfile, key: LifeAreaKey): PriorityProfile {
  if (!p.areas.includes(key)) return p;
  return { ...p, areas: p.areas.filter((k) => k !== key) };
}

/** Move a ranked area one place up (-1) or down (+1). Ends are no-ops, so the
 *  buttons can simply be disabled rather than wrapping around unexpectedly. */
export function moveArea(p: PriorityProfile, key: LifeAreaKey, delta: -1 | 1): PriorityProfile {
  const i = p.areas.indexOf(key);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= p.areas.length) return p;
  const areas = p.areas.slice();
  areas[i] = areas[j];
  areas[j] = key;
  return { ...p, areas };
}

/**
 * Set one of the two intention slots. Empty text clears the slot; clearing the
 * first slot promotes the second, so the stored list never has holes in it.
 */
export function setIntention(p: PriorityProfile, index: number, value: string): PriorityProfile {
  if (index < 0 || index >= MAX_INTENTIONS) return p;
  const slots: string[] = [];
  for (let i = 0; i < MAX_INTENTIONS; i++) slots.push(p.intentions[i] ?? "");
  slots[index] = value.slice(0, MAX_INTENTION_CHARS);
  const intentions = slots.map((s) => s.trim()).filter((s) => s.length > 0);
  return { ...p, intentions };
}

/** Patch context fields. `undefined` leaves a field alone; an empty string
 *  clears it — every field is individually clearable, by contract. */
export function setContext(p: PriorityProfile, patch: Partial<Record<keyof PriorityContext, string>>): PriorityProfile {
  const context: PriorityContext = { ...p.context };
  for (const k of ["lifeStage", "occupation", "comingUp"] as const) {
    if (!(k in patch)) continue;
    const t = text(patch[k], MAX_CONTEXT_CHARS);
    if (t) context[k] = t;
    else delete context[k];
  }
  return { ...p, context };
}

export function setAiConsent(p: PriorityProfile, field: keyof PriorityAiConsent, on: boolean): PriorityProfile {
  return { ...p, aiConsent: { ...p.aiConsent, [field]: on } };
}

/**
 * Record a suggested priority the user has EXPLICITLY accepted (Agent D's
 * journal-derived suggestions). Re-accepting the same id refreshes its wording
 * rather than duplicating it. There is deliberately no "auto-accept" variant.
 */
export function acceptSignal(
  p: PriorityProfile,
  signal: { id: string; label: string; source?: string },
  nowMs: number,
): PriorityProfile {
  const sig = normaliseSignal({ ...signal, source: signal.source ?? "journal", acceptedAt: nowMs });
  if (!sig) return p;
  const rest = p.acceptedSignals.filter((s) => s.id !== sig.id);
  return { ...p, acceptedSignals: [sig, ...rest].slice(0, MAX_ACCEPTED_SIGNALS) };
}

/** Un-accept — the user can always take something back out. */
export function removeAcceptedSignal(p: PriorityProfile, id: string): PriorityProfile {
  if (!p.acceptedSignals.some((s) => s.id === id)) return p;
  return { ...p, acceptedSignals: p.acceptedSignals.filter((s) => s.id !== id) };
}

/** Has this suggestion already been accepted? Lets a suggester hide what's in. */
export function hasAcceptedSignal(p: PriorityProfile, id: string): boolean {
  return p.acceptedSignals.some((s) => s.id === id);
}

/** Re-stamp without changing anything — "yes, this still holds". */
export function touchPriorities(p: PriorityProfile, nowMs: number): PriorityProfile {
  return isEmptyProfile(p) ? p : { ...p, updatedAt: nowMs };
}

// ── freshness ────────────────────────────────────────────────────────────────

export type FreshnessState = "unset" | "fresh" | "stale";

export interface PriorityFreshness {
  state: FreshnessState;
  /** Whole days since the last save, or null when never set. */
  ageDays: number | null;
  /** Rounded months, for the nudge's wording. */
  ageMonths: number | null;
  /** Show the gentle "does this still hold?" prompt. Never auto-expires anything. */
  needsReview: boolean;
}

/**
 * How old the profile is, given the caller's clock. Nothing here changes the
 * profile: a stale profile is still used in full — we just ask about it.
 */
export function freshness(p: PriorityProfile, nowMs: number): PriorityFreshness {
  if (p.updatedAt === null || isEmptyProfile(p)) {
    return { state: "unset", ageDays: null, ageMonths: null, needsReview: false };
  }
  const ageDays = Math.max(0, Math.floor((nowMs - p.updatedAt) / DAY_MS));
  const stale = ageDays >= STALE_AFTER_DAYS;
  return {
    state: stale ? "stale" : "fresh",
    ageDays,
    ageMonths: Math.round(ageDays / 30.44),
    needsReview: stale,
  };
}

// ── consent-filtered projection ──────────────────────────────────────────────

/** Exactly what the AI advisor is allowed to see. Fields the user hasn't
 *  consented to are absent, not blanked — there is nothing to leak. */
export interface SharedPriorities {
  areas?: LifeAreaKey[];
  intentions?: string[];
  context?: PriorityContext;
  /**
   * PERMISSION, not payload: present (and only ever `true`) when the user has
   * consented to sharing the journal-DERIVED aggregate. The counts themselves
   * live outside this profile, so the caller reads them elsewhere — but it may
   * only do so when this flag is here. Raw journal note text is never covered:
   * it is not shareable under any flag.
   */
  journal?: true;
}

/**
 * Project the profile through its consent flags. Every AI-facing caller must go
 * through this rather than reading the profile directly, so consent is enforced
 * in one place. Returns `null` when nothing is shareable.
 */
export function sharedForAi(p: PriorityProfile): SharedPriorities | null {
  const out: SharedPriorities = {};
  if (p.aiConsent.areas && p.areas.length > 0) out.areas = [...p.areas];
  if (p.aiConsent.intentions && p.intentions.length > 0) out.intentions = [...p.intentions];
  if (p.aiConsent.context && (p.context.lifeStage || p.context.occupation || p.context.comingUp)) {
    out.context = { ...p.context };
  }
  if (p.aiConsent.journal) out.journal = true;
  return Object.keys(out).length === 0 ? null : out;
}

/** Did the user actually STATE something that is being shared? The journal flag
 *  is a permission over derived behaviour, so it never counts as "they told us". */
export function hasStatedSharedContent(shared: SharedPriorities | null): boolean {
  return Boolean(shared && (shared.areas || shared.intentions || shared.context));
}
