import { ReactNode, createContext, useCallback, useContext, useEffect, useState } from "react";
import { firebaseEnabled } from "../../firebase/config.ts";
import { cleanedLinkUrl } from "./signInLink.ts";

export interface AuthUser {
  uid: string;
  displayName: string | null;
  email: string | null;
  photoURL: string | null;
}

export interface AuthValue {
  /** True when Firebase is configured (VITE_FIREBASE_* present). */
  enabled: boolean;
  /** False until the first auth state has resolved. */
  ready: boolean;
  user: AuthUser | null;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  /** The signed-in user's Firebase ID token (for the server-side AI proxy), or null. */
  getIdToken: () => Promise<string | null>;
  error: string | null;
  /** Email a passwordless sign-in link to this address. */
  sendLink: (email: string) => Promise<void>;
  /** The address a link was just sent to, so the UI can say where to look. */
  linkSentTo: string | null;
  /**
   * True when this page load IS a sign-in link but the address isn't remembered
   * — the link was opened in a different browser. The user must name the address
   * before it can be redeemed; that check is what stops a leaked link from
   * signing anyone in.
   */
  needsLinkEmail: boolean;
  /** Redeem the sign-in link in the current URL for this address. */
  completeLink: (email: string) => Promise<void>;
}

const AuthCtx = createContext<AuthValue | null>(null);

/**
 * Take the redeemed sign-in parameters back out of the address bar, so a refresh
 * doesn't retry a code the server has already burned. replaceState also keeps
 * the code out of the history entry and out of anything that later reads
 * location.href. The decision of what to strip lives in signInLink.ts; this is
 * only the part that touches the browser.
 */
function stripLinkParams() {
  try {
    const next = cleanedLinkUrl(window.location.href);
    if (next) window.history.replaceState(null, "", next);
  } catch {
    /* leaving the URL alone is survivable; throwing here is not */
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [ready, setReady] = useState(!firebaseEnabled); // no Firebase → resolved immediately
  const [error, setError] = useState<string | null>(null);
  const [linkSentTo, setLinkSentTo] = useState<string | null>(null);
  const [needsLinkEmail, setNeedsLinkEmail] = useState(false);

  useEffect(() => {
    if (!firebaseEnabled) return;
    let unsub = () => {};
    (async () => {
      try {
        const m = await import("../../firebase/client.ts");
        unsub = m.watchAuth((u) => {
          setUser(u ? { uid: u.uid, displayName: u.displayName, email: u.email, photoURL: u.photoURL } : null);
          setReady(true);
        });
        // Arriving on a sign-in link: redeem it silently when this browser is the
        // one that asked for it, otherwise surface the "which address?" prompt.
        if (m.isEmailLink(window.location.href)) {
          // The link returns to the app's base path (see linkReturnUrl), which
          // under HashRouter is the landing page — and the landing page has
          // nowhere to show a "confirm your address" prompt, so a link opened in
          // another browser would strand the user on a page that looks like
          // nothing happened. Route to the account card first, then redeem.
          if (!window.location.hash.startsWith("#/profile")) window.location.hash = "#/profile";
          const remembered = m.pendingLinkEmail();
          if (remembered) {
            try {
              await m.completeEmailLink(window.location.href, remembered);
            } catch (e) {
              setError(e instanceof Error ? e.message : String(e));
            } finally {
              stripLinkParams();
            }
          } else {
            setNeedsLinkEmail(true);
          }
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        setReady(true);
      }
    })();
    return () => unsub();
  }, []);

  const sendLink = useCallback(async (email: string) => {
    setError(null);
    setLinkSentTo(null);
    try {
      const m = await import("../../firebase/client.ts");
      await m.sendSignInLink(email);
      setLinkSentTo(email);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  const completeLink = useCallback(async (email: string) => {
    setError(null);
    try {
      const m = await import("../../firebase/client.ts");
      await m.completeEmailLink(window.location.href, email);
      setNeedsLinkEmail(false);
      stripLinkParams();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  const signIn = useCallback(async () => {
    setError(null);
    try {
      const m = await import("../../firebase/client.ts");
      await m.signInWithGoogle();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  const signOut = useCallback(async () => {
    try {
      const m = await import("../../firebase/client.ts");
      await m.signOutUser();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  const getIdToken = useCallback(async () => {
    if (!firebaseEnabled) return null;
    try {
      const m = await import("../../firebase/client.ts");
      return await m.getIdToken();
    } catch {
      return null;
    }
  }, []);

  return (
    <AuthCtx.Provider
      value={{ enabled: firebaseEnabled, ready, user, signIn, signOut, getIdToken, error, sendLink, linkSentTo, needsLinkEmail, completeLink }}
    >
      {children}
    </AuthCtx.Provider>
  );
}

export function useAuth(): AuthValue {
  const v = useContext(AuthCtx);
  if (!v) throw new Error("useAuth must be used within an AuthProvider");
  return v;
}
