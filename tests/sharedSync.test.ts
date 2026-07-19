import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
// @ts-expect-error — plain ESM script, no types
import { TARGET, expectedContents } from "../scripts/sync-shared.mjs";

/**
 * The Cloud Functions carry a generated copy of the plan catalogue (see
 * scripts/sync-shared.mjs). If someone changes a limit, price or feature list on
 * the client without re-syncing, the server would keep enforcing the old rules —
 * a user could pay for Pro and still be metered as Free. Fail loudly instead.
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
