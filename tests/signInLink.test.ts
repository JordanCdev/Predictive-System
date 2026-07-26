import { describe, expect, it } from "vitest";
import { PENDING_EMAIL_TTL_MS, cleanedLinkUrl, looksLikeEmail, readPendingEmail } from "../src/ui/profile/signInLink.ts";
import { EXCLUDED_KEYS } from "../src/ui/backup.ts";

const BASE = "https://example.github.io/Predictive-System/";
const LINK = `${BASE}?apiKey=AIzaKEY&mode=signIn&oobCode=CODE123&continueUrl=${encodeURIComponent(BASE)}&lang=en`;

describe("cleanedLinkUrl", () => {
  it("removes every sign-in parameter Firebase appends", () => {
    const out = cleanedLinkUrl(LINK)!;
    expect(out).toBeTruthy();
    for (const k of ["apiKey", "mode", "oobCode", "continueUrl", "lang"]) expect(out).not.toContain(k);
    expect(out).toBe("/Predictive-System/");
  });

  it("is idempotent — a cleaned URL has nothing left to strip", () => {
    // The guard that stops us pushing a pointless history entry on every load.
    expect(cleanedLinkUrl(`${BASE}#/profile`)).toBeNull();
  });

  it("keeps the hash, because under HashRouter it is the route", () => {
    // Dropping it would bounce the user to the landing page mid-sign-in.
    expect(cleanedLinkUrl(`${LINK}#/profile`)).toBe("/Predictive-System/#/profile");
  });

  it("keeps unrelated query parameters", () => {
    // ?start=1 drives onboarding; a sign-in cleanup must not silently cancel it.
    expect(cleanedLinkUrl(`${BASE}?start=1&mode=signIn&oobCode=C`)).toBe("/Predictive-System/?start=1");
  });

  it("returns null for a URL it cannot parse rather than throwing", () => {
    expect(cleanedLinkUrl("not a url")).toBeNull();
  });
});

describe("looksLikeEmail", () => {
  it("accepts the real addresses a stricter regex would reject", () => {
    for (const ok of ["a@b.co", "jordan+wei@example.com", "x.y@sub.domain.travel", "  padded@mail.com  "]) {
      expect(looksLikeEmail(ok), ok).toBe(true);
    }
  });

  it("rejects what the user can still fix before we spend a send", () => {
    for (const bad of ["", "   ", "nope", "no@domain", "@example.com", "a b@c.com", "two@at@c.com"]) {
      expect(looksLikeEmail(bad), JSON.stringify(bad)).toBe(false);
    }
  });
});

describe("the pending sign-in address expires", () => {
  // An address typed into a sign-in that was never completed is personal data
  // whose purpose has lapsed. It must not sit in localStorage forever, and
  // "expired" has to mean deleted, not hidden.
  const at = 1_800_000_000_000;
  const mk = (email: string, when: number) => JSON.stringify({ email, at: when });

  it("returns a fresh address", () => {
    expect(readPendingEmail(at + 1000, mk("a@b.com", at))).toEqual({ email: "a@b.com", expired: false });
  });

  it("treats an address older than the TTL as gone", () => {
    const r = readPendingEmail(at + PENDING_EMAIL_TTL_MS + 1, mk("a@b.com", at));
    expect(r.email).toBeNull();
    expect(r.expired).toBe(true);
  });

  it("expires the legacy bare-string format rather than trusting it forever", () => {
    // Values written before the expiry existed carry no timestamp, so they can
    // never be shown to be fresh — the safe reading is expired.
    const r = readPendingEmail(at, "a@b.com");
    expect(r.email).toBeNull();
    expect(r.expired).toBe(true);
  });

  it("does not report an absent value as expired", () => {
    // Nothing stored is not the same as something stale — only the latter
    // should trigger a removal.
    expect(readPendingEmail(at, null)).toEqual({ email: null, expired: false });
  });

  it("expires malformed values instead of throwing", () => {
    for (const bad of ["{", "{}", '{"email":123,"at":1}', '{"email":"a@b.com"}']) {
      expect(readPendingEmail(at, bad).expired, bad).toBe(true);
    }
  });
});

describe("the pending sign-in address", () => {
  it("never travels in a backup", () => {
    // It is PII, it is useless on the machine restoring it, and it is written by
    // a flow that has no other reason to touch the backup surface — exactly the
    // combination that gets forgotten.
    expect(EXCLUDED_KEYS).toContain("wei_signin_email");
  });
});
