import type { FastifyInstance } from "fastify";
import type { AppDeps } from "../app.js";

export async function registerGithubRoutes(app: FastifyInstance, deps: AppDeps): Promise<void> {
  app.get("/github/app/manifest", async () => ({
    default_events: ["check_suite", "issues", "pull_request", "push"],
    default_permissions: {
      checks: "read",
      contents: "write",
      issues: "write",
      metadata: "read",
      pull_requests: "write",
    },
    description:
      "Open Feedback Factory turns sanitized user feedback into guarded GitHub issues and PRs.",
    hook_attributes: {
      active: true,
      url: `http://localhost:${deps.config.apiPort}/github/webhook`,
    },
    name: "Open Feedback Factory Local",
    public: false,
    url: "https://github.com/joewilsonai/open-feedback-factory",
  }));

  app.post("/github/webhook", async (request) => ({
    mode: deps.config.githubMode,
    ok: true,
    received: typeof request.body === "object",
  }));
}
