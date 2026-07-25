/**
 * Date-token parsing for chat text (pure, unit-tested).
 *
 * The AI advisor is instructed to write every date it names as [YYYY-MM-DD];
 * bare ISO dates are caught too as a fallback. ChatPanel renders each token as
 * a tappable chip linking to that day's full reading (#/day/…), so any date the
 * advisor cites is one tap from the deterministic evidence behind it.
 */

export interface ChatTextSegment {
  kind: "text";
  text: string;
}
export interface ChatDateSegment {
  kind: "date";
  iso: string;
  /** Human-readable form for the chip, e.g. "Wed 14 Oct 2026". */
  display: string;
}
export type ChatSegment = ChatTextSegment | ChatDateSegment;

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** True only for a real calendar date (not just a well-shaped one). */
export function isValidIsoDate(iso: string): boolean {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const t = new Date(Date.UTC(y, mo - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1 && t.getUTCDate() === d;
}

/** "2026-10-14" → "Wed 14 Oct 2026" (deterministic; UTC arithmetic only). */
export function chatDateLabel(iso: string): string {
  const [y, mo, d] = iso.split("-").map(Number);
  const t = new Date(Date.UTC(y, mo - 1, d));
  return `${WEEKDAYS[t.getUTCDay()]} ${d} ${MONTHS[mo - 1]} ${y}`;
}

/**
 * Split chat text into plain-text and date segments. Recognises [YYYY-MM-DD]
 * tokens and bare ISO dates; a bare date embedded in a longer number-ish run
 * (e.g. "v2026-01-013") and any non-existent date are left as plain text.
 */
export function splitDateTokens(text: string): ChatSegment[] {
  const re = /\[(\d{4}-\d{2}-\d{2})\]|(\d{4}-\d{2}-\d{2})/g;
  const out: ChatSegment[] = [];
  let last = 0;
  for (let m = re.exec(text); m !== null; m = re.exec(text)) {
    const iso = m[1] ?? m[2];
    const start = m.index;
    const end = start + m[0].length;
    const bare = m[1] == null;
    const before = start > 0 ? text[start - 1] : "";
    const after = end < text.length ? text[end] : "";
    const embedded = bare && (/[\w-]/.test(before) || /[\w-]/.test(after));
    if (embedded || !isValidIsoDate(iso)) continue; // stays inside the next text slice
    if (start > last) out.push({ kind: "text", text: text.slice(last, start) });
    out.push({ kind: "date", iso, display: chatDateLabel(iso) });
    last = end;
  }
  if (last < text.length) out.push({ kind: "text", text: text.slice(last) });
  if (out.length === 0) out.push({ kind: "text", text });
  return out;
}
