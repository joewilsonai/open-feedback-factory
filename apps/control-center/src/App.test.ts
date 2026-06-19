import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("control center UI contract", () => {
  const source = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");

  it("shows the required operator surfaces", () => {
    expect(source).toContain("Control Center");
    expect(source).toContain("Work items");
    expect(source).toContain("Agent runs");
    expect(source).toContain("Feature usage");
    expect(source).toContain("Cost");
    expect(source).toContain("Auto-merge");
    expect(source).toContain("Health");
  });

  it("can trigger run, auto-merge, and release actions", () => {
    expect(source).toContain("/doctor");
    expect(source).toContain("/run");
    expect(source).toContain("/automerge");
    expect(source).toContain("/release");
  });
});
