import assert from "node:assert/strict";
import test from "node:test";
import { createAnthropicIntentClassifier, parseClassifierResponse } from "./intentClassifier.js";

function anthropicTextResponse(text: string): Response {
  return new Response(JSON.stringify({ content: [{ type: "text", text }] }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

test("parseClassifierResponse reads a clean JSON answer", () => {
  const result = parseClassifierResponse('{"clusterKey":"watering-reminders","title":"Watering reminders"}');
  assert.deepEqual(result, { clusterKey: "watering-reminders", title: "Watering reminders" });
});

test("parseClassifierResponse tolerates surrounding prose / code fences", () => {
  const result = parseClassifierResponse('Here you go:\n```json\n{"clusterKey":"dark-mode"}\n```');
  assert.deepEqual(result, { clusterKey: "dark-mode", title: undefined });
});

test("parseClassifierResponse returns null on missing key, bad JSON, or empty", () => {
  assert.equal(parseClassifierResponse('{"title":"no key"}'), null);
  assert.equal(parseClassifierResponse("not json at all"), null);
  assert.equal(parseClassifierResponse(""), null);
  assert.equal(parseClassifierResponse(null), null);
});

test("classifier sends only the sanitized message with correct auth headers", async () => {
  let capturedUrl = "";
  let capturedInit: RequestInit | undefined;
  const classifier = createAnthropicIntentClassifier({
    apiKey: "test-key",
    model: "claude-haiku-4-5-20251001",
    fetchImpl: async (url, init) => {
      capturedUrl = String(url);
      capturedInit = init;
      return anthropicTextResponse('{"clusterKey":"watering-reminders","title":"Watering reminders"}');
    },
  });

  const result = await classifier.classify("ping me when it is time to water my plants");

  assert.deepEqual(result, { clusterKey: "watering-reminders", title: "Watering reminders" });
  assert.equal(capturedUrl, "https://api.anthropic.com/v1/messages");
  const headers = capturedInit?.headers as Record<string, string>;
  assert.equal(headers["x-api-key"], "test-key");
  assert.equal(headers["anthropic-version"], "2023-06-01");
  const body = JSON.parse(String(capturedInit?.body));
  assert.equal(body.model, "claude-haiku-4-5-20251001");
  assert.equal(body.temperature, 0);
  assert.deepEqual(body.messages, [
    { role: "user", content: "ping me when it is time to water my plants" },
  ]);
});

test("classifier returns null on a non-200 response", async () => {
  const classifier = createAnthropicIntentClassifier({
    apiKey: "k",
    model: "m",
    fetchImpl: async () => new Response("rate limited", { status: 429 }),
  });
  assert.equal(await classifier.classify("some request"), null);
});

test("classifier returns null when the network throws (never breaks intake)", async () => {
  const classifier = createAnthropicIntentClassifier({
    apiKey: "k",
    model: "m",
    fetchImpl: async () => {
      throw new Error("connection reset");
    },
  });
  assert.equal(await classifier.classify("some request"), null);
});

test("classifier skips the network for empty input", async () => {
  let called = false;
  const classifier = createAnthropicIntentClassifier({
    apiKey: "k",
    model: "m",
    fetchImpl: async () => {
      called = true;
      return anthropicTextResponse("{}");
    },
  });
  assert.equal(await classifier.classify("   "), null);
  assert.equal(called, false);
});
