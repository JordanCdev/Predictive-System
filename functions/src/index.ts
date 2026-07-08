/**
 * Server-side AI proxy (ROADMAP Phase 6). A Firebase HTTPS Cloud Function that
 * holds ANTHROPIC_API_KEY as a secret and relays the browser's Messages-API
 * request to Claude, streaming the response back. The browser still orchestrates
 * the tool loop and runs every engine tool locally — only chat text + small
 * engine tool-results transit the network, and the key is never exposed.
 *
 * The client points VITE_AI_PROXY_URL at this function's URL; the existing chat
 * client then routes through it instead of asking the user for a key (BYOK).
 *
 * SECURITY: by default this verifies a Firebase ID token (Authorization: Bearer
 * <token>) so only signed-in users of THIS project can spend the key. Set
 * REQUIRE_AUTH=false to disable during local testing. For production also enable
 * Firebase App Check.
 */
import { onRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

initializeApp();

const ANTHROPIC_API_KEY = defineSecret("ANTHROPIC_API_KEY");
const REQUIRE_AUTH = (process.env.REQUIRE_AUTH ?? "true") !== "false";

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

    // Verify the caller is a signed-in user of this project.
    if (REQUIRE_AUTH) {
      const header = req.get("authorization") || "";
      const token = header.startsWith("Bearer ") ? header.slice(7) : "";
      if (!token) {
        res.status(401).json({ error: { message: "Sign in to use the AI advisor." } });
        return;
      }
      try {
        await getAuth().verifyIdToken(token);
      } catch {
        res.status(401).json({ error: { message: "Your session has expired — sign in again." } });
        return;
      }
    }

    const upstream = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY.value(),
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(req.body),
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
