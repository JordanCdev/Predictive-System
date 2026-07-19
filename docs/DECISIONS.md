# DECISIONS.md — What This App's "Accuracy" Actually Means

This document is an honest, line-referenced record of every design, doctrine, and scoring decision in the Predictive System engine. It exists so a skeptical reader can judge exactly what the app's numbers mean — and, just as importantly, what they do **not** mean.

Read the first section fully. If your intuition is "the score doesn't feel accurate," this document will tell you precisely where that intuition is **correct** and where it isn't.

---

## 1. What "accuracy" means here — the six layers

The word "accuracy" is doing at least six different jobs in this app. They are not the same, they do not have the same confidence, and conflating them is the single biggest source of misunderstanding. Up front, unambiguously:

| Layer | What it is | How solid | Where you'll find it below |
|---|---|---|---|
| **(a) Calculation accuracy** | The astronomy + calendar + four-pillar arithmetic (Julian Day, solar longitude, term crossings, sexagenary cycle, 五虎遁/五鼠遁, day/month/year pillars). | **High and verified** against definitions and published golden charts. | §2 |
| **(b) Canonical tables & formulas** | The reference data of the tradition (VSOP87 terms, 藏干 membership, 十神 rules, 納音, 三合/六合, 建除, 黄黑道, 天乙貴人, 大運 direction). | **Verified against the tradition** — matches standard sources by construction. | §3 |
| **(c) Conventions** | Consequential *choices* where reasonable schools legitimately disagree (立春 vs lunar-New-Year year boundary; civil-midnight vs 子時 day rollover; civil-clock vs true-solar hour). | **Legitimately variable.** This is the top reason your result differs from another BaZi site. | §4 |
| **(d) Interpretive layer** | Day-Master strength classification, 用神/favourable-element selection, 調候, supportRatio, 得令. | **School-dependent.** A real method, but one method among several. | §5 |
| **(e) The 0–100 SCORE** | A transparent engineering heuristic: author-chosen MCDA weights over four sub-scores, plus dozens of invented point magnitudes and band cut-points. | **NOT a classical metric.** Different reasonable weights reorder the days. A master uses holistic judgment, not additive scoring. | §6 |
| **(f) Predictive / outcome accuracy** | Whether the recommended day actually produces a good outcome. | **Explicitly NOT claimed.** The "confidence" index is *epistemic* (how solid the reasoning is), never a probability that events turn out well. | §7 |

**Be candid:** layers **(e)** and **(d)** are where "this doesn't feel accurate" is a *correct* reaction. The pillars (a, b) are essentially fixed truth; the *ranking* (e) is one defensible opinion built on another defensible opinion (d), assembled from invented numbers. No classical almanac emits a 0–100 day-score. When this app says a day is "Excellent," that is a heuristic bucket, not a measured quality.

---

## 2. Verified calculation (Class A)

These are pure-arithmetic or root-finding steps checked against their definitions and against independent published charts.

### Julian Day from UTC milliseconds
`astronomy.ts:21-27` — `JD = utcMillis/86400000 + 2440587.5` (and its exact inverse). Standard Unix-epoch→JD conversion (JD of 1970-01-01T00:00Z = 2440587.5). *Limitation:* leap seconds ignored (as in all JS `Date`); sub-second, irrelevant to term boundaries.

### Proleptic-Gregorian Julian Day Number (Fliegel & Van Flandern)
`astronomy.ts:34-47` — canonical integer JDN algorithm. **Verified:** `gregorianToJDN(1893,12,26)=2412824`, and `gregorianToJDN(2000,1,1)` yields the published 戊午 day pillar via the anchor. *Limitation:* proleptic Gregorian for all dates — pre-1582 dates a source recorded in the Julian calendar will be off by the Julian/Gregorian offset. Correct for modern BaZi use.

### Solar-term crossing root-find
`astronomy.ts:263-272` — Newton-style fixed-point iteration using the Sun's mean daily motion 0.98564736°/day as the derivative; ≤12 iterations; converges when |Δ|<1e-7° (≈0.0006 s of time). *Limitation:* the real limiting error is the VSOP truncation (§3), not the root-find — the tolerance is far tighter than the underlying series.

### Day-pillar epoch anchor
`sexagenary.ts:37-46` — the entire continuous day cycle rides on one pinned anchor: **Mao Zedong's civil birth 1893-12-26 = 丁酉 (index 33)**. `dayIndex = mod(JDN(date) − 2412824 + 33, 60)`. **Cross-checked:** 2000-01-01 → index 54 = 戊午, matching published almanacs, so the cadence is right. *Limitation:* the whole cycle depends on this anchor's correctness (verified) and on **which** civil day feeds it — that's the day-boundary convention in §4, not the anchor.

### Year-pillar anchor
`sexagenary.ts:144` — `yearIndex = mod(baziYear − 1984, 60)`, 1984 = 甲子 (canonical, widely published). Only sensitivity is which `baziYear` is selected (the 立春 boundary, §4).

### `lichunMillis` seed & memoization
`astronomy.ts:366-374` — 立春 search seeded at Feb-4-noon UTC (inside the Newton basin, since 立春 falls Feb 3–5); 節 searches seeded ±16 days. Cache is a pure deterministic memo; comment notes it "never changes results."

### Percent rounding & dominant/weakest selection
`bazi.ts:204-210` — straightforward normalization; ties resolved by JS sort stability (first-encountered element order), cosmetic only.

### Determinism contract & explanation-layer-never-alters-scores — **confirmed**
`plainEnglish.ts:1-13`, `advisor.ts:1-17`, verified against `decision.ts`. See §9.

---

## 3. Canonical tables & formulas (Class B)

Matches the tradition/recipe by construction. "Canonical" here means it reproduces standard published data — not that every coefficient was independently re-derived in this review.

**Astronomy / calendar**
- **ΔT pre-2005** (`astronomy.ts:61-122`): Espenak–Meeus piecewise polynomials + pre-1800 millennial parabola `ΔT = −20 + 32·u²`. Matches published NASA/Espenak fits. (Note: the **2005+** ΔT branches are *not* canonical — see §6.)
- **Abridged VSOP87D Earth series** (`astronomy.ts:132-198`): truncated L0–L5/R0–R2 from Meeus, *Astronomical Algorithms* 2nd ed., Appendix III. Stated ~0.0005° (~3 s of time) truncation-limited accuracy. Not re-verified line-by-line.
- **VSOP→FK5 + main-term nutation + aberration** (`astronomy.ts:209-224`): standard Meeus ch.25 reduction to apparent longitude. Only the single dominant nutation term is included; sub-arc-second divergence from a full-nutation ephemeris.
- **Equation of time** (`astronomy.ts:231-248`): Meeus 28.3; used only under `hourBasis='true_solar'`.
- **24 solar-term longitude table + 節/中氣 tagging** (`astronomy.ts:288-316`); **month-branch from longitude** (`astronomy.ts:322-325`, 寅 opens at 立春 315°). Canonical Zi Ping model. *Note:* the table **encodes** the convention choices in §4 (節 as boundaries, 立春 as year origin).

**Pillar construction**
- **五虎遁** year-stem → 寅-month stem (`sexagenary.ts:122-125`); **五鼠遁** day-stem → 子-hour stem (`sexagenary.ts:127-130`); **hour-branch from clock hour** (`sexagenary.ts:132-134`, 子 = 23:00–01:00). All standard mnemonic-table results. Correctness inherits from the upstream day/year convention feeding them.

**Symbolic ontology**
- Heavenly Stems & Earthly Branches (`symbols.ts:33-60`); 五行 生/克 cycles (`symbols.ts:71-105`); **十神 derivation** (`symbols.ts:162-170`, pure canonical); **納音** 60-pair table (`symbols.ts:203-238` — *computed & displayed but never feeds strength/scoring; decorative*); 三合/三會/六合/六沖 frames (`symbols.ts:272-305`).

**Tong Shu day-facts**
- **建除十二神** officer = `(dayBranch − monthBranch) mod 12` (`tongshu.ts:146`); **黄道黑道** day-god via 青龍 anchor `(monthBranch·2+8) mod 12` (`tongshu.ts:147-148`); **四離/四絕** detection via a 45° longitude crossing on the next civil day (`tongshu.ts:117-131`); **三煞 direction** table (`tongshu.ts:81-93` — *displayed but never scored*); **天乙貴人** nobleman table (`tongshu.ts:183-189`); **六合/三合/桃花/驛馬** personal Shen Sha tables (`tongshu.ts:173-181, 220-238`).

**BaZi doctrine primitives**
- **旺相休囚死** seasonal-state relations (`bazi.ts:214-220`); **大運 direction** 陽男陰女順行/陰男陽女逆行 (`bazi.ts:363-366`); **大運 pillar sequence** from month pillar ±1 through the 60 cycle, 10 yrs each (`bazi.ts:376-388`).

*Two Class-B items carry a mild school-dependence flagged in-code:* the **六合 resultant element** (e.g. 子丑→earth, 午未→fire) is "commonly assigned" but debated; and the **藏干 stem membership** is canonical while its **weights** are not (see §4).

---

## 4. Conventions that change the answer (Class C)

**This is the #1 reason your result differs from another BaZi site.** Each is a legitimate choice; the app binds every calculation to an explicit `ConventionSet` (good practice), but for several of these it offers **only one option**.

| Convention | Code | Options in the wild | This app's default | How a different choice changes the result |
|---|---|---|---|---|
| **Year boundary** | `conventions.ts:7` `'lichun_exact'`; `sexagenary.ts:141-144`; `astronomy.ts:367-374` | 立春-exact **vs** lunar New Year (正月朔) **vs** Jan 1 | **立春 exact instant** (only option in the type) | A late-Jan/early-Feb birth can get a **different year pillar** — and therefore a different month stem via 五虎遁 — under a lunar-New-Year school. A birth within minutes of 立春 flips the year pillar. |
| **Month boundary** | `conventions.ts:16` `'jie_terms'`; `astronomy.ts:344-360` | 節 (jie) terms **vs** 中氣 **vs** lunar month | **節 terms** (only option) | A calculator using lunar months disagrees for births between a 節 and the lunar month edge. No alternative preset offered. |
| **Day rollover** | `conventions.ts:8,30,35-40`; `sexagenary.ts:91-94` | civil midnight **vs** 子時 23:00 | **civil_midnight** (preset `zi_23` available) | **Major divergence:** a birth 23:00–23:59 gets a **different day pillar** — and thus a different hour stem via 五鼠遁, possibly cascading to month/year. No 早子時/晚子時 split; it's all-or-nothing on the day. Some practitioners consider the civil-midnight default *wrong*. |
| **Hour basis** | `conventions.ts:9,30,47`; `sexagenary.ts:66-79` | civil clock **vs** local-mean-solar **vs** true-solar | **civil_clock** (no correction) | Near a time-zone edge or in a wide zone (e.g. all of China on UTC+8), civil clock can put the hour branch in the **wrong 時辰** vs a true-solar calc — a very common real-world discrepancy. Solar correction is **silently skipped** if longitude is missing (`sexagenary.ts:68`), and is rounded to whole minutes (`:79`). |
| **Birth UTC offset (DST / historical zones)** | `timezone.ts`; `cities.ts`; `PersonalizeCard.tsx` | present-day standard offset **vs** the offset actually in force on the birth date | **resolved from the IANA database for the birth date** (was: standard offset, user-corrected) | *This was a real defect until Phase 10.* Using a zone's standard offset puts a British July birth an hour early (BST, not GMT), misses China's 1986–91 summer time entirely, and ignores permanent zone moves such as Spain's switch to CET. An hour is frequently enough to cross a 時辰 boundary and change the **hour pillar** — `tests/timezone.test.ts` demonstrates exactly that for London 1990-07-14 15:30. Now resolved automatically, stated in the UI, and overridable (which switches off the automatic correction). Ambiguous times (clocks went back) take the earlier occurrence and say so; non-existent times (clocks went forward) are flagged rather than silently accepted. |
| **Solar correction shifts the date frame** | `sexagenary.ts:76-94` | — | applies correction *before* deriving effective date | A correction crossing midnight moves the day pillar. *Subtle bug-risk:* the year-pillar test compares uncorrected UTC (`:143`) against 立春 while `gregYear` comes from the solar-corrected `effective.year` (`:141`) — near a 立春 + January-solar-shift these frames can be inconsistent by the correction amount. Edge-case. |
| **Boundary ambiguity disclosure** | `boundary.ts`; `sexagenary.ts` boundaryFlags; `BoundaryNotice.tsx` | pick a side silently **vs** show both candidate charts | **show both, prominently** | A birth near 立春, a 節, or the 23:00 子 seam is genuinely ambiguous — the uncertainty is in the birth *record*, not the ephemeris. The engine detected this before but buried a 12.5px footnote at the bottom of the last card, and `result.meta.boundaryWarnings` had **zero consumers**; `/today`, `/week`, `/month`, `/year` and `/group` showed nothing at all, and the AI advisor was never told, so it narrated ambiguous charts with full confidence. Now: structured `BoundaryFlag`s, the alternative chart computed and shown side by side with the differing pillars marked, a compact strip on every reading page, and `boundaryAmbiguity` passed to the advisor with a prompt rule requiring it be raised. The 子-seam test also no longer fires at 00:00–00:59, where both day-boundary schools in fact agree — that was a false alarm on a chart that isn't in doubt. |
| **Clash severity by natal pillar** | `tongshu.ts` `personalShenSha`; `decision.ts` `CLASH_SEVERITY` / `clashSeverityOf` | flat "any clash is bad" **vs** the graded 擇日 rule | **graded: 日/時沖 = hard veto, 月沖 = ceiling 68, 年沖 = noted only** | *This was a real defect until Phase 10.* The engine read only the Day and Year branches and treated both identically, so a 沖生肖 **year** clash hard-vetoed a wedding date that 「年沖可用」 says is usable — while **month and hour** clashes were invisible to date selection entirely. Now follows 「日時沖命大凶不用，月沖次之權用，年沖可用」. Note this is deliberately *less* strict on 沖生肖 than popular usage, which often treats the zodiac clash as decisive; we follow the stated classical rule and show the tag rather than silently adopting the more dramatic reading. The Hour pillar is only consulted when the birth time is **known** — with an unknown time the engine substitutes noon, and vetoing on a fabricated branch would be worse than not checking. |
| **歲破 太歲 branch** | `tongshu.ts:153-155`; `decision.ts:261-270` | 立春 vs lunar-New-Year 太歲 switch | 立春 boundary | A 通書 switching 太歲 at lunar New Year yields a different 歲破 branch (and thus a different day taboo) for late-Jan/early-Feb dates. |
| **Candidate-day instant & day pillar** | `decision.ts:499-503` | civil-midnight vs 子時 | local-noon instant; **civil-date** day pillar | A 子時 school assigns the next day's pillar to 23:00–24:00 events → a different officer, day-god, and clash for anything in that hour. |
| **藏干 hidden-stem weights** | `symbols.ts:110-130` | 6:3:1 **vs** 5:3:2 **vs** 7:2:1 **vs** day-count 氣候 | main 0.6 / mid 0.3 / residual 0.1 (午 = 丁0.7/己0.3; 亥 = 壬0.7/甲0.3) | *Stem membership is canonical; weights are a labelled engine convention.* A different weighting shifts element accounting, rooting, and thus Day-Master strength. Code itself says: "weights are an explicit engine convention, not a universal truth." |
| **Season = month-branch phase** | `bazi.ts:271` | own-phase proxy vs hidden-stem 當令 apportionment | month branch's own five-phase | For the four 土 months 辰戌丑未 this labels the season "earth," where many practitioners assign 辰→spring-wood, 未→summer-fire, etc. Changes 旺相休囚死 and the SEASON_ADJ nudge. |
| **大運 start-age refinement** | `bazi.ts:368-374` | 3d=1yr only vs 3d=1yr/1d=4mo/1時辰=10d | days-to-節 ÷ 3, rounded to 2 dp | Finer 時辰-level lineages shift start age by a fraction of a year → which calendar year each luck pillar activates. |
| **Confidence-component display order** | `plainEnglish.ts:369-407` | — | reproducibility/source/validation first | Presentation only; foregrounds the most flattering components (reproducibility = 1.0). No values changed. |
| **Timeframe unit conversions** | `advisor.ts:151-194` | — | month=30d, year=365d, snapped to `[14,31,92,186,365,730,1826]` | Rounding convention; sets the search horizon (not a pillar). "2 months" (60d) snaps to 92d. English idioms only. |

**Single-valued types (no alternative school selectable):** year boundary, month boundary, and `dayunStartRule='three_days_one_year'` each define exactly one value (`conventions.ts:7,10,16`). Presets vary **only** `dayBoundary` and `hourBasis`. Users from a lunar-New-Year, 中氣-month, or non-3:1 大運 school are silently locked to Zi Ping defaults.

---

## 5. School-dependent interpretation (Class D)

A real, common method — but one method among several. Masters legitimately differ. These are stated with the **exact thresholds the code uses** so you can see where a boundary sits.

- **supportRatio definition** (`bazi.ts:255-260`): `support = 印(resource)+比劫(companion)`, `oppose = 食傷(output)+財(wealth)+官殺(officer)`, ratio = support/(support+oppose). A legitimate two-camp partition, but many masters weight the groups unequally (官殺 attacks more than 財 drains; rootless resource counts less), use 生剋 chains / 通關, and privilege the month command over raw counts.
- **hasMonthCommand (得令)** (`bazi.ts:263-268`): true if the month branch's own phase **or any hidden-stem phase** equals the DM's companion or resource phase. Counting a 0.1-weight residual as conferring command is **generous** — many schools require the 當令 main-qi. Over-triggers 得令, which then lowers the "strong" bar (below).
- **用神 / favourable-element selection** (`bazi.ts`): strong → favour 食傷/財/官, disfavour 比劫/印; weak → favour 印/比劫, disfavour the rest; balanced → favour 食傷/財, nothing unfavourable. This is 扶抑用神 — real and common, but only one of several doctrines (調候, 病藥, 通關). The balanced tie-break is ad-hoc. **從格/專旺 special structures ARE now handled** (v0.3): a rootless, 失令, ≤15%-support DM is classified `follow` (從格) and a strongly-rooted, 得令, ≥72%-support DM is classified `dominant` (專旺), each inverting the useful-element set — the extreme charts that classical doctrine treats specially and that this engine previously mis-advised. Thresholds (raw support ratio + month-command gate) are engine calibration, kept strict so ordinary charts stay `normal`. **調候 is now reconciled explicitly** (`climaticReconciliation`: aligned / conflict / not_applicable) — surfaced, never silently merged into 用神.
- **調候 climatic regulator** (`bazi.ts:235-243`): month ∈ {亥子丑} → need Fire; ∈ {巳午未} → need Water; else null. Cites 窮通寶鑑. But real 調候 depends on the **day master** and specific month, not month-branch alone; surfaced separately from strength-用神 with **no reconciliation** — the two can silently conflict.
- **Personal Shen-Sha reference point** (`tongshu.ts:223`): 桃花/驛馬/harmony keyed to the subject's **day** branch group. Many practitioners key off the **year** branch. Changes which days light up.
- **Hard-constraint vetoes** (`decision.ts:385-395`; `objectives.ts`): which officers are absolute vetoes vs merely penalized is an editor's choice. E.g. only 破 (not 危) is vetoed for travel; wedding vetoes 執/閉 but not 危/滿. The `clashVeto` set (which objectives treat a personal clash as fatal) is a judgement call.
- **Prose-level taboo overrides** (`plainEnglish.ts:239-325`): the headline can say "Best avoided / 諸事不宜" while the raw number still reads Neutral/Good, because a taboo only dented one sub-score. `whyThisDay` **suppresses genuine positive bullets** on taboo/`<45` days. Honest intent (don't cheer a taboo day) but the narrative is a curated view, and *which* taboos are headline-dominant is doctrine.
- **actionGuidance / 三煞 direction** (`plainEnglish.ts:500-561`): 三煞 direction taboo applied **only** to renovation/moving; other practitioners apply direction taboos more broadly.
- **Glossary editorial compression** (`plainEnglish.ts:171-235`): the index→hanzi mapping is canonical; the one-line English activity blurbs are the author's simplification.

---

## 6. Heuristic calibration — the honest core (Class E)

**These numbers are invented.** They are engineering knobs with no canonical basis. No classical text expresses day selection as a weighted average of four 0–100 sub-scores, and no almanac emits a 0–100 officer or day-god number. This section is why the **ranking** is one opinion among many — reasonable alternative values reorder the days.

### 6.1 ΔT refit (author's replacement for the published polynomial)
- **2005–2050** (`astronomy.ts:53-59`): `ΔT = 64.7 + 0.2368·(year−2005)` s, giving ΔT(2024)=69.2s, ΔT(2005)=64.7s. The code deliberately replaces the Espenak–Meeus 2005–2050 polynomial (a ~2006 prediction that now overshoots: it gives ΔT(2024)=73.9s vs observed ~69.2s). Hand-fitted linear fit on two observed points plus an assumed slope.
- **Post-2050** (`astronomy.ts:114-119`): `ΔT = 75.36 + 1.5·(year−2050)` s; 75.36 chosen for continuity at 2050. Pure extrapolation.
- *Effect:* sub-arc-second in solar longitude → a term-crossing time can move by a few seconds at most. **Improves** on the stale published prediction but is an engineering choice, not a verified ephemeris. A calculator using stock Espenak–Meeus will differ by up to several ΔT-seconds.

### 6.2 The MCDA weights — biggest single honesty point
**Per-objective weights** (`objectives.ts:37…180`; applied `decision.ts:367-375`), each summing to 1.0:

| | officer | personal | road | hour |
|---|---|---|---|---|
| **DEFAULT** | .34 | .34 | .16 | .16 |
| renovation | .40 | — | — | — |
| career / medical | — | .40 | — | — |
| negotiation | .28 | — | — | .20 |
| travel | — | — | — | .18 |

No canonical basis. `recommendationScore` is a transparent composite of the author's numbers, not a traditional auspiciousness measure. **Almanac-only mode** (`decision.ts:367-375`) drops personal/hour and renormalizes to `(officer·off + road·road)/(off+road)` — an honest degradation, but then the score is driven *entirely* by two heuristic sub-scores, doubly synthetic.

### 6.3 The DAY_GOD_SCORE lookup — the other biggest honesty point
`decision.ts:157` — `[88,80,28,30,82,90,22,84,30,26,78,34]` indexed by day-god. Yellow gods 78–90, black gods 22–34, a made-up ~50-point gap. The yellow/black **classification** is canonical (§3); the 12 specific numbers and their internal ordering (天德=90 > 青龍=88 > 明堂=80) are invented and drive the 16% road-weighted contribution.

### 6.4 Officer raw→score mapping
`decision.ts:230-234` — `officerScore = clamp(50 + officerRaw·3.5, 0..100)`, where `officerRaw = base(−10..+10) + 6 if good-tag + 1 if 'general' + (−8) if bad-tag`. The good/bad activity lists reflect tradition; the base magnitudes (定=+4, 成/開=+5, 破=−10, 危=−3…), the +6/+1/−8 tag deltas, the ×3.5 gain and 50 midpoint are all invented.

### 6.4b Almanac 宜忌 blend (v0.3 — the accuracy lever)
When the day's mainstream-almanac 宜忌 is available (injected from lunar-javascript via the lazy chunk), the final score is `0.6·structuralMCDA + 0.4·almanacScore`, where almanacScore is 82 (宜 for the activity) / 22 (忌 or 诸事不宜) / 52 (neutral). The **0.6/0.4 blend and the 82/22/52 points are invented calibration** — but the *signal* is a real external benchmark (what a 通勝 actually says), and `meta.almanacAgreement` reports, pre-blend, how often the classical 建除 officer verdict already agreed with it. Rationale: the almanac is the closest thing to shared ground truth for day-selection, so it earns real weight; see docs/CONVENTIONS.md.

### 6.5 Taboo penalties — now split hard/soft by objective (v0.2)
- **四離四絕** −18 to officer score, skipped for medical.
- **歲破** −20 to officer score, skipped for medical.
- **Hard exclusions** (`objectives.ts` `hardCalendarTaboos`; enforced in `decision.ts`):
  weddings, moving, opening a business and renovation hard-veto **all three** taboos;
  contract signing hard-vetoes 歲破 + 四離; medical stays exempt (求醫 is the classical
  exception); the remaining objectives keep soft penalties only.

The **taboos themselves** are canonical (大事勿用 / 諸事不宜); the penalty **magnitudes**
remain invented. The earlier candour point — that a 歲破/四離 day with an otherwise
excellent profile could still surface as a recommendation, treating 大事勿用 as *softer*
than a bad officer — is **fixed as of v0.2**: for high-stakes objectives these days are
excluded outright and shown in "ruled out" with a plain reason. Which objectives count as
high-stakes is itself an editorial choice, recorded here.

### 6.6 Element accounting knobs
- **月令 ×1.6 boost** (`bazi.ts:171-185`): applied to the month stem + all its hidden stems. That 月令 dominates is doctrine; **1.6** is invented (1.4 or 2.0 equally defensible) and moves the dominant/weakest element and supportRatio.
- **Branch-interaction reshaping** (`bazi.ts:191-202`): 三會 +2.0, 三合 +1.5, half-三合 +0.6, 六合 +0.4, clash −0.5 per branch. Detection is canonical; magnitudes invented. **Double-counting risk:** pooled weight is *added* without removing the constituents' original phase (no 化 transform), so a full 三合 keeps the members' phases **and** adds +1.5.
- **SEASON_ADJ** (`bazi.ts:272-278`): 旺 +0.12, 相 +0.06, 休 −0.02, 囚 −0.10, 死 −0.15 added to supportRatio. The idea (得令 strengthens) is doctrine; the exact numbers are invented and push charts across the band edges.
- **通根 rooting** (`bazi.ts:281-293`): main-qi root (weight≥0.6) +0.10; lighter root +0.04; rootless −0.08. Magnitudes invented; hostage to the school-dependent hidden-stem weights (§4); ignores root **location** (month/day root classically far stronger — treated equally here).

### 6.7 Day-Master strength band thresholds — one of the biggest single-point sensitivities
`bazi.ts:296-301` — `adjusted = clamp(supportRatio + SEASON_ADJ + rootAdj, 0..1)`; **strong** if ≥0.52 OR (≥0.45 AND hasMonthCommand); **weak** if ≤0.34; else **balanced**. The cut-points **0.52 / 0.45 / 0.34** and the "month-command lowers the strong bar to 0.45" rule are invented. A chart at adjusted 0.44 vs 0.46 flips balanced↔strong (with month command), which **inverts the entire favourable-element set** and cascades through every personal sub-score.

### 6.8 Personal (Evaluator 3) magnitudes
`decision.ts:299-345` — base 50; Ten-God support +12 (or `max(12, fStem·10)`, credited once via an anti-double-count guard); favourable/unfavourable **stem** element ±10; **branch** element ±5; **Nobleman-day +14**; clash_day −20; clash_zodiac −16; six/triple harmony +6; peach_blossom +6 (weddings only); travelling_horse +10 (travel/move only). All magnitudes invented. Two tensions with the stated "demote 神煞" principle: **Nobleman (+14) outweighs a favourable stem element (+10)**, and a −20 clash is numerically **larger** than most structural terms — so 神煞 can dominate the day score. Whether a Ten-God "supports the goal" also depends on per-objective `godBias` lists (Class D, `objectives.ts`).

### 6.9 沖大運 (luck-pillar clash)
`decision.ts:348-355` — −12 when the day branch opposes the active 10-yr 大運 pillar. Magnitude invented; the active pillar depends on 大運 start-age (Class C) and a plain 365.25-day age fraction (not a 節-based age) — boundary years can select the adjacent pillar.

### 6.10 Hour score (Evaluator 4)
`decision.ts:166-205` — base 50; Ten-God +10; hour-branch element ±8; 時沖日 clash −15; Nobleman-hour +10. All invented. **Only the single best hour feeds `recommendationScore`** (`decision.ts:361`), so a day with one great hour and eleven poor ones scores identically on this axis to an all-good day.

### 6.11 Cross-school conflict thresholds
`decision.ts:398-412` — tongshu-vs-bazi: officer≥62 & personal≤40; bazi-vs-tongshu: personal≥62 & officer≤38; road-vs-officer: road≥78 & officer≤38; officer-vs-road: road≤34 & officer≥62. Knife-edges with no doctrinal meaning (61/41 raises nothing; 62/40 does); severity labels assigned by hand. These feed the confidence penalty (§7).

### 6.12 Confidence-component weights (rebuilt in v0.2 — evidence-based inputs)
The old fixed component constants (sourceQuality=0.8, validation=0.85/0.7, ruleCoverage
0.65/0.45…) are **gone**. `computeConfidence` (decision.ts) now consumes measured inputs:
third-party agreement (from a `VerificationReport`, neutral 50 until one is applied),
convention stability and heuristic sensitivity (from the sweeps in `sensitivity/`),
boundary risk (節-in-day, near-cut-point strength, birth-boundary warnings), input
completeness, and source coverage. **Still invented:** the combining weights
(.20/.25/.15/.10/.10/.10/.10 − conflictPenalty) and the severity→score maps (95/65/35 and
10/45/80) are calibration choices, recorded in docs/VERIFICATION.md §6. What changed is
that no component can read high without evidence behind it.

### 6.13 Boundary / advisor / verdict thresholds
- **boundaryWarnMinutes = 120** (`conventions.ts:32`): ±120 min around 立春/節 triggers a warning; hour ∈ {23,0} always warns. Affects **only the warning**, never the pillars. Arbitrary magnitude.
- **Verdict bands 72/58/45/32** (`plainEnglish.ts:29-35`) → Excellent/Good/Neutral/Weak/Avoid. The **single source** of banding (not defined in `decision.ts`). A day at 57.9 reads "Neutral," 58.0 reads "Good." The header comment calls these "classical" — **that word is unsupported**; they are calibration on top of the heuristic score.
- **Confidence labels 0.8/0.65/0.5** (`plainEnglish.ts:37-42`) → High/Good/Moderate/Low. Because the underlying number barely moves between charts, the label is near-static.
- **Advisor free-text matcher** (`advisor.ts:46-147`): invented phrase weights (multi-word 4–5, single 1–3) and confidence `0.5·min(1,top/6) + 0.5·(0.4+0.6·margin)`. Brittle substring matching — unlisted phrasings silently return null; overlapping keywords can misroute. The reported "confidence" is keyword strength, not intent probability.
- **Static profile ranking** (`advisor.ts:241-291`): base 50; +16 favourable / −14 unfavourable / +4 neutral per god-group. Invented and asymmetric; the +4 floor drifts everything up; "resource" appears in 5/12 `godBias` lists so many objectives rank alike. Only as meaningful as the underlying 用神 (Class D).
- **Q&A intent gate 0.5** (`advisor.ts:295-330`); **composeTimingAnswer** reuses the ≥58 "Good" band and a **92-day "far off"** cutoff (`advisor.ts:344-397`); **practicalBestHour** swaps the chart-best hour for the best **daytime** hour (05:00–19:00, `plainEnglish.ts:481-498`) — deliberately recommending a **lower-scoring** hour on a convenience assumption when the true best is overnight. `windowPlain` day-bucketing (`plainEnglish.ts:469-477`) is cosmetic.

---

## 7. What is deliberately NOT claimed (Class F) + the confidence model (v0.2)

**The app does not claim predictive/outcome accuracy.** It does not estimate the probability that your wedding, contract, or move turns out well.

The **confidence index** (0–100, `computeConfidence` in `decision.ts`) is **epistemic**, not predictive — and as of v0.2 it is **evidence-based rather than constant-based**:

`overall = .20·reproducibility + .25·thirdPartyAgreement + .15·conventionStability + .10·inputCompleteness + .10·sourceCoverage + .10·(100−boundaryRisk) + .10·(100−heuristicSensitivity) − conflictPenalty`

- `thirdPartyAgreement` starts at a **neutral 50** labelled "cross-check pending" and is replaced by the **measured** agreement score when a `VerificationReport` (lunar-javascript + HKO/JPL — see docs/VERIFICATION.md) is applied; `verified` flips to true and the sources are named in the notes.
- `conventionStability` and `heuristicSensitivity` come from the sweeps in `sensitivity/` — a pick that flips under Zi-hour rollover or a ±10% weight nudge visibly loses confidence.
- `boundaryRisk` accumulates real fragility (節 crossing inside the day, natal strength within ±0.02 of a cut-point, birth-boundary warnings); `inputCompleteness` drops for missing birth data, uncertain times, and solar hour-bases without a longitude.
- `conflictPenalty` deducts up to 25 points for cross-school conflicts.

The disclaimer is **baked in, not optional** (`plainEnglish.ts`, surfaced by `confidencePlain` and `HOW_TO_READ`): *"This is not a probability that the event will succeed."*

**Remaining candour points:** (1) the combining weights and severity→score maps are still calibration (§6.12) — what changed is that every component now has evidence behind it; (2) verification covers **time and calendar facts only** — there is still, deliberately, **no outcome validation behind any component**, and there never can be within this design.

---

## 8. Known limitations — why your result may differ

1. **Convention mismatch (§4)** — the most common cause. Another site using lunar-New-Year year boundaries, 子時 day rollover, true-solar hours, or different 藏干 weights will produce different pillars and therefore different everything downstream. This app defaults to civil-midnight + civil-clock, which some practitioners consider wrong.
2. **Heuristic weights & magnitudes (§6)** — the 0–100 score and its ranking are one defensible opinion. Reasonable alternative MCDA weights, DAY_GOD_SCOREs, officer scalings, or band cut-points reorder the recommended days. Near-boundary charts (adjusted-strength around 0.34/0.45/0.52; scores around 58/45) are especially sensitive.
3. **Missing schools** — no 從格/專旺 special structures, no 病藥/通關/full 調候用神 reconciliation, and **entire systems are absent**: Qi Men Dun Jia (奇門遁甲), Xuan Kong / Flying Star (玄空飛星), Da Liu Ren, Zi Wei Dou Shu. This is a Zi Ping + 通書-day-selection tool only.
4. **Holistic vs additive** — a master reads the whole chart's structure and interactions holistically. This engine adds sub-scores. Additive scoring cannot capture 通關, 生剋 chains, or structural gestalt.
5. **Advisory-only facts that never score** — 三煞 direction (`tongshu.ts:81-93`) and 納音 (`symbols.ts:203-238`) are computed and shown but **never enter any score or veto**, despite 三煞 being described as important for 動土.
6. **Prose/number divergence** — the explanation layer can say "Best avoided" over a numerically Neutral/Good day, hide real positives on taboo days, and recommend a lower-scored daytime hour. Honest in intent, but the surfaced verdict is shaped by prose-level overrides (§5).

---

## 9. Determinism & provenance

**The contract (verified across `plainEnglish.ts`, `advisor.ts`, and `decision.ts`):**
- **No LLM, no network, no wall-clock.** No `Math.random`, no `fetch`, no `new Date()`/`Date.now()` except explicitly-supplied `civil`/`todayIso` inputs. Every prose function consumes precomputed fields (`recommendationScore`, sub-scores, `rulesFired`, `shenShaTags`, `tongshu`, `components`) and returns strings. `verdictBand`/`recommendationScore` are **read, never written**.
- **The explanation layer never alters scores.** Literally true. (Nuance: it *can* present a verdict that diverges from the raw number — see §5/§8.6 — but it never mutates the number.)
- **Advisor functions are pure** over their string/chart inputs, with deterministic tie-breaks (`OBJECTIVES` order).

**Versioning & provenance** (`version.ts`, `hash.ts`, `decision.ts:511-530`):
- Every result embeds a **multi-layer version registry**: `engine 0.1.0`, `calendarKernel calendar-1.0.0`, `solarModel meeus-low-precision-1.0.0`, `symbolTables symbols-1.0.0`, `baziAlgorithm bazi-ziping-1.0.0`, `tongshuRulePack tongshu-jianchu-1.0.0`, `decisionPolicy mcda-1.0.0`, `tzdb host-Intl-runtime`.
- Every result carries a **`calculationHash`** — a 32-bit FNV-1a over a canonical (recursively key-sorted) JSON serialization of the inputs, conventions, and versions. It proves *same input → same output, bit-for-bit, offline* — a reproducibility guarantee, **not** a correctness guarantee.
- The embedded note is precise about what determinism means: *"Deterministic: identical inputs always yield this calculationHash and these results."*

**Bottom line:** the pillars are trustworthy and reproducible; the *score and its verdict* are a transparent, versioned, deterministic **engineering heuristic** — reproducible to the bit, but not classical, and not predictive.

---

### File reference index
`src/engine/astronomy.ts` · `sexagenary.ts` · `conventions.ts` · `symbols.ts` · `bazi.ts` · `tongshu.ts` · `objectives.ts` · `decision.ts` · `plainEnglish.ts` · `advisor.ts` · `version.ts` · `hash.ts`
