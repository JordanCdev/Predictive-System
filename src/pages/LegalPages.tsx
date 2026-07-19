/**
 * Privacy notice and terms of use.
 *
 * These describe what the app actually does — client-side computation, optional
 * account sync, Stripe-handled payments, and a chat feature that sends a derived
 * chart summary to Anthropic. Keep them accurate: if the data flows change, these
 * change with them.
 *
 * NOTE FOR THE OPERATOR: this is plain-English, accurate documentation of the
 * product's behaviour, not legal advice. Before taking payments in a given
 * jurisdiction, have a solicitor review both documents and fill in the contact
 * and company details in CONTACT below.
 */
import { Link } from "react-router-dom";

/** Single place to keep the operator's details; used by both documents. */
const CONTACT = {
  service: "Wéi",
  email: "support@example.com",
  updated: "19 July 2026",
};

function LegalShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="legal">
      <div className="page-head">
        <h2 className="page-title">{title}</h2>
        <Link className="btn-text" to="/today">Back to today</Link>
      </div>
      <p className="legal-updated">Last updated {CONTACT.updated}</p>
      {children}
      <p className="legal-contact">
        Questions about any of this: <a href={`mailto:${CONTACT.email}`}>{CONTACT.email}</a>
      </p>
    </div>
  );
}

export function PrivacyPage() {
  return (
    <LegalShell title="Privacy">
      <p className="legal-lede">
        The short version: the calculations happen in your browser. Your birth details stay on your device unless you
        create an account, and we never sell anything to anyone.
      </p>

      <h3>What we store, and where</h3>
      <ul>
        <li>
          <b>Without an account.</b> Your birth details, saved people and decision journal live in your browser's local
          storage. They are not transmitted to us, and clearing your browser data deletes them.
        </li>
        <li>
          <b>With an account.</b> If you sign in with Google, the same records sync to your private area of our database
          so you can use them on another device. Only you can read them; access is enforced by per-user security rules.
        </li>
        <li>
          <b>From Google sign-in</b> we receive your name, email address and profile picture. We use them to identify
          your account and for nothing else.
        </li>
      </ul>

      <h3>The AI advisor</h3>
      <p>
        The chat feature is optional and off until you turn it on. When you use it, your question and a{" "}
        <b>derived summary of your chart</b> — Day Master, elemental balance, the engine's computed results — are sent to
        Anthropic to be turned into prose. Your birth date, birth time and birth city are not part of that summary. The
        model never calculates anything; it explains numbers the engine produced on your device. Anthropic processes the
        request under their own terms as our processor.
      </p>

      <h3>Payments</h3>
      <p>
        Subscriptions are handled by Stripe. Card details go directly to Stripe and never reach our servers. We store the
        identifiers Stripe gives us — a customer id, a subscription id, its status and renewal date — so we know which
        plan you're on.
      </p>

      <h3>What we don't do</h3>
      <ul>
        <li>No advertising, no ad tracking, no third-party analytics that profile you across sites.</li>
        <li>No selling, renting or sharing of personal data.</li>
        <li>No use of your birth details or journal to train any model.</li>
      </ul>

      <h3>Your control</h3>
      <ul>
        <li>Remove any stored person, or your whole profile, from the profile page at any time.</li>
        <li>Deleting your account removes the records held against it. Ask us by email and we'll action it.</li>
        <li>You can export a reading as a report at any time, and use the app entirely offline without an account.</li>
        <li>
          Depending on where you live you may have rights to access, correct, export or erase your data. Email us and
          we'll help.
        </li>
      </ul>

      <h3>Retention</h3>
      <p>
        Account records are kept while your account exists. Billing records are kept as long as tax and accounting law
        requires. Local-only data is kept until you clear it.
      </p>
    </LegalShell>
  );
}

export function TermsPage() {
  return (
    <LegalShell title="Terms of use">
      <p className="legal-lede">
        {CONTACT.service} is a decision-support tool grounded in classical Chinese metaphysics. Using it means accepting
        the terms below — the most important of which is that it does not predict the future.
      </p>

      <h3>What the service is</h3>
      <p>
        The app calculates BaZi charts and Tong Shu day-selection readings from astronomical data and classical rule
        sets, and presents them as timing guidance with the reasoning shown. Scores are recommendation strengths under a
        stated set of rules. They are <b>not</b> probabilities, forecasts of events, or assurances of any outcome.
      </p>

      <h3>Not professional advice</h3>
      <p>
        Nothing here is financial, legal, medical, or psychological advice, and it is not a substitute for a qualified
        professional. Do not use it as the sole basis for a significant decision. You remain responsible for your own
        choices and their consequences.
      </p>

      <h3>Accounts</h3>
      <ul>
        <li>You need to be old enough to enter a contract where you live — and at least 16.</li>
        <li>Keep your sign-in secure; you're responsible for activity under your account.</li>
        <li>Don't attempt to circumvent usage limits, resell access, or scrape the service in bulk.</li>
      </ul>

      <h3>Subscriptions</h3>
      <ul>
        <li>Pro is billed in advance, monthly or yearly, and renews automatically until cancelled.</li>
        <li>Cancel any time from billing settings. You keep Pro until the end of the period you've paid for.</li>
        <li>Prices may change; we'll tell you before a change affects a renewal, and you can cancel instead.</li>
        <li>
          If the service materially fails to work for you, contact us — we'd rather refund you than keep money you feel
          you didn't get value for. Statutory refund rights apply regardless.
        </li>
        <li>Cancelling doesn't delete your data. Charts and entries beyond free limits are paused, not erased.</li>
      </ul>

      <h3>Availability</h3>
      <p>
        We aim to keep the service running but don't guarantee uninterrupted availability. The deterministic engine runs
        in your browser and keeps working offline; the account sync and AI features need a connection and third-party
        services we don't control.
      </p>

      <h3>Liability</h3>
      <p>
        The service is provided as is. To the fullest extent the law allows, we are not liable for indirect or
        consequential loss, or for decisions you make using the app. Nothing here limits liability that cannot lawfully
        be limited — including for death or personal injury caused by negligence, or for fraud. Where liability is
        capped, it is capped at what you paid us in the twelve months before the claim.
      </p>

      <h3>Changes</h3>
      <p>
        We may update these terms. Material changes will be flagged in the app before they take effect, and continuing to
        use the service after that means accepting them.
      </p>

      <p className="legal-close">
        See also the <Link to="/privacy">privacy notice</Link>.
      </p>
    </LegalShell>
  );
}
