import { GitHubClient } from "@open-feedback-factory/runner";
import type { ApiConfig } from "./config.js";

export function buildGithubClient(config: ApiConfig): GitHubClient {
  return new GitHubClient({
    appId: config.githubAppId,
    appPrivateKey: config.githubAppPrivateKey,
    appPrivateKeyPath: config.githubAppPrivateKeyPath,
    cwd: config.runnerWorkspace,
    installationId: config.githubAppInstallationId,
    mode: config.githubMode === "app" ? "app" : "gh",
    owner: config.githubOwner,
    repo: config.githubRepo,
  });
}
