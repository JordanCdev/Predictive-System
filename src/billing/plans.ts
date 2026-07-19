/**
 * Plan catalogue & entitlements — the single source of truth for what each tier
 * unlocks, shared verbatim by the browser (feature gates, pricing page) and the
 * Cloud Functions (quota enforcement, webhook → entitlement mapping).
 *
 * Design rules, in keeping with the rest of the app:
 *  - **Pure and deterministic.** No I/O, no Firebase import, no `Date.now()` in the
 *    decision functions — callers pass the day key. Fully unit-testable.
 *  - **Free-tier fallback is never an error path.** With Stripe/Firebase absent
 *    (`npm run dev`, the static Pages build, an offline user) every resolver
 *    degrades to a valid Free entitlement rather than throwing or locking up.
 *  - **The engine is never gated.** Paid tiers gate *horizon, breadth, storage and
 *    AI spend* — never the correctness, transparency or honesty of a reading. A
 *    free user still sees the same deterministic score, the same conflicts and the
 *    same disclaimers as a paying one.
 */

export type PlanId = "free" | "pro";

/** Every gateable capability. Adding one here forces a decision for both tiers. */
export type Feature =
  | "horizon_5y" //         date-finder / forecast windows beyond the free horizon
  | "year_forecast" //      the 流年 macro-year card + 12-month strip
  | "luck_pillars" //       the 大運 decade scrubber & per-decade readings
  | "multi_profile" //      more than one stored person
  | "group_dates" //        dates that suit everyone across stored profiles
  | "journal_unlimited" //  decision journal beyond the free entry cap
  | "export" //             .ics calendar export + shareable HTML report
  | "reasoning_dossier"; // the full audit trail: sweeps, verification, sources

export interface PlanLimits {
  /** Longest window the date finder / forecasts may span, in days. */
  horizonDays: number;
  /** Stored birth profiles (self + others). */
  profiles: number;
  /** Decision-journal entries retained. */
  journalEntries: number;
  /** AI advisor messages per UTC day. `Infinity` is never used — abuse ceiling. */
  aiMessagesPerDay: number;
}

export interface Plan {
  id: PlanId;
  name: string;
  /** Marketing one-liner, shown on the pricing page and upgrade prompts. */
  tagline: string;
  /** Price in minor units (pence/cents), per interval. 0 for Free. */
  priceMonthly: number;
  priceYearly: number;
  currency: "gbp";
  features: readonly Feature[];
  limits: PlanLimits;
}

export const FREE_PLAN: Plan = {
  id: "free",
  name: "Free",
  tagline: "The full engine, for the decisions in front of you.",
  priceMonthly: 0,
  priceYearly: 0,
  currency: "gbp",
  features: [],
  limits: {
    horizonDays: 60,
    profiles: 1,
    journalEntries: 10,
    aiMessagesPerDay: 5,
  },
};

export const PRO_PLAN: Plan = {
  id: "pro",
  name: "Pro",
  tagline: "Plan years ahead, for everyone in the room.",
  priceMonthly: 700,
  priceYearly: 5400,
  currency: "gbp",
  features: [
    "horizon_5y",
    "year_forecast",
    "luck_pillars",
    "multi_profile",
    "group_dates",
    "journal_unlimited",
    "export",
    "reasoning_dossier",
  ],
  limits: {
    horizonDays: 1827, // 5 years + a leap day of slack
    profiles: 6,
    journalEntries: 2000,
    aiMessagesPerDay: 200, // an abuse ceiling, not a product limit
  },
};

export const PLANS: Record<PlanId, Plan> = { free: FREE_PLAN, pro: PRO_PLAN };

export const ALL_PLANS: readonly Plan[] = [FREE_PLAN, PRO_PLAN];

/** Human copy for each gate — used by the paywall prompts so the reason a user
 *  hit a wall is always specific ("5-year horizon") rather than a generic upsell. */
export const FEATURE_COPY: Record<Feature, { title: string; blurb: string }> = {
  horizon_5y: {
    title: "Five-year date search",
    blurb: "Search for the right day up to five years out, not just the next two months.",
  },
  year_forecast: {
    title: "Any year, past or future",
    blurb:
      "Read the 流年 for any year you like. The current year — theme, life areas, Tai Sui standing and the month-by-month strip — is free.",
  },
  luck_pillars: {
    title: "Ten-year luck pillars",
    blurb: "The 大運 decades of your life mapped end to end, each with its own reading.",
  },
  multi_profile: {
    title: "Multiple profiles",
    blurb: "Store charts for family, partners or co-founders and switch between them.",
  },
  group_dates: {
    title: "Dates that suit everyone",
    blurb: "Score a window against several charts at once — for weddings, signings and launches.",
  },
  journal_unlimited: {
    title: "Unlimited decision journal",
    blurb: "Keep every decision and outcome you log, so the feedback loop keeps its history.",
  },
  export: {
    title: "Export & share",
    blurb: "Add chosen days to your calendar and share a full written report.",
  },
  reasoning_dossier: {
    title: "Full reasoning dossier",
    blurb: "Every rule that fired, the sensitivity sweeps and the third-party verification trail.",
  },
};

// ── entitlement resolution ───────────────────────────────────────────────────

/** Subscription statuses Stripe can report that still grant access. `past_due`
 *  is deliberately included: a failed renewal shouldn't lock someone out of a
 *  reading mid-decision while Stripe retries the card. */
const ACTIVE_STATUSES = new Set(["active", "trialing", "past_due"]);

export type SubscriptionStatus =
  | "active"
  | "trialing"
  | "past_due"
  | "canceled"
  | "incomplete"
  | "incomplete_expired"
  | "unpaid"
  | "paused";

/** The billing document written by the Stripe webhook at
 *  `users/{uid}/billing/subscription`. Client-readable, server-writable only. */
export interface BillingRecord {
  plan: PlanId;
  status: SubscriptionStatus;
  /** Epoch ms when the paid period ends; access holds until then after a cancel. */
  currentPeriodEnd?: number;
  cancelAtPeriodEnd?: boolean;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  priceId?: string;
  interval?: "month" | "year";
}

export interface Entitlement {
  plan: Plan;
  planId: PlanId;
  status: SubscriptionStatus | "none";
  /** True when a paid plan is in force right now. */
  active: boolean;
  /** Set when the subscription is ending — drives the "renews/ends on" line. */
  currentPeriodEnd?: number;
  cancelAtPeriodEnd: boolean;
}

export const FREE_ENTITLEMENT: Entitlement = {
  plan: FREE_PLAN,
  planId: "free",
  status: "none",
  active: false,
  cancelAtPeriodEnd: false,
};

/**
 * Turn a (possibly missing, stale or malformed) billing record into an
 * entitlement. `nowMs` is passed in so this stays pure and testable.
 *
 * A record only grants Pro when its status is live **and** the paid period has
 * not lapsed — so a webhook we never received (user churned while offline)
 * can't leave someone entitled forever.
 */
export function resolveEntitlement(record: BillingRecord | null | undefined, nowMs: number): Entitlement {
  if (!record || record.plan !== "pro") return FREE_ENTITLEMENT;
  if (!ACTIVE_STATUSES.has(record.status)) return FREE_ENTITLEMENT;
  // A period end in the past means the record is stale; fall back to Free. No end
  // date (e.g. a manually granted comp account) is treated as open-ended.
  if (typeof record.currentPeriodEnd === "number" && record.currentPeriodEnd < nowMs) return FREE_ENTITLEMENT;
  return {
    plan: PRO_PLAN,
    planId: "pro",
    status: record.status,
    active: true,
    currentPeriodEnd: record.currentPeriodEnd,
    cancelAtPeriodEnd: Boolean(record.cancelAtPeriodEnd),
  };
}

/** Does this entitlement include a capability? */
export function hasFeature(ent: Entitlement, feature: Feature): boolean {
  return ent.plan.features.includes(feature);
}

/** Clamp a requested window to the plan's horizon. Returns the allowed length and
 *  whether it was cut, so the UI can explain the cut rather than silently truncate. */
export function clampHorizon(ent: Entitlement, requestedDays: number): { days: number; capped: boolean } {
  const max = ent.plan.limits.horizonDays;
  const days = Math.max(1, Math.min(Math.floor(requestedDays), max));
  return { days, capped: Math.floor(requestedDays) > max };
}

// ── AI metering ──────────────────────────────────────────────────────────────

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

/** The hard per-day ceiling on upstream calls for a plan. */
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
  /** User-facing explanation when blocked. */
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
    message: ent.active
      ? `You've reached today's limit of ${limit} advisor messages. It resets at midnight UTC.`
      : `You've used your ${limit} free advisor messages for today. Upgrade to Pro for ${PRO_PLAN.limits.aiMessagesPerDay} a day, or come back tomorrow.`,
  };
}

// ── pricing presentation ─────────────────────────────────────────────────────

export function formatPrice(minorUnits: number, currency: Plan["currency"] = "gbp"): string {
  if (minorUnits === 0) return "Free";
  const symbol = currency === "gbp" ? "£" : "$";
  const major = minorUnits / 100;
  return `${symbol}${major % 1 === 0 ? major.toFixed(0) : major.toFixed(2)}`;
}

/** Whole-percent saving of the yearly price against twelve monthly payments. */
export function yearlySavingPercent(plan: Plan): number {
  if (!plan.priceMonthly || !plan.priceYearly) return 0;
  return Math.round((1 - plan.priceYearly / (plan.priceMonthly * 12)) * 100);
}
