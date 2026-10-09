# ADR 0008 — Typed query routing with Jev

- **Status:** accepted
- **Date:** 2026-10-09

## Context

Natural-language requests must be routed to deterministic real-estate capabilities. Free-form LLM
routing can silently select the wrong operation, and provider outages must not erase the product's
ability to recognize simple requests. The existing deterministic capability is price per square
meter.

## Decision

- Application code owns a typed decision port. A Jev adapter using `typesafe-ai/jev` through the
  Vercel AI Gateway is the primary implementation; a deterministic heuristic is the fallback.
- The initial taxonomy is `price_per_square_meter`, `listing_search`, `property_history`,
  `region_statistics`, `comparables` and `unsupported`.
- Only `price_per_square_meter` is executable in the first slice. Other recognized intents return a
  typed unavailable result instead of a model-generated answer.
- A chosen-intent probability of **0.85 or greater** may proceed. A lower probability pauses the
  graph for clarification or explicit user confirmation. Confirmation may resume the proposed
  intent without another Jev call.
- Heuristic results are marked degraded and use the same confidence gate. A degraded flag alone
  neither authorizes execution nor forces a second review rule.
- Jev decides labels only. Numbers, dates, units, money normalization and market calculations stay
  in deterministic code. The generative model explains tool results; it does not reproduce them.

## Consequences

Routing is typed, testable and auditable. Provider failure can degrade to a known heuristic, while
ambiguous requests still require the user. Adding an intent to the taxonomy does not make it
executable until a typed backend capability exists.

ADR 0004's trigger is now met: the decision adapter and heuristic must land with a versioned,
offline evaluation dataset and an opt-in live probe.

## Reassessment trigger

Reassess Jev if the labeled dataset shows that the heuristic is equally accurate at materially
lower operational cost, or if the gateway can no longer enforce the required privacy policy.
