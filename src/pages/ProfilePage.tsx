import { CONVENTION_PRESETS } from "../engine/index.ts";
import { PersonalizeCard } from "../ui/PersonalizeCard.tsx";
import { YourChart } from "../ui/YourChart.tsx";
import { HowItWorks } from "../ui/HowItWorks.tsx";
import { useProfile } from "../ui/profile/ProfileContext.tsx";
import { DEFAULT_TZ } from "../ui/shared.ts";

/** Profile & settings — set/replace the stored birth chart (in this browser). */
export function ProfilePage() {
  const { person, setPerson, chart, dayun, currentAge, warnings } = useProfile();
  return (
    <>
      <div className="page-head">
        <h2 className="page-title">Your profile</h2>
      </div>
      <p style={{ margin: "0 0 6px", fontSize: 13.5, color: "var(--muted)", lineHeight: 1.55 }}>
        Your birth chart powers every personalised reading. It's stored only in this browser
        {person ? "" : " — nothing is set yet"}.
      </p>
      <PersonalizeCard person={person} defaultTz={DEFAULT_TZ} presets={CONVENTION_PRESETS} onApply={setPerson} onClear={() => setPerson(null)} />

      {chart && <YourChart chart={chart} dayun={dayun} currentAge={currentAge} boundaryWarnings={warnings} />}

      <HowItWorks />
    </>
  );
}
