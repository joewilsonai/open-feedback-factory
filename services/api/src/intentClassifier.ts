import type { IntentClassification, IntentClassifier } from "@open-feedback-factory/core";

/**
 * Anthropic-backed semantic intent classifier.
 *
 * Used ONLY for the brittle generic-fallback cluster path (see
 * `resolveClusterKey` in core). Turns a sanitized feedback message into a
 * canonical intent so paraphrases collapse into one cluster. Privacy: it
 * receives only the already-sanitized message — raw feedback and blocked
 * (secret-bearing) feedback never reach it (enforced upstream in core).
 *
 * Failure posture: every error path returns `null` so intake falls back to the
 * deterministic key and never breaks on a model hiccup or timeout.
 */

const ANTHROPIC_MESSAGES_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const DEFAULT_TIMEOUT_MS = 4000;
const DEFAULT_MAX_TOKENS = 120;

const SYSTEM_PROMPT = [
  "You classify a single piece of product feedback into a canonical intent so",
  "that differently-worded requests for the same thing group together.",
  "Ignore incidental wording, names, and tone; capture the underlying feature",
  "request or issue.",
  "Respond with ONLY a compact JSON object and nothing else:",
  '{"clusterKey":"<2-5 word kebab-case slug>","title":"<short human title>"}',
  'Example: feedback "can you ping me when it is time to water?" ->',
  '{"clusterKey":"watering-reminders","title":"Watering reminders"}',
].join(" ");

export interface AnthropicIntentClassifierOptions {
  apiKey: string;
  model: string;
  timeoutMs?: number;
  /** Injectable for tests; defaults to global fetch. */
  fetchImpl?: typeof fetch;
}

export function createAnthropicIntentClassifier(
  options: AnthropicIntentClassifierOptions,
): IntentClassifier {
  const fetcher = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  return {
    async classify(sanitizedMessage) {
      const trimmed = sanitizedMessage.trim();
      if (!trimmed) {
        return null;
      }

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetcher(ANTHROPIC_MESSAGES_URL, {
          method: "POST",
          signal: controller.signal,
          headers: {
            "content-type": "application/json",
            "x-api-key": options.apiKey,
            "anthropic-version": ANTHROPIC_VERSION,
          },
          body: JSON.stringify({
            model: options.model,
            max_tokens: DEFAULT_MAX_TOKENS,
            temperature: 0,
            system: SYSTEM_PROMPT,
            messages: [{ role: "user", content: trimmed }],
          }),
        });

        if (!response.ok) {
          return null;
        }

        const payload = (await response.json()) as unknown;
        return parseClassifierResponse(extractText(payload));
      } catch {
        // Network error, abort/timeout, or malformed JSON — fall back.
        return null;
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

/** Pull the assistant text out of an Anthropic Messages API response. */
function extractText(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }
  const content = (payload as { content?: unknown }).content;
  if (!Array.isArray(content)) {
    return null;
  }
  const parts: string[] = [];
  for (const block of content) {
    if (block && typeof block === "object" && (block as { type?: unknown }).type === "text") {
      const text = (block as { text?: unknown }).text;
      if (typeof text === "string") {
        parts.push(text);
      }
    }
  }
  return parts.length ? parts.join("") : null;
}

/**
 * Parse the model's JSON answer into an IntentClassification. Tolerant of
 * surrounding prose/code fences; returns null when no usable clusterKey is
 * present. Pure + exported for unit testing without a network call.
 */
export function parseClassifierResponse(text: string | null): IntentClassification | null {
  if (!text) {
    return null;
  }
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(match[0]);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") {
    return null;
  }
  const clusterKey = (parsed as { clusterKey?: unknown }).clusterKey;
  if (typeof clusterKey !== "string" || !clusterKey.trim()) {
    return null;
  }
  const title = (parsed as { title?: unknown }).title;
  return {
    clusterKey,
    title: typeof title === "string" && title.trim() ? title : undefined,
  };
}
