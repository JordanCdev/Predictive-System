import { describe, expect, it } from "vitest";
import { evaluateDecision, objectiveById, ZIPING_DEFAULT } from "../engine/index.ts";
import { buildReportHTML, ReportParams } from "./report.ts";

const objective = objectiveById("contract_signing");

function params(): ReportParams {
  const res = evaluateDecision({
    birth: { year: 1990, month: 6, day: 15, hour: 14, minute: 30, tzOffsetMinutes: 480, timeCertainty: "exact" },
    sex: "male",
    convention: ZIPING_DEFAULT,
    objective,
    window: { start: { year: 2026, month: 7, day: 1 }, days: 20, tzOffsetMinutes: 480 },
  });
  return {
    rec: res.recommendations[0],
    objective,
    meta: { ...res.meta, personalized: res.personalized },
    chart: res.subjectChart,
    yearOutlook: null,
    generatedNote: "Generated 2026-07-01",
  };
}

describe("shareable report", () => {
  it("builds a self-contained, deterministic HTML document", () => {
    const p = params();
    const html = buildReportHTML(p);
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain("</html>");
    expect(html).toContain("Signing a contract");
    expect(html).toContain("Best day");
    expect(html).toContain("Why this day");
    expect(html).toContain("Score breakdown");
    expect(html).toContain(p.meta.calculationHash); // reproducible hash embedded
    expect(html).toContain("Generated 2026-07-01");
    // no external resource references — fully self-contained
    expect(html).not.toMatch(/https?:\/\//);
    // pure + deterministic
    expect(buildReportHTML(p)).toBe(html);
  });

  it("includes the personalised chart section when a chart is present", () => {
    const html = buildReportHTML(params());
    expect(html).toContain("Your chart");
    expect(html).toContain("core element");
  });

  it("escapes HTML metacharacters so injected strings can't break the markup", () => {
    const p = params();
    p.objective = { ...objective, label: "Sign <script>alert(1)</script>" };
    // objectivePlain drives the visible title (id-keyed), so inject via a field the
    // report prints verbatim: the generated note.
    p.generatedNote = "Generated <b>2026</b> & tested";
    const html = buildReportHTML(p);
    expect(html).toContain("Generated &lt;b&gt;2026&lt;/b&gt; &amp; tested");
    expect(html).not.toContain("Generated <b>2026</b>");
  });
});
