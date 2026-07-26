import { useEffect, useRef, useState } from "react";
import { relativeWhen } from "./transcript.ts";

/**
 * The saved-conversations list.
 *
 * Structurally typed on purpose: it needs an id, something to call the thread,
 * and when it last moved. Keeping it to that means the store owns the thread
 * shape and this component stays a list.
 */
export interface ThreadListItem {
  id: string;
  title: string;
  /** Epoch ms of the last turn. Wall-clock only — never an engine input. */
  updatedAt: number;
  /** Pinned conversations survive the storage cap. Only ever set by the user. */
  pinned?: boolean;
}

/**
 * A collapsible disclosure rather than a sidebar: the chat panel sits inside a
 * page column that is one hand wide on a phone, and a permanent list there would
 * push the conversation itself off the screen. Closed it is a single line naming
 * the conversation you are in, which is also the point — it makes the fact that
 * conversations are KEPT visible without spending any space on it.
 */
export function ThreadList({
  threads,
  activeId,
  onSelect,
  onRename,
  onPin,
  onDelete,
  onNew,
  deletePrompt = "Delete for good?",
  deleteHint,
  now = Date.now(),
}: {
  threads: ThreadListItem[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onRename: (id: string, title: string) => void;
  /** Pin/unpin. The storage cap never removes a pinned conversation, and the
   *  pruning note says so — so the control that makes that promise usable has to
   *  exist somewhere the user can reach it. */
  onPin: (id: string, pinned: boolean) => void;
  onDelete: (id: string) => void;
  onNew: () => void;
  /**
   * What deleting actually does, in the caller's words — short enough to sit on
   * the row. Injected because only the panel knows whether an account holds a
   * second copy: "Delete for good?" is a promise this component cannot keep on
   * its own.
   */
  deletePrompt?: string;
  /** The longer version of the same fact, for the Delete button's tooltip. */
  deleteHint?: string;
  /** Injectable clock so the relative dates are testable and stable in stories. */
  now?: number;
}) {
  const [open, setOpen] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [confirming, setConfirming] = useState<string | null>(null);
  const renameRef = useRef<HTMLInputElement>(null);

  // Closing the list must not leave a half-finished rename or an armed delete
  // waiting to fire the next time it is opened.
  useEffect(() => {
    if (!open) {
      setRenaming(null);
      setConfirming(null);
    }
  }, [open]);

  useEffect(() => {
    if (renaming) renameRef.current?.focus();
  }, [renaming]);

  const active = threads.find((t) => t.id === activeId) ?? null;
  const commitRename = (id: string) => {
    const next = draft.trim();
    // An empty name isn't a name. Leave the old one rather than showing "Untitled".
    if (next) onRename(id, next);
    setRenaming(null);
  };

  return (
    <div className="chat-threadbar">
      <details className="chat-threads" open={open} onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}>
        <summary>
          <span className="chat-threads-current">{active ? active.title : "New conversation"}</span>
          <span className="chat-threads-count">
            {threads.length === 1 ? "1 saved" : `${threads.length} saved`}
          </span>
        </summary>
        <ul className="chat-thread-list">
          {threads.map((t) => {
            const on = t.id === activeId;
            if (renaming === t.id) {
              return (
                <li className={`chat-thread-row${on ? " on" : ""}`} key={t.id}>
                  <input
                    ref={renameRef}
                    className="chat-thread-rename"
                    value={draft}
                    aria-label={`Rename “${t.title}”`}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitRename(t.id);
                      if (e.key === "Escape") setRenaming(null);
                    }}
                  />
                  <button className="chat-thread-act" onClick={() => commitRename(t.id)}>Save</button>
                  <button className="chat-thread-act" onClick={() => setRenaming(null)}>Cancel</button>
                </li>
              );
            }
            return (
              <li className={`chat-thread-row${on ? " on" : ""}`} key={t.id}>
                <button
                  className="chat-thread-open"
                  aria-current={on ? "true" : undefined}
                  onClick={() => {
                    onSelect(t.id);
                    setOpen(false);
                  }}
                >
                  {t.title}
                  <span className="when">
                    {t.pinned ? "pinned · " : ""}
                    {relativeWhen(t.updatedAt, now)}
                  </span>
                </button>
                <span
                  className="chat-thread-acts"
                  // The confirmation can be a sentence rather than two words (it
                  // has to say what delete actually reaches), so let it wrap
                  // instead of pushing the row sideways.
                  style={confirming === t.id ? { flexWrap: "wrap", justifyContent: "flex-end", maxWidth: "100%" } : undefined}
                >
                  {confirming === t.id ? (
                    <>
                      <span style={{ fontSize: 11.5, color: "var(--muted)" }}>{deletePrompt}</span>
                      <button
                        className="chat-thread-act danger"
                        onClick={() => {
                          setConfirming(null);
                          onDelete(t.id);
                        }}
                      >
                        Delete
                      </button>
                      <button className="chat-thread-act" onClick={() => setConfirming(null)}>Keep</button>
                    </>
                  ) : (
                    <>
                      <button
                        className="chat-thread-act"
                        aria-pressed={t.pinned === true}
                        aria-label={
                          t.pinned
                            ? `Unpin “${t.title}”`
                            : `Pin “${t.title}” so it is kept when older conversations are cleared`
                        }
                        title={
                          t.pinned
                            ? "Pinned conversations are never removed to save space"
                            : "Keep this conversation when older ones are cleared to save space"
                        }
                        onClick={() => {
                          setRenaming(null);
                          setConfirming(null);
                          onPin(t.id, t.pinned !== true);
                        }}
                      >
                        {t.pinned ? "Unpin" : "Pin"}
                      </button>
                      <button
                        className="chat-thread-act"
                        aria-label={`Rename “${t.title}”`}
                        onClick={() => {
                          setDraft(t.title);
                          setConfirming(null);
                          setRenaming(t.id);
                        }}
                      >
                        Rename
                      </button>
                      <button
                        className="chat-thread-act"
                        aria-label={`Delete “${t.title}”`}
                        title={deleteHint}
                        onClick={() => {
                          setRenaming(null);
                          setConfirming(t.id);
                        }}
                      >
                        Delete
                      </button>
                    </>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      </details>
      <button className="btn-text" onClick={onNew}>New chat</button>
    </div>
  );
}
