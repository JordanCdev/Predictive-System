/**
 * Pricing — the plan comparison and the checkout entry point.
 *
 * Written to the same standard as a reading: state what you get, state what you
 * don't, no urgency theatre. The Free column is presented as a genuine product,
 * because it is one — the engine, the scores and the honesty are not the paid part.
 */
import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  ALL_PLANS,
  FEATURE_COPY,
  FREE_PLAN,
  Feature,
  LIFETIME_PLAN,
  PRO_PLAN,
  Plan,
  formatPrice,
  yearlySavingPercent,
} from "../billing/plans.ts";
import { BillingInterval, startCheckout } from "../billing/api.ts";
import { useAuth } from "../ui/profile/AuthContext.tsx";
import { useEntitlements } from "../ui/profile/EntitlementsContext.tsx";

/** Free-tier lines are written as capabilities, not as a list of what's missing. */
const FREE_INCLUDES = [
  "Every daily, weekly and monthly reading, in full",
  "The complete deterministic engine — same scores, same conflicts shown",
  "Date finder across the next two months",
  "One stored birth chart",
  "5 AI advisor messages a day",
  "Decision journal, up to 10 entries",
];

const PRO_ORDER: Feature[] = [
  "horizon_5y",
  "year_forecast",
  "luck_pillars",
  "multi_profile",
  "group_dates",
  "export",
  "journal_unlimited",
  "reasoning_dossier",
];

export function PricingPage() {
  const [interval, setInterval] = useState<BillingInterval>("year");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [params] = useSearchParams();
  const { user, signIn, enabled: authEnabled } = useAuth();
  const { entitlement, billingAvailable } = useEntitlements();

  const cancelled = params.get("checkout") === "cancelled";
  const saving = yearlySavingPercent(PRO_PLAN);

  const upgrade = async (chosen: BillingInterval) => {
    setError(null);
    if (!user) {
      // An account has to exist before a purchase can attach to it.
      await signIn();
      return;
    }
    setBusy(true);
    try {
      const { getIdToken } = await import("../firebase/client.ts");
      const token = await getIdToken();
      if (!token) throw new Error("Sign in again to continue to checkout.");
      await startCheckout(chosen === "lifetime" ? "lifetime" : "pro", chosen, token);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  return (
    <>
      <div className="page-head">
        <h2 className="page-title">Plans</h2>
        <Link className="btn-text" to="/today">Back to today</Link>
      </div>

      <p className="pricing-lede">
        The engine is free, and stays free. The paid tiers widen the horizon — years instead of weeks, everyone involved
        instead of just you, and the full audit trail behind every score. Subscribe, or buy it outright once.
      </p>

      {cancelled && (
        <div className="warn" style={{ marginBottom: 14 }}>
          <span aria-hidden="true">⚠</span> Checkout was cancelled — nothing was charged.
        </div>
      )}

      {entitlement.active && (
        <div className="note-soft" style={{ marginBottom: 14 }}>
          {entitlement.planId === "pro" ? (
            <>You're on Pro. <Link className="btn-text" style={{ padding: 0 }} to="/settings/billing">Manage your subscription</Link>.</>
          ) : (
            <>You own the Lifetime unlock. <Link className="btn-text" style={{ padding: 0 }} to="/settings/billing">See your billing</Link>.</>
          )}
        </div>
      )}

      <div className="interval-toggle" role="group" aria-label="Billing interval">
        <button className={interval === "month" ? "on" : ""} aria-pressed={interval === "month"} onClick={() => setInterval("month")}>
          Monthly
        </button>
        <button className={interval === "year" ? "on" : ""} aria-pressed={interval === "year"} onClick={() => setInterval("year")}>
          Yearly {saving > 0 && <span className="save-tag">save {saving}%</span>}
        </button>
      </div>

      <div className="plan-grid">
        <PlanCard plan={ALL_PLANS[0]} interval={interval} current={entitlement.planId === "free"}>
          <ul className="plan-features">
            {FREE_INCLUDES.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
          <Link className="btn-ghost plan-cta" to="/today">Keep using Free</Link>
        </PlanCard>

        <PlanCard plan={PRO_PLAN} interval={interval} current={entitlement.planId === "pro"} featured>
          <p className="plan-everything">Everything in Free, plus:</p>
          <ul className="plan-features">
            {PRO_ORDER.map((f) => (
              <li key={f}>
                <b>{FEATURE_COPY[f].title}</b> — {FEATURE_COPY[f].blurb}
              </li>
            ))}
            <li>{PRO_PLAN.limits.aiMessagesPerDay} AI advisor messages a day</li>
          </ul>

          {entitlement.planId === "pro" ? (
            <Link className="btn plan-cta" to="/settings/billing">Manage subscription</Link>
          ) : !billingAvailable ? (
            <div className="plan-unavailable">
              {authEnabled
                ? "Subscriptions aren't switched on for this deployment yet."
                : "Accounts aren't configured on this deployment, so there's nothing to bill."}
            </div>
          ) : (
            <button className="btn plan-cta" disabled={busy} onClick={() => upgrade(interval)}>
              {busy ? "Opening checkout…" : user ? "Upgrade to Pro" : "Sign in to upgrade"}
            </button>
          )}
          {error && <div className="warn" style={{ marginTop: 10 }}><span aria-hidden="true">⚠</span> {error}</div>}
        </PlanCard>

      </div>


      {/* A one-off purchase is a different KIND of offer, not a third subscription
          tier — so it gets its own band rather than orphaning a card onto a
          second grid row. */}
      <div className="lifetime-band">
        <div className="lifetime-copy">
          <div className="upsell-tag"><span aria-hidden="true">✦</span> One-off</div>
          <h3>{LIFETIME_PLAN.name} — {formatPrice(LIFETIME_PLAN.priceOneOff ?? 0)} once</h3>
          <p>
            {LIFETIME_PLAN.tagline} Every Pro feature that runs in your browser — the five-year search, any year, the
            luck pillars, six charts, group dates, export and the full dossier — bought outright. No renewal, no expiry,
            no card kept on file.
          </p>
          <p className="lifetime-caveat">
            The AI advisor stays at the free {FREE_PLAN.limits.aiMessagesPerDay} messages a day. That's the one part with
            a real per-use cost, so we can't honestly sell it forever for a single payment — and we'd rather say that now
            than quietly withdraw it later.
          </p>
        </div>
        <div className="lifetime-action">
          {entitlement.lifetime ? (
            <div className="plan-unavailable">You own this. Thank you.</div>
          ) : !billingAvailable ? (
            <div className="plan-unavailable">Not switched on for this deployment yet.</div>
          ) : (
            <button className="btn" disabled={busy} onClick={() => upgrade("lifetime")}>
              {busy ? "Opening checkout…" : user ? "Buy it once" : "Sign in to buy"}
            </button>
          )}
        </div>
      </div>

      <div className="pricing-notes">
        <h3>The fine print, in plain words</h3>
        <ul>
          <li>Cancel a subscription any time from your billing settings — you keep Pro until the period you've paid for ends.</li>
          <li>
            The Lifetime unlock is a single payment with nothing to cancel. It covers the features that run in your
            browser, which cost us nothing to keep serving; the AI advisor stays metered because it genuinely isn't free
            for us to run, and we'd rather say so than quietly withdraw it later.
          </li>
          <li>Payments are handled by Stripe. We never see or store your card details.</li>
          <li>
            Downgrading never deletes anything. Extra charts and journal entries are paused, not erased, and come back if
            you resubscribe.
          </li>
          <li>
            This is a decision-support tool grounded in classical method, not a prediction service. Pro buys more range
            and more transparency — it does not buy a better outcome, and we won't pretend otherwise.
          </li>
        </ul>
        <p>
          Questions about how any of it is calculated? The <Link className="btn-text" style={{ padding: 0 }} to="/settings/profile">method is documented</Link> in
          the app, free plan included.
        </p>
      </div>
    </>
  );
}

function PlanCard({
  plan,
  interval,
  current,
  featured = false,
  children,
}: {
  plan: Plan;
  interval: BillingInterval;
  current: boolean;
  featured?: boolean;
  children: React.ReactNode;
}) {
  const oneOff = interval === "lifetime";
  const free = !oneOff && plan.priceMonthly === 0;
  const price = oneOff ? (plan.priceOneOff ?? 0) : interval === "year" ? plan.priceYearly : plan.priceMonthly;
  // Show "£0", not the word "Free" — the card is already titled Free, and a
  // number sits next to the paid columns so all three are directly comparable.
  const priceLabel = free ? "£0" : formatPrice(price, plan.currency);
  const unit = oneOff ? "once" : free ? "forever" : interval === "year" ? "/year" : "/month";
  return (
    <div className={`plan-card${featured ? " featured" : ""}${current ? " current" : ""}`}>
      {current && <span className="plan-current-tag">Your plan</span>}
      <h3 className="plan-name">{plan.name}</h3>
      <p className="plan-tagline">{plan.tagline}</p>
      <div className="plan-price">
        <b>{priceLabel}</b>
        <span>{unit}</span>
      </div>
      {children}
    </div>
  );
}
