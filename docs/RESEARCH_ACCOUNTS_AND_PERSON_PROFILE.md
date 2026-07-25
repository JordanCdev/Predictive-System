# Research brief — accounts, and a profile of *the person* (not just their chart)

**For:** an external deep-research run (ChatGPT or similar). Self-contained — assumes no access
to the codebase.
**Date:** 2026-07-25. **App:** Wéi — a deterministic Chinese-metaphysics (BaZi + Tong Shu)
decision-timing planner. Web app, React + TypeScript, engine runs entirely in the browser.
Free/Pro/Lifetime tiers via Stripe. See `DEEP_RESEARCH_BRIEF.md` for the full product/engine
description; this document covers one specific question in depth.

---

## 0. The question in one paragraph

The app knows a user's **birth chart** (八字 — the eight characters from their date, time and
place of birth) and scores every day against it. It does **not** know the person: what they're
trying to build, what they're worried about, what actually matters to them this year. It also
has no working accounts, so nothing they accumulate survives a cleared browser. We want to add
(a) real accounts and (b) a persistent "what this person cares about" profile that grows over
time — plausibly fed by the journalling feature that already exists. This brief sets out
exactly what's there today, the design tensions, and the questions we want researched.

---

## 1. What exists today (verified against the code, not assumed)

### 1.1 Accounts — built, but switched off

Google sign-in via Firebase Auth, per-user Firestore storage, security rules scoped to
`users/{uid}/…`, and an ID-token-authenticated Cloud Function proxying the AI advisor are all
**implemented and complete**. They activate only when `VITE_FIREBASE_*` build variables are
present.

They are not present. The repository has no CI secrets configured and the deployed bundle
contains no Firebase key, so on the live site `firebaseEnabled === false`: the sign-in button
never renders, and **all user data lives in one browser's `localStorage`**. Consequences today:

- Clearing site data destroys the user's chart, saved people, and entire decision journal.
- No cross-device continuity — a chart built on desktop doesn't exist on the phone.
- Paid tiers are effectively unenforceable and unrestorable without an identity.
- No export/import escape hatch exists either, so there is currently no way to move data at all.

Turning this on is configuration, not code: someone must create the Firebase project, enable
Google auth, and add six build variables.

### 1.2 Profiles — real, but they are *charts*, not *people*

A user stores a cast of people (self, partner, co-founder, child; free tier 1, Pro 6). Each
record holds **only birth data**: date, time, sex, time-certainty, timezone offset, IANA zone,
birth city, longitude, and which calendrical convention to use. Plus a display label and a free-text
relation string ("partner", "dad").

That is identity for *calculation*. There is no field anywhere for goals, priorities, values,
life stage, occupation, what they're worried about, or what they want from the app.

### 1.3 Journal — collects the right signal, composes into nothing forward-looking

Users can save a decision they've made. Each entry snapshots: objective (e.g. "signing a
contract"), the date chosen, the score and verdict at save time, the recommended hour, and a
free-text note. Later they can record an **outcome**: how it went (great/good/mixed/poor),
stress 1–5, whether the timing advice felt helpful, and notes.

A summary function reports this back honestly — how many logged, what fraction said it helped,
and whether higher-scored days *tended* to feel better — explicitly labelled as within-user
reflection and **not** evidence the method predicts outcomes.

**The gap:** this is a rear-view mirror. Nothing derived from it changes what the app shows
next. It records what you did and how it felt; it never learns what you're *for*.

### 1.4 How personalized the scoring already is (this was mis-stated once; here are the real numbers)

Each day's 0–100 recommendation score is a weighted blend of four evaluators:

| Evaluator | What it is | Personal? | Weight range across objectives |
|---|---|---|---|
| `officer` | 12 Day Officers (建除十二神) — a calendar property of the day | **No** — same for everyone | 0.28 – 0.40 |
| `road` | Day god (黃道黑道) — also a calendar property | **No** | 0.14 – 0.22 |
| `personal` | Fit against the user's chart: Ten Gods, favourable elements, natal-branch relations | **Yes** | 0.28 – 0.40 |
| `hour` | Best double-hour, scored against the user's chart | **Yes** | 0.10 – 0.20 |

That base is then blended 60/40 with the mainstream almanac's 宜/忌 verdict for the activity
(an impersonal, shared benchmark), and finally a **personal-clash ceiling** caps any day that
clashes the user's own chart out of the Good/Excellent bands regardless of how well it scored.

So: for a career-move query (`personal` 0.40 + `hour` 0.16), chart-derived signal is 56% of the
base score and about **34% of the final number**, plus a clash rule that can dominate outright.
Two users with different birth data genuinely get different scores for the same day — that is
the core of the product. What is fixed is *reproducibility*: identical inputs (chart, date,
objective, convention) always produce an identical number and a matching hash. Those are
different claims and should not be conflated.

**Also relevant:** the app already lets intent steer scoring — the 11 objectives each carry
their own weight profile, so "signing a contract" and "a medical procedure" weigh the same day
differently. But that intent is **per-query and forgotten**. Nothing persists.

### 1.5 So the missing layer, precisely

The app has:
1. **Who you are astrologically** (birth chart) — persistent. ✅
2. **What you're doing right now** (objective for this one search) — transient. ⚠️
3. **What you did and how it felt** (journal) — persistent but inert. ⚠️
4. **What you care about / are working toward** — *does not exist*. ❌

---

## 2. Design tensions we want researched (not yet decided)

### 2.1 Should stated priorities affect the score, or only what gets surfaced?

Options as we see them:

- **Surfacing only.** Priorities decide what leads the page, which life-area gauges come first,
  which objectives get suggested, what the advisor volunteers, what a notification fires about.
  The number itself stays a function of chart + calendar + objective.
- **Score-affecting.** A persistent priority vector re-weights the MCDA (someone in a
  wealth-building year weights `personal` fit toward Wealth-god days), becoming a fourth input
  alongside chart, date and objective — and part of the reproducibility hash.
- **Hybrid.** Surfacing now, data modelled so scoring can follow without migration.

The tension: the app's credibility rests on every number decomposing into cited classical rules.
Preference weighting is a **modern product decision with no classical warrant** — so if it
enters the score, it must be visibly separable ("your priorities moved this day +6") rather than
silently folded in, or the transparency claim degrades. Note the tradition *does* have an
analogue: a consulting practitioner absolutely asks what the client wants before recommending a
date. The question is whether that belongs in the arithmetic or in the conversation around it.

### 2.2 How does the profile get built — asked, inferred, or both?

Explicit setup goes stale and adds onboarding friction; pure inference is empty for new users
and risks feeling like surveillance. A hybrid (short setup, refined by journal-derived
suggestions the user accepts or dismisses) is our instinct but unvalidated.

### 2.3 What is this data, exactly?

Life goals, worries, health concerns and relationship status are meaningfully sensitive — more
so combined with a birth date and place, which is already quasi-identifying. Storing it in the
cloud is a materially different privacy posture from today's local-only reality.

---

## 3. Questions for the deep-research run

### A. Doctrine and method

1. **Practitioner intake.** How do professional BaZi / date-selection consultants actually
   structure a client consultation? What do they ask before recommending dates, and how does the
   client's stated goal alter their method (choice of 用神, which pillars they weight, which
   神煞 they check)? Sources: published practitioner curricula, Joey Yap / Raymond Lo / Jerry
   King teaching materials, Chinese-language 擇日 texts.
2. **Classical precedent for goal-weighting.** Is there textual warrant in 擇日 literature
   (協紀辨方書, 選擇求真, 董公選要覽) for weighting day selection by the client's *priorities*
   as distinct from the *activity type*? Or is activity-type the only recognized lever, with
   everything else practitioner judgement?
3. **用神 and life priorities.** The favourable-element (用神) determination is chart-derived.
   Do any lineages adjust the useful god based on what the person is trying to achieve
   (wealth vs health vs scholarship), or is that considered a doctrinal error?
4. **Life-stage weighting.** Do the 大運 (10-year luck pillar) frameworks imply that certain
   life areas *should* be prioritized at certain ages — i.e. could a "what you care about"
   profile be partly derived from the chart itself rather than only asked?

### B. Product design — preference profiles that don't feel creepy

5. **Category benchmarks.** How do the leading apps in adjacent categories build a persistent
   personal profile: astrology (Co–Star, The Pattern, Sanctuary), habit/journalling (Day One,
   Reflectly, Stoic), and health (Oura, Whoop)? Specifically: onboarding depth vs completion
   rate, how they present inferred traits, whether users can correct inferences.
6. **Journalling as profile input.** Evidence on what makes journalling features retain users
   past week 4. Does reflecting derived insight back ("you keep choosing career days") increase
   or decrease engagement? Any research on users feeling *surveilled* by their own logs?
7. **Prompt design.** For a goals/priorities intake, what elicits durable answers rather than
   aspirational noise? (Values-card sorts? Fixed life-area sliders? Free text with extraction?
   Annual "intentions" framing — the app already has a 天/地/人/心 reflective prompt block.)
8. **Staleness.** How should a priorities profile decay or prompt review? Annual? On luck-pillar
   change? On journal drift?

### C. Accounts, identity and data portability

9. **Minimum viable account** for a client-side app whose engine needs no server. Is Google-only
   sign-in acceptable in the target markets (UK, SE Asia, Chinese diaspora), or are
   Apple/email-link/passkeys table stakes? Any market where Google auth is a hard blocker?
10. **Account-less sync alternatives** worth considering before committing to Firebase:
    export/import files, QR-based device pairing, passkey-derived encryption, local-first CRDT
    sync (e.g. Automerge/Yjs + a relay). Trade-offs for a solo maintainer.
11. **Migration.** Best practice for moving existing `localStorage`-only users onto accounts
    without data loss or a forced signup wall — including the merge conflict when someone has
    different local data on two devices and signs in on both.
12. **What competitors gate behind an account** in this category, and whether requiring signup
    depresses conversion more than losing data does.

### D. Privacy, trust and regulation

13. **Classification of the data.** Under UK/EU GDPR, does a stored profile combining birth
    date/time/place with life goals, health worries or relationship status constitute special
    category data? What changes if the AI advisor sees it? What if outcome ratings mention
    health events?
14. **Disclosure and consent** patterns that keep this trustworthy: what must be said at the
    point of collection, what deletion/export rights must be honoured, and how other
    astrology/wellness apps have got this wrong publicly (enforcement actions, press incidents).
15. **AI exposure.** The advisor is a Claude tool-loop. If a priorities profile is injected as
    context, what should the disclosure be, and should sensitive fields be excludable per-field
    by the user?

### E. The scoring decision (the sharpest question)

16. Given §2.1: **should stated priorities enter the day score at all?** We want an argued
    recommendation, weighing (a) doctrinal defensibility, (b) whether users experience
    preference-weighted scores as more useful or as gamed, (c) the transparency cost, and
    (d) whether competitors do it and how they explain it.
17. If yes: **how should it be surfaced** so it stays honest — a separate "fit with your
    priorities" axis shown alongside the classical score? A visible delta? A toggle to see the
    unweighted number?
18. **Comparability.** If preferences move scores, a "72" is no longer comparable between two
    users or across a user's own priority changes. Does that matter in practice, and how do
    other personalized-scoring products (credit, fitness readiness, sleep scores) handle the
    same problem?

### F. Tier placement

19. The app's settled rule is: **paid tiers buy range, breadth and storage — never the
    correctness, transparency or honesty of a reading.** Where does a priorities profile fall?
    Our instinct: the profile and its effect on surfacing are free (it's basic personalization);
    depth-of-history and cross-profile features are Pro. We want this challenged — including
    whether accounts themselves should ever be a paid feature (we think not).

---

## 4. Our current thinking (critique this rather than starting fresh)

- **Accounts should be turned on, and should stay optional.** Local-first remains the default;
  signing in adds durability and sync. But an export/import escape hatch should ship regardless
  and immediately, because today a cleared cache silently destroys everything.
- **The profile should be three thin layers, not one big questionnaire:** (i) *stated
  priorities* — a small ranked set of life areas plus free-text intentions, revisited annually or
  on luck-pillar change; (ii) *derived signals* — what they actually search, save and rate,
  surfaced as suggestions to accept or reject, never silently applied; (iii) *life context* —
  optional facts (life stage, occupation, what's coming up) that mainly serve the advisor.
- **Start with surfacing, not scoring.** The cheapest large win is that the app stops treating
  every user as arriving blank: Today leads with what they care about, the advisor opens knowing
  their situation, notifications are relevant. Scoring changes can follow if research supports
  them — but they should probably appear as a *separate axis* next to the classical score rather
  than blended into it.
- **The journal is the engine of this**, and it needs one honest inversion: today it asks "how
  did it go?" after the fact. It should also ask "what are you working on?" — which is the same
  data, collected before rather than after, and far more useful.

## 5. What we are explicitly not asking

We are not asking whether BaZi works. The app's stated position is that it is a transparent,
reproducible decision-support tool grounded in a classical tradition, with no outcome-prediction
claim, and that position is not under review here.
