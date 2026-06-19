import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("control center UI contract", () => {
  const source = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");

  it("shows the required operator surfaces", () => {
    expect(source).toContain("Control Center");
    expect(source).toContain("Install wizard");
    expect(source).toContain("Create GitHub App");
    expect(source).toContain("Webhooks");
    expect(source).toContain("Work items");
    expect(source).toContain("Agent runs");
    expect(source).toContain("Feature usage");
    expect(source).toContain("Cost");
    expect(source).toContain("Auto-merge");
    expect(source).toContain("Manual approval required");
    expect(source).toContain("Auto approval");
    expect(source).toContain("Agent credentials");
    expect(source).toContain("Health");
    expect(source).toContain("Codex CLI");
  });

  it("can trigger run, auto-merge, and release actions", () => {
    expect(source).toContain("/doctor");
    expect(source).toContain("/github/app/setup");
    expect(source).toContain("/github/app/manifest");
    expect(source).toContain("/run");
    expect(source).toContain("/automerge");
    expect(source).toContain("/release");
  });
});
