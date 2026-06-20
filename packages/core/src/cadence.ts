export type WorkCadenceInterval = "daily" | "monthly" | "weekly";
export type WorkCadenceMode = "immediate" | "scheduled" | "threshold";

export interface WorkCadencePolicy {
  hourUtc: number;
  interval: WorkCadenceInterval;
  mode: WorkCadenceMode;
  scheduledDayOfMonth: number;
  scheduledDayOfWeek: number;
  threshold: number;
}

export type WorkCadencePolicyInput = Partial<WorkCadencePolicy>;

export const DEFAULT_WORK_CADENCE_POLICY: WorkCadencePolicy = {
  hourUtc: 9,
  interval: "weekly",
  mode: "immediate",
  scheduledDayOfMonth: 1,
  scheduledDayOfWeek: 1,
  threshold: 2,
};

export function normalizeWorkCadencePolicy(input: WorkCadencePolicyInput = {}): WorkCadencePolicy {
  return {
    hourUtc: clampInteger(input.hourUtc, 0, 23, DEFAULT_WORK_CADENCE_POLICY.hourUtc),
    interval: workCadenceIntervalFromValue(input.interval),
    mode: workCadenceModeFromValue(input.mode),
    scheduledDayOfMonth: clampInteger(input.scheduledDayOfMonth, 1, 31, DEFAULT_WORK_CADENCE_POLICY.scheduledDayOfMonth),
    scheduledDayOfWeek: clampInteger(input.scheduledDayOfWeek, 0, 6, DEFAULT_WORK_CADENCE_POLICY.scheduledDayOfWeek),
    threshold: clampInteger(input.threshold, 1, 1000, DEFAULT_WORK_CADENCE_POLICY.threshold),
  };
}

export function thresholdCadenceNeedsMoreSignal(policy: WorkCadencePolicy, signalCount: number): boolean {
  return policy.mode === "threshold" && signalCount < policy.threshold;
}

export function isWorkCadenceClaimWindowOpen(policy: WorkCadencePolicy, now = new Date()): boolean {
  if (policy.mode !== "scheduled") return true;
  if (now.getUTCHours() !== policy.hourUtc) return false;
  if (policy.interval === "daily") return true;
  if (policy.interval === "weekly") return now.getUTCDay() === policy.scheduledDayOfWeek;
  return now.getUTCDate() === policy.scheduledDayOfMonth;
}

function workCadenceModeFromValue(value: unknown): WorkCadenceMode {
  if (value === "scheduled" || value === "threshold") return value;
  return "immediate";
}

function workCadenceIntervalFromValue(value: unknown): WorkCadenceInterval {
  if (value === "daily" || value === "monthly") return value;
  return "weekly";
}

function clampInteger(value: unknown, min: number, max: number, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(parsed)));
}
