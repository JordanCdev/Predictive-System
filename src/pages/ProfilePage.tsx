import { useNavigate, useSearchParams } from "react-router-dom";
import { CONVENTION_PRESETS, objectivePlain } from "../engine/index.ts";
import { Person, PersonalizeCard } from "../ui/PersonalizeCard.tsx";
import { YourChart } from "../ui/YourChart.tsx";
import { BoundaryNotice } from "../ui/BoundaryNotice.tsx";
import { TimeChain } from "../ui/TimeChain.tsx";
import { HowItWorks } from "../ui/HowItWorks.tsx";
import { ProfilePanel } from "../ui/ProfilePanel.tsx";
import { PeriodsPanel } from "../ui/PeriodsPanel.tsx";
import { useProfile } from "../ui/profile/ProfileContext.tsx";
import { useAuth } from "../ui/profile/AuthContext.tsx";
import { PeoplePanel } from "../ui/profile/PeoplePanel.tsx";
import { PrioritiesPanel } from "../ui/priorities/PrioritiesPanel.tsx";
import { BackupPanel } from "../ui/BackupPanel.tsx";
import { SELF_ID } from "../ui/profile/peopleStore.ts";
import { DEFAULT_TZ, TODAY_ISO } from "../ui/shared.ts";

/** Profile home base — sign in (when Firebase is configured), set/replace the
 *  stored birth chart, then read the full chart, insights, fit ranking and luck
 *  timeline in one place. Without Firebase it's stored only in this browser. */
export function ProfilePage() {
  const { person, setPerson, savePerson, activeStored, chart, dayun, currentAge, warnings, people, boundary, primaryPillars, timeChain, birthCivil, evaluate, personalized } =
    useProfile();
  const { enabled, user, signIn, signOut, error } = useAuth();
  const [params] = useSearchParams();
  const nav = useNavigate();

  // Arriving from the landing CTA ("Get my reading"). Open the form immediately
  // rather than making someone who already asked for a reading click through a
  // second "Add my birth details" upsell.
  const onboarding = params.get("start") === "1" && !person;

  // "What should we call you?" is a SELF question. When the active person is
  // someone else in the cast (a partner, a client), asking it here would let
  // the user type their own name and silently rename that other person —
  // their label already has a home in PeoplePanel.
  const activeIsSelf = !activeStored || activeStored.id === SELF_ID;

  const applyPerson = (p: Person, name?: string) => {
    const first = !person;
    // The optional name rides the SAME save path PeoplePanel uses — one storage
    // field, StoredPerson.label. An omitted name (convention switch from the
    // summary card) leaves the stored label alone; a deliberately emptied field
    // returns to the default "You". Never required — and ignored entirely when
    // the active person isn't the self (belt to the askName brace below).
    const label =
      name === undefined || !activeIsSelf ? activeStored?.label ?? "You" : name.trim() || "You";
    savePerson(p, { id: activeStored?.id ?? SELF_ID, label, relation: activeStored?.relation });
    // Deliver what the CTA promised: the first profile lands on the reading, not
    // back on a settings page.
    if (first) nav("/today");
  };

  // The name field is seeded with the current label, so editing birth details
  // doesn't quietly rename anyone. The default "You" reads as an empty field.
  const askName = activeIsSelf
    ? { initial: activeStored && activeStored.label !== "You" ? activeStored.label : "" }
    : undefined;

  // Focused setup: someone who clicked "Get my reading" and has no chart yet
  // sees ONE warm card, not a settings page. The moment a chart exists, the
  // full profile page below takes over. Presentation state only — no new route.
  if (onboarding) {
    return (
      <div style={{ maxWidth: 620, margin: "0 auto" }}>
        <div style={{ textAlign: "center", margin: "22px 0 16px" }}>
          <div className="seal sm" aria-hidden="true" style={{ margin: "0 auto 10px" }}>命</div>
          <h2 className="page-title" style={{ marginBottom: 6 }}>Plot your chart</h2>
          <p style={{ margin: "0 auto", fontSize: 14, color: "var(--muted)", maxWidth: 430, lineHeight: 1.55 }}>
            About two minutes, free — and your birth details stay in this browser. This is the one step that turns the
            almanac into your almanac.
          </p>
        </div>
        <PersonalizeCard
          key="onboarding"
          person={person}
          defaultTz={DEFAULT_TZ}
          presets={CONVENTION_PRESETS}
          startEditing
          applyLabel="See my reading"
          askName={askName}
          onApply={applyPerson}
          onClear={() => setPerson(null)}
          // Backing out of onboarding shouldn't strand the user between a
          // "plot your chart" header and the page's own setup upsell — return
          // them to the almanac-first daily view instead.
          onCancel={() => nav("/today")}
        />
        {enabled && !user && (
          <p style={{ textAlign: "center", marginTop: 14, fontSize: 13, color: "var(--muted)" }}>
            Already set up on another device?{" "}
            <button className="btn-text" onClick={signIn}>Sign in</button>
          </p>
        )}
        {error && <div className="warn" style={{ marginTop: 10 }}><span aria-hidden="true">⚠</span> {error}</div>}
      </div>
    );
  }

  return (
    <>
      <div className="page-head">
        <h2 className="page-title">Your profile</h2>
      </div>

      {enabled && (
        <div className="card" style={{ padding: 18, marginBottom: 12 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
            <div>
              <b style={{ fontSize: 15 }}>Account</b>
              <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--muted)", lineHeight: 1.5, maxWidth: 460 }}>
                {user
                  ? `Signed in as ${user.displayName ?? user.email}. Your birth profile syncs to your account across devices.`
                  : "Sign in to store your birth profile in your account and use it on any device. Your chart data stays private to your account."}
              </p>
            </div>
            {user ? (
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                {user.photoURL && <img src={user.photoURL} alt="" width={28} height={28} style={{ borderRadius: 999 }} referrerPolicy="no-referrer" />}
                <button className="btn-ghost" style={{ width: "auto", padding: "8px 16px" }} onClick={signOut}>Sign out</button>
              </div>
            ) : (
              <button className="btn" style={{ maxWidth: 230 }} onClick={signIn}>Sign in with Google</button>
            )}
          </div>
          {error && <div className="warn" style={{ marginTop: 10 }}><span aria-hidden="true">⚠</span> {error}</div>}
        </div>
      )}

      <p style={{ margin: "0 0 6px", fontSize: 13.5, color: "var(--muted)", lineHeight: 1.55 }}>
        Your birth chart powers every personalised reading. It's stored {enabled && user ? "in your account (and cached in this browser)" : "only in this browser"}
        {person ? "" : " — nothing is set yet"}.
      </p>
      <PersonalizeCard
        key="settings"
        person={person}
        defaultTz={DEFAULT_TZ}
        presets={CONVENTION_PRESETS}
        askName={askName}
        onApply={applyPerson}
        onClear={() => setPerson(null)}
      />

      {/* The other half of "who you are": the chart is fixed at birth, this is
          what you're working on now. High on the page because it's a profile
          fact, not a setting — and harmless when left empty. It only ever
          reorders what's surfaced; no day's classical score depends on it. */}
      <PrioritiesPanel />

      {/* Adding *other* people only makes sense once there's a "you" to compare
          against — offering it first reads as a confusing second empty slot. */}
      {people.length > 0 && <PeoplePanel />}

      {/* Above the chart, not buried under it: if the reading might hinge on a
          ten-minute recording error, say so before it's read. */}
      {chart && primaryPillars && <BoundaryNotice alternatives={boundary} primary={primaryPillars} />}

      {chart && <YourChart chart={chart} dayun={dayun} currentAge={currentAge} boundaryWarnings={warnings} />}

      {/* Profile insights — headline, traits, top moves, full fit ranking and Q&A.
          Opening a reading hands the objective to the date-finder via its ?q= search
          hook (free text the advisor parser resolves deterministically). */}
      {chart && (
        <div style={{ marginTop: 18 }}>
          <ProfilePanel
            chart={chart}
            evaluate={evaluate}
            defaultWindowDays={31}
            todayIso={TODAY_ISO}
            personalized={personalized}
            onOpenReading={(id) => nav(`/date-finder?q=${encodeURIComponent(objectivePlain(id).verb)}`)}
          />
        </div>
      )}

      {/* Luck cycle & outlook — the LuckTimeline scrubber keeps its existing
          luck_pillars gate, and non-current years their year_forecast gate. */}
      {chart && birthCivil && <PeriodsPanel chart={chart} dayun={dayun} birth={birthCivil} todayIso={TODAY_ISO} />}

      {chart && (
        <div className="card" style={{ padding: 18, marginTop: 18, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <b style={{ fontSize: 15 }}>Ask the advisor about your chart</b>
            <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--muted)", lineHeight: 1.5, maxWidth: 460 }}>
              Free-text questions, answered deterministically from this chart — timing, fit, and the reasoning behind both.
            </p>
          </div>
          <button className="btn" style={{ maxWidth: 260 }} onClick={() => nav("/chat")}>
            Ask the advisor about your chart ›
          </button>
        </div>
      )}

      {/* The most-disputed calculation in this field, shown as working. */}
      {chart && timeChain && <TimeChain {...timeChain} />}

      {/* Your data, in your hands — take a copy out, put one back. */}
      <BackupPanel />

      <HowItWorks />
    </>
  );
}
