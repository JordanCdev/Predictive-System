/** Client-side .ics (iCalendar) export — lets the user drop the chosen day +
 *  best window straight into their own calendar. Pure string-building; the
 *  download is triggered by the user's own click. */
import {
  BRANCHES,
  DayRecommendation,
  Objective,
  headlineVerdict,
  objectivePlain,
  practicalBestHour,
  whyThisDay,
} from "../engine/index.ts";

const p2 = (n: number) => String(n).padStart(2, "0");
const dateOnly = (c: { year: number; month: number; day: number }) => `${c.year}${p2(c.month)}${p2(c.day)}`;
const dateTime = (c: { year: number; month: number; day: number }, h: number) => `${dateOnly(c)}T${p2(h)}0000`;

/** Escape per RFC 5545 TEXT rules. */
function esc(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

function nextDay(c: { year: number; month: number; day: number }): { year: number; month: number; day: number } {
  const d = new Date(Date.UTC(c.year, c.month - 1, c.day + 1));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

/**
 * Objectives whose name should NOT be written into a calendar by default.
 *
 * A .ics does not stay in the app. It lands in Google/Apple/Outlook, is often on
 * a work account, is frequently shared with a partner or a whole team, and shows
 * up in notifications on a lock screen. "A medical procedure" is health data
 * about a named person at a named time; "Making a career move" tells an employer
 * their employee is leaving. Neither is ours to disclose on the user's behalf
 * just because they asked for a reminder.
 *
 * Discretion is the DEFAULT for these, not an option buried in settings — the
 * user who most needs it is the least likely to go looking. It stays overridable
 * both ways, because plenty of people share a calendar with the person they are
 * marrying and want the title to say so.
 */
const SENSITIVE_OBJECTIVES = new Set(["medical_procedure", "career_move", "investment_purchase"]);

export function discreetByDefault(objectiveId: string): boolean {
  return SENSITIVE_OBJECTIVES.has(objectiveId);
}

export interface IcsOptions {
  /** Omit the activity from the event title, description and filename. */
  discreet?: boolean;
}

export function buildICS(rec: DayRecommendation, objective: Objective, opts: IcsOptions = {}): string {
  const obj = objectivePlain(objective.id);
  const ph = rec.personalized ? practicalBestHour(rec) : null;
  const discreet = opts.discreet ?? discreetByDefault(objective.id);
  // In discreet mode nothing derived from the objective may appear — not the
  // gerund, and not headlineVerdict/whyThisDay, both of which name the activity
  // in their prose. What survives is the timing, which is the only part the
  // calendar actually needs.
  const summary = discreet ? "Auspicious window (Wéi)" : `${obj.gerund} — auspicious window (Wéi)`;
  const desc = discreet
    ? "A window Wéi rated well for you. The activity is deliberately not named here — open Wéi to see which decision this is for."
    : [headlineVerdict(rec, objective), "", ...whyThisDay(rec).map((b) => `• ${b}`)].join("\n");

  // Floating local time (no Z/TZID) so it lands at the right wall-clock for the user.
  let timing: string;
  if (ph) {
    const hs = BRANCHES[ph.branchIndex].hourStart;
    timing = `DTSTART:${dateTime(rec.civil, hs)}\r\nDTEND:${dateTime(rec.civil, Math.min(hs + 2, 23))}`;
  } else {
    timing = `DTSTART;VALUE=DATE:${dateOnly(rec.civil)}\r\nDTEND;VALUE=DATE:${dateOnly(nextDay(rec.civil))}`;
  }

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Wei Decision Timing//EN",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    // The UID is stored by every calendar client and is visible in exports and
    // sync payloads, so the objective id cannot ride along in it either — a UID
    // reading "…-medical_procedure@wei" discloses exactly what SUMMARY just
    // withheld. Discreet events key on the date alone, which keeps the UID
    // stable for re-import without naming anything.
    `UID:${rec.isoDate}-${discreet ? "window" : objective.id}@wei`,
    `DTSTAMP:${dateTime(rec.civil, 0)}`,
    timing,
    `SUMMARY:${esc(summary)}`,
    `DESCRIPTION:${esc(desc)}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}

/** Trigger a client-side download of the .ics for this recommendation. */
export function downloadICS(rec: DayRecommendation, objective: Objective, opts: IcsOptions = {}): void {
  const discreet = opts.discreet ?? discreetByDefault(objective.id);
  const blob = new Blob([buildICS(rec, objective, { discreet })], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  // The filename is the third place the activity leaks: it sits in ~/Downloads,
  // in the browser's download shelf, and in the attachment name if the file is
  // ever mailed on.
  a.download = discreet ? `wei-window-${rec.isoDate}.ics` : `wei-${objective.id}-${rec.isoDate}.ics`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
