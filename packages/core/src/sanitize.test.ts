import assert from "node:assert/strict";
import test from "node:test";
import { sanitizeFeedback } from "./sanitize.js";

test("sanitizeFeedback redacts private contact and secret data", () => {
  const result = sanitizeFeedback({
    message: "Email joe@example.com, call 555-123-4567, token=sk-secretsecretsecret",
    metadata: {
      appVersion: "1.0.0",
      rawTranscript: "private conversation",
    },
    source: "demo",
  });

  assert.equal(result.sanitizedMessage.includes("joe@example.com"), false);
  assert.equal(result.sanitizedMessage.includes("555-123-4567"), false);
  assert.equal(result.sanitizedMessage.includes("sk-secretsecretsecret"), false);
  assert.deepEqual(result.safeMetadata, { appVersion: "1.0.0" });
  assert.equal(result.redactions.includes("email"), true);
  assert.equal(result.redactions.includes("phone"), true);
  assert.equal(result.redactions.includes("secret"), true);
  assert.equal(result.redactions.includes("rawtranscript"), true);
  assert.equal(result.privacyRisk, "blocked");
});

test("sanitizeFeedback keeps simple product feedback low risk", () => {
  const result = sanitizeFeedback({
    message: "Please add dark mode to settings",
    metadata: {
      route: "/settings",
      surface: "settings",
    },
    source: "demo",
  });

  assert.equal(result.sanitizedMessage, "Please add dark mode to settings");
  assert.equal(result.privacyRisk, "low");
  assert.deepEqual(result.redactions, []);
});
