/**
 * Account erasure (UK/EU GDPR Article 17), as a control the user can actually
 * reach — not a "email us and we'll do it by hand" promise.
 *
 * Three decisions worth stating, because each is the opposite of what a default
 * implementation does:
 *
 *  1. **It says what will go, before it goes**, itemised, including that the
 *     browser copy is separate and what happens to it. A destructive control
 *     that summarises itself as "this cannot be undone" tells the user the
 *     stakes but not the scope.
 *  2. **It reports what it could NOT delete.** The AI usage counter cannot be
 *     removed by the client (see eraseAccountData), and a green tick that
 *     silently omits it would be a false claim of erasure — the exact class of
 *     defect the privacy audit found elsewhere in this app.
 *  3. **Local data is offered, not assumed.** Signing out and erasing the
 *     account are different acts, and so is wiping this browser. Someone
 *     deleting a cloud account from a shared laptop may want the local copy
 *     gone too; someone stepping off accounts back to local-only mode very much
 *     does not, and would lose their chart.
 */
import { useState } from "react";
import { useAuth } from "./AuthContext.tsx";
import type { DeleteOutcome } from "./AuthContext.tsx";

const CONFIRM_WORD = "DELETE";

/** What leaves the account, in the user's terms rather than Firestore paths. */
const WHAT_GOES = [
  "Your birth chart and every other person you've saved",
  "Your decision journal, including the notes you typed",
  "Your saved advisor conversations",
  "Your sign-in itself — the account stops existing",
];

export function DeleteAccount({ onLocalWipe }: { onLocalWipe?: () => void }) {
  const { deleteAccount } = useAuth();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [alsoLocal, setAlsoLocal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<DeleteOutcome | null>(null);

  const armed = typed.trim().toUpperCase() === CONFIRM_WORD && !busy;

  const run = async () => {
    if (!armed) return;
    setBusy(true);
    try {
      const res = await deleteAccount();
      setOutcome(res);
      // Only touch the browser copy once the account is genuinely gone —
      // wiping locally after a FAILED delete would leave the user with neither
      // a usable local profile nor a deleted account.
      if (res.ok && alsoLocal) onLocalWipe?.();
    } finally {
      setBusy(false);
    }
  };

  if (outcome?.ok) {
    return (
      <div className="card" style={{ padding: 18, marginTop: 12, borderColor: "var(--line)" }}>
        <b style={{ fontSize: 15 }}>Your account is deleted.</b>
        <p style={{ margin: "6px 0 0", fontSize: 13, color: "var(--muted)", lineHeight: 1.55 }}>
          {outcome.deleted?.length ?? 0} stored record{(outcome.deleted?.length ?? 0) === 1 ? "" : "s"} removed, and the
          sign-in with it. {alsoLocal ? "This browser's copy has been cleared too." : "Your data in this browser is untouched — the app keeps working, stored locally, exactly as it did before you had an account."}
        </p>
        {/* Stated plainly rather than omitted. An erasure notice that quietly
            leaves something behind is worse than one that names it. */}
        {outcome.retained && outcome.retained.length > 0 && (
          <div style={{ marginTop: 10, fontSize: 12.5, color: "var(--muted)", lineHeight: 1.55 }}>
            <b>One thing we couldn't remove from here:</b>
            <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
              {outcome.retained.map((r) => (
                <li key={r.path}>{r.reason}</li>
              ))}
            </ul>
          </div>
        )}
        {outcome.failed && outcome.failed.length > 0 && (
          <div className="warn" style={{ marginTop: 10 }}>
            <span aria-hidden="true">⚠</span> {outcome.failed.length} record
            {outcome.failed.length === 1 ? "" : "s"} could not be deleted. Please email us and we'll finish it by hand.
          </div>
        )}
      </div>
    );
  }

  if (!open) {
    return (
      <div style={{ marginTop: 14 }}>
        <button className="btn-text" style={{ paddingLeft: 0, color: "var(--danger, #c0442e)" }} onClick={() => setOpen(true)}>
          Delete my account and everything in it
        </button>
      </div>
    );
  }

  return (
    <div className="card" style={{ padding: 18, marginTop: 12, borderColor: "var(--danger, #c0442e)" }}>
      <b style={{ fontSize: 15 }}>Delete your account</b>
      <p style={{ margin: "6px 0 8px", fontSize: 13, color: "var(--muted)", lineHeight: 1.55 }}>
        This erases everything stored against your account, permanently. It cannot be undone, and we cannot recover it
        for you afterwards. What goes:
      </p>
      <ul style={{ margin: "0 0 10px", paddingLeft: 18, fontSize: 13, color: "var(--muted)", lineHeight: 1.6 }}>
        {WHAT_GOES.map((w) => (
          <li key={w}>{w}</li>
        ))}
      </ul>
      <p style={{ margin: "0 0 12px", fontSize: 13, color: "var(--muted)", lineHeight: 1.55 }}>
        <b>Want a copy first?</b> The export on this page downloads everything as a file you keep — worth doing before
        you delete, not after.
      </p>

      <label style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 13, marginBottom: 12, cursor: "pointer" }}>
        <input type="checkbox" checked={alsoLocal} onChange={(e) => setAlsoLocal(e.target.checked)} style={{ marginTop: 3 }} />
        <span style={{ color: "var(--muted)", lineHeight: 1.5 }}>
          Also clear this browser's copy. Leave this unticked to keep using the app locally without an account — tick it
          if this is a shared or borrowed device.
        </span>
      </label>

      <label htmlFor="confirm-delete" style={{ display: "block", fontSize: 12.5, color: "var(--muted)", marginBottom: 6 }}>
        Type <b>{CONFIRM_WORD}</b> to confirm
      </label>
      <input
        id="confirm-delete"
        type="text"
        autoComplete="off"
        value={typed}
        onChange={(e) => setTyped(e.target.value)}
        style={{ maxWidth: 220 }}
      />

      {outcome?.requiresRecentLogin && (
        <div className="warn" style={{ marginTop: 10 }}>
          <span aria-hidden="true">⚠</span> For your security, Firebase needs a fresh sign-in before deleting an
          account. Please sign out, sign back in, and try again — nothing has been deleted.
        </div>
      )}
      {outcome?.error && (
        <div className="warn" style={{ marginTop: 10 }}>
          <span aria-hidden="true">⚠</span> {outcome.error}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
        <button className="btn" style={{ width: "auto", background: "var(--danger, #c0442e)" }} disabled={!armed} onClick={run}>
          {busy ? "Deleting…" : "Delete my account permanently"}
        </button>
        <button className="btn-ghost" style={{ width: "auto" }} onClick={() => { setOpen(false); setTyped(""); setOutcome(null); }}>
          Cancel
        </button>
      </div>
    </div>
  );
}
