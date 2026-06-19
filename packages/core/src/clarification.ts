import type { ClarificationContext, SanitizedFeedback, UserClarificationQuestion } from "./types.js";

const GENERIC_REQUEST_RE =
  /\b(better|cleaner|cooler|delightful|easier|improve|improved|nice|nicer|polish|simpler|smarter)\b/i;
const PROBLEM_RE = /\b(broken|bug|confusing|crash|crashed|error|issue|problem|stuck|wrong)\b/i;
const SPECIFIC_ACTION_RE =
  /\b(add|change|delete|due date|edit|filter|find|pin|rename|save|search|share|sort|theme|todo|upload)\b/i;
const CONTEXT_RE = /\b(after|before|during|on the|screen|page|settings|when|where|while)\b/i;

export function buildEndUserClarificationQuestions(
  input: Pick<SanitizedFeedback, "safeMetadata" | "sanitizedMessage">,
): UserClarificationQuestion[] {
  const message = input.sanitizedMessage.trim();
  const lowerMessage = message.toLowerCase();
  const wordCount = lowerMessage.split(/\s+/).filter(Boolean).length;
  const context = clarificationContextFromMetadata(input.safeMetadata);
  const appName = context.appName ?? "the app";
  const surface = context.surface ? ` on ${humanize(context.surface)}` : "";

  if (wordCount <= 3) {
    return [
      {
        id: "what_to_do",
        placeholder: exampleFor("what_to_do", context),
        question: `What are you trying to do in ${appName}${surface} when this comes up?`,
      },
      {
        id: "what_should_happen",
        placeholder: exampleFor("what_should_happen", context),
        question: "What would you expect to happen?",
      },
    ];
  }

  if (PROBLEM_RE.test(lowerMessage) && !CONTEXT_RE.test(lowerMessage)) {
    return [
      {
        id: "what_happened_before",
        placeholder: exampleFor("what_happened_before", context),
        question: `What were you doing in ${appName}${surface} right before this happened?`,
      },
      {
        id: "what_should_happen",
        placeholder: exampleFor("what_should_happen", context),
        question: "What did you expect to happen instead?",
      },
    ];
  }

  if (GENERIC_REQUEST_RE.test(lowerMessage) && !SPECIFIC_ACTION_RE.test(lowerMessage)) {
    return [
      {
        id: "where_it_matters",
        placeholder: exampleFor("where_it_matters", context),
        question: `Where in ${appName} would this help you most?`,
      },
      {
        id: "what_it_helps",
        placeholder: exampleFor("what_it_helps", context),
        question: "What would this make easier for you?",
      },
    ];
  }

  return [];
}

function clarificationContextFromMetadata(metadata: Record<string, unknown>): ClarificationContext {
  return {
    appName: stringFromMetadata(metadata.appName),
    existingFeatures: listFromMetadata(metadata.existingFeatures ?? metadata.featureInventory),
    productSummary: stringFromMetadata(metadata.productSummary),
    route: stringFromMetadata(metadata.route),
    surface: stringFromMetadata(metadata.surface),
  };
}

function exampleFor(kind: string, context: ClarificationContext): string {
  const contextText = `${context.productSummary ?? ""} ${context.surface ?? ""} ${(context.existingFeatures ?? []).join(" ")}`;
  if (context.appName === "Daybook" || /note|todo|task/i.test(contextText)) {
    if (kind === "what_to_do") return "Example: I want to find notes I wrote last week.";
    if (kind === "what_happened_before") return "Example: I tapped Save after editing a note.";
    if (kind === "where_it_matters") return "Example: On the notes list after I have a lot of notes.";
    if (kind === "what_it_helps") return "Example: It would help me quickly decide what to work on next.";
    return "Example: Show matching notes as I type.";
  }

  if (context.route) return `Example: This would help on ${context.route}.`;
  return "Example: A short real example from what you were trying to do.";
}

function humanize(value: string): string {
  return value.replace(/[-_]+/g, " ").trim();
}

function stringFromMetadata(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function listFromMetadata(value: unknown): string[] | undefined {
  if (Array.isArray(value)) {
    const items = value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
    return items.length ? items : undefined;
  }
  if (typeof value !== "string") return undefined;
  const items = value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return items.length ? items : undefined;
}
