import { Link } from "react-router-dom";
import { ChatPanel } from "../ui/ChatPanel.tsx";
import { useProfile } from "../ui/profile/ProfileContext.tsx";
import { TODAY_ISO } from "../ui/shared.ts";
import { NeedsProfile } from "./NeedsProfile.tsx";

/** The AI advisor chat — a full-page home for the guardrailed chat shell. */
export function ChatPage() {
  const { chart, dayun, birthCivil, evaluate, evaluateDay } = useProfile();
  if (!chart || !birthCivil) return <NeedsProfile what="chat with the AI advisor" />;
  return (
    <>
      <div className="page-head">
        <h2 className="page-title">AI advisor</h2>
        <Link className="btn-text" to="/today">Back to today</Link>
      </div>
      <ChatPanel chart={chart} dayun={dayun} birth={birthCivil} todayIso={TODAY_ISO} evaluate={evaluate} evaluateDay={evaluateDay} />
    </>
  );
}
