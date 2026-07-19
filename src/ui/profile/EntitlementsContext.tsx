/**
 * Entitlements — resolves the signed-in user's plan and exposes the feature gates
 * the rest of the UI reads.
 *
 * Degradation is the whole design here. Firebase absent, signed out, offline,
 * Firestore rules denying the read, no billing backend deployed — every one of
 * those paths lands on a valid **Free** entitlement instead of a spinner or a
 * crash. The app has always worked with nothing but localStorage; adding billing
 * must not change that.
 */
import { ReactNode, createContext, useContext, useEffect, useMemo, useState } from "react";
import {
  BillingRecord,
  Entitlement,
  FREE_ENTITLEMENT,
  Feature,
  QuotaVerdict,
  UsageRecord,
  checkQuota,
  clampHorizon,
  hasFeature,
  resolveEntitlement,
} from "../../billing/plans.ts";
import { billingEnabled } from "../../billing/api.ts";
import { useAuth } from "./AuthContext.tsx";

export interface EntitlementsValue {
  entitlement: Entitlement;
  /** False until the first billing read resolves (used to avoid a Free→Pro flash). */
  ready: boolean;
  /** True when a billing backend is deployed, so upgrade CTAs are meaningful. */
  billingAvailable: boolean;
  /** Is a capability unlocked? */
  can: (feature: Feature) => boolean;
  /** Clamp a requested day-window to the plan horizon. */
  clamp: (requestedDays: number) => { days: number; capped: boolean };
  /** Today's AI-message allowance, mirrored from the server meter. */
  quota: QuotaVerdict;
  /** Optimistically bump the local meter after a message is sent. */
  noteAiMessage: () => void;
}

const EntitlementsCtx = createContext<EntitlementsValue | null>(null);

/**
 * Dev-only plan override (`VITE_DEV_FORCE_PLAN=pro npm run dev`).
 *
 * Entitlements come from Firestore, so without this there is no way to open the
 * paid surface locally — you'd have to run a real Stripe checkout to look at a
 * gated screen. Guarded by `import.meta.env.DEV`, which Vite statically replaces
 * with `false` in a production build, so the whole branch is dead-code-eliminated
 * and can never grant Pro to a real user.
 */
function devForcedRecord(): BillingRecord | null {
  if (!import.meta.env.DEV) return null;
  return import.meta.env.VITE_DEV_FORCE_PLAN === "pro" ? { plan: "pro", status: "active" } : null;
}

export function EntitlementsProvider({ children }: { children: ReactNode }) {
  const { enabled, user, ready: authReady } = useAuth();
  const [record, setRecord] = useState<BillingRecord | null>(devForcedRecord);
  const [usage, setUsage] = useState<UsageRecord | null>(null);
  const [ready, setReady] = useState(false);
  // Bumped locally so the "N left today" counter moves immediately; the Firestore
  // snapshot then overwrites it with the server's authoritative count.
  const [optimistic, setOptimistic] = useState(0);

  useEffect(() => {
    // Signed out, or no Firebase at all: Free, resolved, no listeners.
    if (!enabled || !user) {
      setRecord(devForcedRecord());
      setUsage(null);
      setOptimistic(0);
      setReady(authReady);
      return;
    }
    let cancelled = false;
    let unsubBilling = () => {};
    let unsubUsage = () => {};
    (async () => {
      try {
        const m = await import("../../firebase/client.ts");
        if (cancelled) return;
        unsubBilling = m.watchBilling(user.uid, (r) => {
          setRecord(r);
          setReady(true);
        });
        unsubUsage = m.watchUsage(user.uid, (u) => {
          setUsage(u);
          setOptimistic(0);
        });
      } catch {
        if (!cancelled) setReady(true); // SDK failed to load → stay on Free
      }
    })();
    return () => {
      cancelled = true;
      unsubBilling();
      unsubUsage();
    };
  }, [enabled, user, authReady]);

  // `Date.now()` is read once per record change rather than per render, so the
  // entitlement object stays referentially stable between billing updates.
  const entitlement = useMemo<Entitlement>(
    () => (record ? resolveEntitlement(record, Date.now()) : FREE_ENTITLEMENT),
    [record],
  );

  const quota = useMemo<QuotaVerdict>(() => {
    const effective: UsageRecord | null = usage
      ? { ...usage, count: usage.count + optimistic }
      : optimistic > 0
        ? { day: new Date().toISOString().slice(0, 10), count: optimistic }
        : null;
    return checkQuota(entitlement, effective, Date.now());
  }, [entitlement, usage, optimistic]);

  const value = useMemo<EntitlementsValue>(
    () => ({
      entitlement,
      ready,
      billingAvailable: billingEnabled && enabled,
      can: (feature: Feature) => hasFeature(entitlement, feature),
      clamp: (requestedDays: number) => clampHorizon(entitlement, requestedDays),
      quota,
      noteAiMessage: () => setOptimistic((n) => n + 1),
    }),
    [entitlement, ready, enabled, quota],
  );

  return <EntitlementsCtx.Provider value={value}>{children}</EntitlementsCtx.Provider>;
}

export function useEntitlements(): EntitlementsValue {
  const v = useContext(EntitlementsCtx);
  if (!v) throw new Error("useEntitlements must be used within an EntitlementsProvider");
  return v;
}
