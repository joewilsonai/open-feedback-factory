# Open Feedback Factory SDK

Browser SDK for collecting in-app feedback, tracking feature usage, and showing
request status back to the user without giving them access to the operator
control center.

The package is available on public npm as `@open-feedback-factory/sdk`.

## Install

```bash
pnpm add @open-feedback-factory/sdk
```

## Basic Client

```ts
import { createOpenFeedbackClient } from "@open-feedback-factory/sdk";

const feedback = createOpenFeedbackClient({
  apiBaseUrl: "https://api.openfeedbackfactory.com",
  metadata: {
    appVersion: "1.0.0",
    platform: "web",
  },
  userId: "user_123",
});

await feedback.submitFeedback({
  message: "Please add a humidity tracker for my plants.",
  source: "sprout_web",
});
```

## Floating Suggestion Launcher

```ts
import {
  createOpenFeedbackClient,
  mountFeedbackLauncher,
} from "@open-feedback-factory/sdk";

const client = createOpenFeedbackClient({
  apiBaseUrl: "https://api.openfeedbackfactory.com",
  userId: "user_123",
});

const launcher = mountFeedbackLauncher({
  client,
  title: "Suggest an improvement",
  description: "Tell us what would make this app better.",
  suggestions: [
    {
      label: "Add humidity tracking",
      message: "I want to track humidity for each plant.",
    },
  ],
});

// Later, if your app unmounts the surface:
launcher.destroy();
```

The launcher:

- submits feedback through the same privacy-safe SDK endpoint;
- stores the latest request id in browser storage when available;
- shows user-safe status inside the widget;
- polls status while the widget is open;
- asks plain-language follow-up questions when the backend needs clarification.

## Feature Usage

```ts
await feedback.trackFeatureUsage({
  featureId: "humidity-tracker",
  action: "opened",
  metadata: {
    route: "/plants/calathea",
  },
});
```

Feature usage lets Open Feedback Factory connect shipped work to real adoption.

## Privacy Defaults

The client filters metadata keys that look like raw transcripts, screenshots,
passwords, tokens, or secrets. Only primitive metadata values are sent.

Do not place private user content, credentials, API keys, database URLs, or raw
debug logs in SDK metadata.

## Publishing

This package is published manually. Do not add automatic publish workflows
without an explicit release-process decision.
