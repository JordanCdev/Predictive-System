import { describe, expect, it } from "vitest";
import { buildFourPillars, MomentInput } from "../src/engine/sexagenary.ts";
import { buildBaziChart } from "../src/engine/bazi.ts";
import { ZIPING_DEFAULT } from "../src/engine/conventions.ts";
import { chatDateLabel, isValidIsoDate, splitDateTokens } from "../src/ui/chatDates.ts";
import { buildChatChips } from "../src/ui/chatChips.ts";

describe("chat date tokens — [YYYY-MM-DD] and bare ISO dates", () => {
  it("splits a bracketed token into a date segment with a readable label", () => {
    const segs = splitDateTokens("Your best day is [2026-10-14], a Wednesday.");
    expect(segs).toEqual([
      { kind: "text", text: "Your best day is " },
      { kind: "date", iso: "2026-10-14", display: "Wed 14 Oct 2026" },
      { kind: "text", text: ", a Wednesday." },
    ]);
  });

  it("also links bare ISO dates, but not ones embedded in longer runs", () => {
    const segs = splitDateTokens("Compare 2026-10-14 with v2026-01-01x and 12026-01-013.");
    const dates = segs.filter((s) => s.kind === "date");
    expect(dates).toEqual([{ kind: "date", iso: "2026-10-14", display: "Wed 14 Oct 2026" }]);
  });

  it("leaves non-existent dates as plain text", () => {
    const segs = splitDateTokens("Try [2026-02-30] instead.");
    expect(segs.every((s) => s.kind === "text")).toBe(true);
    expect(segs.map((s) => (s as { text: string }).text).join("")).toBe("Try [2026-02-30] instead.");
  });

  it("handles multiple dates and text without any date", () => {
    const segs = splitDateTokens("[2026-01-05] or [2026-01-06]");
    expect(segs.filter((s) => s.kind === "date").length).toBe(2);
    expect(splitDateTokens("no dates here")).toEqual([{ kind: "text", text: "no dates here" }]);
  });

  it("validates calendar dates strictly", () => {
    expect(isValidIsoDate("2026-12-31")).toBe(true);
    expect(isValidIsoDate("2026-13-01")).toBe(false);
    expect(isValidIsoDate("2026-02-30")).toBe(false);
    expect(chatDateLabel("2028-02-29")).toBe("Tue 29 Feb 2028"); // leap day
  });
});

describe("profile-aware suggested chips", () => {
  const birth: MomentInput = { year: 1990, month: 6, day: 15, hour: 14, minute: 30, tzOffsetMinutes: 480 };
  const chart = buildBaziChart(buildFourPillars(birth, ZIPING_DEFAULT));

  it("builds 4–6 chips from the actual chart, deterministically", () => {
    const a = buildChatChips(chart, false);
    const b = buildChatChips(chart, false);
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThanOrEqual(4);
    expect(a.length).toBeLessThanOrEqual(6);
    expect(a.some((c) => c.label === "How is today for me?")).toBe(true);
    expect(a.some((c) => c.label === "Explain my hidden stems")).toBe(true);
  });

  it("never hands a free user a Pro chip; Pro users get at most one, marked", () => {
    const free = buildChatChips(chart, false);
    expect(free.every((c) => !c.pro)).toBe(true);
    const pro = buildChatChips(chart, true);
    expect(pro.filter((c) => c.pro).length).toBeLessThanOrEqual(1);
  });
});
