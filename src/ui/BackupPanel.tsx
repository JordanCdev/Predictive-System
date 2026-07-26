/**
 * "Back up your data" — download everything this app knows about you as a single
 * JSON file, and restore it later or on another device.
 *
 * FREE for everyone, deliberately: portability is a right, and losing your data
 * is not a paid feature. No plan gate, no upgrade prompt.
 *
 * The panel takes no props — it reads and writes storage itself through the pure
 * helpers in backup.ts, so it can be dropped anywhere on the profile page.
 */
import { ChangeEvent, CSSProperties, useRef, useState } from "react";
import { firebaseEnabled } from "../firebase/config.ts";
import {
  ApplySummary,
  BackupFile,
  BackupMode,
  BackupSummary,
  MAX_BACKUP_BYTES,
  applyBackup,
  describeApply,
  downloadBackup,
  parseBackup,
} from "./backup.ts";
import { loadReflections } from "./journalStore.ts";

const box: CSSProperties = {
  border: "1px solid var(--hairline)",
  borderRadius: 10,
  padding: "10px 12px",
  background: "var(--surface-1)",
};

function prettyDate(iso: string | null): string {
  if (!iso) return "unknown date";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "unknown date";
  return new Date(t).toLocaleString();
}

export function BackupPanel() {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [pending, setPending] = useState<{ data: BackupFile; summary: BackupSummary } | null>(null);
  const [mode, setMode] = useState<BackupMode>("merge");
  const [confirmReplace, setConfirmReplace] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<ApplySummary | null>(null);
  const [savedAs, setSavedAs] = useState<string | null>(null);

  const reset = () => {
    setPending(null);
    setMode("merge");
    setConfirmReplace(false);
    if (fileRef.current) fileRef.current.value = "";
  };

  const onDownload = () => {
    setError(null);
    try {
      setSavedAs(downloadBackup());
    } catch {
      setSavedAs(null);
      setError("This browser wouldn't start the download. Try again, or use a different browser.");
    }
  };

  const onPick = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Clear the input the moment we have the File in hand. Otherwise a failure
    // below leaves the same filename selected, and re-picking that very file —
    // the obvious thing to try — fires no change event and appears to do nothing.
    e.target.value = "";
    setError(null);
    setDone(null);
    setPending(null);
    setConfirmReplace(false);
    setMode("merge");
    if (!file) return;
    if (file.size > MAX_BACKUP_BYTES) {
      setError("That file is far larger than a Wéi backup should ever be, so it wasn't opened. Check you picked the right file.");
      return;
    }
    let text = "";
    try {
      text = await file.text();
    } catch {
      setError("That file couldn't be read. Try picking it again.");
      return;
    }
    const result = parseBackup(text);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setPending({ data: result.data, summary: result.summary });
  };

  const onApply = () => {
    if (!pending) return;
    const summary = applyBackup(pending.data, mode);
    setDone(summary);
    reset();
    // A restore that isn't followed by a reload does not stick: the rest of the
    // app (the person provider, the priorities panel, the journal page) is still
    // holding the state it loaded at boot, and the next thing any of them writes
    // clobbers what we just put in storage. So the reload is part of the restore,
    // not an optional courtesy — there is no "not now" that leaves a good result.
    // Only skipped when the write failed, because then there is nothing to keep
    // and the user needs to read the error.
    if (!summary.storageError) window.location.reload();
  };

  return (
    <div className="card" style={{ padding: 20, marginTop: 18 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span className="seal sm" aria-hidden="true">存</span>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Back up your data</h3>
      </div>

      <p style={{ margin: "8px 0 12px", fontSize: 13, color: "var(--muted)", lineHeight: 1.5 }}>
        {firebaseEnabled ? (
          <>
            Your people and your decision journal are kept in this browser, and synced to your account when you're signed
            in. A downloaded backup is still worth having — it's the only copy you control, and it's the way to move
            everything to another browser or account.
          </>
        ) : (
          <>
            Everything you've entered — your people and your whole decision journal — is stored{" "}
            <b>only in this browser</b>. There is no cloud copy. If you clear site data, use a private window, or switch
            device, it is gone and cannot be recovered. Downloading a backup is the only protection against that.
          </>
        )}
      </p>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        <button className="btn-ghost" onClick={onDownload}>
          Download a backup
        </button>
        <button className="btn-ghost" onClick={() => fileRef.current?.click()}>
          Restore from a backup
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          onChange={onPick}
          style={{ display: "none" }}
          aria-label="Choose a Wéi backup file to restore"
        />
      </div>

      <p style={{ margin: "8px 0 0", fontSize: 11.5, color: "var(--faint)", lineHeight: 1.45 }}>
        The file is plain JSON containing your saved people, your journal, your daily reflections and your priority
        profile — readable by you, and by anyone you send it to, so keep it somewhere private. Your AI settings and
        API key are never included.
      </p>

      {savedAs && (
        <p style={{ margin: "8px 0 0", fontSize: 12.5, color: "var(--muted)" }} role="status">
          Saved as <b>{savedAs}</b> — check your downloads folder.
        </p>
      )}

      {error && (
        <div style={{ ...box, marginTop: 12, borderColor: "var(--hairline)" }} role="alert">
          <div style={{ fontSize: 13 }}>{error}</div>
          <div style={{ fontSize: 11.5, color: "var(--faint)", marginTop: 4 }}>Nothing on this device was changed.</div>
        </div>
      )}

      {pending && (
        <div style={{ ...box, marginTop: 12 }}>
          <div style={{ fontSize: 13, marginBottom: 6 }}>
            <b>What's in this file</b>
          </div>
          <ul style={{ margin: "0 0 8px", paddingLeft: 18, fontSize: 13, lineHeight: 1.6 }}>
            <li>
              {pending.summary.people} {pending.summary.people === 1 ? "person" : "people"}
            </li>
            <li>
              {pending.summary.journal} journal {pending.summary.journal === 1 ? "entry" : "entries"}
              {pending.summary.journalWithOutcomes > 0 && <> ({pending.summary.journalWithOutcomes} with a logged outcome)</>}
            </li>
            <li>
              {pending.summary.reflections} daily {pending.summary.reflections === 1 ? "reflection" : "reflections"}
            </li>
            <li>{pending.summary.hasPriorities ? "A saved priority profile" : "No priority profile"}</li>
          </ul>
          <div style={{ fontSize: 11.5, color: "var(--faint)", marginBottom: 10 }}>
            Backed up {prettyDate(pending.summary.exportedAt)}
            {pending.summary.appVersion ? ` · app ${pending.summary.appVersion}` : ""}
          </div>

          <fieldset style={{ border: 0, margin: 0, padding: 0 }}>
            <legend style={{ fontSize: 13, fontWeight: 600, padding: 0, marginBottom: 6 }}>How should it be restored?</legend>
            <label style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 13, marginBottom: 8 }}>
              <input
                type="radio"
                name="wei-backup-mode"
                checked={mode === "merge"}
                onChange={() => {
                  setMode("merge");
                  setConfirmReplace(false);
                }}
                style={{ marginTop: 3 }}
              />
              <span>
                <b>Merge</b> (recommended) — add what's in the file to what's already here. Nothing of yours is deleted.
                Where the same record exists in both, the file's copy wins, except that a journal entry with a logged
                outcome is kept over one without, and a person whose birth details differ from yours is added as a new
                person rather than replacing you — so restoring someone else's backup can't overwrite your chart.
              </span>
            </label>
            <label style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 13 }}>
              <input
                type="radio"
                name="wei-backup-mode"
                checked={mode === "replace"}
                onChange={() => {
                  setMode("replace");
                  setConfirmReplace(false);
                }}
                style={{ marginTop: 3 }}
              />
              <span>
                <b>Replace</b> — discard everything currently on this device and keep only the file's contents.{" "}
                <span style={{ color: "var(--muted)" }}>Destructive and not undoable.</span>
              </span>
            </label>
          </fieldset>

          {mode === "replace" && (
            <label style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 12.5, marginTop: 10 }}>
              <input
                type="checkbox"
                checked={confirmReplace}
                onChange={(e) => setConfirmReplace(e.target.checked)}
                style={{ marginTop: 3 }}
              />
              <span>
                I understand this will permanently delete the people, journal entries, daily reflections and priority
                profile currently stored in this browser.
                {pending.summary.reflections === 0 && loadReflections().length > 0 && (
                  <>
                    {" "}
                    <b>This file contains no reflections</b> — replacing will erase the{" "}
                    {loadReflections().length} stored here.
                  </>
                )}
              </span>
            </label>
          )}

          <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
            <button className="btn-ghost" onClick={onApply} disabled={mode === "replace" && !confirmReplace}>
              {mode === "replace" ? "Replace everything" : "Merge into this device"}
            </button>
            <button className="btn-text" onClick={reset}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {done && (
        <div style={{ ...box, marginTop: 12 }} role="status">
          <div style={{ fontSize: 13 }}>{describeApply(done)}</div>
          {done.storageError ? (
            <>
              <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 6 }}>{done.storageError}</div>
              <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                <button className="btn-text" onClick={() => setDone(null)}>
                  Close
                </button>
              </div>
            </>
          ) : (
            <>
              {/* Reached only if the automatic reload didn't happen — the restore
                  isn't safe until the app re-reads storage, so keep pressing. */}
              <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 6 }}>
                Reloading to pick up the restored data. If this page doesn't reload by itself, reload it now — until it
                does, the app is still showing what it loaded when the page opened.
              </div>
              {firebaseEnabled && (
                <div style={{ fontSize: 11.5, color: "var(--faint)", marginTop: 6 }}>
                  If you're signed in, your account's copy may sync back over this after a reload — check your people
                  list before deleting the backup file.
                </div>
              )}
              <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                <button className="btn-ghost" onClick={() => window.location.reload()}>
                  Reload the app
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
