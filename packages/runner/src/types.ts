import type { WorkItemRow } from "@open-feedback-factory/db";

export interface RunnerResult {
  assumptions: string[];
  branchName: string | null;
  changedFiles: string[];
  checksRun: string[];
  checksSkipped: string[];
  costActual: {
    amountUsd: number;
    confidence: "high" | "medium" | "low";
    model: string;
    tokens?: number;
  };
  output: string;
  status: "blocked" | "failed" | "succeeded";
  summary: string;
  userMessage: string;
}

export interface CodexUsage {
  cachedInputTokens: number;
  inputTokens: number;
  outputTokens: number;
  reasoningOutputTokens: number;
}

export interface CodexStructuredResult {
  assumptions: string[];
  changedFiles: string[];
  checksRun: string[];
  checksSkipped: string[];
  costSummary: string;
  outcome: "blocked" | "failed" | "implemented";
  summary: string;
  userMessage: string;
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

export interface GitHubPullRequestFileSummary {
  additions: number;
  changes: number;
  deletions: number;
  path: string;
}

export interface GitHubPullRequestEvidence {
  changedFiles: string[];
  checkSummaries: GitHubCheckSummary[];
  checksPassed: boolean;
  diffLineCount: number;
  fileSummaries: GitHubPullRequestFileSummary[];
  headBranch: string | null;
  headSha: string | null;
}

export interface GitHubAccessibleRepository {
  fullName: string;
  htmlUrl: string | null;
  name: string;
  owner: string | null;
  permissions: Record<string, boolean>;
  private: boolean;
}

export interface GitHubInstallationRepositoryList {
  repositories: GitHubAccessibleRepository[];
  totalCount: number;
  truncated: boolean;
}
