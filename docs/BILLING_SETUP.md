# Billing & plans — setup

How the Free/Pro split is implemented, and what to configure to take payments.

The app works with **none** of this configured: no Firebase, no Stripe, no Cloud
Functions. In that state it runs entirely on `localStorage`, everyone is on Free,
and every upgrade affordance hides itself rather than offering a dead button.
Configure the pieces below only when you want accounts, sync and subscriptions.

---

## 1. The shape of it

| Piece | Where | Role |
|---|---|---|
| Plan catalogue | `src/billing/plans.ts` | **Single source of truth** — limits, features, prices, quota maths. Pure, unit-tested. |
| Generated copy | `functions/src/shared/plans.ts` | Byte-identical copy for the Cloud Functions. Kept honest by `tests/sharedSync.test.ts`. |
| Entitlement state | `src/ui/profile/EntitlementsContext.tsx` | Reads the billing doc, exposes `can(feature)`, `clamp(days)`, `quota`. |
| Paywall UI | `src/ui/billing/UpgradePrompt.tsx` | `<Gate>` and `<UpgradePrompt>` — every gate in the app renders one of these. |
| Checkout / portal | `functions/src/billing.ts` | Stripe Checkout + customer portal + the subscription webhook. |
| AI metering | `functions/src/chat.ts`, `functions/src/entitlements.ts` | Per-user daily message quota, consumed transactionally. |

**The catalogue is copied, not imported.** The functions build has its own
`rootDir` and can't reach into the app tree. After editing `src/billing/plans.ts`:

```bash
npm run sync:shared
```

Skip it and `npm test` fails with a message telling you to run it. That guard
exists because silent drift means a paying user gets metered as Free.

### How AI spend is actually bounded

Two counters live on `users/{uid}/billing/usage`:

- `count` — user-facing **messages**. Only a genuine new question increments it,
  so the browser's tool round-trips don't bill someone for the model deciding to
  look something up. This is the number the UI shows.
- `requests` — **every** upstream call. This is the security boundary.

They're separate because the "is this a tool continuation?" test reads the
message shape the *client* sent, and a client can append a fabricated
`tool_result` to skip the message counter. The request ceiling
(`messages × ROUNDS_PER_MESSAGE`) counts every call regardless of what the
client claims, so spend stays bounded either way. `tests/plans.test.ts` asserts
exactly that attack fails.

Alongside it: the model is allowlisted server-side, `max_tokens` is capped, and
request body size and message count are limited — otherwise "5 free messages"
would say nothing about actual cost. Metering **fails closed**: the transaction
contends on one document, which is precisely what a parallel-request attack
produces, so failing open there would turn the defence into the bypass.

### Where entitlement is decided

The browser's gates are **presentation**. Anything that costs money is decided
server-side, against a Firestore document only the Stripe webhook can write:

```
users/{uid}/billing/subscription   ← webhook writes; client reads (rules enforce this)
users/{uid}/billing/usage          ← chat function writes; client reads
users/{uid}/billing/customer       ← server-only Stripe customer id
stripeCustomers/{customerId}       ← server-only reverse map → uid
```

`firestore.rules` grants the whole user tree in **one** rule with the billing
exclusion inside the same condition — rules are OR'd, so a separate recursive
`allow write` would silently re-open these documents.

---

## 2. Firebase (accounts + sync)

Follow [FIREBASE_SETUP.md](FIREBASE_SETUP.md) first, then deploy the rules:

```bash
firebase deploy --only firestore:rules
```

---

## 3. Stripe

1. Create a product ("Wéi Pro") with **two recurring prices** — monthly and
   yearly. Note both price IDs.
2. Set the function config:

```bash
firebase functions:secrets:set STRIPE_SECRET_KEY       # sk_live_… or sk_test_…
firebase functions:secrets:set STRIPE_WEBHOOK_SECRET   # from step 4
firebase functions:config:set   # (or set params in the console)
```

   The two price IDs are plain params, not secrets:
   `STRIPE_PRICE_PRO_MONTH`, `STRIPE_PRICE_PRO_YEAR`.

3. Deploy:

```bash
npm --prefix functions ci
firebase deploy --only functions
```

4. In the Stripe dashboard add a webhook endpoint pointing at the deployed
   `stripeWebhook` URL, subscribed to:

   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`

   Copy the signing secret into `STRIPE_WEBHOOK_SECRET` and redeploy.

5. Point the app at the functions (repository secrets, used by the Pages deploy):

```
VITE_BILLING_URL=https://us-central1-<project>.cloudfunctions.net/billing
VITE_AI_PROXY_URL=https://us-central1-<project>.cloudfunctions.net/chat
```

### Testing the flow

Use Stripe test mode and the `4242 4242 4242 4242` card. Then:

```bash
stripe listen --forward-to https://us-central1-<project>.cloudfunctions.net/stripeWebhook
```

The UI flips to Pro as soon as the webhook lands — the client subscribes to the
billing document rather than polling, so no reload is needed. `BillingPage`
shows a "waiting for Stripe to confirm" state for up to 15 seconds after the
redirect, then an actionable message if nothing arrived.

---

### Also set

`ALLOWED_ORIGINS` — a comma-separated list of origins Stripe may redirect back
to (e.g. `https://you.github.io`). Unset, the functions accept any https URL;
set, they accept only these. Never set `REQUIRE_AUTH=false` on a deployed
function: it disables authentication **and** metering together (quota is keyed on
the uid), leaving an open Claude proxy on your key.

## 4. Developing against Pro

Entitlements come from Firestore, so without a subscription there's no way to
open a gated screen locally. Use:

```bash
npm run dev:pro          # VITE_DEV_FORCE_PLAN=pro
```

This is read behind `import.meta.env.DEV`, which Vite statically replaces with
`false` in a production build — the branch is dead-code-eliminated and can never
grant Pro to a real user.

---

## 5. What is and isn't gated

The rule the plan is built on: **paid tiers buy range, breadth and storage —
never the correctness, transparency or honesty of a reading.** A free user sees
the same deterministic score, the same declared conventions, the same conflicts
between schools and the same disclaimers as a subscriber.

Free keeps: every daily/weekly/monthly reading in full, the current year's
forecast month by month, a 60-day date search, one chart, the decision journal
(10 entries, and logging outcomes is never metered — it's the feedback loop),
and 5 AI messages a day.

Pro adds: a five-year search horizon, any year past or future, the 大運 decade
scrubber, up to six charts, group date-finding, calendar/report export, the full
reasoning dossier, and 200 AI messages a day.

`tests/plans.test.ts` asserts the free tier keeps a usable window, at least one
profile, some journal history and some AI allowance — so a future gate can't
quietly hollow it out.

### Downgrades never delete

Cancelling parks the overflow; it doesn't erase it. Extra people stay in storage
and are simply not used (`allowedPeople()` keeps the *active* person, so the app
never ends up reading a stranger's chart), and journal entries beyond the free
cap are retained and just block new additions. Resubscribing restores everything.
The pricing page states this, so the code has to honour it.
