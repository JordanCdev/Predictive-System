import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { Readable } from "node:stream";

/**
 * Dev-only mirror of api/chat.ts (the Vercel Edge relay), so `npm run dev` can
 * serve the AI chat locally without the browser holding a key. The key is read
 * from the environment (typically .env.local, which is gitignored) and never
 * reaches the client. Mounted only on `vite serve`; absent on build/test.
 */
function aiChatDevProxy(apiKey: string | undefined): Plugin {
  return {
    name: "ai-chat-dev-proxy",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use("/api/chat", async (req, res) => {
        const json = (status: number, obj: unknown) => {
          res.statusCode = status;
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify(obj));
        };
        if (req.method === "OPTIONS") {
          res.statusCode = 204;
          res.end();
          return;
        }
        if (req.method !== "POST") return json(405, { error: { message: "Method not allowed" } });
        if (!apiKey) return json(500, { error: { message: "Dev proxy has no ANTHROPIC_API_KEY — add it to .env.local, then restart the dev server." } });

        try {
          const chunks: Buffer[] = [];
          for await (const c of req) chunks.push(c as Buffer);
          const upstream = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
            body: Buffer.concat(chunks).toString("utf8"),
          });
          res.statusCode = upstream.status;
          res.setHeader("content-type", upstream.headers.get("content-type") || "application/json");
          res.setHeader("cache-control", "no-store");
          if (upstream.body) Readable.fromWeb(upstream.body as any).pipe(res);
          else res.end();
        } catch (e) {
          json(502, { error: { message: `Dev proxy upstream error: ${e instanceof Error ? e.message : String(e)}` } });
        }
      });
    },
  };
}

// Client-side only. The deterministic engine runs entirely in the browser:
// no network access in the calculation path, satisfying the spec's
// "calculators must run with no network access" constraint by construction.
// The optional AI chat is the one network path, and it is opt-in.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const apiKey = env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY;
  return {
    plugins: [react(), aiChatDevProxy(apiKey)],
    base: "./",
    // Honour a host-assigned PORT (e.g. the preview harness) when present.
    server: { port: Number(process.env.PORT) || 5173 },
    test: {
      environment: "node",
      include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
    },
  };
});
