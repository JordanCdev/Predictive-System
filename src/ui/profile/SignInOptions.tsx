/**
 * The signed-out half of the Account card: the two ways in.
 *
 * Google sits first because it is one click for the people who have it, and the
 * email link sits beside it — not behind a "more options" disclosure — because
 * for a large share of this app's intended audience it is the ONLY way in, and
 * hiding it would read as "no account for you". Neither is described as the
 * fallback for the other.
 *
 * Deliberately dumb: every piece of state lives in AuthContext, so this renders
 * the same whether it is reached from the profile page or from onboarding.
 */
import { FormEvent, useState } from "react";
import { useAuth } from "./AuthContext.tsx";
import { looksLikeEmail } from "./signInLink.ts";

export function SignInOptions({ compact = false }: { compact?: boolean }) {
  const { signIn, sendLink, linkSentTo } = useAuth();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!looksLikeEmail(email) || busy) return;
    setBusy(true);
    try {
      await sendLink(email.trim());
    } finally {
      setBusy(false);
    }
  };

  // The confirmation replaces the form rather than sitting under it: leaving a
  // filled-in form beside "check your inbox" invites a second send that
  // invalidates the link the user is about to click.
  if (linkSentTo) {
    return (
      <div style={{ fontSize: 13, lineHeight: 1.55 }}>
        <b>Check your inbox.</b>{" "}
        <span style={{ color: "var(--muted)" }}>
          A sign-in link is on its way to {linkSentTo}. It works once, and only for that address — open it on this device
          and you're straight in.
        </span>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 10, maxWidth: compact ? "none" : 300 }}>
      <button className="btn" onClick={signIn}>Sign in with Google</button>
      <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--muted)", fontSize: 12 }}>
        <span style={{ flex: 1, height: 1, background: "var(--line, rgba(128,128,128,.28))" }} />
        or
        <span style={{ flex: 1, height: 1, background: "var(--line, rgba(128,128,128,.28))" }} />
      </div>
      <form onSubmit={submit} style={{ display: "grid", gap: 8 }}>
        <label htmlFor="signin-email" style={{ fontSize: 12.5, color: "var(--muted)" }}>
          Sign in with your email — no password to remember
        </label>
        <input
          id="signin-email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <button className="btn-ghost" type="submit" disabled={!looksLikeEmail(email) || busy}>
          {busy ? "Sending…" : "Email me a sign-in link"}
        </button>
      </form>
    </div>
  );
}

/**
 * Shown when this page load IS a sign-in link but the address isn't remembered
 * — i.e. the link was opened somewhere other than where it was requested.
 *
 * Asking again is the security property, not friction: possession of the link
 * must not be sufficient on its own, or a forwarded or intercepted email would
 * be a full account takeover. The copy says why, so being asked doesn't read as
 * the app having lost something.
 */
export function CompleteSignIn() {
  const { completeLink } = useAuth();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!looksLikeEmail(email) || busy) return;
    setBusy(true);
    try {
      await completeLink(email.trim());
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} style={{ display: "grid", gap: 8, maxWidth: 340 }}>
      <div style={{ fontSize: 13, lineHeight: 1.55 }}>
        <b>Confirm your email to finish signing in.</b>{" "}
        <span style={{ color: "var(--muted)" }}>
          You opened this link on a different device or browser from the one that asked for it, so we check the address
          before using it — a sign-in link on its own is never enough.
        </span>
      </div>
      <input
        id="complete-email"
        type="email"
        autoComplete="email"
        placeholder="you@example.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <button className="btn" type="submit" disabled={!looksLikeEmail(email) || busy}>
        {busy ? "Signing in…" : "Finish signing in"}
      </button>
    </form>
  );
}
