/**
 * Group date finder — one day that has to work for everyone involved.
 *
 * The honesty rule from `engine/group.ts` carries all the way to the screen: the
 * headline number is the *worst* reading in the party, and anyone the day is
 * vetoed for removes it entirely. A day is never presented as good for the group
 * because it averages well.
 */
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  MAX_WINDOW_DAYS,
  OBJECTIVES,
  WINDOW_DAYS,
  combineGroupDays,
  groupVerdictLine,
  objectivePlain,
  rankGroupDays,
  shortDate,
  verdictBand,
  windowPlain,
} from "../engine/index.ts";
import type { GroupDay } from "../engine/group.ts";
import { useProfile } from "../ui/profile/ProfileContext.tsx";
import { useEntitlements } from "../ui/profile/EntitlementsContext.tsx";
import { UpgradePrompt } from "../ui/billing/UpgradePrompt.tsx";
import { NeedsProfile } from "./NeedsProfile.tsx";

const LADDER = WINDOW_DAYS as readonly number[];

export function GroupPage() {
  const { usablePeople, evaluateFor } = useProfile();
  const { can, clamp } = useEntitlements();

  const [objectiveId, setObjectiveId] = useState(OBJECTIVES[0].id);
  const [windowDays, setWindowDays] = useState(92);
  const [selected, setSelected] = useState<string[]>(() => usablePeople.map((p) => p.id));

  const toggle = (id: string) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  // The plan's horizon still applies here, so a Free user can't reach a five-year
  // window through this page when the date finder caps them at two months.
  const { days: effectiveWindow, capped } = clamp(windowDays);

  const party = useMemo(
    () => usablePeople.filter((p) => selected.includes(p.id)),
    [usablePeople, selected],
  );

  const ranked = useMemo(() => {
    if (party.length < 2) return null;
    const members = party.map((p) => ({
      id: p.id,
      label: p.label,
      result: evaluateFor(p, objectiveId, effectiveWindow),
    }));
    const all = combineGroupDays(members);
    return { all, best: rankGroupDays(all).slice(0, 12) };
  }, [party, objectiveId, effectiveWindow, evaluateFor]);

  if (usablePeople.length === 0) return <NeedsProfile what="find a date for a group" />;

  if (!can("group_dates")) {
    return (
      <>
        <Head />
        <UpgradePrompt feature="group_dates" />
        <p className="ask-note" style={{ marginTop: 12 }}>
          Your own readings are unaffected — this only adds other people's charts to the same search.
        </p>
      </>
    );
  }

  const ruledOutCount = ranked ? ranked.all.length - ranked.all.filter((d) => !d.ruledOut).length : 0;

  return (
    <>
      <Head />

      <div className="card" style={{ padding: 18 }}>
        <div className="group-controls">
          <label className="field">
            <span>What are you timing?</span>
            <select value={objectiveId} onChange={(e) => setObjectiveId(e.target.value)}>
              {OBJECTIVES.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.emoji} {o.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>How far ahead?</span>
            <select value={windowDays} onChange={(e) => setWindowDays(Number(e.target.value))}>
              {LADDER.filter((d) => d <= MAX_WINDOW_DAYS).map((d) => (
                <option key={d} value={d}>
                  {windowPlain(d)}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="group-who">
          <span className="group-who-label">Who's involved?</span>
          <div className="group-chips">
            {usablePeople.map((p) => (
              <button
                key={p.id}
                className={`chip ${selected.includes(p.id) ? "on" : "ghost"}`}
                aria-pressed={selected.includes(p.id)}
                onClick={() => toggle(p.id)}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {capped && (
          <div className="warn" style={{ marginTop: 10 }}>
            <span aria-hidden="true">⚠</span> Your plan searches {windowPlain(effectiveWindow)}; the longer window needs Pro.
          </div>
        )}
      </div>

      {party.length < 2 ? (
        <p className="ask-note" style={{ marginTop: 14 }}>
          Pick at least two people. {usablePeople.length < 2 && (
            <>
              You've only stored one chart so far — <Link className="btn-text" style={{ padding: 0 }} to="/settings/profile">add someone</Link> to compare.
            </>
          )}
        </p>
      ) : !ranked || ranked.best.length === 0 ? (
        <div className="card" style={{ padding: 20, marginTop: 14 }}>
          <b>No day in {windowPlain(effectiveWindow)} works for everyone.</b>
          <p style={{ margin: "8px 0 0", fontSize: 13.5, color: "var(--muted)", lineHeight: 1.55 }}>
            Every day in this window is ruled out for at least one person in the party. That's a real answer, not a
            failure — widen the window, or reconsider who must be present.
          </p>
        </div>
      ) : (
        <>
          <div className="section-title" style={{ marginTop: 18 }}>
            Best for all {party.length} · {objectivePlain(objectiveId).gerund.toLowerCase()}
          </div>
          <ul className="group-days">
            {ranked.best.map((day) => (
              <GroupDayRow key={day.isoDate} day={day} />
            ))}
          </ul>
          {ruledOutCount > 0 && (
            <p className="ask-note" style={{ marginTop: 10 }}>
              {ruledOutCount} {ruledOutCount === 1 ? "day was" : "days were"} removed because the day is vetoed for
              someone in the party.
            </p>
          )}
        </>
      )}

      <div className="ask-note" style={{ marginTop: 14 }}>
        A group day is only as good as its weakest reading — the score shown is the lowest in the party, never the
        average. Tendencies, not predictions. One input among many.
      </div>
    </>
  );
}

function Head() {
  return (
    <div className="page-head">
      <h2 className="page-title">A date for everyone</h2>
      <Link className="btn-text" to="/date-finder">Just for me</Link>
    </div>
  );
}

function GroupDayRow({ day }: { day: GroupDay }) {
  const band = verdictBand(day.groupScore);
  return (
    <li className={`group-day consensus-${day.consensus}`}>
      <div className="group-day-head">
        <div>
          <b className="group-day-date">{shortDate(day.civil)}</b>
          <span className="group-day-verdict">{groupVerdictLine(day)}</span>
        </div>
        <div className="group-day-score" title="The lowest score in the party">
          <b>{day.groupScore}</b>
          <span>{band.label}</span>
        </div>
      </div>
      <div className="group-day-members">
        {day.members
          .slice()
          .sort((a, b) => a.score - b.score)
          .map((m) => (
            <span key={m.id} className={`member-pill${m.score === day.groupScore ? " binding" : ""}`} title={m.reason ?? undefined}>
              {m.label} <b>{m.score}</b>
            </span>
          ))}
      </div>
    </li>
  );
}
