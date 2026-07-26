/**
 * Transcript rows — what the chat panel actually renders, computed as data.
 *
 * The panel shows the FULL saved conversation, but only a bounded window of it
 * is replayed to the model, and the model answering may change from one turn to
 * the next. Both facts have to be visible in the transcript, at the point they
 * happened, or the panel is quietly lying about what the assistant could see and
 * who was speaking. This module decides where those markers go.
 *
 * It is deliberately pure and structurally typed: it takes the least it can
 * about a turn (who spoke, in what voice) so it can be tested without a DOM,
 * without storage, and without the store's full turn shape.
 */

/** The only thing this module needs to know about a turn. */
export interface TranscriptTurnLike {
  role: "user" | "assistant";
  /** Model id that produced an assistant turn; absent for offline/user turns. */
  model?: string;
  /** "offline" marks the deterministic advisor's answers. */
  source?: string;
}

export type TranscriptRow =
  /** Render turns[index]. */
  | { kind: "turn"; index: number }
  /**
   * Everything above this point is still readable but was NOT sent to the model
   * for the reply that follows.
   */
  | { kind: "boundary"; omittedTurns: number }
  /** The voice changed here: a different model, or to/from the offline advisor. */
  | { kind: "voice"; voice: string; label: string; offline: boolean };

/**
 * A stable key for "who is answering". Two assistant turns with the same voice
 * need no marker between them; a change of voice is exactly what we announce.
 * The offline advisor is a voice like any other, so a conversation that moves
 * between offline and AI reads as one conversation with a note in the middle.
 */
export function turnVoice(turn: TranscriptTurnLike): string | null {
  if (turn.role !== "assistant") return null;
  if (turn.source === "offline") return "offline";
  return turn.model ? `model:${turn.model}` : null;
}

export interface TranscriptOptions {
  /**
   * Index of the first turn that IS being replayed to the model. Turns before it
   * are shown but not sent. `null`/0 means the whole transcript is being sent.
   */
  replayFrom?: number | null;
  /** How many turns fall outside the replay window (0 → no boundary marker). */
  omittedTurns?: number;
  /** Model id → the name a human recognises. Defaults to the raw id. */
  modelLabel?: (id: string) => string;
}

const OFFLINE_LABEL = "the offline advisor";

/**
 * Interleave the turns with the two kinds of marker.
 *
 * Rules, both chosen so a marker only ever appears where something genuinely
 * changed:
 *  - the boundary marker sits immediately above the first replayed turn, and
 *    only when turns were actually omitted;
 *  - a voice marker sits above an assistant turn whose voice differs from the
 *    previous assistant turn's. The FIRST assistant voice gets no marker —
 *    there is nothing to have switched from, and labelling it would imply the
 *    conversation had changed hands when it hadn't.
 */
export function buildTranscriptRows(turns: TranscriptTurnLike[], opts: TranscriptOptions = {}): TranscriptRow[] {
  const label = opts.modelLabel ?? ((id: string) => id);
  const omitted = Math.max(0, Math.min(opts.omittedTurns ?? 0, turns.length));
  // A boundary is only meaningful when something is on both sides of it.
  const boundaryAt = omitted > 0 ? clamp(opts.replayFrom ?? omitted, 0, turns.length) : -1;

  const rows: TranscriptRow[] = [];
  let lastVoice: string | null = null;

  turns.forEach((turn, index) => {
    if (index === boundaryAt && index > 0) rows.push({ kind: "boundary", omittedTurns: omitted });
    const voice = turnVoice(turn);
    if (voice && voice !== lastVoice) {
      if (lastVoice !== null) {
        const offline = voice === "offline";
        rows.push({
          kind: "voice",
          voice,
          offline,
          label: offline ? OFFLINE_LABEL : label(voice.slice("model:".length)),
        });
      }
      lastVoice = voice;
    }
    rows.push({ kind: "turn", index });
  });

  // A boundary that falls past the last turn (everything omitted, nothing left
  // to replay) still needs saying — put it at the end rather than dropping it.
  if (boundaryAt === turns.length && turns.length > 0) rows.push({ kind: "boundary", omittedTurns: omitted });
  return rows;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

/** The sentence shown at the replay boundary. Plain, and never apologetic —
 *  this is a bound on what the model is sent, not something the user lost. */
export function boundaryNote(omittedTurns: number): string {
  const n = omittedTurns;
  return n === 1
    ? "1 earlier message isn't being sent to the model — it's still here to read, and quoting it brings it back."
    : `${n} earlier messages aren't being sent to the model — they're still here to read, and quoting one brings it back.`;
}

/**
 * Shown when the newest exchange ALONE exceeded the replay budget, so it was
 * sent whole rather than trimmed (trimming it would split a tool_use from its
 * tool_result and the request would be rejected).
 *
 * Worth saying out loud rather than leaving as silent internal state: it means
 * that question cost more to ask than a normal one, which is the user's money
 * on a BYOK key. Never apologetic — nothing was lost or degraded.
 */
export function overBudgetNote(): string {
  return "This exchange was long enough to exceed the usual amount sent with a question, so all of it went in one piece — a bigger request than most.";
}

/** The sentence shown where the answering model changed. */
export function voiceNote(label: string, offline: boolean): string {
  return offline ? `switched to ${label} — deterministic, no AI` : `switched to ${label}`;
}

/** A short "3 days ago" for the conversation list. Wall-clock only; never an
 *  engine input. `now` is a parameter so this stays testable. */
export function relativeWhen(then: number, now: number): string {
  const ms = now - then;
  if (!Number.isFinite(ms)) return "";
  if (ms < 0) return "just now";
  const min = Math.floor(ms / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  const wk = Math.floor(day / 7);
  if (day < 365) return `${wk}w ago`;
  return `${Math.floor(day / 365)}y ago`;
}
