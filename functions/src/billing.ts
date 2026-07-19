/**
 * Stripe billing — Checkout, the customer portal, and the subscription webhook.
 *
 * Trust model:
 *  - The browser never names a price, only an *interval*; the server maps that to
 *    a configured price ID, so a tampered request can't buy Pro for £0.
 *  - The entitlement document is written **only** here, from a signature-verified
 *    Stripe event. Firestore rules make it read-only to the client.
 *  - Every function degrades to a clean 503 when Stripe isn't configured, so a
 *    deployment without billing keys still serves the free app.
 */
import { onRequest } from "firebase-functions/v2/https";
import { defineSecret, defineString } from "firebase-functions/params";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import Stripe from "stripe";
import { BillingRecord, PlanId, SubscriptionStatus } from "./shared/plans";

const STRIPE_SECRET_KEY = defineSecret("STRIPE_SECRET_KEY");
const STRIPE_WEBHOOK_SECRET = defineSecret("STRIPE_WEBHOOK_SECRET");
const PRICE_PRO_MONTH = defineString("STRIPE_PRICE_PRO_MONTH", { default: "" });
const PRICE_PRO_YEAR = defineString("STRIPE_PRICE_PRO_YEAR", { default: "" });

const REGION = "us-central1";

let stripeClient: Stripe | null = null;
function stripe(): Stripe {
  // No explicit apiVersion: pin by upgrading the SDK, so the types and the wire
  // format can never disagree (they do if a hand-written version string drifts).
  if (!stripeClient) stripeClient = new Stripe(STRIPE_SECRET_KEY.value());
  return stripeClient;
}

/** Verify the Firebase ID token on an incoming request; null when absent/invalid. */
async function callerUid(req: { get(name: string): string | undefined }): Promise<string | null> {
  const header = req.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return null;
  try {
    return (await getAuth().verifyIdToken(token)).uid;
  } catch {
    return null;
  }
}

function priceFor(interval: string): string {
  return interval === "year" ? PRICE_PRO_YEAR.value() : PRICE_PRO_MONTH.value();
}

/**
 * Find or create this user's Stripe customer.
 *
 * The id is cached at `users/{uid}/billing/customer` and mirrored into a
 * server-only `stripeCustomers/{customerId}` document, which is how the webhook
 * maps an incoming event back to a uid. Caching matters for correctness as well
 * as latency: without it a second checkout would create a duplicate customer and
 * the user would end up with two subscriptions.
 */
async function customerFor(uid: string): Promise<string> {
  const db = getFirestore();
  const ref = db.doc(`users/${uid}/billing/customer`);
  const snap = await ref.get();
  const cached = snap.exists ? (snap.data()?.stripeCustomerId as string | undefined) : undefined;
  if (cached) return cached;

  const user = await getAuth().getUser(uid);
  const customer = await stripe().customers.create({
    email: user.email ?? undefined,
    metadata: { firebaseUid: uid },
  });
  await ref.set({ stripeCustomerId: customer.id, createdAt: Date.now() });
  await db.doc(`stripeCustomers/${customer.id}`).set({ uid, createdAt: Date.now() });
  return customer.id;
}

// ── checkout + portal ────────────────────────────────────────────────────────

export const billing = onRequest(
  { cors: true, secrets: [STRIPE_SECRET_KEY], region: REGION, timeoutSeconds: 60 },
  async (req, res) => {
    if (req.method === "OPTIONS") {
      res.status(204).send("");
      return;
    }
    if (req.method !== "POST") {
      res.status(405).json({ error: { message: "Method not allowed" } });
      return;
    }
    if (!STRIPE_SECRET_KEY.value()) {
      res.status(503).json({ error: { message: "Billing isn't configured on this deployment yet." } });
      return;
    }

    const uid = await callerUid(req);
    if (!uid) {
      res.status(401).json({ error: { message: "Sign in to manage your subscription." } });
      return;
    }

    const { action, interval, successUrl, cancelUrl, returnUrl } = (req.body ?? {}) as Record<string, string>;

    try {
      if (action === "checkout") {
        const price = priceFor(interval);
        if (!price) {
          res.status(503).json({ error: { message: "No price is configured for that plan yet." } });
          return;
        }
        const session = await stripe().checkout.sessions.create({
          mode: "subscription",
          customer: await customerFor(uid),
          line_items: [{ price, quantity: 1 }],
          success_url: successUrl || "https://example.invalid/#/settings/billing",
          cancel_url: cancelUrl || "https://example.invalid/#/pricing",
          client_reference_id: uid,
          // Repeated on the subscription so webhook events that don't carry the
          // session (e.g. renewals, cancellations) can still resolve the user.
          subscription_data: { metadata: { firebaseUid: uid } },
          allow_promotion_codes: true,
        });
        res.json({ url: session.url });
        return;
      }

      if (action === "portal") {
        const session = await stripe().billingPortal.sessions.create({
          customer: await customerFor(uid),
          return_url: returnUrl || "https://example.invalid/#/settings/billing",
        });
        res.json({ url: session.url });
        return;
      }

      res.status(400).json({ error: { message: "Unknown billing action." } });
    } catch (err) {
      console.error("billing error", err);
      res.status(500).json({ error: { message: "Couldn't reach Stripe. Please try again." } });
    }
  },
);

// ── webhook ──────────────────────────────────────────────────────────────────

/** Map a Stripe subscription onto the entitlement document the client reads. */
function recordFor(sub: Stripe.Subscription, customerId: string): BillingRecord {
  const item = sub.items.data[0];
  const interval = item?.price?.recurring?.interval;
  // Any live status grants Pro; resolveEntitlement() decides what "live" means so
  // the browser and the server can't disagree about it.
  const plan: PlanId = "pro";
  return {
    plan,
    status: sub.status as SubscriptionStatus,
    currentPeriodEnd: sub.current_period_end ? sub.current_period_end * 1000 : undefined,
    cancelAtPeriodEnd: Boolean(sub.cancel_at_period_end),
    stripeCustomerId: customerId,
    stripeSubscriptionId: sub.id,
    priceId: item?.price?.id,
    interval: interval === "year" ? "year" : "month",
  };
}

/** Resolve the Firebase uid behind a subscription: metadata first (set at
 *  checkout), then the customer mirror, then the customer's own metadata. */
async function uidForSubscription(sub: Stripe.Subscription, customerId: string): Promise<string | null> {
  const fromMeta = sub.metadata?.firebaseUid;
  if (fromMeta) return fromMeta;

  const mirror = await getFirestore().doc(`stripeCustomers/${customerId}`).get();
  const fromMirror = mirror.exists ? (mirror.data()?.uid as string | undefined) : undefined;
  if (fromMirror) return fromMirror;

  try {
    const customer = await stripe().customers.retrieve(customerId);
    if (!customer.deleted && customer.metadata?.firebaseUid) return customer.metadata.firebaseUid;
  } catch {
    /* fall through */
  }
  return null;
}

export const stripeWebhook = onRequest(
  { cors: false, secrets: [STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET], region: REGION, timeoutSeconds: 60 },
  async (req, res) => {
    if (!STRIPE_SECRET_KEY.value() || !STRIPE_WEBHOOK_SECRET.value()) {
      res.status(503).send("Billing not configured");
      return;
    }
    const signature = req.get("stripe-signature");
    if (!signature) {
      res.status(400).send("Missing signature");
      return;
    }

    let event: Stripe.Event;
    try {
      // rawBody, not req.body: the signature covers the exact bytes Stripe sent.
      event = stripe().webhooks.constructEvent(req.rawBody, signature, STRIPE_WEBHOOK_SECRET.value());
    } catch (err) {
      console.error("webhook signature verification failed", err);
      res.status(400).send("Invalid signature");
      return;
    }

    try {
      switch (event.type) {
        case "customer.subscription.created":
        case "customer.subscription.updated":
        case "customer.subscription.deleted": {
          const sub = event.data.object as Stripe.Subscription;
          const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
          const uid = await uidForSubscription(sub, customerId);
          if (!uid) {
            console.error("no uid for subscription", sub.id, customerId);
            break; // 200 anyway — retrying won't conjure a mapping
          }
          const record =
            event.type === "customer.subscription.deleted"
              ? { ...recordFor(sub, customerId), plan: "free" as PlanId, status: "canceled" as SubscriptionStatus }
              : recordFor(sub, customerId);
          await getFirestore().doc(`users/${uid}/billing/subscription`).set(record);
          break;
        }
        default:
          break; // every other event type is informational for us
      }
      res.json({ received: true });
    } catch (err) {
      // A 500 tells Stripe to retry, which is what we want for a transient
      // Firestore failure — the entitlement would otherwise be silently lost.
      console.error("webhook handling failed", event.type, err);
      res.status(500).send("Handler error");
    }
  },
);
