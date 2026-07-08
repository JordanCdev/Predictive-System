# VERIFICATION.md — Third-party verification & sensitivity architecture

This document describes how the engine's outputs are verified against independent sources,
how instability is measured, and exactly what each check can and cannot claim. It is the
operational companion to [DECISIONS.md](DECISIONS.md) (which records what every number
means); read that first if you are auditing the scoring itself.

**The one-sentence contract:** external sources can verify **time and calendar facts** —
solar-term instants, pillars, officers, day gods, clashes. Nothing here verifies whether a
wedding, contract or move *turns out well*, and the UI never claims otherwise.

---

## 1. The four separated outputs

| Layer | Output | Evidence basis |
|---|---|---|
| Astronomy | solar longitude, solar-term instants | HKO published tables + JPL Horizons |
| Calendar/almanac | ganzhi pillars, 建除 officer, 黄黑道 day god, clash | internal engine ↔ lunar-javascript |
| Recommendation | `recommendationScore`, ranked days/hours | transparent engine heuristics (DECISIONS.md §6) |
| Confidence | `confidence` (0–100) | verification + sensitivity sweeps, recomputed per result |

Only the first two layers claim near-absolute reproducibility. The recommendation stays a
transparent heuristic; confidence measures how well-verified and perturbation-stable the
whole reading is.

## 2. Sources

### lunar-javascript (offline, in-process)

[`lunar-javascript@1.7.7`](https://www.npmjs.com/package/lunar-javascript) (6tail) is an
independently implemented Chinese calendar/almanac library used strictly as a comparator —
it never feeds the calculation path. Verifier: `src/engine/verification/verifyLunarJavascript.ts`.

Pinned semantics (probed against the installed package; asserted in tests):

- All returned strings are **simplified Chinese** (惊蛰, 满/执/开/闭, 青龙/金匮/勾陈,
  诸事不宜). The verifier converts through explicit alias maps before comparing with this
  engine's traditional forms.
- `Solar.fromYmdHms` takes **China Standard Time (UTC+8) wall-clock** values and is
  host-timezone independent. **Date-based facts** (day pillar, officer, day god, 宜/忌,
  clash) are probed with the *local civil date at noon*; **instant-based facts** (year/month
  pillar) are probed with the *UTC instant converted to CST wall-clock*.
- `getYearInGanZhiExact()` / `getMonthInGanZhiExact()` are the BaZi-convention APIs
  (boundary at the exact solar-term instant). `getYearInGanZhiByLiChun()` rolls at *midnight*
  of 立春 day and is **not** used.
- `EightChar.setSect(1)` = 23:00 day rollover (this engine's `zi_23`); sect 2 (its default) =
  civil midnight. The comparator's **hour stem always** uses the next day's stem from 23:00
  (晚子時) — under this engine's `civil_midnight` convention a 23:00–23:59 comparison is
  reported **warn** (school split), never fail.
- There is no 歲破 API in the library; year-break detection remains internal-only.

### HKO — Hong Kong Observatory (offline fixture)

`src/engine/verification/fixtures/hko-solar-terms.json` holds all **72 term instants for
2025–2027**, taken from HKO's official per-year XML data files
(`hko.gov.hk/en/gts/astronomy/data/files/24SolarTerms_YYYY.xml`, HKT to the minute, based on
HM Nautical Almanac Office data), converted to UTC. During fixture generation the values
were cross-checked against USNO/IMCCE- and JPL-sourced tables; the maximum discrepancy
anywhere was 1 minute (HKO rounds to the nearest minute).

**Yearly maintenance:** when HKO publishes the next year's table, append its 24 terms to the
fixture (`year`, `nameZh`, `longitude`, `utcIso`, `hktText`) and update `retrievedAtIso`.
`verifyTermsAround()` reports **unsupported** — never a silent pass — for dates outside
fixture coverage.

### JPL Horizons (offline fixture + opt-in live)

`fixtures/jpl-2026-crossings.json` holds five 2026 crossings (立春, both equinoxes, both
solstices) with raw 1-minute Horizons samples of **apparent geocentric ecliptic-of-date
longitude** (`QUANTITIES='31'`, `CENTER='500@399'` — light-time, gravitational deflection and
stellar aberration applied; the correct quantity for Chinese solar terms), interpolated to
the second.

Live checks (`src/engine/verification/jplHorizons.ts`) are **opt-in only**:

```bash
VERIFY_OFFLINE=1                # default posture; fixtures only
VERIFY_LIVE_JPL=1               # opt in to live queries (tests + manual CI job only)
JPL_REQUEST_DELAY_MS=1500       # enforced inter-request delay
JPL_TIMEOUT_MS=15000
```

Per JPL's API terms the client serialises all requests through a single-flight queue with
the delay above, and validates the response `signature.version` (expected major `1.x`) —
a format change fails safely instead of being misparsed. **Never call Horizons from the
browser**; the live client exists for tests and the manual CI job only.

## 3. Tolerances

| Check | Pass | Warn | Fail |
|---|---|---|---|
| Solar-term instant | ≤ 120 s | ≤ 600 s | > 600 s |
| Solar longitude | ≤ 0.001° | ≤ 0.01° | > 0.01° |
| Year / month / day pillar | exact | boundary-frame only | any other mismatch |
| Hour pillar | exact | 23:00–23:59 school split | mismatch elsewhere |
| Officer 建除 / day god 黄黑道 / clash | exact | 節-boundary frame only | any other mismatch |
| 宜/忌 advisory | activity in 宜 | differs / unlisted / 诸事不宜 | never (non-blocking) |

Notes: the engine's measured solar-term accuracy is ~25 s; HKO publishes to the minute, so
up to ~30 s of any delta is source rounding. This engine emits no 宜/忌 lists (it scores
officers per activity instead), so that check is an advisory comparison of the timed
activity only — almanac prescriptions legitimately differ between publishers.

## 4. The VerificationReport

`verifyDecisionResult(req, result, checkedAtIso)` (dynamic-import
`src/engine/verification/runVerification.ts`) checks the top recommendation's calendar
facts, the natal pillars (when personalized), and the two solar-term boundaries bracketing
the top day. It returns a typed `VerificationReport`:

- `fields[]` — per-field `pass|warn|fail|unsupported` with expected/actual/delta/threshold;
- `overallAgreementScore` (0–100) — pass=1, warn=0.7, fail=0; blocking fields weigh double;
  unsupported fields are excluded, never counted as agreement;
- `blockingDisagreements[]` / `nonBlockingDisagreements[]` / `warnings[]`;
- provenance: sources with versions, `calculationHash`, `engineVersion`, `conventionId`.

`applyVerificationReport(result, report)` (exported from the main engine index) returns a
NEW result whose per-day confidence uses the **measured** `thirdPartyAgreement` and a
`sourceCoverage` derived from which source families actually ran (internal only = 40;
+lunar-javascript = 75; +HKO = 85; +JPL = 95). The app runs this automatically after every
evaluation — the comparator loads as a separate lazy chunk and never touches the
deterministic calculation path.

## 5. Sensitivity sweeps

Confidence must fall when the answer is fragile, before any external source is consulted.
Both sweeps run inside `evaluateDecision` by default (`options.sweeps=false` for bulk paths):

- **Convention sweep** (`sensitivity/conventionSweep.ts`): re-evaluates the request under
  every other supported convention preset and reports the top day's rank, subject-pillar
  flips, and best-hour changes. Severity high (→ stability 35) when the top day leaves the
  top-3 or a year/month/day pillar flips; medium (65) for milder movement; low (95) when
  stable. A 23:30 birth is *by construction* high-sensitivity — the day pillar flips under
  Zi-hour rollover — and the UI now says so instead of speaking firmly.
- **Weight sweep** (`sensitivity/weightSweep.ts`): each MCDA weight ×0.9 and ×1.1
  (renormalised), rankings rebuilt from the already-computed sub-scores — 8 deterministic
  perturbations. Reports top-day stable ratio, worst rank, gap to #2 and near-tie count.
  Severity maps to a `heuristicSensitivity` penalty (10/45/80).

## 6. The confidence model (before → after)

Before: fixed constants (`sourceQuality=0.8`, `validation=0.85`…) — could read high with no
external agreement and no stability evidence (old DECISIONS.md §6.12/§7 critique).

After (`computeConfidence`, decision.ts):

```
overall = 0.20·reproducibility + 0.25·thirdPartyAgreement + 0.15·conventionStability
        + 0.10·inputCompleteness + 0.10·sourceCoverage + 0.10·(100 − boundaryRisk)
        + 0.10·(100 − heuristicSensitivity) − conflictPenalty      → clamped 0–100
```

- `thirdPartyAgreement` starts at a **neutral 50** (flagged "cross-check pending") and is
  replaced by the measured agreement when a report is applied; `verified` flips to true.
- `boundaryRisk` accumulates real fragility: a 節 crossing inside the candidate day, a natal
  chart near a strength cut-point (±0.02 of 0.34/0.45/0.52 — see
  `dayMaster.strengthBreakdown`), and birth-moment boundary warnings.
- `inputCompleteness` drops when a solar hour-basis is requested without a longitude (the
  engine also warns and applies the equation of time only).
- `conflictPenalty` deducts up to 25 points for cross-school conflicts on the day.

Every component ships in `confidence.components` with human-readable `notes[]`, so the UI
breakdown is the actual arithmetic, not a summary of it.

## 7. Running the checks

```bash
npm test                                   # everything offline: golden, cross-check, fixtures, sweeps
npm test -- tests/verification             # verification suites only
VERIFY_LIVE_JPL=1 npm test -- tests/verification/solarTerms.live.test.ts   # live JPL (opt-in)
```

CI: `.github/workflows/ci.yml` runs the offline suite on every push/PR (`VERIFY_LIVE_JPL=0`);
`.github/workflows/live-verification.yml` is a manual `workflow_dispatch` job for the live
JPL check.

## 8. Failure policy

- **Fail** when astronomy or exact ganzhi facts disagree beyond threshold — these are
  arithmetic, not opinion.
- **Warn** when almanac prescriptions differ, a comparison crosses a known frame/convention
  split (CST vs local date on 節-boundary days; 晚子時 hour stems), or a field is unavailable.
- **Lower confidence** — never block — for near-boundary results and sweep instability.
- **Never block on live JPL availability**: fixtures are the operating mode; live is audit.
