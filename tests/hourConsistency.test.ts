import { describe, expect, it } from "vitest";
import {
  actionGuidance,
  evaluateDecision,
  humanHourRange,
  isDaytimeHour,
  objectiveById,
  practicalBestHour,
  whyThisDay,
  ZIPING_DEFAULT,
} from "../src/engine/index.ts";
import { buildReportHTML } from "../src/ui/report.ts";

const objective = objectiveById("contract_signing");

/** A window long enough to include days whose chart-best hour is overnight, so
 *  the practicalBestHour ≠ rec.bestHour divergence is actually exercised. */
const res = evaluateDecision({
  birth: { year: 1998, month: 3, day: 23, hour: 19, minute: 47, tzOffsetMinutes: 0, timeCertainty: "exact" },
  sex: "male",
  convention: ZIPING_DEFAULT,
  objective,
  window: { start: { year: 2026, month: 1, day: 1 }, days: 240, tzOffsetMinutes: 0 },
});

describe("best-hour consistency — one window everywhere", () => {
  const personalDays = res.allDays.filter((d) => d.personalized && d.bestHour);

  it("hero/why/what-to-do/report all name the SAME window, and no second window leaks", () => {
    let divergent = 0;
    for (const rec of personalDays) {
      const ph = practicalBestHour(rec);
      if (!ph) continue;
      const practical = humanHourRange(ph.rangeLabel);
      const raw = humanHourRange(rec.bestHour!.rangeLabel);

      const why = whyThisDay(rec).join(" ¦ ");
      const act = actionGuidance(rec, objective).join(" ¦ ");
      const html = buildReportHTML({
        rec,
        objective,
        meta: { ...res.meta, personalized: res.personalized },
        chart: res.subjectChart,
        yearOutlook: null,
        generatedNote: "test",
      });

      // The canonical (practical, daytime) window is present in every surface.
      expect(why, `why @ ${rec.isoDate}`).toContain(practical);
      expect(act, `what-to-do @ ${rec.isoDate}`).toContain(practical);
      expect(html, `report @ ${rec.isoDate}`).toContain(practical);

      // When the chart-best hour is overnight, that raw window must NOT be surfaced
      // as a separate "best window" anywhere prose or the report names one.
      if (raw !== practical) {
        divergent++;
        expect(why, `why leaked raw window @ ${rec.isoDate}`).not.toContain(raw);
        expect(act, `what-to-do leaked raw window @ ${rec.isoDate}`).not.toContain(raw);
        expect(html, `report leaked raw window @ ${rec.isoDate}`).not.toContain(raw);
      }
    }
    // Prove the hard case (overnight chart-best) was actually tested.
    expect(divergent, "expected at least one overnight-chart-best day in the window").toBeGreaterThan(0);
  });

  it("keeps the helpful-people (天乙貴人) callout when the Nobleman hour is overnight", () => {
    // The collapse to one practical window must not drop the fact that a
    // helpful-people hour exists that day, even when it's the overnight top hour.
    const nonCautioned = (rec: (typeof personalDays)[number]) =>
      !rec.rulesFired.some((r) => ["year_break", "four_departure", "four_severance", "luck_clash"].includes(r.code)) &&
      !rec.shenShaTags.some((t) => t.code === "clash_day" || t.code === "clash_zodiac");
    const day = personalDays.find(
      (rec) => nonCautioned(rec) && !isDaytimeHour(rec.bestHour!.branchIndex) && rec.bestHour!.reasons.some((r) => r.includes("Nobleman")),
    );
    expect(day, "expected a non-cautioned day whose overnight top hour is a Nobleman hour").toBeTruthy();
    expect(actionGuidance(day!, objective).join(" ")).toMatch(/helpful-people|天乙貴人/);
  });
});
