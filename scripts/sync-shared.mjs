#!/usr/bin/env node
/**
 * Copy the plan catalogue into the Cloud Functions source tree.
 *
 * `src/billing/plans.ts` is the single source of truth for what each tier
 * unlocks, and both sides need it: the browser to draw gates, the functions to
 * enforce quotas and map Stripe prices. The functions build has its own
 * `rootDir` and can't reach up into the app tree, so the file is copied rather
 * than imported — and `tests/sharedSync.test.ts` fails the build if the copy
 * ever drifts from the original.
 *
 * Run `npm run sync:shared` after editing the catalogue.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export const SOURCE = resolve(root, "src/billing/plans.ts");
export const TARGET = resolve(root, "functions/src/shared/plans.ts");

export const HEADER = `// ⚠️  GENERATED FILE — DO NOT EDIT.
// Copied verbatim from src/billing/plans.ts by scripts/sync-shared.mjs so the
// browser and the Cloud Functions enforce exactly the same plan rules.
// Edit the original, then run: npm run sync:shared

`;

/** The exact contents the target file should have, given the current source. */
export function expectedContents() {
  return HEADER + readFileSync(SOURCE, "utf8");
}

// Only write when invoked directly (the test imports the helpers above).
if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  mkdirSync(dirname(TARGET), { recursive: true });
  writeFileSync(TARGET, expectedContents());
  console.log(`synced → ${TARGET.replace(root + "/", "")}`);
}
