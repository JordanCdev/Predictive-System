/**
 * One-call verification entry: cross-check a computed DecisionResult against
 * every available independent source and return a single VerificationReport
 * (docs/VERIFICATION.md).
 *
 * Checks performed:
 *  - the TOP recommendation's calendar facts vs lunar-javascript (pillars,
 *    officer, day god, clash, 宜/忌 advisory);
 *  - the subject's natal pillars vs lunar-javascript's EightChar (when
 *    personalized);
 *  - the solar-term boundaries bracketing the top day vs the HKO fixture.
 *
 * External sources verify TIME and CALENDAR facts only — never outcomes. The
 * caller supplies `checkedAtIso` so the engine itself stays wall-clock-free.
 *
 * This module imports lunar-javascript transitively — load it via dynamic
 * import in the app so the comparator stays out of the main bundle.
 */

import { DecisionRequest, DecisionResult } from "../decision.ts";
import { jieWindowAround } from "../astronomy.ts";
import { buildFourPillars } from "../sexagenary.ts";
import { FieldAgreement, VerificationReport, VerificationSource } from "./types.ts";
import { buildVerificationReport } from "./verificationReport.ts";
import { lunarJavascriptSource, verifyCandidateDay, verifyNatalChart } from "./verifyLunarJavascript.ts";
import { hkoSource, verifyTermsAround } from "./verifySolarTerms.ts";

export { applyVerificationReport } from "./verificationReport.ts";

export async function verifyDecisionResult(
  req: DecisionRequest,
  result: DecisionResult,
  checkedAtIso: string,
): Promise<VerificationReport> {
  const target = result.recommendations[0] ?? result.allDays[0];
  const fields: FieldAgreement[] = [];
  const sources: VerificationSource[] = [
    { id: "internal", sourceLabel: "internal deterministic engine", checkedAtIso },
    lunarJavascriptSource(checkedAtIso),
  ];

  if (!target) {
    const s = req.window.start;
    const windowStartIso = `${s.year}-${String(s.month).padStart(2, "0")}-${String(s.day).padStart(2, "0")}`;
    return buildVerificationReport(
      {
        engineVersion: result.meta.engineVersions.engine,
        calculationHash: result.meta.calculationHash,
        dateIso: windowStartIso,
        objectiveId: result.meta.objectiveId,
        conventionId: result.meta.conventionId,
      },
      sources,
      fields,
    );
  }

  const tz = req.window.tzOffsetMinutes;
  const noonUtc = Date.UTC(target.civil.year, target.civil.month - 1, target.civil.day, 12) - tz * 60000;
  const jw = jieWindowAround(noonUtc);
  const nearJieBoundary =
    Math.min(Math.abs(noonUtc - jw.prev.millis), Math.abs(jw.next.millis - noonUtc)) < 36 * 3600000;

  // 1. Top day's calendar facts vs lunar-javascript.
  fields.push(
    ...verifyCandidateDay({
      civil: target.civil,
      tongshu: target.tongshu,
      tzOffsetMinutes: tz,
      primaryTag: req.objective.primaryTag,
      nearJieBoundary,
    }),
  );

  // 2. Natal pillars vs lunar-javascript EightChar (when personalized). The
  //    comparator receives the engine's solar-corrected effective wall-clock so
  //    an hour-basis convention it cannot express is not misread as an error.
  if (req.birth) {
    const fp = buildFourPillars(req.birth, req.convention);
    fields.push(
      ...verifyNatalChart(
        req.birth,
        req.convention,
        {
          year: fp.year.hanzi,
          month: fp.month.hanzi,
          day: fp.day.hanzi,
          hour: fp.hour.hanzi,
        },
        fp.meta.normalized.effective,
      ),
    );
  }

  // 3. Solar-term boundaries around the top day vs HKO published times. The
  //    fixture is always CONSULTED (so it always appears in sources — every
  //    field referencing "hko" must resolve); whether it was COMPARABLE for
  //    this date is what its fields' unsupported status and sourceCoverage say.
  fields.push(...verifyTermsAround(noonUtc));
  sources.push(hkoSource());

  return buildVerificationReport(
    {
      engineVersion: result.meta.engineVersions.engine,
      calculationHash: result.meta.calculationHash,
      dateIso: target.isoDate,
      objectiveId: result.meta.objectiveId,
      conventionId: result.meta.conventionId,
    },
    sources,
    fields,
  );
}
