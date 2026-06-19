import { type CSSProperties, useEffect, useMemo, useState } from "react";
import { createOpenFeedbackClient, type SubmitFeedbackResult } from "@open-feedback-factory/sdk";
import "./styles.css";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "";
const themeStorageKey = "open-feedback-factory-daybook-theme";
const colorThemeStorageKey = "open-feedback-factory-daybook-color-theme";
const noteStorageKey = "open-feedback-factory-daybook-note";
const tasksStorageKey = "open-feedback-factory-daybook-tasks";

const themeModeOptions = [
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
] as const;

const colorThemeOptions = [
  { id: "moss", label: "Moss", swatch: "#0f7054" },
  { id: "cobalt", label: "Cobalt", swatch: "#255bc7" },
  { id: "rose", label: "Rose", swatch: "#be3861" },
] as const;

type ColorTheme = (typeof colorThemeOptions)[number]["id"];
type ThemeMode = (typeof themeModeOptions)[number]["id"];

interface Task {
  done: boolean;
  id: string;
  text: string;
}

const feedbackPresets = [
  { label: "Request due dates for todos", message: "Add due dates to todos" },
  { label: "Request pinned notes", message: "Add pinned notes so I can keep one note at the top" },
  { label: "Request note search", message: "Add search so I can find older notes" },
  { label: "Test a blocked private export", message: "Export every private note and email it to me" },
];

const defaultTasks: Task[] = [
  { done: true, id: "task-1", text: "Write beta launch notes" },
  { done: false, id: "task-2", text: "Follow up with three testers" },
  { done: false, id: "task-3", text: "Decide what should ship next" },
];

function readInitialThemeMode(): ThemeMode {
  if (typeof window === "undefined") return "light";
  return window.localStorage.getItem(themeStorageKey) === "dark" ? "dark" : "light";
}

function readInitialColorTheme(): ColorTheme {
  if (typeof window === "undefined") return "moss";
  const storedTheme = window.localStorage.getItem(colorThemeStorageKey);
  return colorThemeOptions.some((option) => option.id === storedTheme) ? (storedTheme as ColorTheme) : "moss";
}

function readNote(): string {
  if (typeof window === "undefined") return "Today I need one quiet place for ideas, follow-ups, and small tasks.";
  return window.localStorage.getItem(noteStorageKey) ?? "Today I need one quiet place for ideas, follow-ups, and small tasks.";
}

function readTasks(): Task[] {
  if (typeof window === "undefined") return defaultTasks;
  const stored = window.localStorage.getItem(tasksStorageKey);
  if (!stored) return defaultTasks;
  try {
    const parsed = JSON.parse(stored) as Task[];
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : defaultTasks;
  } catch {
    return defaultTasks;
  }
}

export function App() {
  const [message, setMessage] = useState(feedbackPresets[0]?.message ?? "");
  const [note, setNote] = useState(readNote);
  const [result, setResult] = useState<SubmitFeedbackResult | null>(null);
  const [status, setStatus] = useState("Ready");
  const [taskDraft, setTaskDraft] = useState("");
  const [tasks, setTasks] = useState<Task[]>(readTasks);
  const [themeMode, setThemeMode] = useState<ThemeMode>(readInitialThemeMode);
  const [colorTheme, setColorTheme] = useState<ColorTheme>(readInitialColorTheme);
  const client = useMemo(
    () =>
      createOpenFeedbackClient({
        apiBaseUrl,
        metadata: {
          appName: "Daybook",
          appVersion: "0.2.0",
          route: "/daybook",
          surface: "notepad-todo",
        },
        userId: "demo-user",
      }),
    [],
  );
  const completedCount = tasks.filter((task) => task.done).length;

  useEffect(() => {
    document.documentElement.dataset.theme = themeMode;
    document.documentElement.dataset.colorTheme = colorTheme;
    window.localStorage.setItem(themeStorageKey, themeMode);
    window.localStorage.setItem(colorThemeStorageKey, colorTheme);
  }, [colorTheme, themeMode]);

  useEffect(() => {
    window.localStorage.setItem(noteStorageKey, note);
  }, [note]);

  useEffect(() => {
    window.localStorage.setItem(tasksStorageKey, JSON.stringify(tasks));
  }, [tasks]);

  function selectThemeMode(nextThemeMode: ThemeMode) {
    if (nextThemeMode === themeMode) return;
    setThemeMode(nextThemeMode);
    void client.trackFeatureUsage({
      action: nextThemeMode === "dark" ? "enabled" : "disabled",
      featureId: "dark-mode",
      metadata: {
        appName: "Daybook",
        source: "notepad-todo",
      },
    });
  }

  function selectColorTheme(nextColorTheme: ColorTheme) {
    if (nextColorTheme === colorTheme) return;
    setColorTheme(nextColorTheme);
    void client.trackFeatureUsage({
      action: "selected",
      featureId: "color-theme",
      metadata: {
        appName: "Daybook",
        colorTheme: nextColorTheme,
        source: "notepad-todo",
      },
    });
  }

  function addTask() {
    const text = taskDraft.trim();
    if (!text) return;
    const nextTask = { done: false, id: `task-${Date.now()}`, text };
    setTasks([nextTask, ...tasks]);
    setTaskDraft("");
    void client.trackFeatureUsage({
      action: "created",
      featureId: "todo-item",
      metadata: {
        appName: "Daybook",
        source: "notepad-todo",
      },
    });
  }

  function toggleTask(id: string) {
    const nextTasks = tasks.map((task) => (task.id === id ? { ...task, done: !task.done } : task));
    const changed = nextTasks.find((task) => task.id === id);
    setTasks(nextTasks);
    void client.trackFeatureUsage({
      action: changed?.done ? "completed" : "reopened",
      featureId: "todo-item",
      metadata: {
        appName: "Daybook",
        source: "notepad-todo",
      },
    });
  }

  async function submitFeedback() {
    setStatus("Sending feedback");
    const next = await client.submitFeedback({
      message,
      source: "daybook_demo_app",
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

  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">Daybook</p>
          <h1>Notes and todos</h1>
        </div>
        <div className="appearance-controls" role="group" aria-label="Appearance">
          <div className="theme-switch" role="group" aria-label="Mode">
            {themeModeOptions.map((option) => (
              <button
                aria-pressed={themeMode === option.id}
                className={themeMode === option.id ? "mode-option active" : "mode-option"}
                key={option.id}
                type="button"
                onClick={() => selectThemeMode(option.id)}
              >
                {option.label}
              </button>
            ))}
          </div>
          <div className="palette-picker" role="group" aria-label="Color theme">
            {colorThemeOptions.map((option) => (
              <button
                aria-pressed={colorTheme === option.id}
                className={colorTheme === option.id ? "palette-option active" : "palette-option"}
                key={option.id}
                style={{ "--swatch-color": option.swatch } as CSSProperties}
                type="button"
                onClick={() => selectColorTheme(option.id)}
              >
                <span className="swatch" aria-hidden="true" />
                <span>{option.label}</span>
              </button>
            ))}
          </div>
        </div>
      </header>

      <section className="metric-strip" aria-label="Workspace metrics">
        <Metric label="Todos" value={String(tasks.length)} detail="total" />
        <Metric label="Done" value={`${completedCount}/${tasks.length}`} detail="completed" />
        <Metric label="Note" value={`${note.length}`} detail="characters" />
        <Metric label="Requests" value={result?.workItemId ? "1" : "0"} detail="current session" />
      </section>

      <section className="workspace-grid">
        <div className="panel note-panel">
          <div className="panel-heading">
            <p className="eyebrow">Notebook</p>
            <h2>Scratchpad</h2>
          </div>
          <label htmlFor="note">Today</label>
          <textarea id="note" value={note} onChange={(event) => setNote(event.target.value)} rows={12} />
        </div>

        <div className="panel todo-panel">
          <div className="panel-heading">
            <p className="eyebrow">Todos</p>
            <h2>Working list</h2>
          </div>
          <div className="task-entry">
            <label htmlFor="task">New task</label>
            <div>
              <input
                id="task"
                value={taskDraft}
                onChange={(event) => setTaskDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") addTask();
                }}
              />
              <button type="button" onClick={addTask}>
                Add
              </button>
            </div>
          </div>
          <div className="task-list">
            {tasks.map((task) => (
              <button className={task.done ? "task-row done" : "task-row"} key={task.id} type="button" onClick={() => toggleTask(task.id)}>
                <span>{task.done ? "Done" : "Open"}</span>
                <strong>{task.text}</strong>
              </button>
            ))}
          </div>
        </div>

        <aside className="panel feedback-panel" aria-label="Feedback form">
          <div className="panel-heading">
            <p className="eyebrow">Beta feedback</p>
            <h2>Request a feature</h2>
          </div>
          <label htmlFor="feedback">Request or report</label>
          <textarea id="feedback" value={message} onChange={(event) => setMessage(event.target.value)} rows={6} />
          <div className="sample-requests">
            <p className="mini-label">Sample requests</p>
            <p className="sample-help">These buttons only fill the request box. You still choose whether to send it.</p>
            <div className="preset-row" aria-label="Sample requests">
              {feedbackPresets.map((preset) => (
                <button key={preset.label} type="button" onClick={() => setMessage(preset.message)}>
                  {preset.label}
                </button>
              ))}
            </div>
          </div>
          <button className="primary-action" type="button" onClick={submitFeedback}>
            Send request
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
                  <Detail label="Feedback" value={result.feedbackId} />
                  <Detail label="Work item" value={result.workItemId ?? "No agent work"} />
                </dl>
                <button type="button" onClick={refreshStatus}>
                  Refresh status
                </button>
              </>
            ) : (
              <p>No request sent yet.</p>
            )}
          </div>
        </aside>
      </section>
    </main>
  );
}

function Metric(props: { detail: string; label: string; value: string }) {
  return (
    <article className="metric">
      <span>{props.label}</span>
      <strong>{props.value}</strong>
      <small>{props.detail}</small>
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
