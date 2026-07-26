# ROADMAP — AI chat, time navigation & macro forecasting

This document is the implementation plan for the next phase: a **conversational AI layer**, **past/future time navigation** (day → month → year → 10-year luck pillar), and a **macro annual/monthly forecast** driven by the person's luck cycle and BaZi chart. It is grounded in (a) the current codebase, (b) research into Joey Yap's planner products and competitor apps, and (c) the traditional 大運/流年/流月 methodology. Everything stays true to the app's contract: **deterministic engine, explanations never invent calculations, honest about tendencies vs. outcomes.**

---

## 0. Where the app is today (and how the DOB flow works)

The engine (`src/engine/`) is a deterministic BaZi + Tong Shu day-selection kernel. Adding a **date of birth** is the switch from "general almanac" to "personalized reading":

1. **Input** — `src/ui/PersonalizeCard.tsx`: birth date, time (or "time unknown"), sex, and a **city** (auto-fills timezone + longitude from `src/ui/cities.ts`); an Advanced drawer overrides tz / longitude / convention.
2. **Normalize** — `src/engine/request.ts` `canonicalizeBirth()`: builds the engine input, records missing fields, and downgrades solar→civil time (with a warning) when longitude is absent.
3. **Build the chart** — `sexagenary.ts` → `bazi.ts`: four pillars, hidden stems, Ten Gods, Day-Master strength (incl. 從格/專旺), favourable/unfavourable elements (用神/忌神), and the 大運 luck-cycle timeline (`computeDaYun`).
4. **Re-score** — `decision.ts` adds a personal sub-score + best hours to every day; `periods.ts` produces the Year & Month outlook; the almanac cross-check and confidence run.

What already exists that this plan builds on:
- **Goal-first date finder** (`advisor.ts` `matchObjective` + `evaluate`) — Joey Yap's TongShu Power Planner uses exactly this "state a goal → ranked dates with reasons" inversion. We already have the spine.
- **Deterministic Q&A** (`advisor.ts` `parseAdvisorQuery` / `composeTimingAnswer` / `composeProfileAnswer`, rendered as a thread in `ProfilePanel.tsx`) — the AI chat **replaces the `compose*` prose step** with an LLM while keeping the deterministic intent-parse + engine-evaluate steps.
- **Period summaries** (`periods.ts`: 大運 / 流年 / 流月 + interaction sentence) — currently mechanical (element tailwind/headwind + branch clashes). Feature B deepens this into the macro luck-cycle reading.
- **Luck pillars** (`bazi.ts` `computeDaYun`, `DaYun`/`LuckPillar`) — data already computed; needs a UI scrubber and richer per-decade themes.

---

## 1. The three deliverables

| # | Deliverable | New / extends | Backend needed? |
|---|---|---|---|
| A | **Time navigation** — browse past/future days, months, years, and a life-spanning luck-pillar scrubber | extends `periods.ts` + new UI | No (deterministic, client-side) |
| B | **Macro forecasting engine** — 大運/流年/流月 read against the chart with Ten-God themes, interaction rules, 太歲, life-area routing | major extension of `periods.ts` + new `interactions.ts` | No |
| C | **AI chat** — conversational explanation shell over the deterministic outputs | new `src/ai/` + a thin proxy (or BYOK) | **Yes — this is the one architectural decision** |

A and B are pure deterministic engine + UI work, fully in keeping with the current design. C introduces the app's first cloud dependency and is the decision to make first (see §4).

---

## 2. Feature A — Time navigation (past ↔ future)

**Goal:** let the user move fluidly across day → month → year → 10-year luck pillar, both past and future, with one consistent "good/bad-for-you" colour signal at every zoom level (the pattern every researched tool converges on).

### A1. Luck-pillar scrubber (highest value, data already exists)
A horizontal timeline of the 大運 decades, **labelled by age ranges**, natal chart pinned, current decade highlighted, tap a decade to expand its summary. `bazi.ts` already returns `DaYun.pillars[]` with `startAge`/`endAge`/`ganzhi`/`stemTenGod`. New component `src/ui/LuckTimeline.tsx`; each decade cell coloured by its valence (Feature B). BaZi Hero and OpenFate use exactly this.

### A2. Year stepper + macro year card
`PeriodsPanel.tsx` already has a year stepper (‹ 2026 ›). Extend it: no lower/upper bound (browse childhood decades and decades ahead), and render the richer macro-year card from Feature B. Add a compact **12-month strip** (already present) coloured by month valence.

### A3. Day navigation
- **Day-stepper** (±1 day) on the Best-Day hero and calendar — quick "what about tomorrow / yesterday".
- **Live "today" card** — today's pillar, day-officer, day-god, and personal rating; auto-derived from `TODAY_ISO`. (Every researched tool has this "now" snapshot.)
- The existing `CalendarMonth.tsx` already colours each day by score — keep, and ensure the colour scale matches the luck/year/month scale (one `valenceColor()` shared across altitudes).

### A4. Shared valence scale
Introduce one `PeriodValence`-style colour function used by day cells, month chips, year card, and luck decades so "supportive / mixed / challenging" reads identically at every zoom. `periods.ts` already defines `PeriodValence`; promote its colour map (currently inline in `PeriodsPanel.tsx`) to `src/ui/format.ts`.

---

## 3. Feature B — Macro annual/monthly forecasting engine

This is the substantive new metaphysics. It replaces `periods.ts`'s current mechanical scoring with the traditional three-layer reading: **natal chart (what exists) → 大運 (the decade's road) → 流年 (this year's turn) → 流月 (the month's window)**, judged by Ten-God theme × 用神/忌神 status × branch interactions, routed to life areas. It stays **macro** — tendencies, never events.

### B1. New module: `src/engine/interactions.ts`
A deterministic reference for stem/branch relationships (member lists corroborated across sources; indices in Zi=0 / Jia=0 convention). Some tables already exist in `symbols.ts` (`THREE_HARMONY`, `THREE_MEETING`, `SIX_HARMONY_PAIRS`, `branchesClash`) — consolidate and extend here.

```ts
// Stem combinations 天干五合 → transform element (s combines with (s+5)%10)
甲己→earth, 乙庚→metal, 丙辛→water, 丁壬→wood, 戊癸→fire
// Stem clashes 天干四沖 (same polarity, opposite direction; 戊己 do NOT clash)
甲庚, 乙辛, 丙壬, 丁癸
// Branch six-combine 六合 (indices sum to 1 mod 12): 子丑→earth, 寅亥→wood,
//   卯戌→fire, 辰酉→metal, 巳申→water, 午未→fire* (*disputed Fire/Earth — tag ambiguous)
// Three-harmony 三合: 申子辰→water, 亥卯未→wood, 寅午戌→fire, 巳酉丑→metal
// Half-三合 半三合: valid ONLY when the pair includes the cardinal 子/午/卯/酉
//   (申辰/亥未/寅戌/巳丑 have no central qi → treat as negligible)
// Three-meeting 三會 (strongest): 寅卯辰→wood, 巳午未→fire, 申酉戌→metal, 亥子丑→water
// Six-clash 六沖 (b vs (b+6)%12): 子午 丑未 寅申 卯酉 辰戌 巳亥
// Six-harm 六害: 子未 丑午 寅巳 卯辰 申亥 酉戌
// Punishments 相刑: 寅巳申, 丑戌未, 子卯; self 自刑: 辰辰 午午 酉酉 亥亥
// Destruction 破 (weakest, optional/omit): 子酉 丑辰 寅亥 卯午 巳申 未戌
```

Functions: `stemCombination(a,b)`, `stemClash(a,b)`, `branchRelations(external, natal[])` returning typed `{type, element?, strength}` records. **Precedence** (for a resolution pass): 三會 > 三合 > 刑 > 六沖 > 半三合 > 自刑 > 六合 > 六害 > 破, with two rules — **combination resolves clash (合解沖)**: a branch locked in a 三合/三會 that includes a clashed branch has its clash attenuated; **clash breaks combination (沖破合)**: an unsupported combine is blocked. Compute-and-report where schools disagree rather than hard-coding one resolution (flag it in the output, matching the app's "show conflicts" ethos).

### B2. Ten-God macro-theme table (drives the prose)
Add to `periods.ts` (or a `themes.ts`). The theme is *what* a decade/year is about; 用神/忌神 status decides *how it goes*. The same Ten-God period reads oppositely by Day-Master strength.

| Group | Life domain | Supportive (when 用神) | Cautionary (when 忌神) |
|---|---|---|---|
| 比劫 Companion | peers, partners, self-reliance, competition | build alliances, act independently | competitive year — watch cashflow, rivalry, over-spend |
| 食傷 Output | creativity, expression, skill, children, output | creative/productive; launch, teach, perform | restlessness, over-talk; 傷官 strains authority/reputation |
| 財 Wealth | money, assets, effort↔reward, (men) romance | income, deals, opportunity, relationship activation | over-extension, loss, greed; drains a weak DM |
| 官殺 Officer/Power | career, authority, status, discipline, (women) partner | promotion, recognition, structure | pressure, conflict, legal/health strain; 七殺 harsh on weak DM |
| 印 Resource | study, mentorship, support, health/rest, property | learning, credentials, property, consolidation | dependence, delay, overthinking; 偏印 isolates / dampens Output |

`favourable = producesOrReinforces(用神) || controls(忌神)`; `challenging = brings/reinforces(忌神) || drains/clashes(用神)`. 用神 already computed in `bazi.ts` (`favorableElements`/`unfavorableElements`, with strength + 從格/專旺).

### B3. 大運 decade reading
For each `LuckPillar`: **stem = first ~5 yrs (external/visible theme), branch = last ~5 yrs (internal/structural baseline)** — an emphasis shift, not a hard switch. Stem interacts with natal stems; branch with natal branches. Headline = stem/branch Ten God (theme table) × 用神/忌神 (valence). Surface in the luck scrubber (A1).

### B4. 流年 annual reading (the macro-year the user wants)
Three-layer synthesis, engine-computable:
1. **Year Ten God** (year stem & branch vs Day Master) → theme.
2. **Interactions** of the annual branch vs (a) each natal branch and (b) the active luck-pillar branch: 六沖/六合/三合/半三合/三會/六害/刑; annual stem vs natal/luck stems (五合 + clash).
3. **Resolution pass** (§B1 precedence).
4. **Pillar routing** — tag each fired interaction to the natal pillar it hit → life area:
   - Year → elders / roots / early-life / reputation
   - Month → career / parents / relocation (the "career palace")
   - **Day branch → spouse palace** (relationship activation/recalibration)
   - Hour → children / later-life / legacy
5. **Activation verdict** — does the interaction strengthen/release 用神 (auspicious window) or 忌神 (friction)? Special: a clash to an Earth storage branch (辰戌丑未) *opens the vault* — sign depends on the hidden stems' favourability.
6. **太歲** (year branch vs **birth-year branch**): 值太歲 (same), 沖太歲 (clash), 犯太歲 (值/沖/刑/害, sometimes 破). Compute a `taiSui` flag; frame as "handle with care," **never doom**. School note: also compute Day-branch interactions and label them distinctly (deeper-BaZi view).

Output: extend `PeriodSummary` with `theme` (Ten-God), `lifeAreas` (routed tags), `taiSui`, and richer `tailwinds`/`headwinds`/`cautions` sourced from the theme table + fired interactions.

### B5. 流月 monthly reading
Months nest under the year: month stem/branch Ten God + element, checked against natal + annual + luck branches. A month says *which window a year's existing theme is most active* — amplify (same element as an already-heavy year) or relieve (supplies a missing 用神). Don't invent new themes at the month level. `monthPillarsOfYear()` already computes the 12 pillars with 節 spans.

### B6. Macro-vs-overreach guardrails (bake into the prose layer)
Defensible: *"a decade themed around career and responsibility — good for taking on structure"*, *"a wealth-and-effort year; opportunities present, watch over-extension"*, *"a high-change year that may shake up home or relationship — handle with care"*. **Never** emit: dates, amounts, named events ("you'll be promoted in March"). Every period output pairs a theme with an actionable posture and carries the not-fate disclaimer already in `periods.ts` (`PERIODS_DISCLAIMER`). Add a unit test asserting the vocabulary stays tendency-level (mirrors the existing `tests/periods.test.ts` "never claims outcomes" test).

### B7. Tests
`tests/interactions.test.ts` (member lists, indices, precedence, 合解沖), extend `tests/periods.test.ts` (Ten-God theme routing, 太歲 classification for a known chart, pillar→life-area tags, determinism). Golden charts must stay unchanged.

---

## 4. Feature C — AI chat recommendation interface

The AI is a **strict explanation shell over the deterministic engine**: it consumes engine JSON, explains trade-offs, compares dates, answers "why this day for me?", and narrates period/luck-cycle readings — but it **never calculates**. All numbers come from the engine; the model cites them. This preserves the accuracy/honesty story and keeps every prior guarantee intact.

### C1. The one decision — deployment & the API key
The app is currently a **static site on GitHub Pages** (no backend), and its promise is *"nothing leaves your device."* A cloud LLM inherently changes that: when the user chats, their **chart + question go to Anthropic's Claude API**. This must be **opt-in and clearly labelled**. The key question is *where the API key lives*:

| Option | How it works | Pros | Cons |
|---|---|---|---|
| **A. Serverless proxy (recommend)** | A thin function (Vercel — `vercel.json` already present — or Cloudflare Worker) holds `ANTHROPIC_API_KEY` as a server env var and relays messages to Claude. Browser orchestrates the tool loop; proxy only forwards. | Key never exposed; users need no key; clean product; can rate-limit/meter | You host it and bear the token cost; adds a deploy target beyond Pages |
| **B. BYOK (bring your own key)** | User pastes their own Anthropic key (stored in `localStorage`); browser calls Claude directly with the `anthropic-dangerous-direct-browser-access` header. | Zero backend, zero cost to you, key stays on the user's device | Each user needs a Claude key (niche); key visible in their own browser |
| **C. Cloudflare Pages Functions** | Like A, but keeps hosting + function on one platform (could replace GitHub Pages). | One platform; generous free tier | Migrate hosting off Pages |

**Decision (resolved):** ship on **GitHub Pages** (the existing static host) with **Option B — BYOK** as the live-site path (no backend, no per-user cost, nothing to operate). A dev-only proxy in `vite.config.ts` (reading `.env.local`) covers local testing without pasting a key into the browser. Option A/C (a hosted serverless relay) is intentionally **not** used — no Vercel/Cloudflare dependency. Either way the **deterministic engine stays 100% client-side** — only chat text + engine tool-results transit the network.

### C2. Architecture — client-orchestrated tool loop
The engine runs in the browser, so the **tool loop is orchestrated client-side**; the proxy is a stateless relay. Flow per user message:

```
Browser: assemble context (natal summary + current reading JSON) + user question
  → POST to proxy → Claude (claude-sonnet-5)
  ← tool_use: e.g. find_best_days("wedding", 365)
Browser: execute the tool LOCALLY via the engine (evaluate/buildPeriodsReport/…)
  → POST tool_result back through proxy → Claude
  ← streamed text answer, citing the engine numbers
```

This means Claude can *drive* the planner ("let me check your best wedding day next year… it's Thu 16 Jul, score 88") without ever computing — it asks the engine and narrates. Tools to expose (all thin wrappers over existing engine functions):

```ts
// src/ai/tools.ts — each maps to a deterministic engine call
find_best_days(objectiveId, windowDays)        // evaluateDecision → ranked recommendations
evaluate_specific_day(objectiveId, isoDate)     // one day's full reading
get_period_summary(year, month?)               // buildPeriodsReport
get_chart_summary()                            // natal chart + 用神 + structure
get_luck_pillars()                             // DaYun timeline + per-decade themes
list_objectives()                              // the 11 supported activities
```

Use the SDK tool-runner pattern, but with **client-side execution** of the results. Model: **`claude-sonnet-5`** (strong, fast, cheap enough for chat, supports tool use + streaming; `claude-haiku-4-5` as a cost option, `claude-opus-4-8` reserved for the hardest interpretive asks). Stream responses for a live chat feel.

### C3. System prompt & guardrails (non-negotiable)
- "You explain a deterministic BaZi/Tong Shu engine's outputs. **You never compute pillars, scores, dates, or elements yourself** — call a tool and cite what it returns. If a tool didn't provide a number, say you don't have it."
- "These are **tendencies, not predictions**. Never state that an event will occur, a date will succeed, or give amounts. Use 'tends to favour / strain', pair advice with an actionable posture, and keep the not-fate framing."
- "Refuse to invent 神煞, flying stars, or systems the engine doesn't compute."
- Handle `stop_reason: "refusal"` gracefully; opt into server-side fallbacks if on `claude-fable-5` (not needed for sonnet-5).
- The chat's structured payload = the same JSON the deterministic layer already produces (natal summary, recommendation list, verification report, sensitivity report, period summaries, warnings) — the report's "tool payload schema" §12.

### C4. Where it plugs in
Upgrade the existing `ProfilePanel.tsx` Q&A thread: keep `parseAdvisorQuery` as a *fast deterministic path* for simple asks (zero-latency, offline), and add a "chat" mode that routes to the AI shell for open-ended questions. A new `src/ai/chatClient.ts` (dynamic-imported, like the verification chunk) holds the loop; `src/ai/tools.ts` the engine bridge. The AI layer is **additive** — with it disabled/unconfigured, the deterministic Q&A still works exactly as now.

### C5. Cost & privacy notes
- Sonnet 5 chat: a handful of cents per multi-turn conversation; the tool-results are small JSON. Cache the system prompt (prompt caching) to cut cost.
- Show a one-time consent line the first time chat is used: *"Chatting sends your reading to Anthropic's Claude to explain it. Your birth details stay on your device; the computed chart summary is what's sent."*
- Never send raw birth city/name if not needed — send the derived chart summary, not identifying inputs.

---

## 5. Joey-Yap-inspired feature menu (ranked; DET = deterministic, AI = prose)

Many are partly built already; this is the prioritized backlog.

1. **Goal-first date finder** — *exists* (`advisor.ts`); polish the ranked-with-reasons presentation. [DET→AI reason]
2. **Luck-pillar scrubber** (Feature A1). [DET layout → AI life-phase summary]
3. **Macro annual + 12-month forecast** (Feature B). [AI over DET]
4. **Daily life-area scores** — career / wealth / relationship / health gauges per day, from Ten-God + element hits. New; high value, very Joey-Yap/Bazi-Fortune. [DET]
5. **AI chat over chart / a date** (Feature C). [AI]
6. **Live "today" snapshot card** (A3). [DET]
7. **Three-tier zoom with one colour scale** (A4). [DET]
8. **Auspicious-hour grid** — the 12 double-hours coloured for a chosen day; `decision.ts` already computes `allHours`. Surface as a grid. [DET]
9. **宜/忌 chips with tap-to-explain** — the almanac verdict as chips (already have `almanacVerdict` + lunar-javascript 宜忌); expand each term to plain language. [DET flag → AI explain]
10. **Multi-profile / relationship-aware selection** — store several people, pick dates suiting everyone (Joey Yap's up-to-4 profiles). Larger; later. [DET]
11. **Decision journal** — log what you decided on a date, revisit later. [DET storage]
12. **Shareable PDF report** for a window/decision. [DET data → AI narrative]

---

## 6. Suggested sequence

> **Status:** Phases 1–5 shipped, plus Phase 9 (commercial readiness). Phase 1 (forecasting
> engine) landed in `98c8270`; Phases 2 (time navigation) & 3 (life-area / hour / 宜忌) in
> `c4f0281`; Phase 4 (AI chat — a guardrailed explanation shell) in `853e312`/`9bb4b3a`;
> Phase 5 completed with the decision journal (item 11), the shareable HTML report (item 12)
> and finally **multi-profile + group date selection** (item 10) — `engine/group.ts` binds a
> group day to the *worst* reading in the party, never the average, so a day that clashes one
> principal can't ride on everyone else's enthusiasm.
>
> **Phase 10 — accuracy & trust.** Driven by competitor research and an adversarial audit of the
> engine against practitioner expectations. Historical timezone resolution (DST, wartime clocks,
> permanent zone moves) from the IANA database; the full time-correction chain shown as a checkable
> ledger; boundary-proximity disclosure that computes and displays the ALTERNATIVE chart rather than
> silently picking a side; the 晚子時 middle position implemented, which lets the engine reproduce its
> own third-party comparator exactly at the Zi seam; and the classical clash hierarchy
> 「日時沖命大凶不用，月沖次之權用，年沖可用」 replacing a flat model that hard-vetoed year clashes the
> tradition calls usable. The paywall was also moved off the honesty half of the reasoning dossier —
> charging to see where the traditions disagree, after telling the user they do, was the category's
> worst trust failure reproduced inside the product.
>
> **Phase 18 — accounts are on, and the door widens (2026-07-26).** The Phase 12 blocker is
> cleared: a Firebase project exists (`wei-timing`, Firestore in `europe-west2`), the
> `VITE_FIREBASE_*` values are in Actions secrets, and the live site signs in. Verified end to
> end rather than assumed — the deployed bundle's content hash changed, the served key is 39
> characters, and Google's Identity Toolkit returns a session for it.
>
> **The incident worth keeping.** The first deploy failed with `auth/invalid-api-key` and the
> config *looked* right. It wasn't: the stored secret held 8 real characters followed by 31
> `U+2022` bullets — a masked display had been copied instead of the value. What made it
> findable was refusing to re-check the same way twice: the bundle hash was identical across
> three builds (so the input never changed), the value was 101 characters where a Firebase key
> is 39, and Google rejected the deployed key while accepting the one in `.env.local`. Three
> independent measurements, none of them "look at the config again". Secrets are now read from
> a file, never from anything that renders them.
>
> **Second rung of the auth ladder: email link (passwordless).** Google sign-in alone was
> always too narrow — uneven penetration across the UK / SE-Asia / Chinese-diaspora markets
> this app is for, and unavailable in mainland China. An email address is now enough to own an
> account, offered *beside* Google rather than behind a "more options" disclosure, because for
> a large share of the intended audience it is the only way in. Three things this costs that
> are easy to get wrong, all handled: the return URL is the app's bare base path, because
> Firebase appends `oobCode` &c. to whatever URL it is given and a HashRouter app handed
> `#/profile` would bury them inside the fragment; the redeemed parameters are stripped with
> `replaceState`, or the single-use code is retried on the next refresh and the user is told
> their link is invalid moments after it worked; and a link opened in a different browser
> asks for the address, since possession of the link must never be sufficient on its own.
> `wei_signin_email` is excluded from backups (PII, and useless to whoever restores it).
> Apple stays deferred until there is a native app — the requirement bites on native
> third-party sign-in, not a web PWA. **Requires one console toggle:** Authentication →
> Sign-in method → Email/Password → *Email link (passwordless sign-in)*. Until it is on, the
> form is wired and inert, and Firebase answers `auth/operation-not-allowed`.
>
> **The DPIA is now due, not pending.** Phase 12 recorded it as "a gate on enabling cloud
> sync, not on this phase". Cloud sync is enabled, so the gate has been reached: signing in
> now syncs birth date/time/place alongside journal text, outcome ratings and life priorities
> to Firestore, which is plausibly special-category data under UK/EU GDPR. Nothing here is a
> reason to turn accounts off — it is a **live OWNER action**, and it is the one item in this
> phase that engineering cannot close by itself.
>
> **Phase 15 — one free tier (2026-07-26, OWNER decision).** The Pro/Lifetime tiers are
> removed entirely: every feature is accessible to every user, with no upsells, no locks and
> no pricing surface. The pricing/billing pages, `UpgradePrompt`/`PlanBadge`, the Stripe
> Cloud Function, the checkout client and `VITE_BILLING_URL` are deleted (recoverable from
> git); `docs/BILLING_SETUP.md` is retired in place. What survives is not a product:
> the AI advisor's 200/day message ceiling as a pure abuse bound on hosted-proxy token spend
> (BYOK untouched, blocked copy names the midnight-UTC reset and nothing else), the 1827-day
> horizon as the engine's performance boundary for everyone, the journal cap raised to a
> 5000-entry abuse bound, and the profile cap widened to a 12-person structural bound.
> Downgrade-parking semantics die with the tiers and nothing deletes user data in the
> process. The old "paid buys range" rule is retired; its honesty half still governs:
> nothing may ever gate the correctness, transparency or honesty of a reading
> (DECISIONS.md §11). Engine untouched — scores and hashes byte-identical.
>
> **Phase 17 — conversation memory (2026-07-26).** The advisor's chats lived in `useState`
> and a `useRef`, so a reload erased them. Threads are now durable, and the memory is the
> APP'S: we store the transcript and replay it each request, so switching Claude model
> mid-conversation keeps the context (proven live — Sonnet was told a fact, the model was
> switched, Opus recalled it). AI and offline-advisor turns share one thread; model is stamped
> per assistant turn; `replayWindow` cuts at whole exchanges because the API rejects an
> unmatched tool_use/tool_result; threads join backups (schema v3, v1/v2 unchanged) and sync
> to `ai_threads`. Review: 34 raised, 21 confirmed, all fixed — including three blockers. The
> worst: the replay projection dropped each turn's timestamp and model, so every staleness
> defence was inert and the prompt's "an unmarked turn is from today" became a falsehood about
> week-old readings. It survived review-by-tests because one suite hand-built history WITH the
> stamps and the other never checked what the store emitted — the bug lived in the seam
> neither owned, and an end-to-end seam test now guards it. Also: an orphaned tool_use
> truncated the replay, and threads were not scoped to the subject chart.
>
> **Phase 16 — the classical day layer (2026-07-26).** The four remaining widgets from the
> competitor's daily planner, each sourced to a named text and shipped only where the sourcing
> held. **卦氣/六日七分 daily hexagram** — reproduces their 天澤履 for 2026-07-25, and the
> 60-order is cross-checked against two independent primary witnesses (京房卦氣直日圖 via
> 《新唐書‧曆志》, and 《易緯稽覽圖》 via 艮宧易說《卦氣直日考》, retrieved and parsed). A 梅花易數
> cast ships subordinate to it, because the anchor cannot discriminate the two families (they
> coincide on only 8 days of 2026). **日家紫白 flying star in TWO lineages** (通書 vs 超神接氣,
> ~40% disagreement in multi-year blocks), calibrated against Joey Yap's own 2008 printed
> diary. **日家奇門 九星 wheel** — their "QIMEN MOBILITY" is not the Qi Men 八神 but the nine
> stars of 《奇門遁甲元靈經》; there are nine, so ours shows the centre palace their eight-point
> version cannot. **天元烏兔經 day star** — "Black Rabbit" is a literal gloss of 烏兔 (crow=Sun,
> rabbit=Moon), not an animal sign. **Qi Men Directions deliberately NOT shipped**: proprietary
> theme labels, a three-way 起局 fork, and an undocumented hour choice — no disclosure would
> make a guess honest. Review: 39 raised, 17 confirmed, all fixed; four lenses independently
> caught a 太陽日 of 三十 printed in 29-day lunar months. Everything display-only.
>
> **Phase 14 — daily-view completeness (2026-07-26).** Closed the verified gaps against the
> competitor's daily planner, all deterministic and free: the third-party almanac's full
> 吉神/凶煞 day-star lists as glossed chips plus per-hour stars (hour god, 吉/凶, hour 宜/忌),
> labelled as one publisher's cross-check with an honest publishers-differ note; a personal
> Ten Gods energy chart (day stem + hidden stems signed by the chart's favourable elements —
> display-only, guard-tested never to feed a score); a day-type badge and the date's
> year/month pillars; and daily reflections (mood + a line, past days only, one per day,
> sharing the journal allowance, in backups as schema v2 with v1 files restoring unchanged).
> Dong Gong was researched rather than shipped: three cross-checked transcriptions produced a
> 673/720-cell double-sourced draft (disagreements absent, never guessed), the finding that
> the competitor's "Dong Gong Rating" scalar is proprietary rather than classical, and a
> printed-edition spot-check as the ship gate (docs/research/DONG_GONG_SOURCING.md). Review:
> 12 findings, 9 confirmed and fixed — the majors were the backup panel understating what v2
> backups contain and what Replace destroys. Deliberately not copied: daily hexagram, Qi Men
> wheel, Flying Star (separate systems — strategy, not gap-fill).
>
> **Phase 13 — person-first presentation (2026-07-25).** Owner feedback: the app computed
> personally but presented calendar-first, so it "didn't feel tailored". Verified against the
> competitor's public daily-view order (name → day rating → activities → hours) and inverted:
> `personalDayReading` in plainEnglish.ts composes a deterministic daily reading addressed to
> the person (archetype meets the day's Ten God, per-element stem/branch fit, strongest
> life-area tilt, priority-area sentence passed in as plain data, taboo/clash cautions, best
> hour); PersonalDayCard leads the daily view with greeting + reading + verdict + priority
> fit; the almanac material is demoted into a collapsed 通勝 fold (visitors keep almanac-first);
> onboarding gains an optional name and a focused ?start=1 welcome. Adversarially reviewed:
> 11 findings raised, 7 confirmed and fixed — notably three prose-honesty bugs (netted
> element fit mis-attributing the branch's strain to the stem's element; 歲破 headlines
> blaming the person's chart for a universal calendar taboo; "strongest workable window"
> sold under sit-out headlines) and an askName flow that could rename a non-self person.
> Presentation only: recommendationScore and calculationHash byte-identical throughout.
>
> **Phase 11 — the Tong Shu planner (2026-07-25).** Driven by a six-lens audit (UX restrictiveness,
> calendar gaps vs Joey Yap's TongShu Power Planner, chat capability, profile depth, competitor
> research, and a 349-case accuracy battery vs lunar-javascript). The battery confirmed the engine
> arithmetic is clean — every sect-matched pillar comparison agreed — and located the real "my DOB
> gives wrong predictions" causes in the INPUT path: the birth form seeded the device's *current*
> UTC offset as the birth offset (winter births entered in summer flipped year/month pillars near
> 立春), and the true-solar default silently diverges from the civil-clock charts most other apps
> show. Fixes: device-IANA-zone seeding + birth-date offset resolution, one-time healing of stored
> profiles, and a free ConventionCompare panel (true solar vs civil clock side by side, one-tap
> switch). Features: Tong Shu month cells (day pillar, zodiac animal, lunar date, personal score);
> DayHero with clash-animal years; full 通勝 宜/忌 + 28-mansion almanac panel; classical 黃道黑道
> hour gods so visitors without a profile get hour ratings (cross-checked against lunar-javascript,
> 144/144); arbitrary-start date search with URL-addressable readings; context-aware nav + date
> jumps everywhere; chat tools get_natal_chart & get_profile_fits + objective-less day evaluation,
> tappable date chips, profile-aware suggestion chips, and a deterministic offline advisor when no
> AI key is configured; profile home base with hidden stems, palaces, Na Yin, day-master archetypes,
> functional element map and lucky keys (天乙貴人/桃花/驛馬). **Tier decisions:** window PLACEMENT is
> free (length stays plan-clamped); single-day transparency (hero verdict, hours, almanac, clash)
> is free; get_natal_chart/get_profile_fits are free; luck_pillars/year_forecast/dossier gates
> unchanged.
>
> **Phase 12 — the person layer (2026-07-25).** Driven by an external deep-research run
> (`docs/RESEARCH_ACCOUNTS_AND_PERSON_PROFILE.md`) on the gap between a birth *chart* and a
> *person*: the app knew everything about your pillars and nothing about what you were trying
> to do with your life. Shipped: a **priority profile** (what actually matters to you, asked
> rather than inferred); a separate, visibly-labelled **priority-fit axis** shown alongside the
> classical score; **priority-aware surfacing and ordering** of recommendations; **journal-derived
> suggestions** offered as proposals you accept or decline; **field-level AI consent** over four
> fields — areas and intentions on by default, life context and aggregate journal counts off,
> with raw journal note text never sent under any setting and no toggle offered for it; and
> **full data export/import** so nobody's data is hostage
> to one browser. **The central architectural rule:** stated priorities NEVER alter the classical
> day score — `recommendationScore` stays a strict function of chart + date + objective +
> doctrine. Priorities may change what is surfaced, add a labelled parallel axis, and inform the
> advisor; they may not move the number. A preference-weighted score would make a "72"
> incomparable between users and untraceable to any named convention, which is the one thing
> §4 of DECISIONS.md exists to prevent. Reasoning in
> [DECISIONS.md §10](DECISIONS.md). **Tier decisions:** export/import, the priority profile,
> the priority-fit axis and journal-derived suggestions are all **free** — portability is a
> right, personalization is the ante, and journal *volume* is already the correct plan-capped
> lever. No existing Pro gate was removed (horizon length, year_forecast, luck_pillars,
> reasoning_dossier, .ics/HTML report export, multi_profile, group all unchanged).
>
> **Deferred out of Phase 12, and why:**
> - **Turning accounts on.** ~~Blocked on the owner creating a Firebase project.~~ **Done in
>   Phase 18** — the project exists and the live site signs in. Firebase auth, per-user
>   Firestore sync and the ID-token-authenticated AI proxy were fully implemented and dormant
>   throughout; only configuration was missing. Checklist in [FIREBASE_SETUP.md](FIREBASE_SETUP.md).
>   Sequencing was deliberate and held: export/import shipped *first*, so accounts arrived as an
>   optional "keep this across devices" upgrade rather than a signup wall.
> - **The auth ladder beyond Google.** ~~Google sign-in only.~~ **Email link added in Phase 18**,
>   the recommended next rung; the reasoning below is why, and it held. Remaining rung:
>   **passkeys**. **Apple stays deferred until there is a native app** — the requirement to offer
>   it bites on native third-party sign-in, not on a web PWA, so it costs a developer membership
>   for no reach email link doesn't already give us. Rationale table in FIREBASE_SETUP.md §3.
>   (Original note: Google alone is fine for a private beta and **too narrow for a global
>   consumer audience** — uneven Google penetration across the UK / SE Asia / Chinese-diaspora
>   target markets, and inaccessible in mainland China.)
> - **Calendar sync.** `.ics` export already exists (Pro). One-click **Google Calendar insert** is
>   the near-term follow-up — it is an OAuth scope and an API call, not new metaphysics, and it
>   is the single most requested "make this actually usable" affordance in the category.
>   Deferred here only because it lands naturally with accounts.
> - **A DPIA.** The research flags a Data Protection Impact Assessment as **required before
>   cloud storage of sensitive profile/journal fields expands** — birth date/time/place combined
>   with life priorities, journal text and outcome ratings plausibly reaches special-category
>   data under UK/EU GDPR. This was a **gate on enabling cloud sync, not on this phase**: Phase 12
>   is local-only and processes nothing on our servers. Field-level AI consent (above) is a
>   separate, client-side control over what is *sent* and does not substitute for it.
>   **⚠ That gate has since been reached — Phase 18 turned cloud sync on. Now a live OWNER
>   action, not a future one.**
> - **Pricing.** ~~Comparable consumer apps sit around £9–£15/month against our £7 Pro.~~
>   **Moot since Phase 15**, which removed the paid tiers entirely. The principle it was
>   recorded under still stands and outlived the pricing question: a price is an OWNER
>   decision, and none should change as a side effect of an engineering phase.
>
> > **Phase 9 — commercial readiness:** Free/Pro plans with a shared, drift-guarded catalogue
> (`src/billing/plans.ts`), Stripe Checkout + customer portal + webhook-driven entitlements,
> server-side AI quota metering, a public landing/pricing surface, privacy & terms, PWA
> install + offline service worker. The gating rule: **paid tiers buy range, breadth and
> storage — never the correctness, transparency or honesty of a reading.** See
> [BILLING_SETUP.md](BILLING_SETUP.md).
>
> **Deployment decision (§7.1):** GitHub Pages (static) → **BYOK** for the live site; the
> **dev proxy** in `vite.config.ts` reads the key from `.env.local` for local testing only.
> No Vercel / serverless dependency. Model default: `claude-sonnet-5`.

1. **Phase 1 — Forecasting engine (B):** `interactions.ts` + Ten-God themes + upgraded `periods.ts` (大運/流年/流月, 太歲, life-area routing) + tests. Pure deterministic, no external decision. Biggest metaphysics upgrade; unblocks A and C.
2. **Phase 2 — Time navigation (A):** luck scrubber, unbounded year stepper, live-today card, shared colour scale, day-stepper. Consumes B's valences.
3. **Phase 3 — Daily life-area scores + auspicious-hour grid + 宜忌 chips** (feature-menu 4/8/9) — quick deterministic wins that make the UI feel like the planner.
4. **Phase 4 — AI chat (C):** once the deployment/key decision is made — proxy (or BYOK), `src/ai/` loop + tools, system prompt/guardrails, plug into `ProfilePanel`.
5. **Phase 5 — Multi-profile, journal, PDF report** (feature-menu 10/11/12).

Each phase ends with the standard gate: `npm run typecheck && npm test && npm run build`, browser verify, commit to `main` (auto-deploys to Pages), and — for C — deploy the proxy.

---

## 7. Open decisions (need your call before building C)

1. ~~**AI-chat deployment** (§C1): serverless proxy on Vercel vs BYOK vs Cloudflare.~~ **Resolved:** GitHub Pages (static) + BYOK; a dev-only proxy for local testing. No Vercel/Cloudflare.
2. **AI model default:** `claude-sonnet-5` (recommended) vs `claude-haiku-4-5` (cheaper) vs `claude-opus-4-8` (most capable).
3. **Scope of the macro year:** confirm we stay Zi Ping + Tong Shu (no Flying Stars / Qi Men / Zi Wei) — the research and current engine are Zi Ping; adding other systems is a much larger, separate effort.
4. **Doctrine knobs** (school differences to pick a default for, all flagged in the engine): 午未 six-combine element (Fire vs Earth), 犯太歲 membership (include 破?), 太歲 reference (birth-year branch only vs also Day branch). Recommend: Fire, exclude 破, compute both Tai-Sui references and label them.
