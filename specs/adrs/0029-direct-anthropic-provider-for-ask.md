# ADR 0029 — Direct Anthropic provider for Ask

- **Status:** Accepted
- **Date:** 2026-11-13
- **Supersedes:** ADR 0014
- **Amends:** ADRs 0008, 0009 and 0027
- **Accepted by:** the product owner, 2026-11-13

## Context

ADRs 0008, 0009, 0014 and 0027 route every Ask model call through Vercel AI Gateway: Jev
(`typesafe-ai/jev`) decides the intent, `anthropic/claude-haiku-5.5` writes the explanation,
`deepseek/deepseek-v4-flash-0731` is the secondary model, and a public-text probe must obtain the
gateway's Zero Data Retention routing acknowledgement before any user text is transmitted. ADR 0014
keeps a direct provider route disabled until it supplies equivalent per-request evidence, and
ADR 0027 states that direct Anthropic remains disabled.

The recorded live evidence for that design is thin. The only authorized live decision probe
(2026-10-26) failed in its privacy phase before any classification, and the published acceptance
runs of that date report `heuristic-v1`, degraded decisions: this repository records no successful
Jev classification. The design also spends an extra probe request whenever its evidence is older
than 30 seconds.

The product owner decided to call Anthropic directly with the owner's own API key and to remove
the gateway. The Anthropic API offers no per-request acknowledgement comparable to the gateway's,
so the pre-transmission evidence invariant of ADR 0014 cannot be kept on this route. The owner
accepted that consequence explicitly instead of weakening the evidence into a static flag.

## Decision

### One provider, one route

- The AI application calls the Anthropic Messages API directly through the pinned official
  `@anthropic-ai/sdk`, authenticated with `ANTHROPIC_API_KEY`. Only the AI service receives that
  key. Vercel AI Gateway, `@ai-sdk/gateway`, the `ai` package and `AI_GATEWAY_API_KEY` are removed
  from runtime code, configuration and Compose files.
- One client factory builds the provider client. It pins the API origin and the key, so ambient
  SDK environment overrides cannot reroute a request, and it disables SDK retries and SDK logging.
  Provider SDK types stay inside the AI adapters; ports, contracts and the domain stay vendor-free.
- The model for both uses is Claude Haiku 5.5, identifier `claude-haiku-5-5`. There is no
  secondary or fallback model. The closed route literal is `anthropic-direct` and the telemetry
  provider is `anthropic`.

### Intent decision

- A Claude Haiku classification replaces Jev behind the unchanged typed decision port. One request
  carries a versioned prompt (`ask-intent-classifier-prompt-v1`), the fixed criteria of the
  `ask-intents-v1` taxonomy and the visitor's question as delimited text. A closed structured-output
  schema allows exactly one of the six intents and one probability.
- The probability is the classifier's stated confidence that the product should act without asking
  the visitor. It is not calibrated and is not a token likelihood. The retained distribution gives
  the chosen label that probability and spreads the remainder evenly over the other labels, so the
  existing closed validation and the 0.85 gate of ADR 0008 apply unchanged.
- A decision written by the classifier has source `claude-haiku-v1`, is not degraded and carries
  null privacy evidence. The prompt, criteria and schema are versioned together: a material change
  needs a new prompt version and a new decision source.
- The deterministic `heuristic-v1` rule remains the degraded fallback for a missing key,
  authentication failure, provider refusal, exhausted billing, open circuit or exhausted transient
  retry. Nonconforming classifier output and caller cancellation fail the decision instead of
  degrading. The confirmation flow, deadlines and receipts of ADR 0008 are unchanged.

### Explanation

- The explanation of ADR 0027 keeps its port, prompt and grammar versions, receipt binding, exact
  fact validation and persisted reservations. Its request carries versioned instructions and the
  computed receipt facts only; the visitor's question is never part of it.
- One 224-token reservation precedes each provider request. The 16-token privacy-probe reservation
  no longer exists for new runs. The 1,000-token run budget is unchanged.
- A new artifact names route `anthropic-direct`, model `claude-haiku-5-5` and null privacy evidence.

### Resilience (amends ADR 0009)

- The policy order of ADR 0009 is kept without a secondary-model fallback for explanations:
  bulkhead, circuit breaker, transient retry, rate limiter and per-attempt timeout. The decision
  keeps its local fallback to the heuristic as the outermost policy.
- Failure classes map from the Anthropic API as follows: 401 and 403 are authentication; 400, 404,
  422 and other definitive client errors are rejected; 408, 429, 5xx, 529, connection failures and
  timeouts are transient; HTTP 402 or an Anthropic `billing_error` is exhausted and opens the
  circuit immediately. `Retry-After` is preserved as bounded advice.

### Privacy (supersedes ADR 0014)

- No Zero Data Retention evidence is obtained, verified or retained. The pre-transmission privacy
  probe, its acknowledgement parsing and its evidence lifecycle are removed.
- The visitor's question text is sent to Anthropic for intent classification under Anthropic's
  standard commercial API terms. Everything user-facing says so and makes no zero-retention claim.
  No retention period or contractual commitment is asserted by the product.
- Collected listing content is still never sent to a model provider.
- Traces and logs keep model, provider, route, purpose and token usage. They never record prompts,
  responses, keys or headers. The Messages API returns no price, so monetary cost is reported as
  unavailable instead of being inferred.

### Stored evidence

- History is not rewritten. Runs, attempts, explanations and decisions written through the gateway
  keep their original literals (`vercel-ai-gateway`, the gateway model names, `gateway-jev-v1` and
  their non-null evidence identifiers) and stay valid and readable through the API and the web.
- An additive migration (`6010_ask_anthropic_direct.sql`) widens the closed SQL predicates so that
  each record is either a complete gateway-era shape or a complete direct shape; mixed shapes are
  refused. New reservations and new decisions can only use the direct literals.

## Consequences

- The product no longer holds machine-verifiable evidence about provider retention for user text.
  This is a deliberate reduction of the guarantee in ADR 0014, recorded here and in the privacy
  notice and privacy records.
- There is one provider and one model. An Anthropic outage degrades decisions to the heuristic and
  fails explanations with a typed failure; no second model hides it.
- Each explanation costs one provider request instead of two, and the decision no longer waits for
  a probe.
- The reported confidence is a model statement. The 14-row `ask-intents-v1` dataset remains the
  evaluation dataset and the opt-in live probe remains the way to measure real accuracy; until an
  authorized live run exists, live quality is unmeasured.
- API, AI and web images of one release must be activated together: the new API refuses gateway
  reservations and older images cannot parse direct-route records.

## Options considered

- Keep the gateway and repair the failing privacy phase: rejected by the owner's decision to remove
  the intermediary.
- Call Anthropic directly but keep a static "zero retention" flag as evidence: rejected, because a
  configured boolean is not evidence and would make a claim the product cannot verify.
- Keep DeepSeek as a secondary model through another route: rejected; it would reintroduce a second
  provider for user-derived requests without any retention evidence.
- Derive the probability from token likelihoods: the Messages API does not expose them; a stated
  confidence under a closed schema is the simplest mechanism that keeps the existing gate.

## Reassessment trigger

Reassess when an authorized live evaluation shows the stated confidence misleads the 0.85 gate,
when Anthropic offers a verifiable per-request retention control, when the owner's agreement with
the provider changes what may be claimed to visitors, or when a second provider is required for
availability.
