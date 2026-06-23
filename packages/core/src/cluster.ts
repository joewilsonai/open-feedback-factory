import type { SanitizedFeedback } from "./types.js";

const SYNONYMS: Array<[RegExp, string]> = [
  [/\b(night mode|dark theme|dark color|dark colours?|dark colors?)\b/g, "dark mode"],
  [/\b(colou?r themes?|change app colou?r|theme picker|appearance)\b/g, "theme color"],
  [/\b(settings screen|preferences|account screen)\b/g, "settings"],
  [/\b(copy|wording|label|text)\b/g, "copy"],
  [/\b(crash|crashes|crashed|freezes|hangs)\b/g, "crash"],
  [/\b(to dos?|todos?|tasks?)\b/g, "todo"],
  [/\b(deadlines?|due dates?)\b/g, "due date"],
  [/\b(pinned notes?|pin notes?|pinned note|pin note)\b/g, "pinned note"],
];

const STOP_WORDS = new Set([
  "add",
  "and",
  "can",
  "copy",
  "create",
  "for",
  "please",
  "text",
  "the",
  "this",
  "update",
  "with",
]);

/**
 * The deterministic clustering result.
 *
 * `precise` marks whether the key came from a high-confidence dedicated bucket
 * (a hand-written synonym/intent rule like dark-mode, crash, daybook) or from
 * the generic first-N-words fallback. The fallback is brittle — paraphrases of
 * the same request scatter into separate one-signal clusters — so it is the
 * only path a semantic classifier should be allowed to override. See
 * {@link resolveClusterKey} in ./semanticCluster.ts.
 */
export interface DeterministicCluster {
  clusterKey: string;
  precise: boolean;
}

export function deterministicCluster(
  input: Pick<SanitizedFeedback, "sanitizedMessage">,
): DeterministicCluster {
  let normalized = input.sanitizedMessage.toLowerCase();
  normalized = normalized.replace(/\[[^\]]+\]/g, " ");
  normalized = normalized.replace(/[^a-z0-9\s]/g, " ");

  for (const [pattern, replacement] of SYNONYMS) {
    normalized = normalized.replace(pattern, replacement);
  }

  if (hasThemeColorIntent(normalized)) {
    return { clusterKey: "feature.theme.color-options", precise: true };
  }

  if (/\bdark mode\b/.test(normalized)) {
    return { clusterKey: "feature.theme.dark-mode", precise: true };
  }

  if (/\bcopy\b/.test(normalized)) {
    const copyWords = wordsForCluster(normalized).filter((word) => !STOP_WORDS.has(word)).slice(0, 8);
    return {
      clusterKey: copyWords.length ? `safe.copy.${copyWords.join("-")}` : "safe.copy",
      precise: true,
    };
  }

  if (/\bcrash\b/.test(normalized)) {
    return { clusterKey: "bug.crash", precise: true };
  }

  if (/\b(todo|due date|pinned note|notes?)\b/.test(normalized)) {
    const words = wordsForCluster(normalized).filter((word) => !STOP_WORDS.has(word)).slice(0, 8);
    return {
      clusterKey: words.length ? `feature.daybook.${words.join("-")}` : "feature.daybook",
      precise: true,
    };
  }

  const words = wordsForCluster(normalized).slice(0, 8);

  return {
    clusterKey: words.length ? `feedback.${words.join("-")}` : "feedback.uncategorized",
    precise: false,
  };
}

export function clusterKeyForFeedback(input: Pick<SanitizedFeedback, "sanitizedMessage">): string {
  return deterministicCluster(input).clusterKey;
}

function hasThemeColorIntent(value: string): boolean {
  return (
    /\bthemes?\b/.test(value) &&
    /\b(colou?rs?|palette|picker|pick|select|choose|multiple|different|options?)\b/.test(value)
  );
}

function wordsForCluster(value: string): string[] {
  return value.split(/\s+/).filter((word) => word.length > 2);
}
