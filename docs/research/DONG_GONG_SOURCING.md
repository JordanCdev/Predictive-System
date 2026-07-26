# Dong Gong (董公選擇要覽) — Sourcing and Verification Report

Date: 2026-07-26. Agent D research output. No application code was written; this document and
`dong-gong-draft.json` are research artifacts only. Nothing here is wired into the engine or UI.

## 1. What the system is

董公選擇要覽 (also circulating as 董公選擇日要覽 / 董公擇日要覽, "Dong Gong's Essentials of Date
Selection") is a classical Chinese date-selection text attributed to a Yuan/Ming-era selectionist
known as 董公 — online editions credit 董德彰 (Dong Dezhang); some secondary literature uses 董潛.
The attribution varies by publisher and should not be presented as settled.

**How the text is actually organised — important correction to the 60×12 framing.** The classical
text is NOT a flat 60-ganzhi × 12-month table. Its native structure is:

- 12 solar months (正月建寅 … 十二月建丑), delimited by solar terms (立春, 驚蟄, …), each with a
  header noting 三煞 direction taboos and 四絕/四離 days;
- within each month, 12 entries — one per **Day Officer + branch** pair (建寅日, 除卯日, 滿辰日 …).
  Because the 建除十二神 cycle is anchored to the month branch, officer and day-branch are
  redundant: each entry is really a (month × day-branch) cell. 12 × 12 = **144 cells**;
- inside a cell, free-text commentary that frequently differentiates specific stem-branch days
  (e.g. 正月開子日: 甲子 bad, 壬子 bad, 丙子/戊子/庚子 very auspicious with 黃羅紫檀 stars). Expanding
  each branch to its 5 valid stems gives the 60×12 = **720-cell ganzhi grid**, but only some cells
  carry explicit per-stem distinctions; the rest inherit the cell's base commentary or a
  "餘X日…" (all remaining X days…) clause.

**The commentary is activity-specific, not scalar.** Many cells simultaneously forbid some
activities and endorse others (e.g. 六月危寅日: bad for travel/construction/marriage, 大吉 for
burial and openings). Any single per-day rating — including the competitor's — is an editorial
compression of this text.

**The competitor's rating is proprietary.** Joey Yap's product shows a "**JY** Dong Gong Rating"
(e.g. 上吉 Excellent, and x/5 scores in his book). The "JY" prefix is accurate: the classical text
contains rating vocabulary inline but no printed per-day scale; the numeric scale is Yap's own
interpretation, published in his book *Dong Gong Date Selection* (JY Books, ISBN 983333251X).
We must not copy his ratings, and a rating we derive ourselves will legitimately differ from his
in places. That is a defensible position only if we say clearly that ours is derived from the
classical commentary by stated rules.

## 2. Sources found

### Primary transcriptions (used for cross-checking)

| id | URL | What it actually contains |
|---|---|---|
| `wenxuecity-2017` | https://www.wenxuecity.com/blog/201706/67063/12758.html | Full traditional-character transcription, all 12 months × 12 officer-branch entries (144/144), per-stem commentary, plus a glossary of activity terms and two auxiliary hour/direction tables. Posted 2017 by blogger 玄极子. Contains transcription typos (e.g. 開辰日 for 閉辰日 in 四月; 癸卯正四廢 for 癸亥; 更午 for 庚午; 甲五 for 甲午; 寒霜 for 寒露). |
| `diancang` | https://www.diancang.xyz/xuanxuewushu/18440/341127.html | Full traditional-character transcription on 中华典藏 (diancang.xyz), attributed to 董德彰, single page, 144/144 entries. Near-verbatim twin of the wenxuecity text but independently typed — it corrects most of wenxuecity's typos and has a few of its own. |
| `tianyugong-2022` | https://tianyugong.com/donggong/ | Simplified-character, lightly modernised edition (2022, site 天玉宫): star names parenthesised, punctuation regularised, and an added per-month 刑/害/煞 direction paragraph not in the other two. 144/144 entries (one header typo: 平成日 for 平辰日 in 腊月). Same underlying content. |

### Corroborating / not fetched in full

- 腾讯文库 and 文档之家 host further copies of the same 董公择日要览 text (docs.qq.com docId
  `ag6W9ckChH`; doczj.com doc `03b14872f61fb7360b4c65f8`) — same recension, not independently useful.
- 加拿大國際風水命理研究中心 (cafengshuinet.com id 1642) and a Sina article carry 董公择日秘法
  excerpts.
- 知乎: 《董公择日法》十二建星吉凶 (zhuanlan.zhihu.com/p/617242084) — secondary explainer.
- 易先生 (yixiansheng.com/article/4296.html) — biographical note on 董德彰 and the text's standing.
- Joey Yap, *Dong Gong Date Selection* (JY Books; Amazon/Goodreads/Kobo listings confirm scope:
  "12-Months Analysis for determining auspiciousness of individual Jia Zi days", auxiliary star
  charts, 12 Day Officers table) — the competitor's own derived product and the natural printed
  spot-check target.
- **Not found**: the text is not on ctext.org or zh.wikisource.org (searches during this session
  surfaced no scholarly/critical digital edition). No 四庫-lineage witness located online.

### Independence caveat (the honest limit of this exercise)

All three primary transcriptions appear to descend from **one modern printed recension** — the
wenxuecity text even embeds editorial notes comparing "董公原本" against 諸家曆法 and 協紀辨方書
(see the 八月定丑日 entry), which marks it as a modern annotated edition, likely from the Taiwanese
通書 tradition. So our cross-checking proves **transcription fidelity** (it caught real typos in
every source), not **recension-level independence**. A printed edition is still required for full
verification.

## 3. Agreement between sources

Method: each source was parsed into (month × branch) cells; all three yielded complete or
effectively complete 144-cell coverage (each has exactly one officer/header typo, each corrected
by the other two). Per-cell text similarity (character-bigram Jaccard): wenxuecity ↔ diancang
mean 0.91 (same recension, near-verbatim); wenxuecity ↔ tianyugong mean 0.55 (same content,
rephrased + simplified characters). Manual inspection of the most-divergent cells found only
boilerplate contamination and typo-level differences — **no cell-level substantive disagreement
between the three transcriptions**, with one famous exception the text itself documents:

> 八月定丑日: the transcribed edition itself records that 董公原本, 馬氏曆法家, and 協紀辨方書
> **disagree** about which 丑 days are usable, and the annotator concludes only 乙丑 is reliably
> auspicious. Where publishers/schools disagree, the text says so — and so must we.

## 4. Rating vocabulary actually found

The sources do **not** use a uniform per-cell scale. Inline vocabulary, in rough order of
frequency: 大凶, 凶, 不宜/不利/忌 (activity-scoped), 百事不宜/諸事不宜/百事皆忌, 次吉, 大吉, 吉,
上吉 (rare — 8 cells in the derived grid), 平常/小小營為則可 (neutral/small matters only), plus
recurring named modifiers (正四廢, 煞入中宮, 十惡, 六甲窮日, 天月二德, 黃羅紫檀 star canopy, etc.).
The competitor's 上吉 "Excellent" label matches this vocabulary; his 5-point numeric scale does not
appear in the classical text.

## 5. Coverage map — 60×12 grid with agreement

A deterministic keyword extractor (documented in `_meta.derivation` of the draft JSON) was applied
**independently to each source's text** to derive a per-ganzhi rating in
{上吉, 大吉, 吉, 次吉, 平, MIXED (activity-dependent), 凶, 大凶}. Agreement of the derived ratings
across the 720 ganzhi-month cells:

- all three sources agree: 92.8%
- wenxuecity ↔ diancang: 96.1% (same recension — corroboration, not independence)
- wenxuecity ↔ tianyugong (the most independent pair): 93.3%
- **kept in draft (every available source agrees exactly): 673/720 = 93.5%**
- dropped (any disagreement, left absent, never guessed): 47 cells — concentrated in months 4, 8,
  10, 11 and in cells whose commentary is genuinely equivocal (including 八月丑日 above).

Kept-cell rating distribution: 大凶 245, 平 87, 次吉 82, 凶 78, MIXED 71, 大吉 69, 吉 33, 上吉 8.
The heavy 大凶 skew is faithful to the text (Dong Gong is a strict system) but also reflects the
extractor's conservative precedence (strong-negative markers like 正四廢/煞入中宮 dominate a cell).

Since coverage with agreement exceeds the ~80% threshold, the draft table was produced:
**`docs/research/dong-gong-draft.json`** — {month branch → {ganzhi → {rating, ratingEn, officer,
sourceRefs}}}, disagreeing cells absent, full method + caveats in `_meta`.

## 6. Recommendation

**Ship in two stages; do not ship a scalar rating yet.**

1. **SHIP NOW (defensible today): the commentary cell, not a scalar.** For any given day we can
   deterministically locate its (solar month × day branch) cell and show: the Day Officer pairing
   — our engine already computes this in `src/engine/tongshu.ts` as
   `officerIndex = (dayBranch − monthBranch) mod 12`, and that exact formula reproduces the officer
   labels printed in the transcriptions 144/144 (after correcting each source's single header typo,
   itself outvoted by the other two) — plus the classical commentary (with the day's exact ganzhi highlighted
   when the text names it), labelled as *"Dong Gong 董公選擇要覽 — classical almanac cross-check;
   transcription cross-checked across three published copies"*. This is honest, fully sourced,
   display-only, and matches our house copy rules (third-party almanac data labelled as
   cross-check).
2. **DO NOT SHIP YET: a per-day scalar "Dong Gong rating" axis.** The 673-cell draft is internally
   consistent but rests on (a) one recension transcribed three times, and (b) our own derivation
   rules. Shipping a scalar now would present an interpretation as the classical text — the exact
   failure mode this brief forbids. It also invites false equivalence with the competitor's
   proprietary "JY" scale.

**Unblocking acquisition (specific):** any ONE of the following printed editions, spot-checked at
36 cells (3 per month, stratified across rating levels; any mismatch demotes the cell), upgrades
the draft to shippable:

- Joey Yap, *Dong Gong Date Selection — An Essential Reference Text*, JY Books, ISBN 983333251X
  (English transliteration; also useful to document where our derived rating deliberately differs
  from his), or
- a Taiwanese 通書 reprint carrying 董公選要覽 in full (竹林書局 or 瑞成書局 catalogue; the annual
  廖淵用通書便覽 and 蔡炳圳七政經緯通書 both carry Dong Gong day text), or
- any independently-set 董公択日/董公選擇要覽 standalone reprint (심Yi-tang/心一堂 HK catalogue has
  related 選擇 titles).

If stage-1 ships, the disagreement cells (47) and the disputed 八月丑日 case should be rendered as
"sources disagree" rather than silently omitted — that is our differentiation versus the
competitor's unexplained scalar.

## 7. Files

- `docs/research/DONG_GONG_SOURCING.md` — this report.
- `docs/research/dong-gong-draft.json` — 673-cell draft grid, per-cell sourceRefs, absent cells
  where sources' derived ratings disagree; `_meta` carries method, coverage, caveats, and the
  36-cell verification plan. Research data only — not imported anywhere.
