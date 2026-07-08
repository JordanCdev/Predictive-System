import { ReactNode, createContext, useCallback, useContext, useMemo, useState } from "react";
import {
  BaziChart,
  DaYun,
  DecisionRequest,
  DecisionResult,
  buildBaziChart,
  buildFourPillars,
  computeDaYun,
  evaluateDecision,
} from "../../engine/index.ts";
import { Person } from "../PersonalizeCard.tsx";
import { DEFAULT_TZ, TODAY_CIVIL, ageOn, birthCivilOf, buildRequest, canonicalFor } from "../shared.ts";

const PERSON_STORE = "wei_person_v1";

/** A structurally-valid Person needs at least a string birthDate + sex; anything
 *  else (corrupt/partial/legacy localStorage) is treated as "no profile" so a bad
 *  record can never crash the derived-chart computation. */
function isPerson(v: unknown): v is Person {
  const p = v as Partial<Person> | null;
  return !!p && typeof p.birthDate === "string" && (p.sex === "male" || p.sex === "female");
}

function loadPerson(): Person | null {
  try {
    const raw = localStorage.getItem(PERSON_STORE);
    const parsed = raw ? JSON.parse(raw) : null;
    return isPerson(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export interface ProfileValue {
  person: Person | null;
  setPerson: (p: Person | null) => void;
  /** Derived, memoised natal chart + luck cycle (null until a valid person is set). */
  chart: BaziChart | null;
  dayun: DaYun | null;
  birthCivil: { year: number; month: number; day: number } | null;
  currentAge: number | null;
  warnings: string[];
  personalized: boolean;
  tzOffset: number;
  /** Rank a window from today. */
  evaluate: (objectiveId: string, windowDays: number, options?: DecisionRequest["options"]) => DecisionResult;
  /** Evaluate an arbitrary window (planner day / week / month views). */
  evaluateWindow: (objectiveId: string, start: { year: number; month: number; day: number }, days: number, options?: DecisionRequest["options"]) => DecisionResult;
  /** Evaluate a single named day. */
  evaluateDay: (objectiveId: string, iso: string, options?: DecisionRequest["options"]) => DecisionResult;
}

const ProfileCtx = createContext<ProfileValue | null>(null);

export function ProfileProvider({ children }: { children: ReactNode }) {
  const [person, setPersonState] = useState<Person | null>(() => loadPerson());

  const setPerson = useCallback((p: Person | null) => {
    setPersonState(p);
    try {
      if (p) localStorage.setItem(PERSON_STORE, JSON.stringify(p));
      else localStorage.removeItem(PERSON_STORE);
    } catch {
      /* private mode — the in-memory profile still works this session */
    }
  }, []);

  // Derive the chart + luck cycle once per person, independent of any objective.
  // Defensive: a malformed persisted person must degrade to "no chart", never throw.
  const derived = useMemo(() => {
    try {
      const canonical = canonicalFor(person);
      if (!person || !canonical || !canonical.moment) {
        return { chart: null as BaziChart | null, dayun: null as DaYun | null, warnings: canonical?.warnings ?? [] };
      }
      const fp = buildFourPillars(canonical.moment, canonical.convention);
      return {
        chart: buildBaziChart(fp),
        dayun: computeDaYun(fp, person.sex),
        warnings: [...fp.meta.boundaryWarnings, ...canonical.warnings],
      };
    } catch {
      return { chart: null as BaziChart | null, dayun: null as DaYun | null, warnings: [] as string[] };
    }
  }, [person]);

  const evaluate = useCallback(
    (objectiveId: string, windowDays: number, options: DecisionRequest["options"] = { sweeps: false }) =>
      evaluateDecision(buildRequest(objectiveId, windowDays, person, options)),
    [person],
  );
  const evaluateWindow = useCallback(
    (objectiveId: string, start: { year: number; month: number; day: number }, days: number, options: DecisionRequest["options"] = { sweeps: false }) =>
      evaluateDecision(buildRequest(objectiveId, days, person, options, start)),
    [person],
  );
  const evaluateDay = useCallback(
    (objectiveId: string, iso: string, options: DecisionRequest["options"] = { sweeps: false }) => {
      const [y, m, d] = iso.split("-").map(Number);
      return evaluateDecision(buildRequest(objectiveId, 1, person, options, { year: y, month: m, day: d }));
    },
    [person],
  );

  const value: ProfileValue = useMemo(
    () => ({
      person,
      setPerson,
      chart: derived.chart,
      dayun: derived.dayun,
      birthCivil: person ? birthCivilOf(person.birthDate) : null,
      currentAge: person ? ageOn(person.birthDate) : null,
      warnings: derived.warnings,
      personalized: derived.chart !== null,
      tzOffset: person ? person.tzOffset : DEFAULT_TZ,
      evaluate,
      evaluateWindow,
      evaluateDay,
    }),
    [person, setPerson, derived, evaluate, evaluateWindow, evaluateDay],
  );

  return <ProfileCtx.Provider value={value}>{children}</ProfileCtx.Provider>;
}

export function useProfile(): ProfileValue {
  const v = useContext(ProfileCtx);
  if (!v) throw new Error("useProfile must be used within a ProfileProvider");
  return v;
}

export { TODAY_CIVIL, DEFAULT_TZ };
