# Engine & Feature Reference — to a tee

**Project:** 易 · Decision Timing Engine
**Version:** engine `0.1.0`
**Scope of this document:** an exhaustive, exact inventory of every feature, module,
table, formula, constant, objective and scoring rule that currently exists in the codebase.
Everything here is transcribed directly from source — no aspirational features.

> Determinism contract (enforced throughout): pure functions, no randomness, no network in
> the calculation path, no LLM in the calculation path. Identical inputs → identical output
> and identical `calculationHash`.

---

## 0. Table of contents

1. [Architecture & file map](#1-architecture--file-map)
2. [Layer 1 — Astronomy / calendar kernel](#2-layer-1--astronomy--calendar-kernel)
3. [Layer 1→2 — Time normalization & four pillars](#3-layer-12--time-normalization--four-pillars)
4. [Layer 2 — Symbolic kernel (tables)](#4-layer-2--symbolic-kernel-tables)
5. [Layer 2/3 — BaZi analysis](#5-layer-23--bazi-analysis)
6. [Layer 3 — Tong Shu rule pack](#6-layer-3--tong-shu-rule-pack)
7. [Layer 4 — Objectives & decision policies](#7-layer-4--objectives--decision-policies)
8. [Layer 4 — Decision engine & scoring](#8-layer-4--decision-engine--scoring)
9. [Layer 5 — Explanation, confidence, conflicts](#9-layer-5--explanation-confidence-conflicts)
10. [Convention sets](#10-convention-sets)
11. [Versioning & hashing](#11-versioning--hashing)
12. [Web UI features](#12-web-ui-features)
13. [Test suite (golden validation)](#13-test-suite-golden-validation)
14. [Public API surface](#14-public-api-surface)
15. [Known limits & out-of-scope](#15-known-limits--out-of-scope)

---

## 1. Architecture & file map

Client-side only (Vite + React + TypeScript). The engine is framework-agnostic and lives in
`src/engine/`; the UI consumes it.

```
src/
  main.tsx                 React entry
  App.tsx                  Form + orchestration + results assembly
  styles.css               Design system (dark theme, five-phase colours)
  engine/
    symbols.ts             Symbol tables + total functions (Layer 2)
    astronomy.ts           Julian Day, ΔT, solar longitude, 24 solar terms (Layer 1)
    sexagenary.ts          Time normalization + four-pillar construction (Layer 1→2)
    conventions.ts         Explicit convention sets
    bazi.ts                Chart analysis, strength, favourable elements, Da Yun (Layer 2/3)
    tongshu.ts             12 Day Officers, Yellow/Black road, clashes, Shen Sha (Layer 3)
    objectives.ts          11 decision objectives + MCDA policies (Layer 4)
    decision.ts            Candidate generation, scoring, conflicts, confidence (Layer 4/5)
    hash.ts                Canonical JSON + FNV-1a hashing
    version.ts             Multi-layer version registry
    index.ts               Public barrel export
    kernel.test.ts         Golden tests for the kernel
    decision.test.ts       Golden tests for the decision engine
  ui/
    format.ts              Phase colours, score colours/labels, date formatting
    ChartPanel.tsx         BaZi chart, elements, Da Yun, boundary warnings
    Heatmap.tsx            Calendar heatmap of the window
    DayCard.tsx            One recommendation + evidence drill-down
```

The five spec layers and where each lives:

| Spec layer | Modules |
|---|---|
| 1 · Astronomy / calendar kernel | `astronomy.ts`, `sexagenary.ts` |
| 2 · Symbolic kernel | `symbols.ts`, `bazi.ts` |
| 3 · School rule packs | `tongshu.ts`, favourable-element logic in `bazi.ts` |
| 4 · Deterministic decision engine | `objectives.ts`, `decision.ts` |
| 5 · Explanation payload | produced in `decision.ts`, rendered by `ui/*` |

---

## 2. Layer 1 — Astronomy / calendar kernel

File: `src/engine/astronomy.ts`. Constants: `J2000 = 2451545.0`, `DEG = π/180`.

### 2.1 Functions

| Function | Signature | Behaviour |
|---|---|---|
| `julianDayFromMillis` | `(utcMillis) → JD` | `utcMillis/86400000 + 2440587.5` |
| `millisFromJulianDay` | `(jd) → ms` | inverse of the above |
| `gregorianToJDN` | `(year, month, day) → int` | Fliegel & Van Flandern integer Julian Day Number (timezone-independent; drives the sexagenary day count) |
| `deltaTSeconds` | `(year) → seconds` | ΔT (TT − UT) via Espenak & Meeus piecewise polynomials |
| `sunApparentLongitude` | `(jde) → deg [0,360)` | Meeus low-precision solar series (accuracy ≈ 0.01°) |
| `solarLongitudeAtMillis` | `(utcMillis) → deg` | applies ΔT internally |
| `findSolarLongitudeCrossing` | `(targetDeg, guessMillis) → ms` | iterative root-find using mean solar motion `0.98564736°/day`, ≤12 iterations |
| `monthBranchIndexFromLongitude` | `(λ) → 0..11` | `mod(floor(mod(λ−315,360)/30)+2, 12)` (立春 opens 寅) |
| `jieCrossingMillis` | `(jieLon, around) → ms` | wrapper over crossing finder |
| `jieWindowAround` | `(utcMillis) → {prev,next}` | the 節 boundary at/before and after an instant (used for month pillar + Da Yun) |
| `lichunMillis` | `(gregYear) → ms` | the 立春 (λ=315°) instant governing that BaZi year |

### 2.2 ΔT polynomial ranges

Piecewise by year band: 1900–1920, 1920–1941, 1941–1961, 1961–1986, 1986–2005, 2005–2050,
≥2050 (and a `−20 + 32·u²` fallback, `u = (year−1820)/100`, for out-of-range years).

### 2.3 The 24 solar terms (`SOLAR_TERMS`)

Ordered by longitude **starting at 立春 (315°)** — the BaZi year/month origin. `isJie = true`
marks the 12 month-boundary 節 terms.

| # | λ° | 中文 | English | 節 (month boundary)? |
|--:|--:|---|---|:--:|
| 0 | 315 | 立春 | Start of Spring | ✔ (opens 寅) |
| 1 | 330 | 雨水 | Rain Water | |
| 2 | 345 | 驚蟄 | Awakening of Insects | ✔ (opens 卯) |
| 3 | 0 | 春分 | Spring Equinox | |
| 4 | 15 | 清明 | Pure Brightness | ✔ (opens 辰) |
| 5 | 30 | 穀雨 | Grain Rain | |
| 6 | 45 | 立夏 | Start of Summer | ✔ (opens 巳) |
| 7 | 60 | 小滿 | Grain Full | |
| 8 | 75 | 芒種 | Grain in Ear | ✔ (opens 午) |
| 9 | 90 | 夏至 | Summer Solstice | |
| 10 | 105 | 小暑 | Minor Heat | ✔ (opens 未) |
| 11 | 120 | 大暑 | Major Heat | |
| 12 | 135 | 立秋 | Start of Autumn | ✔ (opens 申) |
| 13 | 150 | 處暑 | End of Heat | |
| 14 | 165 | 白露 | White Dew | ✔ (opens 酉) |
| 15 | 180 | 秋分 | Autumn Equinox | |
| 16 | 195 | 寒露 | Cold Dew | ✔ (opens 戌) |
| 17 | 210 | 霜降 | Frost Descent | |
| 18 | 225 | 立冬 | Start of Winter | ✔ (opens 亥) |
| 19 | 240 | 小雪 | Minor Snow | |
| 20 | 255 | 大雪 | Major Snow | ✔ (opens 子) |
| 21 | 270 | 冬至 | Winter Solstice | |
| 22 | 285 | 小寒 | Minor Cold | ✔ (opens 丑) |
| 23 | 300 | 大寒 | Major Cold | |

`JIE_TERMS` = the 12 rows with `isJie = true`.

---

## 3. Layer 1→2 — Time normalization & four pillars

File: `src/engine/sexagenary.ts`.

### 3.1 Anchors (epoch constants)

| Anchor | Value | Purpose |
|---|---|---|
| Day-pillar | `1893-12-26 = 丁酉 (ganzhi index 33)` (Mao Zedong's civil birth date) | pins the entire continuous sexagenary day cycle |
| Year-pillar | `1984 = 甲子 (index 0)` | `mod(baziYear − 1984, 60)` |

### 3.2 Pillar formulas

| Pillar | Rule (as coded) |
|---|---|
| Day ganzhi | `mod(gregorianToJDN(Y,M,D) − JDN(1893-12-26) + 33, 60)` |
| Year ganzhi | `mod(baziYear − 1984, 60)`, where `baziYear` is the Gregorian year minus 1 if the instant precedes that year's 立春 |
| Month branch | `monthBranchIndexFromLongitude(solarLongitude)` |
| Month stem | 五虎遁: `yinMonthStem = mod(yearStem*2 + 2, 10)`, then `mod(yinMonthStem + mod(monthBranch−2,12), 10)` |
| Hour branch | `mod(floor((hour+1)/2), 12)` |
| Hour stem | 五鼠遁: `ziHourStem = mod(dayStem*2, 10)`, then `mod(ziHourStem + hourBranch, 10)` |

### 3.3 `normalizeMoment(input, convention)`

Inputs (`MomentInput`): `year, month, day, hour, minute, tzOffsetMinutes,
longitudeEast?, timeCertainty?`.

Steps:
1. `utcMillis = Date.UTC(...) − tzOffsetMinutes·60000`.
2. **Local-mean-solar correction** (only if `hourBasis = local_mean_solar` *and*
   `longitudeEast` given): `solarCorrectionMinutes = (longitudeEast − zoneMeridian)·4`,
   `zoneMeridian = (tzOffsetMinutes/60)·15`.
3. Compute the effective local wall fields after that correction.
4. **Day-rollover policy**: if `dayBoundary = zi_23` and effective hour ≥ 23, the day pillar
   uses the *next* civil date.

Returns `{ input, utcMillis, solarCorrectionMinutes, effective, dayCivil, hourForBranch }`.

### 3.4 `buildFourPillars(input, convention) → FourPillars`

Produces `{ year, month, day, hour, dayMaster, meta }` where `meta` =
`{ baziYear, solarLongitude, monthBranchIndex, dayJDN, normalized, boundaryWarnings[] }`.

**Boundary-sensitivity warnings** are appended when:
- within `convention.boundaryWarnMinutes` (default 120) of 立春 → year pillar warning;
- within that window of any 節 → month pillar warning;
- effective hour is 23 or 0 → Zi-hour / day-boundary warning.

### 3.5 Helpers exported

`dayGanzhiIndexFromCivilDate(Y,M,D)`, `hourBranchIndexFromHour(hour)`,
`combineStemBranch(stemIndex, branchIndex) → GanZhi`, `stemAt(index)`.

---

## 4. Layer 2 — Symbolic kernel (tables)

File: `src/engine/symbols.ts`. Types: `FivePhase = wood|fire|earth|metal|water`,
`YinYang = yang|yin`.

### 4.1 Heavenly Stems (`STEMS`, 0..9)

| idx | 干 | pinyin | phase | yin/yang |
|--:|--|--|--|--|
| 0 | 甲 | Jiǎ | wood | yang |
| 1 | 乙 | Yǐ | wood | yin |
| 2 | 丙 | Bǐng | fire | yang |
| 3 | 丁 | Dīng | fire | yin |
| 4 | 戊 | Wù | earth | yang |
| 5 | 己 | Jǐ | earth | yin |
| 6 | 庚 | Gēng | metal | yang |
| 7 | 辛 | Xīn | metal | yin |
| 8 | 壬 | Rén | water | yang |
| 9 | 癸 | Guǐ | water | yin |

### 4.2 Earthly Branches (`BRANCHES`, 0..11)

| idx | 支 | pinyin | animal | phase | yin/yang | double-hour start |
|--:|--|--|--|--|--|--|
| 0 | 子 | Zǐ | Rat | water | yang | 23:00 |
| 1 | 丑 | Chǒu | Ox | earth | yin | 01:00 |
| 2 | 寅 | Yín | Tiger | wood | yang | 03:00 |
| 3 | 卯 | Mǎo | Rabbit | wood | yin | 05:00 |
| 4 | 辰 | Chén | Dragon | earth | yang | 07:00 |
| 5 | 巳 | Sì | Snake | fire | yin | 09:00 |
| 6 | 午 | Wǔ | Horse | fire | yang | 11:00 |
| 7 | 未 | Wèi | Goat | earth | yin | 13:00 |
| 8 | 申 | Shēn | Monkey | metal | yang | 15:00 |
| 9 | 酉 | Yǒu | Rooster | metal | yin | 17:00 |
| 10 | 戌 | Xū | Dog | earth | yang | 19:00 |
| 11 | 亥 | Hài | Pig | water | yin | 21:00 |

### 4.3 Five-phase cycles

- **Generating 生:** wood→fire→earth→metal→water→wood.
- **Controlling 克:** wood→earth→water→fire→metal→wood.
- Helpers: `generates`, `controls`, `phaseGeneratedBy`, `phaseControlledBy`,
  `phaseGenerates`, `phaseControls`.

### 4.4 Hidden stems (`HIDDEN_STEMS`) with element weights

Main qi ≈0.6, middle ≈0.3, residual ≈0.1 (engine convention; single-stem branches = 1.0).

| 支 | hidden stems (weight) |
|--|--|
| 子 | 癸 1.0 |
| 丑 | 己 0.6 · 癸 0.3 · 辛 0.1 |
| 寅 | 甲 0.6 · 丙 0.3 · 戊 0.1 |
| 卯 | 乙 1.0 |
| 辰 | 戊 0.6 · 乙 0.3 · 癸 0.1 |
| 巳 | 丙 0.6 · 庚 0.3 · 戊 0.1 |
| 午 | 丁 0.7 · 己 0.3 |
| 未 | 己 0.6 · 丁 0.3 · 乙 0.1 |
| 申 | 庚 0.6 · 壬 0.3 · 戊 0.1 |
| 酉 | 辛 1.0 |
| 戌 | 戊 0.6 · 辛 0.3 · 丁 0.1 |
| 亥 | 壬 0.7 · 甲 0.3 |

### 4.5 Ten Gods (`tenGodOf(dayMaster, other)`)

Deterministic from phase relation + polarity match:

| Relation to Day Master | same polarity | opposite polarity |
|---|---|---|
| same phase | 比肩 friend | 劫財 rob_wealth |
| DM generates other | 食神 eating_god | 傷官 hurting_officer |
| DM controls other | 偏財 indirect_wealth | 正財 direct_wealth |
| other controls DM | 七殺 seven_killings | 正官 direct_officer |
| other generates DM | 偏印 indirect_resource | 正印 direct_resource |

**God groups** (`godGroupOf`): companion (比肩/劫財), output (食神/傷官), wealth (偏財/正財),
officer (七殺/正官), resource (偏印/正印).

### 4.6 Na Yin (`NA_YIN`, 30 entries; `naYinOf(ganzhiIndex)` = `NA_YIN[floor(idx/2)]`)

海中金(metal) · 爐中火(fire) · 大林木(wood) · 路旁土(earth) · 劍鋒金(metal) · 山頭火(fire) ·
澗下水(water) · 城頭土(earth) · 白蠟金(metal) · 楊柳木(wood) · 泉中水(water) · 屋上土(earth) ·
霹靂火(fire) · 松柏木(wood) · 長流水(water) · 沙中金(metal) · 山下火(fire) · 平地木(wood) ·
壁上土(earth) · 金箔金(metal) · 覆燈火(fire) · 天河水(water) · 大驛土(earth) · 釵釧金(metal) ·
桑柘木(wood) · 大溪水(water) · 沙中土(earth) · 天上火(fire) · 石榴木(wood) · 大海水(water).

### 4.7 Other helpers

`mod(n,m)`, `ganZhiFromIndex(index) → GanZhi {index, stem, branch, hanzi, pinyin}`,
`branchesClash(a,b)` = `mod(a−b,12)===6`, `clashBranch(b)` = `mod(b+6,12)`,
`PHASE_LABEL`, `TEN_GOD_LABEL`.

---

## 5. Layer 2/3 — BaZi analysis

File: `src/engine/bazi.ts`.

### 5.1 `buildBaziChart(fourPillars) → BaziChart`

Returns `{ pillars[4], elements, dayMaster }`.

**Per-pillar reading** (`PillarReading`): position, ganzhi, `stemTenGod` (or `day_master`
for the day pillar), `hiddenStems` (each with its Ten God + weight), Na Yin (zh/en/phase).

### 5.2 Element profile (`elementProfile`)

Weighted accounting across all four pillars:
- each heaven stem counts `1.0`;
- each hidden stem counts its stored weight;
- the **month pillar (月令) is multiplied ×1.6** (seasonal command dominates).

Output: `weights{5}`, `percent{5}` (1-dp), `dominant`, `weakest`.

### 5.3 Day-Master analysis (`analyzeDayMaster`)

**Functional element map** relative to DM:
`companion = DM phase`, `resource = phaseGeneratedBy(DM)`, `output = phaseGenerates(DM)`,
`wealth = phaseControls(DM)`, `officer = phaseControlledBy(DM)`.

- `support = weight[companion] + weight[resource]`
- `oppose = weight[output] + weight[wealth] + weight[officer]`
- `supportRatio = support / (support + oppose)`
- `hasMonthCommand` = month branch's own phase or any of its hidden-stem phases equals
  `companion` or `resource`.

**Strength classification:**
| Result | Condition |
|---|---|
| strong | `supportRatio ≥ 0.55` **or** (`≥ 0.45` and `hasMonthCommand`) |
| weak | `supportRatio ≤ 0.32` |
| balanced | otherwise |

**Favourable / unfavourable elements:**
| Strength | favourable | unfavourable |
|---|---|---|
| strong | output, wealth, officer | companion, resource |
| weak | resource, companion | output, wealth, officer |
| balanced | output, wealth | — |

(Labelled MEDIUM confidence — school-dependent — in the `rationale` string.)

### 5.4 Da Yun (`computeDaYun(fourPillars, sex, count=9)`)

- **Direction:** forward if `(male & year-stem yang)` or `(female & year-stem yin)`, else reverse.
- **Start age:** `elapsedDays / 3` where `elapsedDays` = days from birth to the next 節
  (forward) or from the previous 節 to birth (reverse). ("Three days = one year.")
- **Pillars:** 9 luck pillars, each 10 years, stepping +1 (forward) or −1 (reverse) through
  the sexagenary cycle starting from the month pillar; each carries its stem's Ten God.
- Direction/start surfaced in a `rule` string marked MEDIUM confidence.

---

## 6. Layer 3 — Tong Shu rule pack

File: `src/engine/tongshu.ts`. Activity tags:
`open, marry, move, travel, contract, ground, medical, study, litigation, burial,
capture, general`.

### 6.1 建除十二神 — 12 Day Officers (`OFFICERS`)

Officer index = `mod(dayBranch − monthBranch, 12)`, 0 = 建.

| idx | 中文 | English | good tags | bad tags | base |
|--:|--|--|--|--|--:|
| 0 | 建 | Establish | travel, study, contract, open, general | ground, move, medical | +3 |
| 1 | 除 | Remove | medical, general | marry, move | +2 |
| 2 | 滿 | Full | open, contract, travel | marry, medical, burial | +2 |
| 3 | 平 | Balance | general, ground | — | +1 |
| 4 | 定 | Stable | marry, contract, study, open | travel, litigation, medical | +4 |
| 5 | 執 | Initiate | marry, ground, capture | open, move, contract | 0 |
| 6 | 破 | Destruction | medical | marry, open, move, contract, travel, study, general, ground | −10 |
| 7 | 危 | Danger | — | travel, general | −3 |
| 8 | 成 | Success | open, marry, move, travel, study, contract, general | litigation | +5 |
| 9 | 收 | Receive | contract, open, study | burial, medical | +3 |
| 10 | 開 | Open | open, marry, move, travel, study, contract, general | burial, ground | +5 |
| 11 | 閉 | Close | burial, ground | marry, open, travel, medical | −2 |

### 6.2 黄道黑道十二神 — Yellow/Black-road day gods (`DAY_GODS`, `DAY_GOD_SCORE`)

青龍 branch for the month = `mod(monthBranch*2 + 8, 12)`;
day-god index = `mod(dayBranch − qinglongBranch, 12)`.

| idx | 中文 | English | road | score (`DAY_GOD_SCORE`) |
|--:|--|--|--|--:|
| 0 | 青龍 | Green Dragon | Yellow | 88 |
| 1 | 明堂 | Bright Hall | Yellow | 80 |
| 2 | 天刑 | Heaven's Punishment | Black | 28 |
| 3 | 朱雀 | Vermilion Bird | Black | 30 |
| 4 | 金匱 | Golden Coffer | Yellow | 82 |
| 5 | 天德 | Heaven's Virtue | Yellow | 90 |
| 6 | 白虎 | White Tiger | Black | 22 |
| 7 | 玉堂 | Jade Hall | Yellow | 84 |
| 8 | 天牢 | Heaven's Jail | Black | 30 |
| 9 | 玄武 | Black Tortoise | Black | 26 |
| 10 | 司命 | Director of Fate | Yellow | 78 |
| 11 | 勾陳 | Hooked Array | Black | 34 |

### 6.3 Day clash & 三煞 direction

- **Day clash (日沖):** `clashAnimal` = animal of `clashBranch(dayBranch)`.
- **三煞 direction** by day-branch group: 申子辰→South (巳午未); 寅午戌→North (亥子丑);
  巳酉丑→East (寅卯辰); 亥卯未→West (申酉戌). (Directional info, not a timing veto.)

### 6.4 `computeTongShuDay(civil, solarInstantUtc) → TongShuDay`

Returns `{ civil, dayGanzhi, monthBranchIndex, officer (+index), dayGod (+index, yellow),
clashAnimal, clashBranchIndex, sanShaDirection }`.

### 6.5 Personal Shen Sha overlay (`personalShenSha`, `isNoblemanDay`)

Computed against the subject's **day branch** and **year branch (zodiac)**:

| Tag | 中文 | trigger | polarity |
|---|---|---|---|
| `clash_day` | 沖日柱 | candidate branch = clash of subject day branch | bad |
| `clash_zodiac` | 沖生肖 | candidate branch = clash of subject year branch | bad |
| `six_harmony` | 六合日 | 六合 pair with subject day branch (子丑,寅亥,卯戌,辰酉,巳申,午未) | good |
| `triple_harmony` | 三合日 | same Three-Harmony group as subject day branch (申子辰/寅午戌/巳酉丑/亥卯未) | good |
| `peach_blossom` | 桃花日 | group→branch: 申子辰→酉, 寅午戌→卯, 巳酉丑→午, 亥卯未→子 | neutral |
| `travelling_horse` | 驛馬日 | group→branch: 申子辰→寅, 寅午戌→申, 巳酉丑→亥, 亥卯未→巳 | neutral |

**Nobleman 天乙貴人** (`isNoblemanDay`, keyed to subject day stem):
甲戊庚→丑/未 · 乙己→子/申 · 丙丁→亥/酉 · 壬癸→卯/巳 · 辛→寅/午.

---

## 7. Layer 4 — Objectives & decision policies

File: `src/engine/objectives.ts`. 11 objectives. Each has a `primaryTag`, `vetoOfficers`
(hard reject), `clashVeto`, `godBias` (Ten-God groups that help), MCDA `weights`
`{officer, road, personal, hour}` (sum to 1.0), `requiresBirthTime`, and a `doctrineNote`.

| # | id | label | primaryTag | vetoOfficers | clashVeto | godBias | weights O/R/P/H |
|--:|---|---|---|---|:--:|---|---|
| 1 | `contract_signing` | Sign a contract / close a deal | contract | 破 | ✔ | wealth, officer | 0.34 / 0.16 / 0.34 / 0.16 |
| 2 | `open_business` | Open a business / launch / opening day | open | 破, 閉 | ✔ | wealth, output | 0.36 / 0.18 / 0.32 / 0.14 |
| 3 | `career_move` | Start a job / accept a role / career move | general | 破 | ✘ | officer, resource | 0.30 / 0.14 / 0.40 / 0.16 |
| 4 | `negotiation_meeting` | Important meeting / negotiation | contract | 破 | ✘ | officer, wealth | 0.28 / 0.16 / 0.36 / 0.20 |
| 5 | `wedding_marriage` | Wedding / marriage registration | marry | 破, 執, 閉 | ✔ | resource | 0.34 / 0.18 / 0.34 / 0.14 |
| 6 | `moving_house` | Move home / move-in (入宅) | move | 破, 閉, 執 | ✔ | resource | 0.36 / 0.18 / 0.32 / 0.14 |
| 7 | `travel` | Travel / start a journey | travel | 破 | ✘ | output | 0.34 / 0.18 / 0.30 / 0.18 |
| 8 | `renovation` | Renovation / breaking ground (動土) | ground | 破, 建 | ✔ | resource | 0.40 / 0.18 / 0.28 / 0.14 |
| 9 | `medical_procedure` | Medical procedure / surgery (求醫) | medical | *(none)* | ✘ | resource | 0.30 / 0.16 / 0.40 / 0.14 |
| 10 | `investment_purchase` | Major purchase / investment | contract | 破 | ✔ | wealth | 0.32 / 0.16 / 0.38 / 0.14 |
| 11 | `study_exam` | Exam / start studies / submit work | study | 破 | ✘ | resource, output | 0.32 / 0.14 / 0.38 / 0.16 |

(`requiresBirthTime` is `false` for all 11.) `DEFAULT_WEIGHTS = 0.34/0.16/0.34/0.16`.
`objectiveById(id)` falls back to objective #1.

---

## 8. Layer 4 — Decision engine & scoring

File: `src/engine/decision.ts`. Entry: `evaluateDecision(request) → DecisionResult`.

**Request** (`DecisionRequest`): `{ birth: MomentInput, sex, convention, objective,
window: { start{Y,M,D}, days, tzOffsetMinutes } }`.

**Flow:** build four pillars → BaZi chart → Da Yun → for each day in the window evaluate →
filter out hard-rejects → sort accepted by `finalScore` desc (tie-break: earlier ISO date).

Per-day solar instant = local noon of that civil day (`Date.UTC(Y,M,D,12) − tz·60000`).

### 8.1 The four evaluators (each normalised 0..100, helper `clamp` = 0..100)

**1 · Officer (建除 fit):**
```
officerRaw = officer.base
           + 6  if primaryTag ∈ officer.good
           + 1  if 'general' ∈ officer.good and primaryTag ≠ 'general'
           − 8  if primaryTag ∈ officer.bad
officerScore = clamp(50 + officerRaw · 3.5)
```

**2 · Road (黄黑道):** `roadScore = DAY_GOD_SCORE[dayGod.index]` (see §6.2).

**3 · Personal (BaZi), start 50:**
| Contribution | Effect |
|---|---|
| day-stem Ten God's group ∈ `objective.godBias` | +12 |
| day-stem element favourable / unfavourable | +10 / −10 |
| day-branch element favourable / unfavourable | +5 / −5 |
| Nobleman day (天乙貴人) | +14 |
| 沖日柱 `clash_day` | −20 |
| 沖生肖 `clash_zodiac` | −16 |
| 六合日 `six_harmony` | +8 |
| 三合日 `triple_harmony` | +8 |
| 桃花日 `peach_blossom` | +6 if wedding, else 0 |
| 驛馬日 `travelling_horse` | +10 if travel/moving_house, else +2 |

Result `clamp`-ed to 0..100.

**4 · Hour (`scoreHours`)** — scores all 12 double-hours, start 50 each:
| Contribution | Effect |
|---|---|
| hour-stem Ten God's group ∈ godBias | +10 |
| hour-branch element favourable / unfavourable | +8 / −8 |
| hour clashes the day branch (時沖日) | −15 |
| Nobleman hour | +10 |

Hour ganzhi stem = `mod(dayStem*2 + branchIndex, 10)`. **Best hour** = max score, ties broken
by earliest branch. Evaluator score = best hour's score. All 12 returned for display.

### 8.2 Final score (MCDA)

```
finalScore = w.officer·officerScore + w.road·roadScore
           + w.personal·personalScore + w.hour·hourScore     (rounded to 1 dp)
```

### 8.3 Hard constraints (vetoes → `hardReject = true`)

- `officer.index ∈ objective.vetoOfficers` → rejected with reason.
- `objective.clashVeto` and a `clash_day`/`clash_zodiac` tag present → rejected.

Rejected days are excluded from the ranking but **kept and shown** under "vetoed days".

---

## 9. Layer 5 — Explanation, confidence, conflicts

### 9.1 Evidence per recommendation (`DayRecommendation`)

`isoDate, civil, weekday, tongshu, dayStemTenGod, bestHour, allHours[12], subScores,
finalScore, confidence, hardReject, rejectReasons[], rulesFired[], conflicts[],
shenShaTags[], topReasons[]`.

**`rulesFired`** — each `{ code, layer (tongshu|bazi|shensha|hour), label, effect (signed),
citation }`. **Citations** (`CITES`) point to spec sections + classical sources:
| key | citation text |
|---|---|
| officer | 建除十二神 — Tong Shu day-officer cycle (spec §6.7; classical 通書 / 欽定協紀辨方書) |
| road | 黄道黑道十二神 — auspicious/inauspicious day gods (spec §6.7; classical 通書) |
| element | Useful-God favourability — Day-Master balance (spec §5, §6.1; 滴天髓 / 子平真詮) |
| tenGod | 十神 day-stem relation to Day Master (spec §6.1) |
| shensha | 神煞 overlay — weightable, demoted beneath structure (spec §6.4) |
| clash | 日沖 / 六沖 branch clash (spec §6.1) |
| hour | 時辰 selection — five-rats hour stem + clash avoidance (spec §5.4, §6.3) |

**`topReasons`** = the up-to-4 highest positive `effect` rule labels.

### 9.2 Conflict detection (`ConflictRecord{type, schools[], severity, reason}`)

| Condition | type | severity |
|---|---|---|
| officer ≥ 62 and personal ≤ 40 | tongshu_vs_bazi | medium |
| personal ≥ 62 and officer ≤ 38 | bazi_vs_tongshu | medium |
| road ≥ 78 and officer ≤ 38 | road_vs_officer | low |
| road ≤ 34 and officer ≥ 62 | officer_vs_road | low |

Conflicts are **shown, never silently resolved**.

### 9.3 Confidence index (`computeConfidence`, spec §12)

Components and fixed/derived values:
| Component | Value |
|---|---|
| calculationReproducibility | 1.0 |
| sourceQuality | 0.8 |
| sourceSpecificity | 0.7 |
| schoolAgreement | `max(0.4, 1 − 0.18 · conflictCount)` |
| inputQuality | exact 0.95 · approximate 0.7 · hour_unknown 0.5 |
| validationConcordance | 0.85 |
| ruleCoverage | 0.65 |

```
overall = 0.20·calc + 0.20·sourceQuality + 0.15·sourceSpecificity
        + 0.15·schoolAgreement + 0.10·inputQuality + 0.15·validation
        + 0.05·ruleCoverage          (rounded to 2 dp)
```

> Confidence reflects reproducibility / source support / school agreement — **not** an
> empirical probability of any life outcome.

### 9.4 `DecisionResult`

`{ meta, subjectChart, dayun, recommendations[] (ranked), rejected[], allDays[] (chronological) }`.
`meta` = engine versions, convention id+label, objective id+label, `calculationHash`,
determinism note, window label, favourable/unfavourable elements, boundaryWarnings.

---

## 10. Convention sets

File: `src/engine/conventions.ts`. Every calculation binds to one explicitly.

| Field | Options implemented |
|---|---|
| `yearBoundary` | `lichun_exact` (only) |
| `monthBoundary` | `jie_terms` (only) |
| `dayBoundary` | `civil_midnight`, `zi_23` |
| `hourBasis` | `civil_clock`, `local_mean_solar` |
| `dayunStartRule` | `three_days_one_year` |
| `boundaryWarnMinutes` | default 120 |

Three presets (`CONVENTION_PRESETS`):
| id | label | differs by |
|---|---|---|
| `ziping_default_v1` | Classical Zi Ping (default) | baseline |
| `ziping_zi23_v1` | Zi Ping with 23:00 Zi-hour day rollover | `dayBoundary = zi_23` |
| `ziping_true_solar_v1` | Zi Ping with local mean solar time | `hourBasis = local_mean_solar` |

---

## 11. Versioning & hashing

**`version.ts` (`VERSIONS`):** engine `0.1.0`, calendarKernel `calendar-1.0.0`, solarModel
`meeus-low-precision-1.0.0`, symbolTables `symbols-1.0.0`, baziAlgorithm `bazi-ziping-1.0.0`,
tongshuRulePack `tongshu-jianchu-1.0.0`, decisionPolicy `mcda-1.0.0`, tzdb `host-Intl-runtime`.

**`hash.ts`:** `canonicalJSON` (recursively key-sorted stringify) + `fnv1a` (32-bit, 8-hex)
→ `hashOf(value)`. `calculationHash` is `hashOf({ birth, sex, convention.id, objective.id,
window, versions })` — identical inputs ⇒ identical hash.

---

## 12. Web UI features

Files: `src/App.tsx`, `src/ui/*`, `src/styles.css`.

**Input panel:** birth date · birth time · birth time-zone (UTC−12:00 … +14:00 in 30-min
steps) · sex (segmented, drives 大運) · time-certainty (exact / approximate / hour-unknown) ·
convention-set picker (3 presets) · objective picker (11) with its description · search-window
start date · days-to-scan (1–180). "Compute" button. Auto-runs once on mount.

**Chart panel (`ChartPanel`):** four pillars (stem/branch coloured by phase, pinyin, Na Yin,
Ten God; day pillar highlighted) · Day-Master chips (element, strength, 得令/失令) · element
balance bars with percentages · favourable / less-favourable elements · Da Yun 大運 strip
(9 pillars, age ranges, Ten God) · Day-Master rationale · boundary-sensitivity warnings.

**Results panel:** objective heading + window + doctrine note · **calendar heatmap**
(`Heatmap`) coloured by score with vetoed days hatched and the selected day outlined ·
ranked **day cards** (`DayCard`, up to 60) — rank badge, date, day ganzhi/animal, best hour,
score ring, badges (建除 officer, 黄/黑道 god, best hour, confidence, conflicts, Shen Sha
tags), top reasons, and an expandable **evidence drill-down** (4-way score breakdown with
weights, conflicts, every rule fired with its citation and signed effect, all 12 double-hours,
the 7 confidence components) · collapsible list of **vetoed days** with reasons · footer with
convention id, `calculationHash`, all layer versions, determinism note, and disclaimer.

**Score bands** (`format.ts`): ≥72 Excellent · ≥58 Favourable · ≥45 Neutral · ≥32 Caution ·
else Avoid. **Confidence labels:** ≥0.8 High · ≥0.65 Medium-High · ≥0.5 Medium · else Low.
**Phase colours:** wood `#5fae7a`, fire `#d96a6a`, earth `#cda35a`, metal `#c2c6d6`,
water `#5b8def`.

---

## 13. Test suite (golden validation)

Run `npm test`. **21 tests, all passing.**

**`kernel.test.ts` (15):**
- JDN: `2000-01-01 = 2451545`.
- Solar terms within 30 min of published UTC: 2023 winter solstice, 2024 spring equinox,
  2024 summer solstice, 2024 立春.
- Month branch from longitude (315°→寅, 255°→子).
- Day-pillar cycle: Mao anchor 1893-12-26 → 丁酉 (33), ±1 per civil day.
- Full charts: **Mao Zedong → 癸巳 / 甲子 / 丁酉**; **Zhou Enlai → 戊戌 / 甲寅**.
- Na Yin (甲子→海中金 metal, 壬戌→大海水), Ten Gods (甲 sees 己→正財, 甲 sees 庚→七殺).

**`decision.test.ts` (6):** window produces ranked recommendations (sorted desc);
determinism (same `calculationHash`, same top day); 破-day hard-reject for contracts;
every recommendation carries facts + fired rules + citations + valid confidence + a best
hour; objectives can rank differently; medical tolerates 破 (0 rejects).

---

## 14. Public API surface

`src/engine/index.ts` re-exports everything. Primary entry points:

| Export | Purpose |
|---|---|
| `evaluateDecision(req) → DecisionResult` | full pipeline: chart + ranked timing + evidence |
| `buildFourPillars(input, convention)` | four pillars only |
| `buildBaziChart(fourPillars)` | chart analysis |
| `computeDaYun(fourPillars, sex)` | luck pillars |
| `computeTongShuDay(civil, instant)` | almanac facts for a day |
| `OBJECTIVES`, `objectiveById` | objective catalog |
| `CONVENTION_PRESETS` | convention sets |
| `VERSIONS`, `hashOf`, `canonicalJSON` | versioning + hashing |
| plus all symbol tables / helpers from `symbols.ts` | — |

---

## 15. Known limits & out-of-scope

Implemented to a tee above. **Deliberately not built** in this version (the MCDA layer is
designed to accept these as additional evaluators later):

- Qi Men Dun Jia full nine-palace board (gates / stars / deities / plates).
- Xuan Kong Flying Star charts; Xuan Kong Da Gua 64-hexagram compass; Great Sun Formula.
- Form-school / compass feng-shui site evaluation.
- Server-side machinery from the spec: event sourcing, PostgreSQL projections, OpenAPI
  service, OCR source-ingestion pipeline, signed plugin manifests.
- `lunar_new_year` year-boundary variant (only 立春 is implemented).

**Precision note:** solar-term times use the Meeus low-precision series (≈0.01°, ≈ a minute
in time) and host-runtime tz handling — fine for decision timing, and births/days near a
boundary are flagged rather than over-claimed. Historical DST/timezone edge cases rely on the
explicit `tzOffsetMinutes` the user supplies.
