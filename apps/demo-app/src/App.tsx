import { useEffect, useMemo, useState } from "react";
import { createOpenFeedbackClient, type SubmitFeedbackResult } from "@open-feedback-factory/sdk";
import "./styles.css";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "";
const themeStorageKey = "open-feedback-factory-demo-theme";

type ThemePreference = "light" | "dark";

const presets = [
  "Please add dark mode to settings",
  "Please export private conversations and email them to me",
  "Make the dashboard more delightful",
];

function readThemePreference(): ThemePreference {
  if (typeof window === "undefined") return "light";

  try {
    return window.localStorage.getItem(themeStorageKey) === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

function writeThemePreference(theme: ThemePreference) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(themeStorageKey, theme);
  } catch {
    // The visual theme should still work when browser storage is unavailable.
  }
}

export function App() {
  const [message, setMessage] = useState(presets[0] ?? "");
  const [result, setResult] = useState<SubmitFeedbackResult | null>(null);
  const [status, setStatus] = useState<string>("Ready");
  const [theme, setTheme] = useState<ThemePreference>(() => readThemePreference());
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
  const darkModeEnabled = theme === "dark";

  useEffect(() => {
    writeThemePreference(theme);
  }, [theme]);

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

  function trackDarkModeUsage() {
    void client
      .trackFeatureUsage({
        action: "enabled",
        featureId: "dark-mode",
        metadata: {
          source: "demo-theme-toggle",
        },
      })
      .catch(() => undefined);
  }

  function toggleDarkMode() {
    const nextTheme = darkModeEnabled ? "light" : "dark";
    setTheme(nextTheme);

    if (nextTheme === "dark") {
      trackDarkModeUsage();
    }
  }

  return (
    <main className={darkModeEnabled ? "app dark" : "app"}>
      <section className="workspace" aria-labelledby="demo-title">
        <div className="product-pane">
          <p className="eyebrow">Toy product</p>
          <h1 id="demo-title">Notes Lab</h1>
          <p className="lede">
            This tiny app is the product under test. Submit beta feedback, watch it
            become a work item, then record whether the shipped feature gets used.
          </p>

          <div className="note-surface">
            <div>
              <p className="mini-label">Current feature</p>
              <h2>Calm writing mode</h2>
              <p>
                A focused editor shell with a saved appearance toggle. The demo request
                asks the factory to keep that dark mode path durable.
              </p>
            </div>
            <button
              className="theme-toggle"
              type="button"
              role="switch"
              aria-checked={darkModeEnabled}
              onClick={toggleDarkMode}
            >
              <span>{darkModeEnabled ? "Dark mode on" : "Dark mode off"}</span>
              <span className="toggle-track" aria-hidden="true">
                <span className="toggle-thumb" />
              </span>
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
