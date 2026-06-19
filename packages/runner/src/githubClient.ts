import { spawn } from "node:child_process";
import type { GitHubIssueInput, GitHubPullRequestInput } from "./types.js";

export class GitHubClient {
  constructor(private readonly options: { cwd: string; gh?: string }) {}

  async createIssue(input: GitHubIssueInput): Promise<string> {
    const args = [
      "issue",
      "create",
      "--title",
      input.title,
      "--body",
      input.body,
      ...input.labels.flatMap((label) => ["--label", label]),
    ];
    return runGh(this.options.gh ?? "gh", args, this.options.cwd);
  }

  async createPullRequest(input: GitHubPullRequestInput): Promise<string> {
    return runGh(
      this.options.gh ?? "gh",
      [
        "pr",
        "create",
        "--base",
        input.base,
        "--head",
        input.head,
        "--title",
        input.title,
        "--body",
        input.body,
      ],
      this.options.cwd,
    );
  }

  async mergePullRequest(prUrlOrNumber: string): Promise<string> {
    return runGh(this.options.gh ?? "gh", ["pr", "merge", prUrlOrNumber, "--squash", "--auto"], this.options.cwd);
  }
}

function runGh(command: string, args: string[], cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve(stdout.trim());
        return;
      }
      reject(new Error(`gh exited ${code}: ${stderr || stdout}`));
    });
  });
}
