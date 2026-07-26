# Firebase setup — turning accounts on

**Status: implemented but dormant.** Every line of code for accounts, per-user
Firestore sync, and an ID-token-authenticated AI proxy is already in the repo and
tested. None of it is *running*: no `VITE_FIREBASE_*` values are set locally and
the repository has no Actions secrets, so `firebaseEnabled` (`src/firebase/config.ts`)
evaluates false, the Firebase chunk never loads, and the live GitHub Pages site
shows no sign-in button at all. The app runs fully client-side on `localStorage`.

Activating it needs one thing this repo cannot do for itself: **a human with Google
Cloud / Firebase console access creating a project.** That is the whole blocker.
Everything below is the checklist for the owner doing exactly that, in order.

---

## 0. What to do FIRST — before you switch any of this on

The research on accounts (`docs/RESEARCH_ACCOUNTS_AND_PERSON_PROFILE.md`, question 11
and 12) is blunt about the sequencing: **ship data export/import before you put a
signup wall anywhere.** Requiring an account to keep your data is the pattern that
depresses conversion *and* burns trust; losing data is the thing users actually fear.

Export/import landed in the person-layer phase (Phase 12) and is **free**, deliberately.
So the order is:

1. Export/import exists and is free. ✅ *(done)*
2. Accounts appear as an **optional** upgrade — "keep this across devices" — never a gate.
3. No existing free capability moves behind sign-in when accounts go live.
4. Before cloud storage of profile/journal fields expands, do the DPIA (see §8).

If you find yourself writing "sign in to continue", stop — that is not the plan.

## What changes for users when this is on

| | Off (today) | On |
|---|---|---|
| Where data lives | `localStorage`, this browser only | still local, **plus** a private `users/{uid}` mirror |
| Lose your browser | data is gone unless you exported | sign in again, data returns |
| Second device | re-enter or import a file | signs in, everything is there |
| Subscriptions | Pro entitlement can't be restored | entitlement is attached to the account and restorable |
| AI chat | BYOK — visitor pastes their own Anthropic key | can route through the server proxy, key held server-side |
| Privacy story | "nothing leaves your device" | "nothing leaves your device unless you sign in" |

Note the last row honestly. Accounts weaken the strongest sentence in the product's
privacy story, which is exactly why they stay optional and why the DPIA is a gate.

---

## 1. Create the project + web app

```bash
npm i -g firebase-tools           # or npx firebase-tools@latest …
firebase login
firebase projects:create          # or reuse an existing project
firebase use --add <PROJECT_ID>
firebase apps:create web wei-web  # note the App ID it prints
firebase apps:sdkconfig web <APP_ID>   # prints the six values §4 needs
```

## 2. Enable sign-in

Firebase console → **Authentication → Sign-in method**.

Today the client implements **Google only** (`signInWithGoogle`, `src/firebase/client.ts:55`),
so enabling **Google** is what makes the current build work. Enable it, then under
**Authentication → Settings → Authorized domains** add your GitHub Pages domain
(e.g. `jordancdev.github.io`) and `localhost`. No separate Google Cloud OAuth app is
needed — Firebase manages it.

**Google-only is a private-beta configuration, not a launch configuration.** See §3.

## 3. The auth ladder — recommended, in this order

The research asks whether Google-only is acceptable for the target markets (UK, SE Asia,
the Chinese diaspora). The honest answer is **no, not for a general consumer launch**:
Google account penetration is uneven across exactly those markets, Google services are
inaccessible in mainland China, and a single-provider wall turns "try the app" into
"acquire a Google account". It is fine while the audience is people you invited.

The recommended ladder, each rung earning its place before the next:

| Rung | What | Why here | Cost to add |
|---|---|---|---|
| **0. Guest** | No account. Everything works, data is local, export/import is the safety net. | This is the app's default state and must stay usable forever. Accounts are additive. | Already shipped |
| **1. Email link (passwordless)** | Firebase `signInWithEmailLink`. Type an email, click the link. | Widest possible reach with no password to store, reset, breach, or support. Works in every market. Should be the **first** provider added, ahead of any social login. | Small: one client method, one route to catch the link, plus authorized-domain config |
| **2. Google** | `signInWithPopup` — already implemented. | One tap for the large share of users who do have Google; keep it as a convenience path, never the only door. | Done |
| **3. Passkeys** | WebAuthn, via Firebase's passkey support or an identity provider that fronts it. | The direction of travel for consumer auth: no shared secret, phishing-resistant, and the platform UX (Face ID / fingerprint) reads as *less* friction than a password, not more. Add once rungs 1–2 are stable. | Medium |
| **4. Apple** | Sign in with Apple. | **Defer.** Apple's requirement to offer it bites when you ship a **native app** with third-party sign-in; a web-only PWA does not trigger it. Adding it costs an Apple Developer Program membership and a service-ID setup for no reach we don't already have via email link. Revisit if and when a native app is on the table. | Deferred |

Two rules that survive whatever you pick:
- **Never remove the guest path.** Rung 0 is the product; rungs 1+ are conveniences.
- **Account merge is a real feature, not an edge case.** A user with different local
  data on two devices who signs in on both must not silently lose one side. Design the
  merge (or at minimum a "we found two versions" prompt) before rung 1 ships.

## 4. Client config (env) — the six values

`firebase apps:sdkconfig` prints these. All six are **public** — the web `apiKey` is a
project identifier, not a secret; access control is Firestore rules + Auth.

For **local testing**, copy them into `.env.local` (gitignored):

```
VITE_FIREBASE_API_KEY=…
VITE_FIREBASE_AUTH_DOMAIN=<project>.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=<project>
VITE_FIREBASE_STORAGE_BUCKET=<project>.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=…
VITE_FIREBASE_APP_ID=…
```

Then `npm run dev` and check §7.

For the **deployed** GitHub Pages build, add them as GitHub Actions **repository secrets**
(Settings → Secrets and variables → Actions → **Secrets** → New repository secret). The
deploy workflow already reads exactly these names and passes them into `npm run build` —
verified against `.github/workflows/deploy-pages.yml`:

```
VITE_FIREBASE_API_KEY
VITE_FIREBASE_AUTH_DOMAIN
VITE_FIREBASE_PROJECT_ID
VITE_FIREBASE_STORAGE_BUCKET
VITE_FIREBASE_MESSAGING_SENDER_ID
VITE_FIREBASE_APP_ID
VITE_AI_PROXY_URL     # optional — the deployed chat function; unset → BYOK chat
VITE_BILLING_URL      # optional — the deployed billing function; unset → free-only
```

No workflow edit is required. They are secrets rather than repository *variables* only to
keep the project identifiers out of the public source tree — the workflow header says so.
Leaving any of them unset stays a supported configuration: the build succeeds and the app
runs local-only.

⚠️ Add **all six or none.** A partial set makes `firebaseEnabled` true with a broken
config, which is worse than off.

## 5. Firestore + security rules

Enable **Firestore** (console → Build → Firestore Database → Create database). Then deploy
the rules that are already in the repo — do not skip this, the default rules are wrong for us:

```bash
firebase deploy --only firestore:rules
```

`firestore.rules` grants read/write under `users/{uid}/…` to that user only, **except**
`users/{uid}/billing` (now just the AI usage meter), which is read-only to the user and
written solely by the chat function via the Admin SDK (which bypasses rules). Everything
outside `users/{uid}` is denied.

Data model, all under `users/{uid}` (see `src/firebase/client.ts`):

| Path | Contents |
|---|---|
| `meta/people` | `{ people, activeId }` — the cast of birth profiles (**this is the doc to look for in §7**) |
| `meta/profile` | `{ person }` — the legacy single profile |
| `meta/journal` | `{ entries }` — saved decisions + outcomes |
| `billing/usage` | the AI usage meter (the daily abuse bound) — **server-written only** |
| `goals`, `saved_events`, `saved_reports`, `verification_runs`, `ai_threads` | generic per-user collections with a ready data layer (`listDocs`/`putDoc`/`removeDoc`) |

## 6. Server-side AI proxy (optional, later)

`functions/` holds one HTTPS function: `chat` (holds the Anthropic key server-side,
verifies the caller's Firebase ID token, meters usage against the daily abuse bound).
It is not required for accounts to work.

```bash
firebase functions:secrets:set ANTHROPIC_API_KEY
cd functions && npm install && cd ..
firebase deploy --only functions
```

Then set `VITE_AI_PROXY_URL=https://us-central1-<project>.cloudfunctions.net/chat`.
The browser still runs the whole tool loop locally; only chat text + small engine
tool-results transit the network.
`REQUIRE_AUTH=false` exists for local function testing — leave it on in production, and
consider enabling **Firebase App Check** too.

## 7. Confirm it actually worked

In order. Each step tells you which of the previous ones failed.

1. **Config loaded.** Open the app → **Profile**. If §4 worked you now see a
   "**Sign in with Google**" button (`src/pages/ProfilePage.tsx:61`). No button ⇒
   `firebaseEnabled` is false ⇒ one of the six values is missing or misspelt. On the
   deployed site, re-run the deploy workflow after adding the secrets — secrets are read
   at build time, not at page load.
2. **Auth works.** Click it; the Google popup completes and the page shows your account.
   `auth/unauthorized-domain` ⇒ §2's authorized-domains list is missing your host.
3. **Firestore works.** With a profile saved, open the Firebase console →
   Firestore → and confirm a document exists at **`users/{your-uid}/meta/people`**
   containing your cast of people and `activeId`. That single document is the proof the
   whole path works: config → auth → rules → write.
4. **Rules work.** Still in the console, use the **Rules Playground** to simulate a read of
   `users/<someone-else-uid>/meta/people` as your uid — it must be **denied**. Simulate a
   write to `users/{your-uid}/billing/usage` as yourself — that must be denied too.
5. **Cross-device.** Sign in on a second browser; the profile hydrates from Firestore.

## 8. Before this expands — the DPIA

A stored profile combining birth date/time/place with stated life priorities, journal text
and outcome ratings may include health, relationship or religious/philosophical signals.
Under UK/EU GDPR that pushes toward special-category data, and the processing is
"large-scale profiling" shaped. **A Data Protection Impact Assessment is a gate on
enabling cloud sync of those fields — not on the local-only app**, which processes nothing
on our servers. Do it between §5 and any expansion of what gets synced. It is recorded as
a deferred item in `docs/ROADMAP.md` Phase 12.

## Privacy

Birth data lives under the signed-in user's `users/{uid}` documents, readable only by them
(rules-enforced). The AI proxy only ever sees the chat text plus the derived chart summary
the client chooses to send — never the raw birth date/time/city. `wei_ai_key` (a BYOK
Anthropic key) is a **secret**: it is never exported, never synced, and must never be
written to Firestore.
