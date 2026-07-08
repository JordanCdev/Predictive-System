# PERIODS.md — Year & month period summaries (大運 / 流年 / 流月)

`src/engine/periods.ts` projects the natal chart forward into **tendency summaries**
for the active luck decade, a selected year, and that year's twelve solar months.
It is deterministic and explanatory — it never claims what will happen. Read
[DECISIONS.md](DECISIONS.md) for what "accuracy" means across the engine.

## What it produces

`buildPeriodsReport({ chart, dayun, birth, targetYear })` → `PeriodsReport`:

| Field | Meaning |
|---|---|
| `activeLuck` | The 大運 luck decade covering the target year (null if none) |
| `luckPillars` | All decades, lightweight, for a life-arc strip |
| `year` | The 流年 annual pillar summary for `targetYear` |
| `months` | The twelve 流月 solar-month summaries, each with its 節 date span |
| `interaction` | One sentence weaving natal ↔ luck ↔ year together |
| `disclaimer` | The always-present "tendencies, not forecasts" note |

Each `PeriodSummary` carries a `valence` (`supportive` / `mixed` / `challenging` /
`neutral`), a plain `headline`, and three lists: `tailwinds`, `headwinds`, `cautions`.

## How a period is read (the doctrine)

For each external pillar (luck decade / annual / monthly) the engine computes a
`PillarInfluence` against the natal chart, combining three ingredients:

**1. Ten-God theme (what the period is ABOUT).** The pillar's stem, relative to the
Day Master, maps to a functional group (`GROUP_THEME` in `periods.ts`): 比劫 Companion,
食傷 Output, 財 Wealth, 官殺 Officer, 印 Resource — each with a life domain and a
supportive-vs-cautionary framing. Which framing applies is decided by favourability,
not by the group being "good" or "bad".

**2. 用神/忌神 favourability (HOW it goes).** Stem and branch element valence against
the chart's favourable/unfavourable set (扶抑用神, incl. 從格/專旺, from `bazi.ts`). The
*same* Ten-God period reads oppositely by Day-Master strength.

**3. Branch interactions (`interactions.ts`).** The full classical set — 六合/三合/
半三合(cardinal-only)/三會/六沖/六害/刑/破 — between the pillar's branch and each natal
branch, with a **resolution pass**: 合解沖 softens a clash whose natal branch is locked
in the chart's own harmony frame. Each interaction is routed to a **life area** by the
natal pillar it hits — Year → elders/roots, Month → career, **Day → relationship (spouse
palace)**, Hour → children/legacy. A harmony pooling a *favourable* element is a tailwind;
one pooling an unfavourable element is not. Clashes/punishments/harms become cautions.

**太歲 (year only).** The year branch vs the **birth-year branch**: 值太歲 (本命年),
沖太歲 (clash), 犯太歲 (值/沖/刑/害; 破 excluded by default). The year branch vs the
**Day branch** is also computed and labelled distinctly (deeper-BaZi view). Framed as
"handle with care," never doom.

The valence is a small deterministic score: stem (×2) + branch, plus favourability-weighted
interaction contributions (harmony of a favourable element +2, clash −2 [−1 if softened],
punishment −2, harm −1). `supportive ≥ 2`, `challenging ≤ −2`, else `mixed` / `neutral`.

## Calendar identities (verified elsewhere)

- **Annual pillar**: `annualPillar(Y)` = `ganZhiFromIndex((Y − 1984) mod 60)` — 1984 = 甲子,
  立春-bounded (the same convention as the natal year pillar).
- **Month pillars**: `monthPillarsOfYear(Y)` — 12 solar months opening at the 節 terms
  (立春 opens 寅). Stems come from the year stem via 五虎遁, advancing one per month.
  Each month's date span is the exact 節 crossing computed by `astronomy.ts`
  (the same solver verified to ≤120 s against HKO/JPL — see [VERIFICATION.md](VERIFICATION.md)).

## What it deliberately does NOT do

- No event prediction. Wording stays in the register of *supports / strains /
  caution*. Tests assert the output never contains "will happen", "guaranteed", etc.
- No 神煞-heavy annual fortune-telling, no numeric "luck score". The summaries are a
  structured projection of the chart's favourable elements onto each period, nothing more.

## UI

`src/ui/PeriodsPanel.tsx` renders the report under a personalized reading: the
interaction sentence, the active luck decade, the year, and a scrollable strip of the
twelve months (tap a month for its detail). A year stepper moves `targetYear`; all
computation stays client-side and deterministic.
