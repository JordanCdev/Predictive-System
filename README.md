# 易 · Decision Timing Engine

A **deterministic, explainable Chinese-metaphysics engine** for deciding *when* to make
a life decision — signing a contract, opening a business, a wedding, moving home, surgery,
travel, an exam, a major purchase, and more.

It is built from the attached specification
(`chinese_metaphysics_decision_engine_spec.md`) and honours its core philosophy:

> **LLMs never calculate.** Every chart, solar term, day-officer and score is computed by
> pure, reproducible functions. The machine shows its calculations, the rules it fired,
> source citations, school conflicts and a confidence index. *Same inputs → same answer.*

This is **not** a black-box fortune teller. It is a transparent decision-support tool: it
ranks days, explains exactly why, surfaces where schools disagree, and is honest that its
confidence reflects *reproducibility and source support*, not the probability that fate
will unfold a certain way.

---

## Quick start

```bash
npm install
npm run dev        # open http://localhost:5173
npm test           # run the deterministic golden-test suite
npm run build      # production build (static, no backend)
```

The whole engine runs **client-side in your browser** — no network access in the
calculation path, which satisfies the spec's "calculators must run with no network"
constraint by construction. Nothing you enter is sent anywhere.

---

> **Full engine & feature inventory:** see [`docs/ENGINE_REFERENCE.md`](docs/ENGINE_REFERENCE.md)
> — every module, table, formula, constant, objective and scoring rule documented to a tee.

## How it maps to the specification

The spec calls for five strictly-separated layers. They live in `src/engine/`:

| Spec layer | Module | What it does |
|---|---|---|
| 1 · Astronomy / calendar kernel (§5) | `astronomy.ts`, `sexagenary.ts` | Julian Day, ΔT, Meeus apparent solar longitude → 24 solar terms; sexagenary year/month/day/hour pillars under an explicit convention set |
| 2 · Symbolic kernel (§4, §6.1) | `symbols.ts`, `bazi.ts` | Stems, branches, five-phase cycles, hidden stems, Ten Gods, Na Yin, element accounting, Day-Master strength, favourable elements (用神), Da Yun 大運 |
| 3 · School rule packs (§6.4, §6.7) | `tongshu.ts` | 建除十二神 (12 Day Officers), 黄道黑道 day gods, 日沖 / 三煞, personal Shen Sha (Nobleman, Peach Blossom, Travelling Horse, harmonies / clashes) |
| 4 · Deterministic decision engine (§10) | `objectives.ts`, `decision.ts` | Candidate-day generation, transparent MCDA scoring, hard-constraint vetoes, cross-school conflict detection, ranking |
| 5 · Explanation payload (§11–§12) | `decision.ts` + UI | Per-recommendation facts, fired rules with citations, conflicts, confidence breakdown, version + calculation hashes |

Other spec principles that are implemented:

- **Explicit convention sets** (§5.3) — day-rollover (civil-midnight vs 23:00 Zi), hour
  basis (civil clock vs local-mean-solar). Disputes are visible, not hidden.
- **Conflict-first output** (§9) — when the almanac officer and your BaZi disagree, a
  structured conflict is shown, never silently reconciled.
- **Deterministic confidence index** (§12) — a weighted mean of reproducibility, source
  quality/specificity, school agreement, input quality, validation concordance and rule
  coverage. *Not* an empirical probability of outcomes.
- **Versioning + calculation hash** (§1.2, §18) — every result embeds layer versions and a
  stable hash of its inputs, proving reproducibility.
- **Boundary sensitivity** (§5, §16.2) — births near 立春 / a 節 / the Zi hour are flagged.

## Validation (golden tests)

The kernel is validated against independent anchors in `src/engine/kernel.test.ts`:

- **Solar terms** vs published observatory/almanac UTC instants (winter solstice, equinox,
  summer solstice, 立春) — all within 30 minutes.
- **Full charts** for published cases: Mao Zedong (1893-12-26 → 癸巳 / 甲子 / 丁酉) and Zhou
  Enlai (1898-03-05 → 戊戌 / 甲寅), plus the sexagenary day cycle, Na Yin and Ten Gods.

`src/engine/decision.test.ts` proves determinism (identical `calculationHash`), correct
vetoes, citation coverage and objective-dependent ranking.

---

## Honest scope

This build delivers the user's actual goal — a working website + engine to time life
decisions — with the layers that drive that decision: **BaZi personalization + Tong Shu
day selection + a deterministic MCDA decision engine**, fully explainable.

The spec also describes much larger production machinery that is **deliberately out of
scope** for this version and noted here so confidence stays honest:

- Qi Men Dun Jia full nine-palace board; Xuan Kong Flying Star & Da Gua compasses; Great
  Sun Formula (these are additional *evaluators* the MCDA layer is designed to accept).
- Server-side event sourcing, PostgreSQL projections, OpenAPI service, OCR source-ingestion
  and signed plugin manifests. The engine here is the deterministic core those would wrap.

The `ruleCoverage` confidence component is set accordingly, so the app never overstates how
many schools it consulted.

---

## Disclaimer

Chinese metaphysics is a traditional symbolic system. This tool's confidence reflects how
robust, reproducible and well-sourced a recommendation is *within the declared doctrine and
inputs* — not whether any life outcome is certain. Different masters legitimately disagree;
the engine shows those conflicts. Use it as one structured input alongside your own
judgement and practical constraints.
