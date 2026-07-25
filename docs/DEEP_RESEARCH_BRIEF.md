# Wéi — Deep-Research Brief (post-Phase 11, 2026-07-25)

This document is self-contained: it describes the product, its engine doctrine, its verification
posture, what just shipped, what competitors offer, and the open questions we want researched.
Screenshots are in `screenshots/` (`before/` = pre-Phase-11, `after/` = personalized user,
`after-visitor/` = no-profile visitor; same routes in each for comparison).

---

## 1. What the product is

**Wéi** is a web app (Vite + React 18 + TypeScript, client-side only, GitHub Pages) for
**decision timing** grounded in classical Chinese metaphysics: BaZi (Four Pillars / 子平)
personal charts plus Tong Shu (通書/通勝) day-selection. The user asks "when should I sign /
marry / launch / move?" and the engine ranks days and hours inside a window, showing full
reasoning for every score.

**Core differentiator vs the category:** radical transparency and honesty.
- The engine is **deterministic** — no LLM, no network, no randomness in any calculation path.
  Identical inputs give identical output, provably (every result carries a reproducibility hash).
- Every score decomposes into named rules with classical citations; where schools disagree
  (e.g. 晚子時 hour-stem handling, true-solar vs civil-clock hours), the app **shows the
  disagreement** instead of picking silently.
- Confidence numbers measure *how well-sourced and reproducible* a reading is — never the
  probability an outcome occurs. Copy never promises outcomes ("tilts", "tradition marks",
  never "will happen").

**Monetization:** Free / Pro (£7/mo, £54/yr) / Lifetime (£89 one-off) via Stripe + Firebase.
Settled gating rule: **paid tiers buy range, breadth and storage — never the correctness,
transparency or honesty of a reading.** Free users see the same scores, same conflicts, same
disclaimers. Gates: 5-year search horizon (free: 60 days), non-current-year forecasts, 10-year
luck-pillar decades, multi-profile (6), group date selection, unlimited journal, export,
practitioner audit trail. AI advisor is metered per day (free 5 / pro 200); the deterministic
engine itself is never gated.

## 2. Engine architecture (all client-side, `src/engine/`)

- **Astronomy:** abridged VSOP87 solar longitude → 24 solar terms accurate to ~25 s of
  published ephemeris (validated against all 72 HKO terms 2025–27 within 120 s, and JPL
  Horizons crossings). ΔT model refit 1800–2050.
- **Sexagenary kernel:** day pillar anchored at 1893-12-26 = 丁酉; year boundary at 立春
  (λ=315°); month stem by 五虎遁 from solar-term month; hour stem by 五鼠遁. True solar time
  (真太陽時) = longitude correction + equation of time (Meeus).
- **BaZi layer:** Ten Gods, hidden stems (藏干) with per-stem gods, Na Yin, day-master
  strength (rooted/season-adjusted with 旺相休囚死), special structures (從格 follow /
  專旺 dominant), favourable-element derivation (用神), 大運 luck decades, 流年/流月 periods.
- **Tong Shu layer:** 12 Day Officers (建除十二神), 12 day gods (黃道黑道), 三煞 direction,
  歲破/四離/四絕 taboos, day clash animal, personal Shen Sha (天乙貴人, 桃花, 驛馬), and — new —
  the classical **hour gods** (時辰吉凶, same 黃/黑 cycle seeded by day branch; seed formula
  `mod(dayBranch×2+8,12)`, the 「子午青龍起於申」 mnemonic).
- **Decision layer:** per-objective MCDA scoring (officer/day-god/personal fit/hour), hard
  vetoes per objective (e.g. weddings on 歲破), clash hierarchy 「日時沖命大凶不用，月沖次之
  權用，年沖可用」, almanac blending (60% structural / 40% 宜忌 verdict when almanac data is
  injected), 4-axis confidence, convention & weight sensitivity sweeps.
- **Verification layer (lazy chunk):** cross-checks calendar facts against
  **lunar-javascript** (an independently implemented almanac library) and solar terms against
  HKO/JPL fixtures; live per-day badges ("Calendar verified", "Almanac cross-checked",
  "Convention-sensitive"). The engine's 宜/忌 and hour-god tables are pinned by tests against
  the comparator (hour gods: 144/144 agreement).
- **AI chat** is an explanation shell only: a Claude tool-loop that may never compute — it
  calls 8 local engine tools and cites their output. BYOK or proxy. With no key configured, a
  **deterministic offline advisor** answers instead (labelled as such).

Test suite: **376 tests + 2 skipped** (golden charts incl. Mao Zedong / Zhou Enlai published
charts; a 349-case pillar battery vs lunar-javascript; solar-term fixtures; doctrine tests that
forbid predictive phrasing; free-tier floor tests that stop future gates hollowing out Free).

## 3. What just shipped (Phase 11) — and why

Phase 11 was driven by four owner complaints; each was audited before building:

**(a) "Predictions come out wrong when you add your DOB."**
A 349-case battery (1940–2030, DST edges, wartime UTC+9 China, 立春 windows, 23:00/00:30
births) proved the engine arithmetic clean — every sect-matched comparison agreed with
lunar-javascript. The real causes were input-path bugs, now fixed:
1. The birth form seeded the **device's current UTC offset** as the birth offset. A London
   user entering a January birth during BST got +60, which flips year/month pillars for
   births within an hour of a solar term (e.g. 1998-02-04 01:30 London: 丁丑/癸丑 instead of
   戊寅/甲寅) and corrupts luck-pillar start ages. Now: device IANA zone + offset resolved
   for the birth date; stored profiles healed on load (city profiles heal to the city's zone;
   offsets the seed bug couldn't have produced are left alone; manual overrides untouched;
   cloud records heal without device influence).
2. The app's default hour basis is **true solar time**, which differs from the civil-clock
   charts most mainstream apps show (hour pillar differs in ~61% of the battery; day pillar
   in ~11% for near-midnight births). Correct doctrine — but it *reads* as a bug. Now a free
   **ConventionCompare** panel shows both charts side by side with a one-tap switch.

**(b) "Make it like Joey Yap's apps — daily calendar select."**
Month cells now carry day pillar + zodiac animal + lunar date + personal score; every day
opens a rich day view: verdict + score hero, clash animal with affected birth years (visible
立春 caveat), full 通勝 宜/忌 lists with English glosses, 28 mansions, lunar date, and
hour-by-hour ratings — including for visitors with **no profile** via the classical hour gods.
Date/month jump inputs and day→week/month/year cross-links everywhere.

**(c) "The app feels restrictive."**
The one structural blocker found: every ranked search was hard-anchored to *today*. Now
searches start from **any date** (placement is free on all plans; only window *length* stays
plan-clamped), readings are URL-addressable/shareable, the global search understands absolute
dates, the nav is context-aware, journal entries reopen on their saved day, group results and
year-view months link through.

**(d) "Is there an AI chat about my BaZi?"**
There was — undiscoverable and thin. Now: `get_natal_chart` (full pillars, hidden stems + Ten
Gods, Na Yin, palaces, element balance, functional element map, personal stars) and
`get_profile_fits` (all 11 objective fits) tools, objective-less "how is [date] for me?",
tappable date chips in answers, profile-aware suggestion chips, a prominent chat CTA on the
profile page, and a deterministic offline mode when no key is set.

Everything was adversarially reviewed post-build (19 findings, 17 confirmed, all fixed —
notably: the 日破 clash-hour could out-score its own "avoid" reason text; now capped below
every favourable band in both the classical and personalized hour reads).

## 4. Competitor landscape (researched July 2026)

**Joey Yap TongShu Power Planner 3.0** (flagship, USD 97/mo or 997/yr!): personalized good/bad
day calendar from the user's own BaZi, hour-by-hour insights (Pro), 12-month date-finder,
filterable calendar, 4 profiles + multi-person compatibility, journal + planned activities,
token-based "Pro Date Selector" with AI-written narratives, white-label PDF reports for
practitioners, ecosystem SSO (BaZi Plotter, QM Explorer). Free tier heavily capped (7-day
range, 5 searches/mo).
**Joey Yap legacy apps:** iProTongShu (year-wide best-day search), iBaZi HD (bilingual chart
plotting, Na Yin narrations, 12 life-stages, client management), QiMen 365.
**"Master Sifu"** is ambiguous; closest matches: *Sifu Xion* (bazi-master.com — free
solar-time-corrected calculator + free AI chart analysis in 8 languages + USD 49 human master
reading) and *BaZi SiFu* (bazisifu.com — Ming Pan views, Ten-God breakdown, element
percentages).
**Way FengShui Almanac:** daily suit/avoid, hourly forecasts, zodiac forecasts, date
selection, digital Luopan compass, divination mini-tools (Bone Weight, 64 Hexagrams…).
**Almanac Pro (Tong Shu):** any-date browsing with day+hour ratings, Qi Men charts, flying
stars, 28 constellations, NOAA apparent-solar-time options, push-notification planned notes;
$3.99–$249.99/yr subscription ladder.

**Where Wéi now matches or beats them:** calendar depth, hour ratings, arbitrary-date freedom,
chart-plotter profile depth, transparency/verification (no competitor shows working or
cross-checks), honest free tier (Joey Yap's free tier is far more restrictive), price.
**Where competitors are still ahead:** native mobile apps + push notifications, multi-person
*compatibility narratives* (we do group day-scoring, not relationship analysis), practitioner
white-label PDF reports, token-based premium AI narrative reports, ecosystem breadth (Qi Men,
Flying Stars, Zi Wei), client management for professional consultants, community/education
funnels (Joey Yap's academy), planned-activity reminders.

## 5. Known limitations (deliberate or open)

1. **Zi Ping + Tong Shu only.** No Qi Men Dun Jia, Flying Stars, Zi Wei Dou Shu, Da Liu Ren.
   (Some display-only Qi Men/Flying Star anchors exist in the codebase but do not score.)
2. **Additive scoring.** MCDA sub-scores cannot capture holistic chart reading (通關, 生剋
   chains, structural gestalt a master would weigh).
3. **Score calibration is opinion.** The 0–100 bands, MCDA weights, officer/day-god score
   tables are one defensible reading of the tradition; alternatives reorder mid-band days.
   Sensitivity sweeps quantify but don't eliminate this.
4. **No outcome validation, ever, by design** — the app says so openly. Its accuracy criterion
   is agreement with the mainstream almanac + correct doctrine, not predicted outcomes.
5. **宜/忌 term glosses** for the third-party almanac list are a hand-built ~80-term map;
   ungloseed terms show hanzi only.
6. **三煞 and 納音 are shown but never scored**; 28 mansions are display-only.
7. **No push notifications / reminders; no native mobile app** (PWA only).
8. **Hour-god doctrine**: we implement the 青龍-from-day-branch cycle confirmed against
   lunar-javascript; other lineages exist (e.g. 金符經 variants) and are not offered.

## 6. What we want from a deep-research run

**Doctrine & accuracy (highest value):**
1. Independent verification of the **hour-god (時辰吉凶) seed table** across published Tong Shu
   sources — is 「子午青龍起於申」 the dominant lineage? Which almanacs use variants, and should
   we expose the variant as a convention toggle like we do for 晚子時?
2. The **日破 hour cap**: we now cap the clash hour below all favourable bands. Survey
   classical sources (協紀辨方書, 選擇求真, modern JY teaching) on whether any tradition lets a
   strong hour god redeem a 時沖日 hour.
3. **宜/忌 derivation**: our native 宜/忌 comes from the 12 officers; the almanac blend adds
   lunar-javascript's fuller lists. Research how commercial 通勝 (e.g. 蔡真步堂) actually
   compose 宜/忌 (officer + 黃黑道 + 神煞 + 28宿 + 董公?) so we can grow a defensible native
   derivation instead of leaning on one library.
4. **True solar vs civil clock defaults** across major schools and apps — evidence for which
   default minimizes user confusion while staying defensible; whether birth-place-less charts
   should refuse the hour pillar instead of silently downgrading.
5. **28 mansions**: per-mansion 吉/凶 tables differ across sources; find the most-cited table
   and whether mansions should influence day scores or stay display-only.
6. Published **golden charts** (well-documented historical figures with verified birth times)
   to extend our regression battery, especially pre-1900 and southern-hemisphere births.

**Product (compete with Power Planner at 1/10th the price):**
7. What makes Joey Yap's **Pro Date Selector narratives** and **white-label PDF reports**
   valuable to practitioners — feature teardown, and what a transparent/deterministic
   equivalent would look like (our export gate already exists).
8. **Compatibility analysis** (relationship/partner charts): the doctrinally sound subset we
   could ship deterministically (合/沖/刑/害 between two charts, useful-god complementarity)
   without pretending to predict relationships.
9. **Notifications/planned activities**: engagement patterns in almanac apps — what cadence
   ("tomorrow clashes your zodiac", "your Nobleman day next week") retains without spamming.
10. Pricing research: the £7/£54/£89 ladder vs Joey Yap's $97/mo and Almanac Pro's ladder —
    where's the willingness-to-pay for a *transparent* alternative? Is Lifetime cannibalizing?
11. **Onboarding**: best practices for birth-time-unknown flows (rectification wizards?
    hour-agnostic readings?) — we currently downgrade honestly but offer no rectification.
12. Localization priority: the audience overlap of English-first vs zh-TW/zh-CN/MY-SG markets
    for a Tong Shu product; which locale unlocks the most users for the least doctrine risk.

**Trust & growth:**
13. How to *communicate* determinism/verification as a marketing advantage without it reading
    as academic (competitors sell certainty; we sell honesty — find the framing that wins).
14. App-store strategy for PWAs in this category (Capacitor wrap? TWA?) given competitors own
    the "tong shu" app-store keywords.

## 7. Current state snapshot

- Live site: GitHub Pages (deploys from `main` on push, BYOK for AI on the static build).
- Local commit `f806a50` (Phase 11) on top of `4014a31`; 376 tests green; typecheck clean;
  bundle: main 484 KB (156 gz) + lazy lunar-javascript 293 KB + lazy firebase 674 KB.
- Engine version registry: engine 0.3.x lineage; every reading stamps versions + input hash.
- Screenshot inventory (1380×900 viewport, full-page):
  `landing, today, day-detail (2026-08-08), week, month (2026-08), year (2026), date-finder,
  group, chat, profile, pricing` — in all three states (before / after-personalized /
  after-visitor). The personalized profile uses the reference chart 1998-03-23 19:47 London
  (day master 己 Earth; pillars 戊寅/乙卯/己巳/甲戌 under the true-solar default).
