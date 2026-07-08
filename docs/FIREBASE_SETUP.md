# Firebase setup — accounts, cloud profiles, server-side AI

The app runs **fully client-side by default** (birth profile + journal in
`localStorage`, AI chat via BYOK). Firebase is **opt-in**: add your project config
and it lights up Google sign-in, cloud profile sync (Firestore), and a server-side
AI proxy — with the GitHub Pages frontend unchanged. This is what powers ROADMAP
Phases 3 (accounts) and 6 (server AI).

Nothing here is wired to a project in the repo; you provision it once and drop the
config into env. When the config is absent, none of the Firebase code even loads
(it's a separate lazy chunk).

## 1. Create the project + web app

```bash
npm i -g firebase-tools           # or use `npx firebase-tools@latest …`
firebase login
firebase projects:create          # or reuse an existing project
firebase use --add <PROJECT_ID>
firebase apps:create web wei-web  # note the App ID it prints
firebase apps:sdkconfig web <APP_ID>   # prints the config values below
```

## 2. Enable Google sign-in

Firebase console → **Authentication → Sign-in method → Google → Enable**. Under
**Authentication → Settings → Authorized domains**, add your GitHub Pages domain
(e.g. `jordancdev.github.io`) and `localhost`. No separate Google Cloud OAuth app
is needed — Firebase manages it.

## 3. Client config (env)

Copy the SDK config into `.env.local` (all values are public and safe to expose):

```
VITE_FIREBASE_API_KEY=…
VITE_FIREBASE_AUTH_DOMAIN=<project>.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=<project>
VITE_FIREBASE_STORAGE_BUCKET=<project>.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=…
VITE_FIREBASE_APP_ID=…
```

For the **deployed** GitHub Pages build, set these as GitHub Actions repository
variables (Settings → Secrets and variables → Actions → Variables) and pass them
into the `npm run build` step — they're public, so repository *variables* are fine.

## 4. Firestore + security rules

Enable **Firestore** (console → Build → Firestore Database → Create). Every
document lives under `users/{uid}/…` and is private to that user; deploy the rules:

```bash
firebase deploy --only firestore:rules
```

Data model (all under `users/{uid}`):

| Path | Contents |
|---|---|
| `meta/profile` | `{ person }` — the stored birth profile (wired: syncs on sign-in / edit) |
| `journal/{objectiveId:isoDate}` | saved decisions + outcomes (Phase 7 EventOutcome) |
| `goals`, `saved_events`, `saved_reports`, `verification_runs`, `ai_threads` | generic per-user collections; use `listDocs` / `putDoc` / `removeDoc` in `src/firebase/client.ts` |

The **profile** is fully wired: signing in hydrates it from Firestore (or pushes a
local-only profile up on first sign-in), and edits write through. The other
collections have a ready data layer in `src/firebase/client.ts`.

## 5. Server-side AI proxy (Cloud Function)

`functions/` holds a Firebase HTTPS function `chat` that holds the Anthropic key
server-side and streams Claude's response back. It verifies the caller's Firebase
ID token (so only signed-in users of your project can spend the key).

```bash
firebase functions:secrets:set ANTHROPIC_API_KEY   # paste your Anthropic key
cd functions && npm install && cd ..
firebase deploy --only functions
```

Then point the app at the function so the chat routes through it instead of BYOK:

```
VITE_AI_PROXY_URL=https://us-central1-<project>.cloudfunctions.net/chat
```

The browser still runs the whole tool loop locally — only chat text + small engine
tool-results transit the network, and the key never reaches the client. For local
function testing you can set `REQUIRE_AUTH=false` in the function env; leave it on
(the default) in production, and consider enabling **Firebase App Check** too.

## 6. Deploy everything

```bash
firebase deploy --only firestore:rules,functions
# the frontend still deploys to GitHub Pages via .github/workflows/deploy-pages.yml
```

## Privacy

Birth data lives under the signed-in user's `users/{uid}` documents, readable only
by them (rules-enforced). The AI proxy only ever sees the chat text + the derived
chart summary the client sends — never your raw birth date/time/city.
