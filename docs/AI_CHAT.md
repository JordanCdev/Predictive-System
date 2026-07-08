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
| `get_luck_pillars` | `buildPeriodsReport` | 大運 decades with theme, valence, which is active |
| `get_period_summary` | `buildPeriodsReport` | 流年 (+ optional 流月): theme, valence, 太歲, tendencies |
| `find_best_days` | `evaluateDecision` | ranked days with score, verdict, best hour |
| `evaluate_specific_day` | `evaluateDecision` (1-day window) | one day's pillar, officer, day-god, sub-scores, life areas |

`executeTool` is pure and unit-tested ([`tests/aiTools.test.ts`](../tests/aiTools.test.ts));
the streaming loop is tested with a stubbed SSE transport
([`tests/aiChatClient.test.ts`](../tests/aiChatClient.test.ts)).

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
