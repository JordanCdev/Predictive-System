import { describe, expect, it } from "vitest";
import { parseAbsoluteDateQuery } from "../src/ui/dateQuery.ts";

// The global search bar routes unambiguous absolute dates straight to /day/:iso.
// Anything ambiguous or partial must fall through (null) to the decision matcher.
describe("absolute-date detection in the global search", () => {
  it("reads ISO and year-first slash dates", () => {
    expect(parseAbsoluteDateQuery("2027-10-14")).toBe("2027-10-14");
    expect(parseAbsoluteDateQuery("2027/1/9")).toBe("2027-01-09");
  });

  it("reads month-name forms in either order", () => {
    expect(parseAbsoluteDateQuery("14 Oct 2027")).toBe("2027-10-14");
    expect(parseAbsoluteDateQuery("14th October 2027")).toBe("2027-10-14");
    expect(parseAbsoluteDateQuery("Oct 14 2027")).toBe("2027-10-14");
    expect(parseAbsoluteDateQuery("October 14, 2027")).toBe("2027-10-14");
    expect(parseAbsoluteDateQuery("  october 14th 2027 ")).toBe("2027-10-14");
  });

  it("rejects impossible calendar dates", () => {
    expect(parseAbsoluteDateQuery("2027-02-30")).toBeNull();
    expect(parseAbsoluteDateQuery("31 Apr 2027")).toBeNull();
  });

  it("never guesses: locale-ambiguous and non-date queries fall through", () => {
    expect(parseAbsoluteDateQuery("3/4/2027")).toBeNull(); // dd/mm vs mm/dd — ambiguous
    expect(parseAbsoluteDateQuery("14 Oct")).toBeNull(); // no year — not absolute
    expect(parseAbsoluteDateQuery("next friday")).toBeNull();
    expect(parseAbsoluteDateQuery("sign a contract")).toBeNull();
    expect(parseAbsoluteDateQuery("14 Foo 2027")).toBeNull();
  });

  it("is deterministic", () => {
    expect(parseAbsoluteDateQuery("14 Oct 2027")).toBe(parseAbsoluteDateQuery("14 oct 2027"));
  });
});
