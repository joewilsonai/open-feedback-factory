import assert from "node:assert/strict";
import test from "node:test";
import {
  isWorkCadenceClaimWindowOpen,
  normalizeWorkCadencePolicy,
} from "./cadence.js";

test("scheduled cadence opens only during the configured UTC batch window", () => {
  const policy = normalizeWorkCadencePolicy({
    hourUtc: 9,
    interval: "weekly",
    mode: "scheduled",
    scheduledDayOfWeek: 2,
    threshold: 3,
  });

  assert.equal(isWorkCadenceClaimWindowOpen(policy, new Date("2026-06-23T09:15:00.000Z")), true);
  assert.equal(isWorkCadenceClaimWindowOpen(policy, new Date("2026-06-23T08:59:00.000Z")), false);
  assert.equal(isWorkCadenceClaimWindowOpen(policy, new Date("2026-06-24T09:15:00.000Z")), false);
});

test("cadence policy normalizes unsafe thresholds and schedule values", () => {
  assert.deepEqual(
    normalizeWorkCadencePolicy({
      hourUtc: 99,
      interval: "monthly",
      mode: "threshold",
      scheduledDayOfMonth: 40,
      threshold: 0,
    }),
    {
      hourUtc: 23,
      interval: "monthly",
      mode: "threshold",
      scheduledDayOfMonth: 31,
      scheduledDayOfWeek: 1,
      threshold: 1,
    },
  );
});
