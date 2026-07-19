/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** When set (e.g. "/api/chat" or a Cloud Function URL), the AI chat routes through
   *  a serverless relay that holds the Anthropic key server-side; unset → BYOK. */
  readonly VITE_AI_PROXY_URL?: string;
  /** Firebase web config (all safe to expose). When apiKey + projectId are present,
   *  accounts / Google login / cloud profile sync light up; otherwise the app runs
   *  fully client-side on localStorage. */
  readonly VITE_FIREBASE_API_KEY?: string;
  readonly VITE_FIREBASE_AUTH_DOMAIN?: string;
  readonly VITE_FIREBASE_PROJECT_ID?: string;
  readonly VITE_FIREBASE_STORAGE_BUCKET?: string;
  readonly VITE_FIREBASE_MESSAGING_SENDER_ID?: string;
  readonly VITE_FIREBASE_APP_ID?: string;
  /** The billing Cloud Function's URL. Unset → the app runs Free-only and hides
   *  every upgrade affordance rather than offering a CTA that goes nowhere. */
  readonly VITE_BILLING_URL?: string;
  /** DEV ONLY. "pro" opens the paid surface locally without a real subscription.
   *  Read behind `import.meta.env.DEV`, so it is stripped from production builds. */
  readonly VITE_DEV_FORCE_PLAN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
