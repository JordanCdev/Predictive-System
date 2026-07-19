/**
 * The paywall surface. Every gate in the app renders one of these rather than
 * hiding a feature outright, so a user always learns *what* exists and *why* it
 * is locked — never a dead end or a mystery.
 *
 * House style: a locked feature is explained in the same plain, non-hyped voice
 * as a reading. No countdowns, no "only 2 left", no dark patterns.
 */
import { ReactNode } from "react";
import { Link } from "react-router-dom";
import { FEATURE_COPY, Feature } from "../../billing/plans.ts";
import { useEntitlements } from "../profile/EntitlementsContext.tsx";

/** Inline "this is a Pro feature" card. */
export function UpgradePrompt({ feature, compact = false }: { feature: Feature; compact?: boolean }) {
  const { billingAvailable } = useEntitlements();
  const copy = FEATURE_COPY[feature];

  return (
    <div className={`upsell${compact ? " compact" : ""}`}>
      <div className="upsell-body">
        <div className="upsell-tag">
          <span aria-hidden="true">✦</span> Pro
        </div>
        <b className="upsell-title">{copy.title}</b>
        <p className="upsell-blurb">{copy.blurb}</p>
      </div>
      {billingAvailable ? (
        <Link className="btn upsell-cta" to="/pricing">
          See Pro
        </Link>
      ) : (
        // No billing backend deployed — don't dangle a CTA that goes nowhere.
        <span className="upsell-soon">Coming soon</span>
      )}
    </div>
  );
}

/**
 * Render `children` when the plan includes `feature`, otherwise the paywall.
 * `preview` lets a gate show a blurred/partial taste of the real thing above the
 * prompt, which converts far better than an empty box — and is more honest,
 * because the user sees exactly what they'd be buying.
 */
export function Gate({
  feature,
  children,
  preview,
  compact,
}: {
  feature: Feature;
  children: ReactNode;
  preview?: ReactNode;
  compact?: boolean;
}) {
  const { can } = useEntitlements();
  if (can(feature)) return <>{children}</>;
  return (
    <>
      {preview && (
        <div className="gate-preview" aria-hidden="true">
          {preview}
        </div>
      )}
      <UpgradePrompt feature={feature} compact={compact} />
    </>
  );
}

/** The small plan chip shown in the nav / profile page. */
export function PlanBadge() {
  const { entitlement } = useEntitlements();
  if (!entitlement.active) return null;
  return <span className="plan-badge">Pro</span>;
}
