import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App.tsx";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

/**
 * Register the offline service worker (production only — in dev it would sit in
 * front of Vite's HMR and serve stale modules). Registered after `load` so it
 * never competes with the first paint, and failures are swallowed: offline
 * support is an enhancement, and an app that refused to start because a worker
 * failed to install would be strictly worse than one without it.
 */
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    // Anchored to Vite's BASE_URL, not the origin root and not import.meta.url:
    // the app is served from a project subpath on GitHub Pages, where "/sw.js"
    // would 404, and import.meta.url would resolve into the hashed /assets/ dir.
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {});
  });
}
