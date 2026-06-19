import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("demo app UI contract", () => {
  const source = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");

  it("contains the positive and negative feedback paths", () => {
    expect(source).toContain("Please add dark mode to settings");
    expect(source).toContain("Please export private conversations");
    expect(source).toContain("Make the dashboard more delightful");
  });

  it("uses SDK feedback, status, and feature usage methods", () => {
    expect(source).toContain("submitFeedback");
    expect(source).toContain("getFeedbackStatus");
    expect(source).toContain("trackFeatureUsage");
  });
});
