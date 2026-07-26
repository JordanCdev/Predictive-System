import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
// @ts-expect-error — plain ESM script, no types
import { TARGET, expectedContents } from "../scripts/sync-shared.mjs";

/**
 * The Cloud Functions carry a generated copy of the plan catalogue (see
 * scripts/sync-shared.mjs). If someone changes a limit on the client without
 * re-syncing, the server would keep enforcing the old bounds — the UI would
 * promise one allowance and the meter would enforce another. Fail loudly.
 */
describe("shared plan catalogue", () => {
  it("is in sync between the app and the Cloud Functions", () => {
    let actual: string;
    try {
      actual = readFileSync(TARGET, "utf8");
    } catch {
      throw new Error("functions/src/shared/plans.ts is missing — run: npm run sync:shared");
    }
    expect(actual, "plan catalogue has drifted — run: npm run sync:shared").toBe(expectedContents());
  });
});
