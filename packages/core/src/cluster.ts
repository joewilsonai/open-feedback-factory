import type { SanitizedFeedback } from "./types.js";

const SYNONYMS: Array<[RegExp, string]> = [
  [/\b(night mode|dark theme|dark color|dark colours?|dark colors?)\b/g, "dark mode"],
  [/\b(colou?r themes?|change app colou?r|theme picker|appearance)\b/g, "theme"],
  [/\b(settings screen|preferences|account screen)\b/g, "settings"],
  [/\b(copy|wording|label|text)\b/g, "copy"],
  [/\b(crash|crashes|crashed|freezes|hangs)\b/g, "crash"],
];

export function clusterKeyForFeedback(input: Pick<SanitizedFeedback, "sanitizedMessage">): string {
  let normalized = input.sanitizedMessage.toLowerCase();
  normalized = normalized.replace(/\[[^\]]+\]/g, " ");
  normalized = normalized.replace(/[^a-z0-9\s]/g, " ");

  for (const [pattern, replacement] of SYNONYMS) {
    normalized = normalized.replace(pattern, replacement);
  }

  if (/\bdark mode\b/.test(normalized) || /\btheme\b/.test(normalized)) {
    return "feature.theme.dark-mode";
  }

  if (/\bcopy\b/.test(normalized)) {
    return "safe.copy";
  }

  if (/\bcrash\b/.test(normalized)) {
    return "bug.crash";
  }

  const words = normalized
    .split(/\s+/)
    .filter((word) => word.length > 2)
    .slice(0, 8);

  return words.length ? `feedback.${words.join("-")}` : "feedback.uncategorized";
}
