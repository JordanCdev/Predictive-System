/**
 * Decision objectives + versioned MCDA policies (spec §10). Each "life
 * decision" maps to: the almanac activity it counts as, which 建除 officers
 * are excellent / forbidden, which Ten-God energy (relative to the subject's
 * Day Master) helps, whether a personal clash vetoes the day, and the relative
 * weights of the four scoring evaluators.
 */

import { GodGroup } from "./symbols.ts";
import { ActivityTag } from "./tongshu.ts";

export interface McdaWeights {
  officer: number; // 建除十二神 fit for the activity (Tong Shu)
  road: number; // 黄道黑道 auspiciousness
  personal: number; // BaZi personalization (element + Ten God + Shen Sha − clash)
  hour: number; // best double-hour quality on the day
}

/** Calendar-level taboos the decision layer can hard-veto or soft-penalize.
 *  歲破 = year_break; 四離 = four_departure; 四絕 = four_severance. */
export type CalendarTaboo = "year_break" | "four_departure" | "four_severance";

/** 大事勿用/諸事不宜 treated as exclusions for high-stakes objectives. */
const ALL_TABOOS: CalendarTaboo[] = ["year_break", "four_departure", "four_severance"];

export interface Objective {
  id: string;
  label: string;
  emoji: string;
  description: string;
  primaryTag: ActivityTag;
  /** Officer indices (0..11) that are forbidden → hard reject (unless medical). */
  vetoOfficers: number[];
  /** Calendar taboos (歲破/四離/四絕) that hard-reject the day for this objective.
   *  Taboos NOT listed here stay soft penalties (medical is exempt from both —
   *  求醫 is the classical exception to 大事勿用). */
  hardCalendarTaboos: CalendarTaboo[];
  /** Does a clash with the subject's Day/zodiac branch hard-reject the day? */
  clashVeto: boolean;
  /** Ten-God group energy (relative to subject DM) that supports this goal. */
  godBias: GodGroup[];
  weights: McdaWeights;
  requiresBirthTime: boolean;
  /** Plain-language note shown in the explanation. */
  doctrineNote: string;
}

const DEFAULT_WEIGHTS: McdaWeights = { officer: 0.34, personal: 0.34, road: 0.16, hour: 0.16 };
const DESTRUCTION = 6; // 破 officer index

export const OBJECTIVES: Objective[] = [
  {
    id: "contract_signing",
    label: "Sign a contract / close a deal",
    emoji: "📝",
    description: "Signing agreements, closing sales, formalising commitments.",
    primaryTag: "contract",
    vetoOfficers: [DESTRUCTION],
    hardCalendarTaboos: ["year_break", "four_departure"],
    clashVeto: true,
    godBias: ["wealth", "officer"],
    weights: { officer: 0.34, personal: 0.34, road: 0.16, hour: 0.16 },
    requiresBirthTime: false,
    doctrineNote: "Favours 定/成/收/開 officers and a day reinforcing your Wealth/Officer energy; avoids 破 and days clashing your chart.",
  },
  {
    id: "open_business",
    label: "Open a business / launch / opening day",
    emoji: "🏮",
    description: "First day of trading, grand opening, going live.",
    primaryTag: "open",
    vetoOfficers: [DESTRUCTION, 11],
    hardCalendarTaboos: ALL_TABOOS,
    clashVeto: true,
    godBias: ["wealth", "output"],
    weights: { officer: 0.36, personal: 0.32, road: 0.18, hour: 0.14 },
    requiresBirthTime: false,
    doctrineNote: "Classic 開市 selection: 成/開/滿 officers, Yellow-road days, Wealth & Output energy for the founder.",
  },
  {
    id: "career_move",
    label: "Start a job / accept a role / career move",
    emoji: "💼",
    description: "Beginning new employment, taking office, a promotion start.",
    primaryTag: "general",
    vetoOfficers: [DESTRUCTION],
    hardCalendarTaboos: [],
    clashVeto: false,
    godBias: ["officer", "resource"],
    weights: { officer: 0.30, personal: 0.40, road: 0.14, hour: 0.16 },
    requiresBirthTime: false,
    doctrineNote: "上官赴任 logic: 建/成/開/定 officers and days strengthening your Officer (authority) and Resource (mentorship) stars.",
  },
  {
    id: "negotiation_meeting",
    label: "Important meeting / negotiation",
    emoji: "🤝",
    description: "High-stakes talks, pitches, board meetings, mediations.",
    primaryTag: "contract",
    vetoOfficers: [DESTRUCTION],
    hardCalendarTaboos: [],
    clashVeto: false,
    godBias: ["officer", "wealth"],
    weights: { officer: 0.28, personal: 0.36, road: 0.16, hour: 0.20 },
    requiresBirthTime: false,
    doctrineNote: "Weights the hour heavily — pick a supportive double-hour; favours Officer/Wealth energy and avoids 破/litigation days.",
  },
  {
    id: "wedding_marriage",
    label: "Wedding / marriage registration",
    emoji: "💍",
    description: "Marriage ceremony or legal registration (嫁娶).",
    primaryTag: "marry",
    vetoOfficers: [DESTRUCTION, 5, 11],
    hardCalendarTaboos: ALL_TABOOS,
    clashVeto: true,
    godBias: ["resource"],
    weights: { officer: 0.34, personal: 0.34, road: 0.18, hour: 0.14 },
    requiresBirthTime: false,
    doctrineNote: "嫁娶 favours 成/定/開 officers and harmony (六合/三合) with your chart; strongly avoids 破/執/閉 and any clash to your zodiac.",
  },
  {
    id: "moving_house",
    label: "Move home / move-in (入宅)",
    emoji: "🏠",
    description: "Relocating, moving into a new home (移徙 / 入宅).",
    primaryTag: "move",
    vetoOfficers: [DESTRUCTION, 11, 5],
    hardCalendarTaboos: ALL_TABOOS,
    clashVeto: true,
    godBias: ["resource"],
    weights: { officer: 0.36, personal: 0.32, road: 0.18, hour: 0.14 },
    requiresBirthTime: false,
    doctrineNote: "入宅 favours 成/開 officers, Travelling-Horse days and harmony with your chart; avoids 破/閉/執 and clash days.",
  },
  {
    id: "travel",
    label: "Travel / start a journey",
    emoji: "✈️",
    description: "Departures, long trips, relocations abroad (出行).",
    primaryTag: "travel",
    vetoOfficers: [DESTRUCTION],
    hardCalendarTaboos: [],
    clashVeto: false,
    godBias: ["output"],
    weights: { officer: 0.34, personal: 0.30, road: 0.18, hour: 0.18 },
    requiresBirthTime: false,
    doctrineNote: "出行 favours 成/開/建/滿 officers and Travelling-Horse days; avoids 破/危 and 往亡 patterns.",
  },
  {
    id: "renovation",
    label: "Renovation / breaking ground (動土)",
    emoji: "🛠️",
    description: "Construction start, renovation, ground-breaking.",
    primaryTag: "ground",
    vetoOfficers: [DESTRUCTION, 0],
    hardCalendarTaboos: ALL_TABOOS,
    clashVeto: true,
    godBias: ["resource"],
    weights: { officer: 0.40, personal: 0.28, road: 0.18, hour: 0.14 },
    requiresBirthTime: false,
    doctrineNote: "動土 favours 平/執/成 officers; note the day's 三煞 direction — avoid digging toward it. Avoids 破/建.",
  },
  {
    id: "medical_procedure",
    label: "Medical procedure / surgery (求醫)",
    emoji: "🩺",
    description: "Elective surgery, treatment, starting therapy.",
    primaryTag: "medical",
    vetoOfficers: [], // 破/除 are traditionally acceptable for medical
    hardCalendarTaboos: [], // 求醫 is the classical exception to 大事勿用 — soft only
    clashVeto: false,
    godBias: ["resource"],
    weights: { officer: 0.30, personal: 0.40, road: 0.16, hour: 0.14 },
    requiresBirthTime: false,
    doctrineNote: "求醫療病 is the exception that tolerates 除/破; favours Resource (healing) energy and avoids days clashing the patient where possible.",
  },
  {
    id: "investment_purchase",
    label: "Major purchase / investment",
    emoji: "💰",
    description: "Buying property/vehicle, committing capital (納財).",
    primaryTag: "contract",
    vetoOfficers: [DESTRUCTION],
    hardCalendarTaboos: [],
    clashVeto: true,
    godBias: ["wealth"],
    weights: { officer: 0.32, personal: 0.38, road: 0.16, hour: 0.14 },
    requiresBirthTime: false,
    doctrineNote: "納財 favours 收/成/開/定 officers and days reinforcing your Wealth star, provided the Day Master can carry it.",
  },
  {
    id: "study_exam",
    label: "Exam / start studies / submit work",
    emoji: "🎓",
    description: "Sitting exams, enrolling, submitting important work (入學).",
    primaryTag: "study",
    vetoOfficers: [DESTRUCTION],
    hardCalendarTaboos: [],
    clashVeto: false,
    godBias: ["resource", "output"],
    weights: { officer: 0.32, personal: 0.38, road: 0.14, hour: 0.16 },
    requiresBirthTime: false,
    doctrineNote: "入學考試 favours 成/開/定/建 officers and Resource (learning) + Output (expression) energy.",
  },
];

export function objectiveById(id: string): Objective {
  return OBJECTIVES.find((o) => o.id === id) ?? OBJECTIVES[0];
}

export { DEFAULT_WEIGHTS };
