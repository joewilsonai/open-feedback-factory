import type { CostBudgetPolicy, CostBudgetUsage, WorkItemRow } from "@open-feedback-factory/db";
import type { ApiConfig } from "./config.js";

export type CostBudgetBlockReason =
  | "cost_cap_exceeded"
  | "daily_cost_cap_exceeded"
  | "monthly_cost_cap_exceeded"
  | "token_cap_exceeded";

export interface CostBudgetBlock {
  error: string;
  reason: CostBudgetBlockReason;
}

export function defaultCostBudget(config: ApiConfig): CostBudgetPolicy {
  return {
    maxDailyCostUsd: positiveNumber(config.maxDailyCostUsd, 25),
    maxFeatureCostUsd: positiveNumber(config.maxFeatureCostUsd, 5),
    maxMonthlyCostUsd: positiveNumber(config.maxMonthlyCostUsd, 100),
    maxTokensPerRun: Math.round(positiveNumber(config.maxTokensPerRun, 250_000)),
  };
}

export function normalizeCostBudget(input: Record<string, unknown>, fallback: CostBudgetPolicy): CostBudgetPolicy | null {
  const policy = {
    maxDailyCostUsd: numberFromInput(input.maxDailyCostUsd, fallback.maxDailyCostUsd),
    maxFeatureCostUsd: numberFromInput(input.maxFeatureCostUsd, fallback.maxFeatureCostUsd),
    maxMonthlyCostUsd: numberFromInput(input.maxMonthlyCostUsd, fallback.maxMonthlyCostUsd),
    maxTokensPerRun: numberFromInput(input.maxTokensPerRun, fallback.maxTokensPerRun),
  };

  if (
    policy.maxDailyCostUsd === null ||
    policy.maxFeatureCostUsd === null ||
    policy.maxMonthlyCostUsd === null ||
    policy.maxTokensPerRun === null
  ) {
    return null;
  }

  return {
    maxDailyCostUsd: roundCurrency(policy.maxDailyCostUsd),
    maxFeatureCostUsd: roundCurrency(policy.maxFeatureCostUsd),
    maxMonthlyCostUsd: roundCurrency(policy.maxMonthlyCostUsd),
    maxTokensPerRun: Math.round(policy.maxTokensPerRun),
  };
}

export function evaluateCostBudget(
  workItem: WorkItemRow,
  budget: CostBudgetPolicy,
  usage: CostBudgetUsage,
): CostBudgetBlock | null {
  const estimateUsd = workItem.costEstimate.amountUsd;
  if (estimateUsd > budget.maxFeatureCostUsd) {
    return { error: "cost cap exceeded", reason: "cost_cap_exceeded" };
  }

  if (usage.todayActualUsd + estimateUsd > budget.maxDailyCostUsd) {
    return { error: "daily cost cap exceeded", reason: "daily_cost_cap_exceeded" };
  }

  if (usage.monthActualUsd + estimateUsd > budget.maxMonthlyCostUsd) {
    return { error: "monthly cost cap exceeded", reason: "monthly_cost_cap_exceeded" };
  }

  const estimatedTokens = estimatedTokensForWorkItem(workItem);
  if (estimatedTokens !== null && estimatedTokens > budget.maxTokensPerRun) {
    return { error: "token cap exceeded", reason: "token_cap_exceeded" };
  }

  return null;
}

export function remainingClaimCapUsd(budget: CostBudgetPolicy, usage: CostBudgetUsage): number {
  return Math.max(
    0,
    Math.min(
      budget.maxFeatureCostUsd,
      budget.maxDailyCostUsd - usage.todayActualUsd,
      budget.maxMonthlyCostUsd - usage.monthActualUsd,
    ),
  );
}

function estimatedTokensForWorkItem(workItem: WorkItemRow): number | null {
  const estimate = workItem.costEstimate as typeof workItem.costEstimate & { tokens?: unknown };
  const tokens = typeof estimate.tokens === "number" ? estimate.tokens : Number(estimate.tokens);
  if (!Number.isFinite(tokens) || tokens < 0) return null;
  return Math.round(tokens);
}

function numberFromInput(value: unknown, fallback: number): number | null {
  if (value === undefined) return fallback;
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number) || number <= 0 || number > 10_000_000) return null;
  return number;
}

function positiveNumber(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}
