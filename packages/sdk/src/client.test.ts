import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createOpenFeedbackClient } from "./client.js";

test("submitFeedback sends privacy-safe metadata", async () => {
  const requests: Array<{ body: unknown; url: string }> = [];
  const client = createOpenFeedbackClient({
    apiBaseUrl: "http://localhost:4100/",
    fetchImpl: async (url, init) => {
      requests.push({
        body: JSON.parse(String(init?.body)),
        url: String(url),
      });
      return Response.json({
        feedbackId: "feedback_1",
        status: {
          feedbackId: "feedback_1",
          label: "Planned",
          message: "Queued",
          state: "planned",
          timeline: [],
        },
        workItemId: "work_1",
      });
    },
    metadata: {
      appVersion: "1.0.0",
      rawTranscript: "private",
    },
    userId: "user-1",
  });

  const result = await client.submitFeedback({
    message: "Please add dark mode",
    metadata: {
      route: "/settings",
      token: "secret",
    },
  });

  assert.equal(result.feedbackId, "feedback_1");
  assert.equal(requests[0]?.url, "http://localhost:4100/sdk/feedback");
  assert.deepEqual(requests[0]?.body, {
    message: "Please add dark mode",
    metadata: {
      appVersion: "1.0.0",
      route: "/settings",
    },
    severity: "medium",
    source: "web_sdk",
    userId: "user-1",
  });
});

test("trackFeatureUsage posts feature usage event", async () => {
  const urls: string[] = [];
  const client = createOpenFeedbackClient({
    apiBaseUrl: "http://localhost:4100",
    fetchImpl: async (url) => {
      urls.push(String(url));
      return Response.json({ usageId: "usage_1" }, { status: 201 });
    },
    userId: "user-1",
  });

  const result = await client.trackFeatureUsage({
    action: "enabled",
    featureId: "dark-mode",
  });

  assert.equal(result.usageId, "usage_1");
  assert.deepEqual(urls, ["http://localhost:4100/sdk/features/dark-mode/usage"]);
});

test("feedback launcher exposes a floating suggestion UI contract", () => {
  const widgetSource = readFileSync(new URL("./widget.ts", import.meta.url), "utf8");
  const indexSource = readFileSync(new URL("./index.ts", import.meta.url), "utf8");

  assert.match(indexSource, /export \* from "\.\/widget\.js"/);
  assert.match(widgetSource, /mountFeedbackLauncher/);
  assert.match(widgetSource, /off-launcher-button/);
  assert.match(widgetSource, /buttonIcon/);
  assert.match(widgetSource, /bottom-left/);
  assert.match(widgetSource, /Suggest an improvement/);
  assert.match(widgetSource, /Suggested requests/);
  assert.match(widgetSource, /Send suggestion/);
  assert.match(widgetSource, /web_sdk_launcher/);
  assert.match(widgetSource, /position: fixed/);
});
