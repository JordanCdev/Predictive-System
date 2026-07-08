/**
 * Cross-check against lunar-javascript (6tail), an independently implemented
 * Chinese calendar/almanac library (docs/VERIFICATION.md).
 *
 * Comparator semantics (pinned by probing v1.7.7 — see lunar-javascript.d.ts):
 *  - Solar.fromYmdHms takes China Standard Time (UTC+8) wall-clock numbers and
 *    is host-timezone independent. DATE-based facts (day pillar, officer, day
 *    god, 宜/忌, clash) follow the civil date, so they are probed with the
 *    LOCAL civil date at noon. INSTANT-based facts (year/month pillar) follow
 *    the solar-term instant in the CST frame, so they are probed with the UTC
 *    instant converted to CST wall-clock.
 *  - Output strings are SIMPLIFIED Chinese; this engine is traditional. All
 *    comparisons run through the alias maps below.
 *  - Known school split: lunar-javascript always rolls the HOUR stem to the
 *    next day at 23:00 (晚子時); under this engine's civil-midnight convention
 *    the 23:00–23:59 hour keeps the current day's stem. Those comparisons are
 *    reported as warn, not fail.
 *
 * This module (and only this module) imports lunar-javascript — keep it out of
 * engine/index.ts so the comparator stays a lazily-loaded chunk in the app.
 */

import { Solar } from "lunar-javascript";
import { BRANCHES } from "../symbols.ts";
import { MomentInput, buildFourPillars } from "../sexagenary.ts";
import { ZIPING_DEFAULT, ConventionSet } from "../conventions.ts";
import { TongShuDay, ActivityTag } from "../tongshu.ts";
import { FieldAgreement, VerificationSource } from "./types.ts";

export const LUNAR_JS_VERSION = "1.7.7";

export function lunarJavascriptSource(checkedAtIso: string): VerificationSource {
  return {
    id: "lunar-javascript",
    version: LUNAR_JS_VERSION,
    sourceLabel: "lunar-javascript (6tail) independent almanac library",
    sourceUrl: "package:lunar-javascript",
    checkedAtIso,
  };
}

// ── simplified → traditional alias maps (comparator emits simplified) ───────

const OFFICER_S2T: Record<string, string> = {
  建: "建", 除: "除", 满: "滿", 平: "平", 定: "定", 执: "執",
  破: "破", 危: "危", 成: "成", 收: "收", 开: "開", 闭: "閉",
};

const DAY_GOD_S2T: Record<string, string> = {
  青龙: "青龍", 明堂: "明堂", 天刑: "天刑", 朱雀: "朱雀", 金匮: "金匱", 天德: "天德",
  白虎: "白虎", 玉堂: "玉堂", 天牢: "天牢", 玄武: "玄武", 司命: "司命", 勾陈: "勾陳",
};

/** Simplified 通書 activity terms per engine ActivityTag (for the 宜/忌 advisory). */
const TAG_ZH_SIMPLIFIED: Partial<Record<ActivityTag, string[]>> = {
  open: ["开市"],
  marry: ["嫁娶", "纳采"],
  move: ["移徙", "入宅"],
  travel: ["出行"],
  contract: ["交易", "立券", "纳财"],
  ground: ["动土", "破土"],
  medical: ["治病"],
  study: ["入学"],
  litigation: ["词讼"],
  burial: ["安葬"],
};

// ── frame conversion helpers ─────────────────────────────────────────────────

/** UTC instant → CST (UTC+8) wall-clock probe (for instant-based facts). */
function solarAtCst(utcMillis: number): Solar {
  const d = new Date(utcMillis + 8 * 3600000);
  return Solar.fromYmdHms(
    d.getUTCFullYear(),
    d.getUTCMonth() + 1,
    d.getUTCDate(),
    d.getUTCHours(),
    d.getUTCMinutes(),
    d.getUTCSeconds(),
  );
}

// ── candidate-day verification ───────────────────────────────────────────────

export interface DayVerificationInput {
  civil: { year: number; month: number; day: number };
  tongshu: TongShuDay;
  /** The window's tz offset — the frame the candidate day was evaluated in. */
  tzOffsetMinutes: number;
  /** The activity being timed, for the 宜/忌 advisory. */
  primaryTag: ActivityTag;
  /** True when a 節 crossing sits within ±1 day: month-fact mismatches become warns. */
  nearJieBoundary: boolean;
}

export function verifyCandidateDay(input: DayVerificationInput): FieldAgreement[] {
  const { civil, tongshu, tzOffsetMinutes, primaryTag, nearJieBoundary } = input;
  const fields: FieldAgreement[] = [];
  const boundaryNote =
    "A 節 (month-boundary) crossing sits within a day of this date; the comparator assigns month facts on China Standard Time dates, so a divergence here is a frame/convention difference, not an arithmetic error.";

  // DATE-based probe: the candidate's civil date (noon).
  const lunar = Solar.fromYmdHms(civil.year, civil.month, civil.day, 12, 0, 0).getLunar();

  // Day pillar — exact, blocking. GanZhi hanzi are identical in both scripts.
  const externalDay = lunar.getDayInGanZhi();
  fields.push({
    field: "dayPillar",
    status: externalDay === tongshu.dayGanzhi.hanzi ? "pass" : "fail",
    source: "lunar-javascript",
    expected: externalDay,
    actual: tongshu.dayGanzhi.hanzi,
    blocking: true,
  });

  // INSTANT-based probe: local noon converted to the CST frame.
  const noonUtc = Date.UTC(civil.year, civil.month - 1, civil.day, 12) - tzOffsetMinutes * 60000;
  const lunarInstant = solarAtCst(noonUtc).getLunar();
  const fp = buildFourPillars(
    { year: civil.year, month: civil.month, day: civil.day, hour: 12, minute: 0, tzOffsetMinutes },
    ZIPING_DEFAULT,
  );

  const externalYear = lunarInstant.getYearInGanZhiExact();
  fields.push({
    field: "yearPillar",
    status: externalYear === fp.year.hanzi ? "pass" : nearJieBoundary ? "warn" : "fail",
    source: "lunar-javascript",
    expected: externalYear,
    actual: fp.year.hanzi,
    blocking: true,
    notes: externalYear !== fp.year.hanzi && nearJieBoundary ? [boundaryNote] : undefined,
  });

  const externalMonth = lunarInstant.getMonthInGanZhiExact();
  fields.push({
    field: "monthPillar",
    status: externalMonth === fp.month.hanzi ? "pass" : nearJieBoundary ? "warn" : "fail",
    source: "lunar-javascript",
    expected: externalMonth,
    actual: fp.month.hanzi,
    blocking: true,
    notes: externalMonth !== fp.month.hanzi && nearJieBoundary ? [boundaryNote] : undefined,
  });

  // 建除 officer — table-driven from (day branch − month branch); month frame caveat.
  const externalOfficer = OFFICER_S2T[lunar.getZhiXing()] ?? lunar.getZhiXing();
  fields.push({
    field: "officer12",
    status: externalOfficer === tongshu.officer.nameZh ? "pass" : nearJieBoundary ? "warn" : "fail",
    source: "lunar-javascript",
    expected: externalOfficer,
    actual: tongshu.officer.nameZh,
    blocking: !nearJieBoundary,
    notes: externalOfficer !== tongshu.officer.nameZh && nearJieBoundary ? [boundaryNote] : undefined,
  });

  // 黄黑道 day god.
  const externalGod = DAY_GOD_S2T[lunar.getDayTianShen()] ?? lunar.getDayTianShen();
  const externalYellow = lunar.getDayTianShenType() === "黄道";
  const godMatches = externalGod === tongshu.dayGod.nameZh && externalYellow === tongshu.dayGod.yellow;
  fields.push({
    field: "dayGod12",
    status: godMatches ? "pass" : nearJieBoundary ? "warn" : "fail",
    source: "lunar-javascript",
    expected: `${externalGod} (${lunar.getDayTianShenType()})`,
    actual: `${tongshu.dayGod.nameZh} (${tongshu.dayGod.yellow ? "黄道" : "黑道"})`,
    blocking: !nearJieBoundary,
    notes: !godMatches && nearJieBoundary ? [boundaryNote] : undefined,
  });

  // 日沖 clash branch — pure branch arithmetic, blocking.
  const externalClash = lunar.getDayChong();
  const internalClash = BRANCHES[tongshu.clashBranchIndex].hanzi;
  fields.push({
    field: "clash",
    status: externalClash === internalClash ? "pass" : "fail",
    source: "lunar-javascript",
    expected: externalClash,
    actual: internalClash,
    blocking: true,
  });

  // 宜/忌 advisory — this engine does not emit 宜/忌 lists (it scores officers per
  // activity instead), so this is an ADVISORY agreement check on the timed
  // activity only. Almanac prescriptions legitimately differ between publishers
  // → never blocking, mismatches warn.
  const yi = lunar.getDayYi();
  const ji = lunar.getDayJi();
  const zhTerms = TAG_ZH_SIMPLIFIED[primaryTag] ?? [];
  const inYi = zhTerms.filter((t) => yi.includes(t));
  const inJi = zhTerms.filter((t) => ji.includes(t));
  const allForbidden = ji.includes("诸事不宜");
  if (zhTerms.length === 0) {
    fields.push({
      field: "yi",
      status: "unsupported",
      source: "lunar-javascript",
      blocking: false,
      notes: ["No 通書 activity term maps to this objective."],
    });
  } else {
    const status = allForbidden || inJi.length > 0 ? "warn" : inYi.length > 0 ? "pass" : "warn";
    fields.push({
      field: "yi",
      status,
      source: "lunar-javascript",
      expected: `宜 ${yi.join("、") || "—"} / 忌 ${ji.join("、") || "—"}`,
      actual: `engine officer verdict for ${primaryTag}: ${tongshu.officer.nameZh} (${tongshu.officer.good.includes(primaryTag) ? "favourable" : tongshu.officer.bad.includes(primaryTag) ? "unfavourable" : "neutral"})`,
      blocking: false,
      notes: [
        allForbidden
          ? "The comparator's 通書 marks this day 诸事不宜 (nothing advisable)."
          : inJi.length > 0
            ? `The comparator lists ${inJi.join("、")} under 忌 today — day-prescription lists differ between almanac publishers.`
            : inYi.length > 0
              ? `The comparator lists ${inYi.join("、")} under 宜 today.`
              : "The activity is not listed under 宜 or 忌 today — neutral in the comparator's almanac.",
      ],
    });
  }

  return fields;
}

// ── natal-chart verification ─────────────────────────────────────────────────

export function verifyNatalChart(
  birth: MomentInput,
  convention: ConventionSet,
  internal: { year: string; month: string; day: string; hour: string },
  /** The engine's solar-corrected effective wall-clock (fp.meta.normalized.effective).
   *  The comparator cannot express a 真太陽時/mean-solar hour basis, so the probe
   *  feeds it the CORRECTED time: that checks the pillar ARITHMETIC while
   *  neutralizing a convention the comparator does not have. Under civil_clock
   *  this equals the raw birth wall-clock. */
  effective: { year: number; month: number; day: number; hour: number; minute: number },
): FieldAgreement[] {
  const fields: FieldAgreement[] = [];
  const solarBasis = convention.hourBasis !== "civil_clock";
  const solarNote = solarBasis
    ? `Comparator fed the engine's solar-corrected time (${convention.hourBasis}); the correction itself is verified separately against the equation of time.`
    : undefined;

  // DATE/TIME-based probe: the effective wall-clock (day + hour pillars follow
  // the effective civil date, which the comparator treats frame-neutrally).
  const localLunar = Solar.fromYmdHms(
    effective.year,
    effective.month,
    effective.day,
    effective.hour,
    effective.minute,
    0,
  ).getLunar();
  const ec = localLunar.getEightChar();
  ec.setSect(convention.dayBoundary === "zi_23" ? 1 : 2);

  fields.push({
    field: "dayPillar",
    status: ec.getDay() === internal.day ? "pass" : "fail",
    source: "lunar-javascript",
    expected: ec.getDay(),
    actual: internal.day,
    blocking: true,
    notes: [
      `Comparator sect ${convention.dayBoundary === "zi_23" ? "1 (23:00 rollover)" : "2 (civil midnight)"} matched to the engine convention.`,
      ...(solarNote ? [solarNote] : []),
    ],
  });

  // Hour pillar: at 23:00–23:59 the comparator ALWAYS uses the next day's stem
  // (晚子時); under civil-midnight this engine keeps the current day's stem — a
  // school split, not an arithmetic disagreement.
  const hourSchoolSplit = effective.hour === 23 && convention.dayBoundary === "civil_midnight";
  const externalHour = ec.getTime();
  fields.push({
    field: "hourPillar",
    status: externalHour === internal.hour ? "pass" : hourSchoolSplit ? "warn" : "fail",
    source: "lunar-javascript",
    expected: externalHour,
    actual: internal.hour,
    blocking: false,
    notes: hourSchoolSplit
      ? ["23:00–23:59 hour-stem school split (晚子時 next-day stem vs civil-midnight current-day stem)."]
      : solarNote
        ? [solarNote]
        : undefined,
  });

  // INSTANT-based probe: birth UTC instant in the CST frame for year/month
  // (their boundaries are exact solar-term instants).
  const birthUtc = Date.UTC(birth.year, birth.month - 1, birth.day, birth.hour, birth.minute) - birth.tzOffsetMinutes * 60000;
  const instantLunar = solarAtCst(birthUtc).getLunar();

  const externalYear = instantLunar.getYearInGanZhiExact();
  fields.push({
    field: "yearPillar",
    status: externalYear === internal.year ? "pass" : "fail",
    source: "lunar-javascript",
    expected: externalYear,
    actual: internal.year,
    blocking: true,
  });

  const externalMonth = instantLunar.getMonthInGanZhiExact();
  fields.push({
    field: "monthPillar",
    status: externalMonth === internal.month ? "pass" : "fail",
    source: "lunar-javascript",
    expected: externalMonth,
    actual: internal.month,
    blocking: true,
  });

  return fields;
}
