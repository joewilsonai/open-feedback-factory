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
    expect(source).toContain("Work item");
    expect(source).toContain("Agent runs");
    expect(source).toContain("Agent assumptions");
    expect(source).toContain("Unresolved assumptions");
    expect(source).toContain("Feature usage");
    expect(source).toContain("Cost");
    expect(source).toContain("Actual cost");
    expect(source).toContain("Reconciliation");
    expect(source).toContain("Run reconciliation");
    expect(source).toContain("Auto-merge");
    expect(source).toContain("Manual approval required");
    expect(source).toContain("Auto approval");
    expect(source).toContain("Switch to auto");
    expect(source).toContain("Switch modes here");
    expect(source).toContain("Agent credentials");
    expect(source).toContain("Codex auth");
    expect(source).toContain("OpenAI API key");
    expect(source).toContain("Save key");
    expect(source).toContain("Codex API key");
    expect(source).toContain("saved key injected server-side");
    expect(source).toContain("Low-risk auto lane");
    expect(source).toContain("Implemented, awaiting review");
    expect(source).not.toContain("Demo centerpiece");
    expect(source).toContain("Health");
    expect(source).toContain("Codex CLI");
  });

  it("can trigger run, auto-merge, and release actions", () => {
    expect(source).toContain("/doctor");
    expect(source).toContain("/admin/settings/approval-mode");
    expect(source).toContain("/admin/settings/codex-auth-mode");
    expect(source).toContain("/admin/settings/codex-api-key");
    expect(source).toContain("/github/app/setup");
    expect(source).toContain("/github/app/manifest");
    expect(source).toContain("/run");
    expect(source).toContain("/automerge");
    expect(source).toContain("/release");
    expect(source).toContain("/admin/reconciliation/run");
  });
});
