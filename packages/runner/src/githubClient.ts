import { createSign } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import type {
  GitHubCheckSummary,
  GitHubInstallationRepositoryList,
  GitHubCommentInput,
  GitHubIssueInput,
  GitHubPullRequestEvidence,
  GitHubPullRequestFileSummary,
  GitHubPullRequestInput,
} from "./types.js";

export type GitHubClientMode = "app" | "gh";

export interface GitHubClientOptions {
  apiBaseUrl?: string;
  appId?: string;
  appPrivateKey?: string;
  appPrivateKeyPath?: string;
  cwd: string;
  fetch?: typeof fetch;
  gh?: string;
  installationId?: string;
  mode?: GitHubClientMode;
  owner?: string;
  repo?: string;
}

interface InstallationToken {
  expiresAt: number;
  token: string;
}

export class GitHubClient {
  private installationToken: InstallationToken | null = null;

  constructor(private readonly options: GitHubClientOptions) {}

  async createIssue(input: GitHubIssueInput): Promise<string> {
    if (this.mode() === "gh") {
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

    const issue = await this.appRequest<Record<string, unknown>>(`/repos/${this.repoPath()}/issues`, {
      body: JSON.stringify({
        body: input.body,
        labels: input.labels,
        title: input.title,
      }),
      method: "POST",
    });
    return stringFrom(issue.html_url, "GitHub issue response missing html_url");
  }

  async createPullRequest(input: GitHubPullRequestInput): Promise<string> {
    if (this.mode() === "gh") {
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

    const pr = await this.appRequest<Record<string, unknown>>(`/repos/${this.repoPath()}/pulls`, {
      body: JSON.stringify({
        base: input.base,
        body: input.body,
        head: input.head,
        title: input.title,
      }),
      method: "POST",
    });
    return stringFrom(pr.html_url, "GitHub pull request response missing html_url");
  }

  async pushBranch(branchName: string): Promise<string> {
    if (this.mode() === "gh") {
      return runGit(this.options.cwd, ["push", "--set-upstream", "origin", branchName]);
    }

    const token = await this.getInstallationToken();
    return runGitWithAppToken(this.options.cwd, this.owner(), this.repo(), branchName, token);
  }

  async comment(input: GitHubCommentInput): Promise<string> {
    if (this.mode() === "gh") {
      return runGh(
        this.options.gh ?? "gh",
        ["issue", "comment", input.issueOrPr, "--body", input.body],
        this.options.cwd,
      );
    }

    const number = githubNumberFromReference(input.issueOrPr);
    const comment = await this.appRequest<Record<string, unknown>>(
      `/repos/${this.repoPath()}/issues/${number}/comments`,
      {
        body: JSON.stringify({ body: input.body }),
        method: "POST",
      },
    );
    return stringFrom(comment.html_url, "GitHub comment response missing html_url");
  }

  async mergePullRequest(prUrlOrNumber: string): Promise<string> {
    if (this.mode() === "gh") {
      return runGh(this.options.gh ?? "gh", ["pr", "merge", prUrlOrNumber, "--squash", "--auto"], this.options.cwd);
    }

    const number = githubNumberFromReference(prUrlOrNumber);
    const merge = await this.appRequest<Record<string, unknown>>(
      `/repos/${this.repoPath()}/pulls/${number}/merge`,
      {
        body: JSON.stringify({ merge_method: "squash" }),
        method: "PUT",
      },
    );
    return JSON.stringify({
      merged: merge.merged,
      message: merge.message,
      sha: merge.sha,
    });
  }

  async listPullRequestFiles(prUrlOrNumber: string): Promise<string[]> {
    return (await this.listPullRequestFileSummaries(prUrlOrNumber)).map((file) => file.path);
  }

  async listPullRequestFileSummaries(prUrlOrNumber: string): Promise<GitHubPullRequestFileSummary[]> {
    const number = githubNumberFromReference(prUrlOrNumber);
    if (this.mode() === "gh") {
      const output = await runGh(
        this.options.gh ?? "gh",
        ["pr", "view", String(number), "--json", "files", "--jq", ".files"],
        this.options.cwd,
      );
      const files = JSON.parse(output) as Array<Record<string, unknown>>;
      return files.map(fileSummaryFromGitHub).filter((file) => file.path);
    }

    const files = await this.appRequest<Array<Record<string, unknown>>>(
      `/repos/${this.repoPath()}/pulls/${number}/files`,
    );
    return files.map(fileSummaryFromGitHub).filter((file) => file.path);
  }

  async listPullRequestChecks(ref: string): Promise<GitHubCheckSummary[]> {
    if (this.mode() === "gh") {
      const output = await runGh(
        this.options.gh ?? "gh",
        ["pr", "view", ref, "--json", "statusCheckRollup", "--jq", ".statusCheckRollup"],
        this.options.cwd,
      );
      const checks = JSON.parse(output) as Array<Record<string, unknown>>;
      return checks.map(checkSummaryFromGh);
    }

    const checks = await this.appRequest<{ check_runs?: Array<Record<string, unknown>> }>(
      `/repos/${this.repoPath()}/commits/${encodeURIComponent(ref)}/check-runs`,
    );
    return (checks.check_runs ?? []).map((check) => ({
      conclusion: typeof check.conclusion === "string" ? check.conclusion : null,
      name: String(check.name ?? "check"),
      status: String(check.status ?? "unknown"),
      url: typeof check.html_url === "string" ? check.html_url : null,
    }));
  }

  async getPullRequestEvidence(prUrlOrNumber: string): Promise<GitHubPullRequestEvidence> {
    const number = githubNumberFromReference(prUrlOrNumber);
    if (this.mode() === "gh") {
      const output = await runGh(
        this.options.gh ?? "gh",
        ["pr", "view", String(number), "--json", "files,headRefName,statusCheckRollup", "--jq", "."],
        this.options.cwd,
      );
      const pr = JSON.parse(output) as Record<string, unknown>;
      const fileSummaries = arrayFrom(pr.files).map(fileSummaryFromGitHub).filter((file) => file.path);
      const checkSummaries = arrayFrom(pr.statusCheckRollup).map(checkSummaryFromGh);
      return {
        changedFiles: fileSummaries.map((file) => file.path),
        checkSummaries,
        checksPassed: checksPassed(checkSummaries),
        diffLineCount: diffLineCount(fileSummaries),
        fileSummaries,
        headBranch: typeof pr.headRefName === "string" ? pr.headRefName : null,
        headSha: null,
      };
    }

    const pr = await this.appRequest<Record<string, unknown>>(`/repos/${this.repoPath()}/pulls/${number}`);
    const head = recordFrom(pr.head);
    const headSha = typeof head.sha === "string" ? head.sha : null;
    const headBranch = typeof head.ref === "string" ? head.ref : null;
    const fileSummaries = await this.listPullRequestFileSummaries(String(number));
    const checks = headSha ? await this.listPullRequestChecksForEvidence(headSha) : { summaries: [] };
    return {
      changedFiles: fileSummaries.map((file) => file.path),
      ...(checks.error ? { checkCollectionError: checks.error } : {}),
      checkSummaries: checks.summaries,
      checksPassed: checksPassed(checks.summaries),
      diffLineCount: diffLineCount(fileSummaries),
      fileSummaries,
      headBranch,
      headSha,
    };
  }

  async listInstallationRepositories(): Promise<GitHubInstallationRepositoryList> {
    if (this.mode() !== "app") {
      throw new Error("GitHub App repository listing requires GitHub App mode");
    }

    const repositories = [];
    let totalCount = 0;
    let page = 1;
    let truncated = false;

    while (page <= 10) {
      const response = await this.appRequest<{ repositories?: Array<Record<string, unknown>>; total_count?: number }>(
        `/installation/repositories?per_page=100&page=${page}`,
      );
      const pageRepositories = arrayFrom(response.repositories).map(repositoryFromGitHub).filter((repo) => repo.fullName);
      repositories.push(...pageRepositories);
      totalCount = numberFrom(response.total_count);

      if (pageRepositories.length === 0 || repositories.length >= totalCount) break;
      page += 1;
    }

    if (totalCount > repositories.length) {
      truncated = true;
    }

    return { repositories, totalCount, truncated };
  }

  async cleanupBranch(branchName: string): Promise<string> {
    if (this.mode() === "gh") {
      return runGit(this.options.cwd, ["push", "origin", "--delete", branchName]);
    }

    await this.appRequest(`/repos/${this.repoPath()}/git/refs/heads/${branchName}`, { method: "DELETE" });
    return `deleted ${branchName}`;
  }

  private mode(): GitHubClientMode {
    return this.options.mode ?? "gh";
  }

  private owner(): string {
    return required(this.options.owner, "GitHub owner is required for GitHub App mode");
  }

  private repo(): string {
    return required(this.options.repo, "GitHub repo is required for GitHub App mode");
  }

  private repoPath(): string {
    return `${this.owner()}/${this.repo()}`;
  }

  private async appRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
    const token = await this.getInstallationToken();
    const response = await (this.options.fetch ?? fetch)(`${this.apiBaseUrl()}${path}`, {
      ...init,
      headers: {
        accept: "application/vnd.github+json",
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        "x-github-api-version": "2022-11-28",
        ...headersObject(init.headers),
      },
    });

    if (!response.ok) {
      throw new GitHubAppRequestError(response.status, await response.text());
    }
    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  }

  private async jwtRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
    const jwt = await this.createJwt();
    const response = await (this.options.fetch ?? fetch)(`${this.apiBaseUrl()}${path}`, {
      ...init,
      headers: {
        accept: "application/vnd.github+json",
        authorization: `Bearer ${jwt}`,
        "content-type": "application/json",
        "x-github-api-version": "2022-11-28",
        ...headersObject(init.headers),
      },
    });

    if (!response.ok) {
      throw new Error(`GitHub App auth request failed ${response.status}: ${await response.text()}`);
    }
    return (await response.json()) as T;
  }

  private async getInstallationToken(): Promise<string> {
    const now = Date.now();
    if (this.installationToken && this.installationToken.expiresAt - 60_000 > now) {
      return this.installationToken.token;
    }

    const installationId = this.options.installationId || (await this.resolveInstallationId());
    const token = await this.jwtRequest<{ expires_at: string; token: string }>(
      `/app/installations/${installationId}/access_tokens`,
      { method: "POST" },
    );
    this.installationToken = {
      expiresAt: Date.parse(token.expires_at),
      token: token.token,
    };
    return token.token;
  }

  private async resolveInstallationId(): Promise<string> {
    const installation = await this.jwtRequest<{ id: number | string }>(`/repos/${this.repoPath()}/installation`);
    return String(installation.id);
  }

  private async createJwt(): Promise<string> {
    const privateKey = await this.privateKey();
    return createGitHubAppJwt({
      appId: required(this.options.appId, "GITHUB_APP_ID is required for GitHub App mode"),
      privateKey,
    });
  }

  private async privateKey(): Promise<string> {
    if (this.options.appPrivateKey) return normalizePrivateKey(this.options.appPrivateKey);
    if (this.options.appPrivateKeyPath) return normalizePrivateKey(await readFile(this.options.appPrivateKeyPath, "utf8"));
    throw new Error("GITHUB_APP_PRIVATE_KEY or GITHUB_APP_PRIVATE_KEY_PATH is required for GitHub App mode");
  }

  private apiBaseUrl(): string {
    return (this.options.apiBaseUrl ?? "https://api.github.com").replace(/\/$/, "");
  }

  private async listPullRequestChecksForEvidence(ref: string): Promise<{
    error?: string;
    summaries: GitHubCheckSummary[];
  }> {
    try {
      return { summaries: await this.listPullRequestChecks(ref) };
    } catch (error) {
      if (error instanceof GitHubAppRequestError && error.status === 403) {
        return { error: "GitHub checks unavailable: 403", summaries: [] };
      }
      throw error;
    }
  }
}

class GitHubAppRequestError extends Error {
  constructor(
    readonly status: number,
    readonly body: string,
  ) {
    super(`GitHub App request failed ${status}: ${body}`);
  }
}

export function createGitHubAppJwt(input: { appId: string; nowSeconds?: number; privateKey: string }): string {
  const now = input.nowSeconds ?? Math.floor(Date.now() / 1000);
  const header = base64UrlJson({ alg: "RS256", typ: "JWT" });
  const payload = base64UrlJson({
    exp: now + 9 * 60,
    iat: now - 60,
    iss: input.appId,
  });
  const unsigned = `${header}.${payload}`;
  const signature = createSign("RSA-SHA256").update(unsigned).sign(input.privateKey);
  return `${unsigned}.${base64Url(signature)}`;
}

export function normalizePrivateKey(value: string): string {
  return value.replace(/\\n/g, "\n").trim();
}

function checkSummaryFromGh(check: Record<string, unknown>): GitHubCheckSummary {
  return {
    conclusion: typeof check.conclusion === "string" ? check.conclusion : null,
    name: String(check.name ?? check.workflowName ?? "check"),
    status: String(check.status ?? "unknown"),
    url: typeof check.detailsUrl === "string" ? check.detailsUrl : null,
  };
}

function checksPassed(checks: GitHubCheckSummary[]): boolean {
  return (
    checks.length > 0 &&
    checks.every((check) => {
      const status = check.status.toLowerCase();
      const conclusion = (check.conclusion ?? "").toLowerCase();
      return status === "completed" && ["success", "neutral", "skipped"].includes(conclusion);
    })
  );
}

function diffLineCount(files: GitHubPullRequestFileSummary[]): number {
  return files.reduce((total, file) => total + file.changes, 0);
}

function fileSummaryFromGitHub(file: Record<string, unknown>): GitHubPullRequestFileSummary {
  const additions = numberFrom(file.additions);
  const deletions = numberFrom(file.deletions);
  const changes = numberFrom(file.changes) || additions + deletions;
  return {
    additions,
    changes,
    deletions,
    path: String(file.path ?? file.filename ?? ""),
  };
}

function repositoryFromGitHub(repository: Record<string, unknown>) {
  const owner = recordFrom(repository.owner);
  return {
    fullName: String(repository.full_name ?? ""),
    htmlUrl: typeof repository.html_url === "string" ? repository.html_url : null,
    name: String(repository.name ?? ""),
    owner: typeof owner.login === "string" ? owner.login : null,
    permissions: booleanRecordFrom(repository.permissions),
    private: repository.private === true,
  };
}

function arrayFrom(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object")) : [];
}

function recordFrom(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function numberFrom(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function booleanRecordFrom(value: unknown): Record<string, boolean> {
  const record = recordFrom(value);
  const output: Record<string, boolean> = {};
  for (const [key, entry] of Object.entries(record)) {
    if (typeof entry === "boolean") output[key] = entry;
  }
  return output;
}

function githubNumberFromReference(value: string): string {
  const candidate = value.split("/").filter(Boolean).at(-1) ?? value;
  if (!/^\d+$/.test(candidate)) {
    throw new Error(`Expected GitHub issue or pull request number, got ${value}`);
  }
  return candidate;
}

function required(value: string | undefined, message: string): string {
  if (!value) throw new Error(message);
  return value;
}

function stringFrom(value: unknown, message: string): string {
  if (typeof value !== "string" || !value) throw new Error(message);
  return value;
}

function base64UrlJson(value: Record<string, unknown>): string {
  return base64Url(Buffer.from(JSON.stringify(value)));
}

function base64Url(value: Buffer): string {
  return value.toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function headersObject(headers: HeadersInit | undefined): Record<string, string> {
  if (!headers) return {};
  if (headers instanceof Headers) {
    const output: Record<string, string> = {};
    headers.forEach((value, key) => {
      output[key] = value;
    });
    return output;
  }
  if (Array.isArray(headers)) return Object.fromEntries(headers);
  return headers;
}

async function runGitWithAppToken(
  cwd: string,
  owner: string,
  repo: string,
  branchName: string,
  token: string,
): Promise<string> {
  const tempDir = await mkdtemp(join(tmpdir(), "off-git-askpass-"));
  const askpassPath = join(tempDir, "askpass.sh");
  await writeFile(
    askpassPath,
    [
      "#!/bin/sh",
      "case \"$1\" in",
      "  *Username*) echo x-access-token ;;",
      "  *Password*) echo \"$GITHUB_APP_INSTALLATION_TOKEN\" ;;",
      "  *) echo ;;",
      "esac",
    ].join("\n"),
    { mode: 0o700 },
  );
  try {
    return await runGit(cwd, ["push", `https://github.com/${owner}/${repo}.git`, branchName], {
      GIT_ASKPASS: askpassPath,
      GIT_TERMINAL_PROMPT: "0",
      GITHUB_APP_INSTALLATION_TOKEN: token,
    });
  } finally {
    await rm(tempDir, { force: true, recursive: true });
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

function runGit(cwd: string, args: string[], env: NodeJS.ProcessEnv = {}): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn("git", args, {
      cwd,
      env: { ...process.env, ...env },
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
      reject(new Error(`git exited ${code}: ${stderr || stdout}`));
    });
  });
}
