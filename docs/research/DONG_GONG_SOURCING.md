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

> **SUPERSEDED by the second pass — see §8.** Two pre-modern printed witnesses were located and
> read. The claim below that the 協紀辨方書 comparison "marks it as a modern annotated edition" is
> **falsified**: that editorial apparatus is already present in an 1898 woodblock and in a
> Republican-era lithograph. The paragraph is kept for the record.

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
  36-cell verification plan. Research data only — not imported anywhere. **Unmodified by the
  second pass** — see §8.6 for why the mismatches were recorded here rather than edited into
  the data.

---

# 8. Second pass (2026-07-26): printed-witness hunt and spot-check

Three independent search runs were commissioned to find a **recension-independent witness**. This
section records what they found, an adjudication of whether the find is genuinely independent, and
the spot-check the §6 gate asked for. Verdict up front:

> **An independent witness WAS found. The gate's spot-check was run at 316 ganzhi cells (8.8× the
> 36 asked for) and the draft FAILED it at 15.8%. The scalar rating axis stays unshipped — not
> because sourcing is missing, but because the derivation is now demonstrably wrong.**

## 8.1 Witnesses found

| id | What it is | Independent? |
|---|---|---|
| `nlc416-wenming` | **董公選要覽**, 78-page photographic scan of a Republican-era **lithograph**; title page reads 董公選要覽 / 全一冊 / 上海文明書局印行. National Library of China copy, id `NLC416-12jh005366-44510`, PD scan mirrored on Wikimedia Commons. Contains 蔣奇峰《董書論略十三則》preface + 論略 (printed pp.1–10) + the complete 12-month day section (printed pp.1–30 = scan images p013–p042), all 144 officer/branch cells. | **Yes** — see §8.2 |
| `nlc892-1898` | **董公選要覽 一卷**, 71-image scan of a **woodblock** edition. Colophon leaf reads 董公選要覽 / 光緒戊戌夏鐫 / 江官書局校刊 = carved **summer 1898** (Guangxu wuxu). Bears 天津圖書館藏書 and 國家圖書館 seals and the 中華古籍保護計劃 watermark. NLC id `NLC892-GBZX0301014461-272080`. | **Yes** — and pre-dates the online texts by ~120 years |

Both PDFs are pure image scans with **no text layer** (`nlc416` = CCITT G4 bitonal, `nlc892` =
JPEG-2000), so they cannot have been produced by scraping the web transcriptions, and they had to
be read visually page by page after extracting and converting the raw image streams.

Durable URLs (PD scans mirrored on Wikimedia Commons):

- `nlc416-wenming` — `https://upload.wikimedia.org/wikipedia/commons/8/87/NLC416-12jh005366-44510_%E8%91%A3%E5%85%AC%E9%81%B8%E8%A6%81%E8%A6%BD.pdf`
- `nlc892-1898` — `https://upload.wikimedia.org/wikipedia/commons/2/2b/NLC892-GBZX0301014461-272080_%E8%91%A3%E5%85%AC%E9%81%B8%E8%A6%81%E8%A6%BD_%E4%B8%80%E5%8D%B7.pdf`

A third scan (`ntl.pdf`, 78 images, Taiwan National Library 臺灣華文電子書庫 NTL-9900007903,
董公選要覽, 秦慎安校勘, 文明) is by its imprint **the same 文明書局 edition** as `nlc416`, held and
scanned by a second institution. It is corroborating provenance, not a separately-read witness.

### What this adjudicator verified first-hand

The findings below are not relayed on trust. Working from the retrieved page images directly:

- `nlc416` **title page** — read; confirms 董公選要覽 / 全一冊 / 上海文明書局印行.
- `nlc416` **printed p.3** (image `a416_p015`) — read and transcribed; carries 正月開子日, 正月閉丑日,
  二月建卯日, 二月除卯日 and the 二月 month header.
- `nlc416` **printed p.25** (image `a416_p037`) — read and transcribed; carries the 十月 cells
  定卯日 / 執辰日 / 破巳日 / 危午日 / 成未日. Five of the 68 spot-checked groups (§8.4) are adjudicated
  from this page by first-hand reading.
- `nlc892` **colophon leaf** — read; confirms 光緒戊戌夏鐫 / 江官書局校刊 and both library seals.

## 8.2 Independence test (the sceptical check the brief demanded)

The right test is the one §2 set up: **does the candidate reproduce the fingerprints of the known
three?** A site that repeats wenxuecity's typos is the same recension wearing a different URL.
Applied against the local copy of the `diancang` text, at eight diagnostic points:

| Diagnostic | Online recension | Both prints | grep count in `diancang` |
|---|---|---|---|
| 正月閉丑日 | 騾**馬**踢 | 驢馬踢 | 騾馬踢 = 1, 驢馬踢 = 0 |
| 正月建寅日 | **一**年內見重喪 | 二年內見重喪 | 一年 = 1, 二年 = 0 |
| 四月執戌日 | 耗**錢**財 | 耗血財 | 耗錢財 = 1, 耗血財 = 0 |
| 九月破辰日 | 損**錢**財 | 損血財 | 損錢財 = 1, 損血財 = 0 |
| 八月定丑日 | **馬**諸家曆法云 | 諸家曆法云 | 馬諸家曆法 = 1 |
| 十一月建子日 | **進**神為地轉 | 退神爲地轉 | 進神 = 1, 退神 = 0 |
| 三月平未日 | **凶**絞朱雀 | 勾絞朱雀 | 凶絞 = 1, 勾絞 = 0 |
| 四月滿未日 | 定磉**造**架 | 定磉拴架 | 造架 = 1, 拴架 = 11 |

The prints share **none** of the online readings at these points. The 驢馬踢 reading was confirmed
by this adjudicator directly from the `a416_p015` image; the online counter-readings were confirmed
by grep against the stored source text. Note the 十一月建子日 case in particular — 進神 vs 退神
**reverses the meaning**, which is not something a transcriber copying the other direction produces.

**A second, stronger argument:** the prints carry material the online recension does not have at
all. Every month header in `nlc416` prints 月德 / 月恩 / 母倉 / 天德合 (正月建寅: 月德丙。月恩丙。
母倉亥子。天德合壬。). In the stored `diancang` text, `月恩` occurs **0 times**, `母倉` **0 times**,
`天德合` **0 times**. Content present in the witness and wholly absent from the recension cannot be
a copy of it.

**Conclusion: `recensionIndependent = true`.**

### The honest limit — witness, not tradition

These are independent **witnesses**: separately printed, separately held, separately digitized,
demonstrably not derived from the online text. They are **not a different textual tradition**. Both
are the same work (the 蔣奇峰-prefaced 董公選要覽), and what they show is that the online recension
is a *faithful-but-drifting descendant of exactly this printed lineage*. That is enough to close the
sourcing gate. It is **not** enough to make a scalar rating classical — the scale remains ours.

### Correction to §2 — the editorial apparatus is not modern

§2 guessed that the 八月定丑日 dispute note and the 協紀辨方書 citations "mark it as a modern
annotated edition." **This is wrong and is retracted.** Both the 1898 woodblock lineage and the
文明書局 print already contain:

- the 八月定丑日 adjudication (董公原本 vs 諸家曆法 vs 協紀辨方書, concluding 故此四日總以不用方爲穩善);
- the 十二月除寅日 按協紀辨方 note;
- the first-person testimony at 十一月成申日 (余自幼年得此。在江湖選擇日四十餘年…).

Relatedly, §3's "馬氏曆法家" reading is itself a **modern corruption** of 諸家曆法云.

## 8.3 What the second pass could reach that the first could not

- **Reached:** Wikimedia Commons PD mirrors of Chinese state-library rare-book scans, and the
  Taiwan National Library 華文電子書庫 reader. The unlock was recognising these as *image* PDFs and
  extracting/converting the raw image streams (CCITT G4 → TIFF, JPX → JP2) rather than expecting
  text extraction to work. The first pass's text-oriented searching could never surface these,
  because there is no text in them to match.
- **Still not reachable:** 董公選要覽 is absent from ctext.org, zh.wikisource, HathiTrust, Google
  Books full-view, shuge.org and guoxuedashi in any readable form. **No 四庫-lineage or critical
  scholarly edition exists online.** Joey Yap's book (the competitor's own derived product) was not
  obtained and remains the only way to check where our derivation deliberately differs from his.

## 8.4 Spot-check against `dong-gong-draft.json`

The §6 gate asked for **36 cells, 3 per month, stratified across rating levels**. Delivered:

| | |
|---|---|
| Branch-groups compared | **68 of 144** native cells |
| Ganzhi cells compared (present in draft) | **316** |
| Months covered | **12 of 12** (4–10 groups each) |
| Rating levels covered | 上吉, 大吉, 吉, 次吉, 平, MIXED, 凶, 大凶 — all eight |
| **vs. the 36-cell gate** | **8.8× the required sample.** The gate is met on size and stratification. |

Result:

| Outcome | Count | Share |
|---|---|---|
| **Match** | 266 | **84.2%** |
| **Mismatch** | 50 | **15.8%** |
| Absent in draft (within sampled groups) | 24 | of 340 slots |

Per month (match / mismatch / absent): 寅 29/11/0 · 卯 25/0/0 · 辰 41/6/3 · 巳 22/1/2 ·
午 22/1/2 · 未 19/5/1 · 申 16/3/1 · 酉 11/6/3 · 戌 22/3/0 · 亥 26/9/5 · 子 13/3/4 · 丑 20/2/3.

**27 of the 68 groups contain at least one mismatch.** Under the gate's own rule ("any mismatch
demotes the cell"), 50 cells demote. But the failure is not scattered noise — it is systematic, and
§8.5 is the reason the right response is to rebuild the derivation, not to demote 50 cells.

### Adjudication convention used

A **mismatch** is recorded only where the draft's rating contradicts an *explicit statement in the
text about that specific stem-branch*, or reverses polarity. Where the text names no stem and the
draft merely under- or over-reads the cell's general tone, that was counted a **match** (tolerable
compression). The 15.8% is therefore a floor, not a ceiling.

## 8.5 The decisive finding: 48 of the 50 mismatches are OUR bug, not a source disagreement

Every mismatch-supporting clause was checked back against the stored `diancang` text. In **48 of
50 cases the online source says the same thing the print says** — meaning the draft's rating
contradicts *its own three sources*, and no printed edition was ever needed to catch it. These are
extractor defects. Six classes:

1. **Residual-clause misassignment ("餘X日…") — the largest class, ~24 cells.** The extractor never
   attaches the trailing "餘X日次吉 / 亦不吉 / 亦大吉" clause to the unnamed stems; they instead
   inherit the cell's dominant marker. E.g. 八月執寅日 "餘寅亦次吉、可用" → draft rates 丙寅/戊寅/壬寅
   **大凶**. 六月除申日 "餘申日亦大吉" → draft rates 戊申/壬申 **MIXED**. 九月執卯日 "餘卯次吉" →
   draft rates 丁卯/癸卯 **大凶**. 十月危午日 "餘午次吉" → draft rates 戊/庚/壬午 **大凶**.
2. **`吉` matched inside a negation — ~7 cells.** 三月收丑日 "餘丑亦不**吉**" → draft rates
   乙丑/己丑/辛丑 **吉**. 正月滿辰日 "餘辰日亦不**吉**" → 丙/庚/壬辰 **吉**. 八月危辰日
   "庚辰天地相疑，不**吉**" → 庚辰 **吉**. 四月滿午日 "丙午平常不能見**吉**" → 丙午 **吉**.
3. **A named-auspicious stem losing its rating to the cell's generic value.** 十一月成申日: 壬申 is
   the flagship (天月二德…百福駢臻) → draft **平**. 十二月除寅日: 庚寅 is the flagship
   (火星、天月二德) → draft **平**. 五月成寅日: 丙寅 天月二德 → draft **平**. 六月執子日:
   "丙子、庚子利起造…戊子次吉" → draft **平 / 平 / 大凶**.
4. **False MIXED** on cells where nothing is praised. 正月除卯日 is wholly negative
   (…見凶冷退、生離死別) yet all five ganzhi are rated **MIXED**. `_meta` defines MIXED as "praises
   some activities and forbids others" — that condition is not met.
5. **Polarity inversion.** 三月平未日 says 乙未 **更加凶險** (worse than the rest), yet the draft
   rates 乙未 **凶** while the unnamed stems get **大凶**.
6. **Over-rating a cell the text itself flags as disputed.** 八月定丑日 乙丑 → draft **上吉**, where
   both witnesses give only 次吉 and the annotator's own verdict is a cautious 惟乙丑核對….

**The 2 genuine print-vs-online divergences** (the only mismatches that needed a printed witness):
十月建亥日 乙亥 and 己亥. Online reads "如乙亥、己亥亦只宜小作營為" (→ MIXED, which is what the draft
has); the print reads "如乙亥己亥亦是五行無氣。名爲暴敗煞重之日…用之冷退凶" (→ 凶). Here the draft is
defensible against its own sources and wrong against the prints.

## 8.6 Variant readings to adjudicate before any cell text is displayed

The prints correct ~20 corruptions in the online recension. Where **both** the 1898 woodblock and
the 文明書局 lithograph agree against a lone modern reading, the prints should win. Beyond the eight
in §8.2: 正月除卯日 活業分散 (not 各業分散) · 正月危酉日 比利之日 (not 比和) · 二月建卯日 損宅長 /
三六年 (not 損家長 / 三、五年) · 三月建辰日 家敗人亡 (not 家破人亡) · 三月危亥日 陰府決遣之期 →
之日, 主絕人**有**受死事 (not 又) · 四月滿未日 用之並非不利, 犯之少亡冷退 (not 用之非不利 /
犯之主凶冷退) · 六月建未日 犯之招時氣瘟疫、損人失舊物 · 六月危寅日 鬼神空宅 (not 空亡), 進絕戶之
產業 · 八月定丑日 故此四日 (not 數日), 質之高明以爲何如 · 十二月建丑日 乃又煞入中宮 (not 六煞).

Transcription confidence: the print readings are glyph-level readings of vertical, right-to-left
Republican lithograph and Qing woodblock faces. Characters flagged for a second pass before display:
五月定戌日 「與/興工動土」 · 八月定丑日 final clause 「惟乙丑核…」 (runs onto the next column) ·
六月危寅日 「家業與/興旺」 · 十一月成申日 「在江湖選擇時日」 word order.

## 8.7 Revised gate status

| Gate | Before | After |
|---|---|---|
| Recension-independent witness located | ✗ none | ✅ **two pre-modern printed witnesses**, independence proved by fingerprint divergence + content the recension lacks |
| Printed-edition spot-check, ≥36 cells stratified | ✗ not run | ✅ **run at 316 cells / 68 groups / 12 months / all 8 rating levels** |
| Spot-check **passed** | — | ❌ **FAILED — 15.8% mismatch, 27 of 68 groups affected** |
| Derived scalar is safe to display | ✗ | ❌ still ✗, for a **new and better-evidenced reason** |

**Ship verdict: DO NOT SHIP the scalar rating axis.** The §6 blocker ("we only have one recension")
is now resolved — but the spot-check it was gating replaced it with a harder blocker: the
derivation itself is wrong at roughly one cell in six, and wrong in ways provable against the
draft's own sources. Shipping 673 cells of which ~15.8% invert or mis-tier the classical reading
would be worse than shipping nothing.

**Stage 1 (§6.1 — display the commentary cell, not a scalar) is now BETTER supported than before**
and is the recommended path. We can cite two pre-modern printed editions rather than three
anonymous web transcriptions, we can print the corrected readings from §8.6, and the officer
formula in `src/engine/tongshu.ts` still reproduces the printed officer labels 144/144.

### Why the draft JSON was not edited

Per the second-pass brief, `dong-gong-draft.json` was left **byte-for-byte unchanged**. The 50
mismatches are recorded above as **demotion candidates**, not applied. That is also the right call
on the merits: the failure is a systematic defect in the extractor, so the fix is to rewrite the
derivation (specifically: parse the "餘X日…" residual clause, tokenise 不吉/不能見吉 as negations
before matching 吉, and bind each clause to the stems it actually names) and regenerate — not to
hand-patch 50 cells and leave the same bug generating the other 357 untested ones.

### Next gate, if the scalar is ever revived

1. Rebuild the extractor against the six defect classes in §8.5; regenerate the grid.
2. Re-run this same 316-cell spot-check against the print. Target: **zero** mismatches of the
   "contradicts an explicit statement about this stem-branch" kind.
3. Only then consider display — and even then, labelled as *our* derivation from the classical
   commentary by stated rules, never as the classical text's own rating.

### Second-pass working files (reproducibility)

Scratchpad `…/4e05047a-f7f3-46d7-ba11-fd136cc5a69b/scratchpad/`: `nlc416.pdf` (witness A, 2.0 MB),
`nlc892.pdf` (witness B, 40 MB), `ntl.pdf` (Taiwan NL copy of witness A's edition), `extract.py`
(PDF image-stream extractor), `img/` + `png892/` (rendered pages), `diancang.txt` (stored online
source used for the dependence grep), `tally.py` (the 68-group adjudication table behind §8.4).
Page mapping for witness A: **scan image index = printed page number + 12** (image p013 =
printed p.1 = 正月建寅). Scratchpad files are session-scoped and will not survive; the two Wikimedia
PDF URLs are the durable pointers.

---

# 9. Third pass (2026-07-26): the derivation was rebuilt, and re-adjudicated

§8.7 set a gate: *rebuild the extractor against the six defect classes in §8.5, regenerate, and
re-run the spot-check at zero contradiction-class mismatches.* The rebuild was done. Three
independent verifiers examined it through different lenses, and this section is the adjudication —
every contested claim below was re-settled by this adjudicator directly against the primary
sources (the printed-witness transcriptions in the hunt output, and the extractor source), not by
averaging the three reports.

**Verdict up front: the rebuild is a large and genuine repair — it eliminated every polarity
inversion in the independent sample — but it bought that accuracy by halving coverage, and it
introduced a new class of defect that is worse for this product than a wrong rating: it makes
false claims about its own provenance. The scalar rating axis stays unshipped. The recommended
path is now, more firmly than in §6.1, to ship the CELL TEXT and not a scalar.**

## 9.1 What the rebuild changed

New files (research only; nothing under `src/` was touched, and `dong-gong-draft.json` is
byte-for-byte unmodified — SHA-256 `4d4a8a86…c47cea6` identical between `HEAD` and the working
tree, re-verified by this adjudicator):

- `docs/research/dong-gong-extract.mjs` — a deterministic, re-runnable from-scratch replacement
  for the v1 derivation. Every rule carries an in-file comment naming the §8.5 class it answers.
- `docs/research/dong-gong-draft-v2.json` — 386 cells kept, 39 dropped, per-cell provenance.
- `docs/research/dong-gong-witness-corpus.json` — snapshot of the witness transcriptions so the
  script outlives the session scratchpad.

The architecture is the right one. A cell is a BASE clause plus clauses **bound to the stems each
names**, optionally closed by a residual 「餘X日…」 clause scoped to the stems named nowhere else in
the cell. Negations are tokenised and physically removed before any 吉/凶 scan. Generic almanac
stars that head a cell (天賊, 往亡, 黃沙, 紅沙, 天富, 到州星, 勾絞, 朱雀, 天瘟, 月厭) are never
verdicts. MIXED requires a praised activity **and** an activity-scoped prohibition in the same
stem's clause. Anything unresolvable is dropped. Those are exactly the corrections §8.5 asked for.

## 9.2 The new numbers, beside the old 15.8% — coverage and accuracy stated together

These two numbers must never be quoted apart. The rebuild traded one for the other, and either one
alone misrepresents it.

| | v1 (`dong-gong-draft.json`) | v2 (`dong-gong-draft-v2.json`) |
|---|---|---|
| **Coverage** — ganzhi cells rated | **673 / 720 = 93.5%** | **386 / 720 = 53.6%** |
| Native (month × day-branch) cells with any rating | 144 / 144 | 84 / 144 |
| **Accuracy** — §8.4 spot-check convention (contradicts an explicit statement about that stem) | **15.8% mismatch** (50 / 316) | **≈2.4% mismatch** (4 / 170 on independent hand re-derivation; **0 / 33** on this adjudicator's own check) |
| Accuracy — strict exact-tier agreement | not measured this way | **80.0%** (136 / 170); strict mismatch 18.2% |
| **Polarity inversions** in the independent 36-slot sample | **9 of 36 (25%)** | **0** |
| Exact agreement in that same 36-slot sample | 21 / 36 | 27 / 33 present (3 absent) |

The 36-slot check in the last two rows is this adjudicator's own, and it is not circular: the
per-ganzhi witness ratings it scores against were recorded by the witness reader **before v2
existed**, inside the hunt output, as `witness: X | draft: Y | MATCH/MISMATCH` lines written
against v1. Scored against v2 they give 27 exact, 6 acceptable (same-polarity, one tier apart),
**0 polarity conflicts**, 3 absent. Scored against v1 the same 36 lines give 21 exact, 6
acceptable and **9 polarity conflicts** — 正月滿辰 甲辰 大凶→v1 平, 正月危酉 丁酉 吉→v1 大凶,
二月定午 甲午 MIXED/凶→v1 吉, 十一月成申 庚子 次吉→v1 平, 八月建酉 乙亥 大吉→v1 平,
十一月建子 甲子 凶→v1 平, and three more. That is the §8.5 diagnosis confirmed a third time, and
its repair confirmed for the first time.

**Read the table as one sentence:** *v2 is right about roughly nineteen days in twenty where it
speaks at all, and it declines to speak about nearly half the year.* v1 was wrong about one day in
six and spoke about ninety-four per cent of them. Neither is shippable as a scalar, for opposite
reasons.

Coverage is also **uneven by month**, which matters for a product: 三月 77%, 正月 67%, 二月 67%,
九月 65%, 四月 57%, 十月 50%, 十一月 50%, 七月 48%, 五月 43%, 八月 42%, 十二月 40%, 六月 38%.
A user asking about a day in 六月 gets "no opinion" three times in five, for reasons that have
nothing to do with the text being harder there.

Witness support behind the 386 kept cells, since "two printed witnesses" overstates it per cell:
**210 rest on `nlc416` alone, 25 on `nlc892` alone, 151 on both**. So 235 of 386 rest on a single
witness, and 25 of those on an attribution the file itself calls probable rather than proven.
Of the 161 cells reporting `corroboratingReadings > 1`, **41 are corroborated only by a second
transcription of the same print.**

## 9.3 Which of the six §8.5 defect classes are genuinely closed

Verified cell-by-cell against the named exemplars in §8.5 and the printed text.

| Class | Status | Evidence |
|---|---|---|
| **#1 Residual 「餘X日…」 unbound** | ✅ **CLOSED** | 八月執寅日 丙/戊/壬寅 大凶→**次吉**; 九月執卯日 丁/癸卯 大凶→**次吉**; 十月危午日 戊/庚/壬午 大凶→**次吉**; 六月除申日 戊申 MIXED→**大吉**. Scoping is computed over the whole cell, so 九月破辰日's 餘辰 correctly excludes the 戊辰/甲辰 named after it. |
| **#2 `吉` matched inside a negation** | ✅ **CLOSED** | 三月收丑日 乙/己/辛丑 吉→**凶**; 正月滿辰日 丙/庚辰 吉→**凶**; 八月危辰日 庚辰 吉→**凶**; 四月滿午日 丙午 →**平** on 「平常不能見吉」. Negations are removed longest-first before any scan, so the 吉 inside 不吉 cannot survive. |
| **#3 One marker dominating a cell** | ✅ **CLOSED** | 十一月成申日 壬申 平→**大吉**; 十二月除寅日 庚寅 平→**大吉**; 五月成寅日 丙寅 平→**大吉**; 六月執子日 戊子 大凶→**次吉**. |
| **#4 False MIXED** | ⚠️ **HALF-CLOSED — precision yes, recall no** | Every MIXED cell in v2 is well-formed (both a praised and a forbidden activity; a universal 百事不宜 can never be MIXED). But MIXED is now systematically *under*-detected — see class **E** below. |
| **#5 Polarity / severity inversion** | ⚠️ **PARTLY** | The 更凶 / 更加凶險 escalator works and `severityRankInCell` preserves ordering when tiers saturate. But new one-tier severity **under**-reads appeared in new places — classes **D** and **F** below. |
| **#6 Over-rating a disputed cell** | ✅ **CLOSED (with a caveat on the stated reason)** | All five stems of 八月定丑日 are refused. The refusal is correct. The recorded reason — "the text declines to settle it" — is only true of 乙丑, whose 「惟乙丑核…」 runs off the column. For 丁/己/辛/癸丑 the text *does* settle it: 「故此四日總以不用方爲穩善」 is a verdict (avoid), and 「況己丑更有十惡之凶」 orders 己丑 worst. Dropping stays correct; the same rule will over-drop wherever a source adjudicates a dispute **and then concludes**. |

## 9.4 New defect classes found in v2

The most serious findings are not about ratings. They are about the file making **claims about its
own sources that are false** — which, in a grid whose entire defensibility is per-cell provenance,
is the more expensive kind of error.

**A. "Printed witnesses disagree" is asserted where there is no witness disagreement. (blocker)**
`dong-gong-extract.mjs:914` drops a stem whenever two readings' derived ratings differ, with the
reason `printed witnesses disagree (…)`. It compares ratings only — **witness identity is never
consulted**, though `reading.witnesses` is in hand. Of the six such drops, **five are not witness
disagreements**:

- 五月滿申日 甲/丙/戊/庚申 (4 slots) — *both* readings are `nlc416-wenming`. This adjudicator
  verified their texts are **character-identical once punctuation is removed**; they differ only in
  where the printed sentence dots fall (`天富天喜。甲申…` vs `天。富天喜。甲申…`).
- 七月定子日 丙子 — three readings vote 吉 / 大吉 / 大吉. The two agreeing include the second
  witness; the lone dissenter is a *shorter transcription of the same print* as one of them, whose
  text simply stops before 「出行入宅興工動土大吉」.

Only **六月除申日 壬申** is a real cross-witness divergence — `nlc416` reads 「惟丙申一日五行無氣
不可用」 (so 壬申 falls under 「餘申日亦大吉」) while `nlc892` reads 「惟丙申。壬申五行無氣不可用」.
That one drop is correct and should keep its label. The other five drops are safe; their recorded
reason is false and it hides the real cause.

**B. A documented provenance gate is not implemented. (blocker)** Line 901 reads
`const usable = tagged.length ? perReading : perReading;` — both ternary branches identical, and
`tagged` computed and never used. Line 444's comment says an untagged ("inferred") reading is
"never used as the sole basis for a cell — see `soleBasis` gate below"; `grep -n soleBasis` returns
**only that comment**. The gate does not exist. Consequently **25 kept ganzhi cells rest solely on
`nlc892-1898` by inferred attribution**. The per-cell flag is emitted, so the caveat is visible —
but the code claims to apply a gate it does not apply.

**C. Segmentation sensitivity — measured. (major)** MIXED detection depends on where the printed
sentence dots fall. This adjudicator quantified the blast radius by re-running the extractor on a
corpus with every 。、， stripped: **5 of 386 ratings change (1.3%)** — MIXED→平 ×2, MIXED→大凶,
MIXED→吉, 次吉→MIXED — and the four 五月滿申日 stems stop disagreeing and are kept. So the effect is
real but bounded at low single digits. Its significance is not the 1.3%: it is that the
"witnesses must agree exactly" keep-rule, and the `corroboratingReadings` field, are both partly
measuring **extractor instability rather than source evidence**. `normaliseWitnessText` (line 352)
exists specifically to prevent this and its synthetic-break list does not cover 次吉 / 俱.

**D. The permission-idiom family is handled incoherently, and can outrank stated harm. (major)**
`SCALARS` maps 可用 / 之日可用 / 用之無妨 / 小小急用 / 小小營爲則可 to 平, the scalar branch runs
*before* the stated-harm branch, and the "worst scalar wins" safeguard splits on
`tierIdx(t) <= tierIdx('凶')` — where `tierIdx('平') = 2 > tierIdx('凶') = 1`, so **平 is classified
as a positive scalar** and the safeguard never engages. Result, 六月破丑日 乙/己/辛丑 = **平
(Neutral)** on text that reads 「此日無吉星不可營為萬不得已須擇時僅作小小急用。若起造開張出行婚姻
等事。主損六畜招官司」 — no auspicious star, must not undertake, and if you do: loss of livestock
and lawsuits. The harm sentence is never reached. Conversely at 四月閉辰日 丙辰/壬辰 the *same*
idiom family 「小小營爲則可。不宜婚姻起造移徙開張大作用也」 yields **MIXED**, discarding the 平 the
same table assigns it. So the idiom wins over harm in one cell and loses to MIXED in another. §4's
own vocabulary list names 小小營為則可 as the neutral band; this collision needs an explicit
precedence decision, not a silent one. Eight further cells report `basis:"explicit-scalar"` when
their only marker is a permission idiom the code's own comment (line 264) says is "never a positive
tier".

**E. Scoped prohibitions are collected same-sentence-only, so MIXED is under-detected. (major)**
`readClause` pushes forbidden activities from the sentence containing the negation and no other,
while praise walks *backward* across sentences. At 十二月定巳日 癸巳 the clause is 「…或可用開山斬草
之事。乃次吉之日。若娶親開張出行入宅定磉拴架。卻是天上大空亡納音已絕。不宜用也」 — the 不宜 sits two
sentences after its activity list, so the forbidden list is empty and v2 emits a flat **次吉**,
silently discarding the text's explicit prohibition on marriage, opening, travel, moving in and
beam-raising. `normaliseWitnessText:361` inserts a synthetic 。 before 若, actively manufacturing
the split. This is the recall half of §8.5 #4.

**F. A cell-level verdict standing after the last named stem reaches no stem at all. (minor, 4
slots)** 二月破酉日 prints 「…小口疾病。辛酉正四廢更凶。此日乃月破大凶之日。」 — 此日 ("this day") is a
statement about the whole cell. v2 gives 辛酉 = 大凶 from 「正四廢更凶」 and 乙/丁/己/癸酉 = 凶 from a
base clause that stops at 小口疾病. The explicit 「大凶」 verdict reaches **nobody**. One instance
today; it will recur as the remaining native cells are transcribed.

**G. The drop ledger does not reconcile. (minor, 10 slots)** 87 native cells have transcribed print
text in the hunt output; the corpus holds 85. `buildCorpus` discards a reading `if
(isTruncated(...))` and keeps a cell only `if (readings.length)`, so **二月定未日** and
**十一月執巳日** — whose only transcriptions are truncated — vanish into neither the grid nor
`_meta.dropped`. The discard is *correct* (the truncation rule is right: a text that stops mid-cell
cannot scope a residual clause). The silence is not. 10 slots leave the accounting without a trace.

**H. Documentation misstatements. (minor, but they are the numbers a reviewer quotes)**
`_meta.coverage.note` says 59 native cells lack printed text; `_meta.shipStatus` in the same file
says 57. The rebuild's summary says "8 cells rest on a witness attribution that is probable rather
than proven"; the file carries `witnessAttribution:"inferred"` on **25**. And
`dong-gong-witness-corpus.json` is billed as a verbatim snapshot but has the `OCR_FIXES` table
applied before it is written (22 of 125 readings differ from the raw hunt text) — legitimate reader
errata in every case checked, **except** 與工→興工 at 五月定戌日, which §8.6 explicitly lists as
needing a second pass against the images, and which is an ACTIVITIES token, so it can change a
praised/forbidden list and therefore MIXED.

**I. The 27-check self-test suite is a regression harness for §8.5, not validation. (minor)**
21 of its 27 checks are keyed to §8.5's six classes and their named example cells. It reports
**27/27 PASS** on the shipped corpus *and* 27/27 on the dot-stripped corpus that changes five
ratings — this adjudicator ran both. It detects none of A–H. Its two general invariants test
MIXED's well-formedness but never its recall, which is exactly defect E.

## 9.5 The two flagged judgement calls — rulings

The rebuild flagged two of its own choices for challenge. Both were re-checked against the printed
text.

**(a) 「大作大發」 → 大吉. RULING: UPHELD.** The formula occurs in exactly three corpus cells —
正月定午日, 四月危子日, 八月滿亥日 — and in all three the witness reader's own independently-recorded
rating line reads 大吉 (`大吉／永代吉昌`; `witness: 大吉`; `draft: all 午 = 大吉 — witness agrees`).
This is a fixed formula in a genre that uses fixed formulae, corroborated by a reading taken before
the mapping existed. Keep it, and keep the in-file comment that exposes it.

**(b) Praise-verb + activity + stated benefit, but no scalar word → 吉 (the floor of the praise
band). RULING: CORRECT AS A SAFETY RULE, DISQUALIFYING AS A PRODUCT RULE.** It is the right
direction to err — the independent re-derivation found 8 of its 31 strict mismatches were exactly
this pattern, every one an under-read, never an inversion — and all 14 cells carry
`basis:"praise-without-scalar"` so they can be listed and re-judged. But look at what it flattens:
八月危寅日 庚寅 reads 「天月二德。有黃羅紫檀天皇地皇金銀寶藏田塘庫珠聚祿帶馬鑾輿官曜眾吉星照臨。
宜起造婚姻動土移居開張出行。旺田產。進橫財。增六畜。添人口。興子孫。」 — the single most emphatic
praise register the text has — and is graded **吉**, its weakest positive tier. Showing a user "吉"
on a day the source stacks eleven benefic stars on is a distortion in the opposite direction from
v1's, and one the user cannot see. The rule is honest; the *scalar* is what cannot carry it. This
is an argument for shipping the cell text, where the eleven stars are simply visible.

**(c) A collision the rebuild did not flag.** 平 ("Neutral / small matters only") and MIXED are
both satisfied by the 小小營爲則可 idiom — see defect **D**. This was resolved silently in the code
and must be resolved explicitly in the ruleset.

## 9.6 The 85-of-144 shortfall is a TRANSCRIPTION problem, not an acquisition problem — correction

The v2 file states that the 59 untranscribed native cells "were never read from the prints". **This
is not what happened, and the correction makes the remaining gate much cheaper.** The witness
reader's own method note in the hunt output says:

> "Witness A (文明書局): I read scan images p013–p042 = the complete 12-month day section, all 144
> (month × officer/branch) cells. The 46 cells reported in `cells` are a stratified sample… The
> remaining ~98 cells are **legible in the same rendered pages and can be transcribed on demand**."

A second reader reports parsing 130 of 144 cells out of OCR, with "14 of 144 lost to
page-break/garbled headers, **not to absence**".

This adjudicator confirmed the material is still in hand: `nlc416.pdf` (2.0 MB), `nlc892.pdf`
(40 MB) and `ntl.pdf` are on disk alongside 228 + 78 + 71 rendered page images, and both PDFs have
durable Wikimedia Commons URLs recorded in §8.1.

**So: the printed witnesses cover 144 of 144 native cells. Our structured transcription covers 85.**
No book needs to be bought, no library visited, no new edition located — the acquisition gate that
§6 set and §8.1 closed stays closed. What remains is reading roughly 59 more cells off page images
we already hold and exporting them in the same verbatim form. That is bounded, unglamorous
transcription labour, and describing it as a sourcing limit points the next gate at the wrong work.

## 9.7 Revised gate

| Gate | §8.7 status | Now |
|---|---|---|
| Recension-independent witness located | ✅ | ✅ unchanged — two pre-modern prints |
| Printed-edition spot-check ≥36 cells stratified | ✅ | ✅ re-run twice more (170-slot hand re-derivation; 36-slot independent witness-rating check) |
| Spot-check **passed** (contradiction-class mismatches) | ❌ 15.8% | ⚠️ **≈2.4%, and 0 polarity inversions — but not the zero §8.7 demanded, and measured on ~half the grid** |
| Grid **covers** the year | ✅ 93.5% (wrongly) | ❌ **53.6%**, unevenly (38%–77% by month) |
| Provenance claims are true | not tested | ❌ **NEW FAILURE** — 5 of 6 "witnesses disagree" drops are not disagreements; a documented sole-basis gate is absent; 41 "corroborated" cells are one witness read twice |
| Derived scalar safe to display | ❌ | ❌ **still no** |

### Ship verdict

**DO NOT SHIP THE SCALAR RATING AXIS.** Not because the rebuild failed — it succeeded at what
§8.7 asked — but because what it revealed is that the scalar cannot be made honest at acceptable
cost. To be right, the derivation must decline to speak about half the year; to speak about the
whole year, it must guess. And the scalar is *ours* either way: 「大作大發」→大吉 and
praise-without-scalar→吉 are our judgement calls, defensible and documented, but they are not the
classical text's own rating, and a five-point badge cannot carry that distinction to a user.

**SHIP THE CELL TEXT, NOT A SCALAR — this is now the recommended end state, as §6.1 predicted.**
Three tiers, in descending readiness:

1. **Day Officer pairing (建除十二值) — ready now.** `officerIndex = (dayBranch − monthBranch) mod 12`
   in `src/engine/tongshu.ts` reproduces the printed officer labels **144/144** against both
   witnesses. Nothing blocks this.
2. **Classical commentary text for the 85 transcribed cells — ready after §8.6 closes.** Display
   the cell's verbatim print text with the day's ganzhi highlighted where the text names it,
   labelled *"董公選要覽 — classical almanac cross-check, transcribed from two pre-modern printed
   editions (1898 woodblock; 1926 文明書局 lithograph)"*. It must be silent, and visibly silent
   ("this edition has no text for this day in our transcription"), for the other 59. Preconditions:
   the §8.6 variant list adjudicated, and the four glyphs flagged there re-read against the images —
   including 與/興工 at 五月定戌日, which the corpus currently resolves silently.
3. **Per-day scalar — blocked.** See below.

### What would have to become true to ship the scalar

All six, and the first three are the real ones:

1. **Provenance claims must be true.** Compare `reading.witnesses` before emitting "printed
   witnesses disagree"; implement the `soleBasis` gate that line 444 promises or delete the promise;
   rename `corroboratingReadings` to distinguish a second witness from a second transcription of the
   same print. Until then the file's evidence claims cannot be relied on, and that — not any single
   rating — is what would damage the app.
2. **Coverage must reach the whole year, from the pages already in hand.** Transcribe the remaining
   ~59 native cells off `nlc416`/`nlc892` and regenerate. Anything below full coverage ships a
   product that shrugs at 46% of days, worst in 六月 and 十二月.
3. **Defects D and E must be closed, and the 平/MIXED precedence decided in the ruleset**, not left
   to branch order. A day the text says has no auspicious star and brings lawsuits must not read
   "Neutral".
4. **The self-check suite must test recall, not just the six §8.5 classes** — at minimum: no clause
   containing an activity-scoped 不宜/不利 may yield a scalar with an empty forbidden list; and the
   grid must be invariant under punctuation perturbation of the corpus.
5. **F and G closed**: cell-level 此日/是日 verdicts routed to the base; every available slot
   accounted for in `_meta.dropped`, including truncation discards.
6. **Then re-run §8.4's 316-cell spot-check against the images at zero contradiction-class
   mismatches**, on the full-coverage grid — and even then label it *our derivation from the
   classical commentary by stated rules*, never the classical text's own rating.

Note what is **not** on that list: acquiring a source. §8.1 closed that gate and §9.6 confirms it
stays closed. Every remaining item is our own engineering and our own transcription labour.

### Files (third pass)

- `docs/research/dong-gong-extract.mjs` — the rebuilt derivation. Re-runnable:
  `node docs/research/dong-gong-extract.mjs`. Note it **prefers the session hunt output over the
  corpus snapshot** when that path exists and silently overwrites the snapshot; the snapshot is a
  fallback, not the input of record.
- `docs/research/dong-gong-draft-v2.json` — 386 kept / 39 dropped, per-cell clause, markers,
  witnesses, attribution and `printVsOnline`.
- `docs/research/dong-gong-witness-corpus.json` — witness transcriptions with `OCR_FIXES` applied
  (see defect H — it is not the pre-emendation text).
- `docs/research/dong-gong-draft.json` — **v1, still byte-for-byte unmodified** (SHA-256
  `4d4a8a86ac…c47cea6`, verified identical to `HEAD`). It is kept as the evidence that the first
  derivation was wrong, not as a fallback.
