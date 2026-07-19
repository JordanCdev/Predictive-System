/**
 * The public landing page — the first thing a new visitor sees.
 *
 * The pitch is the product's actual differentiator: every other app in this space
 * is a black box that tells you your day is "lucky". This one shows the rule that
 * fired, the schools that disagree, and how confident it is. That claim is the
 * whole reason someone would pay, so it leads.
 */
import { Link } from "react-router-dom";
import { PRO_PLAN, formatPrice } from "../billing/plans.ts";
import { useProfile } from "../ui/profile/ProfileContext.tsx";

const PROOF = [
  {
    k: "Deterministic",
    v: "The same question always returns the same answer, with a calculation hash you can check. No model is guessing.",
  },
  {
    k: "Cross-checked",
    v: "Solar terms and pillars are verified against independent sources — an established almanac library and JPL ephemeris fixtures.",
  },
  {
    k: "Honest about doubt",
    v: "Where schools genuinely disagree, you see both readings and a confidence that reflects it — not a fabricated certainty.",
  },
];

const STEPS = [
  { n: "1", t: "Say what you're deciding", d: "Signing, launching, moving, marrying — in your own words." },
  { n: "2", t: "Add your birth details", d: "Optional, and stored on your device unless you sign in. It turns the almanac into your almanac." },
  { n: "3", t: "Get a day, and the reasoning", d: "A ranked window, the best hours within the day, and every rule that produced them." },
];

export function LandingPage() {
  const { personalized } = useProfile();

  return (
    <div className="landing">
      <section className="hero">
        <span className="hero-seal" aria-hidden="true">易</span>
        <h1>Know when to act.</h1>
        <p className="hero-sub">
          A decision-timing engine built on classical Chinese metaphysics — BaZi and Tong Shu day selection, calculated
          from real astronomy. It tells you which day suits the thing you're about to do, and shows its working.
        </p>
        <div className="hero-cta">
          <Link className="btn" to={personalized ? "/today" : "/settings/profile"}>
            {personalized ? "Open today's reading" : "Get my reading — free"}
          </Link>
          <Link className="btn-ghost" to="/pricing">See plans</Link>
        </div>
        <p className="hero-note">
          Free, no account needed to start. Your birth details stay in your browser until you choose to sign in.
        </p>
      </section>

      <section className="landing-block">
        <h2>Most of these apps ask you to take their word for it.</h2>
        <p className="landing-lede">
          This one doesn't. Every score decomposes into the rules that produced it, every calculation is bound to a named
          convention, and where masters legitimately disagree, you see the disagreement instead of a false consensus.
        </p>
        <div className="proof-grid">
          {PROOF.map((p) => (
            <div className="proof-card" key={p.k}>
              <b>{p.k}</b>
              <p>{p.v}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="landing-block">
        <h2>How it works</h2>
        <div className="step-grid">
          {STEPS.map((s) => (
            <div className="step-card" key={s.n}>
              <span className="step-n" aria-hidden="true">{s.n}</span>
              <b>{s.t}</b>
              <p>{s.d}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="landing-block">
        <h2>What people actually use it for</h2>
        <ul className="use-list">
          <li><b>Signing and closing</b> — contracts, offers, completions.</li>
          <li><b>Launching</b> — opening a business, shipping a product, starting a campaign.</li>
          <li><b>Weddings and engagements</b> — including a date that reads well for both charts, not just one.</li>
          <li><b>Moving and renovating</b> — house moves, building work, opening a new space.</li>
          <li><b>Difficult conversations</b> — negotiations, reviews, asking for something that matters.</li>
        </ul>
      </section>

      <section className="landing-block landing-pro">
        <h2>Free is a real plan.</h2>
        <p className="landing-lede">
          The engine, the scores, the conflicts and the disclaimers are identical on every tier. Pro widens the range:
          five years of search instead of two months, your annual and ten-year readings, everyone involved in the
          decision rather than only you, and the full audit trail behind each score.
        </p>
        <div className="hero-cta">
          <Link className="btn" to="/pricing">
            Pro from {formatPrice(Math.round(PRO_PLAN.priceYearly / 12))}/month
          </Link>
          <Link className="btn-ghost" to="/today">Start free</Link>
        </div>
      </section>

      <section className="landing-block landing-honest">
        <h2>What this is not</h2>
        <p>
          It is not fortune telling, and it does not predict events. It reads tendencies in a classical system and
          renders them as timing advice you can weigh alongside everything else you know. A good day is not a guarantee
          and a poor one is not a doom — the score is a recommendation strength under a stated rule set, never a
          probability that something will happen. Use your own judgement too.
        </p>
        <p className="landing-legal">
          <Link to="/privacy">Privacy</Link> · <Link to="/terms">Terms</Link> · <Link to="/pricing">Plans</Link>
        </p>
      </section>
    </div>
  );
}
