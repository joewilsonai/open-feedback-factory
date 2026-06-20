import assert from "node:assert/strict";
import test from "node:test";

const modulePath = new URL("./vite-dev-config.mjs", import.meta.url).href;

test("apiProxyTarget prefers an explicit proxy target over .env.example", async () => {
  const previousProxyTarget = process.env.VITE_DEV_API_PROXY_TARGET;
  const previousApiBase = process.env.VITE_API_BASE_URL;
  try {
    process.env.VITE_DEV_API_PROXY_TARGET = "https://proxy.example.test";
    process.env.VITE_API_BASE_URL = "https://api.example.test";

    const { apiProxyTarget } = await import(`${modulePath}?case=explicit-proxy`);

    assert.equal(apiProxyTarget(), "https://proxy.example.test");
  } finally {
    restoreEnv("VITE_DEV_API_PROXY_TARGET", previousProxyTarget);
    restoreEnv("VITE_API_BASE_URL", previousApiBase);
  }
});

test("apiProxyTarget uses explicit API base when no explicit proxy target is set", async () => {
  const previousProxyTarget = process.env.VITE_DEV_API_PROXY_TARGET;
  const previousApiBase = process.env.VITE_API_BASE_URL;
  try {
    delete process.env.VITE_DEV_API_PROXY_TARGET;
    process.env.VITE_API_BASE_URL = "https://api.example.test";

    const { apiProxyTarget } = await import(`${modulePath}?case=api-base`);

    assert.equal(apiProxyTarget(), "https://api.example.test");
  } finally {
    restoreEnv("VITE_DEV_API_PROXY_TARGET", previousProxyTarget);
    restoreEnv("VITE_API_BASE_URL", previousApiBase);
  }
});

function restoreEnv(key, value) {
  if (value === undefined) {
    delete process.env[key];
    return;
  }
  process.env[key] = value;
}
