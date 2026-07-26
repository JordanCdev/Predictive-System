/**
 * The pure parts of email-link sign-in, split out so they can be tested without
 * Firebase, a DOM, or a live oobCode.
 *
 * Both functions here guard a real failure, not a style preference:
 *  - `cleanedLinkUrl` stops a single-use code being replayed on refresh;
 *  - `looksLikeEmail` stops us burning a send on an obvious typo, where the only
 *    other feedback the user gets is an email that never arrives.
 */

/** Parameters Firebase appends to the return URL when it redirects back. */
const LINK_PARAMS = ["mode", "oobCode", "apiKey", "continueUrl", "lang", "tenantId"] as const;

/**
 * The current URL with the sign-in parameters removed, or `null` when there is
 * nothing to remove.
 *
 * An oobCode is SINGLE USE. Left in the address bar it gets retried on the next
 * refresh or restored tab, and the server — correctly — rejects it, so the user
 * is told their link is invalid moments after it worked. Returning null rather
 * than the unchanged href lets the caller skip a history entry it doesn't need.
 *
 * The hash is preserved: under HashRouter it holds the route the user should be
 * looking at, and dropping it would bounce them to the landing page mid-sign-in.
 */
export function cleanedLinkUrl(href: string): string | null {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }
  if (!LINK_PARAMS.some((k) => url.searchParams.has(k))) return null;
  for (const k of LINK_PARAMS) url.searchParams.delete(k);
  return url.pathname + url.search + url.hash;
}

/**
 * A deliberately loose shape check — enough to catch a missing @ or a trailing
 * comma before we spend a send. It is NOT validation: the address is proven by
 * the link arriving, and anything stricter starts rejecting real addresses
 * (plus-tags, long TLDs, unicode domains) for no gain.
 */
export function looksLikeEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
}

/** How long a remembered sign-in address stays useful. Roughly the practical
 *  lifetime of the emailed link — outliving it serves nobody. */
export const PENDING_EMAIL_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Decide whether a stored sign-in address is still live.
 *
 * An address typed into a sign-in that was never completed — a mistyped domain,
 * a link that never arrived, a change of mind — is personal data whose purpose
 * has lapsed, and without an expiry it sits in localStorage indefinitely.
 * `expired: true` is the caller's instruction to DELETE it, not merely to
 * ignore it: hiding a value that is still on disk fixes nothing.
 *
 * Lives here rather than beside the Firebase calls so it can be tested without
 * pulling the SDK into a node test run.
 */
export function readPendingEmail(now: number, raw: string | null): { email: string | null; expired: boolean } {
  if (!raw) return { email: null, expired: false };
  try {
    const v = JSON.parse(raw) as { email?: unknown; at?: unknown };
    if (typeof v?.email !== "string" || typeof v?.at !== "number") return { email: null, expired: true };
    if (now - v.at > PENDING_EMAIL_TTL_MS) return { email: null, expired: true };
    return { email: v.email, expired: false };
  } catch {
    // A bare string: the pre-expiry format. It carries no timestamp, so it can
    // never be shown to be fresh — treat it as expired rather than trusting it
    // forever, and the upgrade costs one re-typed address at most.
    return { email: null, expired: true };
  }
}
