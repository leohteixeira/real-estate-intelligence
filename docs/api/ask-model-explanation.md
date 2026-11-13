# Receipt-bound model explanations

`POST /api/v1/runs` accepts the explicit `text-price-explanation-v1` mode with the same
`threadId`, `placeId`, `query` and `locale` fields as [text admission](ask-tracer.md).
It requires the strong owner Bearer capability and `Idempotency-Key`; callers cannot submit
canonical inputs, model names, grants or explanation evidence. The query cap is 16,000 characters.
Extraction refusals return `422 price_input_refused`; accepted requests return `202` with queued
run/thread IDs. `GET /api/v1/ask/text-price-explanation-capabilities` reports admission availability.

## Results and grammar

The separate `price-explanation-v1` graph visits `validatedInputs`, `priceTool`, then
`modelExplanation`. Market extracts inputs, calculates and formats facts. Inspect, thread and
durable SSE expose `explanation: null` before successful completion and on failed/expired runs.
A completed run carries the immutable model-written artifact: full text, same-run Market receipt
ID, explanation/reservation IDs, actual model and route, locale, prompt/grammar versions,
`privacyEvidenceId`, measured output tokens and acceptance time. Historical modes have no
explanation field and retain their exact two-node `price-v1` evidence.

`route` is a closed discriminator. New artifacts carry `route: 'anthropic-direct'`,
`model: 'claude-haiku-5-5'` and `privacyEvidenceId: null`. Artifacts written before
[ADR 0029](../../specs/adrs/0029-direct-anthropic-provider-for-ask.md) keep
`route: 'vercel-ai-gateway'`, their original model name and their non-null evidence ID, and stay
readable through inspect, thread and SSE without rewriting. The Ask screen shows a privacy-evidence
row only for those retained records.

`price-explanation-facts-v1` accepts exactly the asking-price, area and price-per-square-meter
sentences, each once, in any order, separated by one space. For BRL 785,000.00 and 68 m², English
facts include `The asking price per square meter is BRL 11,544.12/m².`; Portuguese uses
`O preço anunciado por metro quadrado é BRL 11.544,12/m².`. Other figures, currencies, units,
spelled numbers, rounding, forecasts, opinions, commentary and malformed text are rejected.
The returned model text is never repaired or replaced with a synthesized answer.

## Provider, privacy and limits

Only AI receives `ANTHROPIC_API_KEY`. Its vendor-free `LanguageModel` adapter calls the Anthropic
Messages API directly through the pinned official `@anthropic-ai/sdk`, with the single model
`claude-haiku-5-5`. There is no secondary model and no intermediary gateway. One client factory
pins the API origin and the key, so ambient `ANTHROPIC_BASE_URL` or `ANTHROPIC_AUTH_TOKEN` cannot
reroute a request. Every request sets `maxRetries: 0`, disabled thinking, bounded output and
cancellation; SDK logging is off. The model prompt contains versioned instructions and this
receipt's facts, never the original question, thread history, run identity or grants.

Requests are processed under Anthropic's standard commercial API terms. The product performs no
zero-data-retention verification and retains no privacy evidence for new artifacts: no retention
period or contractual claim is asserted by this contract. Without a key the adapter fails closed
with a typed `policy` refusal and the run finishes without an explanation. A provider safety
refusal is `policy`; truncated, empty or otherwise incomplete output is `rejected`. Offline tests
make no real provider calls: they inject a `fetch` implementation into the SDK client.

Provider failures map to the closed vocabulary before leaving the adapter: 401/403 are
`authentication`; 400/404/422 and other definitive client errors are `rejected`; 408, 429, 5xx,
529, connection failures and attempt timeouts are `transient`; HTTP 402 or an Anthropic
`billing_error` is `exhausted`. `Retry-After` (seconds or HTTP date) is preserved as bounded
advice. Provider messages, bodies and headers never cross the port.

The scoped `POST /api/v1/internal/ask/runs/:id/model-explanation` supports strict `get`, `reserve`
and `accept` envelopes under the fresh checkpoint grant. API/SQL fence run, execution, lease,
thread and receipt identity. A reservation names `purpose: 'explanation'`, the direct model and
route and 224 output tokens; the retired gateway literals are rejected for new reservations.
Aggregate reservations cannot exceed 1,000 per run and are never refunded after uncertainty.
Named resilience policies apply bulkhead, circuit breaker, transient retry, per-physical-request
limiter and a 3.5-second attempt timeout, in that order. A generation gets at most two physical
requests, with a fresh persisted reservation before each one; acceptance is never repeated by
this policy. Retry uses full jitter from a 100 ms exponential base capped at one second. Valid
`Retry-After` is honored only when both it and a complete attempt fit the original deadline;
advice over 30 seconds suppresses retry. A rolling ten-second allowance admits about 10% retries
with two low-traffic retry slots. Every attempt shares the 1,000-token persisted run limit.

The original deadline and caller cancellation cover receipt recovery, queue admission, backoff,
reservation and HTTP, including clients that ignore cancellation. Expiration never yields a model
answer. Attempt timeout remains transient while the original deadline allows work.
Cancellation/policy/authentication/fidelity/budget refusals do not retry. Exhausted billing
immediately opens the circuit. Local rate admission and definitive refusals do not record
transient breaker outcomes. Successful generations taking at least 2.5 seconds contribute one slow
breaker outcome while returning their actual output. Accepted evidence persists before saver ACK;
after a transient failure the explainer reads the retained artifact once, so a lost acceptance
response returns the stored explanation instead of failing. Reclaim reuses it with a rebound
Market receipt and unchanged reservations. Exactly-once provider network delivery is not promised.

## Combined routed explanation (D-102)

Explicit `routed-text-explanation-v1` admission uses the same closed text envelope and owner
capability as `routed-text-v1`. It returns `202` with that mode and queued run/thread IDs. It
retains the decision and confidence gate before running the Market tool, then explains only an
authorized price receipt. Its separate checkpoint partition is `intent-price-explanation-v1`.
The graph visits `typedDecision`, `confidenceGate`, `executeIntent` and, for price,
`modelExplanation`. A probability below 0.85 pauses before tool or generation; explicit
confirmation can edit validated operands and resumes the retained decision across restarts.

Combined snapshots and SSE always include `explanation`; it is null until a completed price.
Recognized unavailable intents return their typed unavailable result with null explanation and
make no generation attempt. Model acceptance, original deadlines, grammar,
immutable receipt binding and the conservative 1,000-token reservation limit are shared with the
existing explained mode. Reclaim rebinds execution authority and reuses accepted artifacts.
Historical mode documents, evidence and graph partitions keep their original meaning.

`pnpm run test:integration:ask-trace` prepares images serially and runs the owned native
API/RabbitMQ/worker/AI campaign with both provider capabilities replaced at fixture composition.
An OTLP/HTTP capture receives actual exports from all three services. It checks parent edges,
PT/EN public inspect/SSE, confidence pause across restart, accepted-artifact recovery after a
PostgreSQL saver fault, preserved populated historical bytes and whole-export privacy. No live
provider, collector or production service is used.

The 2026-10-26 native run passed the full campaign, including actual exported ancestry and
the complete export scan after a real SQL error. The mounted fixture resolves its preload and
AppModule from the same `dist`, so the normal Nest lifecycle flushes the single SDK on restart.
This evidence covers synthetic provider behavior; live model quality and billing remain untested.

On 2026-11-13 the campaign passed again on the direct Anthropic implementation (ADR 0029). The
fixture gives the real SDK client an in-process `fetch`, so `AnthropicIntentDecider` runs
unchanged. Exported attempts name `claude-haiku-5-5`, `anthropic` and `anthropic-direct` with
token usage and no cost or privacy-evidence attribute. Its populated pre-6008 phase applies the
additive admission migration 6009 first, as the routed campaign does, and pauses a run on a
`gateway-jev-v1` decision; after migrations 6008 and 6010 that run resumes with the retained
decision unchanged, and a new explained run completes on the direct route. Gateway-era explanation
rows are upgraded in the model-explanation campaign instead. No live provider was contacted.
