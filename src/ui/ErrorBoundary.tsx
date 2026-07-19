import { Component, ErrorInfo, ReactNode } from "react";

/** Every localStorage key holding a birth profile. A bad record in ANY of these
 *  can crash the derived-chart computation, so the recovery button must clear
 *  them all — clearing only the legacy key would leave a corrupt cast in place
 *  and the "reset" would appear to do nothing. */
const PROFILE_KEYS = ["wei_person_v1", "wei_people_v1"];

function resetProfiles() {
  for (const key of PROFILE_KEYS) {
    try {
      localStorage.removeItem(key);
    } catch {
      /* private mode — nothing was persisted to clear */
    }
  }
  location.hash = "#/settings/profile";
  location.reload();
}

/** Last-resort guard: any render error degrades to a recover card (with an option
 *  to clear stored state) instead of a blank white screen. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  override state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  override componentDidCatch(error: Error, info: ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error("Render error:", error, info.componentStack);
  }

  override render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="card" style={{ padding: 24, marginTop: 18, textAlign: "center" }}>
        <div className="seal sm" aria-hidden="true" style={{ margin: "0 auto 10px" }}>易</div>
        <h3 style={{ margin: "0 0 6px", fontSize: 16, fontWeight: 600 }}>Something went wrong</h3>
        <p style={{ margin: "0 auto 14px", fontSize: 14, color: "var(--muted)", maxWidth: 440, lineHeight: 1.55 }}>
          The page hit an unexpected error. Your data is stored only in this browser — clearing it usually fixes a bad
          saved profile.
        </p>
        <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
          <button className="btn" style={{ maxWidth: 200 }} onClick={() => { location.hash = "#/today"; location.reload(); }}>
            Reload
          </button>
          <button
            className="btn-ghost"
            style={{ width: "auto", padding: "10px 16px" }}
            onClick={resetProfiles}
          >
            Reset my profile
          </button>
        </div>
      </div>
    );
  }
}
