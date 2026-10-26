# ADR 0027 — Receipt-bound model explanations

- **Status:** Accepted
- **Date:** 2026-10-12
- **Extends:** ADRs 0008, 0009, 0014, 0025 and 0026
- **Accepted by:** the agent on the owner's behalf, 2026-10-12 (D-050)

## Context

Ask currently executes deterministic structured/text price tracers. Their two-node evidence and
`price-v1` checkpoints are historical contracts, not an unfinished generative graph. CAP-10 now
requires an explanation behind `LanguageModel`, limited to the current tool result, with primary
then secondary gateway routing and explicit model-written provenance. Prompt instructions and
numeric substring checks cannot prove that unrestricted prose contains no unsupported claim.

There is no runtime ZDR verifier. A configured boolean, public model catalogue or marketing
statement cannot be substituted for ADR 0014's pre-transmission evidence. Generated-token limits
also need to survive retries and execution recovery, not reset with an AI process.

## Decision

### Versioned admission and evidence

Add explicit `text-price-explanation-v1` admission and public basis, with
`price-explanation-v1` checkpoint partitions. Its graph runs validated inputs, the existing
Market price tool, and model explanation. Keep old modes and `price-v1` behavior unchanged.
Bind checkpoint version to the API-authorized retained basis; no cross-version saver access.

The public explanation is separate from the deterministic result. It carries `model-written`,
prompt/grammar version, model and route, bounded usage metadata, and stable run/event/thread and
Market receipt provenance. It exists only on a completed explained run. API completion validates
it against its authoritative retained receipt before committing the terminal, SSE, outbox and
inbox. Execution reclaims may rebind authority, never change evidence or reinterpret old state.

Migrations are additive. Preserve existing documents, events, receipts, fingerprints and
checkpoint bytes, as well as FIFO, expiry, eight-terminal-turn and 30-day retention guarantees.

### Restricted factual language

Give the model only the current canonical tool receipt's facts and locale, with versioned
instructions. Do not send the question, previous turns, authority or unrelated data. Accept only
the complete model-returned text in a versioned PT/EN equality-assertion grammar: asking price,
area, and asking price per square meter. Require the computed value, match every admitted fact
and canonical locale rendering against the receipt, and reject all other prose. The grammar may
offer wording and ordering variations; it is not an unrestricted semantic verifier.

Reject different numbers, currencies, units, undocumented rounding, unrecognized spelled-out
numbers, comparisons, forecasts, opinions and external facts. Do not repair an invalid response
with fabricated model-written text. AI validates before submission and API validates again
against stored evidence. Money remains calculated and formatted deterministically outside the
provider adapter. The model never invokes tools or changes original inputs.

### Persistent bounds and recovery

Before each generation attempt, reserve its maximum output tokens in API-owned Ask persistence.
The total per run, including fixed public capability probes, retries and fallback, is at most
1,000. An uncertain attempt keeps its reservation; process restart does not replenish budget.
Named policies bound attempts, deadline, concurrency and output. User input remains capped at
16,000 characters without silent truncation. Explanation uses one graph node, not a recursive
agent or earlier runs' history. Eight turns continues to describe checkpoint retention.

Persist an accepted explanation receipt before acknowledging the graph step. Recover that
receipt across a lost checkpoint acknowledgement or final commit without accepting a second
explanation or recalculating Market. Stable binding uses run and tool receipt identity, not only
the replaceable execution ID. There is no claim of exactly-once network transmission: a crashed
uncertain attempt may consume another bounded reservation, but cannot reset the run budget.

### Gateway-only verified privacy

Default primary is `anthropic/claude-haiku-5.5`; secondary is
`deepseek/deepseek-v4-flash-0731`. Keep provider SDKs inside AI adapters, never in canonical types.
Direct Anthropic remains disabled. Adapters make one attempt with SDK retries disabled; named
`@nestjs/resilience` policies own fallback, bulkhead, breaker, retry, limiter and timeout.

Obtain evidence through an authenticated gateway capability probe containing only a fixed
public string, before any user-derived facts are sent. The probe requests
`providerOptions.gateway.zeroDataRetention: true`. Require the documented gateway routing
acknowledgement, not generated text, bind it to the requested model and fixed gateway route,
and expire it after a short named interval. Every subsequent request carries the same control.
Missing, stale, contradictory or unacknowledged evidence refuses transmission. Changed gateway
metadata fails closed; catalogue membership or a configuration flag does not approve a route.

Policy failure and caller cancellation have no retry or fallback and do not count as transient
provider failure. Only eligible routes participate in transient retry/fallback, within the same
remaining deadline and persistent budget. No requested caching, provider tools or payload
telemetry. Trace only bounded identifiers, route, evidence age, usage and sanitized categories.

Automated tests substitute scripted models and gateway acknowledgements only through explicit
fixture composition. Production defaults never use a synthetic model or synthetic evidence.
This story makes no real model calls; runtime may honestly refuse until evidence is obtained.

## Alternatives and consequences

Mutating old graphs would corrupt historical meaning. Free prose plus numeric filtering permits
unsupported qualitative claims. A static ZDR flag cannot prove request enforcement. The chosen
closed factual language is intentionally less expressive, while providing deterministic,
testable truth guarantees. Conservative reservations may reduce availability after interruption.
Capability probes add bounded cost and depend on acknowledged gateway metadata; changing that
contract requires an explicit verifier update, not a privacy bypass.

This increment does not deliver Jev routing/confirmation, daily quotas, the general evaluation
pack, UI or VPS deployment. Vitest/TypeScript integration, explicit SQL and the established
facade/port layout take precedence over incompatible Nest skill stack examples (D-012/ADR 0020).

## External protocol evidence

The [gateway ZDR documentation](https://vercel.com/docs/ai-gateway/security-and-compliance/zdr)
documents request enforcement and successful routing acknowledgement. The
[gateway SDK reference](https://ai-sdk.dev/providers/ai-sdk-providers/ai-gateway) documents the
provider option and gateway factory. The
[REST catalogue reference](https://vercel.com/docs/ai-gateway/sdks-and-apis/rest-api) does not
document a catalogue ZDR attestation. Using a fixed public probe for pre-user eligibility is
our engineering inference from these interfaces, not a provider guarantee of a new attestation API.

## Reassessment triggers

Expand factual language through a new version and offline fidelity cases. Prefer a stronger
structured pre-transmission provider attestation if one becomes available, preserving ADR 0014.
Any direct route needs equivalent evidence before receiving user-derived data.

## D-102 extension: one trace per routed explained run

On 2026-10-26, add explicit `routed-text-explanation-v1` and the separate
`intent-price-explanation-v1` partition. Compose the retained typed routing/confidence gate with
the existing receipt-bound explanation node only for authorized price execution. Reuse API-owned
confirmation, tool receipts, conservative reservations, immutable acceptance and fresh-lease
recovery. Migration 6008 extends constraints and model fences without rewriting historical rows
or changing old graph partitions. Closed historical admission and evidence remain supported.

Instrument actual run/node transitions, decision/physical attempts, tool and checkpoint work;
retain request/outbox/consumer parents. Export only bounded operational fields through typed SDK
exporter projections, including automatic HTTP/Pg failure spans. Preserve span identity and
categorical failure while removing arbitrary payload-bearing fields. Missing cost or usage stays
unavailable. The owned native trace campaign uses fake provider capabilities and a local OTLP
sink, including restart, populated upgrade and SQL saver-failure recovery. This establishes
runtime causality and privacy for those exercised paths, without claiming live provider quality,
billing evidence, a production collector rollout or exactly-once provider delivery.

The 2026-10-26 native campaign passed these assertions. Its fake application and telemetry preload
resolve the same mounted `dist` and shutdown bridge, preserving one SDK owner and bounded final
flush across process restarts. API and worker use their normal image entrypoints.
