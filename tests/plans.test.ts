import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ALL_FEATURES,
  ENTITLEMENT,
  PLAN,
  ROUNDS_PER_MESSAGE,
  checkQuota,
  clampHorizon,
  hasFeature,
  requestCeilingReached,
  requestLimit,
  usageDayKey,
} from "../src/billing/plans.ts";

const NOW = Date.UTC(2026, 6, 19, 12, 0, 0); // 2026-07-19T12:00Z
const DAY = 86_400_000;

describe("the single plan", () => {
  it("includes every catalogued feature — there is nothing to unlock", () => {
    for (const f of ALL_FEATURES) {
      expect(PLAN.features).toContain(f);
      expect(hasFeature(ENTITLEMENT, f)).toBe(true);
    }
    expect(PLAN.features).toHaveLength(ALL_FEATURES.length);
  });

  it("carries the documented structural and abuse bounds, not product limits", () => {
    // The engine's 5-year search boundary (MAX_WINDOW_DAYS territory), a
    // generous profile bound, a high journal abuse bound, and the AI spend
    // ceiling on the hosted proxy. None of these is a tier.
    expect(PLAN.limits.horizonDays).toBe(1827);
    expect(PLAN.limits.profiles).toBe(12);
    expect(PLAN.limits.journalEntries).toBe(5000);
    expect(PLAN.limits.aiMessagesPerDay).toBe(200);
  });

  it("never gates the engine — the bounds always leave the app fully usable", () => {
    expect(PLAN.limits.horizonDays).toBeGreaterThanOrEqual(1826); // full 5-year search
    expect(PLAN.limits.profiles).toBeGreaterThanOrEqual(1);
    expect(PLAN.limits.journalEntries).toBeGreaterThan(0);
    expect(PLAN.limits.aiMessagesPerDay).toBeGreaterThan(0);
  });
});

describe("clampHorizon (the engine's search boundary)", () => {
  it("lets everyone span the full five years", () => {
    expect(clampHorizon(ENTITLEMENT, 1825)).toEqual({ days: 1825, capped: false });
    expect(clampHorizon(ENTITLEMENT, 1827)).toEqual({ days: 1827, capped: false });
  });

  it("caps beyond the boundary and flags the cut", () => {
    expect(clampHorizon(ENTITLEMENT, 5000)).toEqual({ days: 1827, capped: true });
  });

  it("never returns a zero or negative window", () => {
    expect(clampHorizon(ENTITLEMENT, 0).days).toBe(1);
    expect(clampHorizon(ENTITLEMENT, -5).days).toBe(1);
  });
});

describe("AI quota (the abuse bound, not a product)", () => {
  const today = usageDayKey(NOW);
  const limit = PLAN.limits.aiMessagesPerDay;

  it("allows messages up to the daily allowance", () => {
    expect(checkQuota(ENTITLEMENT, null, NOW).allowed).toBe(true);
    expect(checkQuota(ENTITLEMENT, { day: today, count: limit - 1 }, NOW).remaining).toBe(1);
  });

  it("blocks at the ceiling with copy that never mentions upgrading or plans", () => {
    const v = checkQuota(ENTITLEMENT, { day: today, count: limit }, NOW);
    expect(v.allowed).toBe(false);
    expect(v.remaining).toBe(0);
    expect(v.message).toMatch(/resets at midnight UTC/i);
    expect(v.message).not.toMatch(/upgrade|pro\b|plan|price|subscri/i);
  });

  it("rolls the bucket over at UTC midnight without a reset job", () => {
    const yesterday = { day: usageDayKey(NOW - DAY), count: 999 };
    expect(checkQuota(ENTITLEMENT, yesterday, NOW).allowed).toBe(true);
    expect(checkQuota(ENTITLEMENT, yesterday, NOW).used).toBe(0);
  });

  it("ignores a corrupt negative count", () => {
    expect(checkQuota(ENTITLEMENT, { day: today, count: -50 }, NOW).used).toBe(0);
  });
});

describe("request ceiling (the enforceable spend bound)", () => {
  const today = usageDayKey(NOW);

  it("bounds a day at messages × rounds", () => {
    expect(requestLimit(ENTITLEMENT)).toBe(PLAN.limits.aiMessagesPerDay * ROUNDS_PER_MESSAGE);
  });

  it("still blocks once the ceiling is hit even though messages look untouched", () => {
    // The attack the ceiling exists for: fake every request as a tool
    // continuation so the message counter never moves. `count: 0` here is
    // exactly what that looks like server-side — and it must not help.
    const usage = { day: today, count: 0, requests: requestLimit(ENTITLEMENT) };
    expect(checkQuota(ENTITLEMENT, usage, NOW).allowed).toBe(true); // message counter says fine…
    expect(requestCeilingReached(ENTITLEMENT, usage, NOW)).toBe(true); // …the real bound says no.
  });

  it("allows normal tool-loop usage well within the ceiling", () => {
    const usage = { day: today, count: 1, requests: ROUNDS_PER_MESSAGE };
    expect(requestCeilingReached(ENTITLEMENT, usage, NOW)).toBe(false);
  });

  it("treats a missing or corrupt request count as zero, never as unlimited", () => {
    expect(requestCeilingReached(ENTITLEMENT, { day: today, count: 0 }, NOW)).toBe(false);
    expect(requestCeilingReached(ENTITLEMENT, { day: today, count: 0, requests: -99 }, NOW)).toBe(false);
  });

  it("rolls the ceiling over with the UTC day", () => {
    const yesterday = { day: usageDayKey(NOW - DAY), count: 0, requests: 99_999 };
    expect(requestCeilingReached(ENTITLEMENT, yesterday, NOW)).toBe(false);
  });
});

describe("tier removal is complete", () => {
  it("no source file under src/ still references the removed tier machinery", () => {
    // The owner's decision: one free tier, everything accessible. If any of
    // these tokens reappears under src/, a gate or a sales surface is creeping
    // back in — name the file so the regression is obvious.
    const FORBIDDEN = /UpgradePrompt|PlanBadge|priceMonthly|Stripe|LIFETIME_PLAN|PRO_PLAN/;
    const root = join(__dirname, "..", "src");
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const full = join(dir, name);
        if (statSync(full).isDirectory()) walk(full);
        else if (/\.(ts|tsx|css|html|md)$/.test(name) && FORBIDDEN.test(readFileSync(full, "utf8")))
          offenders.push(full.slice(root.length - 3));
      }
    };
    walk(root);
    expect(offenders, `tier machinery reference found in: ${offenders.join(", ")}`).toEqual([]);
  });
});
