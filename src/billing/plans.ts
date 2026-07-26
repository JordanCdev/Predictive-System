/**
 * The plan catalogue — one plan, everything included.
 *
 * There are no tiers. Every capability the app has is available to every user;
 * what remains here are the *structural and abuse bounds* that keep the app
 * honest and the hosted AI proxy's spend finite. None of them is a product:
 * nothing in this file may ever be used to sell an upgrade, because there is
 * nothing to upgrade to.
 *
 * Design rules, in keeping with the rest of the app:
 *  - **Pure and deterministic.** No I/O, no Firebase import, no `Date.now()` in
 *    the decision functions — callers pass the instant. Fully unit-testable.
 *  - **The engine is never gated.** The limits below bound storage growth and
 *    metered AI spend — never the correctness, transparency or honesty of a
 *    reading.
 */

/** Capabilities the UI historically asked about. All of them are always on;
 *  the union survives only so `can(feature)` call sites keep compiling. */
export type Feature =
  | "horizon_5y" //         date-finder / forecast windows out to the engine's boundary
  | "year_forecast" //      the 流年 macro-year card + 12-month strip
  | "luck_pillars" //       the 大運 decade scrubber & per-decade readings
  | "multi_profile" //      more than one stored person
  | "group_dates" //        dates that suit everyone across stored profiles
  | "journal_unlimited" //  decision journal up to the abuse bound
  | "export" //             .ics calendar export + shareable HTML report
  | "reasoning_dossier"; // the full audit trail: sweeps, verification, sources

export const ALL_FEATURES: readonly Feature[] = [
  "horizon_5y",
  "year_forecast",
  "luck_pillars",
  "multi_profile",
  "group_dates",
  "journal_unlimited",
  "export",
  "reasoning_dossier",
];

export interface PlanLimits {
  /** Longest window the date finder / forecasts may span, in days. This is the
   *  engine's search boundary (≈5 years, `MAX_WINDOW_DAYS` territory) — a
   *  performance bound, not a paywall. */
  horizonDays: number;
  /** Stored birth profiles (self + others). A generous structural bound so the
   *  profile picker and group scoring stay usable, not a product limit. */
  profiles: number;
  /** Decision-journal entries retained. A high abuse bound protecting
   *  localStorage and sync payloads, not a product limit. */
  journalEntries: number;
  /** AI advisor messages per UTC day on the hosted proxy — the one genuinely
   *  metered resource (Anthropic bills per message). Purely an abuse ceiling;
   *  BYOK chat is untouched by it. `Infinity` is never used. */
  aiMessagesPerDay: number;
}

export interface Plan {
  id: "free";
  name: string;
  features: readonly Feature[];
  limits: PlanLimits;
}

/** The only plan. Everyone is on it; every feature is in it. */
export const PLAN: Plan = {
  id: "free",
  name: "Free",
  features: ALL_FEATURES,
  limits: {
    horizonDays: 1827, // the engine's 5-year search boundary (+ leap-day slack)
    profiles: 12,
    journalEntries: 5000,
    aiMessagesPerDay: 200,
  },
};

// ── entitlement ──────────────────────────────────────────────────────────────

/** What a user is entitled to. With one plan this is a constant, but the shape
 *  survives so the context API and the Cloud Functions keep compiling. */
export interface Entitlement {
  plan: Plan;
  planId: Plan["id"];
}

export const ENTITLEMENT: Entitlement = { plan: PLAN, planId: "free" };

/** Does this entitlement include a capability? Always yes — kept so call sites
 *  read the same and the completeness test below has something to assert. */
export function hasFeature(_ent: Entitlement, feature: Feature): boolean {
  return PLAN.features.includes(feature);
}

/** Clamp a requested window to the engine's search boundary. Returns the
 *  allowed length and whether it was cut, so the UI can explain the cut rather
 *  than silently truncate. Length-only — nothing about the user changes it. */
export function clampHorizon(ent: Entitlement, requestedDays: number): { days: number; capped: boolean } {
  const max = ent.plan.limits.horizonDays;
  const days = Math.max(1, Math.min(Math.floor(requestedDays), max));
  return { days, capped: Math.floor(requestedDays) > max };
}

// ── AI metering (the abuse bound the hosted proxy enforces) ──────────────────

/** UTC day key (`YYYY-MM-DD`) used to bucket AI usage. Passed an explicit epoch
 *  so both the browser and the Cloud Function derive the same key for the same
 *  instant regardless of server locale. */
export function usageDayKey(nowMs: number): string {
  return new Date(nowMs).toISOString().slice(0, 10);
}

export interface UsageRecord {
  day: string;
  /** User-facing messages: a genuine new question. */
  count: number;
  /** EVERY upstream call, including tool-loop continuations. The security bound. */
  requests?: number;
}

/**
 * How many upstream calls one message may legitimately fan out into. The browser
 * runs the tool loop and sends each round back, so one question can be several
 * requests (`MAX_TOOL_ROUNDS` in the chat client).
 */
export const ROUNDS_PER_MESSAGE = 8;

/** The hard per-day ceiling on upstream calls. */
export function requestLimit(ent: Entitlement): number {
  return ent.plan.limits.aiMessagesPerDay * ROUNDS_PER_MESSAGE;
}

/**
 * Has the caller exhausted the hard request ceiling?
 *
 * This is the boundary that actually bounds spend. Whether a request is a
 * "continuation" is read off the message shape the client sent, and a client can
 * append a fabricated `tool_result` to dodge the message counter — so the
 * message limit alone is not enforceable. This one counts every call and cannot
 * be talked out of it.
 */
export function requestCeilingReached(ent: Entitlement, usage: UsageRecord | null | undefined, nowMs: number): boolean {
  const today = usageDayKey(nowMs);
  const used = usage && usage.day === today ? Math.max(0, usage.requests ?? 0) : 0;
  return used >= requestLimit(ent);
}

export interface QuotaVerdict {
  allowed: boolean;
  used: number;
  limit: number;
  remaining: number;
  /** User-facing explanation when blocked. Never mentions plans — there are none. */
  message?: string;
}

/**
 * Decide whether one more AI message is allowed. A usage record from a previous
 * day counts as zero — the bucket rolls over without needing a reset job.
 */
export function checkQuota(ent: Entitlement, usage: UsageRecord | null | undefined, nowMs: number): QuotaVerdict {
  const limit = ent.plan.limits.aiMessagesPerDay;
  const today = usageDayKey(nowMs);
  const used = usage && usage.day === today ? Math.max(0, usage.count) : 0;
  const remaining = Math.max(0, limit - used);
  if (remaining > 0) return { allowed: true, used, limit, remaining };
  return {
    allowed: false,
    used,
    limit,
    remaining: 0,
    message: `You've reached today's allowance of ${limit} advisor messages. It resets at midnight UTC.`,
  };
}
