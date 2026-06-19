import { useEffect, useMemo, useState } from "react";
import "./styles.css";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4100";

interface Snapshot {
  counts: {
    agentRuns: number;
    feedbackSignals: number;
    featureUsageEvents: number;
    openWorkItems: number;
  };
  recentAgentRuns: Array<Record<string, unknown>>;
  recentFeedback: Array<Record<string, unknown>>;
  recentUsage: Array<Record<string, unknown>>;
  workItems: WorkItem[];
}

interface WorkItem {
  autoMergeEligible: boolean;
  category: string;
  costEstimate: {
    amountUsd: number;
    confidence: string;
    model: string;
  };
  githubIssueUrl: string | null;
  githubPrUrl: string | null;
  id: string;
  riskTier: string;
  status: string;
  summary: string;
  title: string;
  userStatus: string;
}

interface Doctor {
  api: string;
  autoMergeEnabled: boolean;
  codexRunnerMode: string;
  controlCenterUrl: string;
  databaseConfigured: boolean;
  githubAppConfigured: boolean;
  githubAppSetupUrl: string;
  githubMode: string;
  githubWebhookUrl: string;
  githubWebhooksEnabled: boolean;
  maxFeatureCostUsd: number;
  publicBaseUrl: string;
}

const emptySnapshot: Snapshot = {
  counts: {
    agentRuns: 0,
    feedbackSignals: 0,
    featureUsageEvents: 0,
    openWorkItems: 0,
  },
  recentAgentRuns: [],
  recentFeedback: [],
  recentUsage: [],
  workItems: [],
};

export function App() {
  const [doctor, setDoctor] = useState<Doctor | null>(null);
  const [snapshot, setSnapshot] = useState<Snapshot>(emptySnapshot);
  const [status, setStatus] = useState("Connecting");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = useMemo(
    () => snapshot.workItems.find((item) => item.id === selectedId) ?? snapshot.workItems[0] ?? null,
    [selectedId, snapshot.workItems],
  );

  async function refresh() {
    setStatus("Refreshing");
    const [snapshotResponse, doctorResponse] = await Promise.all([
      fetch(`${apiBaseUrl}/admin/control-room`),
      fetch(`${apiBaseUrl}/doctor`),
    ]);
    setSnapshot((await snapshotResponse.json()) as Snapshot);
    setDoctor((await doctorResponse.json()) as Doctor);
    setStatus("Live");
  }

  async function runWorkItem(id: string) {
    setStatus("Running agent lane");
    await fetch(`${apiBaseUrl}/admin/work-items/${id}/run`, { method: "POST" });
    await refresh();
  }

  async function releaseWorkItem(id: string) {
    setStatus("Marking shipped");
    await fetch(`${apiBaseUrl}/admin/work-items/${id}/release`, {
      body: JSON.stringify({ message: "Shipped in the Open Feedback Factory demo." }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    await refresh();
  }

  async function attemptAutoMerge(id: string) {
    setStatus("Checking safe auto-merge gates");
    const response = await fetch(`${apiBaseUrl}/admin/work-items/${id}/automerge`, {
      body: JSON.stringify({
        branchTrusted: true,
        changedFiles: ["apps/demo-app/src/styles.css"],
        checksPassed: true,
        costActualUsd: selected?.costEstimate.amountUsd ?? 0,
        diffLineCount: 40,
        redactionWarnings: 0,
        releaseHealthy: true,
        reviewerApproved: true,
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    const body = await response.json();
    setStatus(
      response.ok
        ? "Auto-merge queued"
        : `Auto-merge blocked: ${String(body.evaluation?.reasons?.join(", ") ?? "guardrail")}`,
    );
    await refresh();
  }

  useEffect(() => {
    refresh().catch((error) => setStatus(error instanceof Error ? error.message : "Offline"));
  }, []);

  return (
    <main className="console-shell">
      <header className="console-header">
        <div>
          <p className="eyebrow">Open Feedback Factory</p>
          <h1>Control Center</h1>
        </div>
        <button type="button" onClick={refresh}>
          Refresh
        </button>
      </header>

      <section className="status-strip" aria-label="System health">
        <Metric label="Status" value={status} />
        <Metric label="Feedback" value={snapshot.counts.feedbackSignals} />
        <Metric label="Open work" value={snapshot.counts.openWorkItems} />
        <Metric label="Agent runs" value={snapshot.counts.agentRuns} />
        <Metric label="Usage events" value={snapshot.counts.featureUsageEvents} />
      </section>

      <section className="console-grid">
        <div className="panel work-list">
          <div className="panel-heading">
            <p className="eyebrow">Queue</p>
            <h2>Work items</h2>
          </div>
          {snapshot.workItems.length ? (
            <div className="work-stack">
              {snapshot.workItems.map((item) => (
                <button
                  className={selected?.id === item.id ? "work-row active" : "work-row"}
                  key={item.id}
                  type="button"
                  onClick={() => setSelectedId(item.id)}
                >
                  <span>{item.title}</span>
                  <small>{item.status} / {item.riskTier}</small>
                </button>
              ))}
            </div>
          ) : (
            <p className="empty">No work items yet. Submit feedback from the demo app.</p>
          )}
        </div>

        <div className="panel detail-panel">
          <div className="panel-heading">
            <p className="eyebrow">Demo centerpiece</p>
            <h2>{selected ? selected.title : "No selected work item"}</h2>
          </div>
          {selected ? (
            <>
              <p className="summary">{selected.summary}</p>
              <dl className="detail-grid">
                <Detail label="State" value={selected.status} />
                <Detail label="User status" value={selected.userStatus} />
                <Detail label="Risk" value={selected.riskTier} />
                <Detail label="Auto-merge" value={selected.autoMergeEligible ? "Eligible" : "Guarded"} />
                <Detail label="Cost" value={`$${selected.costEstimate.amountUsd.toFixed(2)} est.`} />
                <Detail label="Model" value={selected.costEstimate.model} />
                <Detail label="Category" value={selected.category} />
              </dl>
              <div className="artifact-row">
                {selected.githubIssueUrl ? <a href={selected.githubIssueUrl}>GitHub issue</a> : <span>No issue yet</span>}
                {selected.githubPrUrl ? <a href={selected.githubPrUrl}>Pull request</a> : <span>No PR yet</span>}
              </div>
              <div className="action-row">
                <button type="button" onClick={() => runWorkItem(selected.id)}>
                  Run agent lane
                </button>
                <button type="button" onClick={() => attemptAutoMerge(selected.id)}>
                  Check auto-merge
                </button>
                <button type="button" onClick={() => releaseWorkItem(selected.id)}>
                  Mark shipped
                </button>
              </div>
            </>
          ) : (
            <p className="empty">The factory is waiting for its first signal.</p>
          )}
        </div>

        <SetupWizard doctor={doctor} />
        <ActivityPanel title="Recent feedback" rows={snapshot.recentFeedback} />
        <SetupPanel doctor={doctor} />
        <ActivityPanel title="Agent runs" rows={snapshot.recentAgentRuns} />
        <ActivityPanel title="Feature usage" rows={snapshot.recentUsage} />
      </section>
    </main>
  );
}

function SetupWizard(props: { doctor: Doctor | null }) {
  const doctor = props.doctor;
  const appReady = Boolean(doctor?.githubAppConfigured && doctor.githubMode === "app");
  const setupUrl = doctor?.githubAppSetupUrl ?? `${apiBaseUrl}/github/app/setup`;

  return (
    <div className="panel setup-wizard">
      <div className="panel-heading">
        <p className="eyebrow">Install wizard</p>
        <h2>GitHub App</h2>
      </div>
      <div className="wizard-rail">
        <WizardStep
          detail={doctor?.api === "ok" ? "API reachable" : "Waiting for API"}
          label="Local stack"
          state={doctor?.api === "ok" ? "Ready" : "Waiting"}
        />
        <WizardStep
          detail={doctor?.githubAppConfigured ? "Credentials present" : "Create app, then add generated env values"}
          label="GitHub App"
          state={doctor?.githubAppConfigured ? "Configured" : "Needed"}
        />
        <WizardStep
          detail={doctor?.githubMode === "app" ? "App mode enabled" : "Set GITHUB_MODE=app after credentials are saved"}
          label="Mutation mode"
          state={doctor?.githubMode === "app" ? "Enabled" : "Disabled"}
        />
        <WizardStep
          detail={
            doctor?.githubWebhooksEnabled
              ? "GitHub can call the configured webhook URL"
              : "Local install; use an HTTPS tunnel or deploy URL for webhook events"
          }
          label="Webhooks"
          state={doctor?.githubWebhooksEnabled ? "Enabled" : "Local off"}
        />
      </div>
      <div className="wizard-actions">
        <a className="button-link primary" href={setupUrl}>
          Create GitHub App
        </a>
        <a className="button-link" href={`${apiBaseUrl}/github/app/manifest`}>
          View manifest
        </a>
      </div>
      <div className={appReady ? "wizard-note ready" : "wizard-note"}>
        {appReady
          ? "GitHub App mode is ready for sanitized issue and PR work."
          : "After GitHub returns, convert the temporary code, add the generated values to .env, and restart Docker."}
      </div>
    </div>
  );
}

function WizardStep(props: { detail: string; label: string; state: string }) {
  return (
    <div className="wizard-step">
      <strong>{props.state}</strong>
      <span>{props.label}</span>
      <small>{props.detail}</small>
    </div>
  );
}

function SetupPanel(props: { doctor: Doctor | null }) {
  const doctor = props.doctor;
  return (
    <div className="panel setup-panel">
      <div className="panel-heading">
        <p className="eyebrow">Setup</p>
        <h2>Health</h2>
      </div>
      {doctor ? (
        <dl className="setup-grid">
          <Detail label="API" value={doctor.api} />
          <Detail label="Database" value={doctor.databaseConfigured ? "Configured" : "Missing"} />
          <Detail label="Runner" value={doctor.codexRunnerMode} />
          <Detail label="GitHub" value={doctor.githubMode} />
          <Detail label="GitHub App" value={doctor.githubAppConfigured ? "Configured" : "Not configured"} />
          <Detail label="Webhooks" value={doctor.githubWebhooksEnabled ? "Enabled" : "Local off"} />
          <Detail label="Auto-merge" value={doctor.autoMergeEnabled ? "Enabled" : "Disabled"} />
          <Detail label="Cost cap" value={`$${doctor.maxFeatureCostUsd.toFixed(2)}`} />
          <Detail label="Public URL" value={doctor.publicBaseUrl} />
          <Detail label="Webhook URL" value={doctor.githubWebhookUrl} />
        </dl>
      ) : (
        <p className="empty">Waiting for setup health.</p>
      )}
    </div>
  );
}

function Metric(props: { label: string; value: number | string }) {
  return (
    <article className="metric">
      <span>{props.label}</span>
      <strong>{props.value}</strong>
    </article>
  );
}

function Detail(props: { label: string; value: string }) {
  return (
    <div>
      <dt>{props.label}</dt>
      <dd>{props.value}</dd>
    </div>
  );
}

function ActivityPanel(props: { rows: Array<Record<string, unknown>>; title: string }) {
  return (
    <div className="panel activity">
      <div className="panel-heading">
        <p className="eyebrow">Audit</p>
        <h2>{props.title}</h2>
      </div>
      {props.rows.length ? (
        <ul>
          {props.rows.slice(0, 5).map((row, index) => (
            <li key={String(row.id ?? index)}>
              <code>{String(row.id ?? index)}</code>
              <span>{String(row.summary ?? row.sanitized_summary ?? row.action ?? row.status ?? "recorded")}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="empty">No records yet.</p>
      )}
    </div>
  );
}
