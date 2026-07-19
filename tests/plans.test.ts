import { describe, expect, it } from "vitest";
import {
  BillingRecord,
  FREE_PLAN,
  PRO_PLAN,
  ROUNDS_PER_MESSAGE,
  checkQuota,
  clampHorizon,
  formatPrice,
  hasFeature,
  requestCeilingReached,
  requestLimit,
  resolveEntitlement,
  usageDayKey,
  yearlySavingPercent,
} from "../src/billing/plans.ts";

const NOW = Date.UTC(2026, 6, 19, 12, 0, 0); // 2026-07-19T12:00Z
const DAY = 86_400_000;

const pro = (over: Partial<BillingRecord> = {}): BillingRecord => ({
  plan: "pro",
  status: "active",
  currentPeriodEnd: NOW + 30 * DAY,
  ...over,
});

describe("resolveEntitlement", () => {
  it("falls back to Free for a missing, malformed or free record", () => {
    for (const rec of [null, undefined, { plan: "free" } as BillingRecord]) {
      const ent = resolveEntitlement(rec, NOW);
      expect(ent.planId).toBe("free");
      expect(ent.active).toBe(false);
    }
  });

  it("grants Pro for a live subscription", () => {
    const ent = resolveEntitlement(pro(), NOW);
    expect(ent.planId).toBe("pro");
    expect(ent.active).toBe(true);
    expect(ent.plan.features.length).toBeGreaterThan(0);
  });

  it("keeps access while Stripe retries a failed payment, and during a trial", () => {
    expect(resolveEntitlement(pro({ status: "past_due" }), NOW).active).toBe(true);
    expect(resolveEntitlement(pro({ status: "trialing" }), NOW).active).toBe(true);
  });

  it("revokes access for a cancelled or unpaid subscription", () => {
    expect(resolveEntitlement(pro({ status: "canceled" }), NOW).active).toBe(false);
    expect(resolveEntitlement(pro({ status: "unpaid" }), NOW).active).toBe(false);
    expect(resolveEntitlement(pro({ status: "incomplete_expired" }), NOW).active).toBe(false);
  });

  it("keeps access until the period end after a cancel-at-period-end", () => {
    const rec = pro({ cancelAtPeriodEnd: true, currentPeriodEnd: NOW + DAY });
    expect(resolveEntitlement(rec, NOW).active).toBe(true);
    // …and drops it once that period has lapsed, even if no webhook ever arrived.
    expect(resolveEntitlement(rec, NOW + 2 * DAY).active).toBe(false);
  });

  it("treats a record with no period end as open-ended (comped accounts)", () => {
    const ent = resolveEntitlement({ plan: "pro", status: "active" }, NOW + 9999 * DAY);
    expect(ent.active).toBe(true);
  });
});

describe("feature gates", () => {
  it("gives Pro every catalogued feature and Free none", () => {
    const free = resolveEntitlement(null, NOW);
    const paid = resolveEntitlement(pro(), NOW);
    for (const f of PRO_PLAN.features) {
      expect(hasFeature(paid, f)).toBe(true);
      expect(hasFeature(free, f)).toBe(false);
    }
  });

  it("never gates the engine itself — free limits are horizon/storage only", () => {
    // A guard against a future gate that would paywall a *reading*. Free must
    // always keep a usable window, one profile and some journal history.
    expect(FREE_PLAN.limits.horizonDays).toBeGreaterThanOrEqual(30);
    expect(FREE_PLAN.limits.profiles).toBeGreaterThanOrEqual(1);
    expect(FREE_PLAN.limits.journalEntries).toBeGreaterThan(0);
    expect(FREE_PLAN.limits.aiMessagesPerDay).toBeGreaterThan(0);
  });
});

describe("clampHorizon", () => {
  it("caps a free request at the free horizon and flags the cut", () => {
    const free = resolveEntitlement(null, NOW);
    expect(clampHorizon(free, 30)).toEqual({ days: 30, capped: false });
    expect(clampHorizon(free, 1825)).toEqual({ days: FREE_PLAN.limits.horizonDays, capped: true });
  });

  it("lets Pro span five years", () => {
    const paid = resolveEntitlement(pro(), NOW);
    expect(clampHorizon(paid, 1825)).toEqual({ days: 1825, capped: false });
  });

  it("never returns a zero or negative window", () => {
    const free = resolveEntitlement(null, NOW);
    expect(clampHorizon(free, 0).days).toBe(1);
    expect(clampHorizon(free, -5).days).toBe(1);
  });
});

describe("AI quota", () => {
  const free = resolveEntitlement(null, NOW);
  const paid = resolveEntitlement(pro(), NOW);
  const today = usageDayKey(NOW);

  it("allows messages up to the plan limit", () => {
    expect(checkQuota(free, null, NOW).allowed).toBe(true);
    expect(checkQuota(free, { day: today, count: FREE_PLAN.limits.aiMessagesPerDay - 1 }, NOW).remaining).toBe(1);
  });

  it("blocks at the limit with an upgrade-aware message", () => {
    const v = checkQuota(free, { day: today, count: FREE_PLAN.limits.aiMessagesPerDay }, NOW);
    expect(v.allowed).toBe(false);
    expect(v.remaining).toBe(0);
    expect(v.message).toMatch(/upgrade to pro/i);
  });

  it("does not tell a paying user to upgrade when they hit the abuse ceiling", () => {
    const v = checkQuota(paid, { day: today, count: PRO_PLAN.limits.aiMessagesPerDay }, NOW);
    expect(v.allowed).toBe(false);
    expect(v.message).not.toMatch(/upgrade/i);
  });

  it("rolls the bucket over at UTC midnight without a reset job", () => {
    const yesterday = { day: usageDayKey(NOW - DAY), count: 999 };
    expect(checkQuota(free, yesterday, NOW).allowed).toBe(true);
    expect(checkQuota(free, yesterday, NOW).used).toBe(0);
  });

  it("ignores a corrupt negative count", () => {
    expect(checkQuota(free, { day: today, count: -50 }, NOW).used).toBe(0);
  });
});

describe("request ceiling (the enforceable spend bound)", () => {
  const free = resolveEntitlement(null, NOW);
  const paid = resolveEntitlement(pro(), NOW);
  const today = usageDayKey(NOW);

  it("bounds a plan at messages × rounds", () => {
    expect(requestLimit(free)).toBe(FREE_PLAN.limits.aiMessagesPerDay * ROUNDS_PER_MESSAGE);
    expect(requestLimit(paid)).toBeGreaterThan(requestLimit(free));
  });

  it("still blocks once the ceiling is hit even though messages look untouched", () => {
    // The attack the ceiling exists for: fake every request as a tool
    // continuation so the message counter never moves. `count: 0` here is
    // exactly what that looks like server-side — and it must not help.
    const usage = { day: today, count: 0, requests: requestLimit(free) };
    expect(checkQuota(free, usage, NOW).allowed).toBe(true); // message counter says fine…
    expect(requestCeilingReached(free, usage, NOW)).toBe(true); // …the real bound says no.
  });

  it("allows normal tool-loop usage well within the ceiling", () => {
    const usage = { day: today, count: 1, requests: ROUNDS_PER_MESSAGE };
    expect(requestCeilingReached(free, usage, NOW)).toBe(false);
  });

  it("treats a missing or corrupt request count as zero, never as unlimited", () => {
    expect(requestCeilingReached(free, { day: today, count: 0 }, NOW)).toBe(false);
    expect(requestCeilingReached(free, { day: today, count: 0, requests: -99 }, NOW)).toBe(false);
  });

  it("rolls the ceiling over with the UTC day", () => {
    const yesterday = { day: usageDayKey(NOW - DAY), count: 0, requests: 99_999 };
    expect(requestCeilingReached(free, yesterday, NOW)).toBe(false);
  });
});

describe("pricing presentation", () => {
  it("formats whole and fractional prices", () => {
    expect(formatPrice(0)).toBe("Free");
    expect(formatPrice(700)).toBe("£7");
    expect(formatPrice(5450)).toBe("£54.50");
  });

  it("quotes a real annual saving", () => {
    const saving = yearlySavingPercent(PRO_PLAN);
    expect(saving).toBeGreaterThan(0);
    expect(PRO_PLAN.priceYearly).toBeLessThan(PRO_PLAN.priceMonthly * 12);
  });
});
