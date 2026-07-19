/**
 * Billing settings — plan status, renewal date, and the route into Stripe's
 * customer portal for card changes, invoices and cancellation.
 *
 * We deliberately don't build our own cancel flow: sending people to Stripe's
 * portal means cancelling is one honest click, not a retention maze.
 */
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { openBillingPortal } from "../billing/api.ts";
import { PRO_PLAN } from "../billing/plans.ts";
import { useAuth } from "../ui/profile/AuthContext.tsx";
import { useEntitlements } from "../ui/profile/EntitlementsContext.tsx";

function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });
}

export function BillingPage() {
  const [params] = useSearchParams();
  const { user, signIn, enabled: authEnabled } = useAuth();
  const { entitlement, quota, billingAvailable, ready } = useEntitlements();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Stripe redirects back here right after checkout. The entitlement arrives via
  // the webhook → Firestore snapshot, which can land a beat later than the
  // redirect, so the success banner shows while `active` is still false.
  const justPaid = params.get("checkout") === "success";
  const [awaiting, setAwaiting] = useState(justPaid);
  useEffect(() => {
    if (!justPaid || entitlement.active) {
      setAwaiting(false);
      return;
    }
    // Don't spin forever if a webhook never arrives — say something useful instead.
    const t = setTimeout(() => setAwaiting(false), 15000);
    return () => clearTimeout(t);
  }, [justPaid, entitlement.active]);

  const portal = async () => {
    setError(null);
    setBusy(true);
    try {
      const { getIdToken } = await import("../firebase/client.ts");
      const token = await getIdToken();
      if (!token) throw new Error("Sign in again to manage billing.");
      await openBillingPortal(token);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  if (!user) {
    return (
      <>
        <div className="page-head"><h2 className="page-title">Billing</h2></div>
        <div className="card" style={{ padding: 20 }}>
          <p style={{ margin: 0, fontSize: 13.5, color: "var(--muted)", lineHeight: 1.55 }}>
            {authEnabled
              ? "Sign in to see your plan and manage a subscription."
              : "This deployment runs without accounts, so there's no subscription to manage. Everything works locally in your browser, on the free plan."}
          </p>
          {/* Only offer sign-in when there's a Firebase project behind it — an
              inert button here would be the app's one obviously-broken control. */}
          {authEnabled && (
            <button className="btn" style={{ maxWidth: 230, marginTop: 12 }} onClick={signIn}>Sign in with Google</button>
          )}
        </div>
      </>
    );
  }

  return (
    <>
      <div className="page-head">
        <h2 className="page-title">Billing</h2>
        <Link className="btn-text" to="/settings/profile">Profile</Link>
      </div>

      {justPaid && entitlement.active && (
        <div className="note-soft" style={{ marginBottom: 14 }}>
          You're on Pro — thank you. Everything is unlocked now.
        </div>
      )}
      {awaiting && (
        <div className="note-soft" style={{ marginBottom: 14 }}>
          Payment received — waiting for Stripe to confirm. This usually takes a few seconds.
        </div>
      )}
      {justPaid && !entitlement.active && !awaiting && (
        <div className="warn" style={{ marginBottom: 14 }}>
          <span aria-hidden="true">⚠</span> Your payment went through but the subscription hasn't shown up here yet.
          Reload in a minute; if it still isn't showing, open the billing portal below or get in touch — you won't be
          charged twice.
        </div>
      )}

      <div className="card" style={{ padding: 20 }}>
        <div className="billing-row">
          <div>
            <b style={{ fontSize: 15 }}>{entitlement.plan.name}</b>
            <p style={{ margin: "4px 0 0", fontSize: 13.5, color: "var(--muted)", lineHeight: 1.55, maxWidth: 460 }}>
              {!ready
                ? "Checking your plan…"
                : entitlement.active
                  ? entitlement.cancelAtPeriodEnd && entitlement.currentPeriodEnd
                    ? `Cancelled — Pro stays active until ${formatDate(entitlement.currentPeriodEnd)}, then you'll move to Free. Nothing is deleted.`
                    : entitlement.currentPeriodEnd
                      ? `Renews on ${formatDate(entitlement.currentPeriodEnd)}.`
                      : "Active."
                  : "Every reading, the full engine, a two-month date search and one stored chart."}
            </p>
            {entitlement.status === "past_due" && (
              <div className="warn" style={{ marginTop: 10 }}>
                <span aria-hidden="true">⚠</span> Your last payment didn't go through. Pro is still on while Stripe
                retries — update your card in the portal to keep it.
              </div>
            )}
          </div>
          {billingAvailable ? (
            entitlement.active ? (
              <button className="btn-ghost" style={{ width: "auto", padding: "8px 16px" }} disabled={busy} onClick={portal}>
                {busy ? "Opening…" : "Manage subscription"}
              </button>
            ) : (
              <Link className="btn" style={{ maxWidth: 180 }} to="/pricing">See Pro</Link>
            )
          ) : null}
        </div>
        {error && <div className="warn" style={{ marginTop: 12 }}><span aria-hidden="true">⚠</span> {error}</div>}
      </div>

      <div className="card" style={{ padding: 20, marginTop: 12 }}>
        <b style={{ fontSize: 15 }}>AI advisor usage</b>
        <p style={{ margin: "6px 0 0", fontSize: 13.5, color: "var(--muted)", lineHeight: 1.55 }}>
          {quota.used} of {quota.limit} messages used today. Resets at midnight UTC.
          {!entitlement.active && ` Pro raises this to ${PRO_PLAN.limits.aiMessagesPerDay} a day.`}
        </p>
        <div className="quota-bar" aria-hidden="true">
          <div className="quota-fill" style={{ width: `${Math.min(100, (quota.used / Math.max(1, quota.limit)) * 100)}%` }} />
        </div>
        <p style={{ margin: "10px 0 0", fontSize: 12.5, color: "var(--faint)", lineHeight: 1.5 }}>
          Only the AI narration is metered. Every deterministic reading — scores, charts, forecasts, verification — is
          unlimited on every plan, because it runs in your browser and costs us nothing.
        </p>
      </div>

      <div className="ask-note" style={{ marginTop: 14 }}>
        Card details are handled entirely by Stripe; they never touch our servers. See the{" "}
        <Link className="btn-text" style={{ padding: 0 }} to="/privacy">privacy notice</Link> for what we do store.
      </div>
    </>
  );
}
