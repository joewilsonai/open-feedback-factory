import type { FeatureCostEstimate, WorkRiskTier } from "./types.js";

const DEFAULT_MODEL = "gpt-5.5";

export function estimateFeatureCost(input: {
  model?: string;
  riskTier: WorkRiskTier;
  signalCount?: number;
}): FeatureCostEstimate {
  const baseByTier: Record<WorkRiskTier, number> = {
    extra_review: 8.5,
    guarded_review: 4.25,
    plan_only: 0.75,
    safe_auto_merge: 1.5,
  };

  const multiplier = Math.min(1.4, 1 + Math.max(0, (input.signalCount ?? 1) - 1) * 0.05);
  const amountUsd = Number((baseByTier[input.riskTier] * multiplier).toFixed(2));

  return {
    amountUsd,
    confidence: "low",
    currency: "USD",
    model: input.model ?? DEFAULT_MODEL,
    reason: `Default V1 estimate for ${input.riskTier} using ${input.model ?? DEFAULT_MODEL}`,
  };
}
