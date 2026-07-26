/**
 * Reading a STORED turn for the screen.
 *
 * Everything the chat panel shows about a turn is derived from the record in
 * the thread store, never from component state. That is the whole point: a
 * reload, a route change, or picking a conversation back up next week has to
 * produce exactly the same transcript — including which tools were called and
 * which model answered. Anything remembered only in a `useState` would be a
 * detail of the conversation that quietly disappears.
 *
 * Pure, DOM-free and React-free so it can be tested directly.
 */
import type { ContentBlock } from "../../ai/chatClient.ts";
import { messageText } from "./threadStore.ts";
import type { ChatTurn } from "./threadStore.ts";
import type { TranscriptTurnLike } from "./transcript.ts";

/** Plain-English label for each engine tool, shown as a chip on the turn that
 *  called it. Unknown names fall through to the raw tool name rather than being
 *  hidden — a tool call the user can't see is a tool call they can't question. */
export const TOOL_LABEL: Record<string, string> = {
  list_objectives: "Listing what I can time",
  get_chart_summary: "Reading your chart",
  get_natal_chart: "Reading your full natal chart",
  get_profile_fits: "Ranking your best fits",
  get_luck_pillars: "Checking your luck cycle",
  get_period_summary: "Looking at that period",
  find_best_days: "Finding your best days",
  evaluate_specific_day: "Checking that day",
  get_priorities: "Checking what matters to you",
};

export function toolLabel(name: string): string {
  return TOOL_LABEL[name] ?? name;
}

/** The tool calls a stored assistant turn actually made, in order. */
export function toolLabels(content: string | ContentBlock[]): string[] {
  if (!Array.isArray(content)) return [];
  return content.flatMap((b) => (b && b.type === "tool_use" ? [toolLabel(b.name)] : []));
}

/**
 * Should this turn be drawn?
 *
 * The `tool_result` user messages the tool loop produces are part of the
 * transcript — the model needs them, and they are what was actually exchanged —
 * but they are machine plumbing, not something a person said. They stay stored
 * and replayed; they are simply not rendered. Same for any empty husk left
 * behind by a stopped turn.
 */
export function isVisible(turn: ChatTurn): boolean {
  if (turn.kind === "offline") return true;
  if (turn.role === "user") return messageText(turn.content).trim().length > 0;
  return messageText(turn.content).trim().length > 0 || toolLabels(turn.content).length > 0;
}

/**
 * What `transcript.ts` needs in order to decide where the voice changed.
 *
 * The offline advisor is treated as a voice like any other — that is what lets a
 * single conversation move between the deterministic advisor and the AI (in
 * either direction) and still read as one conversation with a note in the
 * middle, rather than splitting into two.
 */
export function forTranscript(turn: ChatTurn): TranscriptTurnLike {
  return turn.kind === "offline"
    ? { role: "assistant", source: "offline" }
    : { role: turn.role, model: turn.model, source: "ai" };
}
