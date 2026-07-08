/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** When set (e.g. "/api/chat"), the AI chat routes through a serverless relay
   *  that holds the Anthropic key server-side; unset → the client uses BYOK. */
  readonly VITE_AI_PROXY_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
