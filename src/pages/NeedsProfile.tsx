import { Link } from "react-router-dom";

/** Shown on personalized pages when no birth profile is set yet. */
export function NeedsProfile({ what }: { what: string }) {
  return (
    <div className="card" style={{ padding: 24, marginTop: 18, textAlign: "center" }}>
      <div className="seal sm" aria-hidden="true" style={{ margin: "0 auto 10px" }}>命</div>
      <h3 style={{ margin: "0 0 6px", fontSize: 16, fontWeight: 600 }}>Add your birth details first</h3>
      <p style={{ margin: "0 auto 14px", fontSize: 14, color: "var(--muted)", maxWidth: 420, lineHeight: 1.55 }}>
        To {what}, set up your chart once — date, time and place of birth. It's stored only in this browser.
      </p>
      <Link className="btn" style={{ maxWidth: 220, margin: "0 auto", display: "inline-block", textDecoration: "none" }} to="/settings/profile">
        Set up my profile
      </Link>
    </div>
  );
}
