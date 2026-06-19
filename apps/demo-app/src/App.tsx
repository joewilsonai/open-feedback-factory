import { useEffect, useMemo, useRef, useState } from "react";
import { createOpenFeedbackClient, type SubmitFeedbackResult } from "@open-feedback-factory/sdk";
import "./styles.css";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "";
const themeStorageKey = "open-feedback-factory-daybook-theme";
const noteStorageKey = "open-feedback-factory-daybook-note";
const pinnedNotesStorageKey = "open-feedback-factory-daybook-pinned-notes";
const tasksStorageKey = "open-feedback-factory-daybook-tasks";

type Theme = "dark" | "light";

interface Task {
  done: boolean;
  id: string;
  text: string;
}

export interface PinnedNote {
  createdAt: string;
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

function readInitialTheme(): Theme {
  if (typeof window === "undefined") return "light";
  return window.localStorage.getItem(themeStorageKey) === "dark" ? "dark" : "light";
}

function readNote(): string {
  if (typeof window === "undefined") return "Today I need one quiet place for ideas, follow-ups, and small tasks.";
  return window.localStorage.getItem(noteStorageKey) ?? "Today I need one quiet place for ideas, follow-ups, and small tasks.";
}

function readPinnedNotes(): PinnedNote[] {
  if (typeof window === "undefined") return [];
  const stored = window.localStorage.getItem(pinnedNotesStorageKey);
  if (!stored) return [];
  try {
    return normalizePinnedNotes(JSON.parse(stored) as unknown);
  } catch {
    return [];
  }
}

export function normalizePinnedNotes(value: unknown): PinnedNote[] {
  if (!Array.isArray(value)) return [];

  const seenTexts = new Set<string>();
  const pinnedNotes: PinnedNote[] = [];

  for (const item of value) {
    if (!item || typeof item !== "object") continue;

    const candidate = item as Partial<Record<keyof PinnedNote, unknown>>;
    if (typeof candidate.createdAt !== "string" || typeof candidate.id !== "string" || typeof candidate.text !== "string") {
      continue;
    }

    const text = normalizePinnedNoteText(candidate.text);
    if (!text || seenTexts.has(text)) continue;

    seenTexts.add(text);
    pinnedNotes.push({
      createdAt: candidate.createdAt,
      id: candidate.id,
      text,
    });
  }

  return pinnedNotes;
}

export function canPinPinnedNote(pinnedNotes: PinnedNote[], noteText: string): boolean {
  const text = normalizePinnedNoteText(noteText);
  return text.length > 0 && !pinnedNotes.some((pinnedNote) => normalizePinnedNoteText(pinnedNote.text) === text);
}

function createPinnedNote(text: string): PinnedNote {
  const randomId = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}`;
  return {
    createdAt: new Date().toISOString(),
    id: `pinned-note-${randomId}`,
    text,
  };
}

function normalizePinnedNoteText(text: string): string {
  return text.trim();
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
  const [pinnedNotes, setPinnedNotes] = useState<PinnedNote[]>(readPinnedNotes);
  const [result, setResult] = useState<SubmitFeedbackResult | null>(null);
  const [status, setStatus] = useState("Ready");
  const [taskDraft, setTaskDraft] = useState("");
  const [tasks, setTasks] = useState<Task[]>(readTasks);
  const [theme, setTheme] = useState<Theme>(readInitialTheme);
  const noteInputRef = useRef<HTMLTextAreaElement | null>(null);
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
  const canPinNote = canPinPinnedNote(pinnedNotes, note);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem(themeStorageKey, theme);
  }, [theme]);

  useEffect(() => {
    window.localStorage.setItem(noteStorageKey, note);
  }, [note]);

  useEffect(() => {
    window.localStorage.setItem(pinnedNotesStorageKey, JSON.stringify(pinnedNotes));
  }, [pinnedNotes]);

  useEffect(() => {
    window.localStorage.setItem(tasksStorageKey, JSON.stringify(tasks));
  }, [tasks]);

  function toggleTheme() {
    const nextTheme = theme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
    void client.trackFeatureUsage({
      action: nextTheme === "dark" ? "enabled" : "disabled",
      featureId: "dark-mode",
      metadata: {
        appName: "Daybook",
        source: "notepad-todo",
      },
    });
  }

  function pinCurrentNote() {
    const text = normalizePinnedNoteText(note);
    if (!canPinPinnedNote(pinnedNotes, text)) return;
    const nextPinnedNote = createPinnedNote(text);
    setPinnedNotes((currentPinnedNotes) =>
      canPinPinnedNote(currentPinnedNotes, text) ? [nextPinnedNote, ...currentPinnedNotes] : currentPinnedNotes,
    );
    void client.trackFeatureUsage({
      action: "pinned",
      featureId: "pinned-note",
      metadata: {
        appName: "Daybook",
        source: "notepad-todo",
      },
    });
  }

  function unpinNote(id: string) {
    setPinnedNotes((currentPinnedNotes) => currentPinnedNotes.filter((pinnedNote) => pinnedNote.id !== id));
    void client.trackFeatureUsage({
      action: "unpinned",
      featureId: "pinned-note",
      metadata: {
        appName: "Daybook",
        source: "notepad-todo",
      },
    });
  }

  function usePinnedNote(pinnedNote: PinnedNote) {
    setNote(pinnedNote.text);
    window.requestAnimationFrame(() => noteInputRef.current?.focus());
    void client.trackFeatureUsage({
      action: "restored",
      featureId: "pinned-note",
      metadata: {
        appName: "Daybook",
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
        <button className="theme-switch" type="button" role="switch" aria-checked={theme === "dark"} onClick={toggleTheme}>
          <span>{theme === "dark" ? "Dark mode" : "Light mode"}</span>
        </button>
      </header>

      <section className="metric-strip" aria-label="Workspace metrics">
        <Metric label="Todos" value={String(tasks.length)} detail="total" />
        <Metric label="Done" value={`${completedCount}/${tasks.length}`} detail="completed" />
        <Metric label="Pinned" value={String(pinnedNotes.length)} detail="notes" />
        <Metric label="Requests" value={result?.workItemId ? "1" : "0"} detail="current session" />
      </section>

      <section className="workspace-grid">
        <div className="panel note-panel">
          <div className="panel-heading note-heading">
            <div>
              <p className="eyebrow">Notebook</p>
              <h2>Scratchpad</h2>
            </div>
            <button className="pin-note-action" type="button" disabled={!canPinNote} onClick={pinCurrentNote}>
              Pin note
            </button>
          </div>
          {pinnedNotes.length > 0 ? (
            <section className="pinned-notes" aria-label="Pinned notes">
              <div className="pinned-notes-heading">
                <p className="mini-label">Pinned notes</p>
                <span>{pinnedNotes.length}</span>
              </div>
              {pinnedNotes.map((pinnedNote) => (
                <article className="pinned-note" key={pinnedNote.id}>
                  <p>{pinnedNote.text}</p>
                  <div className="pinned-note-actions">
                    <button type="button" onClick={() => usePinnedNote(pinnedNote)}>
                      Use note
                    </button>
                    <button type="button" onClick={() => unpinNote(pinnedNote.id)}>
                      Unpin
                    </button>
                  </div>
                </article>
              ))}
            </section>
          ) : null}
          <label htmlFor="note">Today</label>
          <textarea id="note" ref={noteInputRef} value={note} onChange={(event) => setNote(event.target.value)} rows={12} />
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
