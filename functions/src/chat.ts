/**
 * Server-side AI proxy (ROADMAP Phase 6). Holds ANTHROPIC_API_KEY as a secret and
 * relays the browser's Messages-API request to Claude, streaming the response
 * back. The browser still orchestrates the tool loop and runs every engine tool
 * locally — only chat text + small engine tool-results transit the network, and
 * the key is never exposed.
 *
 * Two gates sit in front of the relay:
 *   1. **Auth** — a valid Firebase ID token, so only users of THIS project can
 *      spend the key.
 *   2. **Quota** — the caller's plan allowance, consumed atomically before the
 *      upstream call. This is what makes the key's spend bounded and is the
 *      enforcement point for the Free/Pro split; the browser's copy of the same
 *      limits is presentation only.
 *
 * A *continuation* (a request whose last message carries tool results) is not
 * metered: the engine's tool round-trips belong to the message the user already
 * paid for, and charging per round-trip would meter people for the model's
 * choice to look something up.
 */
import { onRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { getAuth } from "firebase-admin/auth";
import { consumeAiMessage, entitlementFor } from "./entitlements";

const ANTHROPIC_API_KEY = defineSecret("ANTHROPIC_API_KEY");
const REQUIRE_AUTH = (process.env.REQUIRE_AUTH ?? "true") !== "false";

/** Ceiling on what a single request may ask the model to generate, regardless of
 *  what the client sent — a bounded blast radius if the client is tampered with. */
const MAX_TOKENS_CEILING = 2048;

interface AnthropicMessage {
  role: string;
  content: unknown;
}

/** True when the final message is a tool-result turn, i.e. the browser is
 *  continuing a tool loop rather than sending a new user message. */
function isToolContinuation(messages: AnthropicMessage[]): boolean {
  const last = messages[messages.length - 1];
  if (!last || last.role !== "user" || !Array.isArray(last.content)) return false;
  return last.content.some((b) => (b as { type?: string })?.type === "tool_result");
}

export const chat = onRequest(
  { cors: true, secrets: [ANTHROPIC_API_KEY], region: "us-central1", timeoutSeconds: 120 },
  async (req, res) => {
    if (req.method === "OPTIONS") {
      res.status(204).send("");
      return;
    }
    if (req.method !== "POST") {
      res.status(405).json({ error: { message: "Method not allowed" } });
      return;
    }

    // ── gate 1: the caller is a signed-in user of this project ───────────────
    let uid: string | null = null;
    if (REQUIRE_AUTH) {
      const header = req.get("authorization") || "";
      const token = header.startsWith("Bearer ") ? header.slice(7) : "";
      if (!token) {
        res.status(401).json({ error: { message: "Sign in to use the AI advisor." } });
        return;
      }
      try {
        uid = (await getAuth().verifyIdToken(token)).uid;
      } catch {
        res.status(401).json({ error: { message: "Your session has expired — sign in again." } });
        return;
      }
    }

    const body = (req.body ?? {}) as { messages?: AnthropicMessage[]; max_tokens?: number };
    const messages = Array.isArray(body.messages) ? body.messages : [];

    // ── gate 2: the caller's daily allowance ─────────────────────────────────
    if (uid && !isToolContinuation(messages)) {
      const entitlement = await entitlementFor(uid);
      const verdict = await consumeAiMessage(uid, entitlement);
      if (!verdict.allowed) {
        res.status(429).json({
          error: { message: verdict.message ?? "Daily limit reached.", type: "quota_exceeded" },
          quota: { used: verdict.used, limit: verdict.limit, plan: entitlement.planId },
        });
        return;
      }
      res.setHeader("x-quota-remaining", String(verdict.remaining));
      res.setHeader("x-quota-limit", String(verdict.limit));
    }

    const upstream = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY.value(),
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        ...body,
        max_tokens: Math.min(Number(body.max_tokens) || 1024, MAX_TOKENS_CEILING),
      }),
    });

    res.status(upstream.status);
    res.setHeader("content-type", upstream.headers.get("content-type") || "application/json");
    res.setHeader("cache-control", "no-store");

    const reader = upstream.body?.getReader();
    if (!reader) {
      res.end();
      return;
    }
    const decoder = new TextDecoder();
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(decoder.decode(value, { stream: true }));
      }
    } finally {
      res.end();
    }
  },
);
