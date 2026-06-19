import assert from "node:assert/strict";
import test from "node:test";
import {
  assumptionBlocksAutoMerge,
  assumptionsBlockAutoMerge,
  buildAssumptionRecord,
} from "./assumptions.js";

test("buildAssumptionRecord normalizes empty assumptions", () => {
  assert.deepEqual(buildAssumptionRecord(), {
    alternativesSkipped: [],
    assumptions: [],
    checksRun: [],
    checksSkipped: [],
    confidence: "low",
    defaultsUsed: [],
    humanQuestions: [],
    impactAreas: ["none"],
    notes: "No additional notes.",
    unresolved: false,
  });
});

test("assumptionBlocksAutoMerge blocks unresolved privacy cost merge or release assumptions", () => {
  const record = buildAssumptionRecord({
    assumptions: ["Assumed release marker means production availability."],
    checksSkipped: ["No deployment webhook configured."],
    impactAreas: ["release_status"],
  });

  assert.equal(record.unresolved, true);
  assert.equal(assumptionBlocksAutoMerge(record), true);
  assert.equal(assumptionsBlockAutoMerge([record]), true);
});

test("assumptionBlocksAutoMerge allows resolved product-only assumptions", () => {
  const record = buildAssumptionRecord({
    assumptions: ["Assumed button label should use current app voice."],
    impactAreas: ["product_behavior"],
    unresolved: false,
  });

  assert.equal(assumptionBlocksAutoMerge(record), false);
});
