import { ReactNode, createContext, useCallback, useContext, useEffect, useState } from "react";
import { firebaseEnabled } from "../../firebase/config.ts";

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
}

const AuthCtx = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [ready, setReady] = useState(!firebaseEnabled); // no Firebase → resolved immediately
  const [error, setError] = useState<string | null>(null);

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
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        setReady(true);
      }
    })();
    return () => unsub();
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

  return <AuthCtx.Provider value={{ enabled: firebaseEnabled, ready, user, signIn, signOut, getIdToken, error }}>{children}</AuthCtx.Provider>;
}

export function useAuth(): AuthValue {
  const v = useContext(AuthCtx);
  if (!v) throw new Error("useAuth must be used within an AuthProvider");
  return v;
}
