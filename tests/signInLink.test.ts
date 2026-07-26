import { describe, expect, it } from "vitest";
import { cleanedLinkUrl, looksLikeEmail } from "../src/ui/profile/signInLink.ts";
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

describe("the pending sign-in address", () => {
  it("never travels in a backup", () => {
    // It is PII, it is useless on the machine restoring it, and it is written by
    // a flow that has no other reason to touch the backup surface — exactly the
    // combination that gets forgotten.
    expect(EXCLUDED_KEYS).toContain("wei_signin_email");
  });
});
