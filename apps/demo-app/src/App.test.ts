import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("demo app UI contract", () => {
  const source = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");
  const styles = readFileSync(new URL("./styles.css", import.meta.url), "utf8");

  it("contains the positive and negative feedback paths", () => {
    expect(source).toContain("Daybook");
    expect(source).toContain("Add due dates to todos");
    expect(source).toContain("Add pinned notes");
    expect(source).toContain("Add search so I can find older notes");
    expect(source).toContain("Export every private note");
    expect(source).toContain("floating Suggest button");
    expect(source).toContain("Suggest a Daybook improvement");
    expect(source).toContain("Request due dates for todos");
    expect(source).toContain("Request pinned notes");
    expect(source).toContain("Request note search");
    expect(source).toContain("Test a blocked private export");
    expect(source).not.toContain(">Backlog<");
    expect(source).not.toContain(">Safe<");
    expect(source).not.toContain(">Blocked<");
  });

  it("uses SDK feedback, status, and feature usage methods", () => {
    expect(source).toContain("mountFeedbackLauncher");
    expect(source).toContain("getFeedbackStatus");
    expect(source).toContain("trackFeatureUsage");
    expect(source).toContain("floating-suggestion-launcher");
  });

  it("has persistent notes, todos, and dark mode", () => {
    expect(source).toContain("open-feedback-factory-daybook-theme");
    expect(source).toContain("open-feedback-factory-daybook-note");
    expect(source).toContain("open-feedback-factory-daybook-tasks");
    expect(source).toContain("window.localStorage.getItem");
    expect(source).toContain("window.localStorage.setItem");
    expect(source).toContain('role="switch"');
    expect(source).toContain("todo-item");
    expect(source).toContain("Notes and todos");
    expect(styles).toContain(".theme-switch");
    expect(styles).toContain(".task-list");
  });
});
