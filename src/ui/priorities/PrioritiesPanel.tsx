/**
 * "What matters to you right now" — the priority profile card.
 *
 * The complement to the birth chart: the chart says who you are, this says what
 * you're actually trying to do. It is short by design (a ranking, two lines, a
 * little optional context) because the alternative — a questionnaire — collects
 * sensitive data the app has no business holding.
 *
 * The one sentence this card must always carry is the promise in `.pri-rule`:
 * priorities change what is SURFACED and in what order, never the classical
 * score of a day. Everything here is a modern product feature, plainly labelled
 * as such, and nothing is ever inferred — suggestions are accepted by hand.
 */
import { useEffect, useRef, useState } from "react";
import type { LifeAreaKey } from "../../engine/index.ts";
import { areaSignalId } from "./dismissedSignals.ts";
import {
  MAX_CONTEXT_CHARS,
  MAX_INTENTION_CHARS,
  PRIORITIES_STORE_KEY,
  PRIORITY_AREAS,
  PriorityAiConsent,
  PriorityProfile,
  addArea,
  areaLabel,
  clearPriorities,
  freshness,
  isEmptyProfile,
  loadPriorities,
  moveArea,
  removeAcceptedSignal,
  removeArea,
  savePriorities,
  setAiConsent,
  setContext,
  setIntention,
  touchPriorities,
  unrankedAreas,
} from "./prioritiesStore.ts";

/** What each consent flag actually hands to the advisor, in plain words. */
const CONSENT_COPY: { field: keyof PriorityAiConsent; label: string; blurb: string }[] = [
  { field: "areas", label: "My ranked areas", blurb: "Which of the four life areas you put first — e.g. “wealth, then career”." },
  { field: "intentions", label: "My intentions", blurb: "The one or two lines you wrote above, word for word." },
  {
    field: "context",
    label: "My context",
    blurb: "Life stage, occupation and what's coming up — free text that can get personal, so this one is off unless you turn it on.",
  },
  {
    field: "journal",
    label: "Counts from my decision journal",
    blurb:
      "How many decisions you've saved in each life area, and how many you logged an outcome for — counts only, never the text of a note or what the decision was about. This is your behaviour rather than something you told us, so it's off unless you turn it on.",
  },
];

const CONTEXT_FIELDS: { key: "lifeStage" | "occupation" | "comingUp"; label: string; placeholder: string }[] = [
  { key: "lifeStage", label: "Life stage", placeholder: "e.g. early career, raising young kids, winding down" },
  { key: "occupation", label: "Occupation", placeholder: "e.g. founder, nurse, student" },
  { key: "comingUp", label: "What's coming up", placeholder: "e.g. a move in the spring, a hearing in June" },
];

export function PrioritiesPanel() {
  const [profile, setProfile] = useState<PriorityProfile>(() => loadPriorities());
  // One clock read, at mount, for the freshness nudge. A UI wall-clock read —
  // never the engine's (the engine has no clock).
  const [mountedAt] = useState(() => Date.now());
  const [intentDrafts, setIntentDrafts] = useState<string[]>(() => {
    const p = loadPriorities();
    return [p.intentions[0] ?? "", p.intentions[1] ?? ""];
  });
  const [contextDrafts, setContextDrafts] = useState<Record<string, string>>(() => {
    const c = loadPriorities().context;
    return { lifeStage: c.lifeStage ?? "", occupation: c.occupation ?? "", comingUp: c.comingUp ?? "" };
  });
  /** Announced to screen readers after a reorder, which is otherwise silent. */
  const [announce, setAnnounce] = useState("");

  /** Set while THIS panel is writing, so the store's own change ping doesn't
   *  bounce back and stamp on drafts the user is still typing into. */
  const writing = useRef(false);

  /** Replace everything on screen with what is actually in storage. */
  const hydrate = (next: PriorityProfile) => {
    setProfile(next);
    setIntentDrafts([next.intentions[0] ?? "", next.intentions[1] ?? ""]);
    setContextDrafts({
      lifeStage: next.context.lifeStage ?? "",
      occupation: next.context.occupation ?? "",
      comingUp: next.context.comingUp ?? "",
    });
  };

  /**
   * The stored profile can change under this panel — another tab, or a backup
   * RESTORE that rewrites the record wholesale. Without this the next click here
   * would save a pre-restore snapshot straight back over it. Same subscription
   * `usePriorities` has: the store re-emits `storage` in this tab, and the
   * browser fires it natively for other ones.
   */
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (writing.current) return; // our own save, already reflected
      if (e.key !== null && e.key !== PRIORITIES_STORE_KEY) return;
      hydrate(loadPriorities());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  /** Every change is an explicit user action, so each one persists immediately —
   *  there is no half-saved state to lose. */
  const commit = (next: PriorityProfile) => {
    // savePriorities pings synchronously; the flag keeps that ping from
    // re-hydrating (and so discarding) a context field the user is mid-edit on.
    writing.current = true;
    let saved: PriorityProfile;
    try {
      saved = savePriorities(next, Date.now());
    } finally {
      writing.current = false;
    }
    setProfile(saved);
    setIntentDrafts([saved.intentions[0] ?? "", saved.intentions[1] ?? ""]);
    return saved;
  };

  const fresh = freshness(profile, mountedAt);
  const ranked = profile.areas;
  const spare = unrankedAreas(profile);
  const empty = isEmptyProfile(profile);

  const move = (key: LifeAreaKey, delta: -1 | 1) => {
    const next = commit(moveArea(profile, key, delta));
    const pos = next.areas.indexOf(key);
    if (pos >= 0) setAnnounce(`${areaLabel(key)} moved to position ${pos + 1} of ${next.areas.length}.`);
  };

  const commitContext = (key: "lifeStage" | "occupation" | "comingUp") => {
    const saved = commit(setContext(profile, { [key]: contextDrafts[key] }));
    // Show what was actually stored (trimmed, length-capped) rather than the raw draft.
    setContextDrafts({ ...contextDrafts, [key]: saved.context[key] ?? "" });
  };

  const contextCount = CONTEXT_FIELDS.filter((f) => profile.context[f.key]).length;

  return (
    <div className="card pri-panel">
      <div className="pri-head">
        <span className="seal sm" aria-hidden="true">志</span>
        <div>
          <h3>What matters to you right now</h3>
          <p className="pri-lede">
            Your chart says who you are. This says what you're working on — so the app can lead with the readings you
            actually came for.
          </p>
        </div>
      </div>

      {/* Load-bearing honesty. This sentence is the whole contract of the feature. */}
      <p className="pri-rule">
        This shapes what the app shows you first — it never changes a day's classical score.
      </p>

      {fresh.needsReview && (
        <div className="pri-nudge">
          <span>
            You last set these about {fresh.ageMonths} months ago. Does this still hold? Nothing has changed on its
            own — edit anything below, or confirm it's still right.
          </span>
          <button className="btn-ghost pri-nudge-btn" onClick={() => commit(touchPriorities(profile, Date.now()))}>
            Still accurate
          </button>
        </div>
      )}

      {/* ── the ranking ─────────────────────────────────────────────────── */}
      <h4 className="pri-sub">Your priorities, in order</h4>
      <p className="pri-help">
        Rank the areas the app already reads — most important first. It's an order, not a score.
      </p>

      {ranked.length > 0 ? (
        <ol className="pri-rank">
          {ranked.map((key, i) => (
            <li key={key} className="pri-row">
              <span className="pri-num" aria-hidden="true">{i + 1}</span>
              <span className="pri-name">
                {areaLabel(key)}
                <span className="pri-hz" aria-hidden="true">
                  {PRIORITY_AREAS.find((a) => a.key === key)?.hanzi}
                </span>
              </span>
              <span className="pri-move">
                <button
                  className="pri-move-btn"
                  onClick={() => move(key, -1)}
                  disabled={i === 0}
                  aria-label={`Move ${areaLabel(key)} up`}
                  title="Move up"
                >
                  <span aria-hidden="true">↑</span>
                </button>
                <button
                  className="pri-move-btn"
                  onClick={() => move(key, 1)}
                  disabled={i === ranked.length - 1}
                  aria-label={`Move ${areaLabel(key)} down`}
                  title="Move down"
                >
                  <span aria-hidden="true">↓</span>
                </button>
                <button
                  className="btn-text"
                  onClick={() => {
                    // Symmetric with the journal's Add, which writes BOTH the
                    // ranking and the accepted signal. Dropping only the ranking
                    // would leave the signal behind, and that orphan silently
                    // suppresses the suggestion card for this area for good.
                    commit(removeAcceptedSignal(removeArea(profile, key), areaSignalId(key)));
                    setAnnounce(`${areaLabel(key)} removed from your priorities.`);
                  }}
                  aria-label={`Remove ${areaLabel(key)} from your priorities`}
                >
                  Remove
                </button>
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="pri-empty">Nothing ranked yet — and that's fine. The app works exactly the same without it.</p>
      )}

      {spare.length > 0 && (
        <div className="pri-add-row">
          {spare.map((key) => (
            <button
              key={key}
              className="chip ghost"
              onClick={() => {
                const next = commit(addArea(profile, key));
                setAnnounce(`${areaLabel(key)} added at position ${next.areas.length}.`);
              }}
              title={PRIORITY_AREAS.find((a) => a.key === key)?.blurb}
            >
              + {areaLabel(key)}
            </button>
          ))}
        </div>
      )}

      <p className="pri-live" role="status" aria-live="polite">{announce}</p>

      {/* ── intentions ──────────────────────────────────────────────────── */}
      <h4 className="pri-sub">What you're trying to do</h4>
      <p className="pri-help">One or two lines, in your own words. Leave them blank if you'd rather not say.</p>
      <div className="pri-intentions">
        {[0, 1].map((i) => (
          <label className="field" key={i}>
            <span>{i === 0 ? "Intention" : "Second intention (optional)"}</span>
            <input
              type="text"
              value={intentDrafts[i] ?? ""}
              maxLength={MAX_INTENTION_CHARS}
              placeholder={i === 0 ? "e.g. get the business to profitability" : "e.g. settle somewhere permanent"}
              onChange={(e) => {
                const next = intentDrafts.slice();
                next[i] = e.target.value;
                setIntentDrafts(next);
              }}
              onBlur={() => commit(setIntention(profile, i, intentDrafts[i] ?? ""))}
            />
          </label>
        ))}
      </div>

      {/* ── optional context ────────────────────────────────────────────── */}
      <details className="advanced pri-context">
        <summary>
          A little context (optional){contextCount > 0 ? ` · ${contextCount} set` : ""}
        </summary>
        <p className="pri-help">
          Every field is optional and can be cleared at any time. It's only used to word things sensibly — clearing a
          field removes it.
        </p>
        <div className="pri-intentions">
          {CONTEXT_FIELDS.map((f) => (
            <label className="field" key={f.key}>
              <span>{f.label}</span>
              <input
                type="text"
                value={contextDrafts[f.key] ?? ""}
                maxLength={MAX_CONTEXT_CHARS}
                placeholder={f.placeholder}
                onChange={(e) => setContextDrafts({ ...contextDrafts, [f.key]: e.target.value })}
                onBlur={() => commitContext(f.key)}
              />
            </label>
          ))}
        </div>
      </details>

      {/* ── accepted suggestions ────────────────────────────────────────── */}
      {profile.acceptedSignals.length > 0 && (
        <div className="pri-signals">
          <h4 className="pri-sub">Accepted from your journal</h4>
          <p className="pri-help">
            Patterns you agreed with when the app suggested them. Nothing lands here without you saying yes.
          </p>
          <ul className="pri-sig-list">
            {profile.acceptedSignals.map((s) => (
              <li key={s.id} className="pri-sig">
                <span>{s.label}</span>
                <button
                  className="btn-text"
                  onClick={() => commit(removeAcceptedSignal(profile, s.id))}
                  aria-label={`Remove “${s.label}” from your priorities`}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ── AI consent ──────────────────────────────────────────────────── */}
      <h4 className="pri-sub">What the AI advisor may see</h4>
      <p className="pri-help">
        The deterministic engine and every reading on this site run in your browser and send nothing anywhere. These
        switches only apply when you use the optional AI advisor, which does send your message to a model.
      </p>
      <ul className="pri-consent">
        {CONSENT_COPY.map((c) => (
          <li key={c.field}>
            <label className="pri-consent-row">
              <input
                type="checkbox"
                checked={profile.aiConsent[c.field]}
                onChange={(e) => commit(setAiConsent(profile, c.field, e.target.checked))}
              />
              <span>
                <b>{c.label}</b>
                <span className="pri-consent-blurb">{c.blurb}</span>
              </span>
            </label>
          </li>
        ))}
      </ul>

      <div className="pri-foot">
        <p>
          Stored in this browser, alongside your chart. Priorities are a feature of this app for ordering what you see —
          they are not part of classical doctrine, and no ranking here makes a day better or worse.
        </p>
        {!empty && (
          <button
            className="btn-text danger pri-clear"
            onClick={() => {
              writing.current = true;
              try {
                hydrate(clearPriorities());
              } finally {
                writing.current = false;
              }
              setAnnounce("Priorities cleared.");
            }}
          >
            Clear my priorities
          </button>
        )}
      </div>
    </div>
  );
}
