# AI chat — a strict explanation shell over the deterministic engine

The chat layer lets you ask open-ended questions ("compare my two best wedding
days next year", "how's 2027 for my career?") and get a conversational answer.
It is **additive and opt-in**: with it disabled or unconfigured, the deterministic
Q&A in *Your profile & best moves* still works exactly as before, and the whole
calculation path stays 100% offline.

## The one rule: the AI never calculates

The model is a **narrator, not a calculator**. It never derives pillars, Ten Gods,
elements, luck pillars, scores, dates, hours or 太歲 from its own knowledge. Every
number it cites comes from a **tool call**, and each tool is a thin wrapper over an
existing deterministic engine function executed **locally in the browser**. The
guardrails live in [`src/ai/systemPrompt.ts`](../src/ai/systemPrompt.ts):

- never compute — call a tool and cite what it returns; if a tool can't provide a
  figure, say so;
- tendencies, not predictions — no "will happen", no amounts, no probabilities;
- refuse to invent systems the engine doesn't compute (Flying Stars, Qi Men, Zi
  Wei, 神煞 beyond a tool result);
- stay in scope; surface conflicts and 犯太歲 / hard taboos honestly.

## Architecture — a client-orchestrated tool loop

Because the engine runs in the browser, the tool loop is orchestrated client-side
([`src/ai/chatClient.ts`](../src/ai/chatClient.ts)); any proxy is a stateless relay.

```
Browser: system prompt (guardrails + derived chart summary) + user question
  → POST to Claude (proxy or BYOK), stream: true
  ← tool_use: e.g. find_best_days("wedding_marriage", 365)
Browser: execute the tool LOCALLY via the engine (evaluateDecision / buildPeriodsReport / …)
  → POST the tool_result back → Claude
  ← streamed text answer, citing the engine's numbers
```

The tools ([`src/ai/tools.ts`](../src/ai/tools.ts)), each a deterministic engine call:

| Tool | Engine call | Returns |
|---|---|---|
| `list_objectives` | `OBJECTIVES` | the 11 timeable decisions |
| `get_chart_summary` | `analyzeProfile` + chart | Day Master, strength, 用神/忌神 — **no birth data** |
| `get_natal_chart` | `BaziChart` table lookups | the full chart: four pillars (hanzi + pinyin + animals), hidden stems (藏干) with Ten Gods, Na Yin, palaces, five-element balance, functional element map, seasonal state + rooting, personal stars (天乙貴人/桃花/驛馬) — **free: transparency is never gated** |
| `get_profile_fits` | `analyzeProfile` | the full ranking of all 11 objectives, best and worst fits with reasons — **free** |
| `get_priorities` | `sharedForAi` + `deriveSignals` | what the user SAID matters: ranked life areas, stated intentions, optional context, aggregate journal counts — **free**, and field-level consent-gated (below) |
| `get_luck_pillars` | `buildPeriodsReport` | 大運 decades with theme, valence, which is active |
| `get_period_summary` | `buildPeriodsReport` | 流年 (+ optional 流月): theme, valence, 太歲, tendencies — any year |
| `find_best_days` | `evaluateDecision` | ranked days with score, verdict, best hour |
| `evaluate_specific_day` | `evaluateDecision` (1-day window) | one day's pillar, officer, day-god, sub-scores, life areas. `objectiveId` is optional — omitted, it falls back to the neutral `general_day` reading, so "how is 14 Oct 2027 for me?" just works |

There are no tiers (Phase 15): every tool answers for every user. The only ceiling anywhere
in the chat stack is the hosted proxy's daily message allowance — an abuse bound on metered
token spend, not a product; BYOK chat never touches it.

`executeTool` is pure and unit-tested ([`tests/aiTools.test.ts`](../tests/aiTools.test.ts));
the streaming loop is tested with a stubbed SSE transport
([`tests/aiChatClient.test.ts`](../tests/aiChatClient.test.ts)); the chat-UI helpers
(date tokens, suggested chips) in [`tests/chatUiHelpers.test.ts`](../tests/chatUiHelpers.test.ts).

## Memory — the transcript is ours, not the provider's

A conversation survives a reload, a route change, and a change of model, because
**this app stores the thread and replays it**. There is no provider-side conversation
state anywhere in the stack: the Messages API is stateless, every request carries the
history in its own body, and no request references a server-held conversation id.

### What is stored

The whole transcript — user turns, assistant turns, and the `tool_use` / `tool_result`
blocks between them — plus, per turn, **when** it happened (`at`, epoch ms) and, for
assistant turns, **which model wrote it** (`model`). Offline-advisor exchanges are stored
in the same thread as a third turn kind, so a conversation survives switching between the
offline advisor and AI chat.

Storage is **local-first** (`localStorage`), and syncs to Firestore
`users/{uid}/ai_threads/{threadId}` **only while someone is signed in**. With Firebase unconfigured, or nobody signed in, the local
path is fully functional on its own and nothing is uploaded. Both destinations are the
user's own: their device and their account, and nowhere else. UI copy must track that
distinction — "stays on this device" is only true when sync is off, so the panel adds
"and in your account" exactly when `auth.enabled && auth.user`
([`ChatPanel.tsx`](../src/ui/ChatPanel.tsx), [`ChatPage.tsx`](../src/pages/ChatPage.tsx)).
The offline advisor is local in the sense that matters most — the *answer* is computed on
device and no model is called — but its transcript is stored on exactly the same terms,
so it makes the same conditional claim, not a blanket one.

### What is replayed

A **bounded window** of that transcript, on every request, rebuilt from scratch each time
(`replayWindow` → `prepareHistory`). Selection walks backwards from the newest
exchange, taking **whole exchanges** while the token budget allows, so a boundary never
falls between a `tool_use` and its `tool_result`. When the newest exchange alone is over
budget it is sent whole anyway and flagged `overBudget` — splitting it would break a pair,
which the API rejects outright. The full thread stays visible in the UI; where the boundary
fell, the UI says so and the model is told too (defence 3 below) — context the user can
still see is never silently dropped.

### What is deliberately NOT there

- **No provider-side memory.** Nothing is retained between requests by the API. If it
  isn't in the array we just sent, the model does not have it.
- **No cross-conversation recall.** Threads are isolated; nothing leaks from one to
  another, and nothing is summarized into a hidden profile.
- **No hidden history.** The system prompt states this outright, so the model cannot imply
  it remembers something outside the transcript it was handed.
- **No date markers in storage.** The `(sent …)` prefixes exist only on the wire, so they
  can't accumulate across re-sends. `prepareHistory` is pure; the stored transcript is
  never mutated.

**Switching models continues the thread — because we hold the transcript.**
`claude-sonnet-5` → `claude-opus-4-8` → `claude-haiku-4-5` mid-conversation all pick up the
same context; the context was never the provider's to hold, so there is nothing to migrate.
The choice is per turn, not per thread. Each assistant turn records the model that wrote it,
the replay window carries that `model` through, and `historyContextBlock` names any earlier
model in the request — so the UI can show who said what and the model is told plainly that
some earlier turns were not its own. The prompt turns that into a rule: continue normally,
but claim no memory of writing them.

### The caps are abuse bounds

Nothing about memory is a tier — every cap here exists to bound storage and metered token
spend, and none of them is a thing to buy:

| Bound | Value | Why |
|---|---|---|
| Replay window | `DEFAULT_REPLAY_BUDGET_TOKENS` = 12,000 est. tokens | request size; the rest of the thread stays on screen |
| Threads kept | `DEFAULT_THREAD_LIMITS.maxThreads` = 50 | `localStorage` is finite; oldest unpinned go first, pinned threads are never pruned |
| Turns per thread | `maxTurnsPerThread` = 400 | one runaway thread can't evict every other one |
| Hosted-proxy messages/day | see above | metered spend on a relay we pay for; BYOK chat never touches it |

Pruning is never silent: `pruneNote` names what was dropped, and `replayWindow` reports
`omittedTurns` / `omittedFrom` / `omittedThrough`, which the panel turns into a line saying
where the boundary fell. `pruneThreads` also guarantees a pinned thread is never removed
and that at least one unpinned thread always survives, so the conversation someone is in the
middle of can't be deleted out from under them.

### The staleness rule — an old reading is never today's answer

This is the correctness risk the memory feature creates, and it matters more here than
in a general chatbot: a thread from three weeks ago contains tool results computed for
*that* date and an assistant turn that said *"your best day is [2026-08-14]"*. Replayed
carelessly, a decision-timing app would restate it as current. The rule: **a reading
computed on an earlier date is never today's answer.** Four defences hold it up.

1. **The payload stamp — `computedOn`, and it is the load-bearing one.** `executeTool`
   ([`tools.ts`](../src/ai/tools.ts)) stamps each object result with the date it was
   produced, so staleness is checkable from the payload itself rather than inferred from
   where a block sits in the transcript. It is the only defence that survives every
   transformation the replay path performs — merging, windowing, sanitizing — which is why
   the prompt is written to lean on it and to treat a result **without** a `computedOn`
   (an older stored thread, or the synthesized "result was lost" marker) as undated, and
   therefore as stale.
2. **The wire marker — `(sent YYYY-MM-DD)` on user turns the app can date.** `dateTurn`
   ([`chatClient.ts`](../src/ai/chatClient.ts)) prefixes a user turn with
   `turnDateMarker` ([`systemPrompt.ts`](../src/ai/systemPrompt.ts)) when the turn carries a
   recorded `at` whose day is not today — so "earlier" is a concrete day. Deliberately
   **not** the `[YYYY-MM-DD]` form, which is reserved for dates the model writes and the UI
   renders as tappable day links. This defence is a **hint, not a guarantee**, and the
   prompt says so: a turn carrying `tool_result` blocks is never marked (plumbing, not
   something the user said), a turn with no recorded `at` cannot be marked, and merging
   adjacent same-role turns keeps only the first turn's date. **An unmarked turn is
   therefore undated, not "today"** — nothing may be dated from a missing prefix. The marker
   exists **only on the wire**: `prepareHistory` is pure, the stored transcript stays clean,
   and markers can't accumulate across re-sends.
3. **A per-request context block** (`historyContextBlock`) states today's date, how far
   back the replayed window reaches, how many earlier turns were pruned out of *this*
   request, and which other models wrote part of the thread. It also repeats rule 2's
   caveat, so the model never reads an unmarked turn as current.
4. **The system prompt makes the rule non-negotiable**: today's date is authoritative and
   overrides any date in the transcript; a result whose `computedOn` is not today (or that
   has none) is stale and may not be quoted as current; an earlier **assistant** turn is
   dated evidence on the same terms as a tool result; anything time-sensitive — best days,
   "how is this week", the active 大運 decade, this year's 流年, any window counted from
   today — must be **re-called**, even if the same question was answered earlier in the
   same thread, and when the model can't tell how old something is, it re-calls. Referring
   back is fine when it is dated ("when you asked in June, the engine rated…").

Defences 2 and 3 depend on the replay window carrying each turn's `at` (and, for the model
note, its `model`) out of storage and into the request. That plumbing is the thing to check
first if the markers ever go quiet: with `at` dropped, `dateTurn` becomes a no-op that
*fails silently* — every turn simply looks unmarked. Asserted end-to-end against the request
bodies in [`tests/aiChatClient.test.ts`](../tests/aiChatClient.test.ts) and
[`tests/chatThreads.test.ts`](../tests/chatThreads.test.ts).

Stale results are **kept** in the transcript rather than scrubbed: they are what was said
at the time, and the user can still scroll to them. What changes is how they may be used.

### Replaying a stored transcript without a 400

A persisted thread is not automatically a valid request body. The Messages API rejects an
unmatched `tool_use`/`tool_result` pair, consecutive same-role messages, empty content, and
a history that opens on an assistant turn — and a real thread can contain all four (the
user pressed **Stop** mid-tool-loop; the replay window sliced mid-exchange).
`sanitizeHistory` ([`chatClient.ts`](../src/ai/chatClient.ts)) repairs rather than
transmits-and-fails:

| Damage | Repair |
|---|---|
| `tool_use` with no recorded result (interrupted turn) | synthesize a *"result was lost, call the tool again"* marker — never a fabricated reading, so the assistant's text survives and the model re-calls |
| `tool_result` answering nothing (its `tool_use` was pruned away) | drop the block; drop the message if nothing is left |
| consecutive same-role turns | merge, hoisting `tool_result` blocks to the front (the API requires them first) |
| window opens on an assistant turn | drop leading assistant turns |
| empty strings / empty content arrays | drop |

`prepareHistory` = sanitize → date → strip. The strip matters: `at` and `model` are our
bookkeeping and the API rejects unknown fields on a message. The function is pure — the
stored transcript is never mutated — and the invariants are asserted directly against the
request bodies in [`tests/aiChatClient.test.ts`](../tests/aiChatClient.test.ts).

## The priority layer — stated goals, field-level consent

The app has always known the user's *chart*. `get_priorities`
([`src/ui/priorities/prioritiesStore.ts`](../src/ui/priorities/prioritiesStore.ts)) is how it
learns what they actually **want** — and the guardrails around it are as strict as the
never-compute rule:

- **Priorities are stated goals, never chart facts.** The system prompt requires the model to
  attribute them to the user ("you told the app…"), never to the tradition.
- **Priorities never change a day's score.** `recommendationScore` stays a strict function of
  chart + date + objective + doctrine. What priorities change is *what gets surfaced first*, plus
  a separate, clearly-labelled **priority fit** axis shown alongside the classical score. The
  prompt forbids the model from ever claiming a day rated higher "because it matters to you".
- **Consent is per field.** `areas`, `intentions`, `context` and `journal` each have their own
  flag — areas + intentions **on** by default, **context off**, **journal off**. `sharedForAi` is
  the single gate; the tool never reads the raw profile for output. A field the user hasn't shared
  is **absent** from the result and named in `withheld`, with an explicit instruction not to guess
  at it — so a missing field can't be quietly hallucinated back in. `notSet` is reported
  separately, so "hasn't said" and "won't share" are never conflated.
- **Raw journal text never leaves the device — and there is no toggle for it.** The `journal` flag
  gates *aggregate counts only* (`savedDecisions`, per-area totals, how many were followed up),
  derived by `deriveSignals`; it is off by default because it is *inferred behaviour* rather than
  something the user said. The notes themselves are excluded at the source, not gated: no setting
  puts them in the payload. Asserted by test. See [DECISIONS.md §10.4](DECISIONS.md) for why the
  note text gets a hard exclusion rather than a default.
- **Suggested chips respect consent too**: a chip naming a withheld field would put it in the
  transcript by another route, so `ChatPanel` gates the priority chips on the same flags.

### Journal → suggestions (suggest-and-confirm)

[`src/ui/priorities/deriveSignals.ts`](../src/ui/priorities/deriveSignals.ts) is a pure function
from journal entries to *suggestions*: which life areas someone's saved decisions imply they care
about. The objective → life-area mapping is **derived from the engine's own metadata** (an
objective's `godBias`, routed through `lifeAreas.ts`'s Ten-God → area routing, led by its
`primaryTag` where the almanac activity names a domain the bias can't) rather than being a second
opinion hardcoded alongside the engine. `general_day` contributes nothing — reading a day says
nothing about what the reader cares about.

Suggestions need real evidence (≥3 saved decisions overall, ≥3 touching the area, ≥2 whole
decisions of weight) and always travel with that evidence — *"3 saved decisions point here — 3 ×
Start a job / accept a role"*. **Nothing is ever written to the profile without an explicit press
of Add**; "Not right now" is remembered in a separate store
([`dismissedSignals.ts`](../src/ui/priorities/dismissedSignals.ts)) so a declined suggestion is
never mistaken for an answer. Tested in
[`tests/deriveSignals.test.ts`](../tests/deriveSignals.test.ts).

## Tappable dates

The system prompt requires every date the model names to be written as `[YYYY-MM-DD]`.
`ChatPanel`'s renderer ([`src/ui/chatDates.ts`](../src/ui/chatDates.ts)) turns those tokens
(and bare ISO dates, as a fallback) into readable chips linking to `#/day/<date>` — any
date the advisor cites is one tap from the deterministic evidence behind it. Personality
questions are answered from `get_natal_chart` facts, with the reading explicitly labelled
as interpretation, never prediction.

## Suggested chips — profile-aware

The empty-thread suggestions are built from the user's **actual chart**
([`src/ui/chatChips.ts`](../src/ui/chatChips.ts)): their top objective fit, their weakest
fit (or chart caution), hidden stems, today's reading. Every chip leads to a full answer
for every user — no chip is conditional on anything.

When priorities are set, `ChatPanel` prepends chips for the user's **top-ranked area** and their
first **intention** (both free, both consent-gated, list still capped at six), so the panel opens
on what they said they're working on rather than on what their chart happens to be good at.

## No key? The chat is never a dead end

With neither a key nor a proxy configured, the panel runs an **offline advisor** instead
of showing a key wall: the same input box routes each question through the deterministic
advisor (`parseAdvisorQuery` → `composeTimingAnswer` / `composeProfileAnswer` /
`composeUnknownAnswer` in [`src/engine/advisor.ts`](../src/engine/advisor.ts)), with every
answer labelled *"Offline advisor — deterministic, no AI"*. **No model is called and no
question is sent anywhere**: the answer is computed on device, from the same engine.

Its *storage* is a separate claim, and the copy must keep the two apart. Offline exchanges
are written into the same thread as AI ones, so they follow the same rule as everything else
under *Memory*: local-first, and synced to the signed-in user's account when sync is on.
"Nothing leaves your browser" is therefore true of the **computation** and false of the
**transcript** whenever someone is signed in, so the panel says the answer is computed on
device and no model is called, and states where conversations are kept conditionally —
the same `auth.enabled && auth.user` test the AI branch already uses.

The AI setup (consent + key + model) lives in a collapsible underneath.

## Deployment: GitHub Pages (static) → BYOK

The app ships to **GitHub Pages**, a static host with no backend (see
[`.github/workflows/deploy-pages.yml`](../.github/workflows/deploy-pages.yml)). A
cloud LLM is the first thing that leaves the device, so it is opt-in and clearly
labelled — and with no server, the live site uses **BYOK (bring your own key)**:

- The visitor pastes their own Anthropic key into the chat setup card; it is stored
  only in their browser (`localStorage`) and the request goes straight to
  `api.anthropic.com` with the `anthropic-dangerous-direct-browser-access` header.
  Nothing to host, no server key.

The deploy workflow builds without `VITE_AI_PROXY_URL` (and `.env.local` is gitignored
/ absent from CI), so the published bundle carries no proxy and always falls back to
BYOK. There is no Vercel or other serverless dependency.

### Local development — a dev proxy so you don't paste a key in the browser

For your own local work, `vite.config.ts` mounts a dev-only relay at `/api/chat` (it
runs only under `vite serve`, never in the build). Put your key in `.env.local` and it
is read server-side, never bundled:

```bash
cp .env.local.example .env.local     # gitignored
# edit .env.local:
#   ANTHROPIC_API_KEY=sk-ant-...      # read only by the dev proxy, never bundled
#   VITE_AI_PROXY_URL=/api/chat       # point the app at the local dev proxy
npm run dev                          # restart if it was already running
```

Health-check: `curl -XPOST localhost:5173/api/chat` answers `500 … add it to .env.local`
until the key is set. Leave `.env.local` out entirely and local dev uses BYOK too, just
like production. (Don't set `VITE_AI_PROXY_URL` for a production build — there is no
proxy on Pages.)

The **deterministic engine stays 100% client-side** — only chat text and
the small engine tool-results transit the network. Privacy: only the *derived* chart
summary (Day Master, elements) is sent, never the birth date, time or city.

## Model

Defaults to **`claude-sonnet-5`** (strong, fast, cheap enough for chat, tool use +
streaming). `claude-haiku-4-5` is offered as a cheaper option and `claude-opus-4-8`
as the most capable, selectable in the chat settings.

The choice is **per turn, not per thread**: switch mid-conversation and the same thread
continues with the same context, because the transcript is ours and the replay window is
rebuilt for whichever model answers next (see *Memory*, above). Nothing is migrated, because
nothing was ever held provider-side. Each assistant turn records the model that wrote it, so
the thread stays readable as a mixed-model conversation rather than pretending one model
wrote it all — and the next request tells that model plainly which turns were not its own.
