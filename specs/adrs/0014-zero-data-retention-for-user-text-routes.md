# ADR 0014 — Zero Data Retention for user-text model routes

- **Status:** superseded by [ADR 0029](0029-direct-anthropic-provider-for-ask.md) on 2026-11-13
- **Date:** 2026-10-10
- **Extends:** ADR 0009
- **Accepted by:** the agent on the owner's behalf, 2026-10-10

## Context

ADR 0009 requires Zero Data Retention for calls through Vercel AI Gateway and forbids fallback to a
less private route. The product contract is broader: every external model route that receives user
text must prove that guarantee, fail closed when it cannot and keep the primary language model
behind the gateway until a direct provider route proves equivalent protection.

A route cannot discover that it lacks the guarantee only after transmission because the privacy
failure would already have occurred. The system therefore needs an eligibility rule that applies
before provider selection and remains invariant across retries, circuit-breaker transitions and
fallback.

## Decision

### Scope and evidence

- The policy applies to every external AI call whose payload contains user-authored text or text
  derived from it, including intent decisions, explanations and future model capabilities.
- A route is eligible only when its adapter has current, machine-verifiable evidence that the
  provider and route support Zero Data Retention and can enforce it for the request. Contractual or
  marketing language alone is not runtime evidence.
- Evidence records the provider, route, policy version or capability identifier and verification
  time. It contains no user text, prompt, response, credential or authorization data.
- Eligibility is checked before user text leaves the process. The outbound request also carries the
  provider-specific Zero Data Retention control. Through Vercel AI Gateway that control is
  `zeroDataRetention: true`.
- Missing, expired, contradictory or unacknowledged evidence maps to a closed, forbidden-by-policy
  failure. The call is not sent, retried or counted as a transient provider failure.

### Routing and fallback

- Claude Haiku 5.5 remains the primary language model through Vercel AI Gateway while that route
  provides verified Zero Data Retention.
- A direct provider route stays disabled for user text until it supplies the same pre-transmission
  evidence and per-request enforcement. Enabling it is an operational configuration change backed
  by recorded evidence, not an automatic fallback.
- The secondary model is eligible only through a route that passes the same checks. Provider
  selection, retry and fallback operate on the eligible route set; they never weaken the policy.
- If a generative call has no eligible route and no non-transmitting local fallback, the run fails
  explicitly with the sanitized policy failure. It does not send the text, improvise an answer or
  fall back to a route with weaker retention.
- The deterministic local routing heuristic remains available because it sends text to no external
  provider. An ineligible Jev route may therefore degrade to this heuristic; its degraded result and
  the confidence gate of ADR 0008 still apply.

### Verification and observability

- Adapter contract tests must prove that a verified route sends the provider-specific control and
  that every absent or invalid evidence state prevents transmission.
- Fallback tests must prove that an ineligible external route is never attempted, that an ineligible
  Jev route degrades to the deterministic heuristic and that a call with neither an eligible route
  nor a permitted local fallback produces the typed policy failure.
- Traces and metrics may record the route, evidence identifier, verification age and sanitized
  failure class. They never record user text, prompts, responses, keys or credentials.

## Consequences

Availability is intentionally lower when a provider cannot prove the privacy guarantee. Route
configuration needs evidence lifecycle and adapter tests, but retries and fallback cannot silently
trade privacy for availability or cost. A direct provider integration requires proof before it can
receive user text.

## Reassessment trigger

Reassess the evidence mechanism when a provider or gateway offers a stronger verifiable retention
attestation. Replacing the gateway-first route requires an ADR that identifies equivalent evidence
and preserves the pre-transmission, fail-closed and no-weaker-fallback invariants.
