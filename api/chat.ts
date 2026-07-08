/**
 * Serverless relay for the AI chat (ROADMAP §C1, Option A).
 *
 * A stateless proxy: it holds ANTHROPIC_API_KEY as a server env var and forwards
 * the browser's Messages-API request to Claude, streaming the response straight
 * back. The browser still orchestrates the tool loop and runs every engine tool
 * locally — only chat text + small engine tool-results transit the network, and
 * the API key is never exposed to the client.
 *
 * Deploy target: Vercel (this repo already ships `vercel.json`). This file lives
 * OUTSIDE `src/`, so it is not part of the Vite build or the app's typecheck; it
 * is bundled by Vercel's Edge runtime. To turn the hosted path on:
 *   1. `vercel env add ANTHROPIC_API_KEY` (your key).
 *   2. Build the app with `VITE_AI_PROXY_URL=/api/chat` so the client targets it
 *      instead of asking the user for a key.
 * With neither set, the app falls back to BYOK (the user's own key) automatically.
 */

export const config = { runtime: "edge" };

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

// Restrict who may call the relay. Set ALLOWED_ORIGIN in the environment to your
// site's origin in production; defaults to "*" for easy local testing.
function corsHeaders(): Record<string, string> {
  const origin = (globalThis as any).process?.env?.ALLOWED_ORIGIN || "*";
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "content-type",
  };
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: { message: "Method not allowed" } }), {
      status: 405,
      headers: { "content-type": "application/json", ...corsHeaders() },
    });
  }

  const key = (globalThis as any).process?.env?.ANTHROPIC_API_KEY;
  if (!key) {
    return new Response(JSON.stringify({ error: { message: "Proxy is not configured (ANTHROPIC_API_KEY unset)." } }), {
      status: 500,
      headers: { "content-type": "application/json", ...corsHeaders() },
    });
  }

  const body = await req.text();

  const upstream = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": key,
      "anthropic-version": ANTHROPIC_VERSION,
    },
    body,
  });

  // Stream the (possibly SSE) response straight back to the browser unchanged.
  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      "content-type": upstream.headers.get("content-type") || "application/json",
      "cache-control": "no-store",
      ...corsHeaders(),
    },
  });
}
