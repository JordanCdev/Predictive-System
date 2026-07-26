/**
 * Privacy notice and terms of use.
 *
 * These describe what the app actually does — client-side computation, local-only
 * storage (accounts and cloud sync are implemented but not configured, so they are
 * described in the conditional), free data export/import, and a chat feature that
 * sends a derived chart summary plus per-field-consented priority context to
 * Anthropic. There are no payments: the app is free, with no tiers and nothing
 * for sale. Keep them accurate: if the data flows change, these change with
 * them. In particular: raw journal note text is never sent to the model, there
 * is no toggle for it, and no wording here may imply otherwise.
 *
 * NOTE FOR THE OPERATOR: this is plain-English, accurate documentation of the
 * product's behaviour, not legal advice. Have a solicitor review both documents
 * and fill in the contact and company details in CONTACT below.
 */
import { Link } from "react-router-dom";

/** Single place to keep the operator's details; used by both documents. */
const CONTACT = {
  service: "Wéi",
  email: "jordan@otherpath.co.uk",
  updated: "26 July 2026",
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
        The short version: the calculations happen in your browser, nothing leaves your device unless you sign in or
        ask the advisor a question, and we never sell anything to anyone.
      </p>

      <h3>What we store, and where</h3>
      <ul>
        <li>
          <b>Signed out, everything is local.</b> Your birth details, saved people, life priorities and decision journal
          live in your browser's local storage. They are not transmitted to us, and clearing your browser data deletes
          them. You never have to sign in — the whole app works this way.
        </li>
        <li>
          <b>Signed in, three of those records sync</b> to your private area of our database (Google Firestore, London
          region) so you can use them on another device: your <b>saved people and their birth details</b>, your{" "}
          <b>decision journal including the notes you type into it</b>, and your <b>saved advisor conversations</b>.
          They are readable only by you, enforced by per-user security rules. Your life priorities, your daily
          reflections and your AI-sharing switches do <b>not</b> sync — they stay on each device.
        </li>
        <li>
          <b>From sign-in</b> we receive your email address, and — if you use Google rather than an email link — your
          name and profile picture. We use them to identify your account and for nothing else.
        </li>
        <li>
          <b>We also hold a count of your AI messages per day</b> against your account, to enforce the daily limit that
          stops one person exhausting a shared key. Two numbers and a date; no message content.
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
        turns it on — only counts and derived signals ever reach the advisor, and that is enforced by a test, not just
        by intention. A field you haven't enabled is simply absent from what we send, and the model is told it was
        withheld so it doesn't guess. <b>Note the precise claim:</b> your note text is never sent to <i>the model</i>.
        If you are signed in it does sync to your account, so that your journal is there on your other devices — see
        “What we store, and where” above.
      </p>

      <h3>Payments</h3>
      <p>
        There are none. The app is free — no tiers, no subscriptions, nothing for sale — so we hold no payment details
        and nothing to bill you for. The only per-account record of use is the daily AI message count described above.
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
        <li>
          <b>You never have to sign in.</b> Signed out, the app works entirely offline and holds nothing about you
          anywhere but your own browser.
        </li>
        <li>
          <b>Deleting your account.</b> There is a <b>Delete my account</b> control on the profile page, under your
          account. It erases your saved people and their birth details, your journal including its notes, your saved
          advisor conversations, and the sign-in itself — permanently, and we cannot recover it afterwards. Take the
          export first if you want a copy. You choose separately whether to clear this browser's copy, so you can
          delete the account and carry on using the app locally.
        </li>
        <li>
          <b>Signing out is not deleting.</b> Signing out stops syncing and leaves everything in your account exactly
          where it is. They are different actions and we would rather say so than let one imply the other.
        </li>
        <li>
          <b>The one thing deletion leaves briefly.</b> A counter of how many advisor messages you sent on a given day
          — two numbers and a date, no message content — cannot be removed by the app itself, because the same rule
          that stops anyone resetting their own daily limit also stops the app deleting the counter. It is cleared on
          our side when the account goes. The app tells you this when you delete, rather than reporting a clean sweep.
        </li>
        <li>
          Depending on where you live you may have rights to access, correct, export or erase your data. The export
          above covers access and portability without asking us. For the rest, email us and we'll help.
        </li>
      </ul>

      <h3>Other people in your profile</h3>
      <p>
        The app lets you save charts for other people — a partner, a relative, a client. Please be aware of what that
        means: <b>you are storing someone else's birth date, time and place</b>, and if you are signed in it syncs to
        your account. If you ask the advisor about them, their chart summary goes to Anthropic in the same way yours
        would. They cannot see or delete that record themselves — only you can, from the profile page. Save other
        people's details only where they'd be comfortable with it, and remove them when you no longer need them.
      </p>

      <h3>Retention</h3>
      <p>
        Anything on your device is kept until you clear it. Anything in your account is kept <b>while the account
        exists</b>, and goes when you delete it. We do not expire or prune it on a timer — a birth chart does not go
        stale, and quietly deleting someone's journal after a year of not visiting would be worse than keeping it. If
        you stop using the app without deleting your account, the records remain until you come back and remove them.
      </p>
      <p>
        Two exceptions, both short-lived: the daily advisor message counter is per-day and is replaced each day, and an
        unfinished email sign-in leaves the address you typed in your own browser until you complete or clear it.
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

      <h3>Price</h3>
      <p>
        The service is free. There are no tiers, no subscriptions and no purchases, and every feature is available to
        every user. Usage ceilings that exist (such as the AI advisor's daily message allowance) are abuse bounds on
        metered third-party costs, not products.
      </p>

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
