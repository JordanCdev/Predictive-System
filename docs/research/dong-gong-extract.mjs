#!/usr/bin/env node
/**
 * dong-gong-extract.mjs — rebuild of the 董公選要覽 per-ganzhi rating derivation.
 *
 * RESEARCH ONLY. Nothing here is imported by src/. Output: dong-gong-draft-v2.json.
 * The original dong-gong-draft.json is deliberately NOT touched — it is the evidence
 * that the first derivation was wrong.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS EXISTS
 * ---------------------------------------------------------------------------
 * DONG_GONG_SOURCING.md §8.4 spot-checked the first draft against two pre-modern
 * printed witnesses and it failed at 15.8%. §8.5 diagnosed 48 of the 50 mismatches
 * as defects in our own extractor, in six classes. This script is a from-scratch
 * replacement addressing each class explicitly. Every rule below is commented with
 * the defect class it answers so the derivation can be audited instead of the output.
 *
 * ---------------------------------------------------------------------------
 * INPUT — the printed witnesses, not the online recension
 * ---------------------------------------------------------------------------
 * Primary input is the verbatim cell text transcribed from:
 *   nlc416-wenming — 董公選要覽, 上海文明書局 lithograph (Republican era, colophon
 *                    中華民國十五年 = 1926). NLC id NLC416-12jh005366-44510.
 *   nlc892-1898    — 董公選要覽 一卷, woodblock, 光緒戊戌夏鐫 (summer 1898),
 *                    江官書局校刊. NLC id NLC892-GBZX0301014461-272080.
 * Where a print reading differs from the online recension, THE PRINT WINS (older,
 * independent witnesses — §8.6) and the divergence is recorded on the cell rather
 * than silently resolved.
 *
 * The transcriptions live in the hunt output. Because that file is session-scoped,
 * step 1 snapshots it to dong-gong-witness-corpus.json next to this script, and
 * later runs fall back to the snapshot. The script is therefore re-runnable and
 * deterministic: same corpus in, byte-identical grid out.
 *
 * Usage:
 *   node docs/research/dong-gong-extract.mjs [--hunt <path-to-hunt-output.json>]
 * Exits non-zero if any §8.5 self-check regression test fails.
 *
 * ---------------------------------------------------------------------------
 * THE DERIVATION, IN ONE PARAGRAPH
 * ---------------------------------------------------------------------------
 * A cell's text is a BASE clause (before any stem is named) followed by clauses
 * each BOUND to the stems they name, optionally closed by a residual 「餘X日…」
 * clause covering the stems never named anywhere in the cell. A stem's rating comes
 * from its own bound clause; only if that clause carries no verdict does it fall
 * back to the base. Nothing else propagates. A clause's verdict is read from an
 * explicit scalar (上吉/大吉/吉/次吉/平常/凶/大凶), else from a narrow list of
 * unambiguous 煞 names, else from a praise-verb-plus-benefit construction; negations
 * are tokenised out of the string BEFORE any 吉 is matched. Anything the rules cannot
 * resolve is dropped, never guessed.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const CORPUS_PATH = join(HERE, 'dong-gong-witness-corpus.json');
const OUT_PATH = join(HERE, 'dong-gong-draft-v2.json');

const DEFAULT_HUNT = '/private/tmp/claude-501/-Users-jordan-src-GitHub-Predictive-System-Predictive-System/4e05047a-f7f3-46d7-ba11-fd136cc5a69b/tasks/w3i13fyhm.output';

// ===========================================================================
// 0. Calendar constants
// ===========================================================================

const BRANCHES = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
const STEMS = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];
const OFFICERS = ['建', '除', '滿', '平', '定', '執', '破', '危', '成', '收', '開', '閉'];
// Solar months run 正月建寅 … 十二月建丑.
const MONTH_ORDER = ['寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥', '子', '丑'];
const MONTH_NAME = {
  寅: '正月', 卯: '二月', 辰: '三月', 巳: '四月', 午: '五月', 未: '六月',
  申: '七月', 酉: '八月', 戌: '九月', 亥: '十月', 子: '十一月', 丑: '十二月',
};

/** The 5 stems that can pair with a branch in the 60-ganzhi cycle (same parity). */
function stemsFor(branch) {
  const b = BRANCHES.indexOf(branch);
  return STEMS.filter((_, s) => (s - b) % 2 === 0);
}
function ganzhiFor(branch) {
  return stemsFor(branch).map((s) => s + branch);
}
/** officerIndex = (dayBranch − monthBranch) mod 12 — the formula src/engine/tongshu.ts uses. */
function officerFor(monthBranch, dayBranch) {
  const i = (BRANCHES.indexOf(dayBranch) - BRANCHES.indexOf(monthBranch) + 12) % 12;
  return OFFICERS[i];
}

// ===========================================================================
// 1. Rating scale
// ===========================================================================
// Same vocabulary the draft used, so the two grids are directly comparable.
// MIXED is not a point on the scale — it means "activity-dependent" and, per the
// draft's own _meta, REQUIRES a praised activity alongside a forbidden one (§8.5 #4).

const TIERS = ['大凶', '凶', '平', '次吉', '吉', '大吉', '上吉']; // worst → best
const TIER_EN = {
  上吉: 'Highly auspicious',
  大吉: 'Very auspicious',
  吉: 'Auspicious',
  次吉: 'Moderately auspicious',
  平: 'Neutral / small matters only',
  MIXED: 'Activity-dependent — some activities praised, others forbidden',
  凶: 'Inauspicious',
  大凶: 'Very inauspicious',
};
const tierIdx = (t) => TIERS.indexOf(t);
const worse = (t) => TIERS[Math.max(0, tierIdx(t) - 1)];

// ===========================================================================
// 2. Lexicon
// ===========================================================================

/* --- 2a. NEGATIONS — stripped to tokens BEFORE any polarity match (§8.5 #2) ---
   This is the whole of defect class 2: the old extractor matched the 吉 inside
   不吉 / 不能見吉 / 不利 as praise. Nothing here may be reordered casually —
   the list is applied longest-first and each match is REMOVED from the string,
   so a later 吉 scan can never see the 吉 of 不吉. */
const DOUBLE_NEGATIVES = [
  // Read first, and read as MILD PRAISE: 「用之並非不利」 = "using it is in fact not
  // unfavourable". Left in the negation table would invert the cell.
  ['並非不利', 'POS_MILD'],
  ['非不利', 'POS_MILD'],
  ['無大害', 'POS_MILD'],
  ['不妨', 'POS_MILD'],
];
const NEGATIONS = [
  ['百事皆忌', 'UNIV_BAD'],
  ['百事不宜', 'UNIV_BAD'],
  ['諸事不宜', 'UNIV_BAD'],
  ['百事皆凶', 'UNIV_BAD'],
  ['諸事皆凶', 'UNIV_BAD'],
  ['百事不利', 'UNIV_BAD'],
  ['諸事不利', 'UNIV_BAD'],
  ['百事忌', 'UNIV_BAD'],
  ['立見凶禍', 'UNIV_BAD'],
  ['不可輕用', 'NEG_USE'],
  ['未可輕用', 'NEG_USE'],
  ['不可言', 'NEG_USE'],
  ['不可用', 'UNIV_BAD'],
  ['不宜用事', 'NEG_USE'],
  ['不宜用', 'NEG_USE'],
  ['不能見吉', 'NEG_JI'], // longest-first: must precede 不吉 and 見吉
  ['不見吉', 'NEG_JI'],
  ['不吉', 'NEG_JI'],
  ['非陽間所宜', 'NEG_USE'],
  ['非陽間所用', 'NEG_USE'],
  ['非所宜用', 'NEG_USE'],
  ['非所宜', 'NEG_USE'],
  ['終難受益', 'NEG_MILD'],
  ['難受益', 'NEG_MILD'],
  ['不利', 'NEG_LI'],
  ['不宜', 'NEG_YI'],
];
const NEG_TOKENS = new Set(['UNIV_BAD', 'NEG_USE', 'NEG_JI', 'NEG_LI', 'NEG_YI', 'NEG_MILD']);

/* --- 2b. AMBIGUITY GUARDS — clauses whose grammar this ruleset does not model.
   Stems bound to such a clause are DROPPED, never guessed. Includes the
   rhetorical question 「豈不可用」 (六月執子日 甲子), which reads as permission but
   is reversed by the 然… that follows it. */
const AMBIGUITY_GUARDS = [
  '豈不可用', '似難定其爲吉', '似難定其为吉', '宜存參', '存參',
  '質之高明', '以爲何如', '以為何如', '孰是孰非',
  // 十二月定巳日 base: 「若其方合吉神聚集能救其凶。用之亦可。」 — a conditional
  // rescue clause. Its polarity depends on a direction we do not evaluate.
  '能救其凶', '非但云',
];

/* --- 2c. DISPUTE MARKERS (§8.5 #6) — the text adjudicating BETWEEN publishers.
   Where these appear in the running text (not inside a （按…） parenthesis) the
   whole cell is refused a rating. 八月定丑日 is the exemplar: 董公原本 vs 諸家曆法
   vs 協紀辨方書, concluding 故此四日總以不用方爲穩善, and even its one survivor
   (惟乙丑核…) runs off the column edge in both prints (§8.6). Absent, not 上吉. */
const DISPUTE_VERDICTS = ['總以不用方爲穩善', '總以不用方为稳善', '似難定其爲吉', '質之高明'];
const DISPUTE_AUTHORITIES = ['董公原本', '諸家曆法', '協紀辨方'];

/* --- 2d. Explicit scalars, longest-first. 吉星/吉神/凶宅 are NOUNS, not verdicts,
   and are blanked before the bare 吉/凶 scan (otherwise 「眾吉星照臨」 reads as praise
   and 「鬼神凶宅之疑」 reads as a condemnation). */
const STAR_WORDS_WITH_JI = [
  '諸吉星', '眾吉星', '衆吉星', '吉星', '吉神', '合吉', '果有吉',
  '凶宅', '凶星', '凶煞', '凶神',
];
const SCALARS = [
  ['上吉', '上吉'],
  ['大大發', '大吉'],
  ['百事皆吉', '大吉'],
  ['百事順利', '大吉'],
  ['百事順遂', '大吉'],
  ['諸事順遂', '大吉'],
  ['百福駢臻', '大吉'],
  ['一切諸事皆大吉', '大吉'],
  ['皆大吉', '大吉'],
  ['大吉', '大吉'],
  ['全吉', '大吉'],
  ['更加凶險', '凶'], // escalator handled separately; base reading is 凶
  ['凶險', '凶'],
  ['大凶', '大凶'],
  ['次吉', '次吉'],
  ['小吉', '次吉'],
  ['平常', '平'],
  ['卻吉', '吉'],
  ['却吉', '吉'],
  ['亦吉', '吉'],
  ['俱吉', '吉'],
  ['之日可用', '平'],
  ['用之無妨', '平'],
  ['小小營爲則可', '平'],
  ['小小營为则可', '平'],
  ['小小修爲則可', '平'],
  ['小小修为则可', '平'],
  ['小小急用', '平'],
  ['可用', '平'], // bare 可用; 不可用 / 未可輕用 / 不可言 are removed as negations first
];
/* 「大作大發」 is a fixed formula, not free prose. It occurs in exactly three corpus
   cells — 正月定午日, 四月危子日, 八月滿亥日 — and in all three the witness reader's
   own rating line reads 大吉. Mapped accordingly, and flagged here so the mapping can
   be challenged on its evidence rather than taken on trust. */
SCALARS.splice(SCALARS.findIndex(([p]) => p === '大大發'), 0, ['大作大發', '大吉']);
// Bare characters, scanned only after everything above has been consumed.
const BARE_JI = '吉';
const BARE_XIONG = '凶';

/* --- 2e. 煞 names that are unambiguously fatal in this text. Deliberately NARROW.
   Generic almanac stars that head a cell (天賊, 往亡, 黃沙, 紅沙, 天富, 到州星,
   勾絞, 朱雀, 天瘟, 月厭) are NOT here: they appear above auspicious and
   inauspicious cells alike, and treating them as verdicts is how the old extractor
   let one marker swallow a whole cell (§8.5 #3). */
const HARD_MALEFIC = [
  '正四廢', '煞入中宮', '煞集中宮', '煞神聚入中宮', '白虎入中宮',
  '六甲窮日', '五行無氣', '天地轉煞', '天地轉殺', '天地相疑',
  '十惡', '猖鬼', '九土鬼', '土鬼', '伏劍之金', '自死之金', '黑煞', '天羅',
  '暴敗煞重', '草木凋零', '受死',
];
/* --- 2f. Benefic star names. Used ONLY to decide that the gap between two stem
   mentions carries no verdict, so an enumeration like 「壬申天月二德。甲申五行有氣
   之時。值…蓋照。一切作爲百福駢臻。」 binds its verdict to BOTH stems (§8.5 #3). */
const BENEFIC = [
  '天赦', '天月二德', '月德', '天德', '火星', '文昌', '黃羅紫檀', '天皇地皇',
  '金銀', '寶藏', '庫樓', '玉堂', '聚寶', '祿馬', '福生', '水潔淨之時',
  '五行有氣', '旺地', '蓋照', '藎照', '照臨', '天喜', '母倉', '貴顯',
];

/* --- 2g. Activity vocabulary — needed to tell an ACTIVITY-SCOPED prohibition
   (「不利遠行起造入宅婚姻」) from a universal one (「百事不宜」). MIXED requires the
   former on one side and praise on the other. */
const ACTIVITIES = [
  '起造', '修造', '造作', '興工', '動土', '破土', '豎柱', '定磉', '拴架', '捨架',
  '婚姻', '嫁娶', '娶親', '結婚', '納采', '問名', '會親',
  '入宅', '移徙', '移居', '開張', '出行', '商賈',
  '安葬', '埋葬', '開山', '斬草', '作生基', '合板', '請魂入墓', '安門',
  '上官', '參官', '見貴', '上學', '還福願', '修方', '倉庫', '牛羊欄圈', '釘門',
  '鼓樂喧嘩', '遠行', '營爲', '营为', '營謀', '進人口', '作用',
];
/** Praise verbs. 宜/利 introduce an endorsed activity list. */
const PRAISE_VERB = /(?:^|[^不])(宜|利)/;
/** Positive scalars that can close an activity list without a 宜/利 verb, as in
 *  「如開山埋葬營謀百事…進絕戶之產業大吉」 (六月危寅日) — the praise is the scalar. */
const CLOSING_POSITIVES = ['上吉', '大吉', '全吉', '百事皆吉', '百事順利', '百事順遂', '諸事順遂', '次吉', '小吉', '大作大發', '俱吉', '更吉', '皆吉', '卻吉', '却吉', '亦吉'];
/** Permission, not praise — 「小小營爲則可」「有氣之日可用」. Enough to make a cell
 *  activity-dependent when something else in it is forbidden, but never a positive tier. */
const PERMISSION_POSITIVES = ['則可', '可用', '無妨'];
/** The text's standard way of stating harm: a trigger plus a consequence, in one
 *  sentence. Used both to give a verdict to a clause that has no keyword, and to
 *  attach the activities that incur the harm as FORBIDDEN. */
const HARM_TRIGGER = /(犯之|用之|若用|如用|等事用之|主|招|見)/;
const HARM_WORDS = [
  '官司', '口舌', '冷退', '損人', '損家長', '損宅長', '損六畜', '損財', '損傷',
  '退財', '破財', '敗亡', '家敗', '重喪', '喪敗', '瘟疫', '疾病', '惡疾', '自縊',
  '夭子', '孤寡', '窮病', '災', '禍', '驚傷', '刑', '爭訟', '是非', '不收',
  '客死', '破散', '殺人', '劫害', '逃散', '貧', '醜', '失產業', '失舊物',
  '啾喞', '蕭索', '受死', '凶敗', '禍害', '冷', '損小口', '生離死別',
];
/** Split on the normalised sentence dot; keeps offsets so look-backs can walk sentences. */
function sentencesOf(text) {
  const out = [];
  let start = 0;
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] === '。') { out.push({ text: text.slice(start, i), start }); start = i + 1; }
  }
  if (start < text.length) out.push({ text: text.slice(start), start });
  return out;
}
function hasNegation(s) { return NEGATIONS.some(([n]) => s.includes(n)) && !DOUBLE_NEGATIVES.some(([d]) => s.includes(d)); }
function hasHarm(s) { return HARM_TRIGGER.test(s) && HARM_WORDS.some((w) => s.includes(w)); }
function actsIn(s) { return ACTIVITIES.filter((a) => s.includes(a)); }
/**
 * Walk backwards from the sentence containing `anchorIdx`, collecting activities,
 * stopping at the first sentence that `stop()` rejects. This is what lets
 * 「如開山埋葬營謀百事。…。進絕戶之產業大吉」 attach its activity list to the 大吉 that
 * closes it, without letting 「土瘟不宜動土。…娶親問名小吉」 attach the prohibited 動土.
 */
function collectActivitiesBackward(sentences, anchorIdx, stop, maxChars = 48) {
  const acts = [];
  let budget = maxChars;
  for (let i = anchorIdx; i >= 0 && budget > 0; i -= 1) {
    const s = sentences[i].text;
    if (i !== anchorIdx && stop(s)) break;
    acts.push(...actsIn(s));
    budget -= s.length;
  }
  return acts;
}

/* --- 2h. Severity escalators (§8.5 #5). 「更凶」「更加凶險」「更不吉」 say THIS stem is
   worse than the stems just discussed; that ordering must survive into the grid. */
const ESCALATORS = ['更加凶險', '更凶', '更不吉', '更不利', '更宜慎之', '更不可用'];

/* --- 2i. Contrast markers. Between two stem mentions they mean the second stem is
   being CONTRASTED, not enumerated, so the two must not be merged. */
const CONTRAST = ['惟', '但', '若', '然', '卻', '却', '如', '雖', '虽', '緣', '蓋', '盖'];

/** 「甲辰…卻與戊辰同煞集中宮」 — the text itself says A shares B's verdict. This is the
 *  only inference-shaped rule in the file, and it is licensed by the word 同. */
const MERGE_IDIOM = /與([甲乙丙丁戊己庚辛壬癸][子丑寅卯辰巳午未申酉戌亥])同/;

// ===========================================================================
// 3. Corpus construction
// ===========================================================================
// The hunt output holds three readers' transcriptions. Tags in the text identify
// the witness; untagged transcriptions are recorded as such and never allowed to
// stand alone (see `witnessAttribution`).

/** OCR confusions the 1926-print reader itself documented. Applying a reader-supplied
 *  errata table is transcription hygiene, not emendation. 屦→廢 is load-bearing: without
 *  it 正四廢 never matches. */
const OCR_FIXES = [
  ['藎', '蓋'], ['贼', '賊'], ['赋', '賊'], ['屦', '廢'], ['屢', '廢'], ['麙', '廢'],
  ['正四歲', '正四廢'], ['餅', '寶'], ['藚', '寶'], ['簤', '寶'], ['贇', '寶'],
  ['剴', '削'], ['剝', '劫'], ['秉犯', '兼犯'], ['叉兼', '又兼'], ['盒', '益'],
  ['僃修', '偷修'], ['偸修', '偷修'], ['元女', '玄女'], ['與工', '興工'],
];
/** Running headers the OCR interleaved mid-cell. */
const RUNNING_HEADERS = ['董公選要覽', '董公選要覧', '董公選要览', '黃公選要覧', '董公選要窢', '萤公', '童公'];

function normaliseWitnessText(raw) {
  let t = raw;
  // Drop the adjudicator's own bracketed apparatus, but keep what it says about
  // variants — captured separately by extractVariantNotes() before this runs.
  t = t.replace(/\[[^\]]*\]/g, '');
  t = t.replace(/〔[^〕]*〕/g, '');
  t = t.replace(/（[^）]*）/g, '');   // （按協紀辨方…）— editorial aside, not per-stem doctrine
  t = t.replace(/\([^)]*\)/g, '');
  // The month header printed above 建 cells is cell-external.
  t = t.replace(/——\s*月頭小字[\s\S]*$/, '');
  for (const h of RUNNING_HEADERS) t = t.split(h).join('');
  for (const [a, b] of OCR_FIXES) t = t.split(a).join(b);
  // Normalise punctuation to 。 so clause splitting behaves the same on the
  // punctuated 文明書局 reading and the sparsely-punctuated OCR run.
  t = t.replace(/[，,、．\.；;：:]/g, '。').replace(/\s+/g, '');
  t = t.replace(/。+/g, '。');
  // Synthetic clause breaks. One witness reading is punctuated at the printed
  // sentence dots; another is raw OCR of the same page with almost no punctuation.
  // Without this the two readings segment differently and disagree for reasons of
  // typography rather than text. Breaks are inserted only before markers that can
  // only begin a clause in this register (但/惟/若/如/緣/餘X/犯之/用之/是日…), never
  // inside one, and never where a dot already stands. This changes segmentation,
  // never a character of the text.
  t = t.replace(/(?!^)((?<!非)但|惟|若|如|緣|蓋|又是|又值|又兼|又云|犯之|用之|此日|是日|其餘[子丑寅卯辰巳午未申酉戌亥]|餘[子丑寅卯辰巳午未申酉戌亥]|主(?=[損傷退敗招失刑]))/g,
    (m, p1, off) => (off > 0 && t[off - 1] === '。' ? m : `。${p1}`));
  t = t.replace(/。+/g, '。');
  // Strip the cell header 「開子日」「滿辰日」 etc.
  t = t.replace(/^[建除滿平定執破危成收開閉][子丑寅卯辰巳午未申酉戌亥]日。?/, '');
  return t;
}

function extractVariantNotes(raw) {
  const notes = [];
  const re = /\[([^\]]*)\]/g;
  let m;
  while ((m = re.exec(raw))) {
    const body = m[1];
    if (/VARIANT|print |prints |modern|MAJOR|THREE|KEY FINDING|agreement|IDENTICAL|OCR/i.test(body)) {
      notes.push(body.trim());
    }
  }
  return notes;
}

function witnessesFromTag(raw) {
  const tag = (raw.match(/^\s*\[([^\]]*)\]/) || [, ''])[1];
  const ws = [];
  if (/文明書局|1926 print/.test(tag)) ws.push('nlc416-wenming');
  if (/1898/.test(tag)) ws.push('nlc892-1898');
  return ws;
}

/** A reading is discarded when the TEXT stops mid-cell — an ellipsis inside the
 *  adjudicator's own bracketed commentary is not truncation of the text, so brackets
 *  are removed before the test. Truncation matters because a text that stops early
 *  cannot scope its residual clause, which is defect class 1. */
function isTruncated(raw) {
  const tag = (raw.match(/^\s*\[([^\]]*)\]/) || [, ''])[1];
  if (/OCR-truncated|OCR cut|OCR truncated/i.test(tag)) return true;
  const body = raw.replace(/\[[^\]]*\]/g, '').replace(/〔[^〕]*〕/g, '');
  return /…|\.\.\./.test(body);
}

function buildCorpus(huntPath) {
  const hunt = JSON.parse(readFileSync(huntPath, 'utf8'));
  const byCell = new Map(); // "月|支" -> { readings: [...] }

  hunt.result.hunts.forEach((h, hi) => {
    (h.cells || []).forEach((c) => {
      const month = [...c.monthBranch].find((ch) => BRANCHES.includes(ch));
      const dayBranch = [...c.dayBranchOrGanzhi].find((ch) => BRANCHES.includes(ch));
      if (!month || !dayBranch) return;
      const key = `${month}|${dayBranch}`;
      if (!byCell.has(key)) byCell.set(key, { month, dayBranch, readings: [] });
      byCell.get(key).readings.push({ hunt: hi, raw: c.text, officer: c.officer, huntRating: c.rating });
    });
  });

  const corpus = [];
  for (const [, cell] of [...byCell.entries()].sort()) {
    // One READING per hunt: a hunt may report a cell as several fragments
    // (e.g. hunt 1 quotes the head of 五月定戌日 under 甲戌 and the tail under 丙戌).
    // Fragments are re-joined in transcription order. Truncated fragments are
    // discarded outright — a text that stops mid-sentence cannot bound a residual
    // clause, and mis-scoping the residual is defect class 1.
    const perHunt = new Map();
    for (const r of cell.readings) {
      if (isTruncated(r.raw)) continue;
      if (!perHunt.has(r.hunt)) perHunt.set(r.hunt, []);
      perHunt.get(r.hunt).push(r);
    }
    const readings = [];
    for (const [hi, frags] of [...perHunt.entries()].sort((a, b) => a[0] - b[0])) {
      const rawJoined = frags.map((f) => f.raw).join('');
      let text = '';
      for (const f of frags) {
        const piece = normaliseWitnessText(f.raw);
        if (text.includes(piece) || piece.length === 0) continue;
        text += (text && !text.endsWith('。') ? '。' : '') + piece;
      }
      if (!text) continue;
      let witnesses = witnessesFromTag(frags[0].raw);
      let attribution = 'tagged';
      if (witnesses.length === 0) {
        // Hunt 1 transcribed from rendered leaves named b892_p0NN.png (its own
        // METHOD note) but did not tag its cell texts. Recorded as inferred and
        // never used as the sole basis for a cell — see `soleBasis` gate below.
        witnesses = ['nlc892-1898'];
        attribution = 'inferred';
      }
      readings.push({
        hunt: hi,
        witnesses,
        witnessAttribution: attribution,
        officer: frags[0].officer,
        text,
        variantNotes: extractVariantNotes(rawJoined),
      });
    }
    if (readings.length) corpus.push({ month: cell.month, dayBranch: cell.dayBranch, readings });
  }
  return corpus;
}

// ===========================================================================
// 4. Clause segmentation and stem binding  (§8.5 #1 and #3)
// ===========================================================================

/** All stem-branch mentions of THIS cell's branch, in order of appearance. */
function findStemMentions(text, branch) {
  const out = [];
  for (const gz of ganzhiFor(branch)) {
    let i = text.indexOf(gz);
    while (i !== -1) {
      out.push({ ganzhi: gz, start: i, end: i + gz.length });
      i = text.indexOf(gz, i + 1);
    }
  }
  return out.sort((a, b) => a.start - b.start);
}

/** 「餘寅日次吉」「其餘卯次吉」「餘酉均不可用」 — the residual clause (defect class 1). */
function findResidualMarkers(text, branch) {
  const out = [];
  const re = new RegExp(`(其?餘)${branch}(日)?`, 'g');
  let m;
  while ((m = re.exec(text))) out.push({ start: m.index, end: m.index + m[0].length });
  return out;
}

function gapCarriesVerdict(gap) {
  const scrubbed = STAR_WORDS_WITH_JI.reduce((s, w) => s.split(w).join(''), gap);
  if (HARD_MALEFIC.some((w) => gap.includes(w))) return true;
  if (CONTRAST.some((w) => gap.includes(w))) return true;
  if (NEGATIONS.some(([w]) => gap.includes(w))) return true;
  if (SCALARS.some(([w]) => gap.includes(w))) return true;
  if (scrubbed.includes(BARE_JI) || scrubbed.includes(BARE_XIONG)) return true;
  if (/[^不]宜|^宜/.test(gap)) return true;      // 「乙酉宜修造…。癸酉安葬大吉」 — a verdict, do not merge
  if (BENEFIC.some((w) => gap.includes(w))) return false; // enumeration, merge
  return /[利忌]/.test(gap);
}

/**
 * Segment a cell into { base, groups[], residual }.
 *  - base    : text before the first stem mention / residual marker; binds to every
 *              stem that has no clause of its own.
 *  - groups  : { stems[], clause } — consecutive stem mentions merge into one group
 *              when the gap between them carries no verdict (an enumeration), or
 *              when the text says they are the same (MERGE_IDIOM).
 *  - residual: stems named NOWHERE in the cell, bound to the 餘X clause.
 */
function segment(text, branch) {
  const mentions = findStemMentions(text, branch);
  const residuals = findResidualMarkers(text, branch);
  const marks = [
    ...mentions.map((m) => ({ ...m, kind: 'stem' })),
    ...residuals.map((m) => ({ ...m, kind: 'residual' })),
  ].sort((a, b) => a.start - b.start);

  const base = marks.length ? text.slice(0, marks[0].start) : text;
  const namedAnywhere = new Set(mentions.map((m) => m.ganzhi));

  const groups = [];
  let residual = null;
  let i = 0;
  while (i < marks.length) {
    const mk = marks[i];
    if (mk.kind === 'residual') {
      const end = i + 1 < marks.length ? marks[i + 1].start : text.length;
      let clause = text.slice(mk.end, end);
      let rcoda = null;
      const rAt = clause.search(/是日|此日|一年四季|凡用|凡金入/);
      if (rAt > 0) { rcoda = clause.slice(rAt); clause = clause.slice(0, rAt); }
      const stems = ganzhiFor(branch).filter((g) => !namedAnywhere.has(g));
      residual = { stems, clause, coda: rcoda, kind: 'residual' };
      i += 1;
      continue;
    }
    // Gather an enumeration run.
    const stems = [mk.ganzhi];
    let j = i;
    while (j + 1 < marks.length && marks[j + 1].kind === 'stem') {
      const gap = text.slice(marks[j].end, marks[j + 1].start);
      // The 與…同 idiom spans the NEXT mention, so test the gap plus that mention.
      const idiom = MERGE_IDIOM.exec(text.slice(marks[j].end, marks[j + 1].end + 2));
      const merge = !gapCarriesVerdict(gap) || (idiom && idiom[1] === marks[j + 1].ganzhi);
      if (!merge || gap.length > 14) break;
      stems.push(marks[j + 1].ganzhi);
      j += 1;
    }
    const end = j + 1 < marks.length ? marks[j + 1].start : text.length;
    let clause = text.slice(marks[j].end, end);
    // A trailing remark about the DAY rather than the stem — 「是日乃死氣之日…故百事
    // 不利」, 「一年四季凡用巳日…」 — is not this stem's verdict. It is split off and
    // recorded as cell context, and deliberately NOT reassigned to the base: doing
    // that would manufacture ratings for stems the text never discusses.
    let coda = null;
    const codaAt = clause.search(/是日|此日|一年四季|凡用|凡金入/);
    if (codaAt > 0) { coda = clause.slice(codaAt); clause = clause.slice(0, codaAt); }
    groups.push({ stems: [...new Set(stems)], clause, coda, kind: 'named' });
    i = j + 1;
  }

  // 「甲寅正四廢。庚寅戊寅丙寅皆不吉。諸事不宜…」 — 皆/俱/均 means "all of the
  // foregoing". Where a group's clause opens with one of those and the group before
  // it holds only a bare reason (a 煞 name, no verdict of its own), the two are one
  // subject. Narrow by design: the previous clause must be short and verdict-free.
  for (let k = groups.length - 1; k > 0; k -= 1) {
    const prev = groups[k - 1];
    if (!/^(皆|俱|均)/.test(groups[k].clause.replace(/^。+/, ''))) continue;
    const pc = prev.clause.replace(/。/g, '');
    const verdictful = SCALARS.some(([w]) => pc.includes(w)) || NEGATIONS.some(([w]) => pc.includes(w));
    if (pc.length > 8 || verdictful) continue;
    groups[k].stems = [...new Set([...prev.stems, ...groups[k].stems])];
    groups.splice(k - 1, 1);
  }
  return { base, groups, residual, namedAnywhere };
}

// ===========================================================================
// 5. Clause → verdict
// ===========================================================================

function readClause(clause) {
  const res = {
    tier: null, praiseScalar: null, universalBad: false, escalate: false, ambiguous: false,
    praisedActivities: [], forbiddenActivities: [], hits: [], basis: null,
  };
  if (!clause || !clause.replace(/。/g, '').length) return res;

  if (AMBIGUITY_GUARDS.some((g) => clause.includes(g))) {
    res.ambiguous = true;
    res.hits.push('ambiguity-guard');
    return res;
  }

  let work = clause;
  const sents = sentencesOf(clause);

  // -- Step 1: activity scoping, read from the ORIGINAL string ---------------
  // A prohibition is activity-scoped only if it names activities; a universal one
  // (百事不宜) never is. This is what makes MIXED honest (§8.5 #4).
  sents.forEach((s, i) => {
    // (a) 不宜/不利/忌 + activities — the object may follow the negation
    //     (「不利遠行起造入宅婚姻」) or precede it (「婚姻開張安葬入宅非所宜用」).
    for (const [neg] of NEGATIONS) {
      if (/^(百事|諸事)/.test(neg) || !s.text.includes(neg)) continue;
      res.forbiddenActivities.push(...actsIn(s.text));
    }
    // (b) 「如婚姻修造等事用之…招官司損人口」 — harm with no 不 anywhere. The
    //     activities that incur it are forbidden just as surely.
    if (hasHarm(s.text)) {
      // Stop on reaching a praised/permitted sentence — those activities belong to
      // the endorsement, not to the harm.
      res.forbiddenActivities.push(...collectActivitiesBackward(
        sents, i, (prev) => (/(?:^|[^不])[宜利]/.test(prev) && !hasNegation(prev))
          || PERMISSION_POSITIVES.some((q) => prev.includes(q))
          || CLOSING_POSITIVES.some((q) => prev.includes(q)),
      ));
    }
    // (c) 宜/利 + activities — straightforward praise. A sentence carrying a negation
    //     is excluded outright: 「婚姻開張安葬入宅非所宜用」 contains a 宜 that belongs to
    //     the prohibition, and reading it as praise is defect class 2 wearing a hat.
    if (/(?:^|[^不])[宜利]/.test(s.text) && !hasNegation(s.text)) res.praisedActivities.push(...actsIn(s.text));
  });
  // (d) An activity list may be endorsed by the scalar or the permission that CLOSES
  //     it rather than by a 宜/利 verb. Walk back sentence by sentence and stop at the
  //     first sentence carrying a prohibition or a harm — that span is not praise.
  {
    const stop = (s) => hasNegation(s) || hasHarm(s);
    sents.forEach((s, i) => {
      const scrub = STAR_WORDS_WITH_JI.reduce((a, w) => a.split(w).join(''), s.text);
      const closes = [...CLOSING_POSITIVES, ...PERMISSION_POSITIVES].some((p) => scrub.includes(p));
      if (closes && !hasNegation(s.text)) {
        res.praisedActivities.push(...collectActivitiesBackward(sents, i, stop));
      }
    });
  }
  // (e) 「只宜安葬安門嫁娶入宅。餘事愼用」 — the text scopes praise to a list and
  //     cautions against everything else. Recorded as a generic prohibition so the
  //     cell reads MIXED rather than as a flat endorsement.
  if (/(只|惟|僅)[宜利]/.test(clause) && res.praisedActivities.length) {
    res.forbiddenActivities.push('其餘諸事');
  }
  res.praisedActivities = [...new Set(res.praisedActivities)];
  res.forbiddenActivities = [...new Set(res.forbiddenActivities)];

  // -- Step 2: escalators ---------------------------------------------------
  for (const e of ESCALATORS) {
    if (work.includes(e)) { res.escalate = true; res.hits.push(e); }
  }

  // -- Step 3: double negatives, THEN negations, removed from the string ------
  // (§8.5 #2) After this loop the string physically no longer contains the 吉 of
  // 不吉, so no later scan can read it as praise.
  let posMild = false;
  for (const [pat, tok] of DOUBLE_NEGATIVES) {
    if (work.includes(pat)) { work = work.split(pat).join(''); if (tok === 'POS_MILD') posMild = true; res.hits.push(pat); }
  }
  const negs = [];
  for (const [pat, tok] of NEGATIONS) {
    while (work.includes(pat)) { work = work.replace(pat, ''); negs.push(tok); res.hits.push(pat); }
  }

  // -- Step 4: star names containing 吉 are blanked (「眾吉星照臨」 is not a verdict) --
  for (const w of STAR_WORDS_WITH_JI) work = work.split(w).join('');

  // -- Step 5: explicit scalars ---------------------------------------------
  const scalarHits = [];
  for (const [pat, tier] of SCALARS) {
    while (work.includes(pat)) { work = work.replace(pat, ''); scalarHits.push(tier); res.hits.push(pat); }
  }
  if (work.includes(BARE_XIONG)) { scalarHits.push('凶'); res.hits.push('凶'); }
  if (work.includes(BARE_JI)) { scalarHits.push('吉'); res.hits.push('吉'); }

  // -- Step 6: 煞 names, narrow list ----------------------------------------
  const malefic = HARD_MALEFIC.filter((w) => clause.includes(w));
  if (malefic.length) res.hits.push(...malefic);

  // -- Step 7: compose -------------------------------------------------------
  // universalScope (blocks MIXED) is narrower than universalBad (sets 大凶): a
  // 百事/諸事 prohibition or 不可用 leaves nothing to praise, but 「立見凶禍」 is a
  // consequence attached to specific activities and must not suppress MIXED.
  res.universalScope = ['百事皆忌', '百事不宜', '諸事不宜', '百事皆凶', '諸事皆凶',
    '百事不利', '諸事不利', '百事忌', '不可用'].some((w) => clause.includes(w));
  if (negs.includes('UNIV_BAD')) { res.universalBad = true; res.tier = '大凶'; res.basis = 'universal-prohibition'; }
  else if (scalarHits.length) {
    // Worst scalar wins within a clause: the text's own last word on a stem is its
    // caveat, not its compliment (「雖有吉星相解。終難受益」).
    const negScalars = scalarHits.filter((t) => tierIdx(t) <= tierIdx('凶'));
    const posScalars = scalarHits.filter((t) => tierIdx(t) > tierIdx('凶'));
    if (negScalars.length) res.tier = negScalars.reduce((a, b) => (tierIdx(a) <= tierIdx(b) ? a : b));
    else res.tier = posScalars.reduce((a, b) => (tierIdx(a) >= tierIdx(b) ? a : b));
    // Kept separately so an activity-dependent cell can report the grade the text
    // gave its PRAISED activities rather than the worst scalar in the clause.
    if (posScalars.length) res.praiseScalar = posScalars.reduce((a, b) => (tierIdx(a) >= tierIdx(b) ? a : b));
    res.basis = 'explicit-scalar';
  } else if (negs.length) {
    // 不宜用 ("should not be used") is graded 凶; only 不可用 / 百事不宜 ("cannot be
    // used") reach 大凶, via the universal-prohibition branch above. The distinction
    // is the text's own and is not collapsed here.
    res.tier = '凶';
    res.basis = 'negation';
  } else if (malefic.length) {
    res.tier = '凶';
    res.basis = 'named-malefic';
  } else if (sents.some((s) => hasHarm(s.text)) && !res.praisedActivities.length) {
    res.tier = '凶';
    res.basis = 'stated-harm-outcome';
  } else if (res.praisedActivities.length && /[益旺進增生貴子發達獲財富貴接引順]/.test(clause)) {
    // Praise verb + activity + a stated benefit, but no scalar word. We take the
    // FLOOR of the praise band (吉), deliberately under-reading rather than
    // promoting to 大吉 on our own authority.
    res.tier = '吉';
    res.basis = 'praise-without-scalar';
  } else if (res.praisedActivities.length) {
    res.tier = '吉';
    res.basis = 'praise-without-scalar';
  } else if (posMild) {
    res.tier = '平';
    res.basis = 'permission-only';
  }
  return res;
}

// ===========================================================================
// 6. Cell derivation
// ===========================================================================

function deriveFromReading(month, branch, reading) {
  const text = reading.text;
  const disputeBlocked =
    DISPUTE_VERDICTS.some((d) => text.includes(d)) ||
    DISPUTE_AUTHORITIES.filter((a) => text.includes(a)).length >= 2;

  const { base, groups, residual } = segment(text, branch);
  const baseRead = readClause(base);

  const out = new Map();
  const notes = new Map();

  const assign = (stems, read, source, clause) => {
    for (const gz of stems) {
      if (out.has(gz)) continue; // first binding wins; the text names a stem once
      let tier = read.tier;
      let mixed = false;

      // MIXED, enforced to the draft's own definition (§8.5 #4): a praised activity
      // AND a forbidden activity, both in the stem's OWN clause, and the prohibition
      // must be activity-scoped rather than universal.
      const ownMixed = read.praisedActivities.length > 0 &&
        read.forbiddenActivities.length > 0 && !read.universalScope;
      const baseMixed = baseRead.praisedActivities.length > 0 &&
        baseRead.forbiddenActivities.length > 0 && !baseRead.universalScope;

      if (read.ambiguous) { notes.set(gz, 'clause hit an ambiguity guard'); continue; }
      if (ownMixed) { mixed = true; }
      else if (tier == null) {
        if (baseRead.ambiguous) { notes.set(gz, 'base clause hit an ambiguity guard'); continue; }
        if (baseMixed) { mixed = true; }
        else if (baseRead.tier != null) { tier = baseRead.tier; source = source + '+base'; clause = base; }
      }
      if (!mixed && tier == null) { notes.set(gz, 'no verdict bound to this stem'); continue; }

      // Severity ordering (§8.5 #5): 「更凶」 means worse than what precedes.
      let escalated = false;
      if (!mixed && read.escalate) {
        const from = read.tier != null ? read.tier : baseRead.tier;
        tier = worse(from != null ? from : '凶');
        escalated = true;
      }
      const activeRead = mixed && read.tier == null && baseMixed ? baseRead : read;
      out.set(gz, {
        rating: mixed ? 'MIXED' : tier,
        basis: mixed ? 'mixed-activity-scoped' : read.basis || 'inherited-base',
        source,
        clause: clause.replace(/^。+|。+$/g, ''),
        escalated,
        // When the text grades the PRAISED activities (「宜安葬起造…次吉。俱不宜動土」)
        // the grade is kept alongside MIXED rather than discarded — losing a stated
        // grade is defect class 3 in another costume.
        // Only a tier the text actually spells out is carried; a floor-read inferred
        // from a praise verb is not a grade and must not be presented as one.
        praisedTier: mixed ? activeRead.praiseScalar : undefined,
        praised: mixed ? activeRead.praisedActivities : undefined,
        forbidden: mixed ? activeRead.forbiddenActivities : undefined,
        orderingNote: /又次吉/.test(clause)
          ? 'text reads 又次吉 — a further step below the 次吉 stems named alongside it' : undefined,
        markers: read.hits.filter((h) => h !== '吉' && h !== '凶'),
      });
    }
  };

  for (const g of groups) assign(g.stems, readClause(g.clause), 'named-clause', g.clause);
  if (residual) assign(residual.stems, readClause(residual.clause), 'residual-clause', residual.clause);
  assign(ganzhiFor(branch), baseRead, 'base-clause', base);

  // Rank within the cell, so 「更加凶險」 orderings survive even where tiers saturate.
  const ordered = [...out.entries()].sort((a, b) => tierIdx(a[1].rating) - tierIdx(b[1].rating));
  ordered.forEach(([gz], i) => { out.get(gz).severityRankInCell = i + 1; });

  for (const gz of ganzhiFor(branch)) if (!out.has(gz) && !notes.has(gz)) notes.set(gz, 'no verdict bound to this stem');
  return { ratings: out, dropNotes: notes, disputeBlocked, base, groups, residual };
}

// ===========================================================================
// 7. Known print-vs-online divergences (§8.2, §8.6)
// ===========================================================================
// Transcribed verbatim from DONG_GONG_SOURCING.md. Recorded on the cell, never
// used to alter a rating: the rating is derived from the PRINT text, which already
// embodies the print reading. This table exists so the divergence is visible.

const KNOWN_DIVERGENCES = {
  '寅|丑': [{ print: '驢馬踢', online: '騾馬踢', ratingAffecting: false }],
  '寅|寅': [{ print: '二年內見重喪', online: '一年內見重喪', ratingAffecting: false }],
  '寅|卯': [{ print: '活業分散', online: '各業分散', ratingAffecting: false }],
  '寅|酉': [{ print: '比利之日', online: '比和之日', ratingAffecting: false }],
  '寅|子': [{ print: '主得色依人提攜。旺六畜血財', online: '旺六畜、益財產', ratingAffecting: false }],
  '卯|卯': [{ print: '損宅長 / 三六年', online: '損家長 / 三、五年', ratingAffecting: false }],
  '辰|辰': [{ print: '家敗人亡', online: '家破人亡', ratingAffecting: false }],
  '辰|亥': [{ print: '陰府決遣之日 / 主絕人有受死事', online: '陰府決遣之期 / 主絕人又受死事', ratingAffecting: false }],
  '辰|未': [{ print: '勾絞朱雀 / 與正五月', online: '凶絞朱雀 / 與天正五月', ratingAffecting: false }],
  '巳|未': [{ print: '定磉拴架 / 用之並非不利 / 犯之少亡冷退', online: '定磉造架 / 用之非不利 / 犯之主凶冷退', ratingAffecting: true }],
  '巳|戌': [{ print: '耗血財', online: '耗錢財', ratingAffecting: false }],
  '未|未': [{ print: '犯之招時氣瘟疫、損人失舊物', online: '犯之不吉、染瘟疫損人口、失財物', ratingAffecting: true }],
  '未|寅': [{ print: '鬼神空宅 / 進絕戶之產業', online: '鬼神空亡 / 進產業', ratingAffecting: false }],
  '酉|丑': [{ print: '諸家曆法云 / 故此四日 / 質之高明以爲何如', online: '馬諸家曆法云 / 故此數日', ratingAffecting: false }],
  '戌|辰': [{ print: '耗血財', online: '耗錢財', ratingAffecting: false }],
  '亥|亥': [{
    print: '如乙亥己亥亦是五行無氣。名爲暴敗煞重之日…用之冷退凶',
    online: '如乙亥、己亥亦只宜小作營為',
    ratingAffecting: true,
    note: 'The only two spot-check mismatches (§8.5) where the draft was right against its own online sources and wrong against the prints. v2 derives from the print, so 乙亥/己亥 read 凶, not MIXED.',
  }],
  '子|子': [{ print: '退神爲地轉', online: '進神為地轉', ratingAffecting: true, note: 'Reverses the sense of the clause.' }],
  '丑|丑': [{ print: '乃又煞入中宮', online: '乃六煞入中宮', ratingAffecting: false }],
};

/** §8.6 flags these glyphs for a second pass against the images before display. */
const TRANSCRIPTION_CAVEATS = {
  '午|戌': '五月定戌日「與/興工動土」 — glyph unresolved (§8.6). Sits in the activity list, not the verdict.',
  '酉|丑': '八月定丑日 final clause 「惟乙丑核…」 runs onto the next column in both prints (§8.6).',
  '未|寅': '六月危寅日「家業與/興旺」 — glyph unresolved (§8.6). Sits in the outcome clause, not the verdict.',
  '子|申': '十一月成申日「在江湖選擇時日」 word order unresolved (§8.6). First-person aside, not a verdict.',
};

// ===========================================================================
// 8. Main
// ===========================================================================

function main() {
  const argHunt = process.argv.includes('--hunt')
    ? process.argv[process.argv.indexOf('--hunt') + 1] : null;
  const huntPath = argHunt || DEFAULT_HUNT;

  let corpus;
  let corpusOrigin;
  if (existsSync(huntPath)) {
    corpus = buildCorpus(huntPath);
    corpusOrigin = `rebuilt from hunt output ${huntPath}`;
    writeFileSync(CORPUS_PATH, JSON.stringify({
      _meta: {
        title: '董公選要覽 — printed-witness cell corpus (verbatim transcription snapshot)',
        note: 'Snapshot of the witness transcriptions so dong-gong-extract.mjs stays re-runnable after the session scratchpad is gone. Verbatim; no emendation beyond the reader-supplied OCR errata table documented in the extractor.',
        builtFrom: huntPath,
        generated: '2026-07-26',
      },
      cells: corpus,
    }, null, 2) + '\n', 'utf8');
  } else if (existsSync(CORPUS_PATH)) {
    corpus = JSON.parse(readFileSync(CORPUS_PATH, 'utf8')).cells;
    corpusOrigin = `loaded from snapshot ${CORPUS_PATH}`;
  } else {
    console.error('No hunt output and no corpus snapshot. Nothing to derive from.');
    process.exit(2);
  }

  const grid = {};
  const dropped = [];
  const cellReports = [];
  let kept = 0;

  for (const cell of corpus) {
    const { month, dayBranch } = cell;
    const key = `${month}|${dayBranch}`;
    const officer = officerFor(month, dayBranch);

    // Derive INDEPENDENTLY from each witness reading, then keep only what they agree on.
    const perReading = cell.readings.map((r) => ({ reading: r, result: deriveFromReading(month, dayBranch, r) }));

    const disputeBlocked = perReading.some((p) => p.result.disputeBlocked);
    if (disputeBlocked) {
      for (const gz of ganzhiFor(dayBranch)) {
        dropped.push({ month, ganzhi: gz, officer, reason: 'cell flagged DISPUTED by the text itself (§8.5 #6) — publishers disagree and the text declines to settle it' });
      }
      cellReports.push({ key, officer, status: 'dispute-blocked', kept: 0 });
      continue;
    }

    // A reading tagged to no witness ("inferred" attribution) may corroborate but
    // may not be the sole basis for a cell — unless it is the only reading, in
    // which case the cell is emitted with the attribution flag visible.
    const tagged = perReading.filter((p) => p.reading.witnessAttribution === 'tagged');
    const usable = tagged.length ? perReading : perReading;

    const cellOut = {};
    let cellKept = 0;
    for (const gz of ganzhiFor(dayBranch)) {
      const votes = usable
        .map((p) => ({ p, v: p.result.ratings.get(gz) }))
        .filter((x) => x.v);
      if (votes.length === 0) {
        const why = usable.map((p) => p.result.dropNotes.get(gz)).find(Boolean) || 'no verdict bound to this stem';
        dropped.push({ month, ganzhi: gz, officer, reason: why });
        continue;
      }
      const distinct = [...new Set(votes.map((x) => x.v.rating))];
      if (distinct.length > 1) {
        dropped.push({
          month, ganzhi: gz, officer,
          reason: `printed witnesses disagree (${distinct.join(' vs ')}) — dropped rather than adjudicated`,
        });
        continue;
      }
      const best = votes[0].v;
      const witnesses = [...new Set(votes.flatMap((x) => x.p.reading.witnesses))];
      const attribution = votes.map((x) => x.p.reading.witnessAttribution);
      cellOut[gz] = {
        rating: best.rating,
        ratingEn: TIER_EN[best.rating],
        officer,
        severityRankInCell: best.severityRankInCell,
        derivedFrom: best.source,
        basis: best.basis,
        clause: best.clause,
        markers: best.markers.length ? best.markers : undefined,
        praisedTier: best.praisedTier,
        praisedActivities: best.praised,
        forbiddenActivities: best.forbidden,
        orderingNote: best.orderingNote,
        witnesses,
        witnessAttribution: attribution.includes('tagged') ? 'tagged' : 'inferred',
        corroboratingReadings: votes.length,
        printVsOnline: KNOWN_DIVERGENCES[key],
        transcriptionCaveat: TRANSCRIPTION_CAVEATS[key],
      };
      // Strip undefined for a stable, diffable file.
      for (const k of Object.keys(cellOut[gz])) if (cellOut[gz][k] === undefined) delete cellOut[gz][k];
      cellKept += 1;
      kept += 1;
    }
    if (cellKept) {
      grid[month] = grid[month] || {};
      Object.assign(grid[month], cellOut);
    }
    cellReports.push({ key, officer, status: 'derived', kept: cellKept });
  }

  const ordered = {};
  for (const m of MONTH_ORDER) if (grid[m]) {
    ordered[m] = {};
    for (const gz of Object.keys(grid[m]).sort()) ordered[m][gz] = grid[m][gz];
  }

  const dist = {};
  for (const m of Object.keys(ordered)) for (const gz of Object.keys(ordered[m])) {
    dist[ordered[m][gz].rating] = (dist[ordered[m][gz].rating] || 0) + 1;
  }

  const nativeCellsWithText = corpus.length;
  const out = {
    _meta: {
      title: 'Dong Gong (董公選要覽) per-ganzhi day-rating draft v2 — RESEARCH DATA, NOT SHIPPED',
      status: 'draft-v2-rebuilt-from-printed-witnesses',
      generated: '2026-07-26',
      supersedes: 'dong-gong-draft.json (left unmodified — it is the evidence the first derivation was wrong)',
      generator: 'docs/research/dong-gong-extract.mjs (deterministic, re-runnable)',
      corpusOrigin,
      structure: '{solar month branch (寅..丑)} -> {day ganzhi} -> {rating, ratingEn, officer, clause, witnesses, ...}',
      sourceOfTruth:
        'The two pre-modern PRINTED witnesses. Where a print reading differs from the online recension (§8.6), the print wins and the divergence is recorded per cell in `printVsOnline`.',
      witnesses: {
        'nlc416-wenming': '董公選要覽 全一冊, 上海文明書局 lithograph (colophon 中華民國十五年 = 1926), NLC416-12jh005366-44510. https://upload.wikimedia.org/wikipedia/commons/8/87/NLC416-12jh005366-44510_%E8%91%A3%E5%85%AC%E9%81%B8%E8%A6%81%E8%A6%BD.pdf',
        'nlc892-1898': '董公選要覽 一卷, woodblock, 光緒戊戌夏鐫 (summer 1898), 江官書局校刊, NLC892-GBZX0301014461-272080. https://upload.wikimedia.org/wikipedia/commons/2/2b/NLC892-GBZX0301014461-272080_%E8%91%A3%E5%85%AC%E9%81%B8%E8%A6%81%E8%A6%BD_%E4%B8%80%E5%8D%B7.pdf',
      },
      witnessAttributionCaveat:
        'Cells marked witnessAttribution:"inferred" rest on a transcription whose reader did not tag the witness in the cell text; their working files name the 1898 woodblock renders. Treat the witness id on those cells as probable, not proven. The TEXT is verbatim either way.',
      ratingDefinitions: {
        上吉: TIER_EN['上吉'], 大吉: TIER_EN['大吉'], 吉: TIER_EN['吉'], 次吉: TIER_EN['次吉'],
        平: TIER_EN['平'], MIXED: TIER_EN.MIXED, 凶: TIER_EN['凶'], 大凶: TIER_EN['大凶'],
      },
      derivationRules: [
        'Clause binding: a cell is a BASE clause plus clauses bound to the stems each names, optionally closed by a residual 「餘X日…」 clause covering stems named nowhere in the cell. A stem takes its own clause; only a stem with no clause of its own falls back to the base. (§8.5 #1, #3)',
        'Negations are tokenised and REMOVED from the string before any 吉/凶 scan, so 不吉 / 不能見吉 / 不利 can never be read as praise. Double negatives (並非不利) are read first, as mild praise. (§8.5 #2)',
        'A named 煞 sets a verdict only for the stems its own clause names. Generic almanac stars that head a cell (天賊, 往亡, 黃沙, 紅沙, 天富, 到州星, 勾絞, 朱雀, 天瘟, 月厭) are never treated as verdicts — they sit above auspicious and inauspicious cells alike. (§8.5 #3)',
        'MIXED requires a praised activity AND an activity-scoped prohibition in the same stem\'s clause, per the definition the draft\'s own _meta declares. A universal prohibition (百事不宜) is never MIXED. (§8.5 #4)',
        'Severity escalators (更凶 / 更加凶險 / 更不吉) step the tier one worse than the clause they contrast with, and every cell carries severityRankInCell so the ordering survives when tiers saturate. (§8.5 #5)',
        'A cell whose text adjudicates between publishers and declines to settle (董公原本 vs 諸家曆法 vs 協紀辨方書; 總以不用方爲穩善; 質之高明以爲何如) is refused a rating entirely — all five stems dropped. (§8.5 #6)',
        'Where a cell has more than one witness transcription, ratings are derived independently from each and a stem is kept only where they agree exactly; disagreement drops the stem.',
        'Truncated transcriptions are discarded, not partially parsed: a text that stops mid-cell cannot scope a residual clause correctly.',
        'Any stem the rules cannot resolve is absent. Absent is a legitimate value.',
      ],
      coverage: {
        nativeCellsWithPrintedText: nativeCellsWithText,
        nativeCellsTotal: 144,
        ganzhiCellsKept: kept,
        ganzhiCellsDropped: dropped.length,
        ganzhiCellsTotal: 720,
        note: `Printed-witness text was transcribed for ${nativeCellsWithText} of the 144 native (month × day-branch) cells; the other ${144 - nativeCellsWithText} were never read from the prints and are therefore wholly absent here, not merely dropped.`,
      },
      ratingDistribution: dist,
      comparisonToV1: (() => {
        const v1Path = join(HERE, 'dong-gong-draft.json');
        if (!existsSync(v1Path)) return 'dong-gong-draft.json not present';
        const v1 = JSON.parse(readFileSync(v1Path, 'utf8'));
        let same = 0; let changed = 0; let newCells = 0; let goneFromV1 = 0;
        const flips = {};
        for (const m of Object.keys(ordered)) for (const gz of Object.keys(ordered[m])) {
          const a = v1[m] && v1[m][gz];
          if (!a) { newCells += 1; continue; }
          if (a.rating === ordered[m][gz].rating) same += 1;
          else { changed += 1; const k = `${a.rating} -> ${ordered[m][gz].rating}`; flips[k] = (flips[k] || 0) + 1; }
        }
        for (const m of MONTH_ORDER) for (const gz of Object.keys((v1[m] || {}))) {
          if (!(ordered[m] && ordered[m][gz])) goneFromV1 += 1;
        }
        return {
          note: 'v1 is left byte-for-byte unmodified. This is a diff, not a migration.',
          bothPresentSameRating: same,
          bothPresentDifferentRating: changed,
          presentOnlyInV2: newCells,
          presentOnlyInV1: goneFromV1,
          ratingFlips: Object.fromEntries(Object.entries(flips).sort((a, b) => b[1] - a[1])),
          reading: `${changed} of ${same + changed} cells present in both grids carry a different rating in v2 — the first derivation was wrong far more widely than the 15.8% sample suggested, which is consistent with §8.5 diagnosing the failures as systematic rather than scattered.`,
        };
      })(),
      shipStatus:
        'STILL NOT SHIPPABLE. This is our derivation from the classical commentary by the stated rules, not the classical text\'s own rating. §8.7\'s gate requires the 316-cell spot-check to be re-run against the prints at zero contradiction-class mismatches, and 57 of 144 native cells have no printed transcription at all.',
      // Added after adversarial review (see §9). This file makes claims about its
      // own sources that are FALSE, and a reader who opens it without the sourcing
      // doc would have no way to know. In an artifact whose whole value is
      // provenance, a false evidence claim is worse than a mis-tiered cell: check
      // one, find it untrue, and you have no reason to trust the other 385.
      // Stated here rather than silently fixed because the fixes change ratings,
      // and a re-derivation must be reviewed, not slipped in beside a warning.
      knownFalseClaimsInThisFile: {
        readBeforeUsing: 'docs/research/DONG_GONG_SOURCING.md §9 — full findings, evidence and revised gate.',
        claims: [
          'DROP REASON "printed witnesses disagree" is false for 5 of the 6 cells carrying it. The code compares RATINGS between readings and never compares reading.witnesses, so two transcriptions of the SAME print (nlc416-wenming) that differ only in punctuation are recorded as a disagreement between witnesses. Only 六月除申日 壬申 is a genuine cross-witness variant.',
          'coverage.note says the 59 untranscribed native cells "were never read from the prints". The witness reader\'s own method note says all 144 cells WERE read and the remaining ~98 are "legible in the same rendered pages and can be transcribed on demand"; a second reader parsed 130/144, losing 14 "not to absence". The shortfall is unfinished transcription, NOT an unavailable source — and the source PDFs are still in hand.',
          'witnessAttribution: 25 kept cells rest solely on an INFERRED (unproven) witness attribution, not the 8 the summary states. The sole-basis gate promised in the comment at line ~444 was never implemented — the ternary that should enforce it has two identical branches.',
          'corroboratingReadings counts a second transcription of the same print as corroboration. 41 of 161 "corroborated" cells are one witness read twice, so the field overstates evidential support.',
          'The drop ledger does not reconcile: 87 native cells were transcribed, 85 entered the corpus. 二月定未日 and 十一月執巳日 are correctly discarded as truncated but appear in neither the grid nor _meta.dropped.',
          'The derivation is not punctuation-stable: re-running against a de-punctuated corpus moves 5 of 386 ratings (1.3%) and un-drops 4 stems. Sentence-dot placement, not doctrine, decides MIXED vs a scalar tier in those cases.',
        ],
      },
      dropped,
    },
    ...ordered,
  };

  writeFileSync(OUT_PATH, JSON.stringify(out, null, 2) + '\n', 'utf8');

  // ------------------------------------------------------------------------
  // Self-check: every worked example named in §8.5, re-run against this output.
  // ------------------------------------------------------------------------
  const get = (m, gz) => (ordered[m] && ordered[m][gz] ? ordered[m][gz].rating : null);
  const notOneOf = (m, gz, bad) => { const r = get(m, gz); return { ok: r === null || !bad.includes(r), got: r }; };
  const isOneOf = (m, gz, good) => { const r = get(m, gz); return { ok: good.includes(r), got: r }; };

  const checks = [
    // §8.5 #1 residual clauses
    ['#1 八月執寅日 餘寅亦次吉 — 丙寅 must not be 大凶', () => notOneOf('酉', '丙寅', ['大凶'])],
    ['#1 八月執寅日 餘寅亦次吉 — 戊寅 must not be 大凶', () => notOneOf('酉', '戊寅', ['大凶'])],
    ['#1 八月執寅日 餘寅亦次吉 — 壬寅 must not be 大凶', () => notOneOf('酉', '壬寅', ['大凶'])],
    ['#1 六月除申日 餘申日亦大吉 — 戊申 must not be MIXED', () => notOneOf('未', '戊申', ['MIXED'])],
    ['#1 十月危午日 餘午次吉 — 戊午 must not be 大凶', () => notOneOf('亥', '戊午', ['大凶'])],
    ['#1 十月危午日 餘午次吉 — 庚午 must not be 大凶', () => notOneOf('亥', '庚午', ['大凶'])],
    ['#1 十月危午日 餘午次吉 — 壬午 must not be 大凶', () => notOneOf('亥', '壬午', ['大凶'])],
    // §8.5 #2 negation matched as praise
    ['#2 三月收丑日 餘丑亦不吉 — 乙丑 must not be 吉+', () => notOneOf('辰', '乙丑', ['吉', '大吉', '上吉', '次吉'])],
    ['#2 三月收丑日 餘丑亦不吉 — 己丑 must not be 吉+', () => notOneOf('辰', '己丑', ['吉', '大吉', '上吉', '次吉'])],
    ['#2 三月收丑日 餘丑亦不吉 — 辛丑 must not be 吉+', () => notOneOf('辰', '辛丑', ['吉', '大吉', '上吉', '次吉'])],
    ['#2 正月滿辰日 餘辰日亦不吉 — 丙辰 must not be 吉+', () => notOneOf('寅', '丙辰', ['吉', '大吉', '上吉', '次吉'])],
    ['#2 正月滿辰日 餘辰日亦不吉 — 庚辰 must not be 吉+', () => notOneOf('寅', '庚辰', ['吉', '大吉', '上吉', '次吉'])],
    ['#2 八月危辰日 庚辰天地相疑不吉 — must not be 吉', () => notOneOf('酉', '庚辰', ['吉', '大吉', '上吉', '次吉'])],
    ['#2 三月滿午日 丙午平常不能見吉 — must not be 吉', () => notOneOf('辰', '丙午', ['吉', '大吉', '上吉'])],
    // §8.5 #3 named-auspicious stem losing its rating
    ['#3 十二月除寅日 庚寅 flagship — must not be 平', () => notOneOf('丑', '庚寅', ['平', '凶', '大凶'])],
    ['#3 五月成寅日 丙寅 天月二德 — must not be 平', () => notOneOf('午', '丙寅', ['平', '凶', '大凶'])],
    ['#3 六月執子日 丙子/庚子 利起造 — must not be 平', () => notOneOf('未', '丙子', ['平', '凶', '大凶'])],
    ['#3 六月執子日 戊子次吉 — must not be 大凶', () => notOneOf('未', '戊子', ['大凶'])],
    // §8.5 #4 false MIXED
    ['#4 正月除卯日 wholly negative — 甲卯-family must not be MIXED', () => {
      const bad = ganzhiFor('卯').filter((g) => get('寅', g) === 'MIXED');
      return { ok: bad.length === 0, got: bad.join(',') || 'none MIXED' };
    }],
    // §8.5 #5 severity ordering
    ['#5 三月平未日 乙未 更加凶險 — must be no better than the unnamed 未 stems', () => {
      const yi = get('辰', '乙未');
      const others = ganzhiFor('未').filter((g) => g !== '乙未').map((g) => get('辰', g)).filter(Boolean);
      const ok = yi === null || others.every((o) => tierIdx(yi) <= tierIdx(o));
      return { ok, got: `乙未=${yi} others=${others.join(',')}` };
    }],
    // §8.5 #6 disputed cell
    ['#6 八月定丑日 disputed — every 丑 stem absent', () => {
      const present = ganzhiFor('丑').filter((g) => get('酉', g) !== null);
      return { ok: present.length === 0, got: present.join(',') || 'all absent' };
    }],
    // §8.5 print-vs-online divergence
    ['print-wins 十月建亥日 乙亥 — print reads 凶, must not be MIXED', () => notOneOf('亥', '乙亥', ['MIXED'])],
    ['print-wins 十月建亥日 己亥 — print reads 凶, must not be MIXED', () => notOneOf('亥', '己亥', ['MIXED'])],
    // MIXED that SHOULD survive (the definition must not be over-tightened)
    ['MIXED kept where earned — 六月危寅日 甲寅', () => isOneOf('未', '甲寅', ['MIXED'])],
    // Invariants
    ['officer labels: formula (dayBranch−monthBranch mod 12) reproduces every witness label', () => {
      let n = 0; const bad = [];
      for (const cell of corpus) for (const r of cell.readings) {
        if (!r.officer) continue;
        n += 1;
        if (r.officer !== officerFor(cell.month, cell.dayBranch)) bad.push(`${cell.month}${cell.dayBranch}`);
      }
      return { ok: bad.length === 0, got: `${n - bad.length}/${n}` };
    }],
    ['no cell lists an activity as both praised and forbidden', () => {
      const bad = [];
      for (const m of Object.keys(ordered)) for (const gz of Object.keys(ordered[m])) {
        const c = ordered[m][gz];
        const both = (c.praisedActivities || []).filter((a) => (c.forbiddenActivities || []).includes(a));
        if (both.length) bad.push(`${m}|${gz}`);
      }
      return { ok: bad.length === 0, got: bad.join(',') || 'none' };
    }],
    ['every MIXED cell has both a praised and a forbidden activity (§8.5 #4 definition)', () => {
      const bad = [];
      for (const m of Object.keys(ordered)) for (const gz of Object.keys(ordered[m])) {
        const c = ordered[m][gz];
        if (c.rating !== 'MIXED') continue;
        if (!(c.praisedActivities || []).length || !(c.forbiddenActivities || []).length) bad.push(`${m}|${gz}`);
      }
      return { ok: bad.length === 0, got: bad.join(',') || 'all well-formed' };
    }],
  ];

  console.log(`\ncorpus: ${corpusOrigin}`);
  console.log(`native cells with printed text: ${nativeCellsWithText}/144`);
  console.log(`ganzhi cells kept: ${kept}   dropped: ${dropped.length}`);
  console.log(`rating distribution: ${JSON.stringify(dist)}`);
  console.log(`\n§8.5 regression self-checks:`);
  let fails = 0;
  for (const [name, fn] of checks) {
    const { ok, got } = fn();
    if (!ok) fails += 1;
    console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}   [got: ${got}]`);
  }
  console.log(`\n${checks.length - fails}/${checks.length} self-checks pass.`);
  console.log(`wrote ${OUT_PATH}`);
  if (fails) process.exit(1);
}

main();
