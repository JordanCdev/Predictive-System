/**
 * Plain-English explanation layer (the "Wéi" voice).
 *
 * This is the ONLY place user-facing prose is authored. It is strictly
 * DOWNSTREAM of calculation: every function here reads existing fields from a
 * computed `DecisionResult` / `DayRecommendation` and formats them into human
 * sentences. It never recomputes, mutates, or re-buckets a score, never calls
 * the network, the wall clock (beyond explicit `todayIso` inputs), or an LLM.
 *
 * Determinism contract: identical inputs → identical strings. (Asserted in
 * `plainEnglish.test.ts`.) Score thresholds live here as the single source of
 * truth; `ui/format.ts` derives colours from `verdictBand`.
 */

import { ConfidenceBreakdown, ConflictRecord, DayRecommendation, HourPick } from "./decision.ts";
import { McdaWeights, Objective } from "./objectives.ts";
import { BranchInteraction, DayMasterAnalysis, SeasonalState } from "./bazi.ts";
import { BRANCHES, FivePhase, TenGod } from "./symbols.ts";

// ── Verdict bands ──────────────────────────────────────────────────────────
// Thresholds match the engine's classical bands. Single source of truth.

export type BandKey = "excellent" | "favourable" | "neutral" | "caution" | "avoid";
export interface Band {
  key: BandKey;
  label: string;
}

export function verdictBand(score: number): Band {
  if (score >= 72) return { key: "excellent", label: "Excellent" };
  if (score >= 58) return { key: "favourable", label: "Good" };
  if (score >= 45) return { key: "neutral", label: "Neutral" };
  if (score >= 32) return { key: "caution", label: "Weak" };
  return { key: "avoid", label: "Avoid" };
}

export function confidenceLabel(c: number): string {
  if (c >= 0.8) return "High confidence";
  if (c >= 0.65) return "Good confidence";
  if (c >= 0.5) return "Moderate confidence";
  return "Low confidence";
}

// ── Objectives in plain language ───────────────────────────────────────────

export interface ObjectivePlain {
  /** Gerund for the context bar, e.g. "Signing a contract". */
  gerund: string;
  /** Infinitive phrase for sentences, e.g. "sign and close deals". */
  verb: string;
  /** Very short label, e.g. "Contract". */
  short: string;
  /** Plain-English description for the Ask screen (no hanzi). */
  desc: string;
}

const OBJECTIVE_PLAIN: Record<string, ObjectivePlain> = {
  contract_signing: { gerund: "Signing a contract", verb: "sign and close deals", short: "Contract", desc: "Signing agreements, closing sales, formalising commitments." },
  open_business: { gerund: "Opening a business", verb: "open a business or launch", short: "Launch", desc: "First day of trading, a grand opening, going live." },
  career_move: { gerund: "Starting a new role", verb: "start a new role", short: "New role", desc: "Beginning a new job, taking office, a promotion." },
  negotiation_meeting: { gerund: "An important meeting", verb: "hold an important meeting", short: "Meeting", desc: "High-stakes talks, pitches, board meetings, mediations." },
  wedding_marriage: { gerund: "A wedding", verb: "marry", short: "Wedding", desc: "A marriage ceremony or legal registration." },
  moving_house: { gerund: "Moving home", verb: "move home", short: "Moving", desc: "Relocating or moving into a new home." },
  travel: { gerund: "Travelling", verb: "set off on a journey", short: "Travel", desc: "Departures, long trips, relocating abroad." },
  renovation: { gerund: "Breaking ground", verb: "break ground or renovate", short: "Renovation", desc: "Starting construction, renovation or ground-breaking." },
  medical_procedure: { gerund: "A medical procedure", verb: "have a procedure", short: "Procedure", desc: "Elective surgery, treatment, or starting therapy." },
  investment_purchase: { gerund: "A big purchase", verb: "make a major purchase", short: "Purchase", desc: "Buying property or a vehicle, committing capital." },
  study_exam: { gerund: "An exam or new studies", verb: "sit an exam or start studies", short: "Study", desc: "Sitting exams, enrolling, submitting important work." },
};

export function objectivePlain(id: string): ObjectivePlain {
  return OBJECTIVE_PLAIN[id] ?? { gerund: "This decision", verb: "act", short: "Decision", desc: "" };
}

// ── Dates & hours in human form ────────────────────────────────────────────

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

interface Civil {
  year: number;
  month: number;
  day: number;
}

function utcOf(c: Civil): number {
  return Date.UTC(c.year, c.month - 1, c.day);
}

export function weekdayName(c: Civil): string {
  return WEEKDAYS[new Date(utcOf(c)).getUTCDay()];
}

/** "Tuesday, 14 July 2026" */
export function humanDate(c: Civil): string {
  return `${weekdayName(c)}, ${c.day} ${MONTHS[c.month - 1]} ${c.year}`;
}

/** "Tue 14 Jul" — compact form for chips / lists. */
export function shortDate(c: Civil): string {
  return `${WEEKDAYS[new Date(utcOf(c)).getUTCDay()].slice(0, 3)} ${c.day} ${MONTHS[c.month - 1].slice(0, 3)}`;
}

function isoToCivil(iso: string): Civil {
  const [y, m, d] = iso.split("-").map(Number);
  return { year: y, month: m, day: d };
}

/** "today" · "tomorrow" · "in 9 days" · "in 3 weeks" · "in 2 months". */
export function relativeDay(iso: string, todayIso: string): string {
  const diff = Math.round((utcOf(isoToCivil(iso)) - utcOf(isoToCivil(todayIso))) / 86400000);
  if (diff === 0) return "today";
  if (diff === 1) return "tomorrow";
  if (diff === -1) return "yesterday";
  if (diff < 0) {
    const n = -diff;
    return n < 14 ? `${n} days ago` : n < 60 ? `${Math.round(n / 7)} weeks ago` : `${Math.round(n / 30)} months ago`;
  }
  if (diff < 14) return `in ${diff} days`;
  if (diff < 60) return `in ${Math.round(diff / 7)} weeks`;
  return `in ${Math.round(diff / 30)} months`;
}

function to12(hhmm: string): { hr: number; mer: string } {
  const h = Number(hhmm.split(":")[0]);
  const mer = h < 12 || h === 24 ? "am" : "pm";
  let hr = h % 12;
  if (hr === 0) hr = 12;
  return { hr, mer };
}

/** "寅 03:00–05:00" → "3–5am"; spanning noon → "11am–1pm". */
export function humanHourRange(rangeLabel: string): string {
  const parts = rangeLabel.split(" ");
  const range = parts.length > 1 ? parts[1] : rangeLabel;
  const [a, b] = range.split("–");
  if (!a || !b) return rangeLabel;
  const A = to12(a);
  const B = to12(b);
  return A.mer === B.mer ? `${A.hr}–${B.hr}${B.mer}` : `${A.hr}${A.mer}–${B.hr}${B.mer}`;
}

// ── Element names (plain, hanzi optional) ──────────────────────────────────

const ELEMENT_NAME: Record<FivePhase, string> = {
  wood: "Wood",
  fire: "Fire",
  earth: "Earth",
  metal: "Metal",
  water: "Water",
};
const ELEMENT_HANZI: Record<FivePhase, string> = { wood: "木", fire: "火", earth: "土", metal: "金", water: "水" };
export function elementPlain(p: FivePhase): string {
  return ELEMENT_NAME[p];
}
export function elementHanzi(p: FivePhase): string {
  return ELEMENT_HANZI[p];
}

// ── Almanac term glossary (officer / day-god / Ten God / Shen Sha) ──────────

export interface Gloss {
  /** Plain headline, e.g. "Achieving day". */
  label: string;
  /** Quiet secondary, e.g. "成 · Success officer". */
  secondary: string;
  /** One human sentence. */
  blurb: string;
}

const OFFICER_GLOSS: Record<number, Gloss> = {
  0: { label: "Starting day", secondary: "建 · Establish", blurb: "Good for beginnings — applications, contracts, first steps." },
  1: { label: "Clearing day", secondary: "除 · Remove", blurb: "Good for clearing out and treatment; not for weddings or moving." },
  2: { label: "Fullness day", secondary: "滿 · Full", blurb: "Good for openings and deals; less so for weddings or medical work." },
  3: { label: "Levelling day", secondary: "平 · Balance", blurb: "Steady and even — fine for routine tasks and groundwork." },
  4: { label: "Settling day", secondary: "定 · Stable", blurb: "Good for commitments — signing, weddings, study; not for travel." },
  5: { label: "Holding day", secondary: "執 · Initiate", blurb: "Good for ceremonies and foundations; not for openings or moves." },
  6: { label: "Breaking day", secondary: "破 · Destruction", blurb: "The one day-type tradition strongly warns against for new commitments." },
  7: { label: "Risk day", secondary: "危 · Danger", blurb: "A caution day — best to avoid travel and risky moves." },
  8: { label: "Achieving day", secondary: "成 · Success", blurb: "An all-round favourable day for almost any beginning." },
  9: { label: "Gathering day", secondary: "收 · Receive", blurb: "Good for closing, collecting and contracts; not burials or medical." },
  10: { label: "Opening day", secondary: "開 · Open", blurb: "Excellent for launches, weddings, moves and fresh starts." },
  11: { label: "Closing day", secondary: "閉 · Close", blurb: "Good for endings and sealing; not for openings or weddings." },
};

export function officerPlain(officer: { index: number }): Gloss {
  return OFFICER_GLOSS[officer.index] ?? { label: "Almanac day", secondary: "建除", blurb: "" };
}

const DAY_GOD_GLOSS: Record<number, Gloss> = {
  0: { label: "Lucky day", secondary: "青龍 · Green Dragon", blurb: "Green Dragon — one of the most auspicious day gods." },
  1: { label: "Lucky day", secondary: "明堂 · Bright Hall", blurb: "Bright Hall — clear and supportive." },
  2: { label: "Caution day", secondary: "天刑 · Heaven's Punishment", blurb: "A strict day god — keep things low-key." },
  3: { label: "Caution day", secondary: "朱雀 · Vermilion Bird", blurb: "Watch for disputes and gossip." },
  4: { label: "Lucky day", secondary: "金匱 · Golden Coffer", blurb: "Golden Coffer — favours wealth and storing up." },
  5: { label: "Lucky day", secondary: "天德 · Heaven's Virtue", blurb: "Heaven's Virtue — one of the most blessed day gods." },
  6: { label: "Caution day", secondary: "白虎 · White Tiger", blurb: "A fierce day god — take extra care." },
  7: { label: "Lucky day", secondary: "玉堂 · Jade Hall", blurb: "Jade Hall — refined and fortunate." },
  8: { label: "Caution day", secondary: "天牢 · Heaven's Jail", blurb: "A confining day god — avoid binding commitments." },
  9: { label: "Caution day", secondary: "玄武 · Black Tortoise", blurb: "Watch for loss or things going missing." },
  10: { label: "Lucky day", secondary: "司命 · Director of Fate", blurb: "Director of Fate — favourable for plans and petitions." },
  11: { label: "Caution day", secondary: "勾陳 · Hooked Array", blurb: "A tangling day god — beware entanglements and delays." },
};

export function dayGodPlain(dayGod: { index: number; yellow: boolean }): Gloss {
  return DAY_GOD_GLOSS[dayGod.index] ?? { label: dayGod.yellow ? "Lucky day" : "Caution day", secondary: "黄黑道", blurb: "" };
}

const TEN_GOD_GLOSS: Record<TenGod, string> = {
  friend: "independence and self-reliance",
  rob_wealth: "competitive, go-getting drive",
  eating_god: "easygoing creativity and output",
  hurting_officer: "expressive, performing flair",
  indirect_wealth: "opportunity and windfall money",
  direct_wealth: "steady, earned-money",
  seven_killings: "ambition and pressure",
  direct_officer: "authority, status and discipline",
  indirect_resource: "unconventional learning and support",
  direct_resource: "mentorship, learning and protection",
};
export function tenGodPlain(g: TenGod): string {
  return TEN_GOD_GLOSS[g];
}

const SHEN_SHA_GLOSS: Record<string, Gloss> = {
  clash_day: { label: "Clashes you directly", secondary: "沖日柱", blurb: "This day sits opposite your own pillar — a high-friction day for you." },
  clash_zodiac: { label: "Clashes your zodiac", secondary: "沖生肖", blurb: "This day clashes your birth-year animal — traditionally one to skip." },
  six_harmony: { label: "In harmony with you", secondary: "六合日", blurb: "This day cooperates with your chart — things flow more easily." },
  triple_harmony: { label: "Strongly with you", secondary: "三合日", blurb: "This day joins your chart's harmony group — supportive and smooth." },
  peach_blossom: { label: "Charisma day", secondary: "桃花日", blurb: "A socially magnetic day — great for connecting, less so for discretion." },
  travelling_horse: { label: "Momentum day", secondary: "驛馬日", blurb: "A movement day — favours travel, relocation and getting going." },
};
export function shenShaPlain(code: string): Gloss {
  return SHEN_SHA_GLOSS[code] ?? { label: code, secondary: "", blurb: "" };
}

// ── Headline verdict & "why this day" ──────────────────────────────────────

export function headlineVerdict(rec: DayRecommendation, objective: Objective): string {
  const { verb, gerund } = objectivePlain(objective.id);
  // A 四離/四絕 eve is 大事勿用 — the top line must not say "excellent" while the
  // reasoning says "hold off". This dominates the band-based verdict.
  const fb = rec.rulesFired.find((r) => r.code === "four_departure" || r.code === "four_severance");
  if (fb) {
    return `Best avoided to ${verb} — it's a ${fb.code === "four_departure" ? "四離" : "四絕"} day (a season-pivot eve), which tradition marks “大事勿用”.`;
  }
  const clash = rec.shenShaTags.some((t) => t.code === "clash_day" || t.code === "clash_zodiac");
  if (clash && rec.finalScore < 58) {
    return `A risky day to ${verb} — it clashes your own chart. ${gerund} elsewhere if you can.`;
  }
  const band = verdictBand(rec.finalScore);
  switch (band.key) {
    case "excellent":
      return `An excellent day to ${verb}.`;
    case "favourable":
      return `A good day to ${verb}.`;
    case "neutral":
      return `A workable day to ${verb} — nothing strongly for or against.`;
    case "caution":
      return `A weak day to ${verb} — proceed carefully.`;
    default:
      return `Better to avoid ${gerund.toLowerCase()} on this day.`;
  }
}

/** Why this day was rated as it was — plain bullets whose valence matches the verdict. */
export function whyThisDay(rec: DayRecommendation): string[] {
  const bullets: string[] = [];
  // On days we're steering away from, lead with the limiting factor and drop upbeat extras.
  const cautious = rec.finalScore < 45;

  // A season-pivot eve is a strong taboo — lead with it.
  const fb = rec.rulesFired.find((r) => r.code === "four_departure" || r.code === "four_severance");
  if (fb) {
    bullets.push(
      `It's a ${fb.code === "four_departure" ? "四離" : "四絕"} day — the eve of a season pivot, which tradition marks “大事勿用” (hold off on anything major).`,
    );
  }

  const officer = officerPlain(rec.tongshu.officer);
  bullets.push(`${officer.label}: ${officer.blurb}`);

  const god = dayGodPlain(rec.tongshu.dayGod);
  bullets.push(`${god.label} in the almanac — ${god.blurb}`);

  if (rec.personalized) {
    const codes = new Set(rec.rulesFired.map((r) => r.code));
    // Negatives always surface; positives only when the day is genuinely worth it.
    const elementPos = rec.rulesFired.some((r) => (r.code === "element_stem" || r.code === "element_branch") && r.effect > 0);
    const elementNeg = rec.rulesFired.some((r) => (r.code === "element_stem" || r.code === "element_branch") && r.effect < 0);
    if (elementNeg) bullets.push("The day's energy runs against your chart.");
    for (const t of rec.shenShaTags) {
      if (t.code === "clash_day" || t.code === "clash_zodiac") bullets.push(shenShaPlain(t.code).blurb);
    }
    if (!cautious) {
      if (codes.has("ten_god_support") && rec.dayStemTenGod) {
        bullets.push(`It reinforces your ${tenGodPlain(rec.dayStemTenGod)} energy.`);
      }
      if (elementPos) bullets.push("The day's energy is favourable to your chart.");
      if (codes.has("nobleman")) bullets.push("A helpful-people day — mentors and allies tend to show up.");
      for (const t of rec.shenShaTags) {
        if (t.code === "triple_harmony" || t.code === "six_harmony") bullets.push(shenShaPlain(t.code).blurb);
      }
      if (rec.bestHour) {
        const nobleHour = rec.bestHour.reasons.some((r) => r.includes("Nobleman"));
        bullets.push(`Best window: ${humanHourRange(rec.bestHour.rangeLabel)}${nobleHour ? " — a helpful-people hour" : ""}.`);
      }
    } else if (rec.bestHour) {
      bullets.push(`If it must be this day, the least-bad window is ${humanHourRange(rec.bestHour.rangeLabel)}.`);
    }
  }
  return bullets;
}

/** Why a day was ruled out (hard veto), in plain words. */
export function vetoExplain(rec: DayRecommendation, objective: Objective): string {
  const { verb } = objectivePlain(objective.id);
  const officer = officerPlain(rec.tongshu.officer);
  if (rec.tongshu.officer.index === 6) {
    return `We'd skip this one to ${verb}: it's a ${officer.label} (破), the one day-type tradition strongly warns against for new commitments.`;
  }
  if (rec.rejectReasons.some((r) => r.includes("clash"))) {
    return `We'd skip this one to ${verb}: it clashes your own chart, a day tradition treats as off-limits for this.`;
  }
  return `We'd skip this one to ${verb}: ${rec.rejectReasons[0] ?? "a strong traditional warning applies."}`;
}

// ── Conflicts ──────────────────────────────────────────────────────────────

export function conflictSentence(c: ConflictRecord): string {
  switch (c.type) {
    case "tongshu_vs_bazi":
      return "The almanac likes this day, but your personal chart pushes back. We show both rather than averaging them away — your call on which you trust more.";
    case "bazi_vs_tongshu":
      return "Your personal chart likes this day, but the traditional almanac warns against it. Both readings are shown so you can weigh them yourself.";
    case "road_vs_officer":
      return "It lands on a lucky day-god, yet its day-officer is a poor fit for this activity — a mixed signal worth noting.";
    case "officer_vs_road":
      return "Its day-officer suits this activity well, but it falls on a caution day-god — a mixed signal worth noting.";
    default:
      return c.reason;
  }
}

// ── Confidence, in plain words (always carries the epistemic disclaimer) ────

const CONFIDENCE_DISCLAIMER =
  "This measures how solid the reasoning is — not the odds that your plans turn out well.";

export interface ConfidenceComponentPlain {
  key: string;
  label: string;
  value: number;
  blurb: string;
}

const CONF_COMPONENT_PLAIN: Record<string, { label: string; blurb: string }> = {
  calculationReproducibility: { label: "Reproducibility", blurb: "The same inputs always reproduce this exact result." },
  sourceQuality: { label: "Source quality", blurb: "Grounded in classical texts and astronomical calculation." },
  sourceSpecificity: { label: "Source precision", blurb: "How specific the cited rules are." },
  schoolAgreement: { label: "School agreement", blurb: "How much the consulted traditions agree here." },
  inputQuality: { label: "Your input", blurb: "How precisely we could pin the chart — exact time beats an unknown one." },
  validationConcordance: { label: "Validation", blurb: "Agreement with independently checked reference data (solar terms, golden charts)." },
  ruleCoverage: { label: "Breadth", blurb: "How many traditions were consulted." },
};

const CONF_ORDER = [
  "calculationReproducibility",
  "sourceQuality",
  "validationConcordance",
  "sourceSpecificity",
  "schoolAgreement",
  "ruleCoverage",
  "inputQuality",
];

export interface ConfidencePlain {
  label: string;
  sentence: string;
  disclaimer: string;
  components: ConfidenceComponentPlain[];
}

export function confidencePlain(conf: ConfidenceBreakdown, personalized: boolean): ConfidencePlain {
  const label = confidenceLabel(conf.overall);
  const base = personalized
    ? "Classical and astronomical sources back this, tailored to your chart."
    : "This is the general almanac read — add your birth details to tailor and sharpen it.";
  const components = CONF_ORDER.map((key) => ({
    key,
    label: CONF_COMPONENT_PLAIN[key].label,
    value: conf.components[key as keyof typeof conf.components],
    blurb: CONF_COMPONENT_PLAIN[key].blurb,
  }));
  return { label, sentence: base, disclaimer: CONFIDENCE_DISCLAIMER, components };
}

// ── The four sub-scores, narrated ──────────────────────────────────────────

export interface SubScorePlain {
  key: "officer" | "road" | "personal" | "hour";
  label: string;
  value: number;
  weightPct: number;
  blurb: string;
}

const SUBSCORE_META: Record<SubScorePlain["key"], { label: string; blurb: string }> = {
  officer: { label: "Almanac fit", blurb: "How the day's officer (建除) suits this activity." },
  road: { label: "Lucky-day rating", blurb: "The day's auspicious / inauspicious day-god (黄黑道)." },
  personal: { label: "Personal fit", blurb: "How the day's energy suits your own chart." },
  hour: { label: "Best-hour quality", blurb: "How strong the day's best time window is for you." },
};

export function subScoreNarrative(rec: DayRecommendation, weights: McdaWeights): SubScorePlain[] {
  const out: SubScorePlain[] = [];
  const personalized = rec.personalized;
  const officerW = personalized ? weights.officer : weights.officer / (weights.officer + weights.road);
  const roadW = personalized ? weights.road : weights.road / (weights.officer + weights.road);
  out.push({ key: "officer", label: SUBSCORE_META.officer.label, value: rec.subScores.officer, weightPct: Math.round(officerW * 100), blurb: SUBSCORE_META.officer.blurb });
  out.push({ key: "road", label: SUBSCORE_META.road.label, value: rec.subScores.road, weightPct: Math.round(roadW * 100), blurb: SUBSCORE_META.road.blurb });
  if (personalized && rec.subScores.personal !== null) {
    out.push({ key: "personal", label: SUBSCORE_META.personal.label, value: rec.subScores.personal, weightPct: Math.round(weights.personal * 100), blurb: SUBSCORE_META.personal.blurb });
  }
  if (personalized && rec.subScores.hour !== null) {
    out.push({ key: "hour", label: SUBSCORE_META.hour.label, value: rec.subScores.hour, weightPct: Math.round(weights.hour * 100), blurb: SUBSCORE_META.hour.blurb });
  }
  return out;
}

// ── The user's chart, in plain words ───────────────────────────────────────

const STRENGTH_WORD: Record<DayMasterAnalysis["strength"], string> = {
  strong: "well-supported",
  balanced: "balanced",
  weak: "in need of support",
};

export function dayMasterPlain(dm: DayMasterAnalysis): string {
  const core = `Your core element is ${elementPlain(dm.dayMaster.phase)}, and it reads as ${STRENGTH_WORD[dm.strength]}.`;
  const fav = dm.favorableElements.map(elementPlain);
  const unfav = dm.unfavorableElements.map(elementPlain);
  if (fav.length === 0) return core;
  const favStr = listJoin(fav);
  const unfavStr = unfav.length ? `, while ${listJoin(unfav)} can strain you` : "";
  return `${core} ${favStr} tend${fav.length === 1 ? "s" : ""} to help you${unfavStr}.`;
}

function listJoin(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

// ── Window / timeframe in plain words ──────────────────────────────────────

export function windowPlain(days: number): string {
  if (days <= 14) return "the next 2 weeks";
  if (days <= 31) return "the next month";
  if (days <= 92) return "the next 3 months";
  if (days <= 186) return "the next 6 months";
  return `the next ${Math.round(days / 30)} months`;
}

// ── "What you can do" — concrete, deterministic guidance from existing facts ──

const NEEDS_DIRECTION = new Set(["renovation", "moving_house"]);

/** A double-hour that falls in daylight-ish hours (卯..酉, ≈05:00–19:00). */
export function isDaytimeHour(branchIndex: number): boolean {
  const hs = BRANCHES[branchIndex].hourStart;
  return hs >= 5 && hs <= 17;
}
/** The best-scoring daytime double-hour (for activities people do by day). */
export function bestDaytimeHour(rec: DayRecommendation): HourPick | null {
  const day = rec.allHours.filter((h) => isDaytimeHour(h.branchIndex)).sort((a, b) => b.score - a.score);
  return day[0] ?? null;
}
/** The window to actually recommend: the chart-best if it's in daytime, else the
 *  best practical daytime window (most plans happen by day). */
export function practicalBestHour(rec: DayRecommendation): HourPick | null {
  if (!rec.bestHour) return null;
  return isDaytimeHour(rec.bestHour.branchIndex) ? rec.bestHour : bestDaytimeHour(rec) ?? rec.bestHour;
}

/** Actionable tips for a day + objective (best window, direction taboos, cautions). */
export function actionGuidance(rec: DayRecommendation, objective: Objective): string[] {
  const tips: string[] = [];
  const band = verdictBand(rec.finalScore).key;
  const { verb } = objectivePlain(objective.id);
  const tags = new Set(rec.rulesFired.map((r) => r.code));
  const clash = rec.shenShaTags.some((t) => t.code === "clash_day" || t.code === "clash_zodiac");
  let cautioned = false;

  if (tags.has("four_departure") || tags.has("four_severance")) {
    tips.push("Move anything major off this season-pivot eve (四離/四絕) — a nearby day will serve you far better.");
    cautioned = true;
  }
  if (clash) {
    tips.push("This day clashes your own chart — fine for small steps, but reconsider for anything binding.");
    cautioned = true;
  }

  if (rec.personalized && rec.bestHour) {
    const noble = rec.bestHour.reasons.some((r) => r.includes("Nobleman"));
    if (isDaytimeHour(rec.bestHour.branchIndex)) {
      tips.push(`Aim for the ${humanHourRange(rec.bestHour.rangeLabel)} window — your strongest hours that day${noble ? ", and a “helpful-people” hour to bring in an ally or advisor" : ""}.`);
    } else {
      const day = bestDaytimeHour(rec);
      tips.push(
        day
          ? `Your chart's strongest hours fall overnight (${humanHourRange(rec.bestHour.rangeLabel)})${noble ? " — a helpful-people window" : ""}; for a daytime plan, the best practical window is ${humanHourRange(day.rangeLabel)}.`
          : `Your strongest window that day is ${humanHourRange(rec.bestHour.rangeLabel)}.`,
      );
    }
  }
  if (tags.has("nobleman") && !(rec.bestHour && rec.bestHour.reasons.some((r) => r.includes("Nobleman")))) {
    tips.push("A “helpful-people” day (天乙貴人) — a good one to involve mentors, allies or advisors.");
  }

  if (NEEDS_DIRECTION.has(objective.id) && rec.tongshu.sanShaDirection && rec.tongshu.sanShaDirection !== "—") {
    tips.push(`When breaking ground or moving in, avoid facing ${rec.tongshu.sanShaDirection} — it's the day's 三煞 (Three-Killings) direction.`);
  }
  if (rec.shenShaTags.some((t) => t.code === "travelling_horse") && (objective.id === "travel" || objective.id === "moving_house")) {
    tips.push("A “Travelling-Horse” momentum day — well-suited to setting off or relocating.");
  }

  // Closing line — never contradicts a caution shown above it.
  if (cautioned) tips.push("On balance we'd hold off unless you have a strong reason — weigh the cautions above.");
  else if (band === "excellent" || band === "favourable") tips.push(`Otherwise, go ahead and ${verb} — this is a green light.`);
  else if (band === "neutral") tips.push("Nothing's stopping you, but nothing's pushing for it either — proceed if it suits your schedule.");
  else tips.push("If you have any flexibility, an earlier or later day will treat you better.");

  return tips;
}

// ── The new chart signals, in plain words ────────────────────────────────────

const SEASONAL_STATE_PLAIN: Record<SeasonalState, { label: string; zh: string }> = {
  prosperous: { label: "thriving this season", zh: "旺" },
  strong: { label: "well-supported this season", zh: "相" },
  resting: { label: "winding down this season", zh: "休" },
  trapped: { label: "under pressure this season", zh: "囚" },
  dead: { label: "weakest this season", zh: "死" },
};
export function seasonalStatePlain(state: SeasonalState): { label: string; zh: string } {
  return SEASONAL_STATE_PLAIN[state];
}

export function rootingPlain(rooting: DayMasterAnalysis["rooting"]): string {
  if (rooting.mainQiRoot) return `Firmly rooted (得地) — a strong base in ${rooting.rootBranches.join("、")}.`;
  if (rooting.hasRoot) return `Lightly rooted in ${rooting.rootBranches.join("、")}.`;
  return "Rootless (無根) — no branch supplies its own element, so it leans on support from others.";
}

const branchHz = (i: number) => BRANCHES[i].hanzi;

export function interactionPlain(it: BranchInteraction): string {
  const bs = it.branches.map(branchHz).join("");
  const el = it.element ? elementPlain(it.element) : "";
  switch (it.type) {
    case "three_meeting":
      return `${bs} form a ${el} season-frame (三會) — a strong block of ${el} in your chart.`;
    case "three_harmony":
      return `${bs} form a ${el} harmony (三合) — pooled ${el} energy.`;
    case "three_harmony_half":
      return `${bs} make a partial ${el} harmony (半三合).`;
    case "six_harmony":
      return `${bs} pair in a Six-Harmony (六合) toward ${el}.`;
    case "clash":
      return `${bs} clash (六沖) — an internal tension that can unsettle both.`;
  }
}
