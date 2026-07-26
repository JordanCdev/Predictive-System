import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * INTEGRATION COHERENCE for the four classical day cards on the daily view.
 *
 * The daily page has two layouts — person-first (a chart is set) and
 * almanac-first (no chart) — and the 卦氣 / 日家紫白 / 日家奇門 / 烏兔 cards must
 * appear in BOTH, as the same set, in the same order. They drifted apart once
 * already. The cheapest durable guard is structural: the cards are mounted
 * from ONE shared `dayFacts` group, so "same set, same order" is true by
 * construction and this test is what keeps it that way.
 *
 * There is no DOM harness in this repo (vitest runs `environment: "node"` and
 * only picks up `.ts`), so these assertions read the source. They deliberately
 * touch only the two files this layer owns — src/pages/DailyPage.tsx and
 * src/styles.css — and never the card components, whose internals are free to
 * change without breaking this.
 */

// fileURLToPath, not `.pathname` — the repo lives under a path with spaces.
const ROOT = fileURLToPath(new URL("..", import.meta.url));
const DAILY_PAGE = readFileSync(`${ROOT}src/pages/DailyPage.tsx`, "utf8");
const STYLES = readFileSync(`${ROOT}src/styles.css`, "utf8");

const CARDS = ["HexagramCard", "FlyingStarCard", "NineStarWheel", "WuTuCard"] as const;

/** Every `<CardName` mount in source order. */
function mountOrder(src: string): string[] {
  const hits: { at: number; name: string }[] = [];
  for (const name of CARDS) {
    const re = new RegExp(`<${name}[\\s/>]`, "g");
    for (let m = re.exec(src); m; m = re.exec(src)) hits.push({ at: m.index, name });
  }
  return hits.sort((a, b) => a.at - b.at).map((h) => h.name);
}

describe("the four classical day cards are one group, mounted once", () => {
  it("mounts each card exactly once in the whole page", () => {
    // Two mount sites × four cards used to mean eight JSX tags kept in sync by
    // hand. One group means four — the duplication is what drifted.
    expect(mountOrder(DAILY_PAGE)).toEqual(["HexagramCard", "FlyingStarCard", "NineStarWheel", "WuTuCard"]);
  });

  it("renders the identical group in both the personalised fold and the visitor branch", () => {
    const uses = DAILY_PAGE.match(/\{dayFacts\}/g) ?? [];
    expect(uses).toHaveLength(2);
    // …and both of them are downstream of the single definition.
    const defined = DAILY_PAGE.indexOf("const dayFacts = (");
    expect(defined).toBeGreaterThan(-1);
    expect(DAILY_PAGE.indexOf("{dayFacts}")).toBeGreaterThan(defined);
  });

  it("groups them under one wrapper that owns the spacing", () => {
    expect(DAILY_PAGE).toContain('className="day-facts"');
    expect(STYLES).toContain(".day-facts {");
    // One rhythm for the group rather than four per-card inline margins.
    expect(STYLES).toMatch(/\.day-facts\s*\{[^}]*gap:\s*12px/);
    expect(STYLES).toMatch(/\.day-facts\s*>\s*\*\s*\{[^}]*margin-top:\s*0\s*!important/);
  });
});

describe("the two directional systems are reconciled honestly", () => {
  const note = DAILY_PAGE.slice(
    DAILY_PAGE.indexOf('className="day-facts-note"'),
    DAILY_PAGE.indexOf("<WuTuCard"),
  );

  it("sits between the nine-star wheel and the rest of the group", () => {
    const wheel = DAILY_PAGE.indexOf("<NineStarWheel");
    const noteAt = DAILY_PAGE.indexOf('className="day-facts-note"');
    expect(wheel).toBeGreaterThan(-1);
    expect(noteAt).toBeGreaterThan(wheel);
  });

  it("names both systems and says neither overrides the other", () => {
    expect(note).toContain("三煞");
    expect(note).toContain("日家奇門");
    expect(note).toMatch(/neither one overrides\s+the other/);
    expect(note).toMatch(/does not reconcile them/);
  });

  it("reports the day's own 三煞 direction rather than describing it in the abstract", () => {
    expect(note).toContain("rec.tongshu.sanShaDirection");
  });

  it("invents no resolution — no ranking language between the two systems", () => {
    // The failure mode this exists to catch: a well-meaning edit that decides
    // one lineage wins. Tradition does not, so neither may the copy.
    expect(note).not.toMatch(/takes precedence|wins|more (?:reliable|authoritative|accurate)|trust the/i);
  });
});

describe("the group frames itself as calendar facts, not a reading of the person", () => {
  const intro = DAILY_PAGE.slice(
    DAILY_PAGE.indexOf('className="day-facts-intro"'),
    DAILY_PAGE.indexOf("<HexagramCard"),
  );

  it("says the four describe the day, not the person", () => {
    expect(intro).toMatch(/not any person/);
  });

  it("says outright that none of it feeds the score", () => {
    expect(intro).toMatch(/none\s*\n?\s*of them feeds the recommendation score/);
  });

  it("admits the four traditions disagree with each other", () => {
    expect(intro).toMatch(/do not always agree/);
  });

  it("keeps the intro quieter than the card headings (no section-title on the group label)", () => {
    // Finding 17's shared spec gives the four cards `h3.section-title`. The
    // group signpost must not compete with them for the same visual weight.
    expect(intro).not.toContain("section-title");
    expect(intro).toContain("day-facts-eyebrow");
  });
});

describe("nothing in this layer creates a gate or a tier", () => {
  it("adds no tier, paywall or upsell language to the day-facts group", () => {
    const group = DAILY_PAGE.slice(DAILY_PAGE.indexOf("const dayFacts = ("), DAILY_PAGE.indexOf("return ("));
    expect(group).not.toMatch(/\btier\b|upgrade|premium|pro plan|unlock|paywall|subscri/i);
  });
});
