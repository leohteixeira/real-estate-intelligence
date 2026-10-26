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

## Durable confirmation (D-100, 2026-10-26)

The routed-text mode is versioned separately from the three historical price tracers. Its
API-owned decision receipt survives graph retries and service restarts. Confidence means the
probability assigned to the chosen intent, not a separate provider confidence statistic. A
missing or invalid probability distribution is not permission to execute. Jev remains confined
to the Gateway with verified ZDR acknowledgement before transmitting user-derived content;
unavailability uses the deterministic degraded classifier under the same gate.

A visitor may confirm the retained proposal without another decision call. Editable numeric
operands must pass Market's deterministic validation and remain distinguishable from original
inputs. Changing the query or proposed intent requires a new run. Refusal terminates the same
run as `cancelled` with reason `visitor_cancelled`, without a tool or generative call.

The first persisted pause starts a fixed ten-minute confirmation deadline, measured and enforced
by PostgreSQL. Reading, redelivery and duplicate commands never renew it. At or after that
deadline confirmation cannot authorize execution: the run becomes `expired` with reason
`confirmation_expired`. This is independent of the existing two-minute queued-run deadline.
Awaiting confirmation remains pending and blocks later runs in its thread. Confirmation,
refusal and expiry share the existing thread lock and execution fences.

Story 5.4 proves routing and confirmation through the real application composition. Generic
public command handlers and the headless client remain story 5.8. Until story 5.5 supplies typed
unavailable results, recognized intents without an executor retain their label and terminate
with the existing `execution_unavailable` failure; they never invoke the price tool or generate
an answer. Missing price operands likewise cannot authorize a calculation.

The adapter uses the installed SDK's typed decision/evaluation API with one transport attempt
(`maxRetries: 0`), respecting application-owned resilience and cancellation. Provider contracts:
[AI SDK decisions](https://ai-sdk.dev/docs/ai-sdk-core/decisions),
[Gateway decision modality](https://vercel.com/docs/ai-gateway/modalities/decision) and
[Gateway ZDR](https://vercel.com/docs/ai-gateway/security-and-compliance/zdr).

The installed Gateway evaluation alias accepts string state while the AI SDK normalizes typed
text parts. The implementation uses a typed, text-only `doDecide` bridge to `doEvaluate`, verified
against the real pinned SDKs with offline HTTP interception. It rejects provider warnings before
SDK warning logging. Receipt acceptance precedes graph decision persistence; a saved interrupt
cannot resume until the API retains confirmation, including recovery after a pre-dispatch crash.

## Reassessment trigger

Reassess Jev if the labeled dataset shows that the heuristic is equally accurate at materially
lower operational cost, or if the gateway can no longer enforce the required privacy policy.
