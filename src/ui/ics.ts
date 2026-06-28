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

export function buildICS(rec: DayRecommendation, objective: Objective): string {
  const obj = objectivePlain(objective.id);
  const ph = rec.personalized ? practicalBestHour(rec) : null;
  const summary = `${obj.gerund} — auspicious window (Wéi)`;
  const desc = [headlineVerdict(rec, objective), "", ...whyThisDay(rec).map((b) => `• ${b}`)].join("\n");

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
    `UID:${rec.isoDate}-${objective.id}@wei`,
    `DTSTAMP:${dateTime(rec.civil, 0)}`,
    timing,
    `SUMMARY:${esc(summary)}`,
    `DESCRIPTION:${esc(desc)}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}

/** Trigger a client-side download of the .ics for this recommendation. */
export function downloadICS(rec: DayRecommendation, objective: Objective): void {
  const blob = new Blob([buildICS(rec, objective)], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `wei-${objective.id}-${rec.isoDate}.ics`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
