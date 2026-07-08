import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Client-side only. The deterministic engine runs entirely in the browser:
// no network access in the calculation path, satisfying the spec's
// "calculators must run with no network access" constraint by construction.
export default defineConfig({
  plugins: [react()],
  base: "./",
  // Honour a host-assigned PORT (e.g. the preview harness) when present.
  server: { port: Number(process.env.PORT) || 5173 },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
  },
});
