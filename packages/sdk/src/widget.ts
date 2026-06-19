import type { SubmitFeedbackInput, SubmitFeedbackResult, OpenFeedbackClient } from "./client.js";

export interface FeedbackSuggestion {
  label: string;
  message: string;
}

export interface FeedbackLauncherOptions {
  buttonIcon?: string;
  buttonLabel?: string;
  client: OpenFeedbackClient;
  description?: string;
  metadata?: Record<string, unknown>;
  mount?: HTMLElement;
  onSubmitted?: (result: SubmitFeedbackResult) => void;
  placeholder?: string;
  position?: "bottom-left" | "bottom-right";
  source?: string;
  statusPollIntervalMs?: number;
  statusStorageKey?: string;
  trackStatus?: boolean;
  suggestions?: FeedbackSuggestion[];
  title?: string;
}

export interface FeedbackLauncherHandle {
  close(): void;
  destroy(): void;
  open(): void;
}

const launcherStyleId = "open-feedback-factory-launcher-styles";

export function mountFeedbackLauncher(options: FeedbackLauncherOptions): FeedbackLauncherHandle {
  if (typeof document === "undefined") {
    throw new Error("mountFeedbackLauncher requires a browser document");
  }

  ensureLauncherStyles();

  const root = document.createElement("div");
  root.className = "off-launcher";
  root.dataset.position = options.position ?? "bottom-right";
  const icon = options.buttonIcon ? `<span aria-hidden="true">${escapeHtml(options.buttonIcon)}</span>` : "";
  root.innerHTML = `
    <button class="off-launcher-button" type="button" aria-haspopup="dialog" aria-expanded="false">
      ${icon}<span>${escapeHtml(options.buttonLabel ?? "Suggest")}</span>
    </button>
    <div class="off-launcher-backdrop" hidden></div>
    <section class="off-launcher-panel" role="dialog" aria-modal="true" aria-labelledby="off-launcher-title" hidden>
      <div class="off-launcher-card">
        <div class="off-launcher-heading">
          <div>
            <p class="off-launcher-kicker">Feedback</p>
            <h2 id="off-launcher-title">${escapeHtml(options.title ?? "Suggest an improvement")}</h2>
          </div>
          <button class="off-launcher-close" type="button" aria-label="Close feedback form">Close</button>
        </div>
        <p class="off-launcher-description">${escapeHtml(
          options.description ?? "Tell us what would make this product better. We will let you know what happens.",
        )}</p>
        <form class="off-launcher-form">
          <label for="off-launcher-message">Request or report</label>
          <textarea id="off-launcher-message" name="message" rows="5" placeholder="${escapeHtml(
            options.placeholder ?? "Describe the improvement you want...",
          )}" required></textarea>
          <div class="off-launcher-suggestions" aria-label="Suggested requests"></div>
          <button class="off-launcher-submit" type="submit">Send suggestion</button>
        </form>
        <div class="off-launcher-status" role="status" aria-live="polite">Ready</div>
        <div class="off-launcher-tracker" hidden>
          <div>
            <p class="off-launcher-kicker">Your latest request</p>
            <strong class="off-launcher-tracker-label">Checking status...</strong>
          </div>
          <p class="off-launcher-tracker-message"></p>
          <p class="off-launcher-tracker-id"></p>
        </div>
      </div>
    </section>
  `;

  const mount = options.mount ?? document.body;
  mount.appendChild(root);

  const button = requireElement<HTMLButtonElement>(root, ".off-launcher-button");
  const backdrop = requireElement<HTMLDivElement>(root, ".off-launcher-backdrop");
  const panel = requireElement<HTMLElement>(root, ".off-launcher-panel");
  const closeButton = requireElement<HTMLButtonElement>(root, ".off-launcher-close");
  const form = requireElement<HTMLFormElement>(root, ".off-launcher-form");
  const message = requireElement<HTMLTextAreaElement>(root, "#off-launcher-message");
  const status = requireElement<HTMLDivElement>(root, ".off-launcher-status");
  const suggestions = requireElement<HTMLDivElement>(root, ".off-launcher-suggestions");
  const tracker = requireElement<HTMLDivElement>(root, ".off-launcher-tracker");
  const trackerLabel = requireElement<HTMLElement>(root, ".off-launcher-tracker-label");
  const trackerMessage = requireElement<HTMLParagraphElement>(root, ".off-launcher-tracker-message");
  const trackerId = requireElement<HTMLParagraphElement>(root, ".off-launcher-tracker-id");
  const trackStatus = options.trackStatus ?? true;
  const statusStorageKey = options.statusStorageKey ?? `off:last-feedback:${options.source ?? "web_sdk_launcher"}`;
  const statusPollIntervalMs = options.statusPollIntervalMs ?? 15_000;
  let trackedFeedbackId = trackStatus ? readTrackedFeedbackId(statusStorageKey) : null;
  let pollTimer: number | null = null;

  for (const suggestion of options.suggestions ?? []) {
    const suggestionButton = document.createElement("button");
    suggestionButton.className = "off-launcher-suggestion";
    suggestionButton.type = "button";
    suggestionButton.textContent = suggestion.label;
    suggestionButton.addEventListener("click", () => {
      message.value = suggestion.message;
      message.focus();
    });
    suggestions.appendChild(suggestionButton);
  }

  if (suggestions.childElementCount === 0) {
    suggestions.hidden = true;
  }

  const open = () => {
    backdrop.hidden = false;
    panel.hidden = false;
    button.setAttribute("aria-expanded", "true");
    window.requestAnimationFrame(() => root.classList.add("is-open"));
    message.focus();
    if (trackedFeedbackId) void refreshTrackedStatus();
    startStatusPolling();
  };

  const close = () => {
    root.classList.remove("is-open");
    backdrop.hidden = true;
    panel.hidden = true;
    button.setAttribute("aria-expanded", "false");
    stopStatusPolling();
    button.focus();
  };

  button.addEventListener("click", open);
  closeButton.addEventListener("click", close);
  backdrop.addEventListener("click", close);
  root.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !panel.hidden) close();
  });

  if (trackedFeedbackId) {
    showTracker({
      feedbackId: trackedFeedbackId,
      label: "Checking status...",
      message: "Open the panel to load the latest update.",
    });
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const text = message.value.trim();
    if (!text) {
      status.textContent = "Add a suggestion before sending.";
      return;
    }

    status.textContent = "Sending suggestion...";
    const input: SubmitFeedbackInput = {
      message: text,
      metadata: options.metadata,
      source: options.source ?? "web_sdk_launcher",
    };

    void options.client
      .submitFeedback(input)
      .then((result) => {
        status.textContent = `${result.status.label}: ${result.status.message}`;
        trackedFeedbackId = result.feedbackId;
        if (trackStatus) writeTrackedFeedbackId(statusStorageKey, result.feedbackId);
        showTracker({
          feedbackId: result.feedbackId,
          label: result.status.label,
          message: result.status.message,
        });
        startStatusPolling();
        message.value = "";
        options.onSubmitted?.(result);
      })
      .catch((error: unknown) => {
        status.textContent = error instanceof Error ? error.message : "Suggestion failed to send.";
      });
  });

  return {
    close,
    destroy() {
      stopStatusPolling();
      root.remove();
    },
    open,
  };

  async function refreshTrackedStatus(input: { showLoading?: boolean } = {}) {
    if (!trackedFeedbackId) return;
    if (input.showLoading ?? true) {
      showTracker({
        feedbackId: trackedFeedbackId,
        label: "Checking status...",
        message: "Fetching the latest update.",
      });
    }

    try {
      const next = await options.client.getFeedbackStatus(trackedFeedbackId);
      showTracker({
        feedbackId: trackedFeedbackId,
        label: next.label,
        message: next.message,
      });
    } catch (error: unknown) {
      showTracker({
        feedbackId: trackedFeedbackId,
        label: "Status unavailable",
        message: error instanceof Error ? error.message : "Could not refresh this request.",
      });
    }
  }

  function showTracker(input: { feedbackId: string; label: string; message: string }) {
    if (!trackStatus) return;
    tracker.hidden = false;
    trackerLabel.textContent = input.label;
    trackerMessage.textContent = input.message;
    trackerId.textContent = `Request ${input.feedbackId}`;
  }

  function startStatusPolling() {
    if (!trackStatus || !trackedFeedbackId || statusPollIntervalMs <= 0 || pollTimer) return;
    pollTimer = window.setInterval(() => {
      if (!panel.hidden) void refreshTrackedStatus({ showLoading: false });
    }, statusPollIntervalMs);
  }

  function stopStatusPolling() {
    if (!pollTimer) return;
    window.clearInterval(pollTimer);
    pollTimer = null;
  }
}

function ensureLauncherStyles() {
  if (document.getElementById(launcherStyleId)) return;
  const style = document.createElement("style");
  style.id = launcherStyleId;
  style.textContent = `
    .off-launcher, .off-launcher * { box-sizing: border-box; }
    .off-launcher-button {
      position: fixed;
      right: max(1rem, env(safe-area-inset-right));
      bottom: max(1rem, env(safe-area-inset-bottom));
      z-index: 2147483000;
      min-height: 3.25rem;
      border: 0;
      border-radius: 999px;
      padding: 0 1.15rem;
      color: #ffffff;
      background: #18201d;
      box-shadow: 0 16px 44px rgba(0, 0, 0, 0.28);
      cursor: pointer;
      font: 800 0.95rem/1 Inter, ui-sans-serif, system-ui, sans-serif;
    }
    .off-launcher-button span + span {
      margin-left: 0.45rem;
    }
    .off-launcher[data-position="bottom-left"] .off-launcher-button {
      right: auto;
      left: max(1rem, env(safe-area-inset-left));
    }
    .off-launcher-backdrop {
      position: fixed;
      inset: 0;
      z-index: 2147483001;
      background: rgba(0, 0, 0, 0.34);
    }
    .off-launcher-panel {
      position: fixed;
      inset: auto max(1rem, env(safe-area-inset-right)) max(5rem, calc(env(safe-area-inset-bottom) + 5rem)) auto;
      z-index: 2147483002;
      width: min(26rem, calc(100vw - 2rem));
      color: #17201d;
      font: 500 1rem/1.4 Inter, ui-sans-serif, system-ui, sans-serif;
    }
    .off-launcher[data-position="bottom-left"] .off-launcher-panel {
      inset: auto auto max(5rem, calc(env(safe-area-inset-bottom) + 5rem)) max(1rem, env(safe-area-inset-left));
    }
    .off-launcher-card {
      display: grid;
      gap: 0.9rem;
      border: 1px solid rgba(24, 32, 29, 0.16);
      border-radius: 12px;
      background: #f7f6f1;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.32);
      padding: 1rem;
    }
    .off-launcher-heading {
      display: flex;
      justify-content: space-between;
      gap: 0.75rem;
      align-items: start;
    }
    .off-launcher-kicker {
      margin: 0 0 0.25rem;
      color: #0f7054;
      font-size: 0.72rem;
      font-weight: 900;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }
    .off-launcher h2 {
      margin: 0;
      font-size: 1.2rem;
      letter-spacing: 0;
    }
    .off-launcher-description, .off-launcher-status {
      margin: 0;
      color: #59645f;
      font-size: 0.95rem;
    }
    .off-launcher-tracker {
      display: grid;
      gap: 0.45rem;
      border: 1px solid rgba(15, 112, 84, 0.18);
      border-radius: 10px;
      background: rgba(15, 112, 84, 0.07);
      padding: 0.8rem;
    }
    .off-launcher-tracker[hidden] {
      display: none;
    }
    .off-launcher-tracker-label {
      display: block;
      color: #17201d;
      font-size: 0.98rem;
    }
    .off-launcher-tracker-message, .off-launcher-tracker-id {
      margin: 0;
      color: #59645f;
      font-size: 0.9rem;
    }
    .off-launcher-tracker-id {
      font-size: 0.78rem;
      word-break: break-word;
    }
    .off-launcher-form {
      display: grid;
      gap: 0.7rem;
    }
    .off-launcher label {
      font-weight: 850;
    }
    .off-launcher textarea {
      width: 100%;
      border: 1px solid rgba(24, 32, 29, 0.22);
      border-radius: 8px;
      padding: 0.85rem;
      color: inherit;
      background: rgba(255, 255, 255, 0.78);
      font: inherit;
      resize: vertical;
    }
    .off-launcher-suggestions {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
    }
    .off-launcher button {
      min-height: 2.75rem;
      font: inherit;
    }
    .off-launcher-close, .off-launcher-suggestion {
      border: 1px solid rgba(24, 32, 29, 0.16);
      border-radius: 999px;
      color: inherit;
      background: rgba(255, 255, 255, 0.72);
      cursor: pointer;
      padding: 0 0.8rem;
    }
    .off-launcher-submit {
      border: 0;
      border-radius: 8px;
      color: #ffffff;
      background: #18201d;
      cursor: pointer;
      font-weight: 850;
      padding: 0 1rem;
    }
    @media (max-width: 520px) {
      .off-launcher-panel {
        inset: auto 0 0 0;
        width: 100%;
      }
      .off-launcher-card {
        border-radius: 16px 16px 0 0;
        padding-bottom: max(1rem, env(safe-area-inset-bottom));
      }
    }
  `;
  document.head.appendChild(style);
}

function requireElement<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector(selector);
  if (!element) throw new Error(`Missing launcher element: ${selector}`);
  return element as T;
}

function readTrackedFeedbackId(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeTrackedFeedbackId(key: string, feedbackId: string) {
  try {
    window.localStorage.setItem(key, feedbackId);
  } catch {
    // Status tracking still works for the current session when storage is blocked.
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
