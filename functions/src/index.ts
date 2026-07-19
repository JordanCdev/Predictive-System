/**
 * Cloud Functions entry point.
 *
 *   chat          — authenticated, quota-metered relay to the Claude Messages API
 *   billing       — Stripe Checkout + customer-portal session creation
 *   stripeWebhook — subscription lifecycle → the user's entitlement document
 *
 * `initializeApp()` runs once here, before any module that touches Admin SDK
 * services, so the individual handlers can just call getFirestore()/getAuth().
 */
import { initializeApp } from "firebase-admin/app";

initializeApp();

export { chat } from "./chat";
export { billing, stripeWebhook } from "./billing";
