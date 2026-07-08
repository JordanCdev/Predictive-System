# CONVENTIONS.md — School conventions and how they change the answer

Different BaZi/Tong Shu schools legitimately disagree on a handful of consequential
choices. This engine binds **every** calculation to an explicit `ConventionSet`
(`src/engine/conventions.ts`) rather than an implicit default, sweeps the supported
conventions to measure sensitivity, and downgrades gracefully when an input a
convention needs is missing. This is the top reason a result can differ from another
site — see [DECISIONS.md](DECISIONS.md) §4 for the full accounting.

## The convention axes

| Axis | Type values | Options in the wild | This engine |
|---|---|---|---|
| Year boundary | `yearBoundary: "lichun_exact"` | 立春-exact vs lunar New Year vs Jan 1 | **立春 exact instant** (only option) |
| Month boundary | `monthBoundary: "jie_terms"` | 節 terms vs 中氣 vs lunar month | **節 terms** (only option) |
| Day rollover | `dayBoundary: "civil_midnight" \| "zi_23"` | civil midnight vs 子時 23:00 | both, default civil midnight |
| Hour basis | `hourBasis: "civil_clock" \| "local_mean_solar" \| "true_solar"` | civil clock vs mean-solar vs true-solar | all three; presets expose civil + true-solar |
| Da Yun start | `dayunStartRule: "three_days_one_year"` | 3d=1yr vs finer 時辰 lineages | **3 days = 1 year** (only option) |

## The presets (`CONVENTION_PRESETS`)

| id | label | differs from default by |
|---|---|---|
| `ziping_default_v1` | Classical Zi Ping (default) | — |
| `ziping_zi23_v1` | 23:00 Zi-hour day rollover | `dayBoundary: zi_23` |
| `ziping_true_solar_v1` | True solar time (真太陽時) | `hourBasis: true_solar` |

## How the engine handles convention sensitivity

- **Convention sweep** (`src/engine/sensitivity/conventionSweep.ts`): every reading
  re-runs the request under the other presets and reports whether the top day and the
  subject's pillars survive. Instability lowers `confidence` (component
  `conventionStability`) and is surfaced in the UI ("Convention stability: high/medium/low").
  A 23:30 birth, for example, is *inherently* high-sensitivity because the day pillar
  flips under Zi-hour rollover — the UI says so instead of speaking with false precision.

- **Location-precision policy** (`src/engine/request.ts`): a solar hour basis
  (`true_solar` / `local_mean_solar`) is location-dependent. If the birthplace
  longitude is missing, `canonicalizeBirth` **downgrades** the convention to
  `civil_clock` and attaches an explicit warning, rather than silently applying an
  equation-of-time-only approximation. Supplying a birth city restores the full
  真太陽時 correction (longitude + equation of time). The engine keeps an independent
  guard as defence in depth.

- **Boundary awareness**: births near 立春, a 節 month boundary, or the Zi-hour
  transition raise `boundaryRisk` and emit warnings — those are exactly the inputs
  where a convention choice changes the pillars.

## What is fixed vs variable

Fixed (single value in the type): year boundary (立春-exact), month boundary (節),
Da Yun start rule (3:1). Variable and swept: day rollover and hour basis. Users from a
lunar-New-Year, 中氣-month, or non-3:1 大運 school are outside what this engine models —
that limitation is stated rather than hidden.
