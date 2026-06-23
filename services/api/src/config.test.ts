import assert from "node:assert/strict";
import test from "node:test";
import { readConfig } from "./config.js";

const KEY = "sk-ant-test-key";

function semantic(env: Record<string, string | undefined>) {
  return readConfig(env as NodeJS.ProcessEnv).semanticClustering;
}

test("semantic clustering enables only for auto/on with an Anthropic key", () => {
  assert.equal(semantic({ SEMANTIC_CLUSTERING: "auto", ANTHROPIC_API_KEY: KEY }).enabled, true);
  assert.equal(semantic({ SEMANTIC_CLUSTERING: "on", ANTHROPIC_API_KEY: KEY }).enabled, true);
  assert.equal(semantic({ SEMANTIC_CLUSTERING: "AUTO", ANTHROPIC_API_KEY: KEY }).enabled, true);
  // Default (unset) is "auto".
  assert.equal(semantic({ ANTHROPIC_API_KEY: KEY }).enabled, true);
});

test("semantic clustering fails closed for off/false/typo/empty", () => {
  for (const mode of ["off", "false", "0", "disabled", "no", "", "yes-please"]) {
    assert.equal(
      semantic({ SEMANTIC_CLUSTERING: mode, ANTHROPIC_API_KEY: KEY }).enabled,
      false,
      `mode "${mode}" must not enable the external call`,
    );
  }
});

test("semantic clustering stays disabled without an Anthropic key even when enabled", () => {
  assert.equal(semantic({ SEMANTIC_CLUSTERING: "auto" }).enabled, false);
  assert.equal(semantic({ SEMANTIC_CLUSTERING: "on", ANTHROPIC_API_KEY: "" }).enabled, false);
});

test("semantic clustering model + timeout fall back to safe defaults", () => {
  const def = semantic({ SEMANTIC_CLUSTERING: "auto", ANTHROPIC_API_KEY: KEY });
  assert.equal(def.model, "claude-haiku-4-5-20251001");
  assert.equal(def.timeoutMs, 4000);

  const custom = semantic({
    SEMANTIC_CLUSTERING: "auto",
    ANTHROPIC_API_KEY: KEY,
    SEMANTIC_CLUSTER_MODEL: "claude-custom",
    SEMANTIC_CLUSTER_TIMEOUT_MS: "1500",
  });
  assert.equal(custom.model, "claude-custom");
  assert.equal(custom.timeoutMs, 1500);

  // Invalid timeout falls back to the default rather than 0/NaN.
  const bad = semantic({
    SEMANTIC_CLUSTERING: "auto",
    ANTHROPIC_API_KEY: KEY,
    SEMANTIC_CLUSTER_TIMEOUT_MS: "not-a-number",
  });
  assert.equal(bad.timeoutMs, 4000);
});
