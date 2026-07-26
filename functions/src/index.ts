/**
 * Cloud Functions entry point.
 *
 *   chat — authenticated, quota-metered relay to the Claude Messages API
 *
 * `initializeApp()` runs once here, before any module that touches Admin SDK
 * services, so the individual handlers can just call getFirestore()/getAuth().
 */
import { initializeApp } from "firebase-admin/app";

initializeApp();

export { chat } from "./chat";
