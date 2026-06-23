# Changelog

Open Feedback Factory has not made a public release yet.

## Unreleased

- Private dogfood alpha.
- Public npm package: `@open-feedback-factory/sdk@0.1.0`.
- Hosted private stack and Sprout demo path in progress.
- Semantic clustering for the intake path: paraphrased requests for the same
  feature group by canonical intent (Sonnet classifier) instead of brittle
  keyword matching, behind a swappable `IntentClassifier` seam. Hybrid —
  deterministic dedicated buckets stay free/instant; only the sanitized generic
  fallback consults the model; blocked/high-risk/protected-area feedback is
  never sent; model errors fall back to deterministic. Context-aware: the
  classifier is shown existing intents and reuses a match instead of minting a
  near-duplicate sibling. Off until `ANTHROPIC_API_KEY` is set.

Public release notes should only describe shipped, verified behavior. Do not
list merged PRs as shipped until release proof exists.
