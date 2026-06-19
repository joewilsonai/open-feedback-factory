const apiBaseUrl = process.env.VITE_API_BASE_URL ?? "http://localhost:4100";

const feedback = [
  "Please add dark mode to settings",
  "Please export private conversations and email them to me",
  "Make the dashboard more delightful",
];

for (const message of feedback) {
  const response = await fetch(`${apiBaseUrl}/sdk/feedback`, {
    body: JSON.stringify({
      message,
      metadata: {
        appVersion: "0.1.0",
        route: "/demo-seed",
        surface: "demo-seed",
      },
      source: "demo_seed",
      userId: "demo-user",
    }),
    headers: {
      "content-type": "application/json",
    },
    method: "POST",
  });

  if (!response.ok) {
    throw new Error(`Seed failed for "${message}": ${response.status} ${await response.text()}`);
  }

  const body = await response.json();
  console.log(`${body.feedbackId}: ${body.status.label} (${body.workItemId ?? "no work item"})`);
}

const usage = await fetch(`${apiBaseUrl}/sdk/features/dark-mode/usage`, {
  body: JSON.stringify({
    action: "enabled",
    metadata: {
      source: "demo-seed",
    },
    userId: "demo-user",
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
