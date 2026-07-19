/**
 * Browser → billing Cloud Function. One endpoint (`VITE_BILLING_URL`) handling
 * both actions, so deployment needs a single URL configured rather than one per
 * operation.
 *
 * The client never sees a Stripe key and never posts a price: it names the
 * *interval* it wants and the server maps that to a configured price ID. That
 * means a tampered request can't buy Pro at a price of its choosing.
 */

import type { PlanId } from "./plans.ts";

export const BILLING_URL: string = import.meta.env.VITE_BILLING_URL ?? "";

/** True when a billing backend is deployed. Without it the app runs Free-only
 *  and every upgrade affordance hides itself rather than 404-ing. */
export const billingEnabled = Boolean(BILLING_URL);

export type BillingInterval = "month" | "year";

interface BillingResponse {
  url?: string;
  error?: { message?: string };
}

async function post(action: string, body: object, idToken: string): Promise<BillingResponse> {
  const res = await fetch(BILLING_URL, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${idToken}` },
    body: JSON.stringify({ action, ...body }),
  });
  let json: BillingResponse = {};
  try {
    json = (await res.json()) as BillingResponse;
  } catch {
    /* non-JSON body — fall through to the status-based message */
  }
  if (!res.ok) throw new Error(json.error?.message || friendlyError(res.status));
  return json;
}

function friendlyError(status: number): string {
  if (status === 401) return "Your session expired — sign in again and retry.";
  if (status === 429) return "Too many attempts. Wait a moment and try again.";
  if (status === 503) return "Billing isn't configured on this deployment yet.";
  return `Billing request failed (${status}). Please try again.`;
}

/** Where Stripe sends the browser back to. Hash routes survive the round-trip. */
function returnUrls(): { successUrl: string; cancelUrl: string } {
  const base = `${window.location.origin}${window.location.pathname}`;
  return { successUrl: `${base}#/settings/billing?checkout=success`, cancelUrl: `${base}#/pricing?checkout=cancelled` };
}

/** Open Stripe Checkout for a plan. Resolves only if the redirect fails. */
export async function startCheckout(plan: PlanId, interval: BillingInterval, idToken: string): Promise<void> {
  const { url } = await post("checkout", { plan, interval, ...returnUrls() }, idToken);
  if (!url) throw new Error("Stripe did not return a checkout URL.");
  window.location.assign(url);
}

/** Open the Stripe customer portal (change card, cancel, invoices). */
export async function openBillingPortal(idToken: string): Promise<void> {
  const base = `${window.location.origin}${window.location.pathname}`;
  const { url } = await post("portal", { returnUrl: `${base}#/settings/billing` }, idToken);
  if (!url) throw new Error("Stripe did not return a portal URL.");
  window.location.assign(url);
}
