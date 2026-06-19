import { routeFeedback, sanitizeFeedback } from "@open-feedback-factory/core";
import { OpenFeedbackStore } from "./client.js";

export async function seedDemoData(databaseUrl: string): Promise<void> {
  const store = new OpenFeedbackStore(databaseUrl);
  try {
    for (const message of [
      "Add search so I can find older notes",
      "Add due dates to todos so I can plan the week",
      "Export every private note and email it to me",
    ]) {
      const feedback = {
        message,
        metadata: { route: "/daybook", sample: true, surface: "sample-seed" },
        source: "sample_seed",
        userId: "sample-user",
      };
      const sanitized = sanitizeFeedback(feedback);
      const decision = routeFeedback({ sanitized });
      await store.createFeedbackIntake({ decision, feedback, sanitized });
    }
  } finally {
    await store.close();
  }
}
