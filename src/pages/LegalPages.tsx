/**
 * Privacy notice and terms of use.
 *
 * These describe what the app actually does — client-side computation, local-only
 * storage (accounts and cloud sync are implemented but not configured, so they are
 * described in the conditional), Stripe-handled payments, free data export/import,
 * and a chat feature that sends a derived chart summary plus per-field-consented
 * priority context to Anthropic. Keep them accurate: if the data flows change,
 * these change with them. In particular: raw journal note text is never sent to
 * the model, there is no toggle for it, and no wording here may imply otherwise.
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
  updated: "25 July 2026",
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
        The short version: the calculations happen in your browser, your data stays on your device, and we never sell
        anything to anyone.
      </p>

      <h3>What we store, and where</h3>
      <ul>
        <li>
          <b>Today, everything is local.</b> Your birth details, saved people, life priorities and decision journal live
          in your browser's local storage. They are not transmitted to us, and clearing your browser data deletes them.
          Accounts and cloud sync are built but <b>not switched on</b>: there is currently no sign-in on this site and
          no copy of your data on our servers.
        </li>
        <li>
          <b>If we do turn accounts on,</b> signing in would sync the same records to your private area of our database
          so you could use them on another device, readable only by you and enforced by per-user security rules. We'd
          say so here, and in the app, before that happens.
        </li>
        <li>
          <b>From Google sign-in</b> — once accounts exist — we would receive your name, email address and profile
          picture, and use them to identify your account and for nothing else.
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
      <p>
        If you have filled in a priority profile, four further fields can travel with that summary — but each one{" "}
        <b>only to the extent you have enabled it</b> on the profile page, where you can see and change every switch:
      </p>
      <ul>
        <li>
          <b>Your ranked life areas</b> — the areas you told the app matter to you, in your order. <i>On by default.</i>
        </li>
        <li>
          <b>Your stated intentions</b> — sent <b>word-for-word, as you wrote them</b>. <i>On by default.</i>
        </li>
        <li>
          <b>Your optional life context</b> — the free-text note about your situation, sent as written.{" "}
          <i>Off by default.</i>
        </li>
        <li>
          <b>Aggregate journal counts</b> — how many decisions you've saved, how many fall in each life area, how many
          you followed up. Numbers only. <i>Off by default.</i>
        </li>
      </ul>
      <p>
        <b>The text of your journal notes is never sent to the model under any setting.</b> There is no switch that
        turns it on, because it never leaves your device. A field you haven't enabled is simply absent from what we
        send, and the model is told it was withheld so it doesn't guess.
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
        <li>No use of your birth details, priorities or journal to train any model.</li>
      </ul>

      <h3>Your control</h3>
      <ul>
        <li>Remove any stored person, your priority profile, or any journal entry, from the profile page at any time.</li>
        <li>
          <b>Take your data with you.</b> The profile page has a free export that downloads everything the app holds —
          people, priorities and journal — as a single JSON file you keep. You can restore it on any device, merging it
          into what's there or replacing it outright. Your API key is deliberately excluded from the file.
        </li>
        <li>
          Every AI-sharing switch described above is on that same page, and turning one off takes effect on your next
          question.
        </li>
        <li>The app works entirely offline, and there is no account to create.</li>
        <li>
          If we later enable accounts, deleting yours would remove the records held against it; email us and we'll
          action it.
        </li>
        <li>
          Depending on where you live you may have rights to access, correct, export or erase your data. Email us and
          we'll help.
        </li>
      </ul>

      <h3>Retention</h3>
      <p>
        Your data is local-only today, so it is kept until you clear it — by us, not at all. Billing records are kept as
        long as tax and accounting law requires. If accounts are enabled later, account records would be kept while the
        account exists.
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
