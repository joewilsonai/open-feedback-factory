import type { WorkItemRow } from "@open-feedback-factory/db";
import type { RunnerResult, WorkRunner } from "./types.js";

export class DemoRunner implements WorkRunner {
  async run(workItem: WorkItemRow): Promise<RunnerResult> {
    return {
      branchName: `off/demo/${workItem.id}`,
      changedFiles: ["apps/demo-app/src/styles.css"],
      costActual: {
        amountUsd: Math.min(1.25, workItem.costEstimate.amountUsd),
        confidence: "low",
        model: workItem.costEstimate.model,
      },
      output: JSON.stringify({
        outcome: "implemented",
        workItemId: workItem.id,
      }),
      status: "succeeded",
      summary: `Demo runner completed "${workItem.title}" with a deterministic safe-lane result.`,
    };
  }
}
