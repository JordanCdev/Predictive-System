import { describe, expect, it } from "vitest";
import {
  BranchHit,
  branchAgainstNatal,
  interactionPolarity,
  resolveBranchHits,
  stemClash,
  stemCombination,
} from "../src/engine/interactions.ts";

// Branch indices: 子0 丑1 寅2 卯3 辰4 巳5 午6 未7 申8 酉9 戌10 亥11
// Stem indices:   甲0 乙1 丙2 丁3 戊4 己5 庚6 辛7 壬8 癸9

const natal = (...spec: [number, "year" | "month" | "day" | "hour"][]) =>
  spec.map(([index, position]) => ({ index, position }));
const has = (hits: BranchHit[], type: string) => hits.some((h) => h.type === type);

describe("stem interactions", () => {
  it("五合 — five combinations with their transform element", () => {
    expect(stemCombination(0, 5)).toBe("earth"); // 甲己
    expect(stemCombination(1, 6)).toBe("metal"); // 乙庚
    expect(stemCombination(2, 7)).toBe("water"); // 丙辛
    expect(stemCombination(3, 8)).toBe("wood"); // 丁壬
    expect(stemCombination(4, 9)).toBe("fire"); // 戊癸
    expect(stemCombination(0, 1)).toBeNull(); // 甲乙 — not a combination
  });

  it("四沖 — four stem clashes; Earth stems never clash", () => {
    expect(stemClash(0, 6)).toBe(true); // 甲庚
    expect(stemClash(1, 7)).toBe(true); // 乙辛
    expect(stemClash(2, 8)).toBe(true); // 丙壬
    expect(stemClash(3, 9)).toBe(true); // 丁癸
    expect(stemClash(4, 0)).toBe(false); // 戊 (Earth) — no clash
    expect(stemClash(5, 1)).toBe(false); // 己 (Earth) — no clash
    expect(stemClash(0, 1)).toBe(false); // 甲乙 — not opposite
  });
});

describe("branch pairwise relations", () => {
  it("detects 六沖 (opposite on the wheel)", () => {
    expect(has(branchAgainstNatal(0, natal([6, "day"])), "six_clash")).toBe(true); // 子↔午
    expect(has(branchAgainstNatal(2, natal([8, "day"])), "six_clash")).toBe(true); // 寅↔申
  });

  it("detects 六合 with its element", () => {
    const h = branchAgainstNatal(0, natal([1, "month"])).find((x) => x.type === "six_harmony")!; // 子丑
    expect(h.element).toBe("earth");
  });

  it("detects 六害", () => {
    expect(has(branchAgainstNatal(0, natal([7, "day"])), "six_harm")).toBe(true); // 子未
    expect(has(branchAgainstNatal(9, natal([10, "hour"])), "six_harm")).toBe(true); // 酉戌
  });

  it("detects 破 (destruction)", () => {
    expect(has(branchAgainstNatal(0, natal([9, "day"])), "destruction")).toBe(true); // 子酉
  });

  it("子卯 rude punishment", () => {
    const h = branchAgainstNatal(0, natal([3, "day"]));
    expect(has(h, "punishment")).toBe(true);
    expect(h.find((x) => x.type === "punishment")?.note).toMatch(/子卯/);
  });

  it("自刑 self-punishment when external equals a self-punishing natal branch", () => {
    expect(has(branchAgainstNatal(4, natal([4, "day"])), "self_punishment")).toBe(true); // 辰辰
    expect(has(branchAgainstNatal(0, natal([0, "day"])), "self_punishment")).toBe(false); // 子 doesn't self-punish
  });
});

describe("branch triples", () => {
  it("三合 full — external completes the harmony", () => {
    const h = branchAgainstNatal(0, natal([8, "year"], [4, "hour"])).find((x) => x.type === "three_harmony")!; // 申子辰
    expect(h.element).toBe("water");
    expect(h.natalBranches.sort()).toEqual([4, 8]);
  });

  it("半三合 — only when the pair includes the cardinal (子/午/卯/酉)", () => {
    // 子 + 申 includes cardinal 子 → half water
    expect(has(branchAgainstNatal(0, natal([8, "year"])), "three_harmony_half")).toBe(true);
    // 申 + 辰 has NO cardinal → no half (the "no central qi" pair)
    expect(has(branchAgainstNatal(8, natal([4, "year"])), "three_harmony_half")).toBe(false);
  });

  it("三會 directional frame — external completes the season", () => {
    const h = branchAgainstNatal(2, natal([3, "month"], [4, "day"])).find((x) => x.type === "three_meeting")!; // 寅卯辰 East/Wood
    expect(h.element).toBe("wood");
  });

  it("group 刑 fires partially with 2 of 3 present", () => {
    expect(has(branchAgainstNatal(2, natal([5, "day"])), "punishment")).toBe(true); // 寅+巳 of 寅巳申
    const full = branchAgainstNatal(2, natal([5, "day"], [8, "hour"]));
    expect(has(full, "punishment")).toBe(true);
  });
});

describe("resolution 合解沖", () => {
  it("attenuates a clash when the clashed natal branch is locked in a natal harmony", () => {
    // External 午 clashes natal 子; but 子 is locked (e.g. natal 申子辰 water frame).
    const hits = branchAgainstNatal(6, natal([0, "day"]));
    expect(has(hits, "six_clash")).toBe(true);
    const resolved = resolveBranchHits(hits, new Set([0]));
    const clash = resolved.find((h) => h.type === "six_clash")!;
    expect(clash.attenuated).toBe(true);
  });

  it("leaves a clash intact when the branch is not locked", () => {
    const hits = branchAgainstNatal(6, natal([0, "day"]));
    const resolved = resolveBranchHits(hits);
    expect(resolved.find((h) => h.type === "six_clash")?.attenuated).toBeFalsy();
  });
});

describe("interaction polarity", () => {
  it("harmonies are positive, conflicts negative", () => {
    expect(interactionPolarity("three_harmony")).toBe(1);
    expect(interactionPolarity("six_harmony")).toBe(1);
    expect(interactionPolarity("six_clash")).toBe(-1);
    expect(interactionPolarity("punishment")).toBe(-1);
    expect(interactionPolarity("destruction")).toBe(-1);
  });
});
