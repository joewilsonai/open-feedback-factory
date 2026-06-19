import assert from "node:assert/strict";
import test from "node:test";
import { buildUserStatus } from "./status.js";

test("buildUserStatus returns safe user-facing copy and timeline", () => {
  const status = buildUserStatus({
    feedbackId: "feedback_1",
    message: "Dark mode shipped in the demo app.",
    state: "shipped",
  });

  assert.equal(status.label, "Shipped");
  assert.equal(status.timeline[0]?.event, "feedback_received");
  assert.equal(status.message.includes("GitHub"), false);
});
