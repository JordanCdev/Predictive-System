/**
 * Profile-aware suggested chips for the chat panel (pure, unit-tested).
 *
 * Built from the user's ACTUAL chart via the same deterministic profile ranking
 * the tools use, so the suggestions point at their real best/worst fits instead
 * of generic examples. Every chip leads to a full answer for every user — no
 * chip is conditional on a plan or tier.
 */

import { BaziChart, analyzeProfile, objectivePlain } from "../engine/index.ts";

export interface ChatChip {
  label: string;
  prompt: string;
}

export function buildChatChips(chart: BaziChart): ChatChip[] {
  const profile = analyzeProfile(chart);
  const best = profile.fits[0];
  const worst = profile.fits[profile.fits.length - 1];

  const chips: ChatChip[] = [{ label: "How is today for me?", prompt: "How is today for me?" }];

  if (best) {
    const verb = objectivePlain(best.objectiveId).verb;
    chips.push({ label: `When should I ${verb}?`, prompt: `When should I ${verb}?` });
  }
  if (worst && worst.objectiveId !== best?.objectiveId && worst.fit < 50) {
    const gerund = objectivePlain(worst.objectiveId).gerund.toLowerCase();
    chips.push({
      label: `Why is ${gerund} demanding for me?`,
      prompt: `Why is ${gerund} a demanding kind of move for my chart?`,
    });
  } else if (profile.cautions.length > 0) {
    chips.push({
      label: "Where should I tread carefully?",
      prompt: `My chart's cautions mention ${profile.cautions[0]} — what does that mean for me in practice?`,
    });
  }

  chips.push({ label: "Explain my hidden stems", prompt: "Explain my hidden stems and what they add to my chart." });
  chips.push({ label: "What does my chart suit?", prompt: "What kinds of moves does my chart suit right now?" });
  chips.push({ label: "What's my luck decade about?", prompt: "What is my current 10-year luck decade about?" });

  return chips.slice(0, 6);
}
