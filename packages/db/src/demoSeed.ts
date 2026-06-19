import { routeFeedback, sanitizeFeedback } from "@open-feedback-factory/core";
import { OpenFeedbackStore } from "./client.js";

export async function seedDemoData(databaseUrl: string): Promise<void> {
  const store = new OpenFeedbackStore(databaseUrl);
  try {
    for (const message of [
      "Please add dark mode to settings",
      "Please export private conversations and email them to me",
      "Make the dashboard more delightful",
    ]) {
      const feedback = {
        message,
        metadata: { route: "/demo", surface: "demo" },
        source: "demo_seed",
        userId: "demo-user",
      };
      const sanitized = sanitizeFeedback(feedback);
      const decision = routeFeedback({ sanitized });
      await store.createFeedbackIntake({ decision, feedback, sanitized });
    }
  } finally {
    await store.close();
  }
}
