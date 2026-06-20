import "./health.css";

// Codebase health / readiness view (PRD §8.3). Tells the operator whether the
// connected repo + runtime integrations are ready for autonomous work, and what
// to fix before allowing more automation. Honest: every signal is derived from
// the live /doctor payload — no fabricated scores. Deep repo-risk scanning
// (missing tests, fragile migrations, hotspots) is called out as roadmap, not faked.

type ReadyState = "ready" | "attention" | "off";

interface HealthDoctor {
  githubMode: string;
  githubAppConfigured: boolean;
  githubWebhooksEnabled: boolean;
  codexRunnerMode: string;
  codexApiKeyConfigured: boolean;
  databaseConfigured: boolean;
  approvalMode: string;
  autoMergeEnabled: boolean;
  maxFeatureCostUsd: number;
  workerConnection?: { status?: string } | null;
  codexConnection?: {
    subscription?: { supported?: boolean } | null;
    apiKey?: { configured?: boolean } | null;
  } | null;
}

interface Finding {
  key: string;
  label: string;
  state: ReadyState;
  detail: string;
  recommendation?: string;
}

function assess(doctor: HealthDoctor): Finding[] {
  const workerStatus = doctor.workerConnection?.status ?? "offline";
  const runnerOn = Boolean(doctor.codexRunnerMode) && doctor.codexRunnerMode !== "disabled";
  const subSupported = Boolean(doctor.codexConnection?.subscription?.supported);
  const keyConfigured = Boolean(doctor.codexConnection?.apiKey?.configured) || doctor.codexApiKeyConfigured;
  const appActive = doctor.githubMode === "app" && doctor.githubAppConfigured;
  const capSet = doctor.maxFeatureCostUsd > 0;

  return [
    {
      key: "repo",
      label: "Repo & GitHub App",
      state: appActive ? "ready" : doctor.githubAppConfigured ? "attention" : "off",
      detail: appActive
        ? "GitHub App configured and active"
        : doctor.githubAppConfigured
          ? `App configured, but GitHub mode is "${doctor.githubMode}"`
          : "GitHub App not configured",
      recommendation: appActive ? undefined : "Configure + install the OFF GitHub App and set GITHUB_MODE=app",
    },
    {
      key: "webhook",
      label: "Webhook delivery",
      state: doctor.githubWebhooksEnabled ? "ready" : "attention",
      detail: doctor.githubWebhooksEnabled
        ? "Webhooks enabled on a public URL"
        : "Webhooks not reachable (localhost can't receive deliveries)",
      recommendation: doctor.githubWebhooksEnabled
        ? undefined
        : "Expose a public webhook URL (deploy or tunnel) so GitHub can deliver events",
    },
    {
      key: "worker",
      label: "Worker / runner",
      state: workerStatus === "online" && runnerOn ? "ready" : workerStatus === "stale" ? "attention" : "off",
      detail:
        workerStatus === "online"
          ? runnerOn
            ? "Live worker attached and claiming work"
            : "Worker online, but runner mode is disabled"
          : workerStatus === "stale"
            ? "Worker heartbeat is stale"
            : "No live worker attached",
      recommendation:
        workerStatus === "online" && runnerOn
          ? undefined
          : "Install + start the host CLI worker and set CODEX_RUNNER_MODE=codex",
    },
    {
      key: "provider",
      label: "Provider auth (Codex)",
      state: subSupported || keyConfigured ? "ready" : "attention",
      detail: keyConfigured
        ? "BYO OpenAI API key configured"
        : subSupported
          ? "Codex subscription via trusted host worker"
          : "No usable Codex auth path",
      recommendation:
        subSupported || keyConfigured
          ? undefined
          : "Sign the Codex CLI in on the worker, or save a BYO OpenAI API key",
    },
    {
      key: "db",
      label: "Database",
      state: doctor.databaseConfigured ? "ready" : "off",
      detail: doctor.databaseConfigured ? "Postgres configured" : "No database configured",
      recommendation: doctor.databaseConfigured ? undefined : "Set DATABASE_URL to a Postgres instance",
    },
    {
      key: "safety",
      label: "Guardrails & safety",
      state: capSet ? "ready" : "attention",
      detail: `${doctor.approvalMode} approval · auto-merge ${doctor.autoMergeEnabled ? "on" : "off"} · cost cap ${
        capSet ? `$${doctor.maxFeatureCostUsd}/item` : "unset"
      }`,
      recommendation: capSet ? undefined : "Set a per-work-item cost cap before enabling more automation",
    },
  ];
}

const stateLabel: Record<ReadyState, string> = {
  ready: "Ready",
  attention: "Needs attention",
  off: "Not configured",
};

export function CodebaseHealth({ doctor }: { doctor: HealthDoctor | null }) {
  const findings = doctor ? assess(doctor) : [];
  const readyCount = findings.filter((f) => f.state === "ready").length;
  const blockers = findings.filter((f) => f.state !== "ready");
  const allReady = findings.length > 0 && blockers.length === 0;

  return (
    <section className="panel health-panel" aria-label="Codebase health and readiness">
      <div className="panel-heading">
        <p className="eyebrow">Readiness</p>
        <h2>Codebase health</h2>
      </div>

      {doctor ? (
        <>
          <div className="health-summary" data-ready={allReady}>
            <div className="health-score">
              <strong>{readyCount}</strong>
              <span>/ {findings.length} ready</span>
            </div>
            <p>
              {allReady
                ? "All integrations are ready for autonomous work."
                : `${blockers.length} item${blockers.length === 1 ? "" : "s"} to fix before allowing more automation — ${blockers
                    .map((b) => b.label)
                    .join(", ")}.`}
            </p>
          </div>

          <ul className="health-list">
            {findings.map((f) => (
              <li key={f.key} className="health-item" data-state={f.state}>
                <span className="health-dot" aria-hidden="true" />
                <div className="health-body">
                  <div className="health-row">
                    <strong>{f.label}</strong>
                    <span className="health-state">{stateLabel[f.state]}</span>
                  </div>
                  <span className="health-detail">{f.detail}</span>
                  {f.recommendation && <span className="health-rec">→ {f.recommendation}</span>}
                </div>
              </li>
            ))}
          </ul>

          <p className="health-note">
            This view reports integration + runtime readiness from <code>/doctor</code>. Deep repo-risk analysis
            (missing tests, fragile migrations, flaky checks, legacy hotspots) is on the roadmap and is not reported
            here yet.
          </p>
        </>
      ) : (
        <p className="health-empty">Connect to the API to load readiness findings.</p>
      )}
    </section>
  );
}
