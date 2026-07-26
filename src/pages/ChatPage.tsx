import { Link } from "react-router-dom";
import { ChatPanel } from "../ui/ChatPanel.tsx";
import { useAuth } from "../ui/profile/AuthContext.tsx";
import { useProfile } from "../ui/profile/ProfileContext.tsx";
import { TODAY_ISO } from "../ui/shared.ts";
import { NeedsProfile } from "./NeedsProfile.tsx";

/** The AI advisor chat — a full-page home for the guardrailed chat shell. */
export function ChatPage() {
  const { chart, dayun, birthCivil, evaluate, evaluateDay, boundary } = useProfile();
  const auth = useAuth();
  // Only claim account sync when it is actually happening: local-only is the
  // default, and saying "on this device" while a signed-in session uploads the
  // thread would be a false privacy claim.
  const synced = auth.enabled && Boolean(auth.user);
  if (!chart || !birthCivil) return <NeedsProfile what="chat with the AI advisor" />;
  return (
    <>
      <div className="page-head">
        <h2 className="page-title">AI advisor</h2>
        <Link className="btn-text" to="/today">Back to today</Link>
      </div>
      <p style={{ margin: "-4px 0 0", fontSize: 13, color: "var(--muted)", lineHeight: 1.55, maxWidth: "62ch" }}>
        Your conversations are saved on this device{synced ? " and in your account" : ""} and picked up where you left
        them — including from the panel on the date finder. Each answer is marked with the model that wrote it, and
        changing model carries on in the same conversation rather than starting a new one.
      </p>
      <ChatPanel chart={chart} dayun={dayun} birth={birthCivil} todayIso={TODAY_ISO} evaluate={evaluate} evaluateDay={evaluateDay} boundary={boundary} />
    </>
  );
}
