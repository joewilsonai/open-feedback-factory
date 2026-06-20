import { GitHubClient } from "@open-feedback-factory/runner";
import type { ApiConfig } from "./config.js";

export function buildGithubClient(
  config: ApiConfig,
  repository?: { owner: string; repo: string },
): GitHubClient {
  return new GitHubClient({
    appId: config.githubAppId,
    appPrivateKey: config.githubAppPrivateKey,
    appPrivateKeyPath: config.githubAppPrivateKeyPath,
    cwd: config.runnerWorkspace,
    installationId: config.githubAppInstallationId,
    mode: config.githubMode === "app" ? "app" : "gh",
    owner: repository?.owner ?? config.githubOwner,
    repo: repository?.repo ?? config.githubRepo,
  });
}
