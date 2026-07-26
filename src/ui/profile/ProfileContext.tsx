import { ReactNode, createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  BaziChart,
  DaYun,
  DecisionRequest,
  DecisionResult,
  buildBaziChart,
  buildFourPillars,
  boundaryAlternatives,
  computeDaYun,
  evaluateDecision,
} from "../../engine/index.ts";
import type { BoundaryAlternative } from "../../engine/index.ts";
import type { TimeChainInput } from "../TimeChain.tsx";
import { Person } from "../PersonalizeCard.tsx";
import { healBirthTimezone } from "../birthZoneDefaults.ts";
import { DEFAULT_TZ, TODAY_CIVIL, ageOn, birthCivilOf, buildRequest, canonicalFor } from "../shared.ts";
import { useAuth } from "./AuthContext.tsx";
import {
  EMPTY_PEOPLE,
  PeopleState,
  SELF_ID,
  StoredPerson,
  activePerson,
  allowedPeople,
  isPersonLocked,
  migrate,
  newPersonId,
  removePerson as removeFrom,
  setActive as setActiveIn,
  upsertPerson,
} from "./peopleStore.ts";

/** Legacy single-profile key. Still written for the active person so an older
 *  build (or a rollback) keeps finding a profile where it expects one. */
const PERSON_STORE = "wei_person_v1";
const PEOPLE_STORE = "wei_people_v1";

/** Structural cap on stored people — a generous storage sanity bound that
 *  applies to everyone. Not a plan limit; there are no plans. */
const PROFILE_LIMIT = 12;

/** The engine's search horizon (~5 years + a leap day of slack). A performance
 *  boundary enforced for every caller — never a paywall. */
const ENGINE_MAX_WINDOW_DAYS = 1827;

/** Clamp a requested window to the engine boundary (same semantics the old
 *  horizon clamp used: floor, then bound to [1, max]). */
const clampWindow = (requestedDays: number) => Math.max(1, Math.min(Math.floor(requestedDays), ENGINE_MAX_WINDOW_DAYS));

function readJson(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function loadPeople(): PeopleState {
  return migrate(readJson(PEOPLE_STORE), readJson(PERSON_STORE));
}

/**
 * Heal stale birth tz offsets on load.
 *
 *  - `birthZone` set, not manual → re-resolve the offset for the birth DATE
 *    (rule changes, or records saved before the resolver existed).
 *  - NO `birthZone`, not manual → a legacy profile seeded with the device's
 *    then-current offset (the corrupted population): adopt the device zone and
 *    resolve properly.
 *  - `tzManual` profiles are never touched.
 *
 * Returns the same state object when nothing changed, so callers persist the
 * healed record only when there is actually something to heal.
 */
function healPeopleState(state: PeopleState, fallbackZone?: string | null): { state: PeopleState; changed: boolean } {
  let changed = false;
  const people = state.people.map((p) => {
    const healed = fallbackZone === undefined ? healBirthTimezone(p) : healBirthTimezone(p, fallbackZone);
    if (healed !== p) changed = true;
    return healed;
  });
  return { state: changed ? { ...state, people } : state, changed };
}

function persist(state: PeopleState) {
  try {
    localStorage.setItem(PEOPLE_STORE, JSON.stringify(state));
    const active = activePerson(state);
    if (active) localStorage.setItem(PERSON_STORE, JSON.stringify(active));
    else localStorage.removeItem(PERSON_STORE);
  } catch {
    /* private mode — the in-memory cast still works this session */
  }
}

export interface ProfileValue {
  /** The active person, in the shape the engine and every existing panel expect. */
  person: Person | null;
  /** Replace the active person (or clear the profile entirely). */
  setPerson: (p: Person | null) => void;

  // ── the cast ───────────────────────────────────────────────────────────────
  /** Everyone stored, including any beyond the structural cap. */
  people: StoredPerson[];
  /** Those within the structural cap — the usable cast. */
  usablePeople: StoredPerson[];
  activeId: string | null;
  activeStored: StoredPerson | null;
  /** True when the structural profile cap is reached — drives the plain cap note. */
  atProfileLimit: boolean;
  profileLimit: number;
  isLocked: (id: string) => boolean;
  selectPerson: (id: string) => void;
  savePerson: (p: Person, meta: { id?: string; label: string; relation?: string }) => void;
  deletePerson: (id: string) => void;

  /** Derived, memoised natal chart + luck cycle (null until a valid person is set). */
  chart: BaziChart | null;
  dayun: DaYun | null;
  birthCivil: { year: number; month: number; day: number } | null;
  currentAge: number | null;
  warnings: string[];
  /** Both candidate charts when the birth sits on a pillar boundary. Empty when
   *  the chart is unambiguous — the common case. */
  boundary: BoundaryAlternative[];
  /** The active chart's four pillars, year→hour, for side-by-side comparison. */
  primaryPillars: [string, string, string, string] | null;
  /** Everything the "how your birth time was read" panel needs, or null. */
  timeChain: TimeChainInput | null;
  personalized: boolean;
  tzOffset: number;
  /** Rank a window from today. */
  evaluate: (objectiveId: string, windowDays: number, options?: DecisionRequest["options"]) => DecisionResult;
  /** Evaluate an arbitrary window (planner day / week / month views). */
  evaluateWindow: (objectiveId: string, start: { year: number; month: number; day: number }, days: number, options?: DecisionRequest["options"]) => DecisionResult;
  /** Evaluate a single named day. */
  evaluateDay: (objectiveId: string, iso: string, options?: DecisionRequest["options"]) => DecisionResult;
  /** Evaluate a window for an arbitrary person — the group date finder scores the
   *  same window once per participant and combines the results. */
  evaluateFor: (person: Person, objectiveId: string, windowDays: number, options?: DecisionRequest["options"]) => DecisionResult;
}

const ProfileCtx = createContext<ProfileValue | null>(null);

export function ProfileProvider({ children }: { children: ReactNode }) {
  // Heal once per mount; `boot.changed` says whether the stored record needed it.
  const [boot] = useState(() => healPeopleState(loadPeople()));
  const [state, setState] = useState<PeopleState>(boot.state);
  // Persist the healed offsets so the correction sticks (and older tabs reading
  // the legacy key see it too). Only when something actually changed.
  useEffect(() => {
    if (boot.changed) persist(boot.state);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const { enabled, user } = useAuth();

  const profileLimit = PROFILE_LIMIT;

  /** Apply a state change: persist locally, then write through to the cloud. */
  const commit = useCallback(
    (next: PeopleState) => {
      setState(next);
      persist(next);
      if (enabled && user) {
        import("../../firebase/client.ts")
          .then((m) => m.savePeople(user.uid, next))
          .catch(() => {});
      }
    },
    [enabled, user],
  );

  // Hydrate from the cloud on sign-in; if the account has nothing stored yet but
  // this browser does, push the local cast up (first-time migration).
  useEffect(() => {
    if (!enabled || !user) return;
    let cancelled = false;
    (async () => {
      try {
        const m = await import("../../firebase/client.ts");
        const cloud = await m.loadPeople(user.uid);
        if (cancelled) return;
        // Cloud records can carry the same stale offsets local ones did — heal
        // them through the identical path before they become the active cast.
        // NO device fallback here: a cloud record is opened on many devices, and
        // baking whichever device loads it first into the shared record would
        // give the same profile different pillars per device. Only records that
        // carry their own zone (or a known city) heal deterministically.
        const merged = healPeopleState(migrate(cloud, null), null).state;
        if (merged.people.length > 0) {
          setState(merged);
          persist(merged);
        } else if (state.people.length > 0) {
          m.savePeople(user.uid, state).catch(() => {});
        }
      } catch {
        /* keep the local cast */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, user]); // eslint-disable-line react-hooks/exhaustive-deps

  const usablePeople = useMemo(() => allowedPeople(state, profileLimit), [state, profileLimit]);

  // Defensive: if the active person somehow sits beyond the structural cap,
  // fall back to one inside it rather than reading an out-of-cap chart.
  useEffect(() => {
    if (!state.activeId || usablePeople.length === 0) return;
    if (usablePeople.some((p) => p.id === state.activeId)) return;
    setState((s) => setActiveIn(s, usablePeople[0].id));
  }, [state.activeId, usablePeople]);

  const active = useMemo(() => activePerson(state), [state]);

  const setPerson = useCallback(
    (p: Person | null) => {
      if (!p) {
        // "Clear my profile" removes the active person only, not the whole cast.
        commit(active ? removeFrom(state, active.id) : EMPTY_PEOPLE);
        return;
      }
      const id = active?.id ?? SELF_ID;
      const label = active?.label ?? "You";
      commit(upsertPerson(state, { ...p, id, label, relation: active?.relation }));
    },
    [active, state, commit],
  );

  const savePerson = useCallback(
    (p: Person, meta: { id?: string; label: string; relation?: string }) => {
      const id = meta.id ?? newPersonId(`${Date.now()}${state.people.length}`);
      commit(upsertPerson(state, { ...p, id, label: meta.label.trim() || "Unnamed", relation: meta.relation }));
    },
    [state, commit],
  );

  // commit() writes the whole cast, so removal needs no separate cloud call.
  const deletePerson = useCallback((id: string) => commit(removeFrom(state, id)), [state, commit]);

  const selectPerson = useCallback(
    (id: string) => {
      if (isPersonLocked(state, id, profileLimit)) return; // beyond the structural cap
      commit(setActiveIn(state, id));
    },
    [state, commit, profileLimit],
  );

  // Derive the chart + luck cycle once per active person, independent of any
  // objective. Defensive: a malformed record must degrade to "no chart", never throw.
  const derived = useMemo(() => {
    try {
      const canonical = canonicalFor(active);
      if (!active || !canonical || !canonical.moment) {
        return {
          chart: null as BaziChart | null,
          dayun: null as DaYun | null,
          warnings: canonical?.warnings ?? [],
          boundary: [] as BoundaryAlternative[],
          primaryPillars: null,
          timeChain: null as TimeChainInput | null,
        };
      }
      const fp = buildFourPillars(canonical.moment, canonical.convention);
      return {
        chart: buildBaziChart(fp),
        dayun: computeDaYun(fp, active.sex),
        warnings: [...fp.meta.boundaryWarnings, ...canonical.warnings],
        boundary: boundaryAlternatives(canonical.moment, canonical.convention, fp),
        primaryPillars: [fp.year.hanzi, fp.month.hanzi, fp.day.hanzi, fp.hour.hanzi] as [string, string, string, string],
        timeChain: {
          recordedTime: active.timeCertainty === "hour_unknown" ? "—" : active.birthTime,
          tzOffsetMinutes: active.tzOffset,
          birthCity: active.birthCity,
          longitudeEast: active.longitudeEast,
          solarCorrectionMinutes: fp.meta.normalized.solarCorrectionMinutes,
          effective: fp.meta.normalized.effective,
          convention: canonical.convention,
          hourPillar: fp.hour.hanzi,
          timeUnknown: active.timeCertainty === "hour_unknown",
        } as TimeChainInput,
      };
    } catch {
      return {
        chart: null as BaziChart | null,
        dayun: null as DaYun | null,
        warnings: [] as string[],
        boundary: [] as BoundaryAlternative[],
        primaryPillars: null,
        timeChain: null as TimeChainInput | null,
      };
    }
  }, [active]);

  // The engine's window boundary is enforced HERE, at the shared evaluator, not
  // at each call site — the AI advisor's find_best_days tool, the ProfilePanel
  // ask box and any future caller all pass through it by construction. It is a
  // performance boundary (~5 years is the deterministic search horizon), the
  // same for everyone.
  const evaluate = useCallback(
    (objectiveId: string, windowDays: number, options: DecisionRequest["options"] = { sweeps: false }) =>
      evaluateDecision(buildRequest(objectiveId, clampWindow(windowDays), active, options)),
    [active],
  );
  const evaluateWindow = useCallback(
    (objectiveId: string, start: { year: number; month: number; day: number }, days: number, options: DecisionRequest["options"] = { sweeps: false }) =>
      evaluateDecision(buildRequest(objectiveId, clampWindow(days), active, options, start)),
    [active],
  );
  const evaluateDay = useCallback(
    (objectiveId: string, iso: string, options: DecisionRequest["options"] = { sweeps: false }) => {
      const [y, m, d] = iso.split("-").map(Number);
      return evaluateDecision(buildRequest(objectiveId, 1, active, options, { year: y, month: m, day: d }));
    },
    [active],
  );
  const evaluateFor = useCallback(
    (p: Person, objectiveId: string, windowDays: number, options: DecisionRequest["options"] = { sweeps: false }) =>
      evaluateDecision(buildRequest(objectiveId, clampWindow(windowDays), p, options)),
    [],
  );

  const value: ProfileValue = useMemo(
    () => ({
      person: active,
      setPerson,
      people: state.people,
      usablePeople,
      activeId: state.activeId,
      activeStored: active,
      atProfileLimit: state.people.length >= profileLimit,
      profileLimit,
      isLocked: (id: string) => isPersonLocked(state, id, profileLimit),
      selectPerson,
      savePerson,
      deletePerson,
      chart: derived.chart,
      dayun: derived.dayun,
      birthCivil: active ? birthCivilOf(active.birthDate) : null,
      currentAge: active ? ageOn(active.birthDate) : null,
      warnings: derived.warnings,
      boundary: derived.boundary,
      primaryPillars: derived.primaryPillars,
      timeChain: derived.timeChain,
      personalized: derived.chart !== null,
      tzOffset: active ? active.tzOffset : DEFAULT_TZ,
      evaluate,
      evaluateWindow,
      evaluateDay,
      evaluateFor,
    }),
    [
      active,
      setPerson,
      state,
      usablePeople,
      profileLimit,
      selectPerson,
      savePerson,
      deletePerson,
      derived,
      evaluate,
      evaluateWindow,
      evaluateDay,
      evaluateFor,
    ],
  );

  return <ProfileCtx.Provider value={value}>{children}</ProfileCtx.Provider>;
}

export function useProfile(): ProfileValue {
  const v = useContext(ProfileCtx);
  if (!v) throw new Error("useProfile must be used within a ProfileProvider");
  return v;
}

export { TODAY_CIVIL, DEFAULT_TZ };
