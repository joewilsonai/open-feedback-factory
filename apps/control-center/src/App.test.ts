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
  });

  it("can trigger run and release actions", () => {
    expect(source).toContain("/run");
    expect(source).toContain("/release");
  });
});
