# 易 · Wéi — Decision Timing

**Good days for big decisions — and exactly why.**

Wéi is a **deterministic, explainable Chinese-metaphysics engine** for choosing *when* to
make a life decision — signing a contract, opening a business, a wedding, moving home,
surgery, travel, an exam, a major purchase. It gives you **one clear best day**, says why in
plain English, shows its full auditable reasoning on demand, and is honest about what its
confidence means.

> **LLMs never calculate.** Every chart, solar term, day-officer and score is computed by
> pure, reproducible functions. *Same inputs → same answer.* No network and no AI in the
> calculation path; nothing you enter leaves your browser.

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

# opt-in LIVE verification against JPL Horizons (never runs by default):
VERIFY_LIVE_JPL=1 npm test -- tests/verification/solarTerms.live.test.ts
```

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

**What the two numbers mean.** The **recommendation score** (0–100) is a transparent,
versioned heuristic ranking under this rule set — *not* a prediction. **Confidence** is
evidence-based: reproducibility, measured third-party agreement, convention stability
(does the pick survive Zi-hour rollover / true solar time?), ranking robustness (±10% weight
perturbations), boundary safety and input completeness. It is **never a probability that the
event will succeed** — external sources can verify time and calendar facts, not outcomes.

School-dependent doctrine (用神 selection, 調候, branch-frame weighting) is labelled
**medium-confidence** and surfaced as an alternative view — when schools disagree, the app
shows both rather than silently picking one. Strong calendar taboos (歲破, 四離/四絕) are
**hard exclusions** for high-stakes objectives (weddings, moving, openings, contracts,
renovation) — a good-looking score can no longer buy back a forbidden day.

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
