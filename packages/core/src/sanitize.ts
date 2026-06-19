import type { FeedbackInput, SanitizedFeedback } from "./types.js";

const EMAIL_RE = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const PHONE_RE = /(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)\d{3}[-.\s]?\d{4}\b/g;
const OPENAI_KEY_RE = /\bsk-[A-Za-z0-9_-]{12,}\b/g;
const GENERIC_SECRET_RE =
  /\b(api[_-]?key|secret|token|password|private[_-]?key)\s*[:=]\s*["']?[^"'\s,;]+/gi;
const PRIVATE_KEY_RE = /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g;

const SAFE_METADATA_KEYS = new Set([
  "appName",
  "appVersion",
  "build",
  "existingFeatures",
  "featureId",
  "productSummary",
  "productVoice",
  "route",
  "segment",
  "surface",
  "url",
]);

export function sanitizeFeedback(input: FeedbackInput): SanitizedFeedback {
  const redactions = new Set<string>();
  let sanitizedMessage = input.message.trim();

  sanitizedMessage = sanitizedMessage.replace(PRIVATE_KEY_RE, () => {
    redactions.add("private_key");
    return "[redacted private key]";
  });

  sanitizedMessage = sanitizedMessage.replace(EMAIL_RE, () => {
    redactions.add("email");
    return "[redacted email]";
  });

  sanitizedMessage = sanitizedMessage.replace(PHONE_RE, () => {
    redactions.add("phone");
    return "[redacted phone]";
  });

  sanitizedMessage = sanitizedMessage.replace(OPENAI_KEY_RE, () => {
    redactions.add("api_key");
    return "[redacted api key]";
  });

  sanitizedMessage = sanitizedMessage.replace(GENERIC_SECRET_RE, (match) => {
    redactions.add("secret");
    return `${match.split(/[:=]/)[0]}=[redacted secret]`;
  });

  const safeMetadata: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input.metadata ?? {})) {
    if (SAFE_METADATA_KEYS.has(key) && isSafeMetadataValue(value)) {
      safeMetadata[key] = value;
      continue;
    }

    if (/screenshot|transcript|conversation|raw|secret|token|password/i.test(key)) {
      redactions.add(key.toLowerCase());
  }
}

function isSafeMetadataValue(value: unknown): value is boolean | number | string | string[] {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return true;
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

  const privacyRisk = privacyRiskFor([...redactions], sanitizedMessage);

  return {
    privacyRisk,
    redactions: [...redactions].sort(),
    safeMetadata,
    sanitizedMessage: sanitizedMessage || "[empty feedback]",
  };
}

function privacyRiskFor(redactions: string[], sanitizedMessage: string): SanitizedFeedback["privacyRisk"] {
  if (redactions.some((item) => ["api_key", "private_key", "secret"].includes(item))) {
    return "blocked";
  }

  if (/delete\s+(all\s+)?(user|customer|account)|export\s+.*(private|conversation|email)/i.test(sanitizedMessage)) {
    return "high";
  }

  if (redactions.length > 0) return "medium";
  return "low";
}
