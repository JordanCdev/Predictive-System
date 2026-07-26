# Data Protection Impact Assessment — Wéi

**Status: WORKING DRAFT. Not signed. Not legal advice.**

Read this first:

- This document was prepared **from the codebase**, by reading the source. Every factual
  claim about what the software does carries a `file:line` citation so it can be checked
  and re-checked when the code changes. If a claim here has no citation, treat it as an
  assertion, not a finding.
- The owner of this project is the **data controller** and is the only person who can sign
  this off. Several things this assessment needs cannot be read out of the repository at
  all (console settings, deployment state, which repository secrets are set). Those are
  recorded as **open questions** (OQ-1 … OQ-23) rather than guessed at. **The document is
  not complete until they are answered.**
- This is **not legal advice**. It is an engineering-grounded description of the processing
  plus a risk assessment, written in the ICO's DPIA structure so a solicitor or the ICO can
  work with it. Have a solicitor review it before relying on it.
- Throughout, **"TODAY"** means what the code does now, and **"RECOMMENDED"** means something
  that has *not* been built. Nothing in the RECOMMENDED column may be read as a control that
  exists.

| | |
|---|---|
| Product | Wéi — deterministic Chinese-metaphysics decision-timing web app |
| Controller | The project owner (sole trader / individual — see §3) |
| Deployment | Static build on GitHub Pages (`.github/workflows/deploy-pages.yml:53-66`) |
| Backend | Firebase project `wei-timing` (`.firebaserc:1-5`) — Auth + Firestore, plus one Cloud Function |
| Trigger date | **2026-07-26** — commit `39b55d9` "Phase 18: accounts are on, and an email address is enough to have one" |
| Draft prepared | 2026-07-26 |
| DPIA status | Draft — unsigned, open questions outstanding |

---

## 1. Identify the need for a DPIA

### 1.1 What changed, and when

Until 2026-07-26 this app processed nothing on any server the owner controlled. All state
lived in the browser's `localStorage`, and the deterministic engine ran entirely client-side
(the only two `fetch()` calls in `src/` are the AI chat request at `src/ai/chatClient.ts:365`
and a JPL Horizons verification call at `src/engine/verification/jplHorizons.ts:97` that no
UI file imports). In that configuration the owner was arguably not a controller of anything.

On **2026-07-26**, commit `39b55d9` turned accounts on: Firebase Authentication (Google popup
and passwordless email link — `src/firebase/client.ts:67-69`, `:100-135`) and a per-user
Firestore data layer (`src/firebase/client.ts:145-262`). From that date the owner holds
personal data on infrastructure they control and is a **data controller**.

The project's own documentation had already flagged this exact moment as the gate:
`docs/FIREBASE_SETUP.md:227-235` ("A Data Protection Impact Assessment is a gate on enabling
cloud sync of those fields") and `docs/ROADMAP.md:254-259` ("**The DPIA is now due, not
pending.** … Cloud sync is enabled, so the gate has been reached"). This document is that
DPIA, prepared after the fact.

### 1.2 Article 35 triggers

A DPIA is required under UK GDPR Article 35(1) where processing is "likely to result in a
high risk to the rights and freedoms of natural persons". Article 35(3) lists mandatory
triggers, and the ICO publishes a further list of processing types that always require one.
The assessment against each:

| Trigger | Applies? | Why, in this product |
|---|---|---|
| **Art 35(3)(a)** — systematic and extensive evaluation of personal aspects based on automated processing, on which decisions are based | **Yes.** | The entire product is automated evaluation of a person from their birth data. `analyzeProfile` ranks the chart's static fit against every life decision the engine can time (`src/ai/tools.ts:313-330`); the day scorer produces a 0–100 score, a band and a verdict per day that the user is invited to act on. The output is explicitly directed at real decisions — the app's own placeholder text invites "a move in the spring, a hearing in June" (`src/ui/priorities/PrioritiesPanel.tsx:61`), and the objective catalogue includes medical ones. The evaluation is extensive: chart, luck decades by age range (`src/engine/periods.ts:437-441`), four ranked life areas including health (`src/ui/priorities/prioritiesStore.ts:48-53`). |
| **Art 35(3)(b)** — processing on a large scale of special-category data (Art 9) or criminal-offence data (Art 10) | **Partly — special category yes, large scale not yet.** | Special-category material reaches the service through uncontrolled free text (see §2.4 and R1). "Large scale" is not met at current user numbers, but the ICO's guidance treats the *category* as a trigger in combination with other factors, and Art 35(1)'s general test is met regardless. |
| **Art 35(3)(c)** — systematic monitoring of a publicly accessible area | No. | No location tracking, no cameras, no analytics. |
| **ICO: use of innovative technology** | **Yes.** | A large language model processes the user's free text about their life and generates guidance (`src/ai/chatClient.ts:352-365`; `functions/src/chat.ts:145-158`). |
| **ICO: combining datasets from different sources** | **Yes.** | Stated priorities, behavioural journal signals derived from saved decisions (`src/ui/priorities/deriveSignals.ts`), engine-derived chart data and identity data from Google sign-in are combined against a single `uid`. |
| **ICO: profiling on a large scale** | Partly. | Profiling: yes, that is the product. Large scale: not currently. |
| **ICO: data concerning vulnerable people / children** | **Open.** | Terms state a minimum age of 16 (`src/pages/LegalPages.tsx:172`) but there is **no age gate in the code** — nothing verifies or even asks. See OQ-16. Separately, users store birth data for *children* as members of "the cast" (`src/ui/profile/peopleStore.ts:18-19` — "partner, child, co-founder"). |
| **ICO: denial of a service** | No. | Everything is free; there are no tiers (`src/billing/plans.ts:65-76`). |

**Conclusion: a DPIA is required.** Art 35(3)(a) is met squarely, and at least two ICO
criteria are met alongside a genuine special-category exposure. The trigger date is
2026-07-26.

### 1.3 What this DPIA covers

The whole product as of commit `fabdf1f` (2026-07-26): local-only processing, cloud sync,
the AI advisor on both of its transports, the backup file, and the hosting arrangement.
It does **not** cover any future feature.

---

## 2. Describe the processing

### 2.1 Nature of the processing

The user enters a birth date, a birth time and a birth place (`src/ui/PersonalizeCard.tsx:8-26`).
A deterministic engine computes a four-pillar BaZi chart and scores calendar days for
suitability against a named objective. **All scoring is client-side** — no network call is in
the calculation path. On top of that sit four user-data features:

1. **The cast of people** — up to twelve stored birth profiles, of the user and of others
   (`src/ui/profile/ProfileContext.tsx:37`, `:41`).
2. **The decision journal** — dated decisions with free-text notes and optional outcome
   records including a 1–5 stress rating (`src/ui/journalStore.ts:9-53`), plus daily
   reflections (mood 1–5 + free text, `src/ui/journalStore.ts:191-203`).
3. **The priority profile** — ranked life areas, free-text intentions and life context, and
   the field-level AI consent flags (`src/ui/priorities/prioritiesStore.ts:103-122`).
4. **The AI advisor** — a chat panel that sends the user's questions and a derived chart
   summary to Anthropic's Claude and stores the transcript
   (`src/ui/ChatPanel.tsx`, `src/ai/chatClient.ts`).

Signing in is **optional**. The app works fully signed-out; sign-in adds cloud sync for a
*subset* of the stores (see §2.3 — this asymmetry is itself a risk, R13).

### 2.2 Data inventory

This table is the spine of the document. "Syncs?" means: does the record travel to the
owner's Firestore when the user is signed in.

#### 2.2.1 Stored on the device (`localStorage`)

| Field / record | Where stored | Syncs? | Who can see it | Why it is collected | Evidence |
|---|---|---|---|---|---|
| **`wei_people_v1`** — the cast: for each person, birth date, birth time, sex, time certainty, tz offset, convention, longitude, birth city, birth zone, plus `id`, `label` ("You", "Mei", "Dad") and free-text `relation` | Device | **Yes** → `users/{uid}/meta/people` | The user; the owner (as Firestore controller); Google as processor | Birth instant is the sole input to the chart; label/relation let the user tell profiles apart | `src/ui/profile/ProfileContext.tsx:37`, `:87-96`, `:161-172`; `src/ui/profile/peopleStore.ts:14-26`; `src/ui/PersonalizeCard.tsx:8-26` |
| **`wei_person_v1`** — legacy single-profile key, holding the *active* `StoredPerson` | Device | **Yes** → `users/{uid}/meta/profile` (mirror) | As above | Rollback compatibility only — so an older build finds a chart | `src/ui/profile/ProfileContext.tsx:36`, `:89-92`; `src/firebase/client.ts:172-178` |
| **`wei_journal_v1`** — decision journal: objective, date, score, band, verdict, best hour, **free-text `note`**, and optional outcome {actual date, rating, **stress 1–5**, helped, **free-text `notes`**} | Device | **Yes** → `users/{uid}/meta/journal` | As above | Lets the user revisit a decision and record how it went; feeds the confidence wording and the priority suggestions | `src/ui/journalStore.ts:9-53`, `:63`; `src/ui/profile/useJournalSync.ts:66-78` |
| **`wei_reflections_v1`** — one row per day: **mood 1–5** + **free-text note** | Device | **NO** | The user only (plus anyone given a backup file) | A lightweight "how did today feel" log | `src/ui/journalStore.ts:191-214`, `:236-268`; absent from `src/firebase/client.ts` and from both sync hooks |
| **`wei_priorities_v1`** — ranked life areas (career / wealth / relationship / **health**), up to 2 free-text intentions (≤140 chars), free-text context {life stage, occupation, what's coming up} (≤120 chars each), accepted signals, **the four AI consent flags**, updatedAt | Device | **NO** | The user only (plus a backup file) | Orders what the app surfaces and computes the separately-labelled "priority fit" axis; the consent flags gate what the AI advisor may see | `src/ui/priorities/prioritiesStore.ts:28`, `:63-131`; absent from `src/firebase/client.ts` |
| **`wei_priority_dismissed_v1`** — ids of dismissed suggestions, e.g. `journal:area:health` | Device | **NO** — and not in the backup either | The user only | Stops the app re-asking about a suggestion the user declined | `src/ui/priorities/dismissedSignals.ts:15`, `:40-49`, `:63-65`; not among the six keys read at `src/ui/backup.ts:235-239` |
| **`wei_ai_threads_v1`** — saved AI conversations: title (derived from the first user message), turns, and **`tool_result` blocks retained byte-for-byte** (which contain the four pillars and luck-decade age ranges) | Device | **Yes** → `users/{uid}/ai_threads/{id}` | The user; the owner; Google as processor | Conversation memory across sessions and devices | `src/ui/chat/threadStore.ts:32`, `:52-53`, `:59-116`; `src/ui/chat/useThreadSync.ts:133-154` |
| **`wei_ai_active_thread:<hash>`** — pointer to the last-read conversation, **one key per chart**; the suffix is a 32-bit FNV-1a hash of birth date + the four pillars' indices | Device | **NO** | The user only | Resume the right conversation per person | `src/ui/ChatPanel.tsx:63-64`, `:150-168` |
| **`wei_ai_key`** — the user's own Anthropic API key, **plaintext** | Device | **NO**, and excluded from backups | The user; any script running on the origin | Only used on a build with no proxy (BYOK) | `src/ui/ChatPanel.tsx:56`, `:664-666`, `:1034`; `src/ui/backup.ts:58-64` |
| **`wei_ai_consent`** (`"1"`) and **`wei_ai_model`** | Device | **NO**, excluded from backups | The user | `wei_ai_consent` is the record that the user accepted the AI disclosure | `src/ui/ChatPanel.tsx:57-58`, `:328`, `:665-668`; `src/ui/backup.ts:64` |
| **`wei_signin_email`** — the address typed to request a sign-in link | Device | **NO**, excluded from backups | The user | Lets the link be redeemed in the same browser without retyping (Firebase's anti-session-injection requirement) | `src/firebase/client.ts:84`, `:100-107`, `:115-121`, `:125-135` |
| **Firebase Auth session store (IndexedDB, `firebaseLocalStorageDb`)** — uid, email, displayName, photoURL and a long-lived **refresh token**, persisted by the SDK, not by this app's code | Device (**not** `localStorage` — the twelve rows above are the app's own keys; this one is the SDK's) | n/a | The user; any script on the origin | `getAuth(app)` takes the SDK's default browser persistence, which is what keeps a user signed in across reloads | `src/firebase/client.ts:46-58` (`getAuth(app)` at `:49`, no `setPersistence` call anywhere in `src/`) |

Nothing else on the device holds personal data. The service worker caches same-origin
`GET` static assets only and explicitly bypasses cross-origin requests, so no chat, Auth or
Firestore response is ever written to Cache Storage (`public/sw.js:41-46`, `:51`).

#### 2.2.2 Held in the cloud (Firebase project `wei-timing`)

| Field / record | Where stored | Syncs? | Who can see it | Why it is collected | Evidence |
|---|---|---|---|---|---|
| **Firebase Auth account** — uid, email, displayName, photoURL (the four fields the app reads). Two methods live: Google popup, email link. No password auth. | Firebase Auth | n/a | The user; the owner (Firebase console); Google | Identify the account so per-user documents can be scoped | `src/firebase/client.ts:11-22`, `:67-69`, `:100-135`; `src/ui/profile/AuthContext.tsx:5-10`, `:70` |
| **`users/{uid}/meta/people`** — `{ people: StoredPerson[], activeId, updatedAt }`: full birth records for the account holder **and every other person they entered** | Firestore | — | The user (rules-enforced); the owner; Google | Cross-device continuity of the cast | `src/firebase/client.ts:166-178`; `firestore.rules:29-32` |
| **`users/{uid}/meta/profile`** — `{ person: <active StoredPerson>, updatedAt }` | Firestore | — | As above | Stated reason: so an older client finds a chart. **See §2.6 defect D1 — nothing in this repo reads it and nothing deletes it.** | `src/firebase/client.ts:149-159`, `:174-177` |
| **`users/{uid}/meta/journal`** — `{ entries: JournalEntry[], updatedAt }`, i.e. **the whole journal including every free-text note and outcome note** | Firestore | — | As above | Cross-device continuity of the journal | `src/firebase/client.ts:182-190`; `src/ui/profile/useJournalSync.ts:48-56`, `:66-78` |
| **`users/{uid}/ai_threads/{id}`** — `{ thread: ChatThread, updatedAt }`, one document per conversation, transcript in full | Firestore | — | As above | Conversation memory across devices | `src/firebase/client.ts:237-262` |
| **`users/{uid}/billing/usage`** — `{ day: 'YYYY-MM-DD', count, requests, updatedAt }`: the daily AI abuse meter | Firestore | — | The user (read-only) and the Cloud Function (Admin SDK, which bypasses rules); the owner; Google | Bounds token spend on the owner's Anthropic key | `functions/src/entitlements.ts:20`, `:52-92`; `firestore.rules:29-31`; `src/firebase/client.ts:196-202` |

#### 2.2.3 Leaves the owner's control entirely

| Field / record | Where it goes | Who can see it | Why | Evidence |
|---|---|---|---|---|
| **AI request body** — system prompt; a derived chart context block (Day Master, strength, favourable/unfavourable elements, today's date); the user's questions verbatim; the replayed transcript; engine tool results (all four pillars, luck decades by age range); the priority profile projected through its consent flags | Anthropic Messages API — either direct from the browser (BYOK) or via the owner's Cloud Function in **us-central1** | Anthropic; the owner, if the relay path is live | Turn the engine's numbers into prose | `src/ai/chatClient.ts:23`, `:352-365`; `functions/src/chat.ts:83-84`, `:145-158`; `src/ai/systemPrompt.ts:102-117` |
| **Backup file (.json)** — people, legacy person, journal, reflections, threads, priorities, unencrypted | The user's own filesystem, then wherever they send it | Anyone who obtains the file | The only portability / disaster-recovery mechanism, and the only way reflections and priorities can leave the device | `src/ui/backup.ts:43`, `:45-56`, `:233-251` |
| **`.ics` calendar event** — one `VEVENT` whose `SUMMARY` is the plain-English objective ("A medical procedure — auspicious window (Wéi)"), on a named date, with a two-hour window when the reading is personalised, and whose `DESCRIPTION` is the verdict plus the "why this day" bullets | Downloaded, then **almost always imported into a hosted calendar** — Google / Apple / Microsoft — and from there into whatever that calendar is shared with | The calendar provider; anyone the user's calendar is shared with; anyone who sees a free/busy or event title | Let the user put the chosen day in their calendar | `src/ui/ics.ts:28-56` (`SUMMARY` `:31`, `DESCRIPTION` `:32`), `:59-69`; invoked at `src/ui/BestDayHero.tsx:185`; objective wording at `src/engine/plainEnglish.ts:69`; the `medical_procedure` objective at `src/engine/objectives.ts:169` |
| **Shareable HTML report** — the objective, the date, the score and band, the confidence, the best hour, the "why this day" and "what to do" bullets, the score breakdown, and — when personalised — the **Day Master, favourable and unfavourable elements** and the year outlook. The module's own header calls it "Shareable" | The user's filesystem, then wherever they send or print it | Anyone who obtains the file | Portability of a single reading; print / "Save as PDF" | `src/ui/report.ts:1-5`, `:41-131` (chart block `:51-58`), `:134-145`; invoked at `src/pages/DateFinder.tsx:410-415` |
| **Request metadata** — IP, user-agent, timestamps for every page and asset load | GitHub Pages | GitHub (independent controller for its own logs) | Hosting | `.github/workflows/deploy-pages.yml:53-66`; `index.html` references only same-origin assets |
| **Request metadata to Google** — IP, user-agent and timestamps for every Auth call and every Firestore read/write; and, if the relay is live, for every chat request, where Cloud Run/Cloud Functions request logs (IP, UA, path, status, and the request that carried a uid-bearing bearer token) are retained **in the owner's own project** in Google Cloud Logging | Google (Firebase Auth, Firestore, Cloud Functions in **us-central1**) | Google; **the owner**, for the Cloud Logging entries | Unavoidable consequence of using the platform | `src/firebase/client.ts:46-58`, `:64-69`, `:145-262`; `functions/src/chat.ts:83-84`, `:97-110`. Retention and region of those logs are console settings — **OQ-22** |

### 2.3 Local ⇄ cloud asymmetry (stated plainly, because a privacy notice will have to)

**Only three of the twelve local stores sync.** Signing in does **not** back up:

- daily reflections (mood series + free text) — `src/ui/journalStore.ts:214` has no cloud counterpart;
- the priority profile, **including the AI consent flags themselves** — `src/ui/priorities/prioritiesStore.ts:28`, absent from `src/firebase/client.ts`;
- dismissed suggestions, the AI consent marker, the model choice, the BYOK key, the active-thread pointers and the pending sign-in address.

Two further scoping facts:

- **Journal sync only runs while the Date Finder page is mounted.** `useJournalSync` is
  called from exactly one place, `src/pages/DateFinder.tsx:131`. A signed-in user who never
  opens that page has no journal in their account. All journal mutations do route through
  that page, so writes made there are covered — but the promise "your records sync when you
  sign in" is not unconditionally true. (OQ-6)
- **Conversation sync only runs while the chat panel is mounted** — `src/ui/ChatPanel.tsx:409`.
  The panel is mounted on two pages (`src/pages/DateFinder.tsx:366`, `:460` and
  `src/pages/ChatPage.tsx:28`), which is broader than the journal but still not app-wide.
- The cast of people **does** sync app-wide: `ProfileProvider` wraps the whole app at
  `src/App.tsx:133`.

### 2.4 Scope: what special-category data actually arrives, and how

The app never *asks* for special-category data. It arrives anyway, through four routes:

1. **Journal `note` and `outcome.notes`** — unbounded free text attached to a dated decision.
   The objective catalogue includes medical objectives; a user writing about a diagnosis, a
   pregnancy, a court date or a break-up is entirely foreseeable. `src/ui/journalStore.ts:18`, `:34`.
2. **`outcome.stress` (1–5) and `outcome.helped`** — a *structured, dated self-report of
   stress against a named event*. The app defines this field; it is not merely tolerated.
   `src/ui/journalStore.ts:14-17`.
3. **Daily reflections** — a dated 1–5 mood series with a free line. In aggregate this is a
   mental-health record, and it is arguably the most special-category-shaped store in the
   app. `src/ui/journalStore.ts:191-203`.
4. **Priority profile** — `health` is one of the four rankable areas
   (`src/ui/priorities/prioritiesStore.ts:48-53`), so a ranking alone can state that health
   is this person's foremost concern; and `context.comingUp` / `context.occupation` are free
   text. The module's own comment acknowledges the drift: "a 'what's coming up' note can
   drift into health, family or legal territory" (`src/ui/priorities/prioritiesStore.ts:71-81`).

Route 3 is **local-only**; routes 1, 2 and (via a saved transcript) 4 reach Firestore.

### 2.5 Context: who the data subjects are

- **The account holder.** Provides birth data, free text, and identity data via sign-in.
- **Third parties in the cast.** `StoredPerson.relation` is free text described in the code
  as "partner, child, co-founder" (`src/ui/profile/peopleStore.ts:18-19`). Their birth date,
  birth time, birth place and sex are stored on the owner's infrastructure. They have not
  used the app, have not been told, and cannot exercise any right through it. This is
  **Article 14** territory (data not obtained from the data subject) and there is currently
  no notice, no lawful-basis analysis, and no mechanism. See R2.
- **A third party's data does not stop at Firestore.** Every personalised surface in the app
  runs against *the active person*, whoever that is, and the cast is exactly the mechanism for
  making someone else active (`src/ui/profile/ProfileContext.tsx:243-249`). So when the active
  person is a partner, a parent or a child:
  - **their chart goes to Anthropic.** `ChatPanel` is handed `result.subjectChart` and the
    active `birthCivil` (`src/pages/DateFinder.tsx:366`, `:460`; `src/pages/ChatPage.tsx:28`),
    and conversations are keyed per subject precisely because the app expects a different
    chart per stored person (`src/ui/ChatPanel.tsx:59-64`, `:165-168`). `get_natal_chart`
    then returns that person's four pillars (`src/ai/tools.ts:270-283`) and `get_luck_pillars`
    their active decade as an age range (`:394-398`), which — per R3 — reconstructs their
    birth instant closely. It is then retained in a transcript that syncs to the account.
  - **their chart goes into the exported report.** `src/ui/report.ts:51-58` prints the active
    person's Day Master and favourable/unfavourable elements, and `src/ui/ics.ts:31-32` puts
    the objective and date into a calendar event.
  - **their birth record goes into the backup file** (`src/ui/backup.ts:233-251`).
  None of these is disclosed to the third party, and the account holder is given no warning
  at the point of adding someone that this is what "adding a person" entails. See R2 and R18.
- **Children.** Both as account holders (no age gate, OQ-16) and as cast members.

### 2.6 Defects found in the code that this DPIA must record honestly

**D1 — `users/{uid}/meta/profile` is write-only and is never deleted.**
`saveProfile` is called only from inside `savePeople` (`src/firebase/client.ts:177`).
`loadProfile` (`:150-153`) and `clearProfile` (`:157-159`) have **no callers anywhere in
`src/` or `tests/`** (verified by repo-wide grep). And `savePeople` mirrors only when an
active person exists (`:176-177`), so clearing your profile — `setPerson(null)` at
`src/pages/ProfilePage.tsx:86`, `:168` → `src/ui/profile/ProfileContext.tsx:218-229` →
`commit` → `savePeople` — empties `meta/people` but **leaves the last full birth record
sitting in `meta/profile` indefinitely**. `clearProfile()` is dead code. See OQ-3.

**D2 — There is no account-deletion or cloud-erasure path anywhere in the app.**
Nothing deletes `meta/people`, `meta/journal`, the `ai_threads` collection en masse, or
`billing/usage`. The client is forbidden by rule from writing `billing` at all
(`firestore.rules:31`). "Delete my account" does not exist as a feature. See R8 and OQ-2.

**D3 — `wei_signin_email` is cleared only when a redemption is *attempted*.**
`completeEmailLink`'s `finally` block removes it (`src/firebase/client.ts:128-134`). A user
who requests a link and never opens it, or opens it in another browser, leaves their email
address in this browser's `localStorage` indefinitely. The code comment calling it "the one
piece of PII this flow stores" (`:123-124`) is accurate about intent, not about retention.
See OQ-7.

**D4 — Four statements in the code and in the user-facing privacy notice are now false.**
The claim "journal notes never leave the device" is true *of the AI path* and false *of the
device*, because the whole journal including every note is written to Firestore
(`src/ui/profile/useJournalSync.ts:71-72` → `src/firebase/client.ts:188-190`). The absolute
wording appears at:
`src/ai/tools.ts:47-48`, `src/ai/tools.ts:362`, `src/ui/ChatPanel.tsx:519`, and — the one
that matters legally — **`src/pages/LegalPages.tsx:98-99`**: "The text of your journal notes
is never sent to the model under any setting… because it never leaves your device."

**D5 — The published privacy notice denies the existence of the processing being assessed.**
`src/pages/LegalPages.tsx:53-56` states "there is currently no sign-in on this site and no
copy of your data on our servers"; `:58-62` and `:63-66` describe accounts in the
conditional ("If we do turn accounts on…"); `:128` states "there is no account to create";
`:140-143` states "Your data is local-only today". Last-updated stamp: 25 July 2026
(`:23`), one day before accounts shipped. The contact address is an **unfilled placeholder**,
`support@example.com` (`:22`), which means there is currently no working route for a
data-subject request. This is the highest-priority remediation item in the document (R7).

Two further statements in the same notice are now false and are easy to miss because they
sit under headings that look unrelated to accounts:

- **`:103-107`, under "Payments": "we hold no payment details and no billing records about
  you."** The first half is true — there are no payments. The second half is not: the app
  now holds a per-user document at `users/{uid}/billing/usage` recording a UTC day key and
  two counters, written by the Cloud Function on every AI request
  (`functions/src/entitlements.ts:20`, `:84`, `:90`) and read back by the client
  (`src/firebase/client.ts:196-202`). It is a usage meter rather than a financial record, but
  it is a billing-collection record held against an identified user, and the notice denies
  its existence in those words.
- **`:118`, under "Your control": "Remove any stored person… from the profile page at any
  time."** True of `localStorage` and of `meta/people`, false of `meta/profile`, which
  nothing deletes (D1). The user is told a removal is complete when it is not.

**D6 — Two code comments assert a state of the world that no longer holds.**
`src/ui/chat/useThreadSync.ts:6-9` states "Firebase is unconfigured in the shipped build …
`enabled` is false for everyone today"; `src/ui/ChatPanel.tsx:68-69` states "On the static
GitHub Pages build it is unset, so the deployed app uses BYOK". Both are behaviourally
harmless (the values are read at runtime) but both will mislead the next reviewer.

**D7 — A correction to one reader's finding, recorded so it is not repeated.** It is *not*
true that locally-pruned conversations survive in the cloud: `src/ui/ChatPanel.tsx:435-437`
explicitly deletes pruned threads from the account ("the account has to lose them too, or
the next sign-in pulls every one of them straight back"). The control is **partial**,
though: it only fires while the panel is mounted *and* the user is signed in
(`src/ui/chat/useThreadSync.ts:223-225` no-ops otherwise).

**D8 — the in-app "reset" does not reset a signed-in account.**
The error-recovery card clears `wei_person_v1` and `wei_people_v1` from `localStorage` and
reloads (`src/ui/ErrorBoundary.tsx:7-19`). For a signed-in user, `ProfileProvider` then
hydrates the cast straight back out of Firestore on the next mount and re-persists it
locally (`src/ui/profile/ProfileContext.tsx:176-193`). The control the user reaches for when
they want their stored birth data gone is device-scoped only, and it is not labelled as
such. Same family of problem as R14.

**D9 — two shipped export paths were absent from the first draft of this document.**
The `.ics` calendar export (`src/ui/ics.ts:28-69`) and the shareable HTML report
(`src/ui/report.ts:41-145`) are live features — `src/billing/plans.ts:27` names them
together as the `export` feature, available to everyone. Both carry personal data out of
both the device and the owner's infrastructure, and the `.ics` route delivers a plain-text
objective (which may be `medical_procedure`) into a hosted calendar. They are now inventoried
at §2.2.3 and assessed at R18 / M14. Recorded as a defect of the assessment rather than of
the code, because an inventory that omits a flow is the failure a DPIA is least able to
survive.

---

## 3. Consultation

**Be honest: this is a solo project and no external consultation has taken place.**

| Who should be consulted | Consulted? | Notes |
|---|---|---|
| A data protection officer | **No.** | The controller almost certainly does not meet the Art 37 mandatory-DPO threshold (no large-scale systematic monitoring, no large-scale Art 9 processing *at current volume*). No DPO is appointed. |
| A solicitor / data protection lawyer | **No.** | Required before sign-off. Three questions genuinely need a legal answer, not an engineering one: the lawful basis for special-category free text (§4.3), the controller/processor position on the BYOK transport (OQ-8), and the Art 14 position on third-party cast members (R2). `src/pages/LegalPages.tsx:13-15` already carries a standing note to this effect. |
| The ICO (prior consultation, Art 36) | **No.** | Only required if a high residual risk cannot be mitigated. §7 records the residual-risk determination; if any risk remains **High** after §6's measures land, Art 36 consultation must be considered. |
| Data subjects / prospective users | **No.** | Recommended even informally: a handful of users asked "what did you assume we'd be comfortable with?" would test the assumption in R6 (people acting on the app's output) far better than the owner's own judgement. |
| Processors (Google/Firebase, Anthropic, GitHub) | **Their standard terms only.** | No negotiated terms. The Firebase DPA and Anthropic's commercial terms apply as published. The owner must confirm they have actually accepted the Firebase DPA in the console (OQ-11) and must establish Anthropic's retention/training posture from Anthropic's terms rather than from a code comment (OQ-9). |
| Security review | **Internal only.** | The codebase carries evidence of adversarial internal review (e.g. the fail-closed quota transaction at `functions/src/entitlements.ts:93-106`, the single-rule Firestore design at `firestore.rules:11-32`). No external penetration test. |

---

## 4. Necessity and proportionality

### 4.1 Purposes

| # | Purpose | Data used |
|---|---|---|
| P1 | Compute a BaZi chart and score days for a named decision | Birth date, birth time, birth place/longitude/zone, sex, time certainty, convention |
| P2 | Let the user keep and revisit a record of decisions and how they went | Journal entries, outcomes, reflections |
| P3 | Order and personalise what the app surfaces | Priority profile; journal-derived signals |
| P4 | Provide an optional conversational explanation of the reading | Chat transcript, derived chart context, tool results, consented priority fields |
| P5 | Let a user keep their records across devices | The three synced stores + the Auth account |
| P6 | Bound abuse of the owner's Anthropic key | uid + daily counters |
| P7 | Data portability and disaster recovery | The backup file |

### 4.2 Lawful basis (Art 6) — **owner to confirm with a solicitor**

| Purpose | Proposed Art 6 basis | Assessment |
|---|---|---|
| P1, P2, P3 | **Contract**, Art 6(1)(b) — the user asked for this service and it cannot be delivered without the birth instant | Defensible. The birth instant is not merely useful; it is the sole input. Note that when running signed-out and local-only there is arguably no controller processing at all. |
| P4 (AI advisor) | **Consent**, Art 6(1)(a) | The feature is opt-in and off until enabled (`src/ui/ChatPanel.tsx:328`, `:665-668`), with a disclosure box shown before opt-in (`:938-958`). See §4.5 for why this consent is currently **weak**. |
| P5 (cloud sync) | **Contract** | Sign-in is optional and its purpose is exactly this. Defensible — provided the notice actually describes it, which today it does not (D5). |
| P6 (metering) | **Legitimate interests**, Art 6(1)(f) | Proportionate: counts and a UTC day key only, no content (`src/billing/plans.ts:113-119`). A legitimate-interests assessment should be written down. Note it is retained with **no expiry** (R12). |
| P7 (backup) | **Contract** / legal obligation (Art 20 portability) | Fine. |

### 4.3 Special-category basis (Art 9) — **this is the weakest point in the assessment**

Health-adjacent and other special-category data reaches the service (see §2.4). Article 9(1)
prohibits processing unless an Art 9(2) condition applies. The realistic candidate is
**Art 9(2)(a), explicit consent**.

**Today the app does not obtain explicit consent for it.** There is:

- no point at which the user is told the journal may contain health data and asked to
  consent to the controller storing it;
- no separate consent for cloud storage of journal free text — it syncs automatically once
  signed in and the Date Finder is open (`src/ui/profile/useJournalSync.ts:66-78`);
- and a privacy notice that tells the user the opposite (D4, D5).

The field-level `aiConsent` flags (`src/ui/priorities/prioritiesStore.ts:117-122`) are a
genuinely good control, but they **only govern what reaches the AI model**. They have no
bearing on what reaches the owner's own Firestore, because the transcript containing the
answer is stored and synced regardless (`src/ui/chat/useThreadSync.ts:133-154`).

This is a gap that engineering cannot close alone; it needs a decision from the owner and a
solicitor. See M1 and OQ-1.

### 4.4 Data minimisation — is each field genuinely needed?

| Field | Needed? | Assessment |
|---|---|---|
| Birth date, time, tz offset, convention | **Yes** | The four pillars cannot be computed without them. |
| Birth city / longitude / zone | **Yes, conditionally** | Only the true-solar and mean-solar conventions use longitude (`src/ui/PersonalizeCard.tsx:15-21`), but that is the default convention (`:28-30`), so in practice it is needed. |
| `sex` | **Yes for the engine** | Determines luck-pillar direction in the classical rule set. |
| `timeCertainty`, `tzManual` | **Yes** | Honesty controls — they drive the boundary-ambiguity warnings. Good minimisation practice, not a risk. |
| `label`, `relation` (free text) | **Presentational only** | The code says so: "Presentation only" (`src/ui/profile/peopleStore.ts:18-19`). Needed for usability; not engine input. Note it is third-party data. |
| Journal free-text `note`, `outcome.notes` | **Needed for P2, unbounded in content** | The purpose (a personal record) genuinely requires free text. The risk is not the field's existence but its unlimited content plus its automatic cloud sync. |
| `outcome.stress` (1–5) | **Questionable** | This is the app *defining* a health-adjacent structured field. It feeds only "the user's own reflection, preference calibration and confidence wording" (`src/ui/journalStore.ts:6-8`) — never the score. A structured stress series is the most regulator-visible field in the product for the least functional return. Worth a deliberate keep-or-drop decision (OQ-14). |
| Reflections (mood + note) | **Same** | Local-only, which is strong minimisation. Keep it that way (M8). |
| `health` as a rankable priority area | **Yes for P3** | It is one of the engine's four life areas (`src/ui/priorities/prioritiesStore.ts:48-53`); removing it would break the gauges. Its sensitivity is real but the field is structural. |
| `context.occupation`, `context.comingUp` | **Optional and off-by-default for AI** | Genuinely optional, every field independently clearable (`:61-62`). Good. |
| Google `displayName`, `photoURL` | **Not needed** | Read into app state (`src/ui/profile/AuthContext.tsx:70`) but, from this code, never written to Firestore. They exist because Google supplies them. Minimisation would say don't request the profile scope, or at least don't read them. Low risk, easy win (M12). |
| `billing/usage` counters | **Yes for P6**, but retained forever | Minimal in content, unbounded in time (R12). |
| Four pillars + luck-decade age ranges sent to the model | **Needed for P4** | But see R3 — these are pseudonymised birth data, not the absence of birth data. |
| `.ics` `SUMMARY` — the plain-English objective | **Questionable** | The event only needs to be *in the calendar*; naming the objective in the title is a convenience. `src/ui/ics.ts:31` writes `"${obj.gerund} — auspicious window (Wéi)"`, so `medical_procedure` becomes a calendar entry reading "A medical procedure" (`src/engine/plainEnglish.ts:69`) in whatever calendar the user syncs, with whatever sharing that calendar has. A neutral title with the detail in `DESCRIPTION` (which most sharing surfaces do not show) would be strictly better minimisation at no functional cost. See M14. |
| HTML report chart block — Day Master, favourable / unfavourable elements | **Needed for P7, but note what it is** | It is the same derived chart summary the AI receives, in a file the module itself calls "Shareable" (`src/ui/report.ts:1-5`, `:51-58`). Fine as the user's own copy; worth a line of on-screen wording that the file identifies them. |

### 4.5 Quality of the consent that does exist

The AI consent design has real strengths and one real weakness.

**Strengths, all verified:**
- Four independent flags, enforced in exactly **one** place — `sharedForAi`
  (`src/ui/priorities/prioritiesStore.ts:494-503`), which every AI-facing caller must go
  through (`src/ai/tools.ts:334-335`).
- Sensible defaults: the two innocuous stated fields default **on**, the sensitive free-text
  field and the derived behavioural aggregate default **off**
  (`src/ui/priorities/prioritiesStore.ts:117-122`).
- **Fail-closed parsing**: a malformed or older stored profile reads the two sensitive flags
  as `false`, because only a literal `true` counts (`:222-223`).
- Unconsented fields are **omitted, not blanked** — there is nothing to leak (`:494-503`).
- The pre-chat disclosure box is **derived from the live profile**, not hardcoded, precisely
  so it cannot promise something the tool payload contradicts (`src/ui/ChatPanel.tsx:525-547`,
  rendered at `:938-958`).
- Suggestion chips are consent-gated too, so a chip cannot smuggle an unshared field into
  the transcript (`src/ui/ChatPanel.tsx:556-558`, `:567`).
- Raw journal note text genuinely never reaches the model: the AI path reads the journal only
  through `deriveSignals(loadJournal())` (`src/ui/ChatPanel.tsx:520`), which is pure and
  network-free, and `get_priorities` emits nothing but `{area, savedDecisions,
  withLoggedOutcome}` counts (`src/ai/tools.ts:357-364`). Tests assert the serialized payload
  cannot contain note text (`tests/aiTools.test.ts:286`, `:301`).

**Weaknesses:**
- **Consent is captured once and never revisited.** `wei_ai_consent === "1"`
  (`src/ui/ChatPanel.tsx:328`) is set at opt-in; the disclosure block only renders when
  `!configured || !consented` (`:884`). A user who later fills in `context` or turns on
  journal sharing is never re-shown a disclosure. The consent they gave may no longer
  describe what is sent.
- **The consent record is device-local and does not sync.** Both `wei_ai_consent` and the
  `aiConsent` flags inside `wei_priorities_v1` stay on one device. A signed-in user on a new
  device lands back on the defaults. That may be a defensible design ("consent is
  per-device") but it must be *stated*, and today it is not. See OQ-5.
- **Undisclosed metadata is sent.** `get_priorities` also emits `withheld`, `notSet`,
  `consentNote` and `lastUpdated.monthsAgo` (`src/ai/tools.ts:340-353`, `:376-381`).
  `hasJournal` is computed **regardless of consent** (`:340`), so a user who turns journal
  sharing *off* still causes the string `"journal"` to be transmitted as a fact about them —
  locked in by test (`tests/aiTools.test.ts:298`). There is a real design reason (the prompt
  uses `withheld` to stop the model guessing — `src/ai/systemPrompt.ts:80-85`), and the
  privacy notice partially covers it (`src/pages/LegalPages.tsx:99-100`), but it does not
  cover "we tell the model a journal exists". Low harm; still a disclosure gap (M6).

---

## 5. Risks to individuals

Scoring: **Likelihood** = Remote / Possible / Probable. **Severity** = Minimal / Significant /
Severe. **Overall** = Low / Medium / High. These are the *inherent* ratings, before the
measures in §6; §7 records residual risk after the owner decides which measures to accept.

| # | Risk | Likelihood | Severity | Overall |
|---|---|---|---|---|
| **R1** | **Special-category data arrives via free text and is stored in the cloud without an Art 9 basis.** Journal `note` / `outcome.notes` are unbounded (`src/ui/journalStore.ts:18`, `:34`) and sync in full to `users/{uid}/meta/journal` (`src/ui/profile/useJournalSync.ts:71-72`). `outcome.stress` is a structured dated stress series (`src/ui/journalStore.ts:14-17`). No explicit consent is taken for any of it (§4.3). | Probable | Severe | **High** |
| **R2** | **Third-party data subjects — and their data does not stop at Firestore.** Birth date, time, place and sex for partners, children and colleagues are stored on the owner's infrastructure (`src/ui/profile/peopleStore.ts:14-26` → `src/firebase/client.ts:172-178`). Making one of them the active person is a single click (`src/ui/profile/ProfileContext.tsx:243-249`), and from that moment **their** chart is what the advisor sends to Anthropic (`src/pages/DateFinder.tsx:366`, `:460` → `src/ai/tools.ts:270-283`, `:394-398`) and is retained in a synced transcript; **their** Day Master goes into an exported report (`src/ui/report.ts:51-58`); **their** birth record goes into the backup file (`src/ui/backup.ts:233-251`). They are not told, cannot object, and cannot exercise any right; the account holder is not warned either. Art 14 is unaddressed, and where the third party is a child (`peopleStore.ts:18-19` names "child") the severity is higher again. See §2.5. | Probable | **Severe** | **High** |
| **R3** | **Re-identification.** Birth date + exact time + city is close to a unique identifier for a natural person. Separately, the claim "no birth details are sent" to the model is *literally true but substantively weak*: `get_natal_chart` returns all four pillars including the hour (`src/ai/tools.ts:270-283`) and `get_luck_pillars` returns the active decade as "ages 34–44" (`src/ai/tools.ts:394-398` → `src/engine/periods.ts:439`) alongside today's date (`src/ai/systemPrompt.ts:116`). Together those reconstruct the birth date to a day and the time to a two-hour window. What is sent is **pseudonymised birth data**, not the absence of birth data — and it is then stored in the transcript (`src/ui/chat/threadStore.ts:52-53`). | Probable | Significant | **High** |
| **R4** | **Data sent to an AI provider.** The user's questions go verbatim, are re-sent on every subsequent turn within the replay window (`src/ai/chatClient.ts:280-291`; `src/ui/ChatPanel.tsx:701`), and can contain anything. On the relay path the content also transits a Cloud Function in **us-central1** (`functions/src/chat.ts:84`) while Firestore is stated to be in europe-west2 — an international transfer for chat content. Which transport the live site uses is **not determinable from the repo** (OQ-1). | Probable | Significant | **High** |
| **R5** | **Account takeover.** A compromised Google account or an intercepted sign-in link yields the full cast of birth records, the entire journal with its free text, and every saved transcript. No re-authentication guards anything; there is no MFA the app controls; there is no session or device list. | Possible | Severe | **High** |
| **R6** | **The app's inferences are acted on for consequential life decisions.** The product exists to tell people when to do things. A user may delay medical care, a signing, or a relationship decision on a score. The engine is deterministic but its *interpretive* layers are explicitly school-dependent (`src/ai/tools.ts:254`, `:309`). | Probable | Significant | **High** |
| **R7** | **Transparency failure.** The live privacy notice states there is no sign-in and no server copy of user data (`src/pages/LegalPages.tsx:53-56`, `:128`, `:140-143`), and asserts journal text "never leaves your device" (`:98-99`). Both are now false. The contact address is a placeholder (`:22`), so there is **no working route for a data-subject request**. This is an Art 12–14 failure on its face. | **Certain — it is true now** | Significant | **High** |
| **R8** | **No way to exercise erasure.** There is no account-deletion or cloud-erasure feature anywhere (§2.6 D2); `clearProfile()` exists but has no callers (`src/firebase/client.ts:157-159`); the client cannot write `billing` at all (`firestore.rules:31`). An Art 17 request today can only be honoured by the owner deleting documents by hand in the console — which is possible but undocumented and unverified. | Probable | Significant | **High** |
| **R9** | **Orphaned cloud data.** `users/{uid}/meta/profile` is written on every profile save, read by nothing, and deleted by nothing (§2.6 D1). "Clear my profile" leaves a full birth record in the cloud forever. Directly contradicts storage limitation and the user's reasonable expectation. | **Certain — it is true now** | Significant | **High** |
| **R10** | **Consent is not durable or portable.** The AI consent artefacts are device-local (`src/ui/ChatPanel.tsx:58`; `src/ui/priorities/prioritiesStore.ts:28`), are wiped by clearing site data, and do not follow the account. Consent is captured once and never re-confirmed after the profile changes (`src/ui/ChatPanel.tsx:884`). | Probable | Significant | **Medium** |
| **R11** | **The backup file concentrates everything, unencrypted.** One `.json` carries every stored person's birth record, the whole journal, every reflection, every transcript, and the priority profile (`src/ui/backup.ts:233-251`). Once downloaded it is entirely outside the owner's control. | Possible | Severe | **High** |
| **R12** | **No retention limits anywhere.** No store has an expiry. The conversation prune is device-side (`src/ui/chat/threadStore.ts:900`, `:935-976`); `billing/usage` rows are never cleaned up (`functions/src/entitlements.ts:84`, `:90`). Firestore data persists for as long as the project exists. | **Certain — it is true now** | Significant | **Medium** |
| **R13** | **Users are misled about what is backed up.** Reflections and the priority profile do not sync (§2.3), yet the app offers sign-in as continuity. A signed-in user who clears site data loses their mood history believing it is in their account. Data *loss*, not disclosure — but a real harm to the individual. | Probable | Significant | **Medium** |
| **R14** | **Deleted records come back.** Journal sign-in merge is a union by id (`src/ui/profile/useJournalSync.ts:20-27`), and conversation deletion is deliberately never *inferred* from local absence — the code states the consequence itself: "a conversation deleted while signed out comes back on the next sign-in" (`src/ui/chat/useThreadSync.ts:31-37`). Both are defensible engineering; both mean a user's deletion can silently fail. | Probable | Significant | **Medium** |
| **R15** | **BYOK API key held in plaintext `localStorage`.** `wei_ai_key` (`src/ui/ChatPanel.tsx:56`, `:664-666`) is readable by any script on the origin. Not personal data, but a credential with a direct billing consequence for the user. Correctly excluded from backups (`src/ui/backup.ts:64`). Only relevant on a build with no proxy (OQ-1). | Possible | Significant | **Medium** |
| **R16** | **No age assurance.** Terms require 16+ (`src/pages/LegalPages.tsx:172`) but nothing in the code asks or checks. Children's birth data is also foreseeably stored as cast members ("child" — `src/ui/profile/peopleStore.ts:18-19`). | Possible | Significant | **Medium** |
| **R17** | **Unverified deployment state.** Whether the Firestore rules in `firestore.rules` are actually deployed is not observable from the repo (`firebase.json` only points at the file). Whether `REQUIRE_AUTH` is `"false"` on the deployed function is likewise unknown — and `"false"` would make it an unauthenticated, unmetered open Claude proxy on the owner's key (`functions/src/chat.ts:35-41`). | Remote (but unverified) | Severe | **High until verified** |
| **R18** | **Calendar export puts a health-shaped fact into a third-party calendar.** The `.ics` `SUMMARY` is the plain-English objective (`src/ui/ics.ts:31`), so choosing `medical_procedure` (`src/engine/objectives.ts:169` → `src/engine/plainEnglish.ts:69`) produces a calendar entry titled "A medical procedure — auspicious window (Wéi)". Users import `.ics` files into hosted calendars they share with partners, employers and assistants; event *titles* are what shared and free/busy views surface. The app has no control over the destination and no warning at the download button (`src/ui/BestDayHero.tsx:185`). The HTML report is the same shape of risk, one step less automatic (`src/ui/report.ts:41-145`). Neither is unlawful — it is the user's own act — but it is a foreseeable disclosure the design invites and does not flag. | Possible | Significant | **Medium** |

---

## 6. Measures to reduce risk

Each measure states what the code **already does** and what **remains to be done**. Nothing
in the "remains" column exists today.

| # | Risk(s) | What the code ALREADY does (verified) | What REMAINS to be done | Effect | Owner accepts? |
|---|---|---|---|---|---|
| **M1** | R1 | The four `aiConsent` flags exist, default sensibly, are enforced through one gate and parse fail-closed (`src/ui/priorities/prioritiesStore.ts:117-122`, `:222-223`, `:494-503`). Journal note text genuinely never reaches the model (`src/ui/ChatPanel.tsx:520`; `src/ai/tools.ts:357-364`; `tests/aiTools.test.ts:286`, `:301`). | **Decide the Art 9 position with a solicitor**, then implement it: either (a) take explicit consent before journal free text syncs to the cloud, or (b) make cloud journal sync opt-in rather than automatic, or (c) do not sync journal free text at all and sync only the structured fields. Also add plain-English guidance at the note field about what not to write. | Reduced | ☐ |
| **M2** | R2 | Nothing yet — this is an unmitigated risk. `relation` is documented as presentational (`src/ui/profile/peopleStore.ts:18-19`). | Decide the Art 14 position. At minimum: tell the *account holder*, at the point of adding another person, that they are storing someone else's personal data on the owner's servers, **that making that person active sends their chart to Anthropic and puts it in an exportable report and backup** (§2.5), and that they are responsible for having a basis to do so. Consider whether third-party records need to stay local-only, and whether the advisor should refuse — or at least announce — a non-self subject. | Reduced | ☐ |
| **M3** | R3 | The system prompt's context block genuinely carries no birth date/time/city (`src/ai/systemPrompt.ts:102-117`). The subject key used for thread scoping is a one-way FNV-1a hash, not reversible on its own (`src/ui/ChatPanel.tsx:150-168`). | **Stop repeating "no birth details are sent" as though it were the whole truth.** The claim appears user-facing at `src/ui/ChatPanel.tsx:944` ("**Never** your birth date, time or city") and in the tool descriptions the model itself is shown (`src/ai/tools.ts:80`, `:86`). State in the notice that the chart the model receives is derived from, and closely reconstructible to, a birth instant. Consider suppressing the hour pillar or replacing luck-decade *age ranges* with relative labels in the tool payload. | Reduced | ☐ |
| **M4** | R4 | Server-side model allow-list and token ceiling (`functions/src/chat.ts:45`, `:52`, `:155-156`); body-size and message-count caps (`:60-61`, `:120-125`); the relay streams the upstream body straight through and does **not** log or persist message content in this code (`:160-178`). Auth gate on the relay (`:97-110`). | Establish and record Anthropic's retention and training posture (OQ-9), the transfer mechanism for us-central1 (OQ-10), and name Anthropic in the notice with its role. If the relay is live, consider moving the function to a UK/EU region. | Reduced | ☐ |
| **M5** | R5, R17 | Firestore rules scope every document to its owner and make `billing` server-write-only, in a deliberately single-rule design that cannot be re-opened by an OR'd sibling grant (`firestore.rules:11-37`). The catch-all denies everything else (`:35-36`). Sign-in link parameters are stripped from the URL via `history.replaceState` so a burned code does not persist in history (`src/ui/profile/AuthContext.tsx:47-54`). Quota transaction fails **closed** (`functions/src/entitlements.ts:93-106`). | **Verify in the console** that these rules are actually deployed and that `REQUIRE_AUTH` is not `"false"` on the deployed function (OQ-12, OQ-13). Run the Rules Playground check already documented at `docs/FIREBASE_SETUP.md:222-224`. Consider MFA guidance for the account holder. | Reduced | ☐ |
| **M6** | R6, R10 | Strong existing honesty controls: the terms state plainly that scores are "not probabilities, forecasts of events, or assurances of any outcome" and that this is not medical/legal/financial advice (`src/pages/LegalPages.tsx:157-168`). Confidence is labelled per tool result (`src/ai/tools.ts:254`, `:309`). Priorities provably never touch the classical score (`src/ui/priorities/prioritiesStore.ts:9-14`). Boundary ambiguity is surfaced to the advisor so it cannot narrate an uncertain chart as settled (`src/ai/tools.ts:253`). | Re-show the AI disclosure when the user changes what would be shared (today it renders only pre-opt-in, `src/ui/ChatPanel.tsx:884`). Disclose the `withheld` / `hasJournal` / `lastUpdated` metadata, or derive `hasJournal` only when consent is on (`src/ai/tools.ts:340`). | Reduced | ☐ |
| **M7** | R7 | The legal module carries its own standing instruction to stay accurate (`src/pages/LegalPages.tsx:9-11`). | **Rewrite the privacy notice to describe accounts, Firestore, Anthropic, GitHub Pages and the backup file as they are.** Narrow every "never leaves your device" claim to "never sent to the AI model" (`src/ai/tools.ts:47-48`, `:362`; `src/ui/ChatPanel.tsx:519`; `src/pages/LegalPages.tsx:98-99`). **Replace `support@example.com` (`:22`) with a real address.** Update the stamp at `:23`. Also correct **`:103-107`** ("no billing records about you" — `users/{uid}/billing/usage` is exactly that) and **`:118`** ("remove any stored person… at any time" — true locally, false of `meta/profile`), and add the `.ics` / report exports and the Google request-metadata flow (§2.2.3). Fix the stale comments at `src/ui/chat/useThreadSync.ts:6-9` and `src/ui/ChatPanel.tsx:68-69`. **This is the single highest-priority item.** | Eliminated | ☐ |
| **M8** | R8, R9 | `deleteThreadCloud` exists and is wired to explicit deletes and to local pruning (`src/firebase/client.ts:260-262`; `src/ui/ChatPanel.tsx:437`, `:620`). Deleting a person rewrites the whole `meta/people` document, so deletions propagate there (`src/ui/profile/ProfileContext.tsx:241`). Reflections and priorities are local-only, which is genuine minimisation. | **Build a "delete my account and everything in it" path** covering `meta/people`, `meta/profile`, `meta/journal`, all `ai_threads`, `billing/usage` (server-side, since the client cannot write it) and the Auth record. **Call `clearProfile()` — or delete the `meta/profile` write path entirely** (OQ-3). Make the error-recovery reset either clear the account copy too or say plainly that it is device-only (D8, `src/ui/ErrorBoundary.tsx:7-19`). Until then, write down and test the manual console procedure so an Art 17 request can actually be honoured. | Reduced | ☐ |
| **M9** | R11 | The backup panel warns accurately and specifically that the file is plain JSON containing people, journal, reflections, priority profile and full AI transcripts, and is "readable by you, and by anyone you send it to" (`src/ui/BackupPanel.tsx:161-163`). Credentials are excluded (`src/ui/backup.ts:58-64`), by an allowlist rather than a denylist (`:235-239`) — the safer design. | Treat as an accepted, disclosed risk. Two notes for the record: the `EXCLUDED_KEYS` guarantee is enforced only by the allowlist's *shape*, so a future change to enumerate `localStorage` would silently defeat it; and `wei_priority_dismissed_v1` is in neither the backup nor the cloud, so a restore silently loses dismissals. Optional passphrase encryption would reduce this further. | Accepted | ☐ |
| **M10** | R12 | Device-side bounds exist: 12 people (`src/ui/profile/ProfileContext.tsx:41`), 5000 journal entries (`src/billing/plans.ts:73`), 50 threads / 400 turns (`src/ui/chat/threadStore.ts:900`). Thread pruning does propagate deletions to the cloud (`src/ui/ChatPanel.tsx:435-437`) — partially, since it only runs while signed in with the panel mounted. | **State a retention period** and enforce it: expire `billing/usage` rows, define what happens to an account that goes unused, and decide whether cloud conversations should have a server-side age limit rather than relying on a device-side prune (OQ-4). | Reduced | ☐ |
| **M11** | R13, R14 | Sync errors are deliberately surfaced rather than swallowed (`src/ui/profile/useJournalSync.ts:73-75`). The merge policies are documented with their reasoning (`:10-14`; `src/ui/chat/useThreadSync.ts:18-22`, `:31-37`). | Say in the app and in the notice **which stores sync and which do not** (§2.3). Consider lifting journal sync out of `src/pages/DateFinder.tsx:131` to a provider, as the profile one is (OQ-6). Consider syncing reflections and priorities, or telling the user plainly that they will not be. | Reduced | ☐ |
| **M12** | R15, and minimisation generally | `wei_ai_key` is never synced, never exported and never written to Firestore — verified by grep and asserted in `.env.local.example:19-21`. | Drop `displayName` / `photoURL` from what the app reads (`src/ui/profile/AuthContext.tsx:70`) if they are not used. Time-bound or clear `wei_signin_email` on an abandoned sign-in (D3, OQ-7). | Reduced | ☐ |
| **M13** | R16 | Terms state 16+ (`src/pages/LegalPages.tsx:172`). | Decide whether a self-declared age gate is warranted, and address the "child" cast-member case in whatever M2 produces. | Reduced | ☐ |
| **M14** | R18 | Both exports are **user-initiated** — a click, never automatic (`src/ui/ics.ts:59-69`, `src/ui/report.ts:134-145`), and the `.ics` is built client-side with no network call. The report carries the honesty footer (`src/ui/report.ts:128`). | Make the `.ics` `SUMMARY` neutral by default (e.g. "Wéi — chosen window") and keep the objective in `DESCRIPTION`, which shared and free/busy calendar views generally do not surface; or offer the choice at the download button (`src/ui/BestDayHero.tsx:185`). Add a one-line warning next to both export buttons that the file names what the reading is for and, for the report, identifies the subject's chart. List both exports in the privacy notice, which currently mentions only the JSON backup (`src/pages/LegalPages.tsx:120-122`). | Reduced | ☐ |

---

## 7. Sign-off and record of outcomes

**To be completed by the controller. The table below is empty on purpose — this draft does
not sign itself.**

| Item | Name / detail | Date |
|---|---|---|
| Measures approved by | | |
| Residual risks approved by | | |
| DPO advice (if any) | *No DPO appointed — see §3* | |
| Solicitor review | *Not yet obtained — required before sign-off* | |
| Data subjects consulted | *Not consulted — see §3* | |
| ICO prior consultation required? (Art 36) | *Only if any residual risk remains High* | |
| Signed | | |

### Residual risk after measures — owner to complete

| Risk | Inherent | Measures applied | Residual | Accepted by | Date |
|---|---|---|---|---|---|
| R1 special-category free text | High | M1, M7 | | | |
| R2 third-party data subjects | High | M2, M3, M7, M14 | | | |
| R3 re-identification | High | M3, M7 | | | |
| R4 AI provider | High | M4, M6, M7 | | | |
| R5 account takeover | High | M5 | | | |
| R6 acting on inferences | High | M6 | | | |
| R7 transparency failure | High | **M7** | | | |
| R8 no erasure path | High | M8 | | | |
| R9 orphaned `meta/profile` | High | M8 | | | |
| R10 consent durability | Medium | M6, M11 | | | |
| R11 backup file | High | M9 | | | |
| R12 no retention limits | Medium | M10 | | | |
| R13 sync asymmetry | Medium | M11 | | | |
| R14 deletions returning | Medium | M11 | | | |
| R15 BYOK key in localStorage | Medium | M12 | | | |
| R16 no age assurance | Medium | M13 | | | |
| R17 unverified deployment state | High until verified | M5 | | | |
| R18 calendar / report export | Medium | M14, M7 | | | |

### Review

| | |
|---|---|
| Review trigger | Any change to what is stored, what syncs, or who receives data — the legal module already carries this instruction at `src/pages/LegalPages.tsx:9-11` |
| Scheduled review date | *(owner to set — 12 months from sign-off is conventional)* |
| Integrated into project plan | `docs/ROADMAP.md:254-259` records the DPIA as a live owner action |

---

## Appendix A — Open questions register

These could not be resolved from the code. **Each one must be answered before this document
is signed.** They are recorded rather than guessed at, because a confident guess in a signed
DPIA is worse than an admitted gap.

**Deployment and configuration (cannot be read from the repo at all):**

- **OQ-1 — Is the `VITE_AI_PROXY_URL` repository secret set for the Pages deploy?**
  (`.github/workflows/deploy-pages.yml:50-52`.) This single unknown decides: whether the live
  site is BYOK-direct-to-Anthropic or proxied through the owner's Cloud Function; whether
  Anthropic is the *user's* processor or the *owner's*; whether a us-central1 hop exists;
  and whether chat requires sign-in at all (`src/ui/ChatPanel.tsx:487`; `functions/src/chat.ts:100-103`).
  The local `dist/` was built from `.env.local` and is **not** evidence about production. The
  code comment at `src/ui/ChatPanel.tsx:68-69` claiming the Pages build is BYOK predates the
  secret being wired into the workflow and is not evidence either — nor is
  `.env.local.example:17-21` ("the LIVE site uses BYOK… There is no server key in
  production"), which is documentation of an intent, written before the relay existed.
- **OQ-12 — Is the `chat` Cloud Function deployed, and what is `REQUIRE_AUTH` on it?**
  The code defaults to `"true"` and warns loudly at cold start if false
  (`functions/src/chat.ts:35-41`), but the deployed value is not in the repo. `"false"` in
  production would mean an unauthenticated, unmetered open Claude proxy on the owner's key.
- **OQ-13 — Are the rules in `firestore.rules` actually deployed?** `firebase.json` points at
  the file but deployment state is not observable from the repo. And: **was any data written
  to Firestore before they were deployed?**
- **OQ-15 — Are the `VITE_FIREBASE_*` secrets set for the Pages build?** They too come from
  repository secrets (`.github/workflows/deploy-pages.yml:44-49`), so even "are accounts live
  on the deployed site" cannot be confirmed from the repo. The owner states they are; that
  statement, not the code, is the evidence.
- **OQ-22 — What is retained in the owner's Google Cloud Logging, and for how long?** If the
  chat relay is live, every request to it produces a Cloud Run / Cloud Functions request log
  entry under the owner's own project — caller IP, user-agent, path, status, timing — for a
  request that carried a Firebase ID token identifying the user (`functions/src/chat.ts:83-84`,
  `:97-110`). That is controller-held personal data with a default retention the repository
  cannot show. Firebase Auth's own sign-in event log is the same question (see OQ-21). Both
  must be read off the console and given a stated retention.
- **OQ-17 — What is the Firestore region?** `firebase.json` declares only the rules file and
  has no `location`; `.firebaserc` names only the project. The brief says europe-west2; the
  code can neither confirm nor deny it. It must be read off the console before it goes in a
  signed document. Note that the Cloud Function **is** pinned to `us-central1`
  (`functions/src/chat.ts:84`), so at minimum the AI relay is a US processing point
  regardless of where Firestore sits.

**Legal determinations (need a solicitor, not an engineer):**

- **OQ-8 — Under BYOK, who is the controller for the transfer to Anthropic?** The user
  supplies the key and contracts with Anthropic directly, but the owner's code composes the
  payload and decides what it contains (`src/ai/chatClient.ts:352-365`). This changes whether
  an Art 28 processor relationship exists on the deployed path at all.
- **OQ-9 — What is Anthropic's retention and training posture for these requests, and does it
  differ between BYOK and the relay?** The privacy notice asserts "No use of your birth
  details, priorities or journal to train any model" (`src/pages/LegalPages.tsx:113`). Nothing
  in the code can support that claim; it must come from Anthropic's terms.
- **OQ-10 — What is the transfer mechanism for the us-central1 relay?** (IDTA / UK Addendum /
  adequacy?) Applies only if the relay path is live (see OQ-1).
- **OQ-11 — Has the owner accepted the Firebase Data Processing Addendum in the console?**
- **OQ-18 — Should a saved conversation be treated as containing birth data?** The system
  prompt's context block genuinely carries none (`src/ai/systemPrompt.ts:102-117`), but stored
  transcripts retain tool results with the four pillars and luck-decade age ranges
  (`src/ai/tools.ts:270-283`, `:394-398`), from which a birth date is closely reconstructible.
  On the evidence the answer is yes — but the owner should make that call explicitly rather
  than inherit it from a code comment.
- **OQ-19 — What is the Art 14 position on cast members** who are not the account holder
  (`src/ui/profile/peopleStore.ts:14-26`)? Does an exemption apply, or is notice required?
- **OQ-21 — What does Firebase Auth retain beyond uid / email / displayName / photoURL?**
  Provider identifiers, creation and last-sign-in timestamps, and any IP / user-agent captured
  for auth events are outside this codebase but are real controller-held data. They must be
  sourced from Firebase documentation, not inferred from the app.

**Product decisions (the owner's call):**

- **OQ-2 — How does the owner intend to satisfy an erasure request today?** Console-by-hand,
  or is the feature in M8 a blocker on signing this?
- **OQ-3 — Is the legacy-client rationale for `users/{uid}/meta/profile` still live?**
  (`src/firebase/client.ts:174-175`.) Is there any deployed build that reads it, or is this
  now pure data accumulation that should be dropped from the write path entirely?
- **OQ-4 — What retention period does the owner intend to state, and what will enforce it?**
  No store has an expiry; the conversation prune is device-side (`src/ui/chat/threadStore.ts:900`);
  `billing/usage` rows are never cleaned up.
- **OQ-5 — Is per-device consent the intent?** `wei_ai_consent` and the `aiConsent` flags never
  sync (`src/ui/ChatPanel.tsx:58`; `src/ui/priorities/prioritiesStore.ts:28`). Defensible if
  deliberate, but it must be stated.
- **OQ-6 — Is it intentional that journal sync only runs on the Date Finder page?**
  (`src/pages/DateFinder.tsx:131` is the sole call site.) It affects what the privacy notice
  can truthfully promise about signed-in records syncing.
- **OQ-7 — Should an abandoned sign-in leave the address in `localStorage` indefinitely?**
  `wei_signin_email` is cleared only inside `completeEmailLink`'s `finally`
  (`src/firebase/client.ts:128-134`).
- **OQ-14 — Keep or drop `outcome.stress`?** A structured, dated 1–5 stress series against a
  named event (`src/ui/journalStore.ts:14-17`) is the most regulator-visible field in the
  product, and it feeds only reflection and confidence wording, never the score.
- **OQ-16 — Is an age gate warranted?** Terms say 16+ (`src/pages/LegalPages.tsx:172`);
  nothing asks.
- **OQ-23 — Should the `.ics` event title name the objective?** Today it does
  (`src/ui/ics.ts:31`), which is the most useful thing for the user and the most disclosing
  thing in a shared calendar. This is a product judgement, not a legal one, but it is the
  cheapest single privacy improvement available in the codebase — see M14 and R18.
- **OQ-20 — Should cloud storage of journal free text be opt-in separately from sign-in?**
  Today it follows automatically (`src/ui/profile/useJournalSync.ts:66-78`). This is the
  concrete form the M1 decision will take.

---

## Appendix B — What was verified, and how

Every citation in this document was checked against the working tree at commit `fabdf1f`
(2026-07-26). Where three independent reviews of the codebase disagreed, the disagreement was
resolved by reading the code and is recorded here:

- **Corrected:** one review reported that conversations pruned locally are *not* deleted from
  Firestore. They are — `src/ui/ChatPanel.tsx:435-437` explicitly calls `remove()` for every
  pruned thread. The control is partial (it only runs while signed in with the panel mounted,
  `src/ui/chat/useThreadSync.ts:223-225`), which is how §6 M10 describes it.
- **Corrected:** the backup schema version is **3**, not 2 — conversations joined the file in
  v3 (`src/ui/backup.ts:36-43`).
- **Corrected:** the chat panel is mounted on two pages, not one
  (`src/pages/DateFinder.tsx:366`, `:460`; `src/pages/ChatPage.tsx:28`). The journal sync hook
  really is mounted on one (`src/pages/DateFinder.tsx:131`).
- **Corrected:** one review stated the Pages build "carries the wei-timing Firebase config, so
  this is live". The repository cannot support that: every `VITE_FIREBASE_*` value comes from a
  repository secret (`.github/workflows/deploy-pages.yml:44-49`). It is recorded as OQ-15.
- **Confirmed by grep:** `loadProfile` and `clearProfile` have no callers in `src/` or `tests/`;
  `saveProfile` is called only from inside `savePeople` (`src/firebase/client.ts:177`).
- **Confirmed:** the only two `fetch()` calls in `src/` are `src/ai/chatClient.ts:365` and
  `src/engine/verification/jplHorizons.ts:97` (test-only, imported by no `.tsx` file — the
  only importer outside the module is `tests/verification/solarTerms.live.test.ts:6`). No
  analytics, no third-party scripts in `index.html`.

### Completeness review, second pass

A later review read the code independently rather than checking the document against itself,
and looked specifically for flows the inventory had missed. What it changed:

- **Added — the two export paths.** `.ics` (`src/ui/ics.ts:28-69`) and the shareable HTML
  report (`src/ui/report.ts:41-145`) were absent from §2.2.3, from minimisation and from the
  risk table. Both are live (`src/billing/plans.ts:27`). Now D9, R18, M14, OQ-23.
- **Added — third-party data leaving via the advisor and the exports.** R2 had confined the
  third-party problem to Firestore storage. It is broader: the advisor and both exports run
  against whichever person is active. §2.5 now spells the chain out and R2's severity is
  raised from Significant to Severe.
- **Added — Google request metadata and the owner's own Cloud Logging.** §2.2.3 had only
  GitHub Pages. Now a row plus OQ-22.
- **Added — the Firebase Auth IndexedDB session store** to §2.2.1, so the device-side
  inventory is genuinely complete rather than complete-for-`localStorage`.
- **Added — two more false statements in the privacy notice** that D5 had missed:
  `src/pages/LegalPages.tsx:103-107` ("no billing records about you") and `:118` ("remove any
  stored person… at any time"). And D8, the error-recovery reset that does not reach the
  account (`src/ui/ErrorBoundary.tsx:7-19` vs `src/ui/profile/ProfileContext.tsx:176-193`).
- **Corrected — two citations.** R1's `` `:14-17` `` read as `useJournalSync.ts` by
  antecedent; it is `src/ui/journalStore.ts:14-17`. §3's "single-rule Firestore design at
  `firestore.rules:11-28`" cited the comment only — the rule itself is `:29-32`, so the span
  is now `:11-32`.
- **Checked and held.** Every other `file:line` in this document was opened and verified. In
  particular these load-bearing claims are accurate as written: `loadProfile` / `clearProfile`
  have no callers and `saveProfile` is reached only through `savePeople`
  (`src/firebase/client.ts:150-159`, `:172-178`); raw journal note text reaches the model
  through no path at all — the sole AI-side reader is `deriveSignals(loadJournal())`
  (`src/ui/ChatPanel.tsx:520`), confirmed by grepping every consumer of `loadJournal` in
  `src/`; `sharedForAi` is the single consent gate and parses the two sensitive flags
  fail-closed (`src/ui/priorities/prioritiesStore.ts:222-223`, `:494-503`); the relay neither
  logs nor persists message content (`functions/src/chat.ts:145-178`); the Firestore rules do
  what §6 M5 says (`firestore.rules:29-37`); the backup allowlist genuinely excludes the
  credential keys (`src/ui/backup.ts:64`, `:233-251`); and all journal mutations really do
  route through the Date Finder, so §2.3's carve-out is correct
  (`src/pages/DateFinder.tsx:288`, `:383-408` are the only call sites of `upsertEntry` /
  `removeEntry` / `recordOutcome` outside the store).
