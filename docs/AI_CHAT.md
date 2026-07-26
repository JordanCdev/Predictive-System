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
answer labelled *"Offline advisor — deterministic, no AI"* and nothing leaving the device.
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
