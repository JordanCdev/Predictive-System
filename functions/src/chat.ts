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

/**
 * Local-testing escape hatch. Turning it off disables auth AND metering together
 * — quota is keyed on the uid, so with no caller identity there is nothing to
 * meter, and the endpoint becomes an open Claude proxy on the project's key.
 * That coupling is not obvious at the call sites, so it is stated here and
 * logged loudly at cold start; it must never be set on a deployed function.
 */
const REQUIRE_AUTH = (process.env.REQUIRE_AUTH ?? "true") !== "false";
if (!REQUIRE_AUTH) {
  console.warn(
    "SECURITY: REQUIRE_AUTH=false — the chat relay is UNAUTHENTICATED and UNMETERED. " +
      "Local testing only; never deploy with this set.",
  );
}

/** Ceiling on what a single request may ask the model to generate, regardless of
 *  what the client sent — a bounded blast radius if the client is tampered with. */
const MAX_TOKENS_CEILING = 2048;

/**
 * Models this relay will spend the project's key on. The client picks from a
 * menu, but the client is not trusted to define the menu: without this an
 * account holder could name the most expensive model available to the key.
 */
const ALLOWED_MODELS = new Set(["claude-sonnet-5", "claude-haiku-4-5", "claude-opus-4-8"]);
const DEFAULT_MODEL = "claude-sonnet-5";

/**
 * Hard caps on request *size*. The quota counts messages, not tokens, so
 * without these a handful of "free" messages could each carry an enormous input
 * and the tier's real cost would bear no relation to its stated limit.
 */
const MAX_BODY_BYTES = 256 * 1024;
const MAX_MESSAGES = 60;

interface AnthropicMessage {
  role: string;
  content: unknown;
}

/**
 * True when the final message is a tool-result turn, i.e. the browser is
 * continuing a tool loop rather than asking something new.
 *
 * SECURITY: this is a *billing convenience*, not a control. It reads the shape
 * the client sent, and a client can trivially append a fabricated `tool_result`
 * to dodge the message counter. The hard bound is the per-request ceiling in
 * consumeAiMessage(), which counts every call regardless of this verdict.
 */
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

    const body = (req.body ?? {}) as { messages?: AnthropicMessage[]; max_tokens?: number; model?: string };
    const messages = Array.isArray(body.messages) ? body.messages : [];

    // ── gate 2: request shape and size ───────────────────────────────────────
    if (messages.length === 0) {
      res.status(400).json({ error: { message: "No messages supplied." } });
      return;
    }
    if (messages.length > MAX_MESSAGES || Buffer.byteLength(JSON.stringify(body)) > MAX_BODY_BYTES) {
      res.status(413).json({
        error: { message: "That conversation is too long. Start a new chat and ask again." },
      });
      return;
    }

    // ── gate 3: the caller's daily allowance ─────────────────────────────────
    // Every request consumes from the hard ceiling; only a genuine new question
    // consumes a user-facing message. See consumeAiMessage() for why the
    // continuation check can't be the security boundary.
    if (uid) {
      const entitlement = await entitlementFor(uid);
      const verdict = await consumeAiMessage(uid, entitlement, { metered: !isToolContinuation(messages) });
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
        // Never take the model or the generation ceiling on the client's word.
        model: body.model && ALLOWED_MODELS.has(body.model) ? body.model : DEFAULT_MODEL,
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
