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

export interface CodexUsage {
  cachedInputTokens: number;
  inputTokens: number;
  outputTokens: number;
  reasoningOutputTokens: number;
}

export interface CodexStructuredResult {
  changedFiles: string[];
  outcome: "blocked" | "failed" | "implemented";
  summary: string;
}

export interface CodexPricing {
  cachedInputUsdPerMillion: number;
  inputUsdPerMillion: number;
  outputUsdPerMillion: number;
  reasoningOutputUsdPerMillion: number;
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

export interface GitHubCommentInput {
  body: string;
  issueOrPr: string;
}

export interface GitHubCheckSummary {
  conclusion: string | null;
  name: string;
  status: string;
  url: string | null;
}
