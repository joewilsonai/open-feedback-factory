import { useMemo, useState } from "react";
import { createOpenFeedbackClient, type SubmitFeedbackResult } from "@open-feedback-factory/sdk";
import "./styles.css";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "";

const presets = [
  "Please add dark mode to settings",
  "Please export private conversations and email them to me",
  "Make the dashboard more delightful",
];

export function App() {
  const [message, setMessage] = useState(presets[0] ?? "");
  const [result, setResult] = useState<SubmitFeedbackResult | null>(null);
  const [status, setStatus] = useState<string>("Ready");
  const [darkModeUsed, setDarkModeUsed] = useState(false);
  const client = useMemo(
    () =>
      createOpenFeedbackClient({
        apiBaseUrl,
        metadata: {
          appVersion: "0.1.0",
          route: "/demo",
          surface: "demo-workbench",
        },
        userId: "demo-user",
      }),
    [],
  );

  async function submitFeedback() {
    setStatus("Sending feedback...");
    const next = await client.submitFeedback({
      message,
      source: "demo_app",
    });
    setResult(next);
    setStatus(next.status.label);
  }

  async function refreshStatus() {
    if (!result) return;
    const next = await client.getFeedbackStatus(result.feedbackId);
    setResult({ ...result, status: next });
    setStatus(next.label);
  }

  async function trackUsage() {
    await client.trackFeatureUsage({
      action: "enabled",
      featureId: "dark-mode",
      metadata: {
        source: "demo-button",
      },
    });
    setDarkModeUsed(true);
  }

  return (
    <main className={darkModeUsed ? "app dark" : "app"}>
      <section className="workspace" aria-labelledby="demo-title">
        <div className="product-pane">
          <p className="eyebrow">Toy product</p>
          <h1 id="demo-title">Feedback Lab</h1>
          <p className="lede">
            This tiny app is the product under test. Submit beta feedback, watch it
            become a work item, then record whether the shipped feature gets used.
          </p>

          <div className="note-surface">
            <div>
              <p className="mini-label">Current feature</p>
              <h2>Calm writing mode</h2>
              <p>
                A focused editor shell with a future appearance toggle. The demo request
                asks the factory to add that dark mode path safely.
              </p>
            </div>
            <button className="icon-button" type="button" onClick={trackUsage}>
              {darkModeUsed ? "Dark mode used" : "Use dark mode"}
            </button>
          </div>
        </div>

        <aside className="feedback-panel" aria-label="Feedback form">
          <p className="eyebrow">Beta feedback</p>
          <label htmlFor="feedback">Request or report</label>
          <textarea
            id="feedback"
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            rows={6}
          />

          <div className="preset-row" aria-label="Example feedback">
            {presets.map((preset) => (
              <button key={preset} type="button" onClick={() => setMessage(preset)}>
                {preset.includes("export") ? "Blocked path" : preset.includes("delightful") ? "Needs signal" : "Ship path"}
              </button>
            ))}
          </div>

          <button className="primary-action" type="button" onClick={submitFeedback}>
            Send feedback
          </button>

          <div className="status-block" aria-live="polite">
            <div>
              <p className="mini-label">Factory status</p>
              <strong>{status}</strong>
            </div>
            {result ? (
              <>
                <p>{result.status.message}</p>
                <dl>
                  <div>
                    <dt>Feedback</dt>
                    <dd>{result.feedbackId}</dd>
                  </div>
                  <div>
                    <dt>Work item</dt>
                    <dd>{result.workItemId ?? "No agent work"}</dd>
                  </div>
                </dl>
                <button type="button" onClick={refreshStatus}>
                  Refresh status
                </button>
              </>
            ) : (
              <p>No feedback sent yet.</p>
            )}
          </div>
        </aside>
      </section>
    </main>
  );
}
