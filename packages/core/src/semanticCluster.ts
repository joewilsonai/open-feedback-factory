import { deterministicCluster } from "./cluster.js";
import { isProtectedAreaMessage } from "./router.js";
import type { SanitizedFeedback } from "./types.js";

/**
 * A canonical intent inferred from a single piece of (already sanitized)
 * feedback. `clusterKey` is the grouping key; `title` is an optional
 * human-readable label for the cluster.
 */
export interface IntentClassification {
  clusterKey: string;
  title?: string;
}

/**
 * An intent cluster that already exists, passed to the classifier so it can
 * REUSE a matching one instead of minting a near-duplicate sibling intent.
 */
export interface ExistingCluster {
  clusterKey: string;
  title?: string;
}

/**
 * Swappable semantic-clustering backend. Implementations turn a sanitized
 * feedback message into a canonical intent so that paraphrases of the same
 * request ("send me a watering reminder" / "push notifications for watering")
 * collapse into one cluster instead of scattering across the brittle
 * first-N-words fallback.
 *
 * Contract:
 *  - Receives ONLY the sanitized message text. Raw feedback never reaches it.
 *  - Returns `null` when it cannot confidently classify (the caller then keeps
 *    the deterministic key). Implementations must NOT throw for the normal
 *    "no answer" case, but {@link resolveClusterKey} also defends against
 *    thrown errors and timeouts so intake never breaks on a model hiccup.
 */
export interface IntentClassifier {
  classify(
    sanitizedMessage: string,
    existingClusters?: ExistingCluster[],
  ): Promise<IntentClassification | null>;
}

export type ClusterSource = "deterministic" | "semantic";

export interface ResolvedCluster {
  clusterKey: string;
  /** Present only when a semantic classifier supplied a canonical title. */
  title?: string;
  source: ClusterSource;
  /** Whether the deterministic layer considered its key high-confidence. */
  precise: boolean;
}

export interface ResolveClusterKeyOptions {
  classifier?: IntentClassifier;
  /**
   * Lazily loads the existing intent clusters to offer the classifier for
   * reuse. Called ONLY when the classifier is about to run (generic-fallback,
   * eligible feedback) so dedicated buckets never pay for the lookup. Loader
   * errors are swallowed — the classifier just runs without reuse context.
   */
  getExistingClusters?: () => Promise<ExistingCluster[]>;
  /**
   * Hard cap (ms) on the classifier call. Owned by the seam — not the
   * implementation — so a misbehaving classifier that never settles can never
   * hang intake. Defaults to {@link DEFAULT_RESOLVE_TIMEOUT_MS}.
   */
  timeoutMs?: number;
}

const SEMANTIC_PREFIX = "feature.intent.";
const MAX_KEY_SLUG_LENGTH = 64;
export const DEFAULT_RESOLVE_TIMEOUT_MS = 5000;

/**
 * Resolve the cluster key for a piece of sanitized feedback.
 *
 * Order of precedence:
 *  1. Deterministic dedicated buckets (dark-mode, crash, daybook, copy, …) win
 *     outright — they are high precision, free, and instant. No model call.
 *  2. For the brittle generic fallback only, ask the injected classifier for a
 *     canonical intent. Use it when valid; otherwise keep the deterministic key.
 *
 * Privacy: the classifier is never called for `blocked` feedback, and only ever
 * receives `sanitized.sanitizedMessage`.
 *
 * Safety: any classifier error, timeout, or malformed answer falls back to the
 * deterministic key. This function never throws on classifier failure.
 */
export async function resolveClusterKey(
  sanitized: Pick<SanitizedFeedback, "sanitizedMessage" | "privacyRisk">,
  options: ResolveClusterKeyOptions = {},
): Promise<ResolvedCluster> {
  const deterministic = deterministicCluster(sanitized);
  const base: ResolvedCluster = {
    clusterKey: deterministic.clusterKey,
    source: "deterministic",
    precise: deterministic.precise,
  };

  const { classifier } = options;
  // Eligibility: only the brittle generic fallback path, and never for content
  // that must not reach an external model. The model is an agent-like boundary,
  // so anything the router would block from agents — blocked/high privacy risk
  // or a protected product area (auth/billing/privacy/legal/encryption/bulk
  // delete) — is kept on the deterministic path.
  const ineligible =
    !classifier ||
    deterministic.precise ||
    sanitized.privacyRisk === "blocked" ||
    sanitized.privacyRisk === "high" ||
    isProtectedAreaMessage(sanitized.sanitizedMessage);
  if (ineligible) {
    return base;
  }

  // Offer existing intents so the classifier reuses a match instead of minting
  // a near-duplicate sibling. Loaded lazily and defensively — a failed lookup
  // just means classifying without reuse context, never a broken intake.
  let existingClusters: ExistingCluster[] = [];
  if (options.getExistingClusters) {
    try {
      existingClusters = await options.getExistingClusters();
    } catch {
      existingClusters = [];
    }
  }

  let classification: IntentClassification | null = null;
  try {
    classification = await withTimeout(
      classifier.classify(sanitized.sanitizedMessage, existingClusters),
      options.timeoutMs ?? DEFAULT_RESOLVE_TIMEOUT_MS,
    );
  } catch {
    // Thrown error, rejection, or timeout — keep the deterministic key.
    return base;
  }

  if (!classification) {
    return base;
  }

  const slug = normalizeIntentSlug(classification.clusterKey);
  if (!slug) {
    return base;
  }

  return {
    clusterKey: `${SEMANTIC_PREFIX}${slug}`,
    title: normalizeTitle(classification.title),
    source: "semantic",
    precise: deterministic.precise,
  };
}

/**
 * Turn an arbitrary model-supplied key into a safe, stable slug. Model output
 * is untrusted: lowercase, strip to `[a-z0-9-]`, collapse separators, and cap
 * length so a clusterKey can never be unbounded or injection-shaped. Returns
 * `null` when nothing usable remains.
 */
export function normalizeIntentSlug(raw: string | undefined | null): string | null {
  if (typeof raw !== "string") {
    return null;
  }
  let slug = raw.toLowerCase().trim();
  // Drop a leading namespace the model may have echoed back (e.g. "feature.intent.dark-mode").
  slug = slug.replace(/^(feature\.intent\.|feature\.|feedback\.)/, "");
  slug = slug.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  if (!slug) {
    return null;
  }
  return slug.slice(0, MAX_KEY_SLUG_LENGTH).replace(/-+$/g, "");
}

function normalizeTitle(raw: string | undefined): string | undefined {
  if (typeof raw !== "string") {
    return undefined;
  }
  const title = raw.trim().replace(/\s+/g, " ").slice(0, 120);
  return title.length ? title : undefined;
}

/**
 * Race a promise against a timeout that rejects. Guarantees the seam returns
 * even if a classifier implementation never settles — the caller's catch then
 * falls back to the deterministic key. A non-positive timeout disables the cap.
 */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  if (!(ms > 0)) {
    return promise;
  }
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("intent classifier timed out")), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}
