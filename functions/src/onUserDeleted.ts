/**
 * Server-side cleanup for the one document a deleting user cannot remove
 * themselves: users/{uid}/billing/usage, the AI message meter.
 *
 * WHY THE CLIENT CANNOT DO THIS. firestore.rules denies every client write to
 * the `billing` collection so that nobody can reset their own daily quota, and
 * a delete IS a write. Relaxing the rule to permit deletes would reopen exactly
 * the hole it closes — delete would become the reset button. So the meter is
 * the server's to clear, and it is cleared here.
 *
 * The client's own erasure path (eraseAccountData in src/firebase/client.ts)
 * removes everything else and REPORTS this document as retained rather than
 * claiming a complete wipe. This function is what makes that report stop being
 * true — and until it is deployed, the honest statement is the one the client
 * already shows the user.
 *
 * A blocking beforeUserDeleted trigger is deliberately NOT used: if this cleanup
 * failed it would block the account deletion itself, which would turn a data
 * -tidying failure into a denial of the user's Article 17 right. Erasing the
 * account matters more than erasing the counter, so the counter loses.
 */
import { getFirestore } from "firebase-admin/firestore";
import { logger } from "firebase-functions";
import { onDocumentDeleted } from "firebase-functions/v2/firestore";
import { auth } from "firebase-functions/v1";

/** Everything under users/{uid} the server should sweep once the account is gone. */
async function purgeUser(uid: string): Promise<number> {
  const db = getFirestore();
  // recursiveDelete handles the whole subtree — the billing meter plus anything
  // a client-side erase left behind (a failed delete, a document written by a
  // version of the app that no longer exists, or a collection added later and
  // not yet in ERASABLE_*). Sweeping the subtree rather than naming paths means
  // this cannot silently fall out of step with the client the way a hand-kept
  // list can.
  const root = db.collection("users").doc(uid);
  await db.recursiveDelete(root);
  return 1;
}

/**
 * Fires when a Firebase Auth user is deleted — including from the client's own
 * "delete my account" control, and from the console.
 *
 * Note this is a v1 trigger: Auth user-lifecycle events have no v2 equivalent
 * outside blocking functions, and a blocking function is the wrong tool here
 * (see the header). Mixing generations in one codebase is supported.
 */
export const onUserDeleted = auth.user().onDelete(async (user) => {
  try {
    await purgeUser(user.uid);
    logger.info("purged user subtree after account deletion", { uid: user.uid });
  } catch (err) {
    // Never rethrow. The account is already gone; a retry storm here cannot give
    // the user anything back, and the failure needs to be visible to an operator
    // rather than to a user who has already left.
    logger.error("failed to purge user subtree", { uid: user.uid, err: String(err) });
  }
});

/**
 * Belt and braces for the meter specifically. If a client erase deletes
 * meta/profile but the account deletion never happens (the user cancels, or
 * `requires-recent-login` interrupts them), the trigger above never fires. This
 * one notices the profile going and clears the meter, which is the only other
 * document that survives a client-side erase.
 */
export const onProfileDeleted = onDocumentDeleted("users/{uid}/meta/profile", async (event) => {
  const uid = event.params.uid as string;
  try {
    await getFirestore().doc(`users/${uid}/billing/usage`).delete();
    logger.info("cleared AI usage meter after profile erase", { uid });
  } catch (err) {
    logger.error("failed to clear usage meter", { uid, err: String(err) });
  }
});
