/**
 * Third-party verification model (docs/VERIFICATION.md).
 *
 * A VerificationReport records, field by field, how an independently computed
 * source (lunar-javascript, HKO solar-term tables, JPL Horizons) agrees with
 * this engine's output. External sources can verify TIME and CALENDAR facts —
 * never whether an undertaking will succeed. Types only; no runtime deps.
 */

export type VerificationStatus = "pass" | "warn" | "fail" | "unsupported";

export type VerificationField =
  | "yearPillar"
  | "monthPillar"
  | "dayPillar"
  | "hourPillar"
  | "solarTermName"
  | "solarTermInstant"
  | "solarLongitude"
  | "officer12"
  | "dayGod12"
  | "clash"
  | "yi"
  | "ji"
  | "topRecommendation"
  | "bestHour";

export type VerificationSourceId = "internal" | "lunar-javascript" | "jpl-horizons" | "hko";

export interface VerificationSource {
  id: VerificationSourceId;
  version?: string;
  sourceLabel: string;
  sourceUrl?: string;
  /** ISO instant/date the comparison data was produced or retrieved. */
  checkedAtIso: string;
}

export interface FieldAgreement<T = unknown> {
  field: VerificationField;
  status: VerificationStatus;
  source: VerificationSourceId;
  expected?: T;
  actual?: T;
  /** Numeric or textual distance, e.g. seconds of time, or "jaccard=0.67". */
  delta?: number | string;
  threshold?: number | string;
  /** Blocking fields (exact calendar facts) fail the whole report on mismatch. */
  blocking: boolean;
  notes?: string[];
}

export interface VerificationReport {
  engineVersion: string;
  calculationHash: string;
  /** The civil day (or window start) the report covers. */
  dateIso: string;
  objectiveId: string;
  conventionId: string;
  sources: VerificationSource[];
  fields: FieldAgreement[];
  /** 0–100 weighted agreement across checked fields (unsupported excluded). */
  overallAgreementScore: number;
  blockingDisagreements: string[];
  nonBlockingDisagreements: string[];
  warnings: string[];
}
