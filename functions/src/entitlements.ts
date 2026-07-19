/**
 * Server-side entitlement + metering helpers.
 *
 * The browser draws gates from the same catalogue, but the browser is not a
 * security boundary: anything that costs money (AI tokens) is decided here,
 * against the Firestore billing document that only the Stripe webhook can write.
 */
import { getFirestore } from "firebase-admin/firestore";
import {
  BillingRecord,
  Entitlement,
  FREE_ENTITLEMENT,
  QuotaVerdict,
  UsageRecord,
  checkQuota,
  resolveEntitlement,
  usageDayKey,
} from "./shared/plans";

const billingDoc = (uid: string) => getFirestore().doc(`users/${uid}/billing/subscription`);
const usageDoc = (uid: string) => getFirestore().doc(`users/${uid}/billing/usage`);

/** Resolve a user's live entitlement. A read failure degrades to Free — the AI
 *  is still usable at the free allowance rather than erroring outright. */
export async function entitlementFor(uid: string): Promise<Entitlement> {
  try {
    const snap = await billingDoc(uid).get();
    return resolveEntitlement(snap.exists ? (snap.data() as BillingRecord) : null, Date.now());
  } catch {
    return FREE_ENTITLEMENT;
  }
}

/**
 * Atomically check the caller's daily AI allowance and, if there's room,
 * consume one message.
 *
 * The read-check-write runs inside a Firestore transaction so two concurrent
 * requests can't both see "1 remaining" and both proceed — without it the daily
 * cap would be trivially bypassable by firing parallel requests.
 */
export async function consumeAiMessage(uid: string, ent: Entitlement): Promise<QuotaVerdict> {
  const ref = usageDoc(uid);
  const now = Date.now();
  const today = usageDayKey(now);
  try {
    return await getFirestore().runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const current = snap.exists ? (snap.data() as UsageRecord) : null;
      const verdict = checkQuota(ent, current, now);
      if (!verdict.allowed) return verdict;
      const nextCount = (current && current.day === today ? Math.max(0, current.count) : 0) + 1;
      tx.set(ref, { day: today, count: nextCount, updatedAt: now });
      return { ...verdict, used: nextCount, remaining: Math.max(0, verdict.limit - nextCount) };
    });
  } catch {
    // Firestore unavailable: fail **open** at the free allowance rather than
    // taking chat down. The abuse ceiling still applies at the Anthropic level.
    return { allowed: true, used: 0, limit: ent.plan.limits.aiMessagesPerDay, remaining: 1 };
  }
}
