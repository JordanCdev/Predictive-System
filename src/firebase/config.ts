/**
 * Firebase web config, read from VITE_FIREBASE_* env (all values are public — the
 * web apiKey is an identifier, not a secret; access is controlled by Firestore
 * security rules + Auth). When apiKey + projectId are present the app enables
 * accounts / Google login / cloud profile sync; otherwise it runs fully
 * client-side on localStorage exactly as before. No firebase import here, so this
 * module is safe in the base bundle.
 */
export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY ?? "",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ?? "",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID ?? "",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET ?? "",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? "",
  appId: import.meta.env.VITE_FIREBASE_APP_ID ?? "",
};

/** True when enough config is present to initialise Firebase. */
export const firebaseEnabled = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId);
