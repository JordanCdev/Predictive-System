# 易 · Wéi — Decision Timing

**Good days for big decisions — and exactly why.**

Wéi is a **deterministic, explainable Chinese-metaphysics engine** for choosing *when* to
make a life decision — signing a contract, opening a business, a wedding, moving home,
surgery, travel, an exam, a major purchase. It gives you **one clear best day**, says why in
plain English, shows its full auditable reasoning on demand, and is honest about what its
confidence means.

> **LLMs never calculate.** Every chart, solar term, day-officer and score is computed by
> pure, reproducible functions. *Same inputs → same answer.* No network and no AI in the
> calculation path; nothing you enter leaves your browser. The optional AI **chat** is a
> strict explanation shell — opt-in, clearly labelled, and it still never calculates (it calls
> the deterministic tools and cites them); only when you use it does your question + derived
> chart summary leave the device ([docs/AI_CHAT.md](docs/AI_CHAT.md)).

This is **not** a black-box fortune teller. It is a transparent decision-support tool that
ranks days, explains the call, surfaces where schools of thought disagree, and is clear that
its confidence reflects *reproducibility and source support* — not the probability fate
unfolds a certain way.

---

## Quick start

```bash
npm install
npm run dev        # open http://localhost:5173
npm test           # deterministic golden tests + offline third-party verification
npm run build      # static production build (no backend)

npm run dev:pro    # dev server with the Pro tier unlocked (dev-only override)
npm run sync:shared # after editing src/billing/plans.ts — see docs/BILLING_SETUP.md
npm run icons      # regenerate the PWA icons

# opt-in LIVE verification against JPL Horizons (never runs by default):
VERIFY_LIVE_JPL=1 npm test -- tests/verification/solarTerms.live.test.ts
```

Everything runs with no configuration: no account, no backend, no keys. Accounts
and cloud sync ([docs/FIREBASE_SETUP.md](docs/FIREBASE_SETUP.md)) and
subscriptions ([docs/BILLING_SETUP.md](docs/BILLING_SETUP.md)) are optional
layers on top — with neither configured the app is fully usable on the free tier
and every upgrade affordance hides itself.

## How it works (the experience)

1. **Ask** — pick what you're timing and a rough window. No birth data required.
2. **Answer** — one **Best-Day hero**: the date, a plain-English verdict, two separate meters
   for *how good* vs *how sure* (with its epistemic disclaimer always shown), the best hour,
   a **What-to-do** list, a warm banner when traditions disagree, and a few alternatives.
3. **Browse** — a verdict-band **calendar** and a ranked list; tap any day to see its reasoning.
4. **Personalize** (optional) — add your birth details to tailor the days to your own BaZi and
   unlock your best hours. The confidence visibly rises.
5. **Show the work** — a lazy evidence dossier: weighted sub-scores, the confidence breakdown,
   every rule that fired with its classical citation, all twelve double-hours, and a Verify
   trustmark (result hash + engine versions).
6. **Navigate time** — a live **Today** snapshot (pillar, day-officer, day-god, life-area
   gauges), a ±1-day stepper, an unbounded year stepper, and a life-spanning **大運 luck
   scrubber** — one shared "supportive / mixed / demanding" colour scale at every zoom.
7. **Read the day, area by area** — deterministic **career / wealth / relationship / wellbeing**
   tendency gauges, an **auspicious-hour grid**, and tap-to-explain **宜 / 忌 chips**.
8. **Chat** (optional, opt-in) — ask open-ended questions and get a conversational answer from
   an AI that **never calculates**: it calls the same deterministic tools and cites what they
   return ([docs/AI_CHAT.md](docs/AI_CHAT.md)).

## What's under the hood

The deterministic engine lives in `src/engine/` (framework-agnostic; the React UI consumes it):

| Layer | Modules | What it does |
|---|---|---|
| Astronomy / calendar | `astronomy.ts`, `sexagenary.ts` | **Abridged VSOP87** apparent solar longitude (~0.0005°), refit ΔT, equation of time, 24 solar terms; four pillars under an explicit convention set |
| Symbolic kernel | `symbols.ts`, `bazi.ts` | Stems/branches, hidden stems, Ten Gods, Na Yin; Day-Master strength with **旺相休囚死 + 通根 rooting**, natal **三合/三會/六合/六沖** interactions, **調候** climate, favourable elements, Da Yun |
| Almanac (Tong Shu) | `tongshu.ts` | 建除 officers, 黄黑道 day gods, day clash, 三煞 direction, **四離/四絕** taboo, personal Shen Sha |
| Decision engine | `objectives.ts`, `decision.ts` | Candidate generation, a transparent MCDA **recommendation score**, hard vetoes (forbidden officers, personal clashes, and **歲破/四離/四絕 exclusions** for high-stakes objectives), cross-school conflict detection |
| Sensitivity | `sensitivity/` | **Convention sweep** (does the pick survive Zi-hour rollover / true-solar?) and a deterministic **±10% weight sweep** — instability lowers confidence automatically |
| Verification | `verification/` | Third-party cross-checks: **lunar-javascript** (independent almanac library), **HKO** solar-term tables, **JPL Horizons** samples. Confidence uses the *measured* agreement, not a constant |
| Periods | `periods.ts`, `interactions.ts` | **大運 / 流年 / 流月** tendency summaries — luck decade, year and its twelve solar months, with Ten-God themes × 用神/忌神 × branch **合/沖/刑/害** interactions routed to life-area palaces, plus **太歲**. Explanatory, never a forecast ([docs/PERIODS.md](docs/PERIODS.md)) |
| Life areas | `lifeAreas.ts` | Per-day **career / wealth / relationship / wellbeing** tendency gauges (0–100 + reason), re-projecting the period influence onto the four domains, tempered by Day-Master strength |
| AI bridge | `ai/` | A strict **explanation shell** over the engine: six tools that each wrap a deterministic call, a client-orchestrated streaming tool loop, and guardrails so the model narrates but **never calculates** ([docs/AI_CHAT.md](docs/AI_CHAT.md)) |
| Request | `request.ts` | Canonical birth-input model: preserves the original, records missing fields, and **downgrades** solar time to civil-clock (with a warning) when the birthplace longitude is missing |
| Explanation | `plainEnglish.ts` + `ui/` | A pure, deterministic layer that turns the computed facts into human sentences — and the only place user copy is authored |

### Accuracy & verification

The kernel is verified against independent external sources — in CI, offline, on every run
(see **docs/VERIFICATION.md** for the full architecture and tolerances):

- **Solar-term times**: every one of the **72 HKO-published instants (2025–2027)** and all
  five **JPL Horizons**-derived 2026 crossings match within the test gate of **≤ 120 s**
  (measured accuracy ~25 s; sources publish to the minute). Solar longitude agrees with raw
  Horizons samples to < 0.001°.
- **Calendar facts**: day pillar, 建除 officer, 黄黑道 day god and day clash cross-checked
  against **lunar-javascript** (an independently implemented almanac library) across a
  28-date sweep, plus natal four-pillar checks against its EightChar module.
- **ΔT** refit to observed values (≈69.2 s at 2024), with Espenak–Meeus branches back to 1800.
- **真太陽時 (true solar time)** is a genuine option: longitude correction **plus the equation
  of time** (±16 min). Requesting a solar hour basis **without a longitude** now degrades
  gracefully with an explicit warning and lower input-completeness in the confidence.
- **Four pillars** cross-checked against published charts (Mao Zedong 1893-12-26 →
  癸巳/甲子/丁酉; Zhou Enlai 1898-03-05 → 戊戌/甲寅) and the 2000-01-01 anchor 己卯/丙子/戊午.

**Aligned with the almanac.** The day score blends the mainstream 通勝/almanac 宜忌 verdict
(pulled from lunar-javascript) with the structural analysis, so "good day for X" matches what a
standard almanac says — and the app reports a measured **almanac agreement %** (how often the
classical 建除 officer verdict already matched it). Extreme charts now get the classically
correct reading too: 從格 (follow) and 專旺 (dominant) special structures invert the
favourable-element logic instead of mis-advising, and 調候 (climate) vs 用神 conflicts are
surfaced rather than silently merged.

**Three separated outputs, never one blurred number.** The **recommendation score** (0–100)
is a transparent, versioned heuristic ranking under this rule set — *not* a prediction.
**Verification agreement** (0–100, once the cross-check runs) is how closely independent
sources match the day's calendar facts. **Confidence** is evidence-based: reproducibility,
measured third-party agreement, convention stability (does the pick survive Zi-hour rollover /
true solar time?), ranking robustness (±10% weight perturbations), boundary safety, input
completeness, and a soft-taboo severity deduction. Confidence is **never a probability that the
event will succeed** — external sources verify time and calendar facts, not outcomes.

**Year & month outlook.** With birth details added, the app also shows deterministic
大運 / 流年 / 流月 *tendency* summaries — the active luck decade, any chosen year, and its twelve
solar months — projecting your chart's favourable elements onto each period. Tendencies, not
prophecy ([docs/PERIODS.md](docs/PERIODS.md)).

School-dependent doctrine (用神 selection, 調候, branch-frame weighting) is labelled
**medium-confidence** and surfaced as an alternative view — when schools disagree, the app
shows both rather than silently picking one. Strong calendar taboos (歲破, 四離/四絕) are
**hard exclusions** for high-stakes objectives (weddings, moving, openings, contracts,
renovation) — a good-looking score can no longer buy back a forbidden day.

## Plans

The app is free to use, and the **engine is never the paid part**. A free user
gets the same deterministic scores, the same declared conventions, the same
conflicts between schools and the same disclaimers as a subscriber. Pro buys
*range, breadth and storage*: a five-year date search instead of sixty days, any
year past or future, the 大運 decade scrubber, several people's charts and a date
that suits all of them, export, and the full reasoning dossier.

Downgrading never deletes anything — extra charts and journal entries are paused,
not erased. Setup and the full gate list: [docs/BILLING_SETUP.md](docs/BILLING_SETUP.md).

## Honest scope

Deliberately **out of scope** (so confidence stays honest): Qi Men Dun Jia, Xuan Kong Flying
Star / Da Gua, the Great Sun Formula, and the server-side data platform (event sourcing,
provenance graph, OCR ingestion). The MCDA layer is designed to accept those as additional
evaluators later.

## Disclaimer

Chinese metaphysics is a traditional symbolic system. This tool's confidence reflects how
robust, reproducible and well-sourced a recommendation is *within the declared doctrine and
inputs* — not whether any life outcome is certain. Different masters legitimately disagree;
the engine shows those conflicts. Use it as one structured input alongside your own judgement.
