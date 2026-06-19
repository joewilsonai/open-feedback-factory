import type { WorkItemRow } from "@open-feedback-factory/db";

export interface RunnerResult {
  branchName: string | null;
  changedFiles: string[];
  costActual: {
    amountUsd: number;
    confidence: "high" | "medium" | "low";
    model: string;
    tokens?: number;
  };
  output: string;
  status: "blocked" | "failed" | "succeeded";
  summary: string;
}

export interface WorkRunner {
  run(workItem: WorkItemRow): Promise<RunnerResult>;
}

export interface GitHubIssueInput {
  body: string;
  labels: string[];
  title: string;
}

export interface GitHubPullRequestInput {
  base: string;
  body: string;
  head: string;
  title: string;
}
