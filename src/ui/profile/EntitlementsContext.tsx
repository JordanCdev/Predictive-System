/**
 * Entitlements — with one plan this is a formality, kept so the rest of the UI
 * keeps its `can()` / `clamp()` / `quota` call sites.
 *
 * Every capability is always on. What this context still genuinely does is
 * mirror the hosted AI proxy's daily usage meter (the abuse bound on real token
 * spend) so the chat panel can show "N left today" — BYOK chat never touches it.
 * Firebase absent, signed out, offline: everything still works, the meter just
 * stays at zero.
 */
import { ReactNode, createContext, useContext, useEffect, useMemo, useState } from "react";
import {
  ENTITLEMENT,
  Entitlement,
  Feature,
  QuotaVerdict,
  UsageRecord,
  checkQuota,
  clampHorizon,
} from "../../billing/plans.ts";
import { useAuth } from "./AuthContext.tsx";

export interface EntitlementsValue {
  entitlement: Entitlement;
  /** Always true — there is nothing to resolve any more. */
  ready: boolean;
  /** No billing backend exists. Kept false-forever so old call sites compile. */
  billingAvailable: boolean;
  /** Is a capability unlocked? Always yes. */
  can: (feature: Feature) => boolean;
  /** Clamp a requested day-window to the engine's search boundary. */
  clamp: (requestedDays: number) => { days: number; capped: boolean };
  /** Today's AI-message allowance, mirrored from the server meter. */
  quota: QuotaVerdict;
  /** Optimistically bump the local meter after a message is sent. */
  noteAiMessage: () => void;
  /** Give an optimistic message back when the send failed or was aborted. */
  releaseAiMessage: () => void;
}

const EntitlementsCtx = createContext<EntitlementsValue | null>(null);

export function EntitlementsProvider({ children }: { children: ReactNode }) {
  const { enabled, user } = useAuth();
  const [usage, setUsage] = useState<UsageRecord | null>(null);
  // Bumped locally so the "N left today" counter moves immediately; the Firestore
  // snapshot then overwrites it with the server's authoritative count.
  const [optimistic, setOptimistic] = useState(0);

  useEffect(() => {
    // Signed out, or no Firebase at all: no meter to mirror, no listeners.
    if (!enabled || !user) {
      setUsage(null);
      setOptimistic(0);
      return;
    }
    let cancelled = false;
    let unsubUsage = () => {};
    (async () => {
      try {
        const m = await import("../../firebase/client.ts");
        if (cancelled) return;
        unsubUsage = m.watchUsage(user.uid, (u) => {
          setUsage(u);
          setOptimistic(0);
        });
      } catch {
        /* SDK failed to load — the meter simply stays local */
      }
    })();
    return () => {
      cancelled = true;
      unsubUsage();
    };
  }, [enabled, user]);

  const quota = useMemo<QuotaVerdict>(() => {
    const effective: UsageRecord | null = usage
      ? { ...usage, count: usage.count + optimistic }
      : optimistic > 0
        ? { day: new Date().toISOString().slice(0, 10), count: optimistic }
        : null;
    return checkQuota(ENTITLEMENT, effective, Date.now());
  }, [usage, optimistic]);

  const value = useMemo<EntitlementsValue>(
    () => ({
      entitlement: ENTITLEMENT,
      ready: true,
      billingAvailable: false,
      can: () => true,
      clamp: (requestedDays: number) => clampHorizon(ENTITLEMENT, requestedDays),
      quota,
      noteAiMessage: () => setOptimistic((n) => n + 1),
      releaseAiMessage: () => setOptimistic((n) => Math.max(0, n - 1)),
    }),
    [quota],
  );

  return <EntitlementsCtx.Provider value={value}>{children}</EntitlementsCtx.Provider>;
}

export function useEntitlements(): EntitlementsValue {
  const v = useContext(EntitlementsCtx);
  if (!v) throw new Error("useEntitlements must be used within an EntitlementsProvider");
  return v;
}
