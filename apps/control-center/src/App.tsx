import { type ReactNode, useEffect, useMemo, useState } from "react";
import "./styles.css";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "";
const adminTokenStorageKey = "open-feedback-factory.admin-token";
const launchBriefAppUrl = "https://launchbrief-demo.vercel.app";
const launchBriefRepoUrl = "https://github.com/joewilsonai/launchbrief-demo";
const liveSyncIntervalMs = 4_000;

interface Snapshot {
  counts: {
    agentRuns: number;
    feedbackSignals: number;
    featureUsageEvents: number;
    openWorkItems: number;
  };
  feedbackClusters: FeedbackCluster[];
  recentAgentRuns: Array<Record<string, unknown>>;
  recentAssumptions: Array<Record<string, unknown>>;
  recentFeedback: Array<Record<string, unknown>>;
  recentUsage: Array<Record<string, unknown>>;
  workItems: WorkItem[];
}

interface FeedbackCluster {
  activeWorkItemId: string | null;
  activeWorkItemStatus: string | null;
  category: string;
  clusterKey: string;
  latestSignalAt: string;
  latestStatus: string | null;
  latestUserMessage: string | null;
  signalCount: number;
  title: string;
  updatedAt: string;
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
  latestActualCost: {
    amountUsd?: number;
    confidence?: string;
    model?: string;
    tokens?: number;
  } | null;
  reviewDecision?: WorkItemReviewDecision | null;
  riskTier: string;
  signalSources: string[];
  status: string;
  summary: string;
  title: string;
  unresolvedAssumptions: AgentAssumption[];
  userStatus: string;
}

interface WorkItemReviewDecision {
  actor: string;
  approved: boolean;
  createdAt: string;
  id: string;
  reviewType: "agent" | "human";
  summary: string;
}

interface AgentAssumption {
  assumptions: string[];
  checksRun: string[];
  checksSkipped: string[];
  impactAreas: string[];
  notes: string;
  unresolved: boolean;
}

interface WorkItemEvidence {
  agentRuns: Array<{
    agentName: string;
    completedAt: string | null;
    costActual: WorkItem["latestActualCost"];
    createdAt: string;
    id: string;
    metadata: Record<string, unknown>;
    runType: string;
    status: string;
    summary: string;
  }>;
  assumptions: Array<
    AgentAssumption & {
      agentRunId: string | null;
      createdAt: string;
      id: string;
    }
  >;
  auditEvents: Array<{
    actor: string;
    createdAt: string;
    event: string;
    id: string;
    metadata: Record<string, unknown>;
    targetId: string;
    targetType: string;
  }>;
  costRecords: Array<{
    amountUsd: number;
    confidence: string;
    createdAt: string;
    id: string;
    metadata: Record<string, unknown>;
    model: string;
    phase: string;
  }>;
  githubArtifacts: Array<{
    artifactNumber: number | null;
    artifactType: string;
    createdAt: string;
    id: string;
    metadata: Record<string, unknown>;
    url: string;
  }>;
  releaseEvents: Array<{
    createdAt: string;
    id: string;
    metadata: Record<string, unknown>;
    status: string;
  }>;
  usageAttribution: Array<{
    eventCount: number;
    featureId: string;
    latestUsageAt: string;
    requesterCount: number;
    uniqueUsers: number;
    workItemId: string;
  }>;
  userNotifications: Array<{
    createdAt: string;
    feedbackId: string | null;
    id: string;
    message: string;
    status: string;
  }>;
  workItem: WorkItem;
}

interface Doctor {
  adminAuthRequired: boolean;
  api: string;
  approvalMode: string;
  autoMergeEnabled: boolean;
  autoMergePolicyEnabled: boolean;
  codexApiKeyConfigured: boolean;
  codexApiKeyFingerprint: string | null;
  codexApiKeySource: string;
  codexAuthMode: string;
  codexRunnerMode: string;
  codexSecretStorageWritable: boolean;
  codexSecretsPath: string;
  controlCenterUrl: string;
  databaseConfigured: boolean;
  githubAppConfigured: boolean;
  githubAppSetupUrl: string;
  githubMode: string;
  githubWebhookUrl: string;
  githubWebhooksEnabled: boolean;
  maxFeatureCostUsd: number;
  maxSafeDiffLines: number;
  protectedPathFragments: string[];
  publicBaseUrl: string;
  runnerInstall: RunnerInstallPlan;
  runnerAuthRequired: boolean;
}

interface RunnerInstallPlan {
  dockerApiKey: {
    env: string[];
    requirement: string;
    startCommand: string;
    title: string;
  };
  hostCli: {
    installCommand: string;
    logPath: string;
    printCommand: string;
    service: string;
    statusCommand: string;
    title: string;
    uninstallCommand: string;
  };
  recommendedMode: "docker_api_key" | "host_cli";
}

const emptySnapshot: Snapshot = {
  counts: {
    agentRuns: 0,
    feedbackSignals: 0,
    featureUsageEvents: 0,
    openWorkItems: 0,
  },
  feedbackClusters: [],
  recentAgentRuns: [],
  recentAssumptions: [],
  recentFeedback: [],
  recentUsage: [],
  workItems: [],
};

const defaultRunnerInstallPlan: RunnerInstallPlan = {
  dockerApiKey: {
    env: ["CODEX_RUNNER_MODE=codex", "CODEX_AUTH_MODE=api_key"],
    requirement: "Save an OpenAI API key in the control center before starting the Docker worker.",
    startCommand: "docker compose up -d --build worker",
    title: "Docker API-key worker",
  },
  hostCli: {
    installCommand: "pnpm worker:install:host",
    logPath: ".off/logs/host-worker.log",
    printCommand: "pnpm worker:print:host",
    service: "macOS LaunchAgent or Linux user systemd",
    statusCommand: "pnpm worker:status:host",
    title: "Host Codex CLI worker",
    uninstallCommand: "pnpm worker:uninstall:host",
  },
  recommendedMode: "host_cli",
};

export function App() {
  const [adminToken, setAdminToken] = useState(() =>
    typeof window === "undefined" ? "" : window.localStorage.getItem(adminTokenStorageKey) ?? "",
  );
  const [adminTokenInput, setAdminTokenInput] = useState(adminToken);
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [adminAuthBlocked, setAdminAuthBlocked] = useState(false);
  const [autoMergePolicyEnabledInput, setAutoMergePolicyEnabledInput] = useState(true);
  const [costCapInput, setCostCapInput] = useState("");
  const [credentialUpdating, setCredentialUpdating] = useState(false);
  const [doctor, setDoctor] = useState<Doctor | null>(null);
  const [evidence, setEvidence] = useState<WorkItemEvidence | null>(null);
  const [evidenceLoading, setEvidenceLoading] = useState(false);
  const [modeUpdating, setModeUpdating] = useState(false);
  const [maxSafeDiffLinesInput, setMaxSafeDiffLinesInput] = useState("");
  const [protectedPathFragmentsInput, setProtectedPathFragmentsInput] = useState("");
  const [releaseFeatureIdInput, setReleaseFeatureIdInput] = useState("");
  const [snapshot, setSnapshot] = useState<Snapshot>(emptySnapshot);
  const [status, setStatus] = useState("Connecting");
  const [lastSyncedAt, setLastSyncedAt] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = useMemo(
    () => snapshot.workItems.find((item) => item.id === selectedId) ?? snapshot.workItems[0] ?? null,
    [selectedId, snapshot.workItems],
  );
  const executionLabel = doctor ? approvalModeLabel(doctor.approvalMode) : "Checking";
  const runnerLabel = doctor ? runnerModeLabel(doctor) : "Checking";
  const credentialLabel = doctor ? credentialModeLabel(doctor) : "Checking";

  function adminFetch(path: string, init?: RequestInit) {
    const headers = new Headers(init?.headers);
    if (adminToken) headers.set("authorization", `Bearer ${adminToken}`);
    return fetch(`${apiBaseUrl}${path}`, { ...init, headers });
  }

  async function loadWorkItemEvidence(id: string) {
    setEvidenceLoading(true);
    try {
      const response = await adminFetch(`/admin/work-items/${id}/evidence`);
      if (!response.ok) {
        setEvidence(null);
        return;
      }
      setEvidence((await response.json()) as WorkItemEvidence);
    } finally {
      setEvidenceLoading(false);
    }
  }

  async function refresh(options: { silent?: boolean } = {}) {
    if (!options.silent) setStatus("Refreshing");
    const doctorResponse = await fetch(`${apiBaseUrl}/doctor`);
    const nextDoctor = (await doctorResponse.json()) as Doctor;
    setDoctor(nextDoctor);
    setAutoMergePolicyEnabledInput(nextDoctor.autoMergePolicyEnabled);
    setCostCapInput(String(nextDoctor.maxFeatureCostUsd));
    setMaxSafeDiffLinesInput(String(nextDoctor.maxSafeDiffLines));
    setProtectedPathFragmentsInput(nextDoctor.protectedPathFragments.join(", "));
    const snapshotResponse = await adminFetch("/admin/control-room");
    if (snapshotResponse.status === 401) {
      setAdminAuthBlocked(true);
      setSnapshot(emptySnapshot);
      setStatus(nextDoctor.adminAuthRequired ? "Admin token required" : "Admin access blocked");
      setLastSyncedAt(timeLabel(new Date()));
      return;
    }
    setAdminAuthBlocked(false);
    const nextSnapshot = (await snapshotResponse.json()) as Snapshot;
    setSnapshot(nextSnapshot);
    const evidenceId = selectedId ?? nextSnapshot.workItems[0]?.id ?? null;
    if (evidenceId) await loadWorkItemEvidence(evidenceId);
    else setEvidence(null);
    setStatus("Live");
    setLastSyncedAt(timeLabel(new Date()));
  }

  async function runWorkItem(id: string) {
    setStatus("Running agent lane");
    const response = await adminFetch(`/admin/work-items/${id}/run`, { method: "POST" });
    const body = await response.json().catch(() => ({}));
    await refresh();
    setStatus(response.ok ? "Agent lane accepted" : `Runner blocked: ${String(body.error ?? "not configured")}`);
  }

  async function setApprovalMode(approvalMode: "auto" | "manual") {
    setModeUpdating(true);
    setStatus(`Switching to ${approvalModeLabel(approvalMode)}`);
    try {
      const response = await adminFetch("/admin/settings/approval-mode", {
        body: JSON.stringify({ approvalMode }),
        headers: { "content-type": "application/json" },
        method: "PATCH",
      });
      const body = await response.json().catch(() => ({}));
      await refresh();
      setStatus(
        response.ok
          ? `Approval mode set to ${approvalModeLabel(approvalMode)}`
          : `Mode change blocked: ${String(body.error ?? "not saved")}`,
      );
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Mode change failed");
    } finally {
      setModeUpdating(false);
    }
  }

  async function setCodexAuthMode(codexAuthMode: "api_key" | "cli") {
    setCredentialUpdating(true);
    setStatus(`Switching to ${codexAuthModeLabel(codexAuthMode)}`);
    try {
      const response = await adminFetch("/admin/settings/codex-auth-mode", {
        body: JSON.stringify({ codexAuthMode }),
        headers: { "content-type": "application/json" },
        method: "PATCH",
      });
      const body = await response.json().catch(() => ({}));
      await refresh();
      setStatus(
        response.ok
          ? `Credentials set to ${codexAuthModeLabel(codexAuthMode)}`
          : `Credential mode blocked: ${String(body.error ?? "not saved")}`,
      );
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Credential mode failed");
    } finally {
      setCredentialUpdating(false);
    }
  }

  async function saveCostCap() {
    const amount = Number(costCapInput);
    setModeUpdating(true);
    setStatus("Saving cost cap");
    try {
      const response = await adminFetch("/admin/settings/cost-cap", {
        body: JSON.stringify({ maxFeatureCostUsd: amount }),
        headers: { "content-type": "application/json" },
        method: "PATCH",
      });
      const body = await response.json().catch(() => ({}));
      await refresh();
      setStatus(response.ok ? "Cost cap saved" : `Cost cap blocked: ${String(body.error ?? "not saved")}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Cost cap save failed");
    } finally {
      setModeUpdating(false);
    }
  }

  async function saveMergeGuardrails() {
    const maxSafeDiffLines = Number(maxSafeDiffLinesInput);
    const protectedPathFragments = protectedPathFragmentsInput
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
    setModeUpdating(true);
    setStatus("Saving merge guardrails");
    try {
      const response = await adminFetch("/admin/settings/merge-guardrails", {
        body: JSON.stringify({
          autoMergePolicyEnabled: autoMergePolicyEnabledInput,
          maxSafeDiffLines,
          protectedPathFragments,
        }),
        headers: { "content-type": "application/json" },
        method: "PATCH",
      });
      const body = await response.json().catch(() => ({}));
      await refresh();
      setStatus(response.ok ? "Merge guardrails saved" : `Guardrail update blocked: ${String(body.error ?? "not saved")}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Guardrail save failed");
    } finally {
      setModeUpdating(false);
    }
  }

  async function saveCodexApiKey() {
    setCredentialUpdating(true);
    setStatus("Saving API key");
    try {
      const response = await adminFetch("/admin/settings/codex-api-key", {
        body: JSON.stringify({ apiKey: apiKeyInput }),
        headers: { "content-type": "application/json" },
        method: "PUT",
      });
      const body = await response.json().catch(() => ({}));
      if (response.ok) setApiKeyInput("");
      await refresh();
      setStatus(response.ok ? "API key saved" : `API key blocked: ${String(body.error ?? "not saved")}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "API key save failed");
    } finally {
      setCredentialUpdating(false);
    }
  }

  async function removeCodexApiKey() {
    setCredentialUpdating(true);
    setStatus("Removing saved API key");
    try {
      const response = await adminFetch("/admin/settings/codex-api-key", { method: "DELETE" });
      const body = await response.json().catch(() => ({}));
      await refresh();
      setStatus(response.ok ? "Saved API key removed" : `Remove blocked: ${String(body.error ?? "not removed")}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "API key remove failed");
    } finally {
      setCredentialUpdating(false);
    }
  }

  async function releaseWorkItem(id: string) {
    setStatus("Marking shipped");
    const response = await adminFetch(`/admin/work-items/${id}/release`, {
      body: JSON.stringify({
        featureId: releaseFeatureIdInput.trim() || (selected ? featureIdSuggestion(selected) : id),
        message: "This request has shipped.",
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    const body = await response.json().catch(() => ({}));
    await refresh();
    setStatus(response.ok ? "Marked shipped" : `Release blocked: ${String(body.error ?? "not ready")}`);
  }

  async function decideWorkItem(id: string, decisionStatus: "blocked" | "not_planned") {
    const notPlanned = decisionStatus === "not_planned";
    setStatus(notPlanned ? "Recording not planned" : "Recording blocked decision");
    const response = await adminFetch(`/admin/work-items/${id}/decision`, {
      body: JSON.stringify({
        decisionCategory: notPlanned ? "not_planned_for_beta" : "blocked_by_operator",
        message: notPlanned
          ? "We reviewed this request and do not plan to build it during the current beta."
          : "We reviewed this request and it is blocked from shipping without human intervention.",
        status: decisionStatus,
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    const body = await response.json().catch(() => ({}));
    await refresh();
    setStatus(response.ok ? "Decision recorded" : `Decision blocked: ${String(body.error ?? "not recorded")}`);
  }

  async function reviewWorkItem(id: string, approved: boolean) {
    setStatus(approved ? "Recording review approval" : "Recording review rejection");
    const response = await adminFetch(`/admin/work-items/${id}/review`, {
      body: JSON.stringify({
        approved,
        reviewer: "control-center",
        reviewType: "human",
        summary: approved
          ? "Human reviewer approved this work for merge consideration."
          : "Human reviewer rejected this work; it cannot auto-merge until another approval is recorded.",
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    const body = await response.json().catch(() => ({}));
    await refresh();
    setStatus(response.ok ? "Review decision recorded" : `Review blocked: ${String(body.error ?? "not recorded")}`);
  }

  async function runReconciliation() {
    setStatus("Running reconciliation");
    const response = await adminFetch("/admin/reconciliation/run", {
      body: JSON.stringify({ staleAfterMinutes: 60 }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    const body = await response.json().catch(() => ({}));
    await refresh();
    const result = body.result as
      | {
          implementedAwaitingReleaseIds?: string[];
          staleInProgressRequeuedIds?: string[];
        }
      | undefined;
    setStatus(
      response.ok
        ? `Reconciled: ${result?.staleInProgressRequeuedIds?.length ?? 0} requeued, ${
            result?.implementedAwaitingReleaseIds?.length ?? 0
          } waiting release`
        : `Reconciliation blocked: ${String(body.error ?? "not run")}`,
    );
  }

  async function attemptAutoMerge(id: string) {
    setStatus("Checking safe auto-merge gates");
    const response = await adminFetch(`/admin/work-items/${id}/automerge`, {
      body: JSON.stringify({
        branchTrusted: true,
        changedFiles: ["apps/demo-app/src/styles.css"],
        checksPassed: true,
        costActualUsd: selected?.latestActualCost?.amountUsd ?? selected?.costEstimate.amountUsd ?? 0,
        diffLineCount: 40,
        redactionWarnings: 0,
        releaseHealthy: true,
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
    let stopped = false;
    const sync = (silent: boolean) => {
      refresh({ silent }).catch((error) => {
        if (!stopped) setStatus(error instanceof Error ? error.message : "Offline");
      });
    };

    sync(false);
    const interval = window.setInterval(() => sync(true), liveSyncIntervalMs);

    return () => {
      stopped = true;
      window.clearInterval(interval);
    };
  }, [adminToken, selectedId]);

  useEffect(() => {
    if (selected) setReleaseFeatureIdInput(featureIdSuggestion(selected));
  }, [selected?.id]);

  function saveAdminToken() {
    const value = adminTokenInput.trim();
    setAdminToken(value);
    if (typeof window !== "undefined") {
      if (value) window.localStorage.setItem(adminTokenStorageKey, value);
      else window.localStorage.removeItem(adminTokenStorageKey);
    }
    setStatus(value ? "Admin token saved" : "Admin token removed");
  }

  function clearAdminToken() {
    setAdminToken("");
    setAdminTokenInput("");
    if (typeof window !== "undefined") window.localStorage.removeItem(adminTokenStorageKey);
    setStatus("Admin token cleared");
  }

  return (
    <main className="console-shell">
      <header className="console-header">
        <div>
          <p className="eyebrow">Open Feedback Factory</p>
          <h1>Control Center</h1>
        </div>
        <div className="live-sync-pill" aria-live="polite">
          <span />
          <strong>{status}</strong>
          <small>{lastSyncedAt ? `Synced ${lastSyncedAt}` : "Syncing"}</small>
        </div>
      </header>

      <section className="status-strip" aria-label="System health">
        <Metric label="Status" value={status} />
        <Metric label="Feedback" value={snapshot.counts.feedbackSignals} />
        <Metric label="Open work" value={snapshot.counts.openWorkItems} />
        <Metric label="Agent runs" value={snapshot.counts.agentRuns} />
        <Metric label="Usage events" value={snapshot.counts.featureUsageEvents} />
        <Metric label="Mode" value={executionLabel} />
        <Metric label="Runner" value={runnerLabel} />
        <Metric label="Credentials" value={credentialLabel} />
        <Metric label="Admin access" value={doctor?.adminAuthRequired ? (adminAuthBlocked ? "Locked" : "Token") : "Local"} />
      </section>

      <section className="console-grid">
        <HostedDemoAlphaPanel doctor={doctor} feedbackCount={snapshot.counts.feedbackSignals} openWorkCount={snapshot.counts.openWorkItems} />
        <AdminAccessPanel
          adminAuthBlocked={adminAuthBlocked}
          adminTokenInput={adminTokenInput}
          doctor={doctor}
          onAdminTokenInput={setAdminTokenInput}
          onClearAdminToken={clearAdminToken}
          onRefresh={refresh}
          onSaveAdminToken={saveAdminToken}
        />
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
                  onClick={() => {
                    setSelectedId(item.id);
                    void loadWorkItemEvidence(item.id);
                  }}
                >
                  <span>{item.title}</span>
                  <small>{workStatusLabel(item.status)} / {riskTierLabel(item.riskTier)}</small>
                  <em>{sourceLabel(item.signalSources)}</em>
                </button>
              ))}
            </div>
          ) : (
            <p className="empty">No work items yet. Submit feedback from a connected app.</p>
          )}
        </div>

        <DemandMemoryPanel clusters={snapshot.feedbackClusters} />

        <div className="panel detail-panel">
          <div className="panel-heading">
            <p className="eyebrow">Work item</p>
            <h2>{selected ? selected.title : "No selected work item"}</h2>
          </div>
          {selected ? (
            <>
              <p className="summary">{selected.summary}</p>
              <dl className="detail-grid">
                <Detail label="State" value={workStatusLabel(selected.status)} />
                <Detail label="User status" value={userStatusLabel(selected.userStatus)} />
                <Detail label="Risk" value={riskTierLabel(selected.riskTier)} />
                <Detail label="Auto-merge" value={selected.autoMergeEligible ? "Eligible" : "Guarded"} />
                <Detail label="Review" value={reviewDecisionLabel(selected.reviewDecision)} />
                <Detail label="Cost estimate" value={`$${selected.costEstimate.amountUsd.toFixed(2)}`} />
                <Detail label="Actual cost" value={actualCostLabel(selected)} />
                <Detail label="Model" value={selected.costEstimate.model} />
                <Detail label="Category" value={selected.category} />
                <Detail label="Signals" value={sourceLabel(selected.signalSources)} />
              </dl>
              <div className="artifact-row">
                {selected.githubIssueUrl ? <a href={selected.githubIssueUrl}>GitHub issue</a> : <span>No issue yet</span>}
                {selected.githubPrUrl ? <a href={selected.githubPrUrl}>Pull request</a> : <span>No PR yet</span>}
              </div>
              <FeatureLifecycleView evidence={evidence} item={selected} />
              <AssumptionList assumptions={selected.unresolvedAssumptions ?? []} />
              <label className="feature-id-field" htmlFor="release-feature-id">
                Feature usage id
                <input
                  id="release-feature-id"
                  placeholder={featureIdSuggestion(selected)}
                  value={releaseFeatureIdInput}
                  onChange={(event) => setReleaseFeatureIdInput(event.target.value)}
                />
              </label>
              <div className="action-row">
                <button
                  type="button"
                  disabled={!canRunSelectedItem(doctor)}
                  onClick={() => runWorkItem(selected.id)}
                >
                  {runButtonLabel(doctor)}
                </button>
                <button type="button" onClick={() => attemptAutoMerge(selected.id)}>
                  Check auto-merge
                </button>
                <button type="button" onClick={() => reviewWorkItem(selected.id, true)}>
                  Approve review
                </button>
                <button type="button" onClick={() => reviewWorkItem(selected.id, false)}>
                  Reject review
                </button>
                <button type="button" onClick={() => releaseWorkItem(selected.id)}>
                  Mark shipped
                </button>
                <button type="button" onClick={() => decideWorkItem(selected.id, "not_planned")}>
                  Mark not planned
                </button>
                <button type="button" onClick={() => decideWorkItem(selected.id, "blocked")}>
                  Block work
                </button>
              </div>
            </>
          ) : (
            <p className="empty">The factory is waiting for its first signal.</p>
          )}
        </div>

        <EvidenceLedgerPanel evidence={evidence} loading={evidenceLoading} selected={selected} />

        <ExecutionPanel doctor={doctor} modeUpdating={modeUpdating} onSetApprovalMode={setApprovalMode} />
        <CostControlPanel
          costCapInput={costCapInput}
          doctor={doctor}
          modeUpdating={modeUpdating}
          onCostCapInput={setCostCapInput}
          onSaveCostCap={saveCostCap}
        />
        <MergeGuardrailsPanel
          autoMergePolicyEnabledInput={autoMergePolicyEnabledInput}
          doctor={doctor}
          maxSafeDiffLinesInput={maxSafeDiffLinesInput}
          modeUpdating={modeUpdating}
          onAutoMergePolicyEnabledInput={setAutoMergePolicyEnabledInput}
          onMaxSafeDiffLinesInput={setMaxSafeDiffLinesInput}
          onProtectedPathFragmentsInput={setProtectedPathFragmentsInput}
          onSaveMergeGuardrails={saveMergeGuardrails}
          protectedPathFragmentsInput={protectedPathFragmentsInput}
        />
        <AgentCredentialsPanel
          apiKeyInput={apiKeyInput}
          credentialUpdating={credentialUpdating}
          doctor={doctor}
          onApiKeyInput={setApiKeyInput}
          onRemoveApiKey={removeCodexApiKey}
          onSaveApiKey={saveCodexApiKey}
          onSetCodexAuthMode={setCodexAuthMode}
        />
        <WorkerInstallPanel doctor={doctor} />
        <SetupWizard doctor={doctor} />
        <ActivityPanel title="Recent feedback" rows={snapshot.recentFeedback} />
        <SetupPanel doctor={doctor} />
        <ReconciliationPanel onRun={runReconciliation} />
        <AssumptionsPanel rows={snapshot.recentAssumptions} />
        <ActivityPanel title="Agent runs" rows={snapshot.recentAgentRuns} />
        <ActivityPanel title="Feature usage" rows={snapshot.recentUsage} />
      </section>
    </main>
  );
}

function HostedDemoAlphaPanel(props: { doctor: Doctor | null; feedbackCount: number; openWorkCount: number }) {
  const githubReady = Boolean(props.doctor?.githubAppConfigured && props.doctor.githubMode === "app");
  const workerReady = Boolean(props.doctor?.codexRunnerMode === "codex" && credentialsReady(props.doctor));

  return (
    <div className="panel hosted-demo-panel">
      <div className="panel-heading">
        <p className="eyebrow">Hosted demo alpha</p>
        <h2>LaunchBrief repo loop</h2>
      </div>
      <p className="mode-note">
        LaunchBrief is the clean app for the demo. It intentionally starts without the OFF SDK so the demo can show the
        factory connecting the repo and creating a real SDK-install PR.
      </p>
      <div className="demo-link-row">
        <a className="button-link primary" href={launchBriefAppUrl}>
          Open LaunchBrief
        </a>
        <a className="button-link" href={launchBriefRepoUrl}>
          View repo
        </a>
      </div>
      <div className="demo-stage-grid">
        <DemoStage title="Clean app" state="Live" detail="No OFF SDK installed yet" tone="ready" />
        <DemoStage title="Repo" state="Live" detail="Private GitHub repo created" tone="ready" />
        <DemoStage
          title="GitHub App"
          state={githubReady ? "Ready" : "Needed"}
          detail={githubReady ? "Can create sanitized issues/PRs" : "Connect app before mutation"}
          tone={githubReady ? "ready" : "blocked"}
        />
        <DemoStage
          title="Worker"
          state={workerReady ? "Ready" : "Disabled"}
          detail={workerReady ? "Can run approved work" : "Prepared but not attached"}
          tone={workerReady ? "ready" : "blocked"}
        />
        <DemoStage title="SDK install" state="Next" detail="OFF should create this PR" tone="waiting" />
        <DemoStage
          title="Feedback loop"
          state={props.feedbackCount ? "Active" : "Waiting"}
          detail={`${props.feedbackCount} signals, ${props.openWorkCount} open work items`}
          tone={props.feedbackCount ? "ready" : "waiting"}
        />
      </div>
    </div>
  );
}

function DemoStage(props: { detail: string; state: string; title: string; tone: "blocked" | "ready" | "waiting" }) {
  return (
    <article className={`demo-stage ${props.tone}`}>
      <strong>{props.state}</strong>
      <h3>{props.title}</h3>
      <p>{props.detail}</p>
    </article>
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
          detail={credentialDetail(doctor)}
          label="Agent credentials"
          state={doctor ? credentialModeLabel(doctor) : "Checking"}
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

function AdminAccessPanel(props: {
  adminAuthBlocked: boolean;
  adminTokenInput: string;
  doctor: Doctor | null;
  onAdminTokenInput: (value: string) => void;
  onClearAdminToken: () => void;
  onRefresh: () => void;
  onSaveAdminToken: () => void;
}) {
  const required = Boolean(props.doctor?.adminAuthRequired);

  return (
    <div className={props.adminAuthBlocked ? "panel admin-access-panel blocked" : "panel admin-access-panel"}>
      <div className="panel-heading">
        <p className="eyebrow">Admin access</p>
        <h2>{required ? "Control center token" : "Local admin gate"}</h2>
      </div>
      {required ? (
        <>
          <p className="mode-note">
            This install has <code>ADMIN_TOKEN</code> enabled. Enter it once for this browser before using queue,
            settings, release, or merge controls.
          </p>
          <div className="secret-row">
            <input
              autoComplete="off"
              placeholder="ADMIN_TOKEN"
              type="password"
              value={props.adminTokenInput}
              onChange={(event) => props.onAdminTokenInput(event.target.value)}
            />
            <button disabled={props.adminTokenInput.trim().length < 8} type="button" onClick={props.onSaveAdminToken}>
              Save token
            </button>
            <button type="button" onClick={props.onClearAdminToken}>
              Clear
            </button>
          </div>
          <div className={props.adminAuthBlocked ? "wizard-note" : "wizard-note ready"}>
            {props.adminAuthBlocked ? "Admin token is required or incorrect." : "Admin token will be sent as a bearer token."}
          </div>
          <div className="wizard-actions">
            <button type="button" onClick={props.onRefresh}>
              Retry access
            </button>
          </div>
        </>
      ) : (
        <p className="mode-note">
          Admin routes are open for local-only development. Set <code>ADMIN_TOKEN</code> before exposing a tunnel or
          shared network URL.
        </p>
      )}
    </div>
  );
}

function AgentCredentialsPanel(props: {
  apiKeyInput: string;
  credentialUpdating: boolean;
  doctor: Doctor | null;
  onApiKeyInput: (value: string) => void;
  onRemoveApiKey: () => void;
  onSaveApiKey: () => void;
  onSetCodexAuthMode: (mode: "api_key" | "cli") => void;
}) {
  const doctor = props.doctor;
  const cliActive = doctor?.codexAuthMode !== "api_key";
  const apiKeyActive = doctor?.codexAuthMode === "api_key";
  const disabled = props.credentialUpdating || !doctor;
  const apiKeyReady = Boolean(doctor?.codexApiKeyConfigured);

  return (
    <div className="panel credentials-panel">
      <div className="panel-heading">
        <p className="eyebrow">Agent credentials</p>
        <h2>Codex auth</h2>
      </div>
      <div className="mode-grid">
        <ModeCard
          active={cliActive}
          actionLabel={cliActive ? "Current mode" : "Use local CLI"}
          detail="Uses the signed-in Codex CLI on the worker machine."
          disabled={disabled || cliActive}
          label="Codex CLI"
          onSelect={() => props.onSetCodexAuthMode("cli")}
          state={cliActive ? "Active" : "Available"}
        />
        <ModeCard
          active={apiKeyActive}
          actionLabel={apiKeyActive ? "Current mode" : "Use API key"}
          detail={apiKeyReady ? "A server-side key is saved and masked." : "Save a key before using API-key mode."}
          disabled={disabled || apiKeyActive}
          label="API key"
          onSelect={() => props.onSetCodexAuthMode("api_key")}
          state={apiKeyReady ? "Configured" : "Needed"}
        />
      </div>
      <div className="secret-form">
        <label htmlFor="codex-api-key">OpenAI API key</label>
        <div className="secret-row">
          <input
            autoComplete="off"
            disabled={disabled || doctor?.codexSecretStorageWritable === false}
            id="codex-api-key"
            placeholder="sk-..."
            type="password"
            value={props.apiKeyInput}
            onChange={(event) => props.onApiKeyInput(event.target.value)}
          />
          <button
            disabled={disabled || props.apiKeyInput.trim().length < 20}
            type="button"
            onClick={props.onSaveApiKey}
          >
            Save key
          </button>
          <button disabled={disabled || !apiKeyReady} type="button" onClick={props.onRemoveApiKey}>
            Remove
          </button>
        </div>
        <p>
          {apiKeyReady
            ? `Saved ${doctor?.codexApiKeyFingerprint ?? "and masked"} from ${credentialSourceLabel(
                doctor?.codexApiKeySource,
              )}.`
            : "No API key is saved."}{" "}
          Stored at <code>{doctor?.codexSecretsPath ?? ".off/secrets.env"}</code>; the key is never sent back to the
          browser.
        </p>
        <p>API-key mode runs the Codex worker with the saved key injected server-side.</p>
      </div>
    </div>
  );
}

function WorkerInstallPanel(props: { doctor: Doctor | null }) {
  const plan = props.doctor?.runnerInstall ?? defaultRunnerInstallPlan;
  const hostRecommended = plan?.recommendedMode !== "docker_api_key";
  const dockerRecommended = plan?.recommendedMode === "docker_api_key";

  return (
    <div className="panel worker-install-panel">
      <div className="panel-heading">
        <p className="eyebrow">Runner setup</p>
        <h2>Worker install</h2>
      </div>
      <div className="install-grid">
        <article className={hostRecommended ? "install-card recommended" : "install-card"}>
          <strong>{hostRecommended ? "Recommended" : "Available"}</strong>
          <h3>{plan.hostCli.title}</h3>
          <p>
            Use this when the worker should use the signed-in Codex CLI subscription on the local machine. The installer
            creates a {plan.hostCli.service} and sources <code>.env</code> at startup.
          </p>
          <CommandList commands={[plan.hostCli.installCommand, plan.hostCli.statusCommand, plan.hostCli.uninstallCommand]} />
          <small>Logs: {plan.hostCli.logPath}</small>
        </article>
        <article className={dockerRecommended ? "install-card recommended" : "install-card"}>
          <strong>{dockerRecommended ? "Recommended" : "Available"}</strong>
          <h3>{plan.dockerApiKey.title}</h3>
          <p>{plan.dockerApiKey.requirement} This keeps the worker inside Docker and injects the key server-side.</p>
          <CommandList commands={[...plan.dockerApiKey.env, plan.dockerApiKey.startCommand]} />
          <small>Use {plan.hostCli.printCommand} to inspect the host service before installing it.</small>
        </article>
      </div>
      <p className="mode-note">
        Auto approval only gives a live worker permission to claim work. These install paths are what make that worker
        actually run, record real costs, and open real PRs when GitHub mutation is enabled.
      </p>
    </div>
  );
}

function CommandList(props: { commands: string[] }) {
  return (
    <div className="command-list">
      {props.commands.map((command) => (
        <code key={command}>{command}</code>
      ))}
    </div>
  );
}

function ExecutionPanel(props: {
  doctor: Doctor | null;
  modeUpdating: boolean;
  onSetApprovalMode: (mode: "auto" | "manual") => void;
}) {
  const doctor = props.doctor;
  const manualActive = doctor?.approvalMode !== "auto";
  const autoActive = doctor?.approvalMode === "auto";
  const autoReady = Boolean(autoActive && doctor?.codexRunnerMode === "codex" && credentialsReady(doctor));
  const controlsDisabled = props.modeUpdating || !doctor;

  return (
    <div className="panel execution-panel">
      <div className="panel-heading">
        <p className="eyebrow">Execution</p>
        <h2>Approval mode</h2>
      </div>
      <div className="mode-grid">
        <ModeCard
          active={manualActive}
          actionLabel={manualActive ? "Current mode" : "Switch to manual"}
          detail="Feedback queues until an operator runs a selected work item."
          disabled={controlsDisabled || manualActive}
          label="Manual approval required"
          onSelect={() => props.onSetApprovalMode("manual")}
          state={manualActive ? "Active" : "Available"}
        />
        <ModeCard
          active={autoActive}
          actionLabel={autoActive ? "Current mode" : "Switch to auto"}
          detail={
            autoReady
              ? "Safe queued work can be claimed by a live Codex worker."
              : "Needs auto mode plus a live Codex worker before it can claim work."
          }
          disabled={controlsDisabled || autoActive}
          label="Auto approval"
          onSelect={() => props.onSetApprovalMode("auto")}
          state={autoActive ? (autoReady ? "Ready" : "Configured") : "Available"}
        />
      </div>
      <p className="mode-note">
        Switch modes here. Auto approval lets an attached live worker claim queued work; it still uses real runners, real
        PRs, and real guardrails.
      </p>
    </div>
  );
}

function CostControlPanel(props: {
  costCapInput: string;
  doctor: Doctor | null;
  modeUpdating: boolean;
  onCostCapInput: (value: string) => void;
  onSaveCostCap: () => void;
}) {
  const parsed = Number(props.costCapInput);
  const invalid = !Number.isFinite(parsed) || parsed <= 0 || parsed > 10_000;

  return (
    <div className="panel cost-control-panel">
      <div className="panel-heading">
        <p className="eyebrow">Cost controls</p>
        <h2>Feature cap</h2>
      </div>
      <p className="mode-note">
        Workers and manual runs are blocked before model spend when the estimate exceeds this cap.
      </p>
      <div className="secret-row">
        <input
          inputMode="decimal"
          min="0"
          placeholder="5.00"
          type="number"
          value={props.costCapInput}
          onChange={(event) => props.onCostCapInput(event.target.value)}
        />
        <button disabled={props.modeUpdating || !props.doctor || invalid} type="button" onClick={props.onSaveCostCap}>
          Save cap
        </button>
      </div>
      <p className="mode-note">Current cap: {props.doctor ? formatMoney(props.doctor.maxFeatureCostUsd) : "Checking"}</p>
    </div>
  );
}

function MergeGuardrailsPanel(props: {
  autoMergePolicyEnabledInput: boolean;
  doctor: Doctor | null;
  maxSafeDiffLinesInput: string;
  modeUpdating: boolean;
  onAutoMergePolicyEnabledInput: (value: boolean) => void;
  onMaxSafeDiffLinesInput: (value: string) => void;
  onProtectedPathFragmentsInput: (value: string) => void;
  onSaveMergeGuardrails: () => void;
  protectedPathFragmentsInput: string;
}) {
  const parsed = Number(props.maxSafeDiffLinesInput);
  const protectedPaths = props.protectedPathFragmentsInput
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const invalid = !Number.isInteger(parsed) || parsed < 1 || parsed > 10_000 || protectedPaths.length === 0;

  return (
    <div className="panel merge-guardrails-panel">
      <div className="panel-heading">
        <p className="eyebrow">Merge policy</p>
        <h2>Guardrails</h2>
      </div>
      <label className="checkbox-row">
        <input
          checked={props.autoMergePolicyEnabledInput}
          type="checkbox"
          onChange={(event) => props.onAutoMergePolicyEnabledInput(event.target.checked)}
        />
        <span>Allow safe auto-merge when every gate passes</span>
      </label>
      <div className="secret-row merge-input-row">
        <input
          inputMode="numeric"
          min="1"
          placeholder="120"
          type="number"
          value={props.maxSafeDiffLinesInput}
          onChange={(event) => props.onMaxSafeDiffLinesInput(event.target.value)}
        />
        <button disabled={props.modeUpdating || !props.doctor || invalid} type="button" onClick={props.onSaveMergeGuardrails}>
          Save guardrails
        </button>
      </div>
      <label className="feature-id-field" htmlFor="protected-path-fragments">
        Protected path fragments
        <input
          id="protected-path-fragments"
          value={props.protectedPathFragmentsInput}
          onChange={(event) => props.onProtectedPathFragmentsInput(event.target.value)}
        />
      </label>
      <p className="mode-note">
        Effective auto-merge needs this policy on and <code>AUTO_MERGE_ENABLED=true</code>. Current env switch:{" "}
        {props.doctor?.autoMergeEnabled ? "enabled" : "disabled"}.
      </p>
      <p className="mode-note">
        Current diff cap: {props.doctor?.maxSafeDiffLines ?? "checking"} lines. Protected paths:{" "}
        {props.doctor?.protectedPathFragments.join(", ") ?? "checking"}.
      </p>
    </div>
  );
}

function ModeCard(props: {
  actionLabel: string;
  active: boolean;
  detail: string;
  disabled: boolean;
  label: string;
  onSelect: () => void;
  state: string;
}) {
  return (
    <button
      aria-pressed={props.active}
      className={props.active ? "mode-card active" : "mode-card"}
      disabled={props.disabled}
      type="button"
      onClick={props.onSelect}
    >
      <strong>{props.state}</strong>
      <h3>{props.label}</h3>
      <p>{props.detail}</p>
      <span>{props.actionLabel}</span>
    </button>
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
          <Detail label="Approval" value={approvalModeLabel(doctor.approvalMode)} />
          <Detail label="Runner" value={runnerModeLabel(doctor)} />
          <Detail label="Credentials" value={credentialModeLabel(doctor)} />
          <Detail label="Admin auth" value={doctor.adminAuthRequired ? "Token required" : "Local open"} />
          <Detail label="Runner auth" value={doctor.runnerAuthRequired ? "Token required" : "Local open"} />
          <Detail label="GitHub" value={doctor.githubMode} />
          <Detail label="GitHub App" value={doctor.githubAppConfigured ? "Configured" : "Not configured"} />
          <Detail label="Webhooks" value={doctor.githubWebhooksEnabled ? "Enabled" : "Local off"} />
          <Detail
            label="Auto-merge"
            value={doctor.autoMergeEnabled && doctor.autoMergePolicyEnabled ? "Enabled" : "Disabled"}
          />
          <Detail label="Cost cap" value={`$${doctor.maxFeatureCostUsd.toFixed(2)}`} />
          <Detail label="Diff cap" value={`${doctor.maxSafeDiffLines} lines`} />
          <Detail label="Protected paths" value={doctor.protectedPathFragments.join(", ")} />
          <Detail label="Public URL" value={doctor.publicBaseUrl} />
          <Detail label="Webhook URL" value={doctor.githubWebhookUrl} />
        </dl>
      ) : (
        <p className="empty">Waiting for setup health.</p>
      )}
    </div>
  );
}

function ReconciliationPanel(props: { onRun: () => void }) {
  return (
    <div className="panel reconciliation-panel">
      <div className="panel-heading">
        <p className="eyebrow">Recovery</p>
        <h2>Reconciliation</h2>
      </div>
      <div className="reconciliation-actions">
        <button type="button" onClick={props.onRun}>
          Run reconciliation
        </button>
      </div>
    </div>
  );
}

function DemandMemoryPanel(props: { clusters: FeedbackCluster[] }) {
  return (
    <div className="panel demand-memory-panel">
      <div className="panel-heading">
        <p className="eyebrow">Demand memory</p>
        <h2>Backlog signals</h2>
      </div>
      {props.clusters.length ? (
        <div className="demand-stack">
          {props.clusters.slice(0, 8).map((cluster) => (
            <article className="demand-row" key={cluster.clusterKey}>
              <div>
                <strong>{cluster.title}</strong>
                <span>{cluster.latestUserMessage ?? "Signal recorded."}</span>
              </div>
              <dl>
                <Detail label="Signals" value={String(cluster.signalCount)} />
                <Detail label="Decision" value={demandDecisionLabel(cluster)} />
                <Detail label="Category" value={titleCase(cluster.category)} />
                <Detail label="Work item" value={cluster.activeWorkItemId ? workStatusLabel(cluster.activeWorkItemStatus ?? "") : "Waiting"} />
              </dl>
            </article>
          ))}
        </div>
      ) : (
        <p className="empty">No demand clusters yet.</p>
      )}
    </div>
  );
}

function EvidenceLedgerPanel(props: {
  evidence: WorkItemEvidence | null;
  loading: boolean;
  selected: WorkItem | null;
}) {
  const evidence = props.evidence;

  return (
    <div className="panel ledger-panel">
      <div className="panel-heading">
        <p className="eyebrow">Evidence ledger</p>
        <h2>{props.selected ? "Feature trail" : "No selected work"}</h2>
      </div>
      {!props.selected ? (
        <p className="empty">Select a work item to inspect its evidence trail.</p>
      ) : props.loading ? (
        <p className="empty">Loading evidence.</p>
      ) : evidence ? (
        <div className="ledger-grid">
          <LedgerSection title="Cost ledger">
            {evidence.costRecords.length ? (
              evidence.costRecords.slice(0, 6).map((cost) => (
                <LedgerItem
                  key={cost.id}
                  label={`${titleCase(cost.phase)} / ${cost.confidence}`}
                  meta={`${cost.model} / ${dateLabel(cost.createdAt)}`}
                  text={formatMoney(cost.amountUsd)}
                />
              ))
            ) : (
              <p className="empty">No cost records yet.</p>
            )}
          </LedgerSection>
          <LedgerSection title="Agent runs">
            {evidence.agentRuns.length ? (
              evidence.agentRuns.slice(0, 6).map((run) => (
                <LedgerItem
                  key={run.id}
                  label={`${run.agentName} / ${workStatusLabel(run.status)}`}
                  meta={`${run.runType} / ${dateLabel(run.completedAt ?? run.createdAt)}`}
                  text={run.summary}
                />
              ))
            ) : (
              <p className="empty">No agent runs yet.</p>
            )}
          </LedgerSection>
          <LedgerSection title="Assumptions">
            {evidence.assumptions.length ? (
              evidence.assumptions.slice(0, 6).map((assumption) => (
                <LedgerItem
                  key={assumption.id}
                  label={assumption.unresolved ? "Unresolved" : "Recorded"}
                  meta={`${assumption.impactAreas.join(", ") || "none"} / ${dateLabel(assumption.createdAt)}`}
                  text={assumption.notes}
                />
              ))
            ) : (
              <p className="empty">No assumptions recorded yet.</p>
            )}
          </LedgerSection>
          <LedgerSection title="Review decisions">
            {reviewAuditEvents(evidence).length ? (
              reviewAuditEvents(evidence)
                .slice(0, 4)
                .map((event) => (
                  <LedgerItem
                    key={event.id}
                    label={reviewAuditLabel(event)}
                    meta={`${event.actor} / ${dateLabel(event.createdAt)}`}
                    text={String(event.metadata.summary ?? "Review decision recorded.")}
                  />
                ))
            ) : (
              <p className="empty">No reviewer approval recorded yet.</p>
            )}
          </LedgerSection>
          <LedgerSection title="Usage attribution">
            {evidence.usageAttribution.length ? (
              evidence.usageAttribution.slice(0, 4).map((usage) => (
                <LedgerItem
                  key={`${usage.workItemId}-${usage.featureId}`}
                  label={usage.featureId}
                  meta={`${usage.uniqueUsers} users / ${usage.requesterCount} requesters`}
                  text={`${usage.eventCount} usage events since ${dateLabel(usage.latestUsageAt)}`}
                />
              ))
            ) : (
              <p className="empty">No usage has been attributed to this shipped feature yet.</p>
            )}
          </LedgerSection>
          <LedgerSection title="Release proof">
            {evidence.releaseEvents.length ? (
              evidence.releaseEvents.slice(0, 4).map((release) => (
                <LedgerItem
                  key={release.id}
                  label={userStatusLabel(release.status)}
                  meta={dateLabel(release.createdAt)}
                  text="Release marker recorded for this work item."
                />
              ))
            ) : (
              <p className="empty">Waiting for release proof.</p>
            )}
          </LedgerSection>
          <LedgerSection title="GitHub artifacts">
            {evidence.githubArtifacts.length ? (
              evidence.githubArtifacts.slice(0, 4).map((artifact) => (
                <LedgerItem
                  key={artifact.id}
                  href={artifact.url}
                  label={titleCase(artifact.artifactType)}
                  meta={dateLabel(artifact.createdAt)}
                  text={artifact.url}
                />
              ))
            ) : (
              <p className="empty">No GitHub artifacts yet.</p>
            )}
          </LedgerSection>
          <LedgerSection title="User follow-up">
            {evidence.userNotifications.length ? (
              evidence.userNotifications.slice(0, 4).map((notification) => (
                <LedgerItem
                  key={notification.id}
                  label={userStatusLabel(notification.status)}
                  meta={dateLabel(notification.createdAt)}
                  text={notification.message}
                />
              ))
            ) : (
              <p className="empty">No user-facing updates yet.</p>
            )}
          </LedgerSection>
          <LedgerSection title="Audit events">
            {evidence.auditEvents.length ? (
              evidence.auditEvents.slice(0, 6).map((event) => (
                <LedgerItem
                  key={event.id}
                  label={titleCase(event.event)}
                  meta={`${event.actor} / ${dateLabel(event.createdAt)}`}
                  text={`${event.targetType}: ${event.targetId}`}
                />
              ))
            ) : (
              <p className="empty">No audit events yet.</p>
            )}
          </LedgerSection>
        </div>
      ) : (
        <p className="empty">Evidence is unavailable for this work item.</p>
      )}
    </div>
  );
}

function FeatureLifecycleView(props: { evidence: WorkItemEvidence | null; item: WorkItem }) {
  const item = props.item;
  const evidence = props.evidence;
  const hasIssue = Boolean(
    item.githubIssueUrl ?? evidence?.githubArtifacts.some((artifact) => artifact.artifactType === "issue"),
  );
  const hasPr = Boolean(
    item.githubPrUrl ?? evidence?.githubArtifacts.some((artifact) => artifact.artifactType === "pull_request"),
  );
  const hasAgentRun = Boolean(evidence?.agentRuns.length);
  const hasReview = Boolean(item.reviewDecision);
  const hasRelease = item.status === "shipped" || Boolean(evidence?.releaseEvents.length);
  const terminalBlocked = item.status === "blocked" || item.status === "not_planned";

  const steps: Array<{ detail: string; label: string; state: "done" | "active" | "waiting" | "blocked" }> = [
    {
      detail: sourceLabel(item.signalSources),
      label: "Signal",
      state: "done",
    },
    {
      detail: workStatusLabel(item.status),
      label: "Triage",
      state: terminalBlocked ? "blocked" : item.status === "planned" ? "active" : "done",
    },
    {
      detail: hasIssue ? "Issue recorded" : "Waiting for GitHub",
      label: "Issue",
      state: hasIssue ? "done" : terminalBlocked ? "blocked" : "waiting",
    },
    {
      detail: hasAgentRun ? latestAgentRunLabel(evidence) : "Waiting for worker",
      label: "Agent work",
      state: hasAgentRun ? (item.status === "in_progress" ? "active" : "done") : terminalBlocked ? "blocked" : "waiting",
    },
    {
      detail: hasPr ? "PR available" : hasReview ? reviewDecisionLabel(item.reviewDecision) : "Waiting for review",
      label: "Review",
      state: hasPr || hasReview ? "done" : terminalBlocked ? "blocked" : "waiting",
    },
    {
      detail: terminalBlocked ? workStatusLabel(item.status) : hasRelease ? "Release proof recorded" : "Not shipped yet",
      label: "Outcome",
      state: terminalBlocked ? "blocked" : hasRelease ? "done" : "waiting",
    },
  ];

  return (
    <section className="lifecycle-strip" aria-label="Feature lifecycle">
      {steps.map((step) => (
        <article className={`lifecycle-step ${step.state}`} key={step.label}>
          <strong>{step.label}</strong>
          <span>{step.detail}</span>
        </article>
      ))}
    </section>
  );
}

function LedgerSection(props: { children: ReactNode; title: string }) {
  return (
    <section className="ledger-section">
      <h3>{props.title}</h3>
      <div className="ledger-list">{props.children}</div>
    </section>
  );
}

function LedgerItem(props: { href?: string; label: string; meta: string; text: string }) {
  return (
    <article className="ledger-item">
      <strong>{props.label}</strong>
      {props.href ? <a href={props.href}>{props.text}</a> : <span>{props.text}</span>}
      <small>{props.meta}</small>
    </article>
  );
}

function AssumptionList(props: { assumptions: AgentAssumption[] }) {
  if (!props.assumptions.length) {
    return <p className="assumption-note">No unresolved agent assumptions on this work item.</p>;
  }

  return (
    <div className="assumption-box">
      <p className="mini-label">Unresolved assumptions</p>
      {props.assumptions.map((assumption, index) => (
        <article key={`${assumption.notes}-${index}`}>
          <strong>{assumption.impactAreas.join(", ") || "review"}</strong>
          <span>{assumption.notes}</span>
          {assumption.assumptions.length ? <small>{assumption.assumptions.join(" ")}</small> : null}
        </article>
      ))}
    </div>
  );
}

function AssumptionsPanel(props: { rows: Array<Record<string, unknown>> }) {
  return (
    <div className="panel activity assumptions-panel">
      <div className="panel-heading">
        <p className="eyebrow">Guardrails</p>
        <h2>Agent assumptions</h2>
      </div>
      {props.rows.length ? (
        <ul>
          {props.rows.slice(0, 5).map((row, index) => {
            const assumptions = stringList(row.assumptions);
            const checksSkipped = stringList(row.checks_skipped ?? row.checksSkipped);
            const impactAreas = stringList(row.impact_areas ?? row.impactAreas);
            return (
              <li key={String(row.id ?? index)}>
                <code>{String(row.work_item_id ?? row.workItemId ?? row.id ?? index)}</code>
                <small>{String(row.unresolved ?? false) === "true" ? "Unresolved" : "Recorded"}</small>
                <span>{String(row.notes ?? assumptions[0] ?? "Assumption recorded")}</span>
                {impactAreas.length ? <small>{impactAreas.join(", ")}</small> : null}
                {checksSkipped.length ? <span>Skipped: {checksSkipped.join(" ")}</span> : null}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="empty">No agent assumptions recorded yet.</p>
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

function latestAgentRunLabel(evidence: WorkItemEvidence | null): string {
  const latest = evidence?.agentRuns[0];
  if (!latest) return "Waiting for worker";
  return `${workStatusLabel(latest.status)} / ${dateLabel(latest.completedAt ?? latest.createdAt)}`;
}

function timeLabel(value: Date): string {
  return value.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" });
}

function approvalModeLabel(mode: string): string {
  if (mode === "auto") return "Auto approval";
  return "Manual approval";
}

function riskTierLabel(riskTier: string): string {
  if (riskTier === "safe_auto_merge") return "Low-risk auto lane";
  if (riskTier === "guarded_review") return "Needs review";
  if (riskTier === "extra_review") return "Extra review";
  if (riskTier === "plan_only") return "Plan only";
  return titleCase(riskTier);
}

function userStatusLabel(status: string): string {
  if (status === "planned") return "Queued";
  if (status === "grouped") return "Grouped with another request";
  if (status === "in_progress") return "Agent working";
  if (status === "implemented") return "Implemented, awaiting review";
  if (status === "shipped") return "Shipped";
  if (status === "blocked") return "Blocked";
  if (status === "needs_clarification") return "Needs user detail";
  if (status === "not_planned") return "Not planned";
  return titleCase(status);
}

function workStatusLabel(status: string): string {
  if (status === "planned") return "Queued";
  if (status === "in_progress") return "Agent working";
  if (status === "implemented") return "Implemented, awaiting review";
  if (status === "shipped") return "Shipped";
  if (status === "blocked") return "Blocked";
  if (status === "needs_clarification") return "Needs user detail";
  if (status === "failed") return "Needs human review";
  if (status === "not_planned") return "Not planned";
  return titleCase(status);
}

function reviewDecisionLabel(reviewDecision: WorkItemReviewDecision | null | undefined): string {
  if (!reviewDecision) return "Waiting for review";
  return reviewDecision.approved ? `Approved by ${reviewDecision.actor}` : `Rejected by ${reviewDecision.actor}`;
}

function reviewAuditEvents(evidence: WorkItemEvidence) {
  return evidence.auditEvents.filter((event) => event.event === "work_item_review_recorded");
}

function reviewAuditLabel(event: WorkItemEvidence["auditEvents"][number]): string {
  const approved = event.metadata.approved === true || event.metadata.approved === "true";
  return approved ? "Review approved" : "Review rejected";
}

function demandDecisionLabel(cluster: FeedbackCluster): string {
  if (cluster.activeWorkItemId) return "Promoted to work";
  if (cluster.latestStatus === "needs_more_signal") return `Needs ${Math.max(0, 2 - cluster.signalCount)} more`;
  if (cluster.latestStatus === "blocked") return "Blocked";
  if (cluster.latestStatus === "not_planned") return "Not planned";
  if (cluster.latestStatus) return userStatusLabel(cluster.latestStatus);
  return "Recorded";
}

function codexAuthModeLabel(mode: string): string {
  if (mode === "api_key") return "API key";
  return "Codex CLI";
}

function runnerModeLabel(doctor: Doctor): string {
  if (doctor.codexRunnerMode === "codex" && doctor.codexAuthMode === "cli") return "Codex CLI";
  if (doctor.codexRunnerMode === "codex" && doctor.codexAuthMode === "api_key") {
    return doctor.codexApiKeyConfigured ? "Codex API key" : "API key missing";
  }
  return "Paused";
}

function credentialModeLabel(doctor: Doctor): string {
  if (doctor.codexAuthMode === "api_key") return doctor.codexApiKeyConfigured ? "API key configured" : "API key missing";
  return "Codex CLI";
}

function credentialDetail(doctor: Doctor | null): string {
  if (!doctor) return "Waiting for setup health";
  if (doctor.codexAuthMode === "api_key") {
    return doctor.codexApiKeyConfigured
      ? "API key is saved for a server-side Codex worker"
      : "Save a server-side API key in the Agent credentials panel";
  }
  return "Uses the signed-in local Codex CLI subscription path";
}

function credentialSourceLabel(source: string | undefined): string {
  if (source === "env") return "environment";
  if (source === "local_file") return "local secrets file";
  return "local setup";
}

function canRunSelectedItem(doctor: Doctor | null): boolean {
  return Boolean(doctor?.codexRunnerMode === "codex" && credentialsReady(doctor));
}

function runButtonLabel(doctor: Doctor | null): string {
  if (!doctor) return "Checking runner";
  if (doctor.codexRunnerMode !== "codex") return "Attach Codex worker";
  if (!credentialsReady(doctor)) return "API key missing";
  return "Run selected item";
}

function credentialsReady(doctor: Doctor): boolean {
  return doctor.codexAuthMode === "cli" || (doctor.codexAuthMode === "api_key" && doctor.codexApiKeyConfigured);
}

function actualCostLabel(item: WorkItem): string {
  const actual = item.latestActualCost;
  if (!actual || typeof actual.amountUsd !== "number") return "Waiting";
  const confidence = actual.confidence ? ` ${actual.confidence}` : "";
  const tokens = typeof actual.tokens === "number" ? ` / ${actual.tokens} tokens` : "";
  return `$${actual.amountUsd.toFixed(4)}${confidence}${tokens}`;
}

function featureIdSuggestion(item: WorkItem): string {
  const slug = item.title
    .toLowerCase()
    .replace(/[^a-z0-9._:-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return slug || item.id;
}

function formatMoney(amount: number): string {
  return `$${amount.toFixed(4)}`;
}

function dateLabel(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown time";
  return date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function sourceLabel(sources: string[]): string {
  if (sources.some((source) => source === "sample_seed" || source === "demo_seed")) return "Sample seed";
  if (sources.some((source) => source === "test" || source.startsWith("test_"))) return "Integration test";
  if (sources.length === 0) return "No signal source";
  if (sources.every((source) => source === "daybook_demo_app")) return "Connected app";
  return sources.map(titleCase).join(", ");
}

function titleCase(value: string): string {
  return value
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1).toLowerCase()}`)
    .join(" ");
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
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
              {"agent_name" in row ? <small>{String(row.agent_name)}</small> : null}
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
