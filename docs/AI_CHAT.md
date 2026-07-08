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

## Two transports (the one deployment decision)

The app is a static site; a cloud LLM is the first thing that leaves the device, so
it is opt-in and clearly labelled. Where the API key lives is the only choice:

- **BYOK (default, zero backend).** The user pastes their own Anthropic key; it is
  stored only in their browser (`localStorage`) and the request goes straight to
  `api.anthropic.com` with the `anthropic-dangerous-direct-browser-access` header.
  Nothing to host.
- **Serverless proxy (shippable product).** [`api/chat.ts`](../api/chat.ts) is a
  Vercel Edge relay that holds `ANTHROPIC_API_KEY` server-side and forwards the
  Messages-API request, streaming the response straight back. Users need no key.

  ```bash
  vercel env add ANTHROPIC_API_KEY          # your key, server-side only
  VITE_AI_PROXY_URL=/api/chat npm run build  # point the client at the relay
  ```

  With `VITE_AI_PROXY_URL` unset, the client falls back to BYOK automatically.

### Local development — put the key in `.env.local`

`vite.config.ts` mounts a dev-only mirror of the Vercel relay at `/api/chat`, so
`npm run dev` can serve the chat locally with the key kept out of the browser and
out of git. There is nothing to paste into a chat and nothing to commit:

```bash
cp .env.local.example .env.local     # gitignored
# edit .env.local:
#   ANTHROPIC_API_KEY=sk-ant-...      # server-side only, never bundled
#   VITE_AI_PROXY_URL=/api/chat       # point the app at the local proxy
npm run dev                          # restart if it was already running
```

The dev proxy reads `ANTHROPIC_API_KEY` from the environment (Node side) and never
exposes it to the client bundle; `VITE_AI_PROXY_URL` is the only `VITE_`-prefixed
(client-visible) value, and it is just the relay path. Without `.env.local`, the app
falls back to BYOK (paste your own key into the chat setup card — it lives only in
`localStorage`). Health-check the proxy: `curl -XPOST localhost:5173/api/chat` should
answer `500 … add it to .env.local` until the key is set.

Either way the **deterministic engine stays 100% client-side** — only chat text and
the small engine tool-results transit the network. Privacy: only the *derived* chart
summary (Day Master, elements) is sent, never the birth date, time or city.

## Model

Defaults to **`claude-sonnet-5`** (strong, fast, cheap enough for chat, tool use +
streaming). `claude-haiku-4-5` is offered as a cheaper option and `claude-opus-4-8`
as the most capable, selectable in the chat settings.
