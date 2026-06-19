const apiBaseUrl = process.env.VITE_API_BASE_URL ?? "http://localhost:4100";

const sampleSource = "sample_seed";
const sampleUserId = "sample-user";
const sampleRequests = [
  {
    expectedTitle: "Add note search",
    message: "Add search so I can find older notes",
  },
  {
    expectedTitle: "Add due dates to todos",
    message: "Add due dates to todos so I can plan the week",
  },
  {
    expectedTitle: null,
    message: "Export every private note and email it to me",
  },
];

console.log(
  "Seeding sample Daybook feedback. This creates real feedback records only; it never fabricates PRs, costs, agent runs, releases, or shipped states.",
);

const snapshot = await readControlRoomSnapshot();
const existingTitles = new Set((snapshot?.workItems ?? []).map((item) => item.title).filter(Boolean));
const existingFeedback = new Set(
  (snapshot?.recentFeedback ?? [])
    .map((item) => item.sanitizedSummary ?? item.sanitized_summary ?? item.sanitizedMessage ?? item.message)
    .filter(Boolean),
);

for (const request of sampleRequests) {
  if (
    (request.expectedTitle && existingTitles.has(request.expectedTitle)) ||
    existingFeedback.has(request.message)
  ) {
    console.log(`skipped existing sample: ${request.message}`);
    continue;
  }

  const response = await fetch(`${apiBaseUrl}/sdk/feedback`, {
    body: JSON.stringify({
      message: request.message,
      metadata: {
        appVersion: "0.2.0",
        route: "/daybook",
        sample: true,
        surface: "sample-seed",
      },
      source: sampleSource,
      userId: sampleUserId,
    }),
    headers: {
      "content-type": "application/json",
    },
    method: "POST",
  });

  if (!response.ok) {
    throw new Error(`Seed failed for "${request.message}": ${response.status} ${await response.text()}`);
  }

  const body = await response.json();
  console.log(`${body.feedbackId}: ${body.status.label} (${body.workItemId ?? "no work item"})`);
}

const usage = await fetch(`${apiBaseUrl}/sdk/features/todo-item/usage`, {
  body: JSON.stringify({
    action: "created",
    metadata: {
      sample: true,
      source: "sample-seed",
    },
    userId: sampleUserId,
  }),
  headers: {
    "content-type": "application/json",
  },
  method: "POST",
});

if (!usage.ok) {
  throw new Error(`Usage seed failed: ${usage.status} ${await usage.text()}`);
}

console.log(`usage: ${(await usage.json()).usageId}`);

async function readControlRoomSnapshot() {
  try {
    const response = await fetch(`${apiBaseUrl}/admin/control-room`);
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}
