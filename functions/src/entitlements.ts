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
  requestCeilingReached,
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

export interface ConsumeResult extends QuotaVerdict {
  /** True when the request itself was blocked by the hard upstream-call ceiling
   *  rather than by the user-facing message allowance. */
  requestCeiling?: boolean;
}

/**
 * Atomically check the caller's daily AI allowance and consume from it.
 *
 * Two counters, deliberately:
 *
 *  - `count` — user-facing *messages*. Only a genuine new question increments
 *    it, so the loop's tool round-trips don't bill someone for the model's
 *    decision to look something up. This is what the UI shows.
 *  - `requests` — EVERY upstream call, no exceptions. This is the security
 *    boundary. Whether a request is a "continuation" is decided from the message
 *    shape the client sent, which the client fully controls: anyone can bolt a
 *    fabricated `tool_result` onto their history and skip the message counter.
 *    The request ceiling doesn't care, so spend stays bounded at
 *    `messages × ROUNDS_PER_MESSAGE` per day regardless of what the client claims.
 *
 * The read-check-write runs in a transaction so parallel requests can't both see
 * "1 remaining" and both proceed.
 */
export async function consumeAiMessage(
  uid: string,
  ent: Entitlement,
  opts: { metered: boolean },
): Promise<ConsumeResult> {
  const ref = usageDoc(uid);
  const now = Date.now();
  const today = usageDayKey(now);
  const limit = ent.plan.limits.aiMessagesPerDay;

  try {
    return await getFirestore().runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const current = snap.exists ? (snap.data() as UsageRecord) : null;
      const sameDay = current?.day === today;
      const usedRequests = sameDay ? Math.max(0, current?.requests ?? 0) : 0;

      // The ceiling applies to every request, including claimed continuations.
      if (requestCeilingReached(ent, current, now)) {
        return {
          allowed: false,
          used: sameDay ? Math.max(0, current?.count ?? 0) : 0,
          limit,
          remaining: 0,
          requestCeiling: true,
          message: "You've reached today's AI limit. It resets at midnight UTC.",
        };
      }

      const verdict = checkQuota(ent, current, now);
      // A continuation doesn't spend a message, but it does spend a request.
      if (!opts.metered) {
        tx.set(ref, { day: today, count: sameDay ? Math.max(0, current?.count ?? 0) : 0, requests: usedRequests + 1, updatedAt: now }, { merge: true });
        return { ...verdict, allowed: true };
      }
      if (!verdict.allowed) return verdict;

      const nextCount = (sameDay ? Math.max(0, current?.count ?? 0) : 0) + 1;
      tx.set(ref, { day: today, count: nextCount, requests: usedRequests + 1, updatedAt: now });
      return { ...verdict, used: nextCount, remaining: Math.max(0, limit - nextCount) };
    });
  } catch (err) {
    // Fail CLOSED. This transaction contends on a single document, which is
    // exactly what a parallel-request attack produces — failing open here would
    // turn the defence into the bypass. An outage taking chat down is the
    // honest, bounded outcome; every deterministic reading keeps working.
    console.error("quota transaction failed", err);
    return {
      allowed: false,
      used: 0,
      limit,
      remaining: 0,
      message: "The advisor is temporarily unavailable. Every reading and forecast still works — please try chat again shortly.",
    };
  }
}
