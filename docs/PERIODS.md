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
`PillarInfluence` against the natal chart:

- **Stem valence** — is the pillar's stem element in your favourable set (扶抑用神,
  from `bazi.ts`)? Favourable = tailwind for that Ten-God theme; unfavourable =
  headwind. This is the same 用神 logic the natal engine already uses.
- **Branch valence** — same test on the pillar's branch element.
- **Branch relations** — clash (沖), Six-Harmony (六合) or Three-Harmony (三合)
  between the pillar's branch and each of your four natal branches. A clash to your
  **day** branch is flagged as felt personally; a clash to your **year** branch is
  your 生肖 (zodiac) clash.

The valence is a small deterministic score: stem (×2) + branch, plus +1 per harmony
and −2 per clash. `supportive ≥ 2`, `challenging ≤ −2`, otherwise `mixed` (or
`neutral` when nothing engages).

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
